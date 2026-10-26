use std::sync::Mutex;
use std::time::{Duration, Instant};

use anyhow::{Context, Result, bail};
use hmac::{Hmac, Mac};
use reqwest::{
    Client,
    header::{AUTHORIZATION, COOKIE, HeaderMap, HeaderValue},
};
use serde_json::Value;
use sha1::Sha1;
use url::Url;

use super::client::{BROWSER_UA, CLIENT_VERSION, browser_headers};

type HmacSha1 = Hmac<Sha1>;

const SESSION_TOKEN_URL: &str = "https://open.spotify.com/api/token";
const SERVER_TIME_URL: &str = "https://open.spotify.com/api/server-time";
const CLIENT_TOKEN_URL: &str = "https://clienttoken.spotify.com/v1/clienttoken";
const TOTP_SECRETS_URL: &str =
    "https://git.gay/thereallo/totp-secrets/raw/branch/main/secrets/secretDict.json";

pub struct AuthManager {
    cookie: String,
    access_token: Mutex<Option<(String, String, Instant)>>,
    totp_state: Mutex<Option<(String, Vec<u8>)>>,
}

impl AuthManager {
    pub fn new(cookie: String) -> Self {
        Self {
            cookie,
            access_token: Mutex::new(None),
            totp_state: Mutex::new(None),
        }
    }

    #[allow(dead_code)]
    pub fn cookie(&self) -> &str {
        &self.cookie
    }

    /// Получает (и кэширует) access_token через sp_dc.
    pub async fn access_token(&self, http: &Client) -> Result<(String, String)> {
        if let Some((token, client_token, fetched_at)) = self.access_token.lock().unwrap().as_ref()
            && fetched_at.elapsed() < Duration::from_secs(25 * 60)
        {
            return Ok((token.clone(), client_token.clone()));
        }
        let (token, client_token) = self.fetch_access_token(http).await?;
        *self.access_token.lock().unwrap() =
            Some((token.clone(), client_token.clone(), Instant::now()));
        Ok((token, client_token))
    }

    pub async fn fetch_access_token(&self, http: &Client) -> Result<(String, String)> {
        // Web-player токен через TOTP: даёт доступ к Pathfinder
        // (поиск/релизы/артисты) и аудио. Единственный путь — sp_dc.
        if !self.cookie.is_empty() {
            match self.fetch_access_token_totp(http).await {
                Ok(tokens) => return Ok(tokens),
                Err(error) => {
                    crate::dlog!("[spotify] TOTP token failed: {error:#}");
                }
            }
        }

        // Ничего не вышло — честная ошибка с планом действий
        bail!(
            "Spotify недоступен: cookie sp_dc отсутствует или отклонена. \
             В Настройках нажми «Подключить» и залогинься в окне Spotify"
        )
    }

    /// Web-player токен через TOTP (sp_dc cookie). Работает с Pathfinder и аудио.
    async fn fetch_access_token_totp(&self, http: &Client) -> Result<(String, String)> {
        let (totp_secret, totp_ver) = self.get_totp_state(http).await?;
        let server_time = self.get_server_time(http).await?;
        let totp = generate_totp(&totp_secret, server_time);

        let url = Url::parse_with_params(
            SESSION_TOKEN_URL,
            &[
                ("reason", "init"),
                ("productType", "web-player"),
                ("totp", &totp),
                ("totpServer", &totp),
                ("totpVer", &totp_ver),
            ],
        )?;
        let response = http
            .get(url)
            .headers(browser_headers())
            .header(COOKIE, &self.cookie)
            .send()
            .await
            .context("Spotify не ответил на запрос токена")?;
        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            bail!(
                "Spotify отклонил запрос токена ({status}): {body} — проверь, что cookie sp_dc свежая"
            );
        }
        let value: Value = response
            .json()
            .await
            .context("Spotify вернул непонятный ответ токена")?;
        let access_token = value
            .get("accessToken")
            .and_then(Value::as_str)
            .context("sp_dc не авторизован: Spotify не выдал accessToken")?
            .trim()
            .to_string();
        if access_token.is_empty() {
            bail!("sp_dc не авторизован: пустой accessToken")
        }
        let client_id = value
            .get("clientId")
            .and_then(Value::as_str)
            .unwrap_or("65b708073fc0480ea92a077233ca87bd");

        let client_token = match self.get_client_token(http, client_id).await {
            Ok(token) => token,
            Err(error) => {
                crate::dlog!("[spotify] client token недоступен: {error:#}");
                String::new()
            }
        };
        Ok((access_token, client_token))
    }

    async fn get_totp_state(&self, http: &Client) -> Result<(Vec<u8>, String)> {
        if let Some((ver, secret)) = self.totp_state.lock().unwrap().as_ref() {
            return Ok((secret.clone(), ver.clone()));
        }
        let (secret, ver) = fetch_totp_secret(http).await?;
        *self.totp_state.lock().unwrap() = Some((ver.clone(), secret.clone()));
        Ok((secret, ver))
    }

    async fn get_server_time(&self, http: &Client) -> Result<i64> {
        let response: Value = http
            .get(SERVER_TIME_URL)
            .headers(browser_headers())
            .send()
            .await
            .context("не удалось получить время сервера Spotify")?
            .error_for_status()
            .context("Spotify не дал время сервера")?
            .json()
            .await
            .context("Spotify вернул непонятное время")?;
        let seconds = response
            .get("serverTime")
            .and_then(Value::as_i64)
            .context("Spotify не вернул serverTime")?;
        // generate() ждёт миллисекунды
        Ok(seconds.saturating_mul(1000))
    }

    async fn get_client_token(&self, http: &Client, client_id: &str) -> Result<String> {
        self.get_client_token_with_auth(http, client_id, None).await
    }

    /// Версия client_token, где вместо cookie можно передать Bearer access_token.
    async fn get_client_token_with_auth(
        &self,
        http: &Client,
        client_id: &str,
        bearer: Option<&str>,
    ) -> Result<String> {
        let payload = serde_json::json!({
            "client_data": {
                "client_version": CLIENT_VERSION,
                "client_id": client_id,
                "js_sdk_data": {}
            }
        });
        let body = serde_json::to_string(&payload).context("client token json")?;
        let mut headers = client_token_headers(&self.cookie);
        if let Some(bearer) = bearer {
            headers.insert(
                AUTHORIZATION,
                HeaderValue::from_str(&format!("Bearer {bearer}"))
                    .context("client token bearer")?,
            );
        }
        let response = http
            .post(CLIENT_TOKEN_URL)
            .headers(headers)
            .body(body)
            .send()
            .await
            .context("Spotify не ответил на запрос client token")?;
        let status = response.status();
        let body_text = response.text().await.unwrap_or_default();
        if !status.is_success() || body_text.is_empty() {
            bail!("Spotify не отдал client token ({status}): {body_text}")
        }
        let value: Value = serde_json::from_str(&body_text)
            .with_context(|| format!("Spotify вернул непонятный client token: {body_text}"))?;
        value
            .pointer("/granted_token/token")
            .and_then(Value::as_str)
            .map(str::to_string)
            .context("Spotify не вернул granted_token в client token")
    }

    /// Проверяет, что sp_dc действительно авторизован.
    pub async fn probe(&self, http: &Client) -> Result<()> {
        let (token, _) = self.fetch_access_token(http).await?;
        if token.is_empty() {
            bail!("Spotify sp_dc не авторизован — проверь токен")
        }
        Ok(())
    }
}

pub fn normalize_cookie_string(value: &str) -> String {
    let value = value.trim().trim_matches(['\'', '"']).trim();
    let after_prefix = value
        .split_once(':')
        .filter(|(prefix, _)| prefix.trim().eq_ignore_ascii_case("cookie"))
        .map_or(value, |(_, rest)| rest.trim());
    let mut cookies = Vec::new();
    for part in after_prefix.split(';') {
        let part = part.trim();
        if let Some((name, val)) = part.split_once('=') {
            let name = name.trim().to_ascii_lowercase();
            if name == "sp_dc" || name == "sp_key" {
                cookies.push(format!("{name}={}", val.trim().trim_matches(['\'', '"'])));
            }
        }
    }
    if cookies.is_empty() {
        let cleaned = after_prefix.trim_matches(['\'', '"']).trim();
        if !cleaned.is_empty() {
            return format!("sp_dc={cleaned}");
        }
    }
    cookies.join("; ")
}

/// Скачивает TOTP-секреты и выбирает самую свежую версию.
pub async fn fetch_totp_secret(http: &Client) -> Result<(Vec<u8>, String)> {
    let response = http
        .get(TOTP_SECRETS_URL)
        .send()
        .await
        .context("не удалось получить TOTP-секреты Spotify")?
        .error_for_status()
        .context("TOTP-секреты Spotify недоступны")?
        .json::<Value>()
        .await
        .context("TOTP-секреты Spotify повреждены")?;
    let map = response
        .as_object()
        .context("TOTP-секреты Spotify не объект")?;
    let version = map
        .keys()
        .filter_map(|key| key.parse::<i64>().ok())
        .max()
        .context("нет TOTP-версий")?
        .to_string();
    let ciphertext = map
        .get(&version)
        .and_then(Value::as_array)
        .context("нет TOTP-секрета для свежей версии")?
        .iter()
        .filter_map(Value::as_u64)
        .map(|value| value as u8)
        .collect::<Vec<u8>>();
    let secret = derive_totp_secret(&ciphertext);
    Ok((secret, version))
}

/// Тот же derive, что в Dotify: byte ^ ((i % 33) + 9), затем ascii-байты строки.
pub fn derive_totp_secret(ciphertext: &[u8]) -> Vec<u8> {
    let mut out = String::new();
    for (i, byte) in ciphertext.iter().enumerate() {
        let value = byte ^ ((i % 33) as u8 + 9);
        out.push_str(&value.to_string());
    }
    out.into_bytes()
}

/// RFC 6238 TOTP: HMAC-SHA1, 6 цифр, период 30 секунд, counter = timestamp(мс)/1000/30.
pub fn generate_totp(secret: &[u8], timestamp_ms: i64) -> String {
    let counter = timestamp_ms / 1000 / 30;
    let counter_bytes = counter.to_be_bytes();
    let mut mac = <HmacSha1 as Mac>::new_from_slice(secret).expect("HMAC key любого размера");
    mac.update(&counter_bytes);
    let digest = mac.finalize().into_bytes();

    let offset = (digest[19] & 0x0F) as usize;
    let binary = ((digest[offset] & 0x7F) as u32) << 24
        | ((digest[offset + 1] as u32) << 16)
        | ((digest[offset + 2] as u32) << 8)
        | (digest[offset + 3] as u32);
    let code = binary % 1_000_000;
    format!("{code:06}")
}

/// Заголовки для clienttoken.spotify.com — точный набор как в Dotify.
pub fn client_token_headers(cookie: &str) -> HeaderMap {
    use reqwest::header::*;
    let mut h = HeaderMap::new();
    h.insert("accept", "application/json".parse().unwrap());
    h.insert("accept-language", "en-US".parse().unwrap());
    h.insert("content-type", "application/json".parse().unwrap());
    h.insert("origin", "https://open.spotify.com".parse().unwrap());
    h.insert("priority", "u=1, i".parse().unwrap());
    h.insert("referer", "https://open.spotify.com/".parse().unwrap());
    h.insert(
        "sec-ch-ua",
        r#""Not)A;Brand";v="99", "Google Chrome";v="138", "Chromium";v="138""#
            .parse()
            .unwrap(),
    );
    h.insert("sec-ch-ua-mobile", "?0".parse().unwrap());
    h.insert("sec-ch-ua-platform", "\"Windows\"".parse().unwrap());
    h.insert("sec-fetch-dest", "empty".parse().unwrap());
    h.insert("sec-fetch-mode", "cors".parse().unwrap());
    h.insert("sec-fetch-site", "same-site".parse().unwrap());
    h.insert(USER_AGENT, BROWSER_UA.parse().unwrap());
    h.insert("spotify-app-version", CLIENT_VERSION.parse().unwrap());
    h.insert("app-platform", "WebPlayer".parse().unwrap());
    h.insert(COOKIE, cookie.parse().unwrap());
    h
}
