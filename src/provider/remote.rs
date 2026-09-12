//! Vessel Server как провайдер: `ServerClient` (HTTP-транспорт `/api/v1`) и
//! `ServerProvider` — реализация `MusicProvider` поверх удалённого сервера.
//!
//! Ключевой приём: сервер использует те же реализации провайдеров, что и
//! локальный режим, поэтому нормализованные DTO (`TrackRef`, `SearchPage`,
//! `PlaybackSource`…) идентичны и клиентский код не различает источник.

use std::time::Duration;

use anyhow::{Context, Result, anyhow, bail};
use async_trait::async_trait;
use serde::de::DeserializeOwned;
use url::Url;

use crate::model::{PlaybackSource, ProviderKind, TrackRef};
use crate::protocol::{
    API_PREFIX, CollectionsResponse, ImportPlaylistRequest, ImportedPlaylistResponse,
    LikedRequest, PageResponse, ProfileResponse, RelatedRequest, ResolveSourceRequest,
    ResolveSourceResponse, ServerInfo, TracksResponse, collection_segment, kind_segment,
};
use crate::provider::{
    ArtistProfile, CollectionItem, CollectionKind, ImportedPlaylist, MusicProvider, SearchPage,
};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);
const CONNECT_TIMEOUT: Duration = Duration::from_secs(10);

/// HTTP-клиент одного экземпляра Vessel Server. Потокобезопасен, клонируется
/// дешёво (Arc внутри reqwest).
#[derive(Clone, Debug)]
pub struct ServerClient {
    base: String,
    token: String,
    http: reqwest::Client,
}

impl ServerClient {
    pub fn new(base: &str, token: &str) -> Result<Self> {
        let base = base.trim().trim_end_matches('/').to_string();
        let probe = Url::parse(&format!("{base}{API_PREFIX}/health")).context("некорректный адрес Vessel Server")?;
        let _ = probe;
        let http = reqwest::Client::builder()
            .user_agent(concat!("vessel/", env!("CARGO_PKG_VERSION")))
            .connect_timeout(CONNECT_TIMEOUT)
            .build()
            .context("не удалось создать HTTP-клиент Vessel Server")?;
        Ok(Self { base, token: token.trim().to_string(), http })
    }

    pub fn base_url(&self) -> &str {
        &self.base
    }

    fn endpoint(&self, path: &str) -> String {
        format!("{}{API_PREFIX}{path}", self.base)
    }

    async fn send(&self, request: reqwest::RequestBuilder) -> Result<reqwest::Response> {
        let response = request
            .header(reqwest::header::AUTHORIZATION, format!("Bearer {}", self.token))
            .send()
            .await
            .map_err(|error| anyhow!("Vessel Server недоступен: {error}"))?;
        Ok(response)
    }

    async fn get_json<T: DeserializeOwned>(&self, path: &str, query: &[(&str, String)]) -> Result<T> {
        let request = self.http.get(self.endpoint(path)).timeout(REQUEST_TIMEOUT);
        let request = query
            .iter()
            .fold(request, |acc, (key, value)| acc.query(&[(*key, &**value)]));
        let response = self.send(request).await?;
        Self::decode(response, path).await
    }

    async fn post_json<B: serde::Serialize, T: DeserializeOwned>(&self, path: &str, body: &B) -> Result<T> {
        let response = self
            .send(self.http.post(self.endpoint(path)).json(body).timeout(REQUEST_TIMEOUT))
            .await?;
        Self::decode(response, path).await
    }

    async fn decode<T: DeserializeOwned>(response: reqwest::Response, path: &str) -> Result<T> {
        let status = response.status();
        if !status.is_success() {
            let detail = response
                .text()
                .await
                .unwrap_or_default()
                .lines()
                .next()
                .unwrap_or("")
                .to_string();
            bail!("Vessel Server [{status}] {path}: {}", detail.trim());
        }
        response
            .json::<T>()
            .await
            .with_context(|| format!("Vessel Server вернул неожиданный ответ для {path}"))
    }

    pub async fn info(&self) -> Result<ServerInfo> {
        let response = self
            .http
            .get(self.endpoint("/capabilities"))
            .timeout(REQUEST_TIMEOUT)
            .send()
            .await
            .map_err(|error| anyhow!("Vessel Server недоступен: {error}"))?;
        Self::decode(response, "/capabilities").await
    }

    pub async fn search(
        &self,
        provider: ProviderKind,
        query: &str,
        cursor: Option<&str>,
    ) -> Result<SearchPage> {
        let mut pairs = vec![("q", query.to_string())];
        if let Some(cursor) = cursor {
            pairs.push(("cursor", cursor.to_string()));
        }
        let path = format!("/providers/{}/search", kind_segment(provider));
        let response: PageResponse =
            self.get_json(&path, &pairs.iter().map(|(k, v)| (*k, v.clone())).collect::<Vec<_>>())
                .await?;
        Ok(response.page)
    }

    pub async fn search_collections(
        &self,
        provider: ProviderKind,
        query: &str,
        kind: CollectionKind,
    ) -> Result<Vec<CollectionItem>> {
        let path = format!("/providers/{}/collections", kind_segment(provider));
        let response: CollectionsResponse = self
            .get_json(
                &path,
                &[("q", query.to_string()), ("type", collection_segment(kind).to_string())],
            )
            .await?;
        Ok(response.items)
    }

    pub async fn artist_profile(&self, provider: ProviderKind, id: &str) -> Result<ArtistProfile> {
        let path = format!("/providers/{}/artists/{}", kind_segment(provider), urlencoding(id));
        let response: ProfileResponse = self.get_json(&path, &[]).await?;
        Ok(response.profile)
    }

    pub async fn artist_all_tracks(&self, provider: ProviderKind, id: &str) -> Result<Vec<TrackRef>> {
        let path = format!("/providers/{}/artists/{}/tracks", kind_segment(provider), urlencoding(id));
        let response: TracksResponse = self.get_json(&path, &[]).await?;
        Ok(response.tracks)
    }

    pub async fn related(&self, track: &TrackRef, limit: usize) -> Result<Vec<TrackRef>> {
        let response: TracksResponse = self
            .post_json(
                "/tracks/related",
                &RelatedRequest { track: track.clone(), limit },
            )
            .await?;
        Ok(response.tracks)
    }

    pub async fn import_playlist(
        &self,
        provider: ProviderKind,
        url: &str,
    ) -> Result<ImportedPlaylist> {
        let path = format!("/providers/{}/playlists/import", kind_segment(provider));
        let response: ImportedPlaylistResponse = self
            .post_json(&path, &ImportPlaylistRequest { url: url.to_string() })
            .await?;
        Ok(response.playlist)
    }

    pub async fn personal_wave(&self, provider: ProviderKind, limit: usize) -> Result<Vec<TrackRef>> {
        let path = format!("/providers/{}/wave", kind_segment(provider));
        let response: TracksResponse = self
            .get_json(&path, &[("limit", limit.to_string())])
            .await?;
        Ok(response.tracks)
    }

    pub async fn liked_tracks(
        &self,
        provider: ProviderKind,
        profile_url: Option<&str>,
    ) -> Result<Vec<TrackRef>> {
        let path = format!("/providers/{}/liked", kind_segment(provider));
        let response: TracksResponse = self
            .post_json(&path, &LikedRequest { profile_url: profile_url.map(str::to_string) })
            .await?;
        Ok(response.tracks)
    }

    /// Разрешает источник воспроизведения. Если сервер выставил `relay_path`
    /// — подменяем URL на серверный релей и прокидываем Authorization.
    pub async fn playback_source(&self, track: &TrackRef, prefer_relay: bool) -> Result<PlaybackSource> {
        let path = format!("/providers/{}/playback/resolve", kind_segment(track.provider));
        let response: ResolveSourceResponse = self
            .post_json(&path, &ResolveSourceRequest { track: track.clone(), prefer_relay })
            .await?;
        let mut source = response.source;
        if let Some(relay_path) = response.relay_path {
            let url = Url::parse(&format!("{}{}", self.base, relay_path))
                .context("Vessel Server вернул некорректный relay_path")?;
            source.url = url;
            source
                .headers
                .insert("Authorization".to_string(), format!("Bearer {}", self.token));
            source.supports_range = true;
        }
        Ok(source)
    }
}

fn urlencoding(value: &str) -> String {
    value
        .bytes()
        .map(|byte| match byte {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                String::from(byte as char)
            }
            _ => format!("%{byte:02X}"),
        })
        .collect()
}

fn provider_site(kind: ProviderKind) -> Url {
    let raw = match kind {
        ProviderKind::SoundCloud => "https://soundcloud.com",
        ProviderKind::YandexMusic => "https://music.yandex.ru",
        ProviderKind::Deezer => "https://www.deezer.com",
        ProviderKind::Spotify => "https://open.spotify.com",
        ProviderKind::YouTubeMusic => "https://music.youtube.com",
    };
    Url::parse(raw).expect("статический URL правильный")
}

/// Провайдер, делегирующийMusicProvider на Vessel Server.
#[derive(Clone, Debug)]
pub struct ServerProvider {
    kind: ProviderKind,
    client: ServerClient,
}

impl ServerProvider {
    pub fn new(kind: ProviderKind, client: ServerClient) -> Self {
        Self { kind, client }
    }

    pub fn client(&self) -> &ServerClient {
        &self.client
    }
}

#[async_trait]
impl MusicProvider for ServerProvider {
    fn kind(&self) -> ProviderKind {
        self.kind
    }

    fn attribution(&self) -> crate::provider::Attribution {
        crate::provider::Attribution {
            label: format!("{} · Vessel Server", self.kind.label()),
            url: provider_site(self.kind),
        }
    }

    async fn search(&self, query: &str, cursor: Option<&str>) -> Result<SearchPage> {
        self.client.search(self.kind, query, cursor).await
    }

    async fn search_collections(
        &self,
        query: &str,
        kind: CollectionKind,
    ) -> Result<Vec<CollectionItem>> {
        self.client.search_collections(self.kind, query, kind).await
    }

    async fn artist_profile(&self, artist_id: &str) -> Result<ArtistProfile> {
        self.client.artist_profile(self.kind, artist_id).await
    }

    async fn artist_all_tracks(&self, artist_id: &str) -> Result<Vec<TrackRef>> {
        self.client.artist_all_tracks(self.kind, artist_id).await
    }

    async fn import_playlist(&self, url: &Url) -> Result<ImportedPlaylist> {
        self.client.import_playlist(self.kind, &url.to_string()).await
    }

    async fn related(&self, track: &TrackRef, limit: usize) -> Result<Vec<TrackRef>> {
        self.client.related(track, limit).await
    }

    async fn personal_wave(&self, limit: usize) -> Result<Vec<TrackRef>> {
        self.client.personal_wave(self.kind, limit).await
    }

    async fn liked_tracks(&self, profile_url: Option<&str>) -> Result<Vec<TrackRef>> {
        self.client.liked_tracks(self.kind, profile_url).await
    }

    async fn playback_source(&self, track: &TrackRef) -> Result<PlaybackSource> {
        self.client.playback_source(track, false).await
    }
}
