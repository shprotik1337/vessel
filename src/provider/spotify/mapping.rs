use std::collections::HashSet;

use serde_json::Value;
use url::Url;

use crate::{
    model::{PlaybackCapability, ProviderKind, TrackRef},
    provider::{CollectionItem, CollectionKind},
};

use super::client::WEB_URL;

pub fn jstr<'a>(value: &'a Value, path: &[&str]) -> Option<&'a str> {
    path.iter()
        .try_fold(value, |current, key| current.get(*key))
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
}

pub fn jarray(value: &Value, path: &[&str]) -> Vec<Value> {
    let mut current = value;
    for key in path {
        match current.get(*key) {
            Some(next) => current = next,
            None => return Vec::new(),
        }
    }
    current.as_array().cloned().unwrap_or_default()
}

pub fn pf_bare_id(uri: &str) -> Option<String> {
    uri.rsplit(':')
        .next()
        .filter(|s| !s.is_empty())
        .map(str::to_string)
}

/// Выбирает URL изображения с максимальным разрешением (по width/height) из sources[] Spotify.
/// Если размеры не указаны, берёт первый элемент (в Spotify Pathfinder GraphQL sources[0] = оригинал).
pub fn best_image_source(sources: &[Value]) -> Option<&str> {
    let with_dim = sources.iter().filter(|s| {
        s.get("width").and_then(Value::as_u64).unwrap_or(0) > 0
            || s.get("height").and_then(Value::as_u64).unwrap_or(0) > 0
    });
    let best = with_dim
        .max_by_key(|s| {
            s.get("width")
                .and_then(Value::as_u64)
                .or_else(|| s.get("height").and_then(Value::as_u64))
                .unwrap_or(0)
        })
        .or_else(|| sources.first());
    best.and_then(|s| s.get("url")).and_then(Value::as_str)
}

/// coverArt.sources[].url из объекта, если он есть (для getAlbum-ответа и topTracks).
pub fn value_cover_art(track: &Value) -> Option<Url> {
    let sources = track
        .pointer("/albumOfTrack/coverArt/sources")
        .or_else(|| track.pointer("/track/albumOfTrack/coverArt/sources"))
        .or_else(|| track.pointer("/album/coverArt/sources"))
        .or_else(|| track.pointer("/track/album/coverArt/sources"))
        .or_else(|| track.pointer("/coverArt/sources"))
        .or_else(|| track.pointer("/track/coverArt/sources"))
        .or_else(|| track.pointer("/visuals/avatarImage/sources"))
        .or_else(|| track.pointer("/albumOfTrack/images"))
        .or_else(|| track.pointer("/track/albumOfTrack/images"))
        .or_else(|| track.pointer("/album/images"))
        .or_else(|| track.pointer("/track/album/images"))
        .or_else(|| track.pointer("/images"))?
        .as_array()?;
    best_image_source(sources).and_then(|u| Url::parse(u).ok())
}

pub fn map_pf_track(item: &Value) -> Option<TrackRef> {
    let uri = jstr(item, &["uri"])
        // В library-выдаче uri лежит в родительском объекте (_uri)
        .or_else(|| jstr(item, &["_uri"]))?;
    let id = pf_bare_id(uri)?;
    let title = jstr(item, &["name"]).unwrap_or("Без названия").to_string();
    let artists: Vec<String> = item
        .get("artists")
        .and_then(|a| a.get("items"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .iter()
        .filter_map(|artist| {
            artist
                .get("profile")
                .and_then(|p| p.get("name"))
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .collect();
    let duration_ms = item
        .get("duration")
        .and_then(|d| d.get("totalMilliseconds"))
        .and_then(Value::as_u64)
        // В плейлистах (fetchPlaylist) длительность лежит в trackDuration
        .or_else(|| {
            item.pointer("/trackDuration/totalMilliseconds")
                .and_then(Value::as_u64)
        });
    let album_data = item.get("albumOfTrack").or_else(|| item.get("album"));
    let album_uri = album_data
        .and_then(|a| a.get("uri"))
        .and_then(Value::as_str);
    let album_id = album_uri.and_then(pf_bare_id);
    let album_url =
        album_id.and_then(|alb_id| Url::parse(&format!("{WEB_URL}/album/{alb_id}")).ok());
    let album_title = album_data
        .and_then(|a| a.get("name"))
        .and_then(Value::as_str)
        .map(str::to_string);
    let artwork_url = album_data
        .and_then(|a| a.get("coverArt"))
        .or_else(|| item.get("coverArt"))
        .and_then(|c| c.get("sources"))
        .and_then(Value::as_array)
        .and_then(|sources| best_image_source(sources))
        .and_then(|u| Url::parse(u).ok())
        .or_else(|| value_cover_art(item));
    let explicit = item
        .get("contentRating")
        .and_then(|c| c.get("label"))
        .and_then(Value::as_str)
        .map(|label| label.eq_ignore_ascii_case("explicit"))
        .unwrap_or(false);
    // ISRC в web-player лежит в разных местах в зависимости от query
    // (track.isrc, externalIds.isrc). Пустые строки игнорируем.
    let isrc = [item.get("isrc"), item.pointer("/externalIds/isrc")]
        .into_iter()
        .flatten()
        .find_map(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let web_url = Url::parse(&format!("{WEB_URL}/track/{id}")).expect("track url");
    Some(TrackRef {
        provider: ProviderKind::Spotify,
        id,
        title,
        artists,
        duration_ms,
        artwork_url,
        web_url,
        capability: PlaybackCapability::Full,
        genres: Vec::new(),
        explicit,
        drm: true,
        isrc,
        origin: crate::model::TrackOrigin::Original,
        album_url,
        album_title,
    })
}

/// Извлекает список артистов из узла трека.
/// Поддерживает:
/// - items с profile.name (Pathfinder tracksV2)
/// - items с name (REST / fallback)
/// - плоский массив объектов с name
/// - плоский массив строк
pub fn extract_track_artists(node: &Value) -> Vec<String> {
    let raw_list = node
        .pointer("/artists/items")
        .and_then(Value::as_array)
        .or_else(|| node.get("artists").and_then(Value::as_array));
    let Some(list) = raw_list else {
        return Vec::new();
    };
    list.iter()
        .filter_map(|artist| {
            if let Some(s) = artist.as_str() {
                return Some(s.to_string());
            }
            artist
                .pointer("/profile/name")
                .or_else(|| artist.get("name"))
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .collect()
}

/// Маппер трека из tracksV2 (getAlbum) — отличается от map_pf_track
/// структурой duration/artists.
pub fn map_album_track(track: &Value) -> Option<TrackRef> {
    let uri = jstr(track, &["uri"]).or_else(|| jstr(track, &["_uri"]))?;
    let id = pf_bare_id(uri)?;
    if uri.starts_with("spotify:") && !uri.starts_with("spotify:track:") {
        return None;
    }
    let title = jstr(track, &["name"]).unwrap_or("Без названия").to_string();
    let artists = extract_track_artists(track);
    let duration_ms = track
        .pointer("/duration/totalMilliseconds")
        .or_else(|| track.pointer("/trackDuration/totalMilliseconds"))
        .or_else(|| track.get("duration_ms"))
        .and_then(Value::as_u64);
    let album_data = track.get("albumOfTrack").or_else(|| track.get("album"));
    let album_uri = album_data
        .and_then(|a| a.get("uri"))
        .and_then(Value::as_str);
    let album_id = album_uri.and_then(pf_bare_id);
    let album_url =
        album_id.and_then(|alb_id| Url::parse(&format!("{WEB_URL}/album/{alb_id}")).ok());
    let album_title = album_data
        .and_then(|a| a.get("name"))
        .and_then(Value::as_str)
        .map(str::to_string);

    let artwork_url = value_cover_art(track).or_else(|| album_data.and_then(value_cover_art));
    let explicit = track
        .pointer("/contentRating/label")
        .and_then(Value::as_str)
        .is_some_and(|l| l.eq_ignore_ascii_case("EXPLICIT"))
        || track
            .get("explicit")
            .and_then(Value::as_bool)
            .unwrap_or(false);
    let isrc = [track.get("isrc"), track.pointer("/externalIds/isrc")]
        .into_iter()
        .flatten()
        .find_map(|value| value.as_str())
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string);
    let web_url = Url::parse(&format!("{WEB_URL}/track/{id}")).expect("track url");
    Some(TrackRef {
        provider: ProviderKind::Spotify,
        id,
        title,
        artists,
        duration_ms,
        artwork_url,
        web_url,
        capability: PlaybackCapability::Full,
        genres: Vec::new(),
        explicit,
        drm: true,
        isrc,
        origin: crate::model::TrackOrigin::Original,
        album_url,
        album_title,
    })
}

/// Достаёт треки из ответа searchTracks: data.searchV2.tracksV2.items[].item.data
pub fn extract_pathfinder_tracks(value: &Value) -> Vec<TrackRef> {
    let Some(data) = value.get("data") else {
        return Vec::new();
    };
    let Some(search_v2) = data.get("searchV2") else {
        return Vec::new();
    };
    let Some(tracks_v2) = search_v2.get("tracksV2") else {
        return Vec::new();
    };
    let items = tracks_v2
        .get("items")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut out = Vec::new();
    for wrapper in items {
        let item = wrapper
            .get("item")
            .and_then(|v| v.get("data"))
            .unwrap_or(&wrapper);
        if let Some(track) = map_pf_track(item) {
            out.push(track);
        }
    }
    out
}

/// Достаёт артистов: data.searchV2.artists.items[].data
pub fn extract_pathfinder_artists(value: &Value) -> Vec<CollectionItem> {
    let items = jarray(value, &["data", "searchV2", "artists", "items"]);
    items
        .into_iter()
        .filter_map(|wrapper| {
            let item = wrapper.get("data").unwrap_or(&wrapper);
            let uri = jstr(item, &["uri"])?;
            let id = pf_bare_id(uri)?;
            let title = jstr(item, &["name"])
                .or_else(|| jstr(item, &["profile", "name"]))
                .unwrap_or("Неизвестный артист")
                .to_string();
            let artwork_url = item
                .get("visuals")
                .and_then(|v| v.get("avatarImage"))
                .and_then(|a| a.get("sources"))
                .and_then(Value::as_array)
                .and_then(|sources| best_image_source(sources))
                .and_then(|u| Url::parse(u).ok());
            let web_url = Url::parse(&format!("{WEB_URL}/artist/{id}")).expect("artist url");
            Some(CollectionItem {
                kind: CollectionKind::Artist,
                provider: ProviderKind::Spotify,
                id,
                title,
                subtitle: "Артист".to_string(),
                artwork_url,
                web_url,
                track_count: 0,
            })
        })
        .collect()
}

/// Достаёт альбомы: data.searchV2.albumsV2.items[].data
pub fn extract_pathfinder_albums(value: &Value) -> Vec<CollectionItem> {
    let items = jarray(value, &["data", "searchV2", "albumsV2", "items"]);
    items
        .into_iter()
        .filter_map(|wrapper| {
            let item = wrapper.get("data").unwrap_or(&wrapper);
            let uri = jstr(item, &["uri"])?;
            let id = pf_bare_id(uri)?;
            let title = jstr(item, &["name"]).unwrap_or("Без названия").to_string();
            let artists: String = item
                .get("artists")
                .and_then(|a| a.get("items"))
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
                .iter()
                .filter_map(|artist| {
                    artist
                        .get("profile")
                        .and_then(|p| p.get("name"))
                        .and_then(Value::as_str)
                })
                .collect::<Vec<_>>()
                .join(", ");
            let artwork_url = item
                .get("coverArt")
                .and_then(|c| c.get("sources"))
                .and_then(Value::as_array)
                .and_then(|sources| best_image_source(sources))
                .and_then(|u| Url::parse(u).ok());
            let date = jstr(item, &["date", "isoString"]).unwrap_or_default();
            let subtitle = if artists.is_empty() {
                if date.is_empty() {
                    "Альбом".to_string()
                } else {
                    format!("{date} · Альбом")
                }
            } else if date.is_empty() {
                artists
            } else {
                format!("{artists} · {date}")
            };
            let track_count = item
                .get("tracksV2")
                .and_then(|t| t.get("pagingInfo"))
                .and_then(|p| p.get("total"))
                .and_then(Value::as_u64)
                .or_else(|| {
                    item.get("tracksV2")
                        .and_then(|t| t.get("totalCount"))
                        .and_then(Value::as_u64)
                })
                .map(|c| c as usize)
                .filter(|&c| c > 0)
                .unwrap_or(1);
            let web_url = Url::parse(&format!("{WEB_URL}/album/{id}")).expect("album url");
            Some(CollectionItem {
                kind: CollectionKind::Album,
                provider: ProviderKind::Spotify,
                id,
                title,
                subtitle,
                artwork_url,
                web_url,
                track_count,
            })
        })
        .collect()
}

/// Достаёт плейлисты: data.searchV2.playlists.items[].data
pub fn extract_pathfinder_playlists(value: &Value) -> Vec<CollectionItem> {
    let items = jarray(value, &["data", "searchV2", "playlists", "items"]);
    items
        .into_iter()
        .filter_map(|wrapper| {
            let item = wrapper.get("data").unwrap_or(&wrapper);
            let uri = jstr(item, &["uri"])?;
            let id = pf_bare_id(uri)?;
            let title = jstr(item, &["name"]).unwrap_or("Без названия").to_string();
            let owner = item
                .get("ownerV2")
                .and_then(|o| o.get("data"))
                .and_then(|d| d.get("name"))
                .and_then(Value::as_str)
                .unwrap_or_default();
            let track_count = item
                .get("content")
                .and_then(|c| c.get("totalCount"))
                .and_then(Value::as_u64)
                .map(|c| c as usize)
                .filter(|&c| c > 0)
                .unwrap_or(1);
            let artwork_url = item
                .get("images")
                .and_then(|i| i.get("items"))
                .and_then(Value::as_array)
                .and_then(|items| items.first().or_else(|| items.last()))
                .and_then(|img| img.get("sources"))
                .and_then(Value::as_array)
                .and_then(|sources| best_image_source(sources))
                .and_then(|u| Url::parse(u).ok());
            let subtitle = if owner.is_empty() {
                if track_count > 1 {
                    format!("{} треков", track_count)
                } else {
                    "Плейлист".to_string()
                }
            } else if track_count > 1 {
                format!("{owner} · {track_count} треков")
            } else {
                format!("{owner} · Плейлист")
            };
            let web_url = Url::parse(&format!("{WEB_URL}/playlist/{id}")).expect("playlist url");
            Some(CollectionItem {
                kind: CollectionKind::Playlist,
                provider: ProviderKind::Spotify,
                id,
                title,
                subtitle,
                artwork_url,
                web_url,
                track_count,
            })
        })
        .collect()
}

/// Извлекает трек из различных вариантов обёрток ответа GraphQL Pathfinder:
/// - `{ "track": { "data": { ... } } }`
/// - `{ "item": { "data": { ... } } }`
/// - `{ "track": { "_uri": "...", "data": { ... } } }`
/// - `{ "item": { "_uri": "...", "data": { ... } } }`
/// - `{ "track": { ... } }`
/// - `{ "item": { ... } }`
/// - прямой объект трека
pub fn parse_album_track_wrapper(wrapper: &Value) -> Option<TrackRef> {
    // 1. Находим вложенный узел с метаданными трека
    let payload = wrapper
        .pointer("/item/data")
        .or_else(|| wrapper.pointer("/track/data"))
        .or_else(|| wrapper.get("data"))
        .or_else(|| wrapper.get("track"))
        .or_else(|| wrapper.get("item"))
        .unwrap_or(wrapper);

    // 2. Ищем URI или bare ID трека
    let uri_str = payload
        .get("uri")
        .or_else(|| payload.get("_uri"))
        .or_else(|| wrapper.pointer("/track/uri"))
        .or_else(|| wrapper.pointer("/track/_uri"))
        .or_else(|| wrapper.pointer("/item/uri"))
        .or_else(|| wrapper.pointer("/item/_uri"))
        .or_else(|| wrapper.pointer("/data/uri"))
        .or_else(|| wrapper.pointer("/data/_uri"))
        .or_else(|| wrapper.get("uri"))
        .or_else(|| wrapper.get("_uri"))
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty());

    let (_uri, id) = if let Some(u) = uri_str {
        if u.starts_with("spotify:") && !u.starts_with("spotify:track:") {
            return None;
        }
        let bare = pf_bare_id(u)?;
        (u.to_string(), bare)
    } else if let Some(raw_id) = payload
        .get("id")
        .or_else(|| wrapper.get("id"))
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
    {
        let bare = pf_bare_id(raw_id)?;
        (format!("spotify:track:{bare}"), bare)
    } else {
        return None;
    };

    // 3. Если payload уже имеет свой uri/name/artists — пробуем map_album_track / map_pf_track
    if let Some(mut t) = map_album_track(payload).or_else(|| map_pf_track(payload)) {
        if t.id.is_empty() {
            t.id = id;
            t.web_url = Url::parse(&format!("{WEB_URL}/track/{}", t.id)).ok()?;
        }
        if t.artwork_url.is_none() {
            t.artwork_url =
                value_cover_art(wrapper).or_else(|| wrapper.get("track").and_then(value_cover_art));
        }
        if t.album_title.is_none() {
            t.album_title = wrapper
                .pointer("/track/albumOfTrack/name")
                .or_else(|| wrapper.pointer("/albumOfTrack/name"))
                .or_else(|| payload.pointer("/albumOfTrack/name"))
                .or_else(|| payload.pointer("/album/name"))
                .and_then(Value::as_str)
                .map(str::to_string);
        }
        if t.album_url.is_none() {
            let a_uri = wrapper
                .pointer("/track/albumOfTrack/uri")
                .or_else(|| wrapper.pointer("/albumOfTrack/uri"))
                .or_else(|| payload.pointer("/albumOfTrack/uri"))
                .or_else(|| payload.pointer("/album/uri"))
                .and_then(Value::as_str);
            t.album_url = a_uri
                .and_then(pf_bare_id)
                .and_then(|alb_id| Url::parse(&format!("{WEB_URL}/album/{alb_id}")).ok());
        }
        return Some(t);
    }

    // 4. Если payload был без uri (например, _uri лежал на родителе) — собираем TrackRef
    let title = jstr(payload, &["name"])
        .or_else(|| jstr(wrapper, &["name"]))
        .unwrap_or("Без названия")
        .to_string();

    let artists = {
        let a = extract_track_artists(payload);
        if a.is_empty() {
            extract_track_artists(wrapper)
        } else {
            a
        }
    };

    let duration_ms = payload
        .pointer("/duration/totalMilliseconds")
        .or_else(|| payload.pointer("/trackDuration/totalMilliseconds"))
        .or_else(|| payload.get("duration_ms"))
        .or_else(|| wrapper.pointer("/duration/totalMilliseconds"))
        .or_else(|| wrapper.pointer("/trackDuration/totalMilliseconds"))
        .or_else(|| wrapper.get("duration_ms"))
        .and_then(Value::as_u64);

    let album_data = payload
        .get("albumOfTrack")
        .or_else(|| payload.get("album"))
        .or_else(|| wrapper.get("albumOfTrack"))
        .or_else(|| wrapper.get("album"));
    let album_uri = album_data
        .and_then(|a| a.get("uri"))
        .and_then(Value::as_str);
    let album_id = album_uri.and_then(pf_bare_id);
    let album_url =
        album_id.and_then(|alb_id| Url::parse(&format!("{WEB_URL}/album/{alb_id}")).ok());
    let album_title = album_data
        .and_then(|a| a.get("name"))
        .and_then(Value::as_str)
        .map(str::to_string);

    let artwork_url = value_cover_art(payload)
        .or_else(|| value_cover_art(wrapper))
        .or_else(|| album_data.and_then(value_cover_art));
    let explicit = payload
        .pointer("/contentRating/label")
        .and_then(Value::as_str)
        .is_some_and(|l| l.eq_ignore_ascii_case("EXPLICIT"))
        || payload
            .get("explicit")
            .and_then(Value::as_bool)
            .unwrap_or(false)
        || wrapper
            .pointer("/contentRating/label")
            .and_then(Value::as_str)
            .is_some_and(|l| l.eq_ignore_ascii_case("EXPLICIT"))
        || wrapper
            .get("explicit")
            .and_then(Value::as_bool)
            .unwrap_or(false);

    let isrc = [
        payload.get("isrc"),
        payload.pointer("/externalIds/isrc"),
        wrapper.get("isrc"),
        wrapper.pointer("/externalIds/isrc"),
    ]
    .into_iter()
    .flatten()
    .find_map(|value| value.as_str())
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .map(str::to_string);

    let web_url = Url::parse(&format!("{WEB_URL}/track/{id}")).ok()?;

    Some(TrackRef {
        provider: ProviderKind::Spotify,
        id,
        title,
        artists,
        duration_ms,
        artwork_url,
        web_url,
        capability: PlaybackCapability::Full,
        genres: Vec::new(),
        explicit,
        drm: true,
        isrc,
        origin: crate::model::TrackOrigin::Original,
        album_url,
        album_title,
    })
}

/// Достаёт треки из ответа getAlbum: data.albumUnion.discs/tracks/tracksV2
pub fn extract_album_tracks(value: &Value) -> Vec<TrackRef> {
    let mut out = Vec::new();
    let album = value
        .pointer("/data/albumUnion")
        .or_else(|| value.pointer("/data/album"))
        .or_else(|| value.get("albumUnion"))
        .or_else(|| value.get("album"))
        .unwrap_or(value);

    // 1. tracksV2.items[].track / .item.data (основной путь нового GraphQL Pathfinder)
    if let Some(items) = album
        .pointer("/tracksV2/items")
        .or_else(|| album.get("tracksV2"))
        .and_then(Value::as_array)
    {
        for wrapper in items {
            if let Some(t) = parse_album_track_wrapper(wrapper) {
                out.push(t);
            }
        }
    }

    // 2. tracks.items (классический Pathfinder)
    if out.is_empty() {
        if let Some(items) = album
            .pointer("/tracks/items")
            .or_else(|| album.get("tracks"))
            .and_then(Value::as_array)
        {
            for wrapper in items {
                if let Some(t) = parse_album_track_wrapper(wrapper) {
                    out.push(t);
                }
            }
        }
    }

    // 3. discs.items[].items[].item.data (старый/многодисковый путь с дисками)
    if out.is_empty() {
        if let Some(discs) = album
            .pointer("/discs/items")
            .or_else(|| album.pointer("/discList/items"))
            .or_else(|| album.get("discs"))
            .and_then(Value::as_array)
        {
            for disc in discs {
                let disc_items = disc
                    .get("items")
                    .or_else(|| disc.pointer("/tracks/items"))
                    .or_else(|| disc.get("tracks"))
                    .and_then(Value::as_array);

                if let Some(items) = disc_items {
                    for wrapper in items {
                        if let Some(t) = parse_album_track_wrapper(wrapper) {
                            out.push(t);
                        }
                    }
                }
            }
        }
    }

    out
}

/// Достаёт треки из ответа fetchPlaylist: data.playlistV2.content.items[].itemV2.data
pub fn extract_playlist_tracks(value: &Value) -> Vec<TrackRef> {
    let items = value
        .pointer("/data/playlistV2/content/items")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut out = Vec::new();
    for entry in items {
        let track = entry
            .get("itemV2")
            .and_then(|t| t.get("data"))
            .unwrap_or(&entry);
        if let Some(t) = map_pf_track(track) {
            out.push(t);
        }
    }
    out
}

/// Ключ сортировки релизов: дата из начала subtitle
/// («2026-05-29 · Сингл» → "2026-05-29", «2024 · EP» → "2024").
/// Релизы без даты уходят в конец (пустой ключ).
pub fn release_date_key(subtitle: &str) -> String {
    let date_part = subtitle.split(" · ").next().unwrap_or("").trim();
    let starts_with_year =
        date_part.chars().take(4).all(|c| c.is_ascii_digit()) && date_part.len() >= 4;
    if starts_with_year {
        date_part.to_string()
    } else {
        String::new()
    }
}

/// Единый порядок релизов: по дате выпуска, новые → старые.
/// ISO-даты сравниваются строково — «2026-05-29» > «2026» > «2024-09-13».
pub fn sort_releases_by_date(releases: &mut [CollectionItem]) {
    releases.sort_by(|a, b| release_date_key(&b.subtitle).cmp(&release_date_key(&a.subtitle)));
}

/// Один release-объект Pathfinder (uri/name/coverArt/date/type/tracks) →
/// CollectionItem. Общая логика для overview-групп и discography/all.
pub fn pf_release_to_item(item: &Value, seen: &mut HashSet<String>) -> Option<CollectionItem> {
    let id = jstr(item, &["uri"]).and_then(pf_bare_id)?;
    if !seen.insert(id.clone()) {
        return None;
    }
    let title = jstr(item, &["name"]).unwrap_or("Без названия").to_string();
    let artwork_url = item
        .get("coverArt")
        .and_then(|c| c.get("sources"))
        .and_then(Value::as_array)
        .and_then(|sources| best_image_source(sources))
        .and_then(|u| Url::parse(u).ok());
    let year = item.pointer("/date/year").and_then(Value::as_u64);
    let month = item.pointer("/date/month").and_then(Value::as_u64);
    let day = item.pointer("/date/day").and_then(Value::as_u64);
    let date = match (year, month, day) {
        (Some(y), Some(m), Some(d)) => format!("{y:04}-{m:02}-{d:02}"),
        (Some(y), Some(m), None) => format!("{y:04}-{m:02}"),
        (Some(y), None, None) => format!("{y:04}"),
        _ => String::new(),
    };
    let record = match jstr(item, &["type"]) {
        Some("SINGLE") => "Сингл",
        Some("EP") => "EP",
        Some("COMPILATION") => "Сборник",
        _ => "Альбом",
    };
    let subtitle = if date.is_empty() {
        record.to_string()
    } else {
        format!("{date} · {record}")
    };
    let track_count = item
        .pointer("/tracks/totalCount")
        .and_then(Value::as_u64)
        .unwrap_or(0) as usize;
    let web_url = Url::parse(&format!("{WEB_URL}/album/{id}")).expect("album url");
    Some(CollectionItem {
        kind: CollectionKind::Album,
        provider: ProviderKind::Spotify,
        id,
        title,
        subtitle,
        artwork_url,
        web_url,
        track_count,
    })
}

/// Собирает релизы артиста из overview artistUnion.discography:
/// albums + singles + compilations. Каждая группа — items[].releases.items[].
pub fn collect_discography_releases(discography: &Value) -> Vec<CollectionItem> {
    let mut releases = Vec::new();
    let mut seen = HashSet::new();
    for key in ["albums", "singles", "compilations"] {
        let Some(group) = discography.get(key) else {
            continue;
        };
        let Some(items) = group.get("items").and_then(Value::as_array) else {
            continue;
        };
        for wrapper in items {
            let Some(inner) = wrapper
                .get("releases")
                .and_then(|r| r.get("items"))
                .and_then(Value::as_array)
            else {
                continue;
            };
            for item in inner {
                if let Some(release) = pf_release_to_item(item, &mut seen) {
                    releases.push(release);
                }
            }
        }
    }
    // Совместные релизы («Kai Angel & 9mice — Heavy Metal») в overview
    // отсутствуют: Spotify кладёт их только в «appears on» и в полный
    // discography/all (структура: items[].releases.items[], как у групп).
    for key in ["appearsOn"] {
        if let Some(items) = discography
            .get(key)
            .and_then(|group| group.get("items"))
            .and_then(Value::as_array)
        {
            for wrapper in items {
                if let Some(inner) = wrapper
                    .get("releases")
                    .and_then(|r| r.get("items"))
                    .and_then(Value::as_array)
                {
                    for item in inner {
                        if let Some(release) = pf_release_to_item(item, &mut seen) {
                            releases.push(release);
                        }
                    }
                }
            }
        }
    }
    // Плоский дискография-all (queryArtistDiscographyAll): items[].releases.items[]
    if let Some(items) = discography
        .get("all")
        .and_then(|all| all.get("items"))
        .and_then(Value::as_array)
    {
        for wrapper in items {
            if let Some(inner) = wrapper
                .get("releases")
                .and_then(|r| r.get("items"))
                .and_then(Value::as_array)
            {
                for item in inner {
                    if let Some(release) = pf_release_to_item(item, &mut seen) {
                        releases.push(release);
                    }
                }
            }
        }
    }
    releases
}
