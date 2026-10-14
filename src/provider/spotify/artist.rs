use std::collections::HashSet;
use std::time::Duration;

use anyhow::{Context, Result};
use serde_json::Value;
use url::Url;

use crate::{model::TrackRef, provider::ArtistProfile};

use super::{
    SpotifyProvider,
    client::{ARTIST_DISCOGRAPHY_HASH, ARTIST_OVERVIEW_HASH, GET_ALBUM_HASH},
    mapping::{
        collect_discography_releases, extract_album_tracks, jstr, map_pf_track,
        parse_album_track_wrapper, sort_releases_by_date,
    },
};

pub async fn artist_profile(
    provider: &SpotifyProvider,
    artist_id: &str,
) -> Result<ArtistProfile> {
    let variables = serde_json::json!({
        "uri": format!("spotify:artist:{artist_id}"),
        "locale": "",
    });
    let value = provider
        .pathfinder("queryArtistOverview", ARTIST_OVERVIEW_HASH, variables)
        .await?;
    let artist = value
        .pointer("/data/artistUnion")
        .context("Pathfinder не вернул artistUnion")?;
    let name = jstr(artist, &["profile", "name"])
        .unwrap_or("Неизвестный артист")
        .to_string();
    let avatar_url = artist
        .get("visuals")
        .and_then(|v| v.get("avatarImage"))
        .and_then(|a| a.get("sources"))
        .and_then(Value::as_array)
        .and_then(|sources| sources.iter().last())
        .and_then(|s| s.get("url"))
        .and_then(Value::as_str)
        .and_then(|u| Url::parse(u).ok());
    let popular_tracks: Vec<TrackRef> = artist
        .get("discography")
        .and_then(|d| d.get("topTracks"))
        .and_then(|t| t.get("items"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .iter()
        .filter_map(|wrapper| {
            parse_album_track_wrapper(wrapper)
                .or_else(|| wrapper.get("track").and_then(map_pf_track))
        })
        .collect();

    // Релизы лежат в discography.albums, singles, compilations (не all!).
    // Совместные альбомы («Kai Angel & 9mice — HEAVY METAL») в overview
    // отсутствуют — дополняем полным дискография-all запросом.
    let discography = artist.get("discography").cloned().unwrap_or(Value::Null);
    let mut releases = collect_discography_releases(&discography);
    {
        let variables = serde_json::json!({
            "uri": format!("spotify:artist:{artist_id}"),
            "offset": 0,
            "limit": 50,
        });
        if let Ok(all_value) = provider
            .pathfinder(
                "queryArtistDiscographyAll",
                ARTIST_DISCOGRAPHY_HASH,
                variables,
            )
            .await
        {
            let all = all_value
                .pointer("/data/artistUnion/discography")
                .cloned()
                .unwrap_or(Value::Null);
            for release in collect_discography_releases(&all) {
                if !releases.iter().any(|r| r.id == release.id) {
                    releases.push(release);
                }
            }
        }
    }
    // Единый порядок по дате выхода: новые → старые, альбомы и синглы
    // вперемешку (как в Deezer/Yandex), а не группами по типу.
    sort_releases_by_date(&mut releases);

    Ok(ArtistProfile {
        name,
        avatar_url,
        popular_tracks,
        releases,
    })
}

pub async fn artist_all_tracks(
    provider: &SpotifyProvider,
    artist_id: &str,
) -> Result<Vec<TrackRef>> {
    let mut seen = HashSet::new();
    let mut tracks = Vec::new();

    let variables = serde_json::json!({
        "uri": format!("spotify:artist:{artist_id}"),
        "locale": "",
    });
    let overview_value = provider
        .pathfinder("queryArtistOverview", ARTIST_OVERVIEW_HASH, variables)
        .await?;

    let artist_union = overview_value.pointer("/data/artistUnion");
    if artist_union.is_none() {
        crate::dlog!("[spotify] queryArtistOverview returned no artistUnion for {artist_id}");
    }
    let discography = artist_union
        .and_then(|a| a.get("discography"))
        .cloned()
        .unwrap_or(Value::Null);

    // Популярные треки первыми
    if let Some(top) = discography
        .get("topTracks")
        .and_then(|t| t.get("items"))
        .and_then(Value::as_array)
    {
        for wrapper in top {
            if let Some(t) = parse_album_track_wrapper(wrapper)
                .or_else(|| wrapper.get("track").and_then(map_pf_track))
            {
                if seen.insert(t.provider_key()) {
                    tracks.push(t);
                }
            }
        }
    }

    let mut releases = collect_discography_releases(&discography);

    // Дополняем дискографию-all, если доступна (совместные релизы)
    {
        let discography_vars = serde_json::json!({
            "uri": format!("spotify:artist:{artist_id}"),
            "offset": 0,
            "limit": 50,
        });
        if let Ok(all_value) = provider
            .pathfinder(
                "queryArtistDiscographyAll",
                ARTIST_DISCOGRAPHY_HASH,
                discography_vars,
            )
            .await
        {
            let all = all_value
                .pointer("/data/artistUnion/discography")
                .cloned()
                .unwrap_or(Value::Null);
            for release in collect_discography_releases(&all) {
                if !releases.iter().any(|r| r.id == release.id) {
                    releases.push(release);
                }
            }
        }
    }

    if releases.is_empty() {
        return Ok(tracks);
    }

    // Вся музыка идёт по свежим релизам: порядок как в карточке артиста
    sort_releases_by_date(&mut releases);

    for release in &releases {
        let album_vars = serde_json::json!({
            "uri": format!("spotify:album:{}", release.id),
            "locale": "",
            "offset": 0,
            "limit": 50,
        });
        match provider
            .pathfinder("getAlbum", GET_ALBUM_HASH, album_vars)
            .await
        {
            Ok(album_value) => {
                let album_tracks = extract_album_tracks(&album_value);
                if album_tracks.is_empty() {
                    crate::dlog!(
                        "[spotify] getAlbum {} returned 0 tracks. Album response keys: {:?}",
                        release.id,
                        album_value
                            .pointer("/data/albumUnion")
                            .and_then(|u| u.as_object())
                            .map(|o| o.keys().collect::<Vec<_>>())
                    );
                }
                for mut track in album_tracks {
                    // Обложку и метаданные альбома — каждому треку
                    if track.artwork_url.is_none() {
                        track.artwork_url = release.artwork_url.clone();
                    }
                    if track.album_title.is_none() {
                        track.album_title = Some(release.title.clone());
                    }
                    if track.album_url.is_none() {
                        track.album_url = Some(release.web_url.clone());
                    }
                    if seen.insert(track.provider_key()) {
                        tracks.push(track);
                    }
                }
            }
            Err(e) => {
                crate::dlog!("[spotify] getAlbum {} failed: {e:#}", release.id);
            }
        }
        tokio::time::sleep(Duration::from_millis(40)).await;
    }
    Ok(tracks)
}
