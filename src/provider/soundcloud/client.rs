use anyhow::{Context, Result};
use reqwest::{Client, ClientBuilder};
use serde::de::DeserializeOwned;
use url::Url;

#[derive(Clone)]
pub(super) struct SoundCloudClient {
    http: Client,
    client_id: String,
    api_v2: Url,
}

impl SoundCloudClient {
    pub(super) fn new(client_id: String) -> Result<Self> {
        Self::from_parts(
            client_id,
            Url::parse("https://api-v2.soundcloud.com/")?,
            build_http(Client::builder())?,
        )
    }

    #[cfg(test)]
    pub(super) fn with_base(client_id: String, api_v2: Url) -> Result<Self> {
        // Пул увидел полуживой мок-сокет и решил устроить лотерею, в тестах этот балаган закрыт
        let http = build_http(Client::builder().pool_max_idle_per_host(0))?;
        Self::from_parts(client_id, api_v2, http)
    }

    fn from_parts(client_id: String, api_v2: Url, http: Client) -> Result<Self> {
        Ok(Self {
            http,
            client_id,
            api_v2,
        })
    }

    pub(super) fn v2_url(&self, path: &[&str]) -> Result<Url> {
        append_path(self.api_v2.clone(), path)
    }

    async fn effective_client_id(&self, force_refresh: bool) -> Result<String> {
        static CACHED_ID: tokio::sync::Mutex<Option<String>> = tokio::sync::Mutex::const_new(None);
        if !self.client_id.trim().is_empty() && !force_refresh {
            return Ok(self.client_id.clone());
        }
        let mut guard = CACHED_ID.lock().await;
        if !force_refresh && let Some(id) = guard.as_ref() {
            return Ok(id.clone());
        }
        let discovered = super::discover::discover_client_id().await?;
        *guard = Some(discovered.clone());
        Ok(discovered)
    }

    pub(super) async fn get_json<T>(&self, url: Url, query: &[(&str, String)]) -> Result<T>
    where
        T: DeserializeOwned,
    {
        let mut client_id = self.effective_client_id(false).await?;
        let resp = self
            .http
            .get(url.clone())
            .query(query)
            .query(&[("client_id", client_id.as_str())])
            .send()
            .await
            .context("SoundCloud не ответил")?;

        let resp = if resp.status() == reqwest::StatusCode::UNAUTHORIZED
            || resp.status() == reqwest::StatusCode::FORBIDDEN
        {
            // Протухший или невалидный ключ — форсированно сканируем новый
            crate::dlog!("[SoundCloud] client_id вернул {}, пробуем обновить...", resp.status());
            client_id = self.effective_client_id(true).await?;
            self.http
                .get(url)
                .query(query)
                .query(&[("client_id", client_id.as_str())])
                .send()
                .await
                .context("SoundCloud не ответил при повторном запросе")?
        } else {
            resp
        };

        let response = resp
            .error_for_status()
            .context("SoundCloud отклонил запрос")?;
        response
            .json()
            .await
            .context("SoundCloud вернул непонятный JSON")
    }
}

pub(super) const SOUNDCLOUD_BROWSER_UA: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

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
