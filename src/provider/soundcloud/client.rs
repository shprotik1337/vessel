use anyhow::{Context, Result};
use reqwest::{Client, ClientBuilder};
use serde::de::DeserializeOwned;
use url::Url;

use std::sync::Arc;
use tokio::sync::RwLock;

#[derive(Clone)]
pub(super) struct SoundCloudClient {
    http: Client,
    client_id: Arc<RwLock<String>>,
    oauth_token: Option<String>,
    api_v2: Url,
}

impl SoundCloudClient {
    pub(super) fn new(client_id: String, oauth_token: Option<String>) -> Result<Self> {
        Self::from_parts(
            client_id,
            oauth_token,
            Url::parse("https://api-v2.soundcloud.com/")?,
            build_http(Client::builder())?,
        )
    }

    #[cfg(test)]
    pub(super) fn with_base(client_id: String, api_v2: Url) -> Result<Self> {
        // Пул увидел полуживой мок-сокет и решил устроить лотерею, в тестах этот балаган закрыт
        let http = build_http(Client::builder().pool_max_idle_per_host(0))?;
        Self::from_parts(client_id, None, api_v2, http)
    }

    fn from_parts(
        client_id: String,
        oauth_token: Option<String>,
        api_v2: Url,
        http: Client,
    ) -> Result<Self> {
        Ok(Self {
            http,
            client_id: Arc::new(RwLock::new(client_id)),
            oauth_token,
            api_v2,
        })
    }

    pub(super) fn has_oauth(&self) -> bool {
        self.oauth_token
            .as_ref()
            .is_some_and(|t| !t.trim().is_empty())
    }

    pub(super) fn v2_url(&self, path: &[&str]) -> Result<Url> {
        append_path(self.api_v2.clone(), path)
    }

    async fn effective_client_id(&self, force_refresh: bool) -> Result<String> {
        static CACHED_ID: tokio::sync::Mutex<Option<String>> = tokio::sync::Mutex::const_new(None);
        if !force_refresh {
            let current = self.client_id.read().await;
            if !current.trim().is_empty() {
                return Ok(current.clone());
            }
            drop(current);
            let guard = CACHED_ID.lock().await;
            if let Some(id) = guard.as_ref() {
                return Ok(id.clone());
            }
        }
        let discovered = super::discover::discover_client_id().await?;
        {
            let mut guard = CACHED_ID.lock().await;
            *guard = Some(discovered.clone());
        }
        {
            let mut current = self.client_id.write().await;
            *current = discovered.clone();
        }
        Ok(discovered)
    }

    pub(super) async fn get_json<T>(&self, url: Url, query: &[(&str, String)]) -> Result<T>
    where
        T: DeserializeOwned,
    {
        let mut client_id = self.effective_client_id(false).await?;
        const MAX_ATTEMPTS: usize = 3;

        for attempt in 0..MAX_ATTEMPTS {
            let mut req = self
                .http
                .get(url.clone())
                .header(reqwest::header::REFERER, "https://soundcloud.com/")
                .header(reqwest::header::ORIGIN, "https://soundcloud.com")
                .query(query)
                .query(&[("client_id", client_id.as_str())]);

            if let Some(token) = &self.oauth_token {
                let auth_header = if token.to_ascii_lowercase().starts_with("oauth ") {
                    token.clone()
                } else {
                    format!("OAuth {token}")
                };
                req = req.header(reqwest::header::AUTHORIZATION, auth_header);
            }

            let resp = match req.send().await {
                Ok(r) => r,
                Err(err) => {
                    if attempt + 1 < MAX_ATTEMPTS {
                        crate::dlog!(
                            "[SoundCloud] сетевая ошибка: {}, попытка {}/{}...",
                            err,
                            attempt + 1,
                            MAX_ATTEMPTS
                        );
                        tokio::time::sleep(std::time::Duration::from_millis(
                            300 * (attempt as u64 + 1),
                        ))
                        .await;
                        continue;
                    }
                    return Err(err).context("SoundCloud не ответил");
                }
            };

            let status = resp.status();
            if status == reqwest::StatusCode::UNAUTHORIZED
                || status == reqwest::StatusCode::FORBIDDEN
            {
                // Протухший или невалидный ключ — форсированно сканируем новый
                crate::dlog!(
                    "[SoundCloud] client_id вернул {}, попытка {}/{}, обновляем ключ...",
                    status,
                    attempt + 1,
                    MAX_ATTEMPTS
                );
                if attempt + 1 < MAX_ATTEMPTS {
                    if let Ok(new_id) = self.effective_client_id(true).await {
                        client_id = new_id;
                    }
                    tokio::time::sleep(std::time::Duration::from_millis(250)).await;
                    continue;
                }
            } else if status.is_server_error() {
                // 500, 502, 503, 504 от api-v2.soundcloud.com
                crate::dlog!(
                    "[SoundCloud] серверная ошибка {} ({}), попытка {}/{}...",
                    status,
                    url,
                    attempt + 1,
                    MAX_ATTEMPTS
                );
                if attempt + 1 < MAX_ATTEMPTS {
                    if attempt > 0 {
                        if let Ok(new_id) = self.effective_client_id(true).await {
                            client_id = new_id;
                        }
                    }
                    tokio::time::sleep(std::time::Duration::from_millis(
                        350 * (attempt as u64 + 1),
                    ))
                    .await;
                    continue;
                }
            }

            let response = resp
                .error_for_status()
                .context("SoundCloud отклонил запрос")?;
            return response
                .json()
                .await
                .context("SoundCloud вернул непонятный JSON");
        }

        anyhow::bail!("SoundCloud: превышено число попыток запроса")
    }
}

pub(super) const SOUNDCLOUD_BROWSER_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

pub(super) fn build_http(builder: ClientBuilder) -> Result<Client> {
    builder
        .user_agent(SOUNDCLOUD_BROWSER_UA)
        .build()
        .context("не удалось создать HTTP-клиент SoundCloud")
}

fn append_path(mut base: Url, path: &[&str]) -> Result<Url> {
    base.path_segments_mut()
        .map_err(|_| anyhow::anyhow!("адрес SoundCloud нельзя изменить"))?
        .extend(path);
    Ok(base)
}
