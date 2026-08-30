mod album;
mod artist;
mod client;
mod mapping;
mod personal;
mod playback;
mod playlist;
mod playlist_tracks;
mod playlist_url;
mod related;
mod search;
mod user;
mod uuid_playlist;

use std::sync::Arc;

use anyhow::Result;
use async_trait::async_trait;
use url::Url;
use yandex_music::YandexMusicClient;

use crate::{
    model::{PlaybackSource, ProviderKind, TrackRef},
    provider::{
        ArtistProfile, Attribution, CollectionItem, CollectionKind, ImportedPlaylist, MusicProvider,
        SearchPage,
    },
};

use client::build_client;
use personal::personal_wave;
use playback::poluchit_istochnik;
use playlist::import_playlist;
use related::related_tracks;
use search::{search_collections, search_tracks};

use album::import_album;
use artist::{artist_all_tracks, artist_profile};

pub use mapping::normalizovat_track;
pub use playlist_url::{YandexPlaylistRef, parse_playlist_url};

pub struct YandexProvider {
    client: Arc<YandexMusicClient>,
}

impl YandexProvider {
    pub fn new(token: impl AsRef<str>) -> Result<Self> {
        Ok(Self {
            client: Arc::new(build_client(token.as_ref())?),
        })
    }
}

#[async_trait]
impl MusicProvider for YandexProvider {
    fn kind(&self) -> ProviderKind {
        ProviderKind::YandexMusic
    }

    fn attribution(&self) -> Attribution {
        Attribution {
            label: "Yandex Music".to_string(),
            url: Url::parse("https://music.yandex.ru").expect("статический адрес Yandex Music"),
        }
    }

    async fn search(&self, query: &str, cursor: Option<&str>) -> Result<SearchPage> {
        search_tracks(&self.client, query, cursor).await
    }

    async fn search_collections(
        &self,
        query: &str,
        kind: CollectionKind,
    ) -> Result<Vec<CollectionItem>> {
        search_collections(&self.client, query, kind).await
    }

    async fn artist_profile(&self, artist_id: &str) -> Result<ArtistProfile> {
        artist_profile(&self.client, artist_id).await
    }

    async fn artist_all_tracks(&self, artist_id: &str) -> Result<Vec<TrackRef>> {
        artist_all_tracks(&self.client, artist_id).await
    }

    async fn import_playlist(&self, url: &Url) -> Result<ImportedPlaylist> {
        if let Some(album_id) = album_id_from_url(url) {
            return import_album(&self.client, album_id, url).await;
        }
        import_playlist(&self.client, url).await
    }

    async fn related(&self, track: &TrackRef, limit: usize) -> Result<Vec<TrackRef>> {
        related_tracks(&self.client, track, limit).await
    }

    async fn personal_wave(&self, limit: usize) -> Result<Vec<TrackRef>> {
        personal_wave(&self.client, limit).await
    }

    async fn playback_source(&self, track: &TrackRef) -> Result<PlaybackSource> {
        poluchit_istochnik(&self.client, track).await
    }
}

impl YandexProvider {
    /// Проверяет, что OAuth-токен валиден: делает реальный поисковый
    /// запрос тем же кодом, которым идёт обычный поиск.
    pub async fn probe(&self) -> Result<()> {
        search_tracks(&self.client, "noverplay probe", None).await.map(|_| ())
    }
}

fn album_id_from_url(url: &Url) -> Option<u32> {
    let segments = url.path_segments()?.collect::<Vec<_>>();
    segments.windows(2).find_map(|pair| {
        (pair[0] == "album" && pair[1].chars().all(|ch| ch.is_ascii_digit()))
            .then(|| pair[1].parse::<u32>().ok())
            .flatten()
    })
}

#[cfg(test)]
mod tests;
