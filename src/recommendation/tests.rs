use std::collections::HashSet;

use crate::{
    model::{ProviderKind, TrackRef},
    provider::{CollectionItem, CollectionKind},
    wave::{is_valid_artist_name, WaveGenreProfile},
};

use super::{
    parse_provider_filter,
    scoring::{balance_collections, balance_providers_organic},
};

fn make_test_track(provider: ProviderKind, id: &str, title: &str, artist: &str) -> TrackRef {
    TrackRef {
        provider,
        id: id.to_string(),
        title: title.to_string(),
        artists: vec![artist.to_string()],
        duration_ms: Some(180_000),
        artwork_url: None,
        web_url: url::Url::parse("https://example.com").unwrap(),
        capability: crate::model::PlaybackCapability::Full,
        genres: Vec::new(),
        explicit: false,
        drm: false,
        isrc: None,
        origin: crate::model::TrackOrigin::Original,
        album_url: None,
        album_title: None,
    }
}

#[test]
fn balance_providers_organic_interleaves_without_starving_and_limits_streak() {
    let allowed = [ProviderKind::Spotify, ProviderKind::SoundCloud, ProviderKind::Deezer];
    let mut tracks = Vec::new();
    for i in 0..10 {
        tracks.push(make_test_track(ProviderKind::Spotify, &format!("sp_{i}"), &format!("SP Track {i}"), "Carti"));
    }
    for i in 0..10 {
        tracks.push(make_test_track(ProviderKind::SoundCloud, &format!("sc_{i}"), &format!("SC Track {i}"), "Kai"));
    }
    for i in 0..10 {
        tracks.push(make_test_track(ProviderKind::Deezer, &format!("dz_{i}"), &format!("DZ Track {i}"), "Travis"));
    }

    let balanced = balance_providers_organic(tracks, 18, &allowed);
    assert_eq!(balanced.len(), 18);

    let mut current_streak = 0;
    let mut last_prov = None;
    for t in &balanced {
        if Some(t.provider) == last_prov {
            current_streak += 1;
            assert!(current_streak <= 3, "Provider streak must not exceed 3 (got {current_streak})");
        } else {
            current_streak = 1;
            last_prov = Some(t.provider);
        }
    }

    let sp_count = balanced.iter().filter(|t| t.provider == ProviderKind::Spotify).count();
    let sc_count = balanced.iter().filter(|t| t.provider == ProviderKind::SoundCloud).count();
    let dz_count = balanced.iter().filter(|t| t.provider == ProviderKind::Deezer).count();
    assert!(sp_count >= 3, "Spotify must get a fair share, got {sp_count}");
    assert!(sc_count >= 3, "SoundCloud must get a fair share, got {sc_count}");
    assert!(dz_count >= 3, "Deezer must get a fair share, got {dz_count}");
}

#[test]
fn artist_validation_and_junk_detection() {
    assert!(is_valid_artist_name("Playboi Carti"));
    assert!(is_valid_artist_name("Kai Angel"));
    assert!(is_valid_artist_name("9mice"));
    assert!(!is_valid_artist_name("Various Artists"));
    assert!(!is_valid_artist_name("SoundCloud"));
    assert!(!is_valid_artist_name("trap leaks podcast"));
}

#[test]
fn tracklike_filter_rejects_podcasts_and_videos() {
    let good_track = make_test_track(ProviderKind::Spotify, "1", "FEIN", "Travis Scott");
    assert!(crate::wave::is_tracklike(&good_track));

    let podcast = make_test_track(ProviderKind::SoundCloud, "2", "Episode 12: Politics Podcast", "News Radio");
    assert!(!crate::wave::is_tracklike(&podcast));

    let video = make_test_track(ProviderKind::YouTubeMusic, "3", "Song Title (Official Video)", "Artist");
    assert!(!crate::wave::is_tracklike(&video));
}

#[test]
fn genre_profile_scores_similar_tracks() {
    let library = vec![
        make_test_track(ProviderKind::Spotify, "1", "Stop Breathing (Rage Rap)", "Playboi Carti"),
        make_test_track(ProviderKind::SoundCloud, "2", "Heavy Metal Trap", "Kai Angel"),
    ];
    let profile = WaveGenreProfile::from_tracks(&library);
    assert!(!profile.is_empty());

    let matching = make_test_track(ProviderKind::Spotify, "3", "Dark Trap Rap", "Ken Carson");
    assert!(profile.similarity(&matching) > 0.0);
}

#[test]
fn balance_collections_preserves_uniqueness_and_interleaves() {
    let allowed = [ProviderKind::Deezer, ProviderKind::Spotify, ProviderKind::SoundCloud];
    let dummy_url = url::Url::parse("https://example.com").unwrap();
    let items = vec![
        CollectionItem {
            id: "dz1".into(),
            provider: ProviderKind::Deezer,
            kind: CollectionKind::Artist,
            title: "Kai Angel".into(),
            subtitle: "Artist".into(),
            artwork_url: None,
            web_url: dummy_url.clone(),
            track_count: 0,
        },
        CollectionItem {
            id: "sp1".into(),
            provider: ProviderKind::Spotify,
            kind: CollectionKind::Artist,
            title: "Evanescence".into(),
            subtitle: "Artist".into(),
            artwork_url: None,
            web_url: dummy_url.clone(),
            track_count: 0,
        },
        CollectionItem {
            id: "sc1".into(),
            provider: ProviderKind::SoundCloud,
            kind: CollectionKind::Artist,
            title: "damnenby".into(),
            subtitle: "Artist".into(),
            artwork_url: None,
            web_url: dummy_url.clone(),
            track_count: 0,
        },
        CollectionItem {
            id: "dz2".into(),
            provider: ProviderKind::Deezer,
            kind: CollectionKind::Artist,
            title: "9mice".into(),
            subtitle: "Artist".into(),
            artwork_url: None,
            web_url: dummy_url.clone(),
            track_count: 0,
        },
    ];

    let balanced = balance_collections(items, 4, &allowed);
    assert_eq!(balanced.len(), 4);
    let names: HashSet<_> = balanced.iter().map(|item| item.title.as_str()).collect();
    assert_eq!(names.len(), 4, "Every artist must be unique in the balanced row");
}

#[test]
fn provider_filter_preserves_order_and_sets_primary() {
    let spotify_first = parse_provider_filter(Some("spotify,soundcloud")).unwrap();
    assert_eq!(spotify_first, vec![ProviderKind::Spotify, ProviderKind::SoundCloud]);
    assert_eq!(spotify_first[0], ProviderKind::Spotify, "First specified provider must be primary");

    let soundcloud_first = parse_provider_filter(Some("soundcloud,spotify")).unwrap();
    assert_eq!(soundcloud_first, vec![ProviderKind::SoundCloud, ProviderKind::Spotify]);
    assert_eq!(soundcloud_first[0], ProviderKind::SoundCloud, "First specified provider must be primary");

    let single = parse_provider_filter(Some("spotify")).unwrap();
    assert_eq!(single, vec![ProviderKind::Spotify]);

    let all = parse_provider_filter(Some("all"));
    assert!(all.is_none(), "All should map to None (all available)");
}

#[test]
fn balance_providers_two_providers_fair_quota_and_strict_streak() {
    let allowed = [ProviderKind::SoundCloud, ProviderKind::Spotify];
    let mut tracks = Vec::new();
    for i in 0..12 {
        tracks.push(make_test_track(ProviderKind::SoundCloud, &format!("sc_{i}"), &format!("SC {i}"), "Artist SC"));
    }
    for i in 0..12 {
        tracks.push(make_test_track(ProviderKind::Spotify, &format!("sp_{i}"), &format!("SP {i}"), "Artist SP"));
    }

    let balanced = balance_providers_organic(tracks, 16, &allowed);
    assert_eq!(balanced.len(), 16);

    let sc_count = balanced.iter().filter(|t| t.provider == ProviderKind::SoundCloud).count();
    let sp_count = balanced.iter().filter(|t| t.provider == ProviderKind::Spotify).count();
    assert_eq!(sc_count, 8, "SoundCloud should get exactly 50% fair share (8/16)");
    assert_eq!(sp_count, 8, "Spotify should get exactly 50% fair share (8/16)");

    let mut current_streak = 0;
    let mut last_prov = None;
    for t in &balanced {
        if Some(t.provider) == last_prov {
            current_streak += 1;
            assert!(current_streak <= 2, "Streak with alternative candidates must be <= 2, got {current_streak}");
        } else {
            current_streak = 1;
            last_prov = Some(t.provider);
        }
    }
}

#[test]
fn balance_providers_handles_provider_exhaustion_without_panic() {
    let allowed = [ProviderKind::SoundCloud, ProviderKind::Spotify];
    let mut tracks = Vec::new();
    for i in 0..10 {
        tracks.push(make_test_track(ProviderKind::SoundCloud, &format!("sc_{i}"), &format!("SC {i}"), "Artist SC"));
    }
    for i in 0..2 {
        tracks.push(make_test_track(ProviderKind::Spotify, &format!("sp_{i}"), &format!("SP {i}"), "Artist SP"));
    }

    let balanced = balance_providers_organic(tracks, 10, &allowed);
    assert_eq!(balanced.len(), 10);
    let sp_count = balanced.iter().filter(|t| t.provider == ProviderKind::Spotify).count();
    assert_eq!(sp_count, 2, "Spotify tracks should all be included");
    let sc_count = balanced.iter().filter(|t| t.provider == ProviderKind::SoundCloud).count();
    assert_eq!(sc_count, 8, "Remaining slots taken by SoundCloud without panic or empty slots");
}
