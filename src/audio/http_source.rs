use std::{
    collections::BTreeMap,
    io::{self, Read, Seek, SeekFrom},
    thread::{self, JoinHandle},
    time::Duration,
};

use anyhow::{Context, Result};
use reqwest::{
    StatusCode,
    blocking::Client,
    header::{CONTENT_LENGTH, CONTENT_RANGE, HeaderMap, HeaderName, HeaderValue, RANGE},
};
use symphonia::core::io::MediaSource;

pub(crate) const HTTP_CHUNK_BYTES: usize = 512 * 1024; // 512KB — безопасный размер range-чанка (модель Kopuz)
// UA по умолчанию, если источник не задал свой собственный
const BROWSER_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0";

struct ChunkData {
    start: u64,
    bytes: Vec<u8>,
    length: Option<u64>,
    range_supported: bool,
}

struct PrefetchTask {
    start: u64,
    handle: JoinHandle<io::Result<ChunkData>>,
}

pub(crate) struct HttpRangeSource {
    client: Client,
    url: String,
    headers: HeaderMap,
    position: u64,
    length: Option<u64>,
    range_supported: bool,
    /// Умный кэш чанков в оперативной памяти (устраняет пролаги при перемотке и повторном прослушивании)
    chunks: BTreeMap<u64, Vec<u8>>,
    /// Фоновая упреждающая загрузка следующего чанка
    prefetch: Option<PrefetchTask>,
}

impl HttpRangeSource {
    pub(crate) fn open(
        url: &str,
        headers: &BTreeMap<String, String>,
        prefer_range: bool,
    ) -> Result<Self> {
        let ua = headers
            .get("User-Agent")
            .or_else(|| headers.get("user-agent"))
            .map(|s| s.as_str())
            .unwrap_or(BROWSER_UA);

        let client = Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(30))
            .user_agent(ua)
            .build()?;
        let headers = normalize_headers(headers)?;
        let mut source = Self {
            client,
            url: url.to_string(),
            headers,
            position: 0,
            length: None,
            range_supported: prefer_range,
            chunks: BTreeMap::new(),
            prefetch: None,
        };

        // Загружаем первый чанк (0..512KB) синхронно для мгновенного старта декодера
        let first_chunk = fetch_chunk_bytes(
            &source.client,
            &source.url,
            &source.headers,
            source.range_supported,
            0,
        )?;
        source.apply_chunk(first_chunk);

        // И сразу же запускаем опережающую загрузку следующего чанка в фоне!
        source.maybe_start_prefetch(HTTP_CHUNK_BYTES as u64);

        Ok(source)
    }

    fn apply_chunk(&mut self, chunk_data: ChunkData) {
        if self.length.is_none() && chunk_data.length.is_some() {
            self.length = chunk_data.length;
        }
        self.range_supported = chunk_data.range_supported;
        self.chunks.insert(chunk_data.start, chunk_data.bytes);
    }

    fn maybe_start_prefetch(&mut self, next_start: u64) {
        if self.length.is_some_and(|len| next_start >= len) {
            return;
        }
        if self.chunks.contains_key(&next_start) {
            return;
        }
        if self.prefetch.as_ref().is_some_and(|p| p.start == next_start) {
            return;
        }
        let client = self.client.clone();
        let url = self.url.clone();
        let headers = self.headers.clone();
        let range_supported = self.range_supported;
        let handle = thread::spawn(move || {
            fetch_chunk_bytes(&client, &url, &headers, range_supported, next_start)
        });
        self.prefetch = Some(PrefetchTask {
            start: next_start,
            handle,
        });
    }

    fn ensure_chunk(&mut self, target_start: u64) -> io::Result<()> {
        if self.chunks.contains_key(&target_start) {
            return Ok(());
        }
        // Если для этой позиции уже работал фоновый предзагрузчик — забираем результат
        if let Some(task) = self.prefetch.take() {
            if task.start == target_start {
                match task.handle.join() {
                    Ok(Ok(chunk_data)) => {
                        self.apply_chunk(chunk_data);
                        return Ok(());
                    }
                    Ok(Err(err)) => {
                        crate::dlog!("[http] предзагрузка {target_start} завершилась ошибкой: {err}");
                    }
                    Err(_) => {
                        crate::dlog!("[http] поток предзагрузки запаниковал на {target_start}");
                    }
                }
            }
        }

        // Загружаем чанк синхронно с повторными попытками
        let chunk_data = fetch_chunk_bytes(
            &self.client,
            &self.url,
            &self.headers,
            self.range_supported,
            target_start,
        )?;
        self.apply_chunk(chunk_data);
        Ok(())
    }
}

fn fetch_chunk_bytes(
    client: &Client,
    url: &str,
    headers: &HeaderMap,
    range_supported: bool,
    start: u64,
) -> io::Result<ChunkData> {
    let mut last_error = None;
    for attempt in 0..3 {
        match fetch_chunk_once(client, url, headers, range_supported, start) {
            Ok(data) => return Ok(data),
            Err(error) => {
                last_error = Some(error);
                if attempt < 2 {
                    // Сеть прилегла на шконку, даём ей три шанса встать и не позориться 🫩
                    thread::sleep(Duration::from_millis(150 * (attempt + 1)));
                }
            }
        }
    }
    Err(last_error.unwrap_or_else(|| io::Error::other("источник не ответил")))
}

fn fetch_chunk_once(
    client: &Client,
    url: &str,
    headers: &HeaderMap,
    range_supported: bool,
    start: u64,
) -> io::Result<ChunkData> {
    let end = start.saturating_add(HTTP_CHUNK_BYTES as u64 - 1);
    crate::dlog!("[http] fetch range {start}-{end} (chunk={HTTP_CHUNK_BYTES})");
    let mut request = client.get(url).headers(headers.clone());
    if range_supported || start > 0 {
        request = request.header(RANGE, format!("bytes={start}-{end}"));
    }
    let response = request.send().map_err(io_error)?;
    let status = response.status();
    // YouTube CDN блокирует range-запросы на поздние чанки (403).
    // Тогда пробуем без Range — отдаст всё с начала, сдвигаемся на start.
    if status == StatusCode::FORBIDDEN && start > 0 {
        drop(response);
        return fetch_without_range(client, url, headers, start);
    }
    if !status.is_success() {
        return Err(io::Error::other(format!("источник вернул HTTP {status}")));
    }
    let resp_headers = response.headers().clone();
    let partial = status == StatusCode::PARTIAL_CONTENT;
    if start > 0 && !partial {
        return Err(io::Error::new(
            io::ErrorKind::Unsupported,
            "сервер игнорирует HTTP Range",
        ));
    }
    let length = dlina_iz_range(&resp_headers).or_else(|| {
        if start == 0 && !partial {
            resp_headers
                .get(CONTENT_LENGTH)
                .and_then(|value| value.to_str().ok())
                .and_then(|value| value.parse().ok())
        } else {
            None
        }
    });
    let mut chunk = Vec::with_capacity(HTTP_CHUNK_BYTES);
    response
        .take(HTTP_CHUNK_BYTES as u64)
        .read_to_end(&mut chunk)
        .map_err(io_error)?;
    Ok(ChunkData {
        start,
        bytes: chunk,
        length,
        range_supported: partial,
    })
}

/// Range-запрос отклонён: качаем файл без Range и сдвигаемся на start.
fn fetch_without_range(
    client: &Client,
    url: &str,
    headers: &HeaderMap,
    start: u64,
) -> io::Result<ChunkData> {
    let request = client.get(url).headers(headers.clone());
    let response = request.send().map_err(io_error)?;
    let status = response.status();
    if !status.is_success() {
        return Err(io::Error::other(format!("источник вернул HTTP {status}")));
    }
    // Сколько байт отдать запросившему: если сервер вернул 200 (весь файл) —
    // пропускаем уже прочитанные start байт.
    let resp_headers = response.headers().clone();
    let length = dlina_iz_range(&resp_headers).or_else(|| {
        resp_headers
            .get(CONTENT_LENGTH)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse().ok())
    });
    let partial = status == StatusCode::PARTIAL_CONTENT;
    let skip = if partial { 0 } else { start };
    // Content-Length (200) или total из Content-Range (206) = полный размер файла.
    let mut chunk = Vec::with_capacity(HTTP_CHUNK_BYTES + skip as usize);
    response
        .take(HTTP_CHUNK_BYTES as u64 + skip)
        .read_to_end(&mut chunk)
        .map_err(io_error)?;
    let chunk = if (skip as usize) < chunk.len() {
        chunk.split_off(skip as usize)
    } else {
        Vec::new()
    };
    if chunk.is_empty() && length.is_none_or(|len| start < len) {
        return Err(io::Error::new(
            io::ErrorKind::UnexpectedEof,
            format!("стрим обрезан сервером на позиции {start}"),
        ));
    }
    Ok(ChunkData {
        start,
        bytes: chunk,
        length,
        range_supported: false,
    })
}

impl Read for HttpRangeSource {
    fn read(&mut self, output: &mut [u8]) -> io::Result<usize> {
        if output.is_empty() || self.length.is_some_and(|length| self.position >= length) {
            return Ok(0);
        }

        let chunk_start = (self.position / HTTP_CHUNK_BYTES as u64) * HTTP_CHUNK_BYTES as u64;

        if !self.chunks.contains_key(&chunk_start) {
            self.ensure_chunk(chunk_start)?;
        }

        let Some(chunk) = self.chunks.get(&chunk_start) else {
            return Ok(0);
        };

        let offset = (self.position - chunk_start) as usize;
        if offset >= chunk.len() {
            // Текущий чанк прочитан до конца
            if self.length.is_some_and(|len| self.position >= len)
                || chunk.len() < HTTP_CHUNK_BYTES
            {
                return Ok(0);
            }
            // Переходим к следующему чанку
            let next_start = chunk_start + HTTP_CHUNK_BYTES as u64;
            self.ensure_chunk(next_start)?;
            let Some(next_chunk) = self.chunks.get(&next_start) else {
                return Ok(0);
            };
            let offset = (self.position - next_start) as usize;
            if offset >= next_chunk.len() {
                return Ok(0);
            }
            let count = output.len().min(next_chunk.len() - offset);
            output[..count].copy_from_slice(&next_chunk[offset..offset + count]);
            self.position += count as u64;

            // Запускаем предзагрузку следующего за ним
            self.maybe_start_prefetch(next_start + HTTP_CHUNK_BYTES as u64);
            return Ok(count);
        }

        let count = output.len().min(chunk.len() - offset);
        output[..count].copy_from_slice(&chunk[offset..offset + count]);
        self.position += count as u64;

        // Предзагружаем следующий чанк заранее
        let next_start = chunk_start + HTTP_CHUNK_BYTES as u64;
        self.maybe_start_prefetch(next_start);

        Ok(count)
    }
}

impl Seek for HttpRangeSource {
    fn seek(&mut self, from: SeekFrom) -> io::Result<u64> {
        let target = match from {
            SeekFrom::Start(position) => position as i128,
            SeekFrom::Current(offset) => self.position as i128 + offset as i128,
            SeekFrom::End(offset) => {
                self.length
                    .ok_or_else(|| io::Error::new(io::ErrorKind::Unsupported, "длина неизвестна"))?
                    as i128
                    + offset as i128
            }
        };
        if target < 0 || target > u64::MAX as i128 {
            return Err(io::Error::new(
                io::ErrorKind::InvalidInput,
                "позиция вне источника",
            ));
        }
        let target = target as u64;
        if !self.range_supported && target != self.position {
            // Сервер сказал Range? НЕ ЗНАЮ ТАКОГО, сиди теперь без перемотки как честный арестант ✌️
            return Err(io::Error::new(
                io::ErrorKind::Unsupported,
                "источник не поддерживает HTTP Range",
            ));
        }
        self.position = target;
        Ok(target)
    }
}

impl MediaSource for HttpRangeSource {
    fn is_seekable(&self) -> bool {
        self.range_supported
    }

    fn byte_len(&self) -> Option<u64> {
        self.length
    }
}

fn normalize_headers(headers: &BTreeMap<String, String>) -> Result<HeaderMap> {
    let mut parsed = HeaderMap::new();
    for (name, value) in headers {
        parsed.insert(
            HeaderName::from_bytes(name.as_bytes()).context("неверное имя HTTP-заголовка")?,
            HeaderValue::from_str(value).context("неверное значение HTTP-заголовка")?,
        );
    }
    Ok(parsed)
}

pub(super) fn dlina_iz_range(headers: &HeaderMap) -> Option<u64> {
    headers
        .get(CONTENT_RANGE)?
        .to_str()
        .ok()?
        .rsplit_once('/')?
        .1
        .parse()
        .ok()
}

fn io_error(error: impl std::fmt::Display) -> io::Error {
    io::Error::other(error.to_string())
}
