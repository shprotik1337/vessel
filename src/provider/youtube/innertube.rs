//! Raw InnerTube HTTP transport (по образцу Kopuz `innertube.rs`, EUPL-1.2):
//! player с SAPISIDHASH + signatureTimestamp, browse, browse continuation.

use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::{Context, Result};
use crate::vpn::ApplyVpnProxy;
use reqwest::{
    Client,
    header::{CONTENT_TYPE, USER_AGENT},
};
use serde_json::{Value, json};
use sha1::{Digest, Sha1};

use super::clients::{ORIGIN_YOUTUBE_MUSIC, WEB_REMIX, YouTubeClient};

fn http_client() -> std::sync::Arc<Client> {
    use std::sync::{Arc, Mutex, OnceLock};
    static CLIENT: OnceLock<Mutex<(Option<String>, Arc<Client>)>> = OnceLock::new();
    let cell = CLIENT.get_or_init(|| Mutex::new((None, Arc::new(new_client()))));
    let mut cached = cell.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let active = crate::vpn::current_proxy();
    if cached.0 != active {
        cached.1 = Arc::new(new_client());
        cached.0 = active;
    }
    Arc::clone(&cached.1)
}

fn new_client() -> Client {
    Client::builder()
        .apply_vpn_proxy()
        .build()
        .expect("innertube http client")
}

/// `Authorization: SAPISIDHASH <ts>_<sha1(ts " " SAPISID " " origin)>`.
pub fn sapisid_hash(cookies: &str, origin: &str) -> Option<String> {
    let sapisid = cookie_value(cookies, "SAPISID")
        .or_else(|| cookie_value(cookies, "__Secure-3PAPISID"))?;
    let ts = SystemTime::now().duration_since(UNIX_EPOCH).ok()?.as_secs();
    let mut hasher = Sha1::new();
    hasher.update(format!("{ts} {sapisid} {origin}").as_bytes());
    Some(format!(
        "SAPISIDHASH {ts}_{}",
        hasher
            .finalize()
            .iter()
            .map(|b| format!("{b:02x}"))
            .collect::<String>()
    ))
}

pub fn cookie_value(header: &str, name: &str) -> Option<String> {
    let prefix = format!("{name}=");
    for part in header.split(';') {
        let p = part.trim();
        if let Some(v) = p.strip_prefix(&prefix) {
            return Some(v.to_string());
        }
    }
    None
}

fn build_context(client: YouTubeClient) -> Value {
    let mut obj = serde_json::Map::new();
    obj.insert("clientName".into(), Value::String(client.client_name.into()));
    obj.insert(
        "clientVersion".into(),
        Value::String(client.client_version.into()),
    );
    obj.insert("hl".into(), Value::String("en".into()));
    obj.insert("gl".into(), Value::String("US".into()));
    if !client.os_name.is_empty() {
        obj.insert("osName".into(), Value::String(client.os_name.into()));
    }
    if !client.os_version.is_empty() {
        obj.insert("osVersion".into(), Value::String(client.os_version.into()));
    }
    if !client.device_make.is_empty() {
        obj.insert("deviceMake".into(), Value::String(client.device_make.into()));
    }
    if !client.device_model.is_empty() {
        obj.insert(
            "deviceModel".into(),
            Value::String(client.device_model.into()),
        );
    }
    if let Some(sdk) = client.android_sdk_version {
        obj.insert("androidSdkVersion".into(), Value::Number(sdk.into()));
    }
    Value::Object(obj)
}

#[derive(Default, Clone, Copy)]
pub struct PlayerExtras<'a> {
    /// Content-bound PO token (`serviceIntegrityDimensions.poToken`).
    pub content_pot: Option<&'a str>,
    /// `context.client.visitorData`.
    pub visitor_data: Option<&'a str>,
    /// `playbackContext.contentPlaybackContext.signatureTimestamp` — обязан
    /// совпадать с base.js, против которого будет decipher.
    pub signature_timestamp: Option<u64>,
}

/// `/youtubei/v1/player`. WEB_REMIX идёт через music.youtube.com.
pub async fn player(
    client: YouTubeClient,
    video_id: &str,
    cookies: Option<&str>,
    extras: PlayerExtras<'_>,
) -> Result<Value> {
    let mut context_client = build_context(client);
    if let Some(vd) = extras.visitor_data
        && let Value::Object(ref mut m) = context_client
    {
        m.insert("visitorData".into(), Value::String(vd.to_string()));
    }

    let mut body = json!({
        "context": {
            "client": context_client,
            "user": { "lockedSafetyMode": false }
        },
        "videoId": video_id,
        "contentCheckOk": true,
        "racyCheckOk": true,
    });
    if let Some(pot) = extras.content_pot {
        body["serviceIntegrityDimensions"] = json!({ "poToken": pot });
    }
    if let Some(sts) = extras.signature_timestamp {
        body["playbackContext"] = json!({
            "contentPlaybackContext": { "signatureTimestamp": sts }
        });
    }

    let host = if client.client_name == "WEB_REMIX" {
        ORIGIN_YOUTUBE_MUSIC
    } else {
        "https://www.youtube.com"
    };
    let url = format!("{host}/youtubei/v1/player?prettyPrint=false");

    let mut req = http_client()
        .post(&url)
        .header(USER_AGENT, client.user_agent)
        .header(CONTENT_TYPE, "application/json")
        .header("X-Goog-Api-Format-Version", "1")
        .header("X-YouTube-Client-Name", client.client_id)
        .header("X-YouTube-Client-Version", client.client_version);
    if client.client_name.starts_with("WEB") {
        req = req
            .header("X-Origin", ORIGIN_YOUTUBE_MUSIC)
            .header("Referer", format!("{ORIGIN_YOUTUBE_MUSIC}/"));
    }
    if let Some(c) = cookies.filter(|c| !c.is_empty()) {
        // SAPISIDHASH только когда в cookie реально есть SAPISID; иначе (куки
        // без логина, OAuth-сессия) — шлём cookie как есть, не роняя запрос.
        // Это критично для сервера: playbook «нет SAPISID → bail» убивал
        // все player-запросы с частичной cookie.
        match sapisid_hash(c, ORIGIN_YOUTUBE_MUSIC) {
            Some(auth) if client.login_supported => {
                req = req.header("Cookie", c).header("Authorization", auth);
            }
            _ => {
                req = req.header("Cookie", c);
            }
        }
    }

    let resp = req.json(&body).send().await.context("player HTTP")?;
    if !resp.status().is_success() {
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        let snippet: String = text.chars().take(300).collect();
        anyhow::bail!("player HTTP {status}: {snippet}");
    }
    Ok(resp.json::<Value>().await.context("player JSON parse")?)
}

/// `/youtubei/v1/browse` — анонимно либо с cookies (WEB_REMIX).
pub async fn browse_maybe_auth(browse_id: &str, cookies: Option<&str>) -> Result<Value> {
    let client = WEB_REMIX;
    let context = build_context(client);
    let body = json!({
        "context": { "client": context, "user": { "lockedSafetyMode": false } },
        "browseId": browse_id,
    });
    let mut req = http_client()
        .post(format!(
            "{ORIGIN_YOUTUBE_MUSIC}/youtubei/v1/browse?prettyPrint=false"
        ))
        .header(USER_AGENT, client.user_agent)
        .header(CONTENT_TYPE, "application/json")
        .header("X-Goog-Api-Format-Version", "1")
        .header("X-YouTube-Client-Name", client.client_id)
        .header("X-YouTube-Client-Version", client.client_version)
        .header("X-Origin", ORIGIN_YOUTUBE_MUSIC)
        .header("Referer", format!("{ORIGIN_YOUTUBE_MUSIC}/"));
    if let Some(c) = cookies.filter(|c| !c.is_empty()) {
        match sapisid_hash(c, ORIGIN_YOUTUBE_MUSIC) {
            Some(auth) => req = req.header("Cookie", c).header("Authorization", auth),
            None => req = req.header("Cookie", c),
        }
    }
    let resp = req.json(&body).send().await.context("browse HTTP")?;
    if !resp.status().is_success() {
        anyhow::bail!("browse HTTP {}", resp.status());
    }
    Ok(resp.json::<Value>().await.context("browse JSON parse")?)
}

/// `/browse` с continuation-токеном — пагинация шельфов.
pub async fn browse_continuation_maybe_auth(
    continuation: &str,
    cookies: Option<&str>,
) -> Result<Value> {
    let client = WEB_REMIX;
    let context = build_context(client);
    let body = json!({
        "context": { "client": context, "user": { "lockedSafetyMode": false } },
    });
    let mut req = http_client()
        .post(format!(
            "{ORIGIN_YOUTUBE_MUSIC}/youtubei/v1/browse?ctoken={continuation}&continuation={continuation}&prettyPrint=false"
        ))
        .header(USER_AGENT, client.user_agent)
        .header(CONTENT_TYPE, "application/json")
        .header("X-Goog-Api-Format-Version", "1")
        .header("X-YouTube-Client-Name", client.client_id)
        .header("X-YouTube-Client-Version", client.client_version)
        .header("X-Origin", ORIGIN_YOUTUBE_MUSIC)
        .header("Referer", format!("{ORIGIN_YOUTUBE_MUSIC}/"));
    if let Some(c) = cookies.filter(|c| !c.is_empty()) {
        match sapisid_hash(c, ORIGIN_YOUTUBE_MUSIC) {
            Some(auth) => req = req.header("Cookie", c).header("Authorization", auth),
            None => req = req.header("Cookie", c),
        }
    }
    let resp = req.json(&body).send().await.context("browse continuation HTTP")?;
    if !resp.status().is_success() {
        anyhow::bail!("browse continuation HTTP {}", resp.status());
    }
    Ok(resp
        .json::<Value>()
        .await
        .context("browse continuation JSON parse")?)
}

/// `responseContext.visitorData` из любого innertube-ответа.
pub fn extract_visitor_data(resp: &Value) -> Option<String> {
    resp.pointer("/responseContext/visitorData")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

/// Свежий visitor_data через лёгкий `/visitor_id` эндпоинт.
pub async fn visitor_id() -> Result<String> {
    visitor_id_maybe_auth(None).await
}

/// `/visitor_id` с опциональными cookies (для IP, где Google требует логин).
pub async fn visitor_id_maybe_auth(cookies: Option<&str>) -> Result<String> {
    let client = WEB_REMIX;
    let context = build_context(client);
    let body = json!({ "context": { "client": context } });
    let mut req = http_client()
        .post(format!(
            "{ORIGIN_YOUTUBE_MUSIC}/youtubei/v1/visitor_id?prettyPrint=false"
        ))
        .header(USER_AGENT, client.user_agent)
        .header(CONTENT_TYPE, "application/json")
        .header("X-YouTube-Client-Name", client.client_id)
        .header("X-YouTube-Client-Version", client.client_version)
        .header("X-Origin", ORIGIN_YOUTUBE_MUSIC)
        .header("Referer", format!("{ORIGIN_YOUTUBE_MUSIC}/"));
    if let Some(c) = cookies.filter(|c| !c.is_empty()) {
        match sapisid_hash(c, ORIGIN_YOUTUBE_MUSIC) {
            Some(auth) => req = req.header("Cookie", c).header("Authorization", auth),
            None => req = req.header("Cookie", c),
        }
    }
    let resp = req.json(&body).send().await.context("visitor_id HTTP")?;
    if !resp.status().is_success() {
        anyhow::bail!("visitor_id HTTP {}", resp.status());
    }
    let json: Value = resp.json().await.context("visitor_id JSON")?;
    extract_visitor_data(&json).context("no visitorData in response")
}
