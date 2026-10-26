use serde::Deserialize;
use serde_json::Value;
use url::Url;

use crate::{
    model::{PlaybackCapability, ProviderKind, TrackRef},
    provider::{CollectionItem, CollectionKind},
};

#[derive(Deserialize)]
pub struct ApiPage<T> {
    #[serde(default)]
    pub data: Vec<T>,
    pub next: Option<String>,
}

#[derive(Deserialize)]
pub struct ApiPlaylist {
    pub title: Option<String>,
    pub description: Option<String>,
    pub cover_xl: Option<String>,
    pub cover_big: Option<String>,
    pub tracks: ApiPage<ApiTrack>,
}

#[allow(dead_code)]
#[derive(Deserialize)]
pub struct ApiUser {
    pub id: Option<u64>,
}

#[derive(Deserialize)]
pub struct ApiAlbumDetails {
    pub title: Option<String>,
    pub artist: Option<ApiArtist>,
    pub cover_xl: Option<String>,
    pub cover_big: Option<String>,
    pub tracks: ApiPage<ApiTrack>,
}

#[derive(Default, Deserialize)]
pub struct ApiTrack {
    pub id: Option<u64>,
    pub title: Option<String>,
    pub duration: Option<u64>,
    pub link: Option<String>,
    pub explicit_lyrics: Option<bool>,
    pub isrc: Option<String>,
    pub artist: Option<ApiArtist>,
    pub album: Option<ApiAlbum>,
}

#[derive(Deserialize)]
pub struct ApiArtist {
    pub name: Option<String>,
}

#[derive(Deserialize)]
pub struct ApiAlbum {
    pub id: Option<u64>,
    pub title: Option<String>,
    pub cover_xl: Option<String>,
    pub cover_big: Option<String>,
}

#[derive(Deserialize)]
pub struct ApiCollectionPage<T> {
    pub data: Vec<T>,
    pub next: Option<String>,
}

#[derive(Deserialize)]
pub struct ApiArtistEntry {
    pub id: Option<u64>,
    pub name: Option<String>,
    pub link: Option<String>,
    pub picture_xl: Option<String>,
    pub picture_big: Option<String>,
    #[serde(default)]
    pub nb_fan: Option<u64>,
}

#[allow(dead_code)]
#[derive(Deserialize)]
pub struct ApiArtistFull {
    pub id: Option<u64>,
    pub name: Option<String>,
    pub link: Option<String>,
    pub picture_xl: Option<String>,
    pub picture_big: Option<String>,
}

#[derive(Deserialize)]
pub struct ApiAlbumRelease {
    pub id: Option<u64>,
    pub title: Option<String>,
    pub link: Option<String>,
    pub cover_xl: Option<String>,
    pub cover_big: Option<String>,
    pub release_date: Option<String>,
    pub record_type: Option<String>,
}

impl ApiArtistEntry {
    pub fn to_collection_item(self) -> Option<CollectionItem> {
        let id = self.id?.to_string();
        let web_url = self
            .link
            .and_then(|value| Url::parse(&value).ok())
            .unwrap_or_else(|| Url::parse(&format!("https://www.deezer.com/artist/{id}")).unwrap());
        let artwork_url = self
            .picture_xl
            .or(self.picture_big)
            .and_then(|value| Url::parse(&value).ok());
        let fans = self
            .nb_fan
            .map(|count| format!(" · {count} слушателей"))
            .unwrap_or_default();
        Some(CollectionItem {
            kind: CollectionKind::Artist,
            provider: ProviderKind::Deezer,
            id,
            title: non_empty(self.name, "Неизвестный артист"),
            subtitle: format!("Артист{fans}"),
            artwork_url,
            web_url,
            track_count: 0,
        })
    }
}

#[derive(Deserialize)]
pub struct ApiCollectionEntry {
    pub id: Option<u64>,
    pub title: Option<String>,
    pub link: Option<String>,
    pub nb_tracks: Option<u64>,
    pub artist: Option<ApiArtist>,
    pub cover_xl: Option<String>,
    pub cover_big: Option<String>,
}

impl ApiCollectionEntry {
    pub fn to_collection_item(self, kind: CollectionKind) -> Option<CollectionItem> {
        let id = self.id?.to_string();
        let web_url = self
            .link
            .and_then(|value| Url::parse(&value).ok())
            .unwrap_or_else(|| {
                let endpoint = match kind {
                    CollectionKind::Playlist => "playlist",
                    CollectionKind::Album => "album",
                    CollectionKind::Artist => "artist",
                };
                Url::parse(&format!("https://www.deezer.com/{endpoint}/{id}")).unwrap()
            });
        let artwork_url = self
            .cover_xl
            .or(self.cover_big)
            .and_then(|value| Url::parse(&value).ok());
        let subtitle = self
            .artist
            .and_then(|artist| artist.name)
            .unwrap_or_else(|| format!("{} треков", self.nb_tracks.unwrap_or(0)));
        Some(CollectionItem {
            kind,
            provider: ProviderKind::Deezer,
            id,
            title: non_empty(self.title, "Без названия"),
            subtitle,
            artwork_url,
            web_url,
            track_count: self.nb_tracks.unwrap_or(0) as usize,
        })
    }
}

pub fn map_track(track: ApiTrack) -> Option<TrackRef> {
    let id = track.id?.to_string();
    Some(TrackRef {
        provider: ProviderKind::Deezer,
        id: id.clone(),
        title: non_empty(track.title, "Без названия"),
        artists: track
            .artist
            .and_then(|artist| artist.name)
            .into_iter()
            .collect(),
        duration_ms: track.duration.map(|seconds| seconds.saturating_mul(1000)),
        artwork_url: track
            .album
            .as_ref()
            .and_then(|album| album.cover_xl.as_ref().or(album.cover_big.as_ref()))
            .and_then(|url| Url::parse(url).ok()),
        web_url: track
            .link
            .and_then(|url| Url::parse(&url).ok())
            .unwrap_or_else(|| Url::parse(&format!("https://www.deezer.com/track/{id}")).unwrap()),
        capability: PlaybackCapability::Full,
        genres: Vec::new(),
        explicit: track.explicit_lyrics.unwrap_or(false),
        drm: true,
        isrc: track.isrc.filter(|value| !value.trim().is_empty()),
        origin: crate::model::TrackOrigin::Original,
        album_url: track
            .album
            .as_ref()
            .and_then(|a| a.id)
            .and_then(|alb_id| Url::parse(&format!("https://www.deezer.com/album/{alb_id}")).ok()),
        album_title: track.album.as_ref().and_then(|a| a.title.clone()),
    })
}

pub fn non_empty(value: Option<String>, fallback: &str) -> String {
    value
        .filter(|value| !value.trim().is_empty())
        .unwrap_or_else(|| fallback.to_string())
}

pub fn raw_value(raw: &Value, key: &str) -> String {
    raw.get(key)
        .or_else(|| raw.get("FALLBACK").and_then(|fallback| fallback.get(key)))
        .map(|value| match value {
            Value::String(value) => value.clone(),
            _ => value.to_string(),
        })
        .unwrap_or_default()
}

pub trait PipeOptionString {
    fn pipe_option_string(self) -> Option<String>;
}

impl PipeOptionString for String {
    fn pipe_option_string(self) -> Option<String> {
        let trimmed = self.trim();
        (!trimmed.is_empty()).then(|| trimmed.to_string())
    }
}

pub fn map_favorite_song(raw: &Value) -> Option<TrackRef> {
    let id = raw_value(raw, "SNG_ID");
    if id.is_empty() || id == "0" {
        return None;
    }
    let title = raw_value(raw, "SNG_TITLE");
    let artist = raw_value(raw, "ART_NAME");
    let album_id = raw_value(raw, "ALB_ID");
    let picture = raw_value(raw, "ALB_PICTURE");
    let duration_s = raw_value(raw, "DURATION").parse::<u64>().unwrap_or(0);
    let artwork_url = if picture.is_empty() {
        None
    } else {
        Url::parse(&format!(
            "https://e-cdns-images.dzcdn.net/images/cover/{picture}/500x500-000000-80-0-0.jpg"
        ))
        .ok()
    };
    Some(TrackRef {
        provider: ProviderKind::Deezer,
        id: id.clone(),
        title: if title.is_empty() {
            "Без названия".to_string()
        } else {
            title
        },
        artists: if artist.is_empty() {
            Vec::new()
        } else {
            vec![artist]
        },
        duration_ms: (duration_s > 0).then_some(duration_s.saturating_mul(1000)),
        artwork_url,
        web_url: album_id
            .parse::<u64>()
            .ok()
            .and_then(|_| Url::parse(&format!("https://www.deezer.com/album/{album_id}")).ok())
            .unwrap_or_else(|| Url::parse(&format!("https://www.deezer.com/track/{id}")).unwrap()),
        capability: PlaybackCapability::Full,
        genres: Vec::new(),
        explicit: false,
        drm: true,
        isrc: raw_value(raw, "ISRC").pipe_option_string(),
        origin: crate::model::TrackOrigin::Original,
        album_url: album_id
            .parse::<u64>()
            .ok()
            .and_then(|_| Url::parse(&format!("https://www.deezer.com/album/{album_id}")).ok()),
        album_title: {
            let alb_title = raw_value(raw, "ALB_TITLE");
            if alb_title.is_empty() {
                None
            } else {
                Some(alb_title)
            }
        },
    })
}
