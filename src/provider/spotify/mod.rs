mod artist;
mod auth;
mod client;
mod mapping;

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

pub struct SpotifyProvider {
    pub(crate) http: Client,
    pub(crate) auth: auth::AuthManager,
}

impl SpotifyProvider {
    pub fn new(value: impl AsRef<str>) -> Result<Self> {
        Self::with_proxy(value, None)
    }

    pub fn with_proxy(value: impl AsRef<str>, proxy: Option<&str>) -> Result<Self> {
        let value = value.as_ref().trim();
        let cookie = auth::normalize_cookie_string(value);
        if cookie.is_empty() {
            bail!("для Spotify нужна cookie sp_dc")
        }
        if !cookie.to_ascii_lowercase().contains("sp_dc=") {
            bail!("в строке нет cookie sp_dc — вставь хотя бы sp_dc")
        }
        let http = client::build_http_client(&cookie, proxy)?;
        let auth = auth::AuthManager::new(cookie);
        Ok(Self { http, auth })
    }

    /// Проверяет, что sp_dc действительно авторизован.
    pub async fn probe(&self) -> Result<()> {
        self.auth.probe(&self.http).await
    }

    /// Запрос к внутреннему GraphQL Pathfinder API.
    pub(crate) async fn pathfinder(
        &self,
        operation: &str,
        hash: &str,
        variables: Value,
    ) -> Result<Value> {
        client::pathfinder(&self.http, &self.auth, operation, hash, variables).await
    }

    /// Для отладки: pathfinder с явным хешем.
    pub async fn pathfinder_by_name(&self, operation: &str, variables: Value) -> Result<Value> {
        let hash = match operation {
            "queryArtistDiscographyAll" => client::ARTIST_DISCOGRAPHY_HASH,
            "queryArtistOverview" => client::ARTIST_OVERVIEW_HASH,
            "getAlbum" => client::GET_ALBUM_HASH,
            "fetchPlaylist" => client::FETCH_PLAYLIST_HASH,
            other => bail!("нет хеша для операции {other}"),
        };
        self.pathfinder(operation, hash, variables).await
    }

    async fn import_album(&self, id: &str, source: &Url) -> Result<ImportedPlaylist> {
        let variables = serde_json::json!({
            "uri": format!("spotify:album:{id}"),
            "locale": "",
            "offset": 0,
            "limit": 50,
        });
        let value = self
            .pathfinder("getAlbum", client::GET_ALBUM_HASH, variables)
            .await?;
        let album = value
            .pointer("/data/albumUnion")
            .context("Pathfinder не вернул albumUnion")?;
        let title = mapping::jstr(album, &["name"])
            .unwrap_or("Spotify альбом")
            .to_string();
        let artist = album
            .get("artists")
            .and_then(|a| a.get("items"))
            .and_then(Value::as_array)
            .and_then(|items| items.first())
            .and_then(|artist| artist.get("profile"))
            .and_then(|p| p.get("name"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let cover_url = album
            .get("coverArt")
            .and_then(|c| c.get("sources"))
            .and_then(Value::as_array)
            .and_then(|sources| mapping::best_image_source(sources))
            .and_then(|u| Url::parse(u).ok());
        let mut tracks = mapping::extract_album_tracks(&value);
        // Обложка альбома — каждому треку (в tracksV2 трек приходит без coverArt)
        for track in &mut tracks {
            if track.artwork_url.is_none() {
                track.artwork_url = cover_url.clone();
            }
        }
        // Догружаем остальные треки альбома (totalCount из tracksV2)
        let total = value
            .pointer("/data/albumUnion/tracksV2/totalCount")
            .and_then(Value::as_u64)
            .unwrap_or(tracks.len() as u64);
        let mut offset = 50usize;
        while (offset as u64) < total {
            let variables = serde_json::json!({
                "uri": format!("spotify:album:{id}"),
                "locale": "",
                "offset": offset,
                "limit": 50,
            });
            let Ok(next_value) = self
                .pathfinder("getAlbum", client::GET_ALBUM_HASH, variables)
                .await
            else {
                break;
            };
            let more = mapping::extract_album_tracks(&next_value);
            let mut loaded = more.len();
            let mut more = more;
            for track in &mut more {
                if track.artwork_url.is_none() {
                    track.artwork_url = cover_url.clone();
                }
            }
            tracks.extend(more);
            if loaded == 0 {
                break;
            }
            offset += loaded;
            let _ = &mut loaded;
        }
        Ok(ImportedPlaylist {
            title,
            description: artist,
            source_url: source.clone(),
            cover_url,
            tracks,
        })
    }
}

#[async_trait]
impl MusicProvider for SpotifyProvider {
    fn kind(&self) -> ProviderKind {
        ProviderKind::Spotify
    }

    fn attribution(&self) -> Attribution {
        Attribution {
            label: "Spotify".to_string(),
            url: Url::parse(client::WEB_URL).expect("статический адрес Spotify"),
        }
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    async fn search(&self, query: &str, cursor: Option<&str>) -> Result<SearchPage> {
        let query = query.trim();
        if query.is_empty() {
            return Ok(SearchPage::default());
        }
        let offset = cursor
            .and_then(|value| value.parse().ok())
            .unwrap_or(0usize);
        let variables = serde_json::json!({
            "searchTerm": query,
            "offset": offset,
            "limit": client::PAGE_SIZE,
            "numberOfTopResults": 0,
            "includeAudiobooks": false,
            "includePreReleases": true,
        });
        let value = self
            .pathfinder("searchTracks", client::SEARCH_TRACKS_HASH, variables)
            .await?;
        let tracks = mapping::extract_pathfinder_tracks(&value);
        let next_cursor = if tracks.len() >= client::PAGE_SIZE {
            Some((offset + tracks.len()).to_string())
        } else {
            None
        };
        Ok(SearchPage {
            tracks,
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
        let (operation, hash) = match kind {
            CollectionKind::Playlist => ("searchPlaylists", client::SEARCH_PLAYLISTS_HASH),
            CollectionKind::Album => ("searchAlbums", client::SEARCH_ALBUMS_HASH),
            CollectionKind::Artist => ("searchArtists", client::SEARCH_ARTISTS_HASH),
        };
        let variables = serde_json::json!({
            "searchTerm": query,
            "offset": 0,
            "limit": 30,
            "numberOfTopResults": 0,
            "includeAudiobooks": false,
            "includePreReleases": true,
        });
        let value = self.pathfinder(operation, hash, variables).await?;
        let items = match kind {
            CollectionKind::Playlist => mapping::extract_pathfinder_playlists(&value),
            CollectionKind::Album => mapping::extract_pathfinder_albums(&value),
            CollectionKind::Artist => mapping::extract_pathfinder_artists(&value),
        };
        Ok(items)
    }

    /// Лайкнутые треки пользователя: Pathfinder fetchLibraryTracks.
    /// Работает на sp_dc (тот же web-player токен, что и поиск) — никакого
    /// Web API, никаких OAuth и квот. Пагинация по 50 с паузой 300мс.
    async fn liked_tracks(&self, _profile_url: Option<&str>) -> Result<Vec<TrackRef>> {
        const PAGE: usize = 50;

        let mut tracks = Vec::new();
        let mut offset = 0usize;
        loop {
            let variables = serde_json::json!({ "limit": PAGE, "offset": offset });
            let value = self
                .pathfinder("fetchLibraryTracks", client::LIBRARY_TRACKS_HASH, variables)
                .await
                .context("Spotify не отдал лайки (проверь вход через браузер)")?;
            let Some(items) = value
                .pointer("/data/me/library/tracks/items")
                .and_then(Value::as_array)
            else {
                break;
            };
            let loaded = items.len();
            for item in items {
                // items[].track = { _uri, data: Track }; map_pf_track ждёт Track с uri
                let Some(data) = item.pointer("/track/data") else {
                    continue;
                };
                let mut track_value = data.clone();
                if track_value.get("uri").is_none() {
                    if let Some(uri) = item.pointer("/track/_uri") {
                        track_value["uri"] = uri.clone();
                    }
                }
                if let Some(track) = mapping::map_pf_track(&track_value) {
                    tracks.push(track);
                }
            }
            if loaded < PAGE {
                break;
            }
            offset += loaded;
            // Пауза между страницами: вежливо к API
            tokio::time::sleep(std::time::Duration::from_millis(300)).await;
        }
        Ok(tracks)
    }

    async fn artist_profile(&self, artist_id: &str) -> Result<ArtistProfile> {
        artist::artist_profile(self, artist_id).await
    }

    async fn artist_all_tracks(&self, artist_id: &str) -> Result<Vec<TrackRef>> {
        artist::artist_all_tracks(self, artist_id).await
    }

    async fn import_playlist(&self, source: &Url) -> Result<ImportedPlaylist> {
        if let Some(id) = client::entity_id(source, "album") {
            return self.import_album(&id, source).await;
        }
        let id = client::entity_id(source, "playlist")
            .context("не удалось определить ID плейлиста Spotify")?;
        let variables = serde_json::json!({
            "uri": format!("spotify:playlist:{id}"),
            "offset": 0,
            "limit": 50,
            "enableWatchFeedEntrypoint": false,
        });
        let value = self
            .pathfinder("fetchPlaylist", client::FETCH_PLAYLIST_HASH, variables)
            .await?;
        let playlist = value
            .pointer("/data/playlistV2")
            .context("Pathfinder не вернул playlistV2")?;
        let title = mapping::jstr(playlist, &["name"])
            .unwrap_or("Spotify плейлист")
            .to_string();
        let owner = playlist
            .get("ownerV2")
            .and_then(|o| o.get("data"))
            .and_then(|d| d.get("name"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let cover_url = playlist
            .get("images")
            .and_then(|i| i.get("items"))
            .and_then(Value::as_array)
            .and_then(|items| items.first().or_else(|| items.last()))
            .and_then(|img| img.get("sources"))
            .and_then(Value::as_array)
            .and_then(|sources| mapping::best_image_source(sources))
            .and_then(|u| Url::parse(u).ok());
        let mut tracks = mapping::extract_playlist_tracks(&value);
        // Догружаем остальные страницы плейлиста
        let mut offset = 50usize;
        loop {
            let variables = serde_json::json!({
                "uri": format!("spotify:playlist:{id}"),
                "offset": offset,
                "limit": 50,
                "enableWatchFeedEntrypoint": false,
            });
            let Ok(next_value) = self
                .pathfinder("fetchPlaylist", client::FETCH_PLAYLIST_HASH, variables)
                .await
            else {
                break;
            };
            let more = mapping::extract_playlist_tracks(&next_value);
            let loaded = more.len();
            tracks.extend(more);
            if loaded < 50 {
                break;
            }
            offset += loaded;
        }
        Ok(ImportedPlaylist {
            title,
            description: owner,
            source_url: source.clone(),
            cover_url,
            tracks,
        })
    }

    async fn related(&self, track: &TrackRef, limit: usize) -> Result<Vec<TrackRef>> {
        let uri = format!("spotify:track:{}", track.id);
        let value = self
            .pathfinder(
                "internalLinkRecommenderTrack",
                client::RELATED_TRACK_HASH,
                serde_json::json!({ "uri": uri }),
            )
            .await?;
        let items = value
            .pointer("/data/trackUnion/relatedContent/tracks/items")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        Ok(items
            .into_iter()
            .filter_map(|wrapper| {
                let item = wrapper
                    .get("track")
                    .and_then(|t| t.get("data"))
                    .unwrap_or(&wrapper);
                mapping::map_pf_track(item)
            })
            .take(limit)
            .collect())
    }

    async fn playback_source(&self, track: &TrackRef) -> Result<PlaybackSource> {
        // Spotify — только метаданные. Если трек уже скачан в общий кэш —
        // играем из него; иначе отказ: аудио Spotify не получаем никогда
        // (native premium-путь удалён), цепочка каталогов в Runtime
        // подставит Deezer/YouTube Music.
        crate::provider::cache::cached_source(track)
            .context("аудио Spotify: нет в кэше — играет цепочка каталогов Runtime")
    }
}
