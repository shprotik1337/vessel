mod artist;
mod client;
mod mapping;
mod models;
mod playback;
mod playlist;
mod related;
mod search;
mod source_url;
mod track_details;

use anyhow::{Context, Result, bail};
use async_trait::async_trait;
use url::Url;

use crate::{
    model::{PlaybackSource, ProviderKind, TrackRef},
    provider::{
        ArtistProfile, Attribution, CollectionItem, CollectionKind, ImportedPlaylist, MusicProvider,
        SearchPage,
    },
};

use artist::{artist_all_tracks, artist_profile};
use client::SoundCloudClient;
use playback::{poluchit_istochnik, zagruzit_progressivnyi};
use playlist::import_playlist;
use related::related_tracks;
use search::{search_albums, search_artists, search_playlists, search_tracks};

pub use mapping::normalizovat_track;
pub use models::{ScCollection, ScPlaylist, ScTrack};
pub use source_url::proverit_soundcloud_url;

pub struct SoundCloudProvider {
    client: SoundCloudClient,
}

impl SoundCloudProvider {
    pub fn new(client_id: impl Into<String>) -> Result<Self> {
        Ok(Self {
            client: SoundCloudClient::new(client_id.into())?,
        })
    }
}

#[async_trait]
impl MusicProvider for SoundCloudProvider {
    fn kind(&self) -> ProviderKind {
        ProviderKind::SoundCloud
    }

    fn attribution(&self) -> Attribution {
        Attribution {
            label: "SoundCloud".to_string(),
            url: Url::parse("https://soundcloud.com").expect("статический адрес SoundCloud"),
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
        match kind {
            CollectionKind::Playlist => search_playlists(&self.client, query).await,
            CollectionKind::Album => search_albums(&self.client, query).await,
            CollectionKind::Artist => search_artists(&self.client, query).await,
        }
    }

    async fn artist_profile(&self, artist_id: &str) -> Result<ArtistProfile> {
        artist_profile(&self.client, artist_id).await
    }

    async fn artist_all_tracks(&self, artist_id: &str) -> Result<Vec<TrackRef>> {
        artist_all_tracks(&self.client, artist_id).await
    }

    async fn import_playlist(&self, url: &Url) -> Result<ImportedPlaylist> {
        import_playlist(&self.client, url).await
    }

    async fn related(&self, track: &TrackRef, limit: usize) -> Result<Vec<TrackRef>> {
        related_tracks(&self.client, track, limit).await
    }

    async fn playback_source(&self, track: &TrackRef) -> Result<PlaybackSource> {
        poluchit_istochnik(&self.client, track).await
    }

    async fn download_source(&self, track: &TrackRef) -> Result<PlaybackSource> {
        zagruzit_progressivnyi(&self.client, track).await
    }

    async fn liked_tracks(&self, profile_url: Option<&str>) -> Result<Vec<TrackRef>> {
        // SoundCloud: лайки пользователя = GET /users/{id}/likes.
        // Нужен URL профиля (https://soundcloud.com/username) — из него достаём id.
        let username = profile_url
            .and_then(|url| {
                let url = url.trim();
                let idx = url.rfind('/')?;
                let name = url[idx + 1..].trim();
                if name.is_empty() { None } else { Some(name.to_string()) }
            })
            .context("для импорта лайков SoundCloud укажи URL профиля, например https://soundcloud.com/username")?;
        let user: models::ScUser = self
            .client
            .get_json(self.client.v2_url(&["users", &username])?, &[])
            .await
            .context("не удалось найти пользователя SoundCloud по URL профиля")?;
        if user.id.is_empty() {
            bail!("SoundCloud не вернул id пользователя")
        }
        let mut tracks = Vec::new();
        let mut url = self.client.v2_url(&["users", &user.id, "likes"])?;
        loop {
            let page: models::ScCollection<models::ScTrack> = self
                .client
                .get_json(
                    url,
                    &[
                        ("limit", "50".to_string()),
                        ("linked_partitioning", "true".to_string()),
                        ("access", "playable,preview".to_string()),
                    ],
                )
                .await?;
            tracks.extend(page.collection.into_iter().filter_map(normalizovat_track));
            match page.next_href {
                Some(next) => url = Url::parse(&next)?,
                None => break,
            }
        }
        Ok(tracks)
    }
}

impl SoundCloudProvider {
    /// Проверяет, что client_id реально работает: делает настоящий запрос
    /// к поиску SoundCloud тем же кодом, которым идёт обычный поиск.
    pub async fn probe(&self) -> Result<()> {
        search_tracks(&self.client, "vessel probe", None).await.map(|_| ())
    }
}

#[cfg(test)]
mod tests;
