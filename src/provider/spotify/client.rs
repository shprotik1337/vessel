use std::time::Duration;

use anyhow::{Context, Result, bail};
use reqwest::{
    Client,
    header::{ACCEPT, ACCEPT_LANGUAGE, AUTHORIZATION, HeaderMap, HeaderValue, USER_AGENT},
};
use serde_json::Value;
use url::Url;

use super::auth::AuthManager;

pub const WEB_URL: &str = "https://open.spotify.com";
pub const PAGE_SIZE: usize = 50;
pub const CLIENT_VERSION: &str = "1.2.87.27.ga2033a72";
pub const BROWSER_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";
pub const PATHFINDER: &str = "https://api-partner.spotify.com/pathfinder/v2/query";

pub const SEARCH_TRACKS_HASH: &str =
    "5307479c18ff24aa1bd70691fdb0e77734bede8cce3bd7d43b6ff7314f52a6b8";
pub const SEARCH_ARTISTS_HASH: &str =
    "0e6f9020a66fe15b93b3bb5c7e6484d1d8cb3775963996eaede72bac4d97e909";
pub const SEARCH_ALBUMS_HASH: &str =
    "a71d2c993fc98e1c880093738a55a38b57e69cc4ce5a8c113e6c5920f9513ee2";
pub const SEARCH_PLAYLISTS_HASH: &str =
    "fc3a690182167dbad20ac7a03f842b97be4e9737710600874cb903f30112ad58";
pub const GET_ALBUM_HASH: &str = "6a74b456cd1735c9193d9e8ec8cc5184cad7ce13572210315229db3975964361";
pub const FETCH_PLAYLIST_HASH: &str =
    "243c0ba2736f16da721e3a227004bbcdb8df6c846f198bd478172e00aa1faf42";
pub const ARTIST_OVERVIEW_HASH: &str =
    "9f8134ef565e78621f1e1793555bd6633c5ac144ae0f89604ed3ae3f80b3c8e6";
pub const ARTIST_DISCOGRAPHY_HASH: &str =
    "9380995a9d4663cbcb5113fef3c6aabf70ae6d407ba61793fd01e2a1dd6929b0";
pub const LIBRARY_TRACKS_HASH: &str =
    "1cb5df9343e3e11ecca539ee85621136f8c1226768a9b7641012c4e6a2339872";
pub const RELATED_TRACK_HASH: &str =
    "eda0a1e9140af4114340bf3098980172dfd1003b65cfc980c36ab238dbfcef84";

pub fn build_http_client(cookie: &str, proxy: Option<&str>) -> Result<Client> {
    let proxy = proxy
        .map(str::trim)
        .filter(|proxy| !proxy.is_empty())
        .map(str::to_owned);
    // Кладём sp_dc/sp_key в cookie jar, чтобы reqwest слал их автоматически
    // на все поддомены spotify.com.
    let jar = std::sync::Arc::new(reqwest::cookie::Jar::default());
    for url in [
        "https://open.spotify.com/",
        "https://accounts.spotify.com/",
        "https://api.spotify.com/",
        "https://spclient.wg.spotify.com/",
    ] {
        if let Ok(parsed) = Url::parse(url) {
            jar.add_cookie_str(&format!("{cookie}; Domain=.spotify.com; Path=/"), &parsed);
        }
    }
    let mut builder = Client::builder()
        .user_agent(BROWSER_UA)
        .cookie_provider(jar.clone())
        // Без таймаутов «Вся музыка» в карточке артиста висит вечно
        // при мёртвом соединении (прокси/сеть) — ни один запрос не
        // может висеть дольше 30с, соединение — дольше 10с.
        .connect_timeout(Duration::from_secs(10))
        .timeout(Duration::from_secs(30));
    if let Some(proxy) = proxy {
        builder = builder
            .proxy(reqwest::Proxy::all(proxy).context("не удалось разобрать прокси Spotify")?);
    }
    builder
        .build()
        .context("не удалось создать HTTP-клиент Spotify")
}

pub fn browser_headers() -> HeaderMap {
    let mut h = HeaderMap::new();
    h.insert(USER_AGENT, HeaderValue::from_static(BROWSER_UA));
    h.insert(ACCEPT, HeaderValue::from_static("*/*"));
    h.insert(ACCEPT_LANGUAGE, HeaderValue::from_static("en-US,en;q=0.9"));
    h.insert("App-Platform", HeaderValue::from_static("WebPlayer"));
    h.insert(
        "spotify-app-version",
        HeaderValue::from_static(CLIENT_VERSION),
    );
    h.insert("Sec-Fetch-Dest", HeaderValue::from_static("empty"));
    h.insert("Sec-Fetch-Mode", HeaderValue::from_static("cors"));
    h.insert("Sec-Fetch-Site", HeaderValue::from_static("same-site"));
    h.insert(
        "Sec-Ch-Ua",
        HeaderValue::from_static(
            r#""Not)A;Brand";v="99", "Google Chrome";v="138", "Chromium";v="138""#,
        ),
    );
    h.insert("Sec-Ch-Ua-Mobile", HeaderValue::from_static("?0"));
    h.insert("Sec-Ch-Ua-Platform", HeaderValue::from_static("Windows"));
    h.insert("Priority", HeaderValue::from_static("u=1, i"));
    h.insert(
        "Origin",
        HeaderValue::from_static("https://open.spotify.com"),
    );
    h.insert(
        "Referer",
        HeaderValue::from_static("https://open.spotify.com/"),
    );
    h
}

pub fn entity_id(url: &Url, kind: &str) -> Option<String> {
    url.path_segments()?
        .collect::<Vec<_>>()
        .windows(2)
        .find_map(|pair| {
            (pair[0].eq_ignore_ascii_case(kind) && !pair[1].contains('/'))
                .then(|| pair[1].to_string())
        })
}

/// Запрос к внутреннему GraphQL Pathfinder API (работает с web-player токеном).
pub async fn pathfinder(
    http: &Client,
    auth: &AuthManager,
    operation: &str,
    hash: &str,
    variables: Value,
) -> Result<Value> {
    let (token, client_token) = auth.access_token(http).await?;
    let payload = serde_json::json!({
        "operationName": operation,
        "variables": variables,
        "extensions": {
            "persistedQuery": { "version": 1, "sha256Hash": hash }
        }
    });

    let mut attempts = 0usize;
    loop {
        attempts += 1;
        let response = http
            .post(PATHFINDER)
            .headers(browser_headers())
            .header(AUTHORIZATION, format!("Bearer {token}"))
            .header("client-token", &client_token)
            .json(&payload)
            .send()
            .await
            .context("Pathfinder не ответил")?;
        let status = response.status();
        let text = response.text().await.unwrap_or_default();

        if status == reqwest::StatusCode::TOO_MANY_REQUESTS && attempts <= 3 {
            let delay_ms = 600 * (attempts as u64);
            crate::dlog!(
                "[spotify] Pathfinder 429 received for {operation}, retrying in {delay_ms}ms (attempt {attempts}/3)..."
            );
            tokio::time::sleep(Duration::from_millis(delay_ms)).await;
            continue;
        }

        if !status.is_success() {
            bail!("Pathfinder отклонил запрос ({status}): {text}")
        }
        let value: Value = serde_json::from_str(&text)
            .with_context(|| format!("Pathfinder вернул непонятный JSON: {text}"))?;
        if let Some(errors) = value.get("errors") {
            bail!("Pathfinder: {errors}")
        }
        return Ok(value);
    }
}
