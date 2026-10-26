use std::sync::Arc;

use anyhow::{Context, Result, bail};
use reqwest::{
    Client,
    cookie::Jar,
    header::{ACCEPT, ACCEPT_LANGUAGE, HeaderMap, HeaderValue, USER_AGENT},
};
use serde_json::Value;
use url::Url;

use super::auth::{
    gateway_has_error, gateway_has_invalid_token, normalize_auth_token, setup_cookie_jar,
};

pub const API: &str = "https://api.deezer.com";
pub const PAGE_SIZE: usize = 50;
pub const GATEWAY: &str = "https://www.deezer.com/ajax/gw-light.php";
pub const MEDIA: &str = "https://media.deezer.com/v1/get_url";
pub const BROWSER_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36";

pub fn build_http_client(value: Option<&str>) -> Result<Client> {
    let auth_token = value.map(normalize_auth_token).unwrap_or_default();
    let jar = Arc::new(Jar::default());
    setup_cookie_jar(&jar, &auth_token)?;
    Client::builder()
        .cookie_provider(jar)
        .user_agent(BROWSER_UA)
        .connect_timeout(std::time::Duration::from_secs(10))
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .context("не удалось создать HTTP-клиент Deezer")
}

pub fn deezer_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(USER_AGENT, HeaderValue::from_static(BROWSER_UA));
    headers.insert(
        ACCEPT,
        HeaderValue::from_static("application/json, text/plain, */*"),
    );
    headers.insert(
        ACCEPT_LANGUAGE,
        HeaderValue::from_static("en-US,en;q=0.9,ru;q=0.8"),
    );
    headers
}

pub fn entity_id(url: &Url, kind: &str) -> Option<String> {
    let segments = url.path_segments()?.collect::<Vec<_>>();
    segments.windows(2).find_map(|pair| {
        (pair[0].eq_ignore_ascii_case(kind) && pair[1].chars().all(|ch| ch.is_ascii_digit()))
            .then(|| pair[1].to_string())
    })
}

pub async fn api_get<T: serde::de::DeserializeOwned>(http: &Client, url: Url) -> Result<T> {
    let mut attempts = 0;
    loop {
        attempts += 1;
        let response = http
            .get(url.clone())
            .headers(deezer_headers())
            .send()
            .await
            .context("Deezer не ответил")?;
        let status = response.status();
        if (status == reqwest::StatusCode::FORBIDDEN
            || status == reqwest::StatusCode::TOO_MANY_REQUESTS)
            && attempts <= 4
        {
            let delay = std::time::Duration::from_millis(500 * (1 << attempts));
            tokio::time::sleep(delay).await;
            continue;
        }
        let response = response
            .error_for_status()
            .context("Deezer отклонил запрос")?;
        let text = response
            .text()
            .await
            .context("не удалось прочитать ответ Deezer")?;

        if text.starts_with("{\"error\"") {
            if let Ok(err_val) = serde_json::from_str::<Value>(&text) {
                if let Some(err_obj) = err_val.get("error").and_then(Value::as_object) {
                    let code = err_obj.get("code").and_then(Value::as_u64).unwrap_or(0);
                    if (code == 4 || code == 429) && attempts <= 4 {
                        let delay = std::time::Duration::from_millis(500 * (1 << attempts));
                        tokio::time::sleep(delay).await;
                        continue;
                    }
                    let msg = err_obj
                        .get("message")
                        .and_then(Value::as_str)
                        .unwrap_or("неизвестная ошибка");
                    bail!("Deezer API error ({code}): {msg}");
                }
            }
        }

        return serde_json::from_str::<T>(&text).context("Deezer вернул непонятный JSON");
    }
}

pub async fn gateway(http: &Client, method: &str, token: &str, params: Value) -> Result<Value> {
    let mut url = Url::parse(GATEWAY)?;
    url.query_pairs_mut()
        .append_pair("api_version", "1.0")
        .append_pair("api_token", if token.is_empty() { "null" } else { token })
        .append_pair("input", "3")
        .append_pair("method", method);
    let mut attempts = 0;
    loop {
        attempts += 1;
        let response = http
            .post(url.clone())
            .headers(deezer_headers())
            .json(&params)
            .send()
            .await
            .context("Deezer gateway не ответил")?;
        let status = response.status();
        if (status == reqwest::StatusCode::FORBIDDEN
            || status == reqwest::StatusCode::TOO_MANY_REQUESTS)
            && attempts <= 3
        {
            let delay = std::time::Duration::from_millis(400 * (1 << attempts));
            tokio::time::sleep(delay).await;
            continue;
        }
        let payload = response
            .error_for_status()
            .context("Deezer gateway отклонил запрос")?
            .json::<Value>()
            .await
            .context("Deezer gateway вернул непонятный JSON")?;
        if payload.get("error").is_some_and(gateway_has_error)
            && !gateway_has_invalid_token(&payload)
        {
            bail!("Deezer gateway: {}", payload["error"])
        }
        return Ok(payload);
    }
}
