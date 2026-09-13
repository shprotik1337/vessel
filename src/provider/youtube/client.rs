use anyhow::{Context, Result, bail};
use crate::vpn::ApplyVpnProxy;
use reqwest::{
    Client,
    header::{HeaderValue, CONTENT_TYPE, COOKIE, USER_AGENT},
};
use serde_json::{Value, json};
use std::sync::Mutex;

/// Состояние активного OAuth-флоу: device code + опрос.
struct OAuthPending {
    device_code: String,
    interval: u64,
    client_id: String,
    client_secret: String,
}

/// Ключ Innertube для music.youtube.com (публичный, у всех одинаковый).
const INNERTUBE_API_KEY: &str = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8";
const MUSIC_BASE: &str = "https://music.youtube.com/youtubei/v1";
const WWW_BASE: &str = "https://www.youtube.com/youtubei/v1";
const MUSIC_HOMEPAGE: &str = "https://music.youtube.com/";
const BROWSER_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

/// Версии клиентов Innertube. Постоянно обновляются у Google — держим актуальные.
const WEB_REMIX_VERSION: &str = "1.20240801.01.00";
const ANDROID_VERSION: &str = "20.10.30";

pub struct YoutubeClient {
    http: Client,
    api_key: Mutex<String>,
    /// visitorData — анонимный ID гостя, с ним поиск отдаёт результаты без логина.
    visitor_data: Mutex<String>,
    /// URL HTTP-провайдера PO token (bgutil-ytdlp-pot-provider). Если задан —
    /// полный стрим, иначе YouTube отдаёт только ~1MB preview.
    potoken_provider: Mutex<Option<String>>,
    /// Cookie залогиненного YouTube-аккаунта. С ними отдаются полные треки.
    cookie: Mutex<String>,
    /// OAuth-состояние (device code flow).
    oauth: Mutex<Option<OAuthPending>>,
    /// access_token для авторизации запросов (из OAuth).
    oauth_token: Mutex<String>,
    /// refresh_token для обновления access_token между запусками.
    oauth_refresh: Mutex<Option<String>>,
}

impl Clone for YoutubeClient {
    fn clone(&self) -> Self {
        Self {
            http: self.http.clone(),
            api_key: Mutex::new(self.api_key.lock().unwrap().clone()),
            visitor_data: Mutex::new(self.visitor_data.lock().unwrap().clone()),
            potoken_provider: Mutex::new(self.potoken_provider.lock().unwrap().clone()),
            cookie: Mutex::new(self.cookie.lock().unwrap().clone()),
            oauth: Mutex::new(None),
            oauth_token: Mutex::new(self.oauth_token.lock().unwrap().clone()),
            oauth_refresh: Mutex::new(self.oauth_refresh.lock().unwrap().clone()),
        }
    }
}

impl YoutubeClient {
    pub fn new() -> Result<Self> {
        let http = Client::builder()
            .apply_vpn_proxy()
            .user_agent(BROWSER_UA)
            .build()
            .context("не удалось создать HTTP-клиент YouTube")?;
        Ok(Self {
            http,
            api_key: Mutex::new(INNERTUBE_API_KEY.to_string()),
            visitor_data: Mutex::new(String::new()),
            potoken_provider: Mutex::new(None),
            cookie: Mutex::new(String::new()),
            oauth: Mutex::new(None),
            oauth_token: Mutex::new(String::new()),
            oauth_refresh: Mutex::new(None),
        })
    }

    /// Задаёт OAuth refresh_token — тогда access_token берётся через него
    /// (для использования после перезапуска приложения).
    pub fn set_oauth_refresh(&self, refresh: Option<String>) {
        *self.oauth_refresh.lock().unwrap() = refresh
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty());
    }

    /// Задаёт cookie залогиненного YouTube-аккаунта.
    pub fn set_cookie(&self, cookie: Option<String>) {
        *self.cookie.lock().unwrap() = cookie
            .map(|value| value.trim().to_string())
            .filter(|value| !value.is_empty())
            .unwrap_or_default();
    }

    /// Текущий cookie-строку (для Kopuz-пути резолва стрима).
    pub fn cookie_value(&self) -> String {
        self.cookie.lock().unwrap().clone()
    }

    /// Задаёт URL potoken-провайдера. Полный стрим возможен только с ним.
    pub fn set_potoken_provider(&self, url: Option<String>) {
        *self.potoken_provider.lock().unwrap() = url
            .map(|value| value.trim().trim_end_matches('/').to_string())
            .filter(|value| !value.is_empty());
    }

    /// OAuth: начало device code flow. Возвращает user_code и открывает браузер.
    /// После вызова жди oauth_complete().
    pub async fn oauth_begin(&self) -> Result<(String, String)> {
        let yttv = self.http
            .get("https://www.youtube.com/tv")
            .header(USER_AGENT, HeaderValue::from_static("Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version"))
            .header("Accept-Language", HeaderValue::from_static("en-US"))
            .send().await
            .context("TV страница не ответила")?
            .text().await
            .context("TV страница повреждена")?;

        // Извлекаем client_id из base.js скрипта
        let script_url = yttv.split("base-js").nth(1)
            .and_then(|s| s.split("src=\"").nth(1))
            .and_then(|s| s.split('"').next())
            .map(|s| format!("https://www.youtube.com{s}"))
            .context("не найден base-js URL")?;
        let script = self.http.get(&script_url)
            .header(USER_AGENT, HeaderValue::from_static(BROWSER_UA))
            .send().await
            .context("base.js не загрузился")?
            .text().await?;
        let client_id = script.split("clientId:\"").nth(1)
            .and_then(|s| s.split('"').next())
            .context("clientId не найден в base.js")?
            .to_string();
        let client_secret = script.split("clientId:\"").nth(1)
            .and_then(|s| s.split("\",\"").nth(1))
            .and_then(|s| s.split('"').next())
            .unwrap_or("")
            .to_string();

        // Device code
        let dev = self.http.post("https://www.youtube.com/o/oauth2/device/code")
            .json(&json!({
                "client_id": client_id,
                "scope": "http://gdata.youtube.com https://www.googleapis.com/auth/youtube-paid-content",
                "device_id": format!("ytlr_{}", uuid::Uuid::new_v4()),
                "device_model": "ytlr::"
            }))
            .send().await
            .context("device/code не ответил")?
            .error_for_status()
            .context("device/code отклонил")?
            .json::<Value>().await?;
        let user_code = dev.get("user_code").and_then(Value::as_str).context("нет user_code")?.to_string();
        let verification_url = dev.get("verification_url").and_then(Value::as_str).context("нет verification_url")?.to_string();
        let device_code = dev.get("device_code").and_then(Value::as_str).context("нет device_code")?.to_string();
        let interval = dev.get("interval").and_then(Value::as_u64).unwrap_or(5);

        *self.oauth.lock().unwrap() = Some(OAuthPending {
            device_code,
            interval,
            client_id,
            client_secret,
        });
        // Открываем страницу активации с кодом
        let _ = open::that(format!(
            "https://www.youtube.com/activate?code={user_code}"
        ));
        Ok((user_code, verification_url))
    }

    /// OAuth: ожидает подтверждения и возвращает refresh_token.
    pub async fn oauth_complete(&self) -> Result<String> {
        let pending = self.oauth.lock().unwrap().take()
            .context("OAuth не был начат — вызови oauth_begin сначала")?;
        let deadline = tokio::time::Instant::now() + tokio::time::Duration::from_secs(600);
        loop {
            if tokio::time::Instant::now() >= deadline {
                bail!("OAuth-подтверждение не получено за 10 минут")
            }
            tokio::time::sleep(tokio::time::Duration::from_secs(pending.interval)).await;
            let resp = self.http.post("https://www.youtube.com/o/oauth2/token")
                .json(&json!({
                    "client_id": pending.client_id,
                    "client_secret": pending.client_secret,
                    "code": pending.device_code,
                    "grant_type": "http://oauth.net/grant_type/device/1.0"
                }))
                .send().await
                .context("token endpoint не ответил")?;
            let value: Value = resp.json().await?;
            if let Some(err) = value.get("error").and_then(Value::as_str) {
                match err {
                    "authorization_pending" | "slow_down" => continue,
                    _ => bail!("OAuth: {err}"),
                }
            }
            let refresh = value.get("refresh_token").and_then(Value::as_str)
                .context("нет refresh_token")?.to_string();
            let access = value.get("access_token").and_then(Value::as_str).unwrap_or("").to_string();
            if !access.is_empty() {
                *self.oauth_token.lock().unwrap() = access;
            }
            return Ok(refresh);
        }
    }

    /// Обновляет access_token из сохранённого refresh_token.
    async fn refresh_access_token(&self) -> Result<()> {
        let refresh = self.oauth_refresh.lock().unwrap().clone()
            .context("нет refresh_token для обновления")?;
        let yttv = self.http
            .get("https://www.youtube.com/tv")
            .header(USER_AGENT, HeaderValue::from_static("Mozilla/5.0 (ChromiumStylePlatform) Cobalt/Version"))
            .header("Accept-Language", HeaderValue::from_static("en-US"))
            .send().await
            .context("TV страница не ответила при refresh")?
            .text().await
            .context("TV страница повреждена при refresh")?;
        let script_url = yttv.split("base-js").nth(1)
            .and_then(|s| s.split("src=\"").nth(1))
            .and_then(|s| s.split('"').next())
            .map(|s| format!("https://www.youtube.com{s}"))
            .context("не найден base-js URL при refresh")?;
        let script = self.http.get(&script_url)
            .header(USER_AGENT, HeaderValue::from_static(BROWSER_UA))
            .send().await
            .context("base.js не загрузился при refresh")?
            .text().await?;
        let client_id = script.split("clientId:\"").nth(1)
            .and_then(|s| s.split('"').next())
            .context("clientId не найден при refresh")?
            .to_string();
        let client_secret = script.split("clientId:\"").nth(1)
            .and_then(|s| s.split("\",\"").nth(1))
            .and_then(|s| s.split('"').next())
            .unwrap_or("")
            .to_string();
        let resp = self.http.post("https://www.youtube.com/o/oauth2/token")
            .json(&json!({
                "client_id": client_id,
                "client_secret": client_secret,
                "refresh_token": refresh,
                "grant_type": "refresh_token"
            }))
            .send().await
            .context("refresh token endpoint не ответил")?
            .error_for_status()
            .context("refresh token endpoint отклонил")?
            .json::<Value>().await?;
        let access = resp.get("access_token").and_then(Value::as_str)
            .context("нет access_token в ответе refresh")?.to_string();
        *self.oauth_token.lock().unwrap() = access;
        Ok(())
    }

    /// Получает visitorData при первом запросе.
    async fn ensure_visitor_data(&self) {
        if self.visitor_data.lock().unwrap().is_empty() {
            if let Ok(visitor_data) = self.fetch_visitor_data().await {
                *self.visitor_data.lock().unwrap() = visitor_data;
            }
        }
    }

    /// Достаёт visitorData и API-ключ из ytcfg на главной странице.
    async fn fetch_visitor_data(&self) -> Result<String> {
        let response = self
            .http
            .get(MUSIC_HOMEPAGE)
            .header(USER_AGENT, HeaderValue::from_static(BROWSER_UA))
            .send()
            .await
            .context("YouTube Music не ответил")?;
        let text = response
            .text()
            .await
            .context("не удалось прочитать страницу YouTube Music")?;

        let api_key = extract_config(&text, "INNERTUBE_API_KEY");
        if let Some(key) = api_key {
            *self.api_key.lock().unwrap() = key;
        }
        extract_config(&text, "INNERTUBE_CONTEXT_CLIENT_VISITOR_DATA")
            .or_else(|| extract_config(&text, "VISITOR_DATA"))
            .context("YouTube Music не отдал visitorData")
    }

    /// Контекст клиента для music.youtube.com (WEB_REMIX).
    fn web_remix_context(&self) -> Value {
        let mut client = json!({
            "clientName": "WEB_REMIX",
            "clientVersion": WEB_REMIX_VERSION,
            "hl": "en",
            "gl": "US",
            "utcOffsetMinutes": 0,
        });
        let visitor_data = self.visitor_data.lock().unwrap().clone();
        if !visitor_data.is_empty() {
            client["visitorData"] = Value::String(visitor_data);
        }
        json!({ "context": { "client": client } })
    }

    /// Контекст ANDROID-клиента — часто отдаёт стримы без PO token.
    fn android_context(&self) -> Value {
        let mut client = json!({
            "clientName": "ANDROID",
            "clientVersion": ANDROID_VERSION,
            "androidSdkVersion": 30,
            "hl": "en",
            "gl": "US",
            "osName": "Android",
            "osVersion": "14",
            "deviceModel": "Pixel 8",
        });
        let visitor_data = self.visitor_data.lock().unwrap().clone();
        if !visitor_data.is_empty() {
            client["visitorData"] = Value::String(visitor_data);
        }
        json!({ "context": { "client": client } })
    }

    /// POST в youtubei/v1/{endpoint}. Возвращает сырой JSON.
    async fn call(&self, base: &str, endpoint: &str, body: Value) -> Result<Value> {
        // Если есть сохранённый refresh_token, но нет access — обновляем
        if self.oauth_token.lock().unwrap().is_empty()
            && self.oauth_refresh.lock().unwrap().is_some()
        {
            self.refresh_access_token().await.ok();
        }
        let api_key = self.api_key.lock().unwrap().clone();
        let url = format!("{base}/{endpoint}?key={api_key}");
        let mut request = self
            .http
            .post(&url)
            .header(CONTENT_TYPE, HeaderValue::from_static("application/json"))
            .header(USER_AGENT, HeaderValue::from_static(BROWSER_UA));
        let cookie = self.cookie.lock().unwrap().clone();
        if !cookie.is_empty() {
            request = request.header(
                COOKIE,
                HeaderValue::from_str(&cookie).context("повреждённая cookie YouTube")?,
            );
        }
        let oauth_token = self.oauth_token.lock().unwrap().clone();
        if !oauth_token.is_empty() {
            request = request.header(
                reqwest::header::AUTHORIZATION,
                HeaderValue::from_str(&format!("Bearer {oauth_token}"))
                    .context("повреждённый OAuth-токен YouTube")?,
            );
        }
        let response = request
            .json(&body)
            .send()
            .await
            .context("Innertube не ответил")?;
        if !response.status().is_success() {
            let status = response.status();
            let text = response.text().await.unwrap_or_default();
            bail!("Innertube отклонил запрос ({status}): {text}")
        }
        let value: Value = response
            .json()
            .await
            .context("Innertube вернул непонятный JSON")?;
        if let Some(error) = value.get("error") {
            bail!("Innertube: {error}")
        }
        Ok(value)
    }

    /// Поиск по музыке. Возвращает сырой ответ youtubei/v1/search.
    pub async fn search(&self, query: &str, params: Option<&str>) -> Result<Value> {
        self.ensure_visitor_data().await;
        let mut body = self.web_remix_context();
        body["query"] = Value::String(query.to_string());
        if let Some(params) = params {
            body["params"] = Value::String(params.to_string());
        }
        self.call(MUSIC_BASE, "search", body).await
    }

    /// Данные плейлиста/альбома/артиста через browse.
    pub async fn browse(&self, browse_id: &str, params: Option<&str>) -> Result<Value> {
        self.ensure_visitor_data().await;
        let mut body = self.web_remix_context();
        body["browseId"] = Value::String(browse_id.to_string());
        if let Some(params) = params {
            body["params"] = Value::String(params.to_string());
        }
        self.call(MUSIC_BASE, "browse", body).await
    }

    /// Поток видео. Пробуем ANDROID (без PO token), затем WEB_REMIX.
    /// Возвращает объект player response (playabilityStatus + streamingData).
    /// Если задан potoken-провайдер — подставляет pot= в URL форматов.
    pub async fn player(&self, video_id: &str) -> Result<Value> {
        self.ensure_visitor_data().await;
        let mut body = self.android_context();
        body["videoId"] = Value::String(video_id.to_string());
        let android = self.call(WWW_BASE, "player", body.clone()).await?;
        let mut result = if player_has_audio(&android) {
            android
        } else {
            // ANDROID не дал стримы — пробуем WEB_REMIX
            let mut body = self.web_remix_context();
            body["videoId"] = Value::String(video_id.to_string());
            self.call(MUSIC_BASE, "player", body).await?
        };
        // potoken-провайдер: подставляем pot= в URL всех форматов
        if let Some(token) = self.fetch_po_token(video_id).await {
            if let Some(formats) = result.pointer_mut("/streamingData/adaptiveFormats") {
                if let Some(items) = formats.as_array_mut() {
                    for item in items {
                        if let Some(url_val) = item.get_mut("url") {
                            if let Some(url_str) = url_val.as_str() {
                                *url_val = Value::String(format!("{url_str}&pot={token}"));
                            }
                        }
                    }
                }
            }
            if let Some(url_val) = result
                .pointer_mut("/streamingData/hlsManifestUrl")
            {
                if let Some(url_str) = url_val.as_str() {
                    *url_val = Value::String(format!("{url_str}&pot={token}"));
                }
            }
        }
        Ok(result)
    }

    /// Получает PO token у провайдера (bgutil-совместимый HTTP API).
    /// Возвращает None, если провайдер не настроен или недоступен.
    /// crate-видимость: player.rs использует как первичный источник POT
    /// (стабильнее локального BotGuard-mint на серверных IP).
    pub(crate) async fn fetch_po_token(&self, video_id: &str) -> Option<String> {
        let provider = self.potoken_provider.lock().unwrap().clone()?;
        let url = format!("{provider}/get_pot");
        let response = self
            .http
            .post(&url)
            .header(CONTENT_TYPE, HeaderValue::from_static("application/json"))
            .header(USER_AGENT, HeaderValue::from_static(BROWSER_UA))
            .json(&json!({ "content_binding": video_id }))
            .send()
            .await
            .ok()?;
        if !response.status().is_success() {
            crate::dlog!("[youtube] potoken provider HTTP {}", response.status());
            return None;
        }
        let value: Value = response.json().await.ok()?;
        let token = value
            .get("poToken")
            .and_then(Value::as_str)
            .map(str::to_string)
            .filter(|token| !token.is_empty())?;
        Some(token)
    }

    /// Следующие треки (watch-next) для похожих/волны.
    pub async fn next(&self, video_id: &str) -> Result<Value> {
        self.ensure_visitor_data().await;
        let mut body = self.web_remix_context();
        body["videoId"] = Value::String(video_id.to_string());
        self.call(MUSIC_BASE, "next", body).await
    }

    pub fn http(&self) -> &Client {
        &self.http
    }
}

/// Достаёт значение из ytcfg-объекта в HTML: `"KEY": "value"`.
fn extract_config(html: &str, key: &str) -> Option<String> {
    let needle = format!("\"{key}\":");
    let idx = html.find(&needle)?;
    let rest = &html[idx + needle.len()..];
    let rest = rest.trim_start();
    // значение может быть строкой, числом или массивом — берём до запятой/скобки
    let value = rest
        .chars()
        .take_while(|ch| *ch != ',' && *ch != '}' && *ch != '\n')
        .collect::<String>()
        .trim()
        .trim_matches('"')
        .to_string();
    (!value.is_empty()).then_some(value)
}

/// Есть ли в player-ответе пригодный аудио-стрим.
fn player_has_audio(value: &Value) -> bool {
    let status = value
        .pointer("/playabilityStatus/status")
        .and_then(Value::as_str)
        .unwrap_or("");
    if status != "OK" {
        return false;
    }
    let formats = value.pointer("/streamingData/adaptiveFormats");
    match formats {
        Some(Value::Array(items)) => items.iter().any(|item| {
            item.get("mimeType")
                .and_then(Value::as_str)
                .is_some_and(|mime| mime.starts_with("audio/"))
        }),
        _ => false,
    }
}
