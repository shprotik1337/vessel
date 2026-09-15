//! Stream resolution по методу Kopuz (EUPL-1.2):
//! - **Premium (cookies):** WEB_REMIX + нативный sig/n decipher, без PO token.
//! - **Аноним:** ANDROID_VR + content PO token (botguard) — у нас POT-минтинг
//!   пока не реализован, поэтому этот путь только если формат отдаст plain URL.
//! - iOS/IPADOS сознательно НЕ используются: их URL rate-limited до ~1 MiB,
//!   отсюда и была проблема «треки по 1 минуте».

use anyhow::{Context, Result, bail};
use serde_json::Value;
use std::collections::BTreeMap;

use crate::model::{PlaybackCapability, PlaybackSource};

use super::client::YoutubeClient;
use super::clients::{ANDROID_VR_1_61_48, WEB_REMIX, clients_http};
use super::decipher;
use super::innertube::{self, PlayerExtras};

/// Структура аудио-формата из streamingData.
pub struct AudioStream {
    pub url: String,
    pub mime: String,
    pub bitrate: u64,
}

/// Результат резолва стрима: готовый PlaybackSource.
pub struct ResolvedStream {
    pub source: PlaybackSource,
    /// true, если URL выдерживает глубокие range-запросы (seek не умрёт на 403).
    pub range_safe: bool,
    pub content_length: u64,
    pub duration_ms: Option<u64>,
}

/// Достаёт лучший аудио-стрим из player-ответа (adaptiveFormats).
/// Предпочитаем aac/m4a (symphonia умеет), затем opus/webm. Только audio-only.
pub fn best_audio(player: &Value) -> Result<AudioStream> {
    let status = player
        .pointer("/playabilityStatus/status")
        .and_then(Value::as_str)
        .unwrap_or("");
    if status != "OK" {
        let reason = player
            .pointer("/playabilityStatus/reason")
            .and_then(Value::as_str)
            .unwrap_or("неизвестно");
        bail!("YouTube не отдал стрим: {reason}");
    }
    let formats = player
        .pointer("/streamingData/adaptiveFormats")
        .and_then(Value::as_array)
        .context("нет адаптивных форматов")?;

    // сортируем: сначала audio-only с наилучшим качеством, игнорируя video
    let mut candidates: Vec<AudioStream> = formats
        .iter()
        .filter_map(|item| {
            let mime = item.get("mimeType").and_then(Value::as_str)?.to_string();
            if !mime.starts_with("audio/") {
                return None;
            }
            // нужны либо plain url, либо signatureCipher — оба decipherable
            if item.get("url").and_then(Value::as_str).is_none()
                && item.get("signatureCipher").and_then(Value::as_str).is_none()
            {
                return None;
            }
            let bitrate = item.get("bitrate").and_then(Value::as_u64).unwrap_or(0);
            Some(AudioStream { url: String::new(), mime, bitrate })
        })
        .collect();
    if candidates.is_empty() {
        bail!("YouTube не отдал аудио-форматы");
    }

    // Symphonia умеет aac (isomp4) и vorbis, но НЕ opus — поэтому opus берём
    // только если aac/m4a нет. Сначала сортируем по совместимости, потом по битрейту.
    candidates.sort_by(|a, b| {
        let compat = |c: &AudioStream| -> u8 {
            if c.mime.contains("audio/mp4") || c.mime.contains("audio/x-m4a") {
                2 // aac — лучший выбор для плеера
            } else if c.mime.contains("ogg") || c.mime.contains("vorbis") {
                1
            } else {
                0 // opus и прочее
            }
        };
        compat(b).cmp(&compat(a)).then(b.bitrate.cmp(&a.bitrate))
    });
    // url подставим при decipher — тут вернём по mime/bitrate как маркер,
    // реальный выбор происходит в resolve_stream.
    Ok(candidates.remove(0))
}

/// Превращает AudioStream в PlaybackSource для плеера (legacy-совместимость).
pub fn stream_source(stream: AudioStream, title_hint: Option<&str>) -> Result<PlaybackSource> {
    let url = url::Url::parse(&stream.url).context("YouTube отдал битую ссылку стрима")?;
    let mime_type = stream
        .mime
        .split(';')
        .next()
        .map(str::trim)
        .map(str::to_string);
    let _ = title_hint;
    Ok(PlaybackSource {
        url,
        headers: BTreeMap::new(),
        mime_type,
        supports_range: true,
        expires_at_ms: None,
        capability: PlaybackCapability::Full,
    })
}

// ---- Kopuz-путь -------------------------------------------------------------

/// Публичный хелпер для отладки: base.js + signatureTimestamp.
pub async fn decipher_player_js(
    http: &reqwest::Client,
    video_id: &str,
) -> anyhow::Result<(String, u64)> {
    decipher::player_js(http, video_id, None).await
}

/// Полный резолв стрима по Kopuz-методу.
///
/// `client` — общий Innertube-клиент: его cookie/OAuth проходят бот-чек на
/// серверных (DC) IP и дают полные форматы WEB_REMIX; его potoken-провайдер
/// (bgutil HTTP) — первичный источник POT, BotGuard — фолбэк.
///
/// 1. WEB_REMIX (cookie если есть) + decipher + `&pot=` в URL — полные range-стримы.
/// 2. ANDROID_VR + POT в body (Kopuz-метод).
/// 3. ANDROID_VR без POT — только первый мегабайт.
pub async fn resolve_stream(client: &YoutubeClient, video_id: &str) -> Result<ResolvedStream> {
    let http = clients_http();
    let cookie_raw = client.cookie_value();
    let cookie = if cookie_raw.is_empty() { None } else { Some(cookie_raw.as_str()) };

    // 1. Premium (есть cookies): WEB_REMIX отдаёт 256k AAC
    if cookie.is_some() {
        match try_web_remix(&http, client, cookie, video_id).await {
            Ok(stream) => {
                crate::dlog!(
                    "[Playback] WEB_REMIX ok: clen={} range_safe={}",
                    stream.content_length, stream.range_safe
                );
                return Ok(stream);
            }
            Err(error) => {
                crate::dlog!("[Playback] WEB_REMIX путь не удался: {error:#}");
            }
        }
    }

    // 2. Аноним / без cookies: ANDROID_VR + POT — основной полноскоростной путь (без троттлинга)
    match try_android_vr_pot(&http, client, cookie, video_id, super::clients::ANDROID_VR_1_61_48).await {
        Ok(stream) => {
            crate::dlog!(
                "[Playback] ANDROID_VR_1_61_48+POT ok: clen={} range_safe=true",
                stream.content_length
            );
            return Ok(stream);
        }
        Err(error) => {
            crate::dlog!("[Playback] ANDROID_VR_1_61_48+POT путь не удался: {error:#}");
        }
    }
    match try_android_vr_pot(&http, client, cookie, video_id, super::clients::ANDROID_VR_1_43_32).await {
        Ok(stream) => {
            crate::dlog!(
                "[Playback] ANDROID_VR_1_43_32+POT ok: clen={} range_safe=true",
                stream.content_length
            );
            return Ok(stream);
        }
        Err(error) => {
            crate::dlog!("[Playback] ANDROID_VR_1_43_32+POT путь не удался: {error:#}");
        }
    }

    // 3. Фолбэк: WEB_REMIX (нативный decipher n-трансформ + POT)
    match try_web_remix(&http, client, cookie, video_id).await {
        Ok(stream) => {
            crate::dlog!(
                "[Playback] WEB_REMIX (fallback) ok: clen={} range_safe={}",
                stream.content_length, stream.range_safe
            );
            return Ok(stream);
        }
        Err(error) => {
            crate::dlog!("[Playback] WEB_REMIX fallback не удался: {error:#}");
        }
    }

    // 4. Последний фолбэк: ANDROID_VR без POT
    match try_android_vr(cookie, video_id).await {
        Ok(stream) => {
            crate::dlog!(
                "[Playback] ANDROID_VR (без POT): clen={} range_safe=false",
                stream.content_length
            );
            Ok(stream)
        }
        Err(error) => {
            crate::dlog!("[Playback] ANDROID_VR путь не удался: {error:#}");
            bail!("все пути стрима не сработали")
        }
    }
}

async fn try_web_remix(
    http: &reqwest::Client,
    client: &YoutubeClient,
    cookie: Option<&str>,
    video_id: &str,
) -> Result<ResolvedStream> {
    // base.js качаем с cookie (если есть) — watch-страницы реже CAPTCHA'тся
    let (base_js, sts) = decipher::player_js(http, video_id, cookie).await?;

    let visitor_data = client.get_visitor_data().await;
    let mut content_pot = None;

    if let Some(pot) = client.fetch_po_token(video_id).await {
        content_pot = Some(pot);
    } else {
        for attempt in 0..3 {
            match super::botguard::mint_pot(video_id).await {
                Ok(pot) => {
                    content_pot = Some(pot);
                    break;
                }
                Err(e) => {
                    crate::dlog!("[Playback] Content POT mint failed (попытка {}): {e:#}", attempt + 1);
                }
            }
        }
    }

    let pot_ok = content_pot.is_some();

    let player = innertube::player(
        WEB_REMIX,
        video_id,
        cookie,
        PlayerExtras {
            signature_timestamp: Some(sts),
            content_pot: content_pot.as_deref(),
            visitor_data: if visitor_data.is_empty() { None } else { Some(&visitor_data) },
            ..Default::default()
        },
    )
    .await?;
    let status = player
        .pointer("/playabilityStatus/status")
        .and_then(Value::as_str)
        .unwrap_or("");
    if status != "OK" {
        let reason = player
            .pointer("/playabilityStatus/reason")
            .and_then(Value::as_str)
            .unwrap_or("неизвестно");
        bail!("playability {status}: {reason}");
    }
    let formats = player
        .pointer("/streamingData/adaptiveFormats")
        .and_then(Value::as_array)
        .context("нет adaptiveFormats")?
        .clone();

    // лучший audio: совместимость (aac > webm) → битрейт
    let mut candidates: Vec<&Value> = formats
        .iter()
        .filter(|f| {
            f.get("mimeType")
                .and_then(Value::as_str)
                .is_some_and(|m| m.starts_with("audio/"))
                && (f.get("signatureCipher").is_some() || f.get("url").is_some())
        })
        .collect();
    candidates.sort_by(|a, b| {
        let compat = |f: &Value| -> u8 {
            let m = f.get("mimeType").and_then(Value::as_str).unwrap_or("");
            if m.contains("audio/mp4") || m.contains("audio/x-m4a") {
                2
            } else if m.contains("ogg") || m.contains("vorbis") {
                1
            } else {
                0
            }
        };
        let bitrate = |f: &Value| f.get("bitrate").and_then(Value::as_u64).unwrap_or(0);
        compat(b).cmp(&compat(a)).then(bitrate(b).cmp(&bitrate(a)))
    });
    let best = candidates.first().context("нет аудио-форматов")?;

    let mime = best
        .get("mimeType")
        .and_then(Value::as_str)
        .unwrap_or("audio/mp4")
        .to_string();
    let content_length = best
        .get("contentLength")
        .and_then(Value::as_str)
        .and_then(|s| s.parse().ok())
        .or_else(|| best.get("contentLength").and_then(Value::as_u64))
        .unwrap_or(0);
    let duration_ms = player
        .pointer("/videoDetails/lengthSeconds")
        .and_then(Value::as_str)
        .and_then(|s| s.parse::<u64>().ok())
        .map(|s| s * 1000);

    let mut url = decipher::deciphered_url(http, &base_js, best)
        .await
        .context("decipher")?;
    if let Some(ref pot) = content_pot {
        url = format!("{url}&pot={pot}");
    }

    let mut source = stream_source(
        AudioStream { url, mime: mime.clone(), bitrate: 0 },
        None,
    )?;
    source.headers.insert("User-Agent".to_string(), WEB_REMIX.user_agent.to_string());
    Ok(ResolvedStream {
        source,
        range_safe: pot_ok,
        content_length,
        duration_ms,
    })
}

async fn try_android_vr(cookie: Option<&str>, video_id: &str) -> Result<ResolvedStream> {
    // Без POT ANDROID_VR отдаёт plain URL, но глубокие range 403.
    // Это всё равно лучше полного отказа: работает первый мегабайт.
    let player = innertube::player(
        ANDROID_VR_1_61_48,
        video_id,
        cookie,
        PlayerExtras::default(),
    )
    .await?;
    stream_android_vr(player)
}

/// ANDROID_VR + content POT + visitor_data — снимает 1 MiB cap (метод Kopuz).
async fn try_android_vr_pot(
    _http: &reqwest::Client,
    client: &YoutubeClient,
    cookie: Option<&str>,
    video_id: &str,
    target_client: super::clients::YouTubeClient,
) -> Result<ResolvedStream> {
    let visitor_data = client.get_visitor_data().await;
    let pot_result = async {
        if let Some(pot) = client.fetch_po_token(video_id).await {
            return Ok(pot);
        }
        super::botguard::mint_pot(video_id).await
    };
    let pot = pot_result.await.context("POT mint")?;

    let player = innertube::player(
        target_client,
        video_id,
        cookie,
        PlayerExtras {
            content_pot: Some(&pot),
            visitor_data: if visitor_data.is_empty() { None } else { Some(&visitor_data) },
            signature_timestamp: None,
        },
    )
    .await?;
    let mut stream = stream_android_vr(player)?;
    if !pot.is_empty() {
        let sep = if stream.source.url.query().is_some() { "&" } else { "?" };
        let new_url = format!("{}{sep}pot={pot}", stream.source.url);
        if let Ok(parsed) = url::Url::parse(&new_url) {
            stream.source.url = parsed;
        }
    }
    stream.source.headers.insert("User-Agent".to_string(), target_client.user_agent.to_string());
    stream.range_safe = true;
    Ok(stream)
}

fn stream_android_vr(player: Value) -> Result<ResolvedStream> {
    let status = player
        .pointer("/playabilityStatus/status")
        .and_then(Value::as_str)
        .unwrap_or("");
    if status != "OK" {
        let reason = player
            .pointer("/playabilityStatus/reason")
            .and_then(Value::as_str)
            .unwrap_or("неизвестно");
        bail!("playability {status}: {reason}");
    }
    let formats = player
        .pointer("/streamingData/adaptiveFormats")
        .and_then(Value::as_array)
        .context("нет adaptiveFormats")?;

    // Symphonia умеет aac (mp4/m4a) и vorbis, но НЕ opus (webm).
    // Предпочитаем aac/mp4 (2), затем vorbis/ogg (1), затем остальное (0).
    let compat = |f: &Value| -> u8 {
        let m = f.get("mimeType").and_then(Value::as_str).unwrap_or("");
        if m.contains("audio/mp4") || m.contains("audio/x-m4a") {
            2
        } else if m.contains("ogg") || m.contains("vorbis") {
            1
        } else {
            0
        }
    };

    let best = formats
        .iter()
        .filter(|f| {
            f.get("mimeType")
                .and_then(Value::as_str)
                .is_some_and(|m| m.starts_with("audio/"))
                && f.get("url").and_then(Value::as_str).is_some()
        })
        .max_by_key(|f| {
            let bitrate = f.get("bitrate").and_then(Value::as_u64).unwrap_or(0);
            (compat(f), bitrate)
        })
        .context("нет plain audio форматов")?;

    let mime = best
        .get("mimeType")
        .and_then(Value::as_str)
        .unwrap_or("audio/mp4")
        .to_string();
    let content_length = best
        .get("contentLength")
        .and_then(Value::as_str)
        .and_then(|s| s.parse().ok())
        .or_else(|| best.get("contentLength").and_then(Value::as_u64))
        .unwrap_or(0);
    let duration_ms = player
        .pointer("/videoDetails/lengthSeconds")
        .and_then(Value::as_str)
        .and_then(|s| s.parse::<u64>().ok())
        .map(|s| s * 1000);
    let url = best.get("url").and_then(Value::as_str).context("нет url")?;

    let mut source = stream_source(
        AudioStream { url: url.to_string(), mime, bitrate: 0 },
        None,
    )?;
    source.headers.insert("User-Agent".to_string(), ANDROID_VR_1_61_48.user_agent.to_string());
    Ok(ResolvedStream { source, range_safe: false, content_length, duration_ms })
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn test_stream_android_vr_selects_aac_over_opus() {
        let player = json!({
            "playabilityStatus": {
                "status": "OK"
            },
            "streamingData": {
                "adaptiveFormats": [
                    {
                        "mimeType": "audio/webm; codecs=\"opus\"",
                        "bitrate": 160000,
                        "url": "https://example.com/opus"
                    },
                    {
                        "mimeType": "audio/mp4; codecs=\"mp4a.40.2\"",
                        "bitrate": 128000,
                        "url": "https://example.com/aac"
                    }
                ]
            },
            "videoDetails": {
                "lengthSeconds": "180"
            }
        });

        let resolved = stream_android_vr(player).expect("should resolve stream");
        assert_eq!(resolved.source.url.as_str(), "https://example.com/aac");
        assert_eq!(resolved.source.mime_type.as_deref(), Some("audio/mp4"));
    }

    #[tokio::test]
    #[ignore = "hits live YouTube CDN"]
    async fn test_live_resolve_and_fetch() {
        let client = YoutubeClient::new().expect("client");
        let stream = resolve_stream(&client, "dQw4w9WgXcQ").await;
        println!("Live resolve result: {:?}", stream.as_ref().map(|s| (&s.source.url, s.range_safe, s.content_length)));
        let stream = stream.expect("resolve failed");
        
        tokio::task::spawn_blocking(move || {
            let mut source = crate::audio::HttpRangeSource::open(
                stream.source.url.as_str(),
                &stream.source.headers,
                stream.source.supports_range,
            ).expect("open HttpRangeSource");

            use std::io::Read;
            let mut buf = vec![0u8; 512 * 1024];
            
            let mut total_read = 0usize;
            let mut chunk_index = 0usize;
            loop {
                let n = source.read(&mut buf).expect("read");
                if n == 0 {
                    break;
                }
                total_read += n;
                println!("Read chunk {chunk_index}: {n} bytes (total: {total_read}/{})", stream.content_length);
                chunk_index += 1;
            }
            println!("Finished reading entire stream: {total_read} bytes");
            assert_eq!(total_read as u64, stream.content_length);
        }).await.expect("task join");
    }

    #[tokio::test]
    #[ignore]
    async fn test_live_twin_team() {
        use crate::provider::MusicProvider;
        let provider = super::super::YouTubeMusicProvider::new().unwrap();
        let page = provider.search("Playboi Carti - Twin Team (feat. Lil Uzi Vert)", None).await.unwrap();
        println!("YTM search returned {} tracks:", page.tracks.len());
        for t in &page.tracks[..5.min(page.tracks.len())] {
            println!("  Track: id={} title='{}' artists={:?}", t.id, t.title, t.artists);
        }
        let client = super::YoutubeClient::new().unwrap();
        let stream = super::resolve_stream(&client, "anmYryzI_9w").await.expect("resolve_stream failed");
        println!("resolve_stream result: URL={} safe={} clen={}", stream.source.url, stream.range_safe, stream.content_length);

        tokio::task::spawn_blocking(move || {
            let mut source = crate::audio::HttpRangeSource::open(
                stream.source.url.as_str(),
                &stream.source.headers,
                stream.source.supports_range,
            ).expect("open HttpRangeSource");

            use std::io::Read;
            let mut buf = vec![0u8; 512 * 1024];
            let mut total_read = 0usize;
            for chunk_index in 0..10 {
                match source.read(&mut buf) {
                    Ok(0) => {
                        println!("EOF reached at {total_read} bytes");
                        break;
                    }
                    Ok(n) => {
                        total_read += n;
                        println!("Read chunk {chunk_index}: {n} bytes (total: {total_read}/{})", stream.content_length);
                    }
                    Err(e) => {
                        panic!("Read chunk {chunk_index} FAILED: {e:#}");
                    }
                }
            }
            assert_eq!(total_read as u64, stream.content_length);
        }).await.unwrap();
    }

    #[tokio::test]
    #[ignore = "hits remote server"]
    async fn test_live_youtube_server_twin_team() {
        use crate::provider::remote::ServerClient;
        use crate::model::{ProviderKind, TrackRef, PlaybackCapability};

        let server_url = std::env::var("VESSEL_TEST_SERVER_URL")
            .unwrap_or_else(|_| "http://127.0.0.1:7700".to_string());
        let token = match std::env::var("VESSEL_TEST_SERVER_TOKEN") {
            Ok(t) if !t.is_empty() => t,
            _ => {
                // Пытаемся взять локальный токен сервера из secrets.json, если есть
                if let Ok(paths) = crate::config::AppPaths::discover() {
                    let secrets = crate::secrets::SecretStore::new(paths.secrets_file);
                    secrets.get(crate::secrets::SecretKey::SessionToken).ok().flatten()
                        .or_else(|| {
                            // Проверяем сохраненные server tokens
                            if let Ok(content) = std::fs::read_to_string(paths.data_dir.join("secrets.json")) {
                                if let Ok(val) = serde_json::from_str::<serde_json::Value>(&content) {
                                    if let Some(obj) = val.get("values").and_then(|v| v.as_object()) {
                                        for (k, v) in obj {
                                            if k.starts_with("vessel-server:") {
                                                return v.as_str().map(String::from);
                                            }
                                        }
                                    }
                                }
                            }
                            None
                        })
                        .unwrap_or_default()
                } else {
                    String::new()
                }
            }
        };

        if token.is_empty() {
            println!("[Server Test] Токен сервера не задан (VESSEL_TEST_SERVER_TOKEN), пропускаем.");
            return;
        }
        let client = ServerClient::new(&server_url, &token).expect("ServerClient");

        let track = TrackRef {
            provider: ProviderKind::YouTubeMusic,
            id: "anmYryzI_9w".to_string(),
            title: "TWIN TRIM".to_string(),
            artists: vec!["Playboi Carti".to_string(), "Lil Uzi Vert".to_string()],
            duration_ms: Some(94_825),
            artwork_url: None,
            web_url: url::Url::parse("https://music.youtube.com/watch?v=anmYryzI_9w").unwrap(),
            capability: PlaybackCapability::Full,
            genres: vec![],
            explicit: false,
            drm: false,
            isrc: None,
        };

        println!("[Server Test] Resolving track anmYryzI_9w via server relay: {}", server_url);
        let source = match client.playback_source(&track, true).await {
            Ok(s) => s,
            Err(e) => {
                println!("[Server Test] playback_source error: {e:#}");
                panic!("Failed to resolve via server: {e:#}");
            }
        };

        println!("[Server Test] Resolved source URL: {}", source.url);
        assert!(source.url.as_str().contains("/api/v1/s/"), "Should be routed through server relay");

        tokio::task::spawn_blocking(move || {
            let mut stream_source = crate::audio::HttpRangeSource::open(
                source.url.as_str(),
                &source.headers,
                source.supports_range,
            ).expect("open HttpRangeSource via server");

            use std::io::Read;
            let mut buf = vec![0u8; 512 * 1024];
            let mut total_read = 0usize;
            for chunk_index in 0..6 {
                match stream_source.read(&mut buf) {
                    Ok(0) => {
                        println!("[Server Test] EOF reached at {total_read} bytes");
                        break;
                    }
                    Ok(n) => {
                        total_read += n;
                        println!("[Server Test] Read chunk {chunk_index}: {n} bytes (total: {total_read})");
                    }
                    Err(e) => {
                        println!("[Server Test] Chunk {chunk_index} failed: {e:#}");
                        if chunk_index >= 2 {
                            println!("[Server Test] ВНИМАНИЕ: Ошибка 403 на чанке {}! Это означает, что на сервере {} работает старый vessel-server. Пересоберите и перезапустите vessel-server на сервере!", chunk_index, server_url);
                        }
                        panic!("Read chunk {chunk_index} failed through server: {e:#}");
                    }
                }
            }
            println!("[Server Test] УСПЕХ! Прочитано {total_read} байт через сервер без обрыва.");
        }).await.unwrap();
    }
}




