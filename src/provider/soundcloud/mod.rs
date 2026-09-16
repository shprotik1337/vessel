mod artist;
mod client;
mod discover;
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

pub use discover::discover_client_id;
pub use mapping::normalizovat_track;
pub use models::{ScCollection, ScPlaylist, ScTrack};
pub use source_url::proverit_soundcloud_url;

pub struct SoundCloudProvider {
    client: SoundCloudClient,
}

impl SoundCloudProvider {
    pub fn new(client_id: impl Into<String>) -> Result<Self> {
        Self::with_oauth(client_id, None)
    }

    pub fn with_oauth(client_id: impl Into<String>, oauth_token: Option<String>) -> Result<Self> {
        Ok(Self {
            client: SoundCloudClient::new(client_id.into(), oauth_token)?,
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
        let raw = profile_url
            .map(str::trim)
            .filter(|s| !s.is_empty());

        let (mut url, mut query) = match raw {
            Some(raw) => {
                // 1. Получаем числовой id пользователя SoundCloud
                let user_id = if raw.chars().all(|c| c.is_ascii_digit()) {
                    raw.to_string()
                } else {
                    let mut clean = raw.to_string();
                    if !clean.starts_with("http://") && !clean.starts_with("https://") {
                        clean = format!("https://soundcloud.com/{clean}");
                    }
                    while clean.ends_with('/') {
                        clean.pop();
                    }
                    for suffix in ["/likes", "/tracks", "/albums", "/sets", "/reposts"] {
                        if clean.to_ascii_lowercase().ends_with(suffix) {
                            clean.truncate(clean.len() - suffix.len());
                            break;
                        }
                    }
                    while clean.ends_with('/') {
                        clean.pop();
                    }

                    let resolve_url = self.client.v2_url(&["resolve"])?;
                    let user: models::ScUser = self
                        .client
                        .get_json(resolve_url, &[("url", clean)])
                        .await
                        .context("SoundCloud не нашёл профиль по указанной ссылке. Проверь правильность ссылки на профиль.")?;

                    if user.id.is_empty() {
                        bail!("SoundCloud не вернул id пользователя");
                    }
                    user.id
                };
                (
                    self.client.v2_url(&["users", &user_id, "track_likes"])?,
                    vec![
                        ("limit", "50".to_string()),
                        ("linked_partitioning", "true".to_string()),
                    ],
                )
            }
            None => {
                if self.client.has_oauth() {
                    let me_url = self.client.v2_url(&["me"])?;
                    let empty_query: [(&str, String); 0] = [];
                    let me: models::ScUser = self
                        .client
                        .get_json(me_url, &empty_query)
                        .await
                        .context("не удалось получить профиль текущего пользователя SoundCloud")?;
                    if me.id.is_empty() {
                        bail!("SoundCloud не вернул id текущего пользователя");
                    }
                    (
                        self.client.v2_url(&["users", &me.id, "track_likes"])?,
                        vec![
                            ("limit", "50".to_string()),
                            ("linked_partitioning", "true".to_string()),
                        ],
                    )
                } else {
                    bail!("для импорта лайков SoundCloud укажи URL профиля (например https://soundcloud.com/username) или войди в свой аккаунт SoundCloud в Настройках")
                }
            }
        };

        // 2. Загружаем лайки через /users/{id}/track_likes или /me/track_likes
        let mut tracks = Vec::new();
        // До 500 лайков (10 страниц по 50)
        for _ in 0..10 {
            let page: models::ScCollection<models::ScLikeItem> = self
                .client
                .get_json(url.clone(), &query)
                .await
                .context("не удалось загрузить страницу лайков SoundCloud")?;

            for item in page.collection {
                if let Some(track) = item.track.and_then(normalizovat_track) {
                    tracks.push(track);
                }
            }

            match page.next_href {
                Some(next) if !next.trim().is_empty() => {
                    url = Url::parse(&next).context("некорректный next_href от SoundCloud")?;
                    query.clear();
                }
                _ => break,
            }
        }

        Ok(tracks)
    }
}

impl SoundCloudProvider {
    /// Проверяет, что client_id или oauth_token реально работают:
    /// если есть oauth_token — делает запрос к /me;
    /// если только client_id — делает настоящий запрос к поиску.
    pub async fn probe(&self) -> Result<()> {
        if self.client.has_oauth() {
            let url = self.client.v2_url(&["me"])?;
            let _: models::ScUser = self
                .client
                .get_json(url, &[])
                .await
                .context("не удалось подтвердить авторизацию в SoundCloud (токен недействителен)")?;
            Ok(())
        } else {
            search_tracks(&self.client, "vessel probe", None).await.map(|_| ())
        }
    }
}

#[cfg(test)]
mod tests;
