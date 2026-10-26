use std::path::PathBuf;

use anyhow::{Context, Result, bail};
use reqwest::Client;
use serde_json::{Value, json};

use super::{
    DeezerProvider,
    auth::{gateway_has_error, gateway_has_invalid_token, text_at},
    cache::{deezer_cache_dir, get_cached_track, write_cache},
    client::{MEDIA, deezer_headers},
    crypto::{decrypt_audio, legacy_urls},
};

pub async fn prepare_full_track(provider: &DeezerProvider, track_id: &str) -> Result<PathBuf> {
    if let Some(cached) = get_cached_track(track_id) {
        return Ok(cached);
    }
    let user = provider
        .gateway("deezer.getUserData", "", json!({}))
        .await?;
    let mut token = text_at(&user, &["results", "checkForm"])
        .context("ARL не авторизован: Deezer не выдал checkForm")?
        .to_string();
    let mut license = text_at(&user, &["results", "USER", "OPTIONS", "license_token"])
        .context("ARL не авторизован: Deezer не выдал license_token")?
        .to_string();
    let mut raw = provider
        .gateway("song.getListData", &token, json!({ "SNG_IDS": [track_id] }))
        .await?;
    if gateway_has_invalid_token(&raw) {
        let refreshed = provider
            .gateway("deezer.getUserData", "", json!({}))
            .await?;
        token = text_at(&refreshed, &["results", "checkForm"])
            .context("Deezer не обновил checkForm")?
            .to_string();
        license = text_at(&refreshed, &["results", "USER", "OPTIONS", "license_token"])
            .context("Deezer не обновил license_token")?
            .to_string();
        raw = provider
            .gateway("song.getListData", &token, json!({ "SNG_IDS": [track_id] }))
            .await?;
    }
    if raw.get("error").is_some_and(gateway_has_error) {
        bail!("Deezer gateway: {}", raw["error"])
    }
    let song = raw
        .pointer("/results/data/0")
        .context("Deezer не вернул метаданные полного трека")?;
    let track_token = text_at(song, &["TRACK_TOKEN"]).context("Deezer не вернул TRACK_TOKEN")?;
    let mut candidates = resolve_media(&provider.http, &license, track_token)
        .await
        .unwrap_or_default();
    for (format, extension) in [("MP3_320", "mp3"), ("MP3_128", "mp3"), ("FLAC", "flac")] {
        if let Ok(urls) = legacy_urls(song, format) {
            candidates.extend(urls.into_iter().map(|url| (url, extension)));
        }
    }
    let mut last_error = None;
    for (media_url, extension) in candidates {
        let response = match provider
            .http
            .get(media_url)
            .headers(deezer_headers())
            .send()
            .await
        {
            Ok(response) => response,
            Err(error) => {
                last_error = Some(error.to_string());
                continue;
            }
        };
        if !response.status().is_success() {
            last_error = Some(format!("HTTP {}", response.status().as_u16()));
            continue;
        }
        let bytes = response
            .bytes()
            .await
            .context("не удалось прочитать полный трек Deezer")?;
        let decrypted = decrypt_audio(&bytes, track_id)?;
        let path = deezer_cache_dir().join(format!("{track_id}.{extension}"));
        write_cache(&path, &decrypted)?;
        return Ok(path);
    }
    bail!(
        "Deezer не отдал полный трек: {}",
        last_error.unwrap_or_else(|| "нет media-кандидатов".to_string())
    )
}

pub async fn resolve_media(
    http: &Client,
    license: &str,
    track_token: &str,
) -> Result<Vec<(String, &'static str)>> {
    for (format, extension) in [("MP3_320", "mp3"), ("MP3_128", "mp3"), ("FLAC", "flac")] {
        let payload = http
            .post(MEDIA)
            .headers(deezer_headers())
            .json(&json!({
                "license_token": license,
                "media": [{ "type": "FULL", "formats": [{
                    "cipher": "BF_CBC_STRIPE", "format": format
                }]}],
                "track_tokens": [track_token]
            }))
            .send()
            .await
            .context("Deezer media API не ответил")?;
        if !payload.status().is_success() {
            continue;
        }
        let value = payload
            .json::<Value>()
            .await
            .context("повреждённый ответ Deezer media API")?;
        if let Some(url) = value
            .pointer("/data/0/media/0/sources/0/url")
            .and_then(Value::as_str)
            && !url.trim().is_empty()
        {
            return Ok(vec![(url.to_string(), extension)]);
        }
    }
    Ok(Vec::new())
}
