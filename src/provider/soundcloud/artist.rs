use anyhow::{Context, Result};
use url::Url;

use crate::{
    model::{ProviderKind, TrackRef},
    provider::{ArtistProfile, CollectionItem, CollectionKind},
};

use super::{
    client::SoundCloudClient,
    models::{ScCollection, ScPlaylist, ScTrack, ScUser},
    normalizovat_track,
};

const PROFILE_TRACKS: usize = 10;
const RELEASE_LIMIT: usize = 100;

pub(super) async fn artist_profile(
    client: &SoundCloudClient,
    username: &str,
) -> Result<ArtistProfile> {
    let username = username.trim().trim_start_matches('@');
    let user: ScUser = client
        .get_json(
            client.v2_url(&["resolve"])?,
            &[("url", format!("https://soundcloud.com/{username}"))],
        )
        .await
        .context("SoundCloud не разобрал ссылку на артиста")?;
    let user_id = user.id;
    let name = if user.username.trim().is_empty() {
        username.to_string()
    } else {
        user.username.clone()
    };
    let avatar_url = user
        .avatar_url
        .and_then(|value| Url::parse(&value).ok())
        // -large.jpg это 100px, подменяем на большую версию
        .map(|url| {
            let rendered = url.as_str().replace("-large.jpg", "-t500x500.jpg");
            Url::parse(&rendered).unwrap_or(url)
        });

    let top: ScCollection<ScTrack> = client
        .get_json(
            client.v2_url(&["users", &user_id, "tracks"])?,
            &[
                ("limit", PROFILE_TRACKS.to_string()),
                ("linked_partitioning", "true".to_string()),
            ],
        )
        .await
        .context("SoundCloud не отдал треки артиста")?;
    let popular_tracks: Vec<crate::model::TrackRef> = top
        .collection
        .into_iter()
        .filter_map(normalizovat_track)
        .take(PROFILE_TRACKS)
        .collect();

    let sets: ScCollection<ScPlaylist> = client
        .get_json(
            client.v2_url(&["users", &user_id, "playlists"])?,
            &[
                ("limit", RELEASE_LIMIT.to_string()),
                ("linked_partitioning", "true".to_string()),
            ],
        )
        .await
        .context("SoundCloud не отдал релизы артиста")?;
    let releases = sets
        .collection
        .into_iter()
        .filter_map(|playlist| {
            let web_url = playlist
                .permalink_url
                .clone()
                .and_then(|value| Url::parse(&value).ok())?;
            let artwork_url = playlist
                .artwork_url
                .as_deref()
                .or_else(|| {
                    playlist
                        .tracks
                        .iter()
                        .find_map(|track| track.artwork_url.as_deref())
                })
                .and_then(|value| Url::parse(&value).ok());
            let subtitle = format!("{} треков", playlist.tracks.len());
            Some(CollectionItem {
                kind: CollectionKind::Album,
                provider: ProviderKind::SoundCloud,
                id: playlist.id,
                title: playlist.title,
                subtitle,
                artwork_url,
                web_url,
                track_count: playlist.tracks.len(),
            })
        })
        .collect();

    Ok(ArtistProfile {
        name,
        avatar_url,
        popular_tracks,
        releases,
    })
}

pub(super) async fn artist_all_tracks(
    client: &SoundCloudClient,
    username: &str,
) -> Result<Vec<TrackRef>> {
    let username = username.trim().trim_start_matches('@');
    let user: ScUser = client
        .get_json(
            client.v2_url(&["resolve"])?,
            &[("url", format!("https://soundcloud.com/{username}"))],
        )
        .await
        .context("SoundCloud не разобрал ссылку на артиста")?;
    let user_id = user.id;

    let mut tracks = Vec::new();
    let mut offset = 0usize;
    loop {
        let page: ScCollection<ScTrack> = client
            .get_json(
                client.v2_url(&["users", &user_id, "tracks"])?,
                &[
                    ("limit", "200".to_string()),
                    ("offset", offset.to_string()),
                    ("linked_partitioning", "true".to_string()),
                ],
            )
            .await
            .context("SoundCloud не отдал треки артиста")?;
        let loaded = page.collection.len();
        tracks.extend(page.collection.into_iter().filter_map(normalizovat_track));
        if loaded == 0 || tracks.len() >= 2000 {
            break;
        }
        offset += loaded;
    }
    Ok(tracks)
}
