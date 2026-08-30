use anyhow::{Context, Result};
use url::Url;
use yandex_music::{
    YandexMusicClient,
    api::search::get_search::SearchOptions,
    model::{
        album::Album,
        playlist::Playlist,
        search::SearchType,
    },
};

use crate::{
    model::ProviderKind,
    provider::{CollectionItem, CollectionKind, SearchPage},
};

use super::mapping::cover_url;

use super::normalizovat_track;

pub(super) async fn search_tracks(
    client: &YandexMusicClient,
    query: &str,
    cursor: Option<&str>,
) -> Result<SearchPage> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(SearchPage::default());
    }
    let page = cursor.and_then(|value| value.parse().ok()).unwrap_or(0);
    let response = client
        .search(
            &SearchOptions::new(query)
                .page(page)
                .item_type(SearchType::Tracks),
        )
        .await
        .context("Yandex Music не выполнил поиск")?;
    let Some(result) = response.tracks else {
        return Ok(SearchPage::default());
    };
    let loaded_before = page.saturating_mul(result.per_page);
    let next_cursor = (loaded_before + (result.results.len() as u32) < result.total)
        .then(|| (page + 1).to_string());

    // Реклама и пустые карточки идут к начальнику отряда, у нас музыкальная зона а не базар 🫩
    let tracks = result
        .results
        .into_iter()
        .filter_map(normalizovat_track)
        .collect();
    Ok(SearchPage {
        tracks,
        next_cursor,
    })
}

pub(super) async fn search_collections(
    client: &YandexMusicClient,
    query: &str,
    kind: CollectionKind,
) -> Result<Vec<CollectionItem>> {
    let query = query.trim();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    // В крейте нет SearchType::Playlists — плейлисты берём из общего поиска (type=all)
    let item_type = match kind {
        CollectionKind::Playlist => SearchType::All,
        CollectionKind::Album => SearchType::Albums,
        CollectionKind::Artist => SearchType::Artists,
    };
    let response = client
        .search(&SearchOptions::new(query).page(0).item_type(item_type))
        .await
        .context("Yandex Music не выполнил поиск")?;
    match kind {
        CollectionKind::Playlist => {
            let Some(found) = response.playlists else {
                return Ok(Vec::new());
            };
            Ok(found
                .results
                .into_iter()
                .filter_map(playlist_item)
                .collect())
        }
        CollectionKind::Album => {
            let Some(found) = response.albums else {
                return Ok(Vec::new());
            };
            Ok(found.results.into_iter().filter_map(album_item).collect())
        }
        CollectionKind::Artist => {
            let Some(found) = response.artists else {
                return Ok(Vec::new());
            };
            Ok(found.results.into_iter().filter_map(artist_item).collect())
        }
    }
}

fn artist_item(artist: yandex_music::model::artist::Artist) -> Option<CollectionItem> {
    let name = artist
        .name
        .as_deref()
        .map(str::trim)
        .filter(|name| !name.is_empty())?
        .to_string();
    let id = artist.id.unwrap_or_else(|| name.clone());
    let web_url = Url::parse(&format!("https://music.yandex.ru/artist/{id}")).ok()?;
    let artwork_url = artist
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
    Some(CollectionItem {
        kind: CollectionKind::Artist,
        provider: ProviderKind::YandexMusic,
        id,
        title: name,
        subtitle: "Артист".to_string(),
        artwork_url,
        web_url,
        track_count: 0,
    })
}

fn playlist_item(playlist: Playlist) -> Option<CollectionItem> {
    let web_url = Url::parse(&format!(
        "https://music.yandex.ru/users/{}/playlists/{}",
        playlist.owner.login, playlist.kind
    ))
    .ok()?;
    let artwork_url = playlist
        .cover
        .uri
        .as_deref()
        .or_else(|| playlist.cover.items_uri.first().map(String::as_str))
        .or(Some(playlist.og_image.as_str()))
        .and_then(cover_url);
    let owner_name = playlist
        .owner
        .display_name
        .as_deref()
        .or(playlist.owner.name.as_deref())
        .unwrap_or(playlist.owner.login.as_str())
        .to_string();
    Some(CollectionItem {
        kind: CollectionKind::Playlist,
        provider: ProviderKind::YandexMusic,
        id: playlist.kind.to_string(),
        title: playlist.title,
        subtitle: format!("{owner_name} · {} треков", playlist.track_count),
        artwork_url,
        web_url,
        track_count: playlist.track_count as usize,
    })
}

fn album_item(album: Album) -> Option<CollectionItem> {
    let id = album.id?.to_string();
    let web_url = Url::parse(&format!("https://music.yandex.ru/album/{id}")).ok()?;
    let artwork_url = album.cover_uri.as_deref().and_then(cover_url);
    let subtitle = album
        .artists
        .iter()
        .filter_map(|artist| artist.name.as_deref())
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .collect::<Vec<_>>()
        .join(", ");
    let year = album
        .year
        .map(|year| format!(" · {year}"))
        .unwrap_or_default();
    Some(CollectionItem {
        kind: CollectionKind::Album,
        provider: ProviderKind::YandexMusic,
        id,
        title: album
            .title
            .filter(|title| !title.trim().is_empty())
            .unwrap_or_else(|| "Без названия".to_string()),
        subtitle: format!("{subtitle}{year}"),
        artwork_url,
        web_url,
        track_count: album.track_count.unwrap_or(0) as usize,
    })
}
