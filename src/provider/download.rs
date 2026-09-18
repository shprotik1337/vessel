use std::path::{Path, PathBuf};

use anyhow::{Context, Result, bail};

use crate::model::{PlaybackSource, TrackRef};

/// Папка загрузок: {Музыка}/Vessel, с фолбэком во временную папку.
pub fn downloads_dir() -> Result<PathBuf> {
    let base = directories::UserDirs::new()
        .and_then(|dirs| dirs.audio_dir().map(|dir| dir.to_path_buf()))
        .unwrap_or_else(|| std::env::temp_dir().join("vessel-downloads"));
    Ok(base.join("Vessel"))
}

/// Расширение файла из mime-типа потока.
pub fn track_file_extension(source: &PlaybackSource) -> String {
    if crate::audio::is_hls(source) {
        return "m4a".to_string();
    }
    let from_mime = match source.mime_type.as_deref() {
        Some("audio/mpeg") => "mp3",
        Some("audio/flac") => "flac",
        Some("audio/mp4") => "m4a",
        Some("audio/aac") => "aac",
        Some("audio/wav") | Some("audio/x-wav") => "wav",
        Some("audio/ogg") => "ogg",
        _ => "",
    };
    if !from_mime.is_empty() {
        return from_mime.to_string();
    }
    // кэш Deezer отдаёт file:// — расширение уже в пути
    let from_url = source
        .url
        .path_segments()
        .and_then(|mut segments| segments.next_back().map(str::to_string))
        .unwrap_or_default();
    let extension = from_url.rsplit('.').next().unwrap_or("mp3");
    if from_url.contains('.') && extension.len() <= 5 {
        extension.to_string()
    } else {
        "mp3".to_string()
    }
}

/// Имя файла для трека: "Артист - Название.ext" (санитизировано для ФС).
pub fn track_file_name(track: &TrackRef, source: &PlaybackSource) -> String {
    let artist = track
        .artists
        .first()
        .cloned()
        .unwrap_or_else(|| "Unknown".to_string());
    let mut name = format!("{artist} - {}", track.title);
    for ch in ['\\', '/', ':', '*', '?', '"', '<', '>', '|'] {
        name = name.replace(ch, " ");
    }
    let name = name.trim();
    format!("{name}.{}", track_file_extension(source))
}

/// Глобальный HTTP-клиент для скачивания с пулом соединений и keep-alive.
fn shared_download_client() -> &'static reqwest::Client {
    static CLIENT: std::sync::OnceLock<reqwest::Client> = std::sync::OnceLock::new();
    CLIENT.get_or_init(|| {
        reqwest::Client::builder()
            .connect_timeout(std::time::Duration::from_secs(20))
            .pool_idle_timeout(std::time::Duration::from_secs(90))
            .tcp_keepalive(std::time::Duration::from_secs(60))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new())
    })
}

/// Скачивает источник воспроизведения в файл: локальный кэш копируется,
/// HTTP-поток (SoundCloud progressive / Yandex mp3) забирается целиком.
pub async fn download_playback_source(source: &PlaybackSource, dest: &Path) -> Result<()> {
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("не удалось создать {}", parent.display()))?;
    }
    match source.url.scheme() {
        // Кэш Deezer — уже готовый расшифрованный файл на диске
        "file" => {
            let cached = source
                .url
                .to_file_path()
                .map_err(|_| anyhow::anyhow!("повреждённый путь кэша"))?;
            if cached == dest {
                return Ok(());
            }
            std::fs::copy(&cached, dest).with_context(|| {
                format!("не удалось сохранить в {}", dest.display())
            })?;
            Ok(())
        }
        "http" | "https" => {
            let temporary = dest.with_extension("part");

            if crate::audio::is_hls(source) {
                let url = source.url.clone();
                let headers = source.headers.clone();
                let temporary_clone = temporary.clone();
                tokio::task::spawn_blocking(move || -> Result<()> {
                    use std::io::{Read, Write};
                    let mut hls = crate::audio::HlsSource::open(&url, &headers, 0)?;
                    let mut file = std::fs::File::create(&temporary_clone)
                        .with_context(|| format!("не удалось создать {}", temporary_clone.display()))?;
                    let mut buffer = [0u8; 64 * 1024];
                    let mut total_bytes = 0usize;
                    loop {
                        let read = hls.read(&mut buffer)?;
                        if read == 0 {
                            break;
                        }
                        file.write_all(&buffer[..read])?;
                        total_bytes += read;
                    }
                    file.flush()?;
                    if total_bytes == 0 {
                        anyhow::bail!("HLS-источник отдал пустой файл");
                    }
                    Ok(())
                })
                .await
                .context("сбой фоновой задачи скачивания HLS")??;

                tokio::fs::rename(&temporary, dest)
                    .await
                    .with_context(|| format!("не удалось завершить скачивание HLS"))?;
                return Ok(());
            }

            let client = shared_download_client();

            let write_result: Result<()> = async {
                use tokio::io::AsyncWriteExt;
                let mut file = tokio::fs::File::create(&temporary)
                    .await
                    .with_context(|| format!("не удалось создать {}", temporary.display()))?;

                if source.supports_range {
                    let chunk_size = 2 * 1024 * 1024u64; // 2 MB (быстрая загрузка без оверхеда множества чанков)
                    let mut start = 0u64;
                    let mut total_expected: Option<u64> = None;
                    let mut downloaded = 0usize;

                    loop {
                        let end = if let Some(tot) = total_expected {
                            let next = start + chunk_size - 1;
                            if next >= tot { tot - 1 } else { next }
                        } else {
                            start + chunk_size - 1
                        };

                        let mut req = client.get(source.url.clone());
                        for (key, value) in &source.headers {
                            req = req.header(key, value);
                        }
                        req = req.header("Range", format!("bytes={start}-{end}"));

                        let resp = req.send().await.context("сбой сетевого запроса чанка")?;
                        let status = resp.status();

                        if status == reqwest::StatusCode::PARTIAL_CONTENT {
                            if total_expected.is_none() {
                                if let Some(cr) = resp.headers().get("content-range").and_then(|v| v.to_str().ok()) {
                                    if let Some(pos) = cr.rfind('/') {
                                        if let Ok(tot) = cr[pos + 1..].trim().parse::<u64>() {
                                            total_expected = Some(tot);
                                        }
                                    }
                                }
                            }
                            let bytes = resp.bytes().await.context("сбой чтения чанка")?;
                            if bytes.is_empty() {
                                break;
                            }
                            file.write_all(&bytes).await.context("сбой записи чанка")?;
                            downloaded += bytes.len();
                            start += bytes.len() as u64;

                            if let Some(tot) = total_expected {
                                if start >= tot {
                                    break;
                                }
                            }
                        } else if status == reqwest::StatusCode::OK {
                            let mut stream = resp;
                            while let Some(chunk) = stream.chunk().await.context("сбой при загрузке аудиоданных")? {
                                downloaded += chunk.len();
                                file.write_all(&chunk).await.context("ошибка записи")?;
                            }
                            break;
                        } else if status == reqwest::StatusCode::RANGE_NOT_SATISFIABLE {
                            break;
                        } else {
                            bail!("сервер вернул статус {status}");
                        }
                    }
                    file.flush().await.context("не удалось сбросить буфер записи")?;
                    if downloaded == 0 {
                        bail!("сервер отдал пустой файл");
                    }
                    Ok(())
                } else {
                    let mut request = client.get(source.url.clone());
                    for (key, value) in &source.headers {
                        request = request.header(key, value);
                    }
                    let mut response = request
                        .send()
                        .await
                        .context("сервер не ответил на запрос скачивания")?
                        .error_for_status()
                        .context("сервер отказал в скачивании трека")?;
                    let mut total_bytes = 0usize;
                    while let Some(chunk) = response.chunk().await.context("сбой при загрузке аудиоданных")? {
                        total_bytes += chunk.len();
                        file.write_all(&chunk)
                            .await
                            .with_context(|| format!("ошибка записи в {}", temporary.display()))?;
                    }
                    file.flush().await.context("не удалось сбросить буфер записи")?;
                    if total_bytes == 0 {
                        bail!("сервер отдал пустой файл");
                    }
                    Ok(())
                }
            }
            .await;

            if let Err(err) = write_result {
                let _ = tokio::fs::remove_file(&temporary).await;
                return Err(err);
            }

            tokio::fs::rename(&temporary, dest)
                .await
                .with_context(|| format!("не удалось завершить скачивание"))?;
            Ok(())
        }
        other => bail!("схема {other} не поддерживается для скачивания"),
    }
}
