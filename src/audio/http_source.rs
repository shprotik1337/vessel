use std::{
    collections::{BTreeMap, HashSet},
    io::{self, Read, Seek, SeekFrom},
    sync::{
        Arc, Condvar, Mutex,
        atomic::{AtomicBool, AtomicU64, Ordering},
    },
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
const BROWSER_UA: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0";

pub(crate) struct ChunkData {
    pub(crate) start: u64,
    pub(crate) bytes: Vec<u8>,
    pub(crate) length: Option<u64>,
    pub(crate) range_supported: bool,
}

/// Общий RAM-буфер для всех инстансов `HttpRangeSource` одного трека и фонового загрузчика.
pub(crate) struct SharedTrackBuffer {
    client: Client,
    url: String,
    headers: HeaderMap,
    range_supported: AtomicBool,
    total_length: Mutex<Option<u64>>,
    chunks: Mutex<BTreeMap<u64, Arc<Vec<u8>>>>,
    in_flight: Mutex<HashSet<u64>>,
    in_flight_cond: Condvar,
    playback_offset: AtomicU64,
}

impl SharedTrackBuffer {
    pub(crate) fn new(
        url: &str,
        headers: &BTreeMap<String, String>,
        prefer_range: bool,
    ) -> Result<Arc<Self>> {
        let ua = headers
            .get("User-Agent")
            .or_else(|| headers.get("user-agent"))
            .map(|s| s.as_str())
            .unwrap_or(BROWSER_UA);

        let client = Client::builder()
            .connect_timeout(Duration::from_secs(10))
            .timeout(Duration::from_secs(30))
            .user_agent(ua)
            .danger_accept_invalid_certs(true)
            .build()?;
        let headers = normalize_headers(headers)?;

        Self::from_client_and_headers(client, url.to_string(), headers, prefer_range)
    }

    pub(crate) fn from_client_and_headers(
        client: Client,
        url: String,
        headers: HeaderMap,
        prefer_range: bool,
    ) -> Result<Arc<Self>> {
        let buffer = Arc::new(Self {
            client,
            url,
            headers,
            range_supported: AtomicBool::new(prefer_range),
            total_length: Mutex::new(None),
            chunks: Mutex::new(BTreeMap::new()),
            in_flight: Mutex::new(HashSet::new()),
            in_flight_cond: Condvar::new(),
            playback_offset: AtomicU64::new(0),
        });

        // Загружаем первый чанк (0..512KB) синхронно для мгновенного старта воспроизведения
        let first_chunk = fetch_chunk_bytes(
            &buffer.client,
            &buffer.url,
            &buffer.headers,
            buffer.range_supported.load(Ordering::Acquire),
            0,
        )?;
        buffer.apply_chunk(
            first_chunk.start,
            first_chunk.bytes,
            first_chunk.length,
            first_chunk.range_supported,
        );

        Ok(buffer)
    }

    pub(crate) fn total_length(&self) -> Option<u64> {
        *self.total_length.lock().unwrap()
    }

    pub(crate) fn url(&self) -> &str {
        &self.url
    }

    pub(crate) fn set_playback_offset(&self, offset: u64) {
        self.playback_offset.store(offset, Ordering::Release);
    }

    #[allow(dead_code)]
    pub(crate) fn playback_offset(&self) -> u64 {
        self.playback_offset.load(Ordering::Acquire)
    }

    #[allow(dead_code)]
    pub(crate) fn is_range_supported(&self) -> bool {
        self.range_supported.load(Ordering::Acquire)
    }

    #[allow(dead_code)]
    pub(crate) fn cached_chunk_count(&self) -> usize {
        self.chunks.lock().unwrap().len()
    }

    #[allow(dead_code)]
    pub(crate) fn contains_chunk(&self, start: u64) -> bool {
        self.chunks.lock().unwrap().contains_key(&start)
    }

    pub(crate) fn get_chunk(&self, start: u64) -> Option<Arc<Vec<u8>>> {
        self.chunks.lock().unwrap().get(&start).cloned()
    }

    pub(crate) fn is_fully_buffered(&self) -> bool {
        let total_length = match *self.total_length.lock().unwrap() {
            Some(len) if len > 0 => len,
            _ => return false,
        };
        let chunks = self.chunks.lock().unwrap();
        let mut expected_start = 0u64;
        while expected_start < total_length {
            if let Some(chunk) = chunks.get(&expected_start) {
                if chunk.is_empty() {
                    return false;
                }
                expected_start = expected_start.saturating_add(chunk.len() as u64);
            } else {
                return false;
            }
        }
        true
    }

    pub(crate) fn apply_chunk(
        &self,
        start: u64,
        bytes: Vec<u8>,
        length: Option<u64>,
        range_supported: bool,
    ) {
        if let Some(len) = length {
            let mut total_len = self.total_length.lock().unwrap();
            if total_len.is_none() {
                *total_len = Some(len);
            }
        }
        self.range_supported.store(range_supported, Ordering::Release);
        self.chunks.lock().unwrap().insert(start, Arc::new(bytes));
    }

    pub(crate) fn ensure_chunk_foreground(&self, start: u64) -> io::Result<Arc<Vec<u8>>> {
        if let Some(chunk) = self.get_chunk(start) {
            return Ok(chunk);
        }

        // Если чанк прямо сейчас загружается фоновым preloader'ом — ждём результат
        {
            let mut in_flight = self.in_flight.lock().unwrap();
            let start_wait = std::time::Instant::now();
            while in_flight.contains(&start) {
                if start_wait.elapsed() > Duration::from_secs(5) {
                    break;
                }
                let (guard, _) = self
                    .in_flight_cond
                    .wait_timeout(in_flight, Duration::from_millis(50))
                    .unwrap();
                in_flight = guard;
                if self.chunks.lock().unwrap().contains_key(&start) {
                    break;
                }
            }
            if let Some(chunk) = self.get_chunk(start) {
                return Ok(chunk);
            }
            in_flight.insert(start);
        }

        // Загружаем чанк синхронно с высоким приоритетом для декодера
        let range_supported = self.range_supported.load(Ordering::Acquire);
        let result = fetch_chunk_bytes(
            &self.client,
            &self.url,
            &self.headers,
            range_supported,
            start,
        );

        match result {
            Ok(chunk_data) => {
                self.apply_chunk(
                    chunk_data.start,
                    chunk_data.bytes,
                    chunk_data.length,
                    chunk_data.range_supported,
                );
                {
                    let mut in_flight = self.in_flight.lock().unwrap();
                    in_flight.remove(&start);
                    self.in_flight_cond.notify_all();
                }
                self.get_chunk(start)
                    .ok_or_else(|| io::Error::other("чанк не найден после загрузки"))
            }
            Err(err) => {
                {
                    let mut in_flight = self.in_flight.lock().unwrap();
                    in_flight.remove(&start);
                    self.in_flight_cond.notify_all();
                }
                Err(err)
            }
        }
    }
}

pub(crate) fn spawn_preloader(
    buffer: Arc<SharedTrackBuffer>,
    cancel: Arc<AtomicBool>,
) -> JoinHandle<()> {
    thread::Builder::new()
        .name("vessel-preloader".to_string())
        .spawn(move || {
            run_preloader(buffer, cancel);
        })
        .expect("spawn vessel-preloader thread")
}

fn run_preloader(buffer: Arc<SharedTrackBuffer>, cancel: Arc<AtomicBool>) {
    crate::dlog!("[preload] background preloader started");

    let mut consecutive_errors = 0;
    while !cancel.load(Ordering::Acquire) {
        let total_length = match buffer.total_length() {
            Some(len) if len > 0 => len,
            _ => {
                thread::sleep(Duration::from_millis(50));
                continue;
            }
        };

        if !buffer.range_supported.load(Ordering::Acquire) {
            crate::dlog!("[preload] range unsupported, stopping preloader");
            break;
        }

        let next_chunk = select_next_missing_chunk(&buffer, total_length);
        let Some(target_start) = next_chunk else {
            crate::dlog!("[preload] track fully preloaded ({total_length} bytes)");
            break;
        };

        // Регистрируем чанк в in_flight
        {
            let mut in_flight = buffer.in_flight.lock().unwrap();
            if in_flight.contains(&target_start)
                || buffer.chunks.lock().unwrap().contains_key(&target_start)
            {
                continue;
            }
            in_flight.insert(target_start);
        }

        let range_supported = buffer.range_supported.load(Ordering::Acquire);
        let fetch_result = fetch_chunk_bytes(
            &buffer.client,
            &buffer.url,
            &buffer.headers,
            range_supported,
            target_start,
        );

        match fetch_result {
            Ok(chunk_data) => {
                consecutive_errors = 0;
                buffer.apply_chunk(
                    chunk_data.start,
                    chunk_data.bytes,
                    chunk_data.length,
                    chunk_data.range_supported,
                );
            }
            Err(err) => {
                consecutive_errors += 1;
                crate::dlog!("[preload] error fetching chunk {target_start}: {err}");
                let err_str = err.to_string();
                if err_str.contains("403") || err_str.contains("404") || consecutive_errors >= 5 {
                    crate::dlog!("[preload] unrecoverable HTTP error, stopping preloader");
                    let mut in_flight = buffer.in_flight.lock().unwrap();
                    in_flight.remove(&target_start);
                    buffer.in_flight_cond.notify_all();
                    break;
                }
                thread::sleep(Duration::from_millis(300));
            }
        }

        // Снимаем регистрацию из in_flight и оповещаем ожидающих СТРОГО ПОСЛЕ apply_chunk
        {
            let mut in_flight = buffer.in_flight.lock().unwrap();
            in_flight.remove(&target_start);
            buffer.in_flight_cond.notify_all();
        }

        if cancel.load(Ordering::Acquire) {
            crate::dlog!("[preload] preloader cancelled");
            break;
        }
    }
    crate::dlog!("[preload] background preloader exited");
}

fn select_next_missing_chunk(buffer: &SharedTrackBuffer, total_length: u64) -> Option<u64> {
    let chunks = buffer.chunks.lock().unwrap();
    let in_flight = buffer.in_flight.lock().unwrap();

    let is_missing = |start: u64| -> bool {
        !chunks.contains_key(&start) && !in_flight.contains(&start)
    };

    let playback_offset = buffer.playback_offset.load(Ordering::Acquire);
    let current_chunk_start =
        (playback_offset / HTTP_CHUNK_BYTES as u64) * HTTP_CHUNK_BYTES as u64;

    // 1. Приоритетный поиск вперед от текущей позиции воспроизведения до конца файла
    let mut pos = current_chunk_start;
    while pos < total_length {
        if is_missing(pos) {
            return Some(pos);
        }
        pos = pos.saturating_add(HTTP_CHUNK_BYTES as u64);
    }

    // 2. Поиск от начала файла до текущей позиции воспроизведения
    let mut pos = 0u64;
    while pos < current_chunk_start && pos < total_length {
        if is_missing(pos) {
            return Some(pos);
        }
        pos = pos.saturating_add(HTTP_CHUNK_BYTES as u64);
    }

    None
}

pub(crate) struct HttpRangeSource {
    buffer: Arc<SharedTrackBuffer>,
    position: u64,
}

impl HttpRangeSource {
    pub(crate) fn open(
        url: &str,
        headers: &BTreeMap<String, String>,
        prefer_range: bool,
    ) -> Result<Self> {
        let buffer = SharedTrackBuffer::new(url, headers, prefer_range)?;
        let cancel = Arc::new(AtomicBool::new(false));
        let _ = spawn_preloader(Arc::clone(&buffer), cancel);
        Ok(Self::from_shared_buffer(buffer))
    }

    pub(crate) fn from_shared_buffer(buffer: Arc<SharedTrackBuffer>) -> Self {
        Self {
            buffer,
            position: 0,
        }
    }

    #[allow(dead_code)]
    pub(crate) fn shared_buffer(&self) -> Arc<SharedTrackBuffer> {
        Arc::clone(&self.buffer)
    }
}

pub(crate) fn fetch_chunk_bytes(
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
    let resp_headers = response.headers().clone();
    let length = dlina_iz_range(&resp_headers).or_else(|| {
        resp_headers
            .get(CONTENT_LENGTH)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.parse().ok())
    });
    let partial = status == StatusCode::PARTIAL_CONTENT;
    let skip = if partial { 0 } else { start };
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
        if output.is_empty() {
            return Ok(0);
        }
        let total_length = self.buffer.total_length();
        if total_length.is_some_and(|length| self.position >= length) {
            return Ok(0);
        }

        let chunk_start = (self.position / HTTP_CHUNK_BYTES as u64) * HTTP_CHUNK_BYTES as u64;
        let chunk = self.buffer.ensure_chunk_foreground(chunk_start)?;

        let offset = (self.position - chunk_start) as usize;
        if offset >= chunk.len() {
            // Текущий чанк прочитан до конца
            if total_length.is_some_and(|len| self.position >= len)
                || chunk.len() < HTTP_CHUNK_BYTES
            {
                return Ok(0);
            }
            // Переходим к следующему чанку
            let next_start = chunk_start + HTTP_CHUNK_BYTES as u64;
            let next_chunk = self.buffer.ensure_chunk_foreground(next_start)?;
            let offset = (self.position - next_start) as usize;
            if offset >= next_chunk.len() {
                return Ok(0);
            }
            let count = output.len().min(next_chunk.len() - offset);
            output[..count].copy_from_slice(&next_chunk[offset..offset + count]);
            self.position += count as u64;
            self.buffer.set_playback_offset(self.position);
            return Ok(count);
        }

        let count = output.len().min(chunk.len() - offset);
        output[..count].copy_from_slice(&chunk[offset..offset + count]);
        self.position += count as u64;
        self.buffer.set_playback_offset(self.position);

        Ok(count)
    }
}

impl Seek for HttpRangeSource {
    fn seek(&mut self, from: SeekFrom) -> io::Result<u64> {
        let total_length = self.buffer.total_length();
        let target = match from {
            SeekFrom::Start(position) => position as i128,
            SeekFrom::Current(offset) => self.position as i128 + offset as i128,
            SeekFrom::End(offset) => {
                total_length
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
        let range_supported = self.buffer.range_supported.load(Ordering::Acquire);
        if !range_supported && !self.buffer.is_fully_buffered() && target != self.position {
            return Err(io::Error::new(
                io::ErrorKind::Unsupported,
                "источник не поддерживает HTTP Range",
            ));
        }
        self.position = target;
        self.buffer.set_playback_offset(target);
        Ok(target)
    }
}

impl MediaSource for HttpRangeSource {
    fn is_seekable(&self) -> bool {
        self.buffer.range_supported.load(Ordering::Acquire) || self.buffer.is_fully_buffered()
    }

    fn byte_len(&self) -> Option<u64> {
        self.buffer.total_length()
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
