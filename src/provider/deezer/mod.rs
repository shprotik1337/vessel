mod auth;
mod cache;
mod client;
mod crypto;
mod mapping;
mod playback;

#[cfg(test)]
mod tests;

use anyhow::{Context, Result, bail};
use async_trait::async_trait;
use reqwest::Client;
use serde_json::Value;
use url::Url;

use crate::{
    model::{PlaybackSource, ProviderKind, TrackRef},
    provider::{
        ArtistProfile, Attribution, CollectionItem, CollectionKind, ImportedPlaylist,
        MusicProvider, SearchPage,
    },
};

pub struct DeezerProvider {
    pub(crate) http: Client,
}

impl DeezerProvider {
    pub fn new(value: impl AsRef<str>) -> Result<Self> {
        Self::with_optional_arl(Some(value.as_ref()))
    }

    pub fn with_optional_arl(value: Option<&str>) -> Result<Self> {
        let http = client::build_http_client(value)?;
        Ok(Self { http })
    }

    pub(crate) async fn get<T: serde::de::DeserializeOwned>(&self, url: Url) -> Result<T> {
        client::api_get(&self.http, url).await
    }

    async fn playlist_page(&self, url: Url) -> Result<mapping::ApiPage<mapping::ApiTrack>> {
        self.get(url).await
    }

    pub(crate) async fn gateway(&self, method: &str, token: &str, params: Value) -> Result<Value> {
        client::gateway(&self.http, method, token, params).await
    }

    /// Проверяет, что ARL-ключ действительно авторизован: вызывает
    /// deezer.getUserData и проверяет наличие checkForm + license_token.
    /// Ровно та же проверка, что в prepare_full_track.
    pub async fn probe(&self) -> Result<()> {
        let user = self
            .gateway("deezer.getUserData", "", serde_json::json!({}))
            .await?;
        let token = auth::text_at(&user, &["results", "checkForm"]);
        let license = auth::text_at(&user, &["results", "USER", "OPTIONS", "license_token"]);
        if token.is_none() || license.is_none() {
            bail!("Deezer ARL не авторизован — проверь cookie arl")
        }
        Ok(())
    }

    /// Импорт альбома Deezer: GET /album/{id} отдаёт title + tracks.data.
    async fn import_album(&self, id: &str, source: &Url) -> Result<ImportedPlaylist> {
        let details: mapping::ApiAlbumDetails = self
            .get(Url::parse(&format!("{}/album/{id}", client::API))?)
            .await?;
        let mut tracks = details.tracks.data;
        let mut next = details.tracks.next;
        while let Some(url) = next.take() {
            let page = self.playlist_page(Url::parse(&url)?).await?;
            tracks.extend(page.data);
            next = page.next;
        }
        let artist = details
            .artist
            .and_then(|artist| artist.name)
            .unwrap_or_default();
        Ok(ImportedPlaylist {
            title: mapping::non_empty(details.title, "Deezer album"),
            description: artist,
            source_url: source.clone(),
            cover_url: details
                .cover_xl
                .or(details.cover_big)
                .and_then(|value| Url::parse(&value).ok()),
            tracks: tracks.into_iter().filter_map(mapping::map_track).collect(),
        })
    }
}

#[async_trait]
impl MusicProvider for DeezerProvider {
    fn kind(&self) -> ProviderKind {
        ProviderKind::Deezer
    }

    fn attribution(&self) -> Attribution {
        Attribution {
            label: "Deezer".to_string(),
            url: Url::parse("https://www.deezer.com").expect("статический адрес Deezer"),
        }
    }

    async fn search(&self, query: &str, cursor: Option<&str>) -> Result<SearchPage> {
        let query = query.trim();
        if query.is_empty() {
            return Ok(SearchPage::default());
        }
        let index = cursor
            .and_then(|value| value.parse().ok())
            .unwrap_or(0usize);
        let mut url = Url::parse(&format!("{}/search/track", client::API))?;
        url.query_pairs_mut()
            .append_pair("q", query)
            .append_pair("index", &index.to_string())
            .append_pair("limit", &client::PAGE_SIZE.to_string());
        let page: mapping::ApiPage<mapping::ApiTrack> = self.get(url).await?;
        let next_cursor = page.next.as_ref().and_then(|url| {
            Url::parse(url)
                .ok()?
                .query_pairs()
                .find_map(|(key, value)| (key == "index").then(|| value.into_owned()))
        });
        Ok(SearchPage {
            tracks: page
                .data
                .into_iter()
                .filter_map(mapping::map_track)
                .collect(),
            next_cursor,
        })
    }

    async fn search_collections(
        &self,
        query: &str,
        kind: CollectionKind,
    ) -> Result<Vec<CollectionItem>> {
        let query = query.trim();
        if query.is_empty() {
            return Ok(Vec::new());
        }
        let endpoint = match kind {
            CollectionKind::Playlist => "playlist",
            CollectionKind::Album => "album",
            CollectionKind::Artist => "artist",
        };
        let mut url = Url::parse(&format!("{}/search/{endpoint}", client::API))?;
        url.query_pairs_mut()
            .append_pair("q", query)
            .append_pair("limit", "30");
        let items = match kind {
            CollectionKind::Artist => {
                let page: mapping::ApiCollectionPage<mapping::ApiArtistEntry> =
                    self.get(url).await?;
                let mut artists: Vec<mapping::ApiArtistEntry> = page.data;
                // Самый популярный носитель имени — вперёд, чтобы трибьюты не обгоняли оригинал
                artists.sort_by(|a, b| b.nb_fan.unwrap_or(0).cmp(&a.nb_fan.unwrap_or(0)));
                artists
                    .into_iter()
                    .filter_map(|entry| entry.to_collection_item())
                    .collect()
            }
            other => {
                let page: mapping::ApiCollectionPage<mapping::ApiCollectionEntry> =
                    self.get(url).await?;
                page.data
                    .into_iter()
                    .filter_map(|entry| entry.to_collection_item(other))
                    .collect()
            }
        };
        Ok(items)
    }

    async fn artist_profile(&self, artist_id: &str) -> Result<ArtistProfile> {
        let artist: mapping::ApiArtistFull = self
            .get(Url::parse(&format!("{}/artist/{artist_id}", client::API))?)
            .await?;
        let top: mapping::ApiPage<mapping::ApiTrack> = self
            .get(Url::parse(&format!(
                "{}/artist/{artist_id}/top?limit=10",
                client::API
            ))?)
            .await?;
        let albums_page: mapping::ApiCollectionPage<mapping::ApiAlbumRelease> = self
            .get(Url::parse(&format!(
                "{}/artist/{artist_id}/albums?limit=300",
                client::API
            ))?)
            .await?;

        let name = mapping::non_empty(artist.name, "Неизвестный артист");
        let avatar_url = artist
            .picture_xl
            .or(artist.picture_big)
            .and_then(|value| Url::parse(&value).ok());
        let popular_tracks = top
            .data
            .into_iter()
            .filter_map(mapping::map_track)
            .collect();
        let mut raw_releases: Vec<mapping::ApiAlbumRelease> = albums_page.data;
        raw_releases.sort_by(|a, b| b.release_date.cmp(&a.release_date));
        let releases: Vec<CollectionItem> = raw_releases
            .into_iter()
            .filter_map(|release| {
                let id = release.id?.to_string();
                let web_url = release
                    .link
                    .and_then(|value| Url::parse(&value).ok())
                    .unwrap_or_else(|| {
                        Url::parse(&format!("https://www.deezer.com/album/{id}")).unwrap()
                    });
                let artwork_url = release
                    .cover_xl
                    .or(release.cover_big)
                    .and_then(|value| Url::parse(&value).ok());
                let record = match release.record_type.as_deref() {
                    Some("single") => "Сингл",
                    Some("ep") => "EP",
                    _ => "Альбом",
                };
                let subtitle = match release.release_date.as_deref() {
                    Some(date) => format!("{date} · {record}"),
                    None => record.to_string(),
                };
                Some(CollectionItem {
                    kind: CollectionKind::Album,
                    provider: ProviderKind::Deezer,
                    id,
                    title: mapping::non_empty(release.title, "Без названия"),
                    subtitle,
                    artwork_url,
                    web_url,
                    track_count: 0,
                })
            })
            .collect();
        Ok(ArtistProfile {
            name,
            avatar_url: avatar_url.clone(),
            popular_tracks,
            releases,
            header_image_url: avatar_url,
            monthly_listeners: None,
            verified: false,
            biography: None,
            external_links: Vec::new(),
        })
    }

    async fn artist_all_tracks(&self, artist_id: &str) -> Result<Vec<TrackRef>> {
        // Все релизы артиста (с пагинацией), затем треки каждого альбома.
        let mut albums: Vec<mapping::ApiAlbumRelease> = Vec::new();
        let mut next: Option<String> = Some(
            Url::parse(&format!(
                "{}/artist/{artist_id}/albums?limit=100",
                client::API
            ))?
            .to_string(),
        );
        while let Some(url) = next.take() {
            let page: mapping::ApiCollectionPage<mapping::ApiAlbumRelease> =
                self.get(Url::parse(&url)?).await?;
            let loaded = page.data.len();
            albums.extend(page.data);
            next = page.next;
            if loaded == 0 {
                break;
            }
        }
        albums.sort_by(|a, b| b.release_date.cmp(&a.release_date));

        let mut failed = 0usize;
        let mut seen = std::collections::HashSet::new();
        let mut tracks = Vec::new();
        for album in &albums {
            let Some(id) = album.id else {
                continue;
            };
            match self
                .get::<mapping::ApiAlbumDetails>(Url::parse(&format!(
                    "{}/album/{id}",
                    client::API
                ))?)
                .await
            {
                Ok(details) => {
                    let mut album_tracks = details.tracks.data;
                    let mut album_next = details.tracks.next;
                    while let Some(url) = album_next.take() {
                        let Ok(page) = self.playlist_page(Url::parse(&url)?).await else {
                            break;
                        };
                        album_tracks.extend(page.data);
                        album_next = page.next;
                    }
                    for track in album_tracks {
                        if let Some(track_ref) = mapping::map_track(track)
                            && seen.insert(track_ref.provider_key())
                        {
                            tracks.push(track_ref);
                        }
                    }
                }
                Err(_) => failed += 1,
            }
            // Debust-пауза, чтобы Deezer не начал душить за частые запросы
            tokio::time::sleep(std::time::Duration::from_millis(60)).await;
        }
        let _ = std::fs::write(
            "C:\\Users\\SMILIN~1\\AppData\\Local\\Temp\\opencode\\vessel-deezer-artist.txt",
            format!(
                "artist_id={artist_id} albums={} failed={failed} tracks={}",
                albums.len(),
                tracks.len()
            ),
        );
        Ok(tracks)
    }

    async fn import_playlist(&self, source: &Url) -> Result<ImportedPlaylist> {
        if let Some(id) = client::entity_id(source, "album") {
            return self.import_album(&id, source).await;
        }
        let id = client::entity_id(source, "playlist")
            .context("не удалось определить ID плейлиста Deezer")?;
        let details: mapping::ApiPlaylist = self
            .get(Url::parse(&format!("{}/playlist/{id}", client::API))?)
            .await?;
        let mut tracks = details.tracks.data;
        let mut next = details.tracks.next;
        while let Some(url) = next.take() {
            let page = self.playlist_page(Url::parse(&url)?).await?;
            tracks.extend(page.data);
            next = page.next;
        }
        Ok(ImportedPlaylist {
            title: mapping::non_empty(details.title, "Deezer playlist"),
            description: details.description.unwrap_or_default(),
            source_url: source.clone(),
            cover_url: details
                .cover_xl
                .or(details.cover_big)
                .and_then(|value| Url::parse(&value).ok()),
            tracks: tracks.into_iter().filter_map(mapping::map_track).collect(),
        })
    }

    async fn related(&self, track: &TrackRef, limit: usize) -> Result<Vec<TrackRef>> {
        let url = Url::parse(&format!(
            "{}/track/{}/radio?limit={}",
            client::API,
            track.id,
            limit.clamp(1, 100)
        ))?;
        let page: mapping::ApiPage<mapping::ApiTrack> = self.get(url).await?;
        Ok(page
            .data
            .into_iter()
            .filter_map(mapping::map_track)
            .collect())
    }

    async fn liked_tracks(&self, _profile_url: Option<&str>) -> Result<Vec<TrackRef>> {
        // Deezer: лайки через внутренний gateway (ARL-сессия).
        // Сначала получаем checkForm-токен и USER_ID, затем song.getFavorites
        // с пагинацией по start.
        let user = self
            .gateway("deezer.getUserData", "", serde_json::json!({}))
            .await?;
        let mut token = auth::text_at(&user, &["results", "checkForm"])
            .context("Deezer ARL не авторизован: нет checkForm")?
            .to_string();
        let user_id = auth::user_id_at(&user, &["results", "USER", "USER_ID"])
            .context("Deezer не выдал USER_ID")?;
        let mut tracks = Vec::new();
        let mut start = 0u64;
        loop {
            let page = self
                .gateway(
                    "song.getFavorites",
                    &token,
                    serde_json::json!({ "USER_ID": user_id, "nb": 100, "start": start }),
                )
                .await?;
            if auth::gateway_has_invalid_token(&page) {
                let refreshed = self
                    .gateway("deezer.getUserData", "", serde_json::json!({}))
                    .await?;
                token = auth::text_at(&refreshed, &["results", "checkForm"])
                    .context("Deezer не обновил checkForm")?
                    .to_string();
                continue;
            }
            if page.get("error").is_some_and(auth::gateway_has_error) {
                bail!("Deezer gateway: {}", page["error"])
            }
            let items = page
                .pointer("/results/data")
                .and_then(Value::as_array)
                .context("Deezer не вернул список лайков")?;
            let loaded = items.len();
            for item in items {
                if let Some(track) = mapping::map_favorite_song(item) {
                    tracks.push(track);
                }
            }
            let total = page
                .pointer("/results/total")
                .and_then(Value::as_u64)
                .unwrap_or((start + loaded as u64).max(1));
            start += loaded as u64;
            if start >= total || loaded == 0 {
                break;
            }
        }
        Ok(tracks)
    }

    async fn playback_source(&self, track: &TrackRef) -> Result<PlaybackSource> {
        // Если трек уже скачан в общий кэш — играем из него
        if let Some(source) = crate::provider::cache::cached_source(track) {
            return Ok(source);
        }
        let path = playback::prepare_full_track(self, &track.id).await?;
        cache::full_cache_source(&path)
    }
}
