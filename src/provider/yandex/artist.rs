use anyhow::{Context, Result};
use url::Url;
use yandex_music::{
    YandexMusicClient,
    api::artist::{
        get_artist::GetArtistOptions,
        get_artist_albums::GetArtistAlbumsOptions,
        get_artist_tracks::ArtistTracksOptions,
    },
    model::album::Album as YandexAlbum,
    model::artist::SortBy,
};

use crate::{
    model::{ProviderKind, TrackRef},
    provider::{ArtistProfile, CollectionItem, CollectionKind},
};

use super::mapping::{cover_url, normalizovat_track};

const POPULAR_LIMIT: usize = 10;
const ALBUM_PAGE_SIZE: u32 = 100;
const MAX_ALBUM_PAGES: u32 = 20;

pub(super) async fn artist_profile(
    client: &YandexMusicClient,
    artist_id: &str,
) -> Result<ArtistProfile> {
    let info = client
        .get_artist(&GetArtistOptions::new(artist_id))
        .await
        .context("Yandex Music не отдал артиста")?;
    let artist = &info.artist;
    let name = artist
        .name
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .unwrap_or(artist_id)
        .to_string();
    let avatar_url = artist
        .cover
        .as_ref()
        .and_then(|cover| {
            cover
                .uri
                .as_deref()
                .or_else(|| cover.items_uri.first().map(String::as_str))
        })
        .or(artist.og_image.as_deref())
        .and_then(cover_url);

    let top = client
        .get_artist_tracks(&ArtistTracksOptions::new(artist_id).page(0).page_size(POPULAR_LIMIT as u32))
        .await
        .context("Yandex Music не отдал популярные треки артиста")?;
    let popular_tracks: Vec<TrackRef> = top
        .tracks
        .into_iter()
        .filter_map(normalizovat_track)
        .take(POPULAR_LIMIT)
        .collect();

    let mut albums: Vec<YandexAlbum> = Vec::new();
    let mut page = 0u32;
    loop {
        let found = client
            .get_artist_albums(
                &GetArtistAlbumsOptions::new(artist_id)
                    .page(page)
                    .page_size(ALBUM_PAGE_SIZE)
                    .sort_by(SortBy::Year),
            )
            .await
            .context("Yandex Music не отдал релизы артиста")?;
        let loaded = found.albums.len();
        albums.extend(found.albums);
        if loaded == 0 || page >= MAX_ALBUM_PAGES {
            break;
        }
        page += 1;
    }
    albums.sort_by(|a, b| b.year.unwrap_or(0).cmp(&a.year.unwrap_or(0)));
    let releases = albums.into_iter().filter_map(release_item).collect();

    Ok(ArtistProfile {
        name,
        avatar_url,
        popular_tracks,
        releases,
    })
}

pub(super) async fn artist_all_tracks(
    client: &YandexMusicClient,
    artist_id: &str,
) -> Result<Vec<TrackRef>> {
    let mut tracks = Vec::new();
    let mut page = 0u32;
    loop {
        let found = client
            .get_artist_tracks(
                &ArtistTracksOptions::new(artist_id).page(page).page_size(50),
            )
            .await
            .context("Yandex Music не отдал треки артиста")?;
        let loaded = found.tracks.len();
        tracks.extend(found.tracks.into_iter().filter_map(normalizovat_track));
        if loaded == 0 || page >= 100 {
            break;
        }
        page += 1;
    }
    Ok(tracks)
}

fn release_item(album: YandexAlbum) -> Option<CollectionItem> {
    let id = album.id?.to_string();
    let web_url = Url::parse(&format!("https://music.yandex.ru/album/{id}")).ok()?;
    let artwork_url = album.cover_uri.as_deref().and_then(cover_url);
    let record = match album.item_type.as_deref() {
        Some("single") => "Сингл",
        Some("ep") => "EP",
        _ => "Альбом",
    };
    let subtitle = match album.year {
        Some(year) => format!("{record} · {year}"),
        None => record.to_string(),
    };
    Some(CollectionItem {
        kind: CollectionKind::Album,
        provider: ProviderKind::YandexMusic,
        id,
        title: album
            .title
            .filter(|title| !title.trim().is_empty())
            .unwrap_or_else(|| "Без названия".to_string()),
        subtitle,
        artwork_url,
        web_url,
        track_count: album.track_count.unwrap_or(0) as usize,
    })
}
