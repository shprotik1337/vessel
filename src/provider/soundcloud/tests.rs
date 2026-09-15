use serde_json::json;
use url::Url;

use crate::model::{PlaybackCapability, ProviderKind};

use super::{ScPlaylist, ScTrack, normalizovat_track, proverit_soundcloud_url};

#[test]
fn numeric_id_is_not_lost_in_json() {
    let track: ScTrack = serde_json::from_value(json!({
        "id": 123456789012345u64,
        "title": "Трек",
        "duration": 180000,
        "artwork_url": "https://i1.sndcdn.com/artworks-test-large.jpg",
        "permalink_url": "https://soundcloud.com/user/track",
        "genre": "Electronic",
        "access": "preview",
        "user": {"username": "Автор"}
    }))
    .unwrap();
    let track = normalizovat_track(track).unwrap();
    assert_eq!(track.provider, ProviderKind::SoundCloud);
    assert_eq!(track.id, "123456789012345");
    assert_eq!(track.artists, vec!["Автор"]);
    assert_eq!(track.genres, vec!["Electronic"]);
    assert_eq!(
        track.capability,
        PlaybackCapability::Preview { seconds: 30 }
    );
}

#[test]
fn blocked_track_stays_metadata_only() {
    let track: ScTrack = serde_json::from_value(json!({
        "id": "soundcloud:tracks:42",
        "title": "Закрыто",
        "access": "blocked",
        "user": {"username": "Автор"}
    }))
    .unwrap();
    assert!(matches!(
        normalizovat_track(track).unwrap().capability,
        PlaybackCapability::Unavailable { .. }
    ));
}

#[test]
fn partial_playlist_track_survives_json() {
    let playlist: ScPlaylist = serde_json::from_value(json!({
        "id": 7,
        "kind": "playlist",
        "title": "Набор",
        "tracks": [{"id": 42}]
    }))
    .unwrap();
    assert_eq!(playlist.kind, "playlist");
    assert_eq!(playlist.tracks[0].id, "42");
    assert!(playlist.tracks[0].user.username.is_empty());
}

#[test]
fn fake_soundcloud_host_goes_away() {
    assert!(
        proverit_soundcloud_url(
            &Url::parse("https://soundcloud.com.evil.example/user/set").unwrap()
        )
        .is_err()
    );
    assert!(
        proverit_soundcloud_url(&Url::parse("https://soundcloud.com/user/set").unwrap()).is_ok()
    );
}

#[tokio::test]
#[ignore]
async fn test_live_soundcloud_search_and_playback() {
    use crate::provider::MusicProvider;
    let client_id = super::discover::discover_client_id().await.unwrap();
    let provider = super::SoundCloudProvider::new(client_id).unwrap();
    let page = provider.search("nirvana", None).await.unwrap();
    assert!(!page.tracks.is_empty(), "должны найтись треки SoundCloud");

    println!("Найдено {} треков SoundCloud", page.tracks.len());
    for track in &page.tracks[..3] {
        println!("Пробуем resolve для '{}' ({:?})...", track.title, track.capability);
        let source = provider.playback_source(track).await.unwrap();
        println!("Успешно: {} (mime: {:?})", source.url, source.mime_type);
        assert!(!source.url.as_str().is_empty());
    }
}
