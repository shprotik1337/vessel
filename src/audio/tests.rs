use std::{
    collections::BTreeMap,
    io::{Read, Seek, SeekFrom, Write},
    sync::{
        Arc, Mutex,
        atomic::{AtomicBool, Ordering},
    },
    thread,
    time::Duration,
};

use reqwest::header::{CONTENT_RANGE, HeaderMap, HeaderValue};
use symphonia::core::io::MediaSource;

use super::{
    convert::convert_audio,
    http_source::{
        HTTP_CHUNK_BYTES, HttpRangeSource, SharedTrackBuffer, dlina_iz_range, spawn_preloader,
    },
};

#[test]
fn mono_is_duplicated_for_stereo() {
    let output = convert_audio(&[0.25, 0.5], 1, 48_000, 2, 48_000);
    assert_eq!(output, vec![0.25, 0.25, 0.5, 0.5]);
}

#[test]
fn stereo_is_mixed_to_mono() {
    let output = convert_audio(&[1.0, -1.0, 0.5, 0.5], 2, 44_100, 1, 44_100);
    assert_eq!(output, vec![0.0, 0.5]);
}

#[test]
fn resampler_changes_frame_count() {
    let input = vec![0.0; 2 * 24_000];
    let output = convert_audio(&input, 2, 24_000, 2, 48_000);
    assert_eq!(output.len(), 2 * 48_000);
}

#[test]
fn content_range_yields_total_length() {
    let mut headers = HeaderMap::new();
    headers.insert(CONTENT_RANGE, HeaderValue::from_static("bytes 0-255/12345"));
    assert_eq!(dlina_iz_range(&headers), Some(12_345));
}

struct MockHttpServer {
    port: u16,
    shutdown: Arc<AtomicBool>,
    requests: Arc<Mutex<Vec<(u64, u64)>>>,
    thread: Option<thread::JoinHandle<()>>,
    fail_after_requests: Arc<Mutex<Option<(usize, u16)>>>,
    #[allow(dead_code)]
    support_range: Arc<AtomicBool>,
}

impl MockHttpServer {
    fn new(data: Vec<u8>) -> Self {
        Self::with_options(data, true, None)
    }

    fn new_non_range(data: Vec<u8>) -> Self {
        Self::with_options(data, false, None)
    }

    fn with_options(
        data: Vec<u8>,
        support_range: bool,
        fail_after_requests: Option<(usize, u16)>,
    ) -> Self {
        let listener = std::net::TcpListener::bind("127.0.0.1:0").unwrap();
        let port = listener.local_addr().unwrap().port();
        let shutdown = Arc::new(AtomicBool::new(false));
        let requests = Arc::new(Mutex::new(Vec::new()));
        let fail_after_requests = Arc::new(Mutex::new(fail_after_requests));
        let support_range = Arc::new(AtomicBool::new(support_range));

        let shutdown_clone = Arc::clone(&shutdown);
        let requests_clone = Arc::clone(&requests);
        let fail_after_clone = Arc::clone(&fail_after_requests);
        let support_range_clone = Arc::clone(&support_range);
        let data = Arc::new(data);

        let thread = thread::spawn(move || {
            while !shutdown_clone.load(Ordering::Acquire) {
                let Ok((mut stream, _)) = listener.accept() else {
                    break;
                };
                if shutdown_clone.load(Ordering::Acquire) {
                    break;
                }

                let data = Arc::clone(&data);
                let requests_clone = Arc::clone(&requests_clone);
                let fail_after_clone = Arc::clone(&fail_after_clone);
                let support_range_clone = Arc::clone(&support_range_clone);

                thread::spawn(move || {
                    let mut buf = [0u8; 2048];
                    let n = stream.read(&mut buf).unwrap_or(0);
                    if n == 0 {
                        return;
                    }
                    let req_str = String::from_utf8_lossy(&buf[..n]);

                    // Проверка на эмуляцию ошибки (например 403 Forbidden после N запросов)
                    {
                        let count = requests_clone.lock().unwrap().len();
                        if let Some((limit, status)) = *fail_after_clone.lock().unwrap() {
                            if count >= limit {
                                let resp = format!(
                                    "HTTP/1.1 {status} Forbidden\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                                );
                                let _ = stream.write_all(resp.as_bytes());
                                let _ = stream.flush();
                                return;
                            }
                        }
                    }

                    let supports_range = support_range_clone.load(Ordering::Acquire);
                    let mut range_start = 0u64;
                    let mut range_end = data.len().saturating_sub(1) as u64;
                    let mut is_range = false;

                    if supports_range {
                        for line in req_str.lines() {
                            let lower = line.to_ascii_lowercase();
                            if lower.starts_with("range: bytes=") {
                                is_range = true;
                                let spec = &line["range: bytes=".len()..];
                                if let Some((s, e)) = spec.split_once('-') {
                                    if let Ok(st) = s.trim().parse::<u64>() {
                                        range_start = st;
                                    }
                                    if let Ok(en) = e.trim().parse::<u64>() {
                                        range_end = en;
                                    }
                                }
                            }
                        }
                    }

                    let total_len = data.len() as u64;
                    if supports_range && is_range && range_start >= total_len {
                        let resp = format!(
                            "HTTP/1.1 416 Range Not Satisfiable\r\nContent-Range: bytes */{total_len}\r\nContent-Length: 0\r\nConnection: close\r\n\r\n"
                        );
                        let _ = stream.write_all(resp.as_bytes());
                        let _ = stream.flush();
                        return;
                    }

                    if supports_range && is_range {
                        range_end = range_end.min(total_len.saturating_sub(1));
                        requests_clone
                            .lock()
                            .unwrap()
                            .push((range_start, range_end));

                        let slice = &data[range_start as usize..=range_end as usize];
                        let chunk_len = slice.len();
                        let response = format!(
                            "HTTP/1.1 206 Partial Content\r\nContent-Range: bytes {range_start}-{range_end}/{total_len}\r\nContent-Length: {chunk_len}\r\nContent-Type: audio/mpeg\r\nConnection: close\r\n\r\n"
                        );
                        let _ = stream.write_all(response.as_bytes());
                        let _ = stream.write_all(slice);
                        let _ = stream.flush();
                    } else {
                        requests_clone
                            .lock()
                            .unwrap()
                            .push((0, total_len.saturating_sub(1)));
                        let response = format!(
                            "HTTP/1.1 200 OK\r\nContent-Length: {total_len}\r\nContent-Type: audio/mpeg\r\nConnection: close\r\n\r\n"
                        );
                        let _ = stream.write_all(response.as_bytes());
                        let _ = stream.write_all(&data);
                        let _ = stream.flush();
                    }
                });
            }
        });

        Self {
            port,
            shutdown,
            requests,
            thread: Some(thread),
            fail_after_requests,
            support_range,
        }
    }

    fn url(&self) -> String {
        format!("http://127.0.0.1:{}/audio.mp3", self.port)
    }

    fn set_fail_after(&self, count: usize, status: u16) {
        *self.fail_after_requests.lock().unwrap() = Some((count, status));
    }

    fn stop(mut self) {
        self.shutdown.store(true, Ordering::Release);
        let _ = std::net::TcpStream::connect(format!("127.0.0.1:{}", self.port));
        if let Some(t) = self.thread.take() {
            let _ = t.join();
        }
    }
}

#[test]
fn test_instant_start_and_full_background_preload() {
    // 2.5 MB (5 chunks по 512 KB)
    let total_bytes = 5 * HTTP_CHUNK_BYTES;
    let dummy_data: Vec<u8> = (0..total_bytes).map(|i| (i % 251) as u8).collect();
    let server = MockHttpServer::new(dummy_data.clone());

    let headers = BTreeMap::new();
    let buffer = SharedTrackBuffer::new(&server.url(), &headers, true).unwrap();

    // 1. Мгновенный старт: чанк 0 загружен синхронно, размер известен
    assert_eq!(buffer.cached_chunk_count(), 1);
    assert_eq!(buffer.total_length(), Some(total_bytes as u64));
    assert!(!buffer.is_fully_buffered());

    // 2. Запускаем фоновый предзагрузчик
    let cancel = Arc::new(AtomicBool::new(false));
    let handle = spawn_preloader(Arc::clone(&buffer), Arc::clone(&cancel));

    // 3. Ждем завершения фоновой загрузки до EOF
    let start_time = std::time::Instant::now();
    while !buffer.is_fully_buffered() && start_time.elapsed() < Duration::from_secs(5) {
        thread::sleep(Duration::from_millis(50));
    }
    let _ = handle.join();

    assert!(buffer.is_fully_buffered());
    assert_eq!(buffer.cached_chunk_count(), 5);

    // 4. Проверяем, что все 5 диапазонов были запрошены
    let requests = server.requests.lock().unwrap().clone();
    assert_eq!(requests.len(), 5);
    for i in 0..5 {
        let expected_start = (i * HTTP_CHUNK_BYTES) as u64;
        assert!(requests.iter().any(|(s, _)| *s == expected_start));
    }

    server.stop();
}

#[test]
fn test_pause_continues_background_loading_and_resume_does_not_duplicate() {
    let total_bytes = 4 * HTTP_CHUNK_BYTES;
    let dummy_data: Vec<u8> = (0..total_bytes).map(|i| (i % 251) as u8).collect();
    let server = MockHttpServer::new(dummy_data);

    let headers = BTreeMap::new();
    let buffer = SharedTrackBuffer::new(&server.url(), &headers, true).unwrap();

    let cancel = Arc::new(AtomicBool::new(false));
    let handle = spawn_preloader(Arc::clone(&buffer), Arc::clone(&cancel));

    // Пользователь нажал паузу (в архитектуре Vessel preloader не привязан к декодеру и продолжает работать)
    let start_time = std::time::Instant::now();
    while !buffer.is_fully_buffered() && start_time.elapsed() < Duration::from_secs(5) {
        thread::sleep(Duration::from_millis(50));
    }
    let _ = handle.join();

    // Загрузка полностью завершилась во время "паузы"
    assert!(buffer.is_fully_buffered());
    assert_eq!(buffer.cached_chunk_count(), 4);

    // Пользователь нажал resume: декодер читает из буфера, новых HTTP-запросов нет
    let mut source = HttpRangeSource::from_shared_buffer(Arc::clone(&buffer));
    let mut out = vec![0u8; 1024];
    let n = source.read(&mut out).unwrap();
    assert_eq!(n, 1024);

    let req_count_after_resume = server.requests.lock().unwrap().len();
    assert_eq!(req_count_after_resume, 4);

    server.stop();
}

#[test]
fn test_seek_backward_and_forward_uses_shared_cache() {
    let total_bytes = 4 * HTTP_CHUNK_BYTES;
    let dummy_data: Vec<u8> = (0..total_bytes).map(|i| (i % 251) as u8).collect();
    let server = MockHttpServer::new(dummy_data.clone());

    let headers = BTreeMap::new();
    let buffer = SharedTrackBuffer::new(&server.url(), &headers, true).unwrap();
    let cancel = Arc::new(AtomicBool::new(false));
    let handle = spawn_preloader(Arc::clone(&buffer), Arc::clone(&cancel));

    while !buffer.is_fully_buffered() {
        thread::sleep(Duration::from_millis(30));
    }
    let _ = handle.join();

    let initial_reqs = server.requests.lock().unwrap().len();
    assert_eq!(initial_reqs, 4);

    let mut source = HttpRangeSource::from_shared_buffer(Arc::clone(&buffer));

    // Seek вперед на 1.5 MB (чанк 3)
    source.seek(SeekFrom::Start(1_500_000)).unwrap();
    let mut read_buf = vec![0u8; 100];
    source.read_exact(&mut read_buf).unwrap();
    assert_eq!(&read_buf[..], &dummy_data[1_500_000..1_500_100]);

    // Seek назад на 100 KB (чанк 0)
    source.seek(SeekFrom::Start(100_000)).unwrap();
    source.read_exact(&mut read_buf).unwrap();
    assert_eq!(&read_buf[..], &dummy_data[100_000..100_100]);

    // Количество сетевых запросов НЕ изменилось (все из RAM-кэша)
    assert_eq!(server.requests.lock().unwrap().len(), initial_reqs);

    server.stop();
}

#[test]
fn test_offline_playback_and_seek_after_server_shutdown() {
    let total_bytes = 5 * HTTP_CHUNK_BYTES;
    let dummy_data: Vec<u8> = (0..total_bytes).map(|i| (i % 251) as u8).collect();
    let server = MockHttpServer::new(dummy_data.clone());

    let headers = BTreeMap::new();
    let buffer = SharedTrackBuffer::new(&server.url(), &headers, true).unwrap();
    let cancel = Arc::new(AtomicBool::new(false));
    let handle = spawn_preloader(Arc::clone(&buffer), Arc::clone(&cancel));

    while !buffer.is_fully_buffered() {
        thread::sleep(Duration::from_millis(30));
    }
    let _ = handle.join();
    assert!(buffer.is_fully_buffered());

    // ПОЛНОСТЬЮ ОТКЛЮЧАЕМ СЕРВЕР / СЕТЬ
    server.stop();

    // Создаем новый источник из общего буфера
    let mut source = HttpRangeSource::from_shared_buffer(Arc::clone(&buffer));
    assert!(source.is_seekable());
    assert_eq!(source.byte_len(), Some(total_bytes as u64));

    // Проверяем чтение с начала
    let mut buf = vec![0u8; 200];
    source.read_exact(&mut buf).unwrap();
    assert_eq!(&buf[..], &dummy_data[0..200]);

    // Перемотка на 95% (2.375 MB)
    let pos_95 = (total_bytes as u64 * 95) / 100;
    source.seek(SeekFrom::Start(pos_95)).unwrap();
    source.read_exact(&mut buf).unwrap();
    assert_eq!(
        &buf[..],
        &dummy_data[pos_95 as usize..pos_95 as usize + 200]
    );

    // Перемотка обратно на 10%
    let pos_10 = (total_bytes as u64 * 10) / 100;
    source.seek(SeekFrom::Start(pos_10)).unwrap();
    source.read_exact(&mut buf).unwrap();
    assert_eq!(
        &buf[..],
        &dummy_data[pos_10 as usize..pos_10 as usize + 200]
    );

    // Перемотка на 80%
    let pos_80 = (total_bytes as u64 * 80) / 100;
    source.seek(SeekFrom::Start(pos_80)).unwrap();
    source.read_exact(&mut buf).unwrap();
    assert_eq!(
        &buf[..],
        &dummy_data[pos_80 as usize..pos_80 as usize + 200]
    );
}

#[test]
fn test_seek_priority_and_no_duplicate_requests() {
    let total_bytes = 8 * HTTP_CHUNK_BYTES; // 4 MB, 8 чанков (0..7)
    let dummy_data: Vec<u8> = (0..total_bytes).map(|i| (i % 251) as u8).collect();
    let server = MockHttpServer::new(dummy_data.clone());

    let headers = BTreeMap::new();
    let buffer = SharedTrackBuffer::new(&server.url(), &headers, true).unwrap();

    let cancel = Arc::new(AtomicBool::new(false));
    let handle = spawn_preloader(Arc::clone(&buffer), Arc::clone(&cancel));

    // Пользователь сразу перематывает на 7-й чанк (3.5 MB)
    let chunk_7_start = (7 * HTTP_CHUNK_BYTES) as u64;
    buffer.set_playback_offset(chunk_7_start);

    // Foreground читатель запрашивает чанк 7 срочно
    let chunk_7 = buffer.ensure_chunk_foreground(chunk_7_start).unwrap();
    assert_eq!(chunk_7.len(), HTTP_CHUNK_BYTES);
    assert_eq!(
        &chunk_7[..100],
        &dummy_data[chunk_7_start as usize..chunk_7_start as usize + 100]
    );

    // Ждем окончания полной фоновой дозагрузки
    while !buffer.is_fully_buffered() {
        thread::sleep(Duration::from_millis(30));
    }
    let _ = handle.join();

    // Все 8 чанков загружены
    assert_eq!(buffer.cached_chunk_count(), 8);

    // Чанк 7 НЕ был скачан дважды (foreground + background координация через in_flight)
    let requests = server.requests.lock().unwrap().clone();
    let chunk_7_requests = requests
        .iter()
        .filter(|(s, _)| *s == chunk_7_start)
        .count();
    assert_eq!(chunk_7_requests, 1);

    server.stop();
}

#[test]
fn test_preloader_cancellation_and_isolation() {
    let total_bytes = 10 * HTTP_CHUNK_BYTES;
    let dummy_data: Vec<u8> = (0..total_bytes).map(|i| (i % 251) as u8).collect();
    let server = MockHttpServer::new(dummy_data);

    let headers = BTreeMap::new();
    let buffer = SharedTrackBuffer::new(&server.url(), &headers, true).unwrap();

    let cancel = Arc::new(AtomicBool::new(false));
    let handle = spawn_preloader(Arc::clone(&buffer), Arc::clone(&cancel));

    // Прерываем preloader
    cancel.store(true, Ordering::Release);
    let _ = handle.join();

    let cached_after_cancel = buffer.cached_chunk_count();
    // Preloader остановился, не загрузив все 10 чанков
    assert!(cached_after_cancel < 10);

    // Создаем сессию нового трека: старый загрузчик завершен и не может записать в новый буфер
    let new_buffer = SharedTrackBuffer::new(&server.url(), &headers, true).unwrap();
    assert_eq!(new_buffer.cached_chunk_count(), 1);

    server.stop();
}

#[test]
fn test_rapid_seeks_scenario() {
    // Большой тестовый трек: 10 чанков (5 МБ)
    let total_bytes = 10 * HTTP_CHUNK_BYTES;
    let dummy_data: Vec<u8> = (0..total_bytes).map(|i| (i % 251) as u8).collect();
    let server = MockHttpServer::new(dummy_data.clone());

    let headers = BTreeMap::new();
    let buffer = SharedTrackBuffer::new(&server.url(), &headers, true).unwrap();

    let cancel = Arc::new(AtomicBool::new(false));
    let handle = spawn_preloader(Arc::clone(&buffer), Arc::clone(&cancel));

    let mut source = HttpRangeSource::from_shared_buffer(Arc::clone(&buffer));
    let mut buf = vec![0u8; 100];

    eprintln!("Step 1: Seek 90%");
    let pos_90 = (total_bytes as u64 * 90) / 100;
    source.seek(SeekFrom::Start(pos_90)).unwrap();
    source.read_exact(&mut buf).unwrap();
    assert_eq!(
        &buf[..],
        &dummy_data[pos_90 as usize..pos_90 as usize + 100]
    );

    eprintln!("Step 2: Seek 15%");
    let pos_15 = (total_bytes as u64 * 15) / 100;
    source.seek(SeekFrom::Start(pos_15)).unwrap();
    source.read_exact(&mut buf).unwrap();
    assert_eq!(
        &buf[..],
        &dummy_data[pos_15 as usize..pos_15 as usize + 100]
    );

    eprintln!("Step 3: Seek 75%");
    let pos_75 = (total_bytes as u64 * 75) / 100;
    source.seek(SeekFrom::Start(pos_75)).unwrap();
    source.read_exact(&mut buf).unwrap();
    assert_eq!(
        &buf[..],
        &dummy_data[pos_75 as usize..pos_75 as usize + 100]
    );

    eprintln!("Step 4: Seek 40%");
    let pos_40 = (total_bytes as u64 * 40) / 100;
    source.seek(SeekFrom::Start(pos_40)).unwrap();
    source.read_exact(&mut buf).unwrap();
    assert_eq!(
        &buf[..],
        &dummy_data[pos_40 as usize..pos_40 as usize + 100]
    );

    eprintln!("Step 5: Waiting for is_fully_buffered");
    let start_wait = std::time::Instant::now();
    while !buffer.is_fully_buffered() {
        if start_wait.elapsed() > Duration::from_secs(5) {
            panic!("Timeout waiting for is_fully_buffered! Chunks: {:?}", buffer.cached_chunk_count());
        }
        thread::sleep(Duration::from_millis(30));
    }
    let _ = handle.join();

    assert_eq!(buffer.cached_chunk_count(), 10);

    eprintln!("Step 6: Server stop and offline check");
    server.stop();

    let mut offline_source = HttpRangeSource::from_shared_buffer(Arc::clone(&buffer));
    offline_source.seek(SeekFrom::Start(pos_90)).unwrap();
    offline_source.read_exact(&mut buf).unwrap();
    assert_eq!(
        &buf[..],
        &dummy_data[pos_90 as usize..pos_90 as usize + 100]
    );
}

#[test]
fn test_stop_does_not_cancel_buffering_until_eof() {
    let total_bytes = 4 * HTTP_CHUNK_BYTES;
    let dummy_data: Vec<u8> = (0..total_bytes).map(|i| (i % 251) as u8).collect();
    let server = MockHttpServer::new(dummy_data);

    let engine = super::AudioEngine::new(None, 80).unwrap();
    let source = crate::model::PlaybackSource {
        url: url::Url::parse(&server.url()).unwrap(),
        headers: BTreeMap::new(),
        mime_type: Some("audio/mpeg".to_string()),
        supports_range: true,
        expires_at_ms: None,
        capability: crate::model::PlaybackCapability::Full,
        duration_ms: Some(10_000),
    };

    // 1. Начать воспроизведение
    engine.play(source);

    // 2. Дождаться частичной буферизации
    let buffer = engine.active_buffer().expect("active buffer exists");
    assert_eq!(buffer.cached_chunk_count(), 1);

    // 3. Нажать Stop
    engine.stop();

    // 4. Убедиться, что буферизация продолжилась до EOF
    let start_time = std::time::Instant::now();
    while !buffer.is_fully_buffered() && start_time.elapsed() < Duration::from_secs(5) {
        thread::sleep(Duration::from_millis(50));
    }

    assert!(buffer.is_fully_buffered());
    assert_eq!(buffer.cached_chunk_count(), 4);

    server.stop();
}

#[test]
fn test_provider_range_support() {
    let total_bytes = 3 * HTTP_CHUNK_BYTES;
    let dummy_data: Vec<u8> = (0..total_bytes).map(|i| (i % 251) as u8).collect();

    // 1. Провайдер с поддержкой HTTP Range (206 Partial Content)
    let range_server = MockHttpServer::new(dummy_data.clone());
    let headers = BTreeMap::new();
    let range_buf = SharedTrackBuffer::new(&range_server.url(), &headers, true).unwrap();
    assert!(range_buf.is_range_supported());
    assert_eq!(range_buf.cached_chunk_count(), 1);
    let cancel = Arc::new(AtomicBool::new(false));
    let handle = spawn_preloader(Arc::clone(&range_buf), Arc::clone(&cancel));
    while !range_buf.is_fully_buffered() {
        thread::sleep(Duration::from_millis(20));
    }
    let _ = handle.join();
    assert_eq!(range_buf.cached_chunk_count(), 3);
    range_server.stop();

    // 2. Провайдер без поддержки HTTP Range (200 OK на любые Range-запросы)
    let non_range_server = MockHttpServer::new_non_range(dummy_data);
    let non_range_buf = SharedTrackBuffer::new(&non_range_server.url(), &headers, true).unwrap();
    // range_supported становится false после получения ответа 200 OK
    assert!(!non_range_buf.is_range_supported());
    let cancel_nr = Arc::new(AtomicBool::new(false));
    let handle_nr = spawn_preloader(Arc::clone(&non_range_buf), Arc::clone(&cancel_nr));
    // Preloader должен немедленно и безопасно завершиться
    let _ = handle_nr.join();
    non_range_server.stop();
}

#[test]
fn test_expired_url_preserves_buffered_chunks() {
    let total_bytes = 4 * HTTP_CHUNK_BYTES;
    let dummy_data: Vec<u8> = (0..total_bytes).map(|i| (i % 251) as u8).collect();
    let server = MockHttpServer::new(dummy_data.clone());

    let headers = BTreeMap::new();
    let buffer = SharedTrackBuffer::new(&server.url(), &headers, true).unwrap();
    assert_eq!(buffer.cached_chunk_count(), 1); // Чанк 0 загружен

    // Настраиваем сервер: после 2 запросов (чанк 0 и чанк 1) выдавать 403 Forbidden
    server.set_fail_after(2, 403);

    let cancel = Arc::new(AtomicBool::new(false));
    let handle = spawn_preloader(Arc::clone(&buffer), Arc::clone(&cancel));

    // Preloader останавливается при получении HTTP 403
    let _ = handle.join();

    assert!(!buffer.is_fully_buffered());
    assert_eq!(buffer.cached_chunk_count(), 2);

    // Проверяем, что чанки 0 и 1 сохранены в памяти и доступны для чтения и перемотки
    let mut source = HttpRangeSource::from_shared_buffer(Arc::clone(&buffer));
    let mut buf = vec![0u8; 100];

    // Чтение из чанка 0
    source.seek(SeekFrom::Start(100)).unwrap();
    source.read_exact(&mut buf).unwrap();
    assert_eq!(&buf[..], &dummy_data[100..200]);

    // Чтение из чанка 1
    let chunk_1_offset = HTTP_CHUNK_BYTES as u64 + 500;
    source.seek(SeekFrom::Start(chunk_1_offset)).unwrap();
    source.read_exact(&mut buf).unwrap();
    assert_eq!(&buf[..], &dummy_data[chunk_1_offset as usize..chunk_1_offset as usize + 100]);

    // Попытка чтения незагруженного чанка 2 вернет ошибку, но не повредит процесс
    let chunk_2_offset = 2 * HTTP_CHUNK_BYTES as u64;
    source.seek(SeekFrom::Start(chunk_2_offset)).unwrap();
    let read_res = source.read_exact(&mut buf);
    assert!(read_res.is_err());

    // Ранее загруженные чанки по-прежнему валидны и читаемы
    source.seek(SeekFrom::Start(0)).unwrap();
    source.read_exact(&mut buf).unwrap();
    assert_eq!(&buf[..], &dummy_data[0..100]);

    server.stop();
}

#[test]
fn test_expired_url_without_refresh_stops_safely() {
    let total_bytes = 4 * HTTP_CHUNK_BYTES;
    let dummy_data: Vec<u8> = (0..total_bytes).map(|i| (i % 251) as u8).collect();
    let server = MockHttpServer::new(dummy_data);

    let headers = BTreeMap::new();
    let buffer = SharedTrackBuffer::new(&server.url(), &headers, true).unwrap();

    // Сервер сразу возвращает 403 Forbidden
    server.set_fail_after(1, 403);

    let cancel = Arc::new(AtomicBool::new(false));
    let start_time = std::time::Instant::now();
    let handle = spawn_preloader(Arc::clone(&buffer), Arc::clone(&cancel));

    // Preloader должен быстро завершиться без зацикливания
    let _ = handle.join();
    assert!(start_time.elapsed() < Duration::from_secs(2));

    assert!(!buffer.is_fully_buffered());
    assert_eq!(buffer.cached_chunk_count(), 1);

    server.stop();
}

#[test]
fn test_full_offline_playback_after_eof() {
    let total_bytes = 4 * HTTP_CHUNK_BYTES;
    let dummy_data: Vec<u8> = (0..total_bytes).map(|i| (i % 251) as u8).collect();
    let server = MockHttpServer::new(dummy_data.clone());

    let headers = BTreeMap::new();
    let buffer = SharedTrackBuffer::new(&server.url(), &headers, true).unwrap();
    let cancel = Arc::new(AtomicBool::new(false));
    let handle = spawn_preloader(Arc::clone(&buffer), Arc::clone(&cancel));

    while !buffer.is_fully_buffered() {
        thread::sleep(Duration::from_millis(20));
    }
    let _ = handle.join();
    assert!(buffer.is_fully_buffered());

    // Сервер полностью останавливается (офлайн)
    server.stop();

    let mut source = HttpRangeSource::from_shared_buffer(Arc::clone(&buffer));
    let mut buf = vec![0u8; 100];

    // Начало трека (0%)
    source.seek(SeekFrom::Start(0)).unwrap();
    source.read_exact(&mut buf).unwrap();
    assert_eq!(&buf[..], &dummy_data[0..100]);

    // Середина трека (50%)
    let mid = (total_bytes / 2) as u64;
    source.seek(SeekFrom::Start(mid)).unwrap();
    source.read_exact(&mut buf).unwrap();
    assert_eq!(&buf[..], &dummy_data[mid as usize..mid as usize + 100]);

    // Конец трека (95%)
    let end_pos = (total_bytes * 95 / 100) as u64;
    source.seek(SeekFrom::Start(end_pos)).unwrap();
    source.read_exact(&mut buf).unwrap();
    assert_eq!(&buf[..], &dummy_data[end_pos as usize..end_pos as usize + 100]);

    // Перемотка назад (10%)
    let back_pos = (total_bytes * 10 / 100) as u64;
    source.seek(SeekFrom::Start(back_pos)).unwrap();
    source.read_exact(&mut buf).unwrap();
    assert_eq!(&buf[..], &dummy_data[back_pos as usize..back_pos as usize + 100]);
}

#[test]
fn test_repeat_play_reuses_existing_session() {
    let total_bytes = 4 * HTTP_CHUNK_BYTES;
    let dummy_data: Vec<u8> = (0..total_bytes).map(|i| (i % 251) as u8).collect();
    let server = MockHttpServer::new(dummy_data);

    let engine = super::AudioEngine::new(None, 80).unwrap();
    let source = crate::model::PlaybackSource {
        url: url::Url::parse(&server.url()).unwrap(),
        headers: BTreeMap::new(),
        mime_type: Some("audio/mpeg".to_string()),
        supports_range: true,
        expires_at_ms: None,
        capability: crate::model::PlaybackCapability::Full,
        duration_ms: Some(10_000),
    };

    // 1. Первый запуск
    engine.play(source.clone());
    let buffer1 = engine.active_buffer().expect("active buffer exists");

    // 2. Stop
    engine.stop();

    // 3. Повторный запуск того же трека
    engine.play(source);
    let buffer2 = engine.active_buffer().expect("active buffer exists");

    // Тот же самый буфер переиспользован
    assert!(Arc::ptr_eq(&buffer1, &buffer2));

    server.stop();
}

#[test]
fn test_stop_keeps_preloader_alive() {
    let total_bytes = 4 * HTTP_CHUNK_BYTES;
    let dummy_data: Vec<u8> = (0..total_bytes).map(|i| (i % 251) as u8).collect();
    let server = MockHttpServer::new(dummy_data);

    let engine = super::AudioEngine::new(None, 80).unwrap();
    let source = crate::model::PlaybackSource {
        url: url::Url::parse(&server.url()).unwrap(),
        headers: BTreeMap::new(),
        mime_type: Some("audio/mpeg".to_string()),
        supports_range: true,
        expires_at_ms: None,
        capability: crate::model::PlaybackCapability::Full,
        duration_ms: Some(10_000),
    };

    engine.play(source);
    let buffer = engine.active_buffer().expect("active buffer exists");

    engine.stop();

    let start_time = std::time::Instant::now();
    while !buffer.is_fully_buffered() && start_time.elapsed() < Duration::from_secs(5) {
        thread::sleep(Duration::from_millis(50));
    }

    assert!(buffer.is_fully_buffered());
    assert_eq!(buffer.cached_chunk_count(), 4);

    server.stop();
}

#[test]
fn test_track_switch_cancels_previous_session() {
    let total_bytes = 8 * HTTP_CHUNK_BYTES;
    let dummy_a: Vec<u8> = (0..total_bytes).map(|i| (i % 251) as u8).collect();
    let dummy_b: Vec<u8> = (0..total_bytes).map(|i| ((i + 7) % 251) as u8).collect();

    let server_a = MockHttpServer::new(dummy_a);
    let server_b = MockHttpServer::new(dummy_b);

    let engine = super::AudioEngine::new(None, 80).unwrap();

    let source_a = crate::model::PlaybackSource {
        url: url::Url::parse(&server_a.url()).unwrap(),
        headers: BTreeMap::new(),
        mime_type: Some("audio/mpeg".to_string()),
        supports_range: true,
        expires_at_ms: None,
        capability: crate::model::PlaybackCapability::Full,
        duration_ms: Some(10_000),
    };

    let source_b = crate::model::PlaybackSource {
        url: url::Url::parse(&server_b.url()).unwrap(),
        headers: BTreeMap::new(),
        mime_type: Some("audio/mpeg".to_string()),
        supports_range: true,
        expires_at_ms: None,
        capability: crate::model::PlaybackCapability::Full,
        duration_ms: Some(10_000),
    };

    // 1. Запуск трека A
    engine.play(source_a);
    let buffer_a = engine.active_buffer().expect("buffer A exists");

    // 2. Переключение на трек B
    engine.play(source_b);
    let buffer_b = engine.active_buffer().expect("buffer B exists");

    assert!(!Arc::ptr_eq(&buffer_a, &buffer_b));

    // Дожидаемся буферизации трека B
    let start_time = std::time::Instant::now();
    while !buffer_b.is_fully_buffered() && start_time.elapsed() < Duration::from_secs(5) {
        thread::sleep(Duration::from_millis(50));
    }
    assert!(buffer_b.is_fully_buffered());
    assert_eq!(buffer_b.cached_chunk_count(), 8);

    server_a.stop();
    server_b.stop();
}

#[test]
fn test_concurrent_seek_and_background_preload() {
    let total_bytes = 8 * HTTP_CHUNK_BYTES;
    let dummy_data: Vec<u8> = (0..total_bytes).map(|i| (i % 251) as u8).collect();
    let server = MockHttpServer::new(dummy_data.clone());

    let headers = BTreeMap::new();
    let buffer = SharedTrackBuffer::new(&server.url(), &headers, true).unwrap();
    let cancel = Arc::new(AtomicBool::new(false));
    let handle = spawn_preloader(Arc::clone(&buffer), Arc::clone(&cancel));

    let mut source = HttpRangeSource::from_shared_buffer(Arc::clone(&buffer));
    let mut buf = vec![0u8; 100];

    // Пользователь перематывает на чанк 5 (2.5 МБ) в то время, когда preloader еще в пути
    let pos_chunk_5 = 5 * HTTP_CHUNK_BYTES as u64;
    source.seek(SeekFrom::Start(pos_chunk_5)).unwrap();
    source.read_exact(&mut buf).unwrap();
    assert_eq!(
        &buf[..],
        &dummy_data[pos_chunk_5 as usize..pos_chunk_5 as usize + 100]
    );

    // Дожидаемся окончания загрузки всех чанков
    let start_time = std::time::Instant::now();
    while !buffer.is_fully_buffered() && start_time.elapsed() < Duration::from_secs(5) {
        thread::sleep(Duration::from_millis(30));
    }
    let _ = handle.join();

    assert!(buffer.is_fully_buffered());
    assert_eq!(buffer.cached_chunk_count(), 8);

    server.stop();
}

#[test]
fn test_no_duplicate_chunk_downloads() {
    let total_bytes = 6 * HTTP_CHUNK_BYTES;
    let dummy_data: Vec<u8> = (0..total_bytes).map(|i| (i % 251) as u8).collect();
    let server = MockHttpServer::new(dummy_data.clone());

    let headers = BTreeMap::new();
    let buffer = SharedTrackBuffer::new(&server.url(), &headers, true).unwrap();
    let cancel = Arc::new(AtomicBool::new(false));
    let handle = spawn_preloader(Arc::clone(&buffer), Arc::clone(&cancel));

    let mut source = HttpRangeSource::from_shared_buffer(Arc::clone(&buffer));
    let mut buf = vec![0u8; 50];

    // Foreground читает чанк 0
    source.seek(SeekFrom::Start(10)).unwrap();
    source.read_exact(&mut buf).unwrap();

    // Foreground перематывает и читает чанк 4
    let pos_4 = 4 * HTTP_CHUNK_BYTES as u64;
    source.seek(SeekFrom::Start(pos_4)).unwrap();
    source.read_exact(&mut buf).unwrap();

    // Foreground перематывает и читает чанк 2
    let pos_2 = 2 * HTTP_CHUNK_BYTES as u64;
    source.seek(SeekFrom::Start(pos_2)).unwrap();
    source.read_exact(&mut buf).unwrap();

    // Ждем окончания полной фоновой дозагрузки
    let start_time = std::time::Instant::now();
    while !buffer.is_fully_buffered() && start_time.elapsed() < Duration::from_secs(5) {
        thread::sleep(Duration::from_millis(30));
    }
    let _ = handle.join();

    assert!(buffer.is_fully_buffered());
    assert_eq!(buffer.cached_chunk_count(), 6);

    // Проверяем, что каждый из 6 чанков был запрошен ровно один раз
    let requests = server.requests.lock().unwrap().clone();
    for i in 0..6 {
        let expected_start = (i * HTTP_CHUNK_BYTES) as u64;
        let count = requests.iter().filter(|(s, _)| *s == expected_start).count();
        assert_eq!(count, 1, "Чанк {i} (offset {expected_start}) был скачан {count} раз вместо 1");
    }

    server.stop();
}
