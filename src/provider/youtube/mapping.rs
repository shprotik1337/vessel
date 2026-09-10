use serde_json::Value;
use url::Url;

use crate::{
    model::{PlaybackCapability, ProviderKind, TrackRef},
    provider::{CollectionItem, CollectionKind},
};

/// Маппит трек из search/browse-ответа с обложкой.
pub fn normalize_track(video_id: &str, title: &str, artists: Vec<String>, duration_ms: Option<u64>, thumbnail: Option<&Value>) -> TrackRef {
    let artwork_url = thumbnail
        .and_then(|t| t.get("thumbnails"))
        .and_then(Value::as_array)
        .and_then(|items| items.last())
        .and_then(|last| last.get("url"))
        .and_then(Value::as_str)
        .and_then(|url| {
            let mut url = url.to_string();
            if url.starts_with("//") {
                url.insert_str(0, "https:");
            }
            Url::parse(&url).ok()
        });

    let web_url = Url::parse(&format!("https://music.youtube.com/watch?v={video_id}"))
        .unwrap_or_else(|_| Url::parse("https://music.youtube.com").unwrap());

    TrackRef {
        provider: ProviderKind::YouTubeMusic,
        id: video_id.to_string(),
        title: if title.trim().is_empty() { "Без названия".to_string() } else { title.to_string() },
        artists,
        duration_ms,
        artwork_url,
        web_url,
        capability: PlaybackCapability::Full,
        genres: Vec::new(),
        explicit: false,
        drm: false,
            isrc: None,
    }
}

/// Маппит коллекцию из browse-ответа.
pub fn normalize_collection(
    browse_id: &str,
    title: &str,
    subtitle: &str,
    kind: CollectionKind,
    thumbnail: Option<&Value>,
    track_count: usize,
) -> CollectionItem {
    let artwork_url = thumbnail
        .and_then(|t| t.get("thumbnails"))
        .and_then(Value::as_array)
        .and_then(|items| items.last())
        .and_then(|last| last.get("url"))
        .and_then(Value::as_str)
        .and_then(|url| {
            let mut url = url.to_string();
            if url.starts_with("//") {
                url.insert_str(0, "https:");
            }
            Url::parse(&url).ok()
        });

    let web_url = Url::parse(&format!("https://music.youtube.com/browse/{browse_id}"))
        .unwrap_or_else(|_| Url::parse("https://music.youtube.com").unwrap());

    CollectionItem {
        kind,
        provider: ProviderKind::YouTubeMusic,
        id: browse_id.to_string(),
        title: title.to_string(),
        subtitle: subtitle.to_string(),
        artwork_url,
        web_url,
        track_count,
    }
}