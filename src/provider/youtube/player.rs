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

    // --- Путь 1: WEB_REMIX + decipher + pot= в URL ---
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

    // --- Путь 2: ANDROID_VR + POT в body (Kopuz-метод) ---
    match try_android_vr_pot(&http, client, cookie, video_id).await {
        Ok(stream) => {
            crate::dlog!(
                "[Playback] ANDROID_VR+POT ok: clen={} range_safe=true",
                stream.content_length
            );
            return Ok(stream);
        }
        Err(error) => {
            crate::dlog!("[Playback] ANDROID_VR+POT путь не удался: {error:#}");
        }
    }

    // --- Путь 3: ANDROID_VR без POT — только первый мегабайт ---
    match try_android_vr(cookie, video_id).await {
        Ok(stream) => {
            crate::dlog!(
                "[Playback] ANDROID_VR (без POT): clen={} range_safe=false (обрыв после ~1 MiB)",
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
    let player = innertube::player(
        WEB_REMIX,
        video_id,
        cookie,
        PlayerExtras {
            signature_timestamp: Some(sts),
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
            } else if m.contains("ogg") || m.contains("vorbis") || m.contains("opus") {
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

    let url = decipher::deciphered_url(http, &base_js, best)
        .await
        .context("decipher")?;
    // POT в URL: без него googlevideo отдаёт только первый MiB (дальше 403).
    // Контент-bound токен от BotGuard в query — классический путь.
    // Content-bound токен от BotGuard в query — классический путь.
    // Ретрай: первый mint после старта процесса бывает медленным/нестабильным.
    // POT: сначала potoken-провайдер клиента (bgutil HTTP — стабилен на VPS),
    // затем BotGuard локально (3 ретрая: первый mint после старта бывает
    // медленным/нестабильным).
    let mut pot_ok = false;
    let mut url = url;
    if let Some(pot) = client.fetch_po_token(video_id).await {
        url = format!("{url}&pot={pot}");
        pot_ok = true;
    } else {
        for attempt in 0..3 {
            match super::botguard::mint_content_pot(video_id).await {
                Ok(pot) => {
                    url = format!("{url}&pot={pot}");
                    pot_ok = true;
                    break;
                }
                Err(e) => {
                    crate::dlog!("[Playback] POT mint failed (попытка {}): {e:#}", attempt + 1);
                }
            }
        }
    }
    let source = stream_source(
        AudioStream { url, mime: mime.clone(), bitrate: 0 },
        None,
    )?;
    // Без pot= googlevideo 403ит на range после первого MiB — seek невозможен
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
) -> Result<ResolvedStream> {
    // POT: potoken-провайдер клиента первичен (стабилен на серверных IP),
    // BotGuard — фолбэк.
    let pot_result = async {
        if let Some(pot) = client.fetch_po_token(video_id).await {
            return Ok(pot);
        }
        super::botguard::mint_content_pot(video_id).await
    };
    let (pot, visitor) = tokio::join!(pot_result, innertube::visitor_id_maybe_auth(cookie),);
    let pot = pot.context("POT mint")?;
    let visitor = visitor.unwrap_or_default();
    let visitor_opt = if visitor.is_empty() { None } else { Some(visitor.as_str()) };

    let player = innertube::player(
        ANDROID_VR_1_61_48,
        video_id,
        cookie,
        PlayerExtras {
            content_pot: Some(&pot),
            visitor_data: visitor_opt,
            signature_timestamp: None,
        },
    )
    .await?;
    let mut stream = stream_android_vr(player)?;
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

    // только plain url (у ANDROID_VR обычно так)
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
            let webm_bonus = if f
                .get("mimeType")
                .and_then(Value::as_str)
                .is_some_and(|m| m.contains("webm"))
            {
                1_000_000u64
            } else {
                0
            };
            bitrate + webm_bonus
        })
        .context("нет plain audio форматов")?;

    let mime = best
        .get("mimeType")
        .and_then(Value::as_str)
        .unwrap_or("audio/webm")
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

    let source = stream_source(
        AudioStream { url: url.to_string(), mime, bitrate: 0 },
        None,
    )?;
    Ok(ResolvedStream { source, range_safe: false, content_length, duration_ms })
}

