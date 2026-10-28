use std::sync::{OnceLock, RwLock};
use std::time::{Duration, Instant};
use reqwest::header::{self, HeaderMap, HeaderValue};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LyricsCandidate {
    pub provider: String,
    pub sync_level: String, // "word_level" | "line_level" | "plain"
    pub format: String,     // "richsync" | "ttml" | "lrc" | "plain"
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_meta: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct LyricsMultiResponse {
    pub candidates: Vec<LyricsCandidate>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub synced_lyrics: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub plain_lyrics: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub instrumental: Option<bool>,
}

static MXM_TOKEN_CACHE: OnceLock<RwLock<Option<(String, Instant)>>> = OnceLock::new();

fn get_mxm_cache() -> &'static RwLock<Option<(String, Instant)>> {
    MXM_TOKEN_CACHE.get_or_init(|| RwLock::new(None))
}

fn get_token_file_path() -> std::path::PathBuf {
    if let Ok(appdata) = std::env::var("APPDATA") {
        let p = std::path::PathBuf::from(appdata).join("vessel").join("vessel").join("data");
        let _ = std::fs::create_dir_all(&p);
        return p.join("musixmatch_token.txt");
    }
    let p = std::path::PathBuf::from("/opt/vessel/data");
    if p.exists() {
        return p.join("musixmatch_token.txt");
    }
    std::env::temp_dir().join("vessel_musixmatch_token.txt")
}

fn load_persisted_token() -> Option<String> {
    let path = get_token_file_path();
    if let Ok(content) = std::fs::read_to_string(&path) {
        let tok = content.trim().to_string();
        if tok.len() >= 20 && !tok.chars().all(|c| c == '0') {
            return Some(tok);
        }
    }
    None
}

fn persist_token(token: &str) {
    let path = get_token_file_path();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    let _ = std::fs::write(path, token.trim());
}

fn clear_persisted_token() {
    let _ = std::fs::remove_file(get_token_file_path());
    if let Ok(mut cache) = get_mxm_cache().write() {
        *cache = None;
    }
}

fn get_mxm_headers() -> HeaderMap {
    let mut h = HeaderMap::new();
    h.insert(header::ACCEPT, HeaderValue::from_static("application/json"));
    h.insert("X-Cookie", HeaderValue::from_static("x-mxm-token-guid="));
    h.insert("x-mxm-app-version", HeaderValue::from_static("10.1.1"));
    h.insert("X-User-Agent", HeaderValue::from_static("Musixmatch/2025120901 CFNetwork/3860.300.31 Darwin/25.2.0"));
    h.insert(header::USER_AGENT, HeaderValue::from_static("Musixmatch/2025120901 Android/15 (Google; Pixel 9 Pro XL)"));
    h.insert(header::ACCEPT_LANGUAGE, HeaderValue::from_static("en-US,en;q=0.9"));
    h
}

async fn get_musixmatch_user_token(http: &reqwest::Client) -> Option<String> {
    // 1. Check in-memory cache
    if let Ok(cache) = get_mxm_cache().read() {
        if let Some((ref tok, exp)) = *cache {
            if exp.elapsed() < Duration::from_secs(14 * 86400) {
                return Some(tok.clone());
            }
        }
    }

    // 2. Check disk persistence
    if let Some(disk_tok) = load_persisted_token() {
        if let Ok(mut cache) = get_mxm_cache().write() {
            *cache = Some((disk_tok.clone(), Instant::now()));
        }
        return Some(disk_tok);
    }

    // 3. Request fresh token from Musixmatch
    let resp = http
        .get("https://apic-appmobile.musixmatch.com/ws/1.1/token.get?app_id=community-app-v1.0")
        .headers(get_mxm_headers())
        .timeout(Duration::from_secs(6))
        .send()
        .await
        .ok()?;

    let json: serde_json::Value = resp.json().await.ok()?;
    let user_token = json
        .get("message")?
        .get("body")?
        .get("user_token")?
        .as_str()?
        .to_string();

    if user_token.len() >= 20 && !user_token.chars().all(|c| c == '0') {
        persist_token(&user_token);
        if let Ok(mut cache) = get_mxm_cache().write() {
            *cache = Some((user_token.clone(), Instant::now()));
        }
        Some(user_token)
    } else {
        None
    }
}

pub async fn fetch_musixmatch(
    http: &reqwest::Client,
    title: &str,
    artist: &str,
    duration_secs: Option<f64>,
) -> Option<LyricsCandidate> {
    let token = get_musixmatch_user_token(http).await?;
    let dur_str = duration_secs.map(|d| d.round().to_string()).unwrap_or_default();

    let mut macro_candidate: Option<LyricsCandidate> = None;

    // --- STAGE 1: macro.subtitles.get ---
    if let Ok(mut url) = url::Url::parse("https://apic-appmobile.musixmatch.com/ws/1.1/macro.subtitles.get") {
        {
            let mut q = url.query_pairs_mut();
            q.append_pair("format", "json");
            q.append_pair("namespace", "lyrics_richsynched");
            q.append_pair("subtitle_format", "mxm");
            q.append_pair("app_id", "mac-ios-v2.0");
            q.append_pair("q_artist", artist);
            q.append_pair("q_track", title);
            if !dur_str.is_empty() {
                q.append_pair("q_duration", &dur_str);
            }
            q.append_pair("usertoken", &token);
            q.append_pair("optional_calls", "track.richsync");
            q.append_pair("richsync_compact_type", "words");
            q.append_pair("part", "track_lyrics_translation_status,track_structure");
        }

        if let Ok(resp) = http
            .get(url)
            .headers(get_mxm_headers())
            .timeout(Duration::from_secs(6))
            .send()
            .await
        {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if json.get("message").and_then(|m| m.get("header")).and_then(|h| h.get("status_code")).and_then(|s| s.as_i64()) == Some(401) {
                    clear_persisted_token();
                }

                if let Some(macro_calls) = json.get("message").and_then(|m| m.get("body")).and_then(|b| b.get("macro_calls")) {
                    // 1. Check for word-level richsync
                    if let Some(richsync_str) = macro_calls
                        .get("track.richsync.get")
                        .and_then(|r| r.get("message"))
                        .and_then(|m| m.get("body"))
                        .and_then(|b| b.get("richsync"))
                        .and_then(|rs| rs.get("richsync_body"))
                        .and_then(|b| b.as_str())
                    {
                        if richsync_str.trim().starts_with('[') {
                            return Some(LyricsCandidate {
                                provider: "Musixmatch".to_string(),
                                sync_level: "word_level".to_string(),
                                format: "richsync".to_string(),
                                content: richsync_str.to_string(),
                                is_meta: None,
                                source: None,
                            });
                        }
                    }

                    // 2. Check for line-level subtitles
                    if let Some(subtitle_body) = macro_calls
                        .get("track.subtitles.get")
                        .and_then(|s| s.get("message"))
                        .and_then(|m| m.get("body"))
                        .and_then(|b| b.get("subtitle_list"))
                        .and_then(|l| l.get(0))
                        .and_then(|sub| sub.get("subtitle"))
                        .and_then(|sub| sub.get("subtitle_body"))
                        .and_then(|b| b.as_str())
                    {
                        if let Ok(lines) = serde_json::from_str::<Vec<serde_json::Value>>(subtitle_body) {
                            let mut lrc = String::new();
                            for item in lines {
                                if let (Some(text), Some(total)) = (
                                    item.get("text").and_then(|t| t.as_str()),
                                    item.get("time").and_then(|t| t.get("total")).and_then(|tot| tot.as_f64()),
                                ) {
                                    let mins = (total / 60.0).floor() as u32;
                                    let secs = total % 60.0;
                                    lrc.push_str(&format!("[{:02}:{:05.2}]{}\n", mins, secs, text));
                                }
                            }
                            if !lrc.is_empty() {
                                macro_candidate = Some(LyricsCandidate {
                                    provider: "Musixmatch".to_string(),
                                    sync_level: "line_level".to_string(),
                                    format: "lrc".to_string(),
                                    content: lrc,
                                    is_meta: None,
                                    source: None,
                                });
                            }
                        }
                    }

                    // 3. Fallback to plain lyrics
                    if macro_candidate.is_none() {
                        if let Some(plain) = macro_calls
                            .get("track.lyrics.get")
                            .and_then(|l| l.get("message"))
                            .and_then(|m| m.get("body"))
                            .and_then(|b| b.get("lyrics"))
                            .and_then(|lyr| lyr.get("lyrics_body"))
                            .and_then(|b| b.as_str())
                        {
                            macro_candidate = Some(LyricsCandidate {
                                provider: "Musixmatch".to_string(),
                                sync_level: "plain".to_string(),
                                format: "plain".to_string(),
                                content: plain.to_string(),
                                is_meta: None,
                                source: None,
                            });
                        }
                    }
                }
            }
        }
    }

    // --- STAGE 2 (Fallback): track.search sorted by popularity s_track_rating=desc ---
    // Fixes the issue where matcher matches remixes, instrumental tracks or empty live cuts.
    if let Ok(mut search_url) = url::Url::parse("https://apic-appmobile.musixmatch.com/ws/1.1/track.search") {
        {
            let mut q = search_url.query_pairs_mut();
            q.append_pair("format", "json");
            q.append_pair("app_id", "mac-ios-v2.0");
            q.append_pair("usertoken", &token);
            q.append_pair("q_artist", artist);
            q.append_pair("q_track", title);
            q.append_pair("s_track_rating", "desc");
            q.append_pair("f_has_lyrics", "1");
        }

        if let Ok(resp) = http
            .get(search_url)
            .headers(get_mxm_headers())
            .timeout(Duration::from_secs(6))
            .send()
            .await
        {
            if let Ok(json) = resp.json::<serde_json::Value>().await {
                if let Some(track_list) = json
                    .get("message")
                    .and_then(|m| m.get("body"))
                    .and_then(|b| b.get("track_list"))
                    .and_then(|l| l.as_array())
                {
                    for item in track_list.iter().take(3) {
                        let tr = match item.get("track") {
                            Some(t) => t,
                            None => continue,
                        };
                        let track_id = match tr.get("track_id").and_then(|id| id.as_i64()) {
                            Some(id) => id,
                            None => continue,
                        };

                        let has_richsync = tr.get("has_richsync").and_then(|h| h.as_i64()).unwrap_or(0) == 1;
                        let has_subtitles = tr.get("has_subtitles").and_then(|h| h.as_i64()).unwrap_or(0) == 1;

                        // Try richsync first
                        if has_richsync {
                            if let Ok(mut rs_url) = url::Url::parse("https://apic-appmobile.musixmatch.com/ws/1.1/track.richsync.get") {
                                rs_url.query_pairs_mut()
                                    .append_pair("format", "json")
                                    .append_pair("app_id", "mac-ios-v2.0")
                                    .append_pair("usertoken", &token)
                                    .append_pair("track_id", &track_id.to_string());

                                if let Ok(rs_resp) = http
                                    .get(rs_url)
                                    .headers(get_mxm_headers())
                                    .timeout(Duration::from_secs(5))
                                    .send()
                                    .await
                                {
                                    if let Ok(rs_json) = rs_resp.json::<serde_json::Value>().await {
                                        if let Some(rs_body) = rs_json
                                            .get("message")
                                            .and_then(|m| m.get("body"))
                                            .and_then(|b| b.get("richsync"))
                                            .and_then(|rs| rs.get("richsync_body"))
                                            .and_then(|b| b.as_str())
                                        {
                                            if rs_body.trim().starts_with('[') {
                                                return Some(LyricsCandidate {
                                                    provider: "Musixmatch".to_string(),
                                                    sync_level: "word_level".to_string(),
                                                    format: "richsync".to_string(),
                                                    content: rs_body.to_string(),
                                                    is_meta: None,
                                                    source: None,
                                                });
                                            }
                                        }
                                    }
                                }
                            }
                        }

                        // Try subtitles next if no richsync
                        if has_subtitles && macro_candidate.is_none() {
                            if let Ok(mut sub_url) = url::Url::parse("https://apic-appmobile.musixmatch.com/ws/1.1/track.subtitles.get") {
                                sub_url.query_pairs_mut()
                                    .append_pair("format", "json")
                                    .append_pair("app_id", "mac-ios-v2.0")
                                    .append_pair("usertoken", &token)
                                    .append_pair("track_id", &track_id.to_string());

                                if let Ok(sub_resp) = http
                                    .get(sub_url)
                                    .headers(get_mxm_headers())
                                    .timeout(Duration::from_secs(5))
                                    .send()
                                    .await
                                {
                                    if let Ok(sub_json) = sub_resp.json::<serde_json::Value>().await {
                                        if let Some(sub_body) = sub_json
                                            .get("message")
                                            .and_then(|m| m.get("body"))
                                            .and_then(|b| b.get("subtitle_list"))
                                            .and_then(|l| l.get(0))
                                            .and_then(|s| s.get("subtitle"))
                                            .and_then(|s| s.get("subtitle_body"))
                                            .and_then(|b| b.as_str())
                                        {
                                            if let Ok(lines) = serde_json::from_str::<Vec<serde_json::Value>>(sub_body) {
                                                let mut lrc = String::new();
                                                for item in lines {
                                                    if let (Some(text), Some(total)) = (
                                                        item.get("text").and_then(|t| t.as_str()),
                                                        item.get("time").and_then(|t| t.get("total")).and_then(|tot| tot.as_f64()),
                                                    ) {
                                                        let mins = (total / 60.0).floor() as u32;
                                                        let secs = total % 60.0;
                                                        lrc.push_str(&format!("[{:02}:{:05.2}]{}\n", mins, secs, text));
                                                    }
                                                }
                                                if !lrc.is_empty() {
                                                    macro_candidate = Some(LyricsCandidate {
                                                        provider: "Musixmatch".to_string(),
                                                        sync_level: "line_level".to_string(),
                                                        format: "lrc".to_string(),
                                                        content: lrc,
                                                        is_meta: None,
                                                        source: None,
                                                    });
                                                    break;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    macro_candidate
}

pub async fn fetch_lrclib(
    http: &reqwest::Client,
    title: &str,
    artist: &str,
    album: Option<&str>,
    duration_secs: Option<f64>,
) -> Option<LyricsCandidate> {
    // 1. Exact match endpoint
    let mut url = url::Url::parse("https://lrclib.net/api/get").ok()?;
    {
        let mut q = url.query_pairs_mut();
        q.append_pair("track_name", title);
        q.append_pair("artist_name", artist);
        if let Some(alb) = album.filter(|s| !s.is_empty()) {
            q.append_pair("album_name", alb);
        }
        if let Some(d) = duration_secs {
            q.append_pair("duration", &d.round().to_string());
        }
    }

    let resp = http
        .get(url)
        .header(header::USER_AGENT, "vessel/1.3.17 (https://github.com/shprotik1337/vessel)")
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .ok()?;

    if resp.status().is_success() {
        if let Ok(json) = resp.json::<serde_json::Value>().await {
            if let Some(synced) = json.get("syncedLyrics").and_then(|s| s.as_str()) {
                if !synced.trim().is_empty() {
                    return Some(LyricsCandidate {
                        provider: "LRCLIB".to_string(),
                        sync_level: "line_level".to_string(),
                        format: "lrc".to_string(),
                        content: synced.to_string(),
                        is_meta: None,
                        source: None,
                    });
                }
            }
            if let Some(plain) = json.get("plainLyrics").and_then(|s| s.as_str()) {
                if !plain.trim().is_empty() {
                    return Some(LyricsCandidate {
                        provider: "LRCLIB".to_string(),
                        sync_level: "plain".to_string(),
                        format: "plain".to_string(),
                        content: plain.to_string(),
                        is_meta: None,
                        source: None,
                    });
                }
            }
        }
    }

    // 2. Search fallback
    let query_str = format!("{artist} {title}");
    let mut search_url = url::Url::parse("https://lrclib.net/api/search").ok()?;
    search_url.query_pairs_mut().append_pair("q", &query_str);

    let s_resp = http
        .get(search_url)
        .header(header::USER_AGENT, "vessel/1.3.17 (https://github.com/shprotik1337/vessel)")
        .timeout(Duration::from_secs(5))
        .send()
        .await
        .ok()?;

    if s_resp.status().is_success() {
        if let Ok(list) = s_resp.json::<Vec<serde_json::Value>>().await {
            if let Some(first_match) = list.into_iter().find(|item| {
                item.get("syncedLyrics").and_then(|s| s.as_str()).map(|s| !s.trim().is_empty()).unwrap_or(false)
            }) {
                if let Some(synced) = first_match.get("syncedLyrics").and_then(|s| s.as_str()) {
                    return Some(LyricsCandidate {
                        provider: "LRCLIB".to_string(),
                        sync_level: "line_level".to_string(),
                        format: "lrc".to_string(),
                        content: synced.to_string(),
                        is_meta: None,
                        source: None,
                    });
                }
            }
        }
    }

    None
}

fn sync_rank(sync_level: &str) -> i32 {
    match sync_level {
        "word_level" => 3,
        "line_level" => 2,
        "plain" => 1,
        _ => 0,
    }
}

fn provider_priority(provider: &str) -> i32 {
    match provider {
        "Musixmatch" => 10,
        "Cadence" => 8,
        "LRCLIB" => 4,
        _ => 1,
    }
}

pub async fn resolve_multi_default(
    title: &str,
    artist: &str,
    album: Option<&str>,
    duration_secs: Option<f64>,
    include_vessel_meta: bool,
) -> LyricsMultiResponse {
    let http = reqwest::Client::builder()
        .timeout(Duration::from_secs(8))
        .build()
        .unwrap_or_default();
    resolve_multi(&http, title, artist, album, duration_secs, include_vessel_meta).await
}

pub async fn resolve_multi(
    http: &reqwest::Client,
    title: &str,
    artist: &str,
    album: Option<&str>,
    duration_secs: Option<f64>,
    include_vessel_meta: bool,
) -> LyricsMultiResponse {
    let clean_title = title
        .split('(')
        .next()
        .unwrap_or(title)
        .split('[')
        .next()
        .unwrap_or(title)
        .trim();

    let (mxm_res, lrc_res) = tokio::join!(
        fetch_musixmatch(http, clean_title, artist, duration_secs),
        fetch_lrclib(http, clean_title, artist, album, duration_secs),
    );

    let mut found = Vec::new();
    if let Some(c) = mxm_res {
        found.push(c);
    }
    if let Some(c) = lrc_res {
        found.push(c);
    }

    // Sort by sync quality: word_level > line_level > plain.
    // If same quality: Musixmatch is the top leader:
    found.sort_by(|a, b| {
        let r_a = sync_rank(&a.sync_level);
        let r_b = sync_rank(&b.sync_level);
        if r_a != r_b {
            return r_b.cmp(&r_a);
        }
        let p_a = provider_priority(&a.provider);
        let p_b = provider_priority(&b.provider);
        p_b.cmp(&p_a)
    });

    if found.is_empty() {
        return LyricsMultiResponse::default();
    }

    let best = found[0].clone();
    let synced = if best.sync_level == "word_level" || best.sync_level == "line_level" {
        Some(best.content.clone())
    } else {
        None
    };
    let plain = if best.sync_level == "plain" {
        Some(best.content.clone())
    } else {
        None
    };

    let mut candidates = Vec::new();

    // 0. Vessel (Авто) meta-provider
    if include_vessel_meta {
        candidates.push(LyricsCandidate {
            provider: "Vessel".to_string(),
            sync_level: best.sync_level.clone(),
            format: best.format.clone(),
            content: best.content.clone(),
            is_meta: Some(true),
            source: Some(best.provider.clone()),
        });
    }

    // 1. Cadence candidate (server reliable source based on best resolution)
    candidates.push(LyricsCandidate {
        provider: "Cadence".to_string(),
        sync_level: best.sync_level.clone(),
        format: best.format.clone(),
        content: best.content.clone(),
        is_meta: None,
        source: Some(best.provider.clone()),
    });

    // 2. Add all discovered providers
    candidates.extend(found);

    LyricsMultiResponse {
        candidates,
        synced_lyrics: synced,
        plain_lyrics: plain,
        instrumental: Some(false),
    }
}
