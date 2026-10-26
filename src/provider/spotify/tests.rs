use serde_json::json;
use url::Url;

use crate::{
    model::{PlaybackCapability, ProviderKind},
    provider::CollectionKind,
};

use super::{
    auth::{derive_totp_secret, generate_totp, normalize_cookie_string},
    client::entity_id,
    mapping::{
        collect_discography_releases, extract_album_tracks, extract_track_artists,
        parse_album_track_wrapper, pf_release_to_item, release_date_key, sort_releases_by_date,
    },
};

#[test]
fn sp_dc_accepts_raw_value_and_cookie_prefix() {
    assert_eq!(normalize_cookie_string("token"), "sp_dc=token");
    assert_eq!(
        normalize_cookie_string("Cookie: sp_dc='token'"),
        "sp_dc=token"
    );
    assert_eq!(
        normalize_cookie_string("sp_dc=abc; sp_key=def; path=/"),
        "sp_dc=abc; sp_key=def"
    );
}

#[test]
fn spotify_is_detected_from_playlist_and_album_urls() {
    assert_eq!(
        ProviderKind::from_url("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"),
        Some(ProviderKind::Spotify)
    );
    assert_eq!(
        ProviderKind::from_url("https://open.spotify.com/album/6ak1I1hjf2QkVpQRxHFUoE"),
        Some(ProviderKind::Spotify)
    );
}

#[test]
fn entity_id_extracts_spotify_ids() {
    let url = Url::parse("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M").unwrap();
    assert_eq!(
        entity_id(&url, "playlist").as_deref(),
        Some("37i9dQZF1DXcBWIGoYBM5M")
    );
}

#[test]
fn totp_derive_and_generation() {
    let ciphertext = [10u8, 20, 30, 40];
    let secret = derive_totp_secret(&ciphertext);
    assert!(!secret.is_empty());

    // Проверяем, что генерация детерминирована для фиксированного timestamp
    let code1 = generate_totp(&secret, 1_700_000_000_000);
    let code2 = generate_totp(&secret, 1_700_000_000_000);
    assert_eq!(code1, code2);
    assert_eq!(code1.len(), 6);
    assert!(code1.chars().all(|c| c.is_ascii_digit()));
}

#[test]
fn release_date_key_and_sorting() {
    assert_eq!(release_date_key("2026-05-29 · Сингл"), "2026-05-29");
    assert_eq!(release_date_key("2024 · EP"), "2024");
    assert_eq!(release_date_key("Альбом"), "");

    let mut releases = vec![
        crate::provider::CollectionItem {
            kind: CollectionKind::Album,
            provider: ProviderKind::Spotify,
            id: "1".into(),
            title: "Old".into(),
            subtitle: "2020-01-01 · Альбом".into(),
            artwork_url: None,
            web_url: Url::parse("https://open.spotify.com/album/1").unwrap(),
            track_count: 10,
        },
        crate::provider::CollectionItem {
            kind: CollectionKind::Album,
            provider: ProviderKind::Spotify,
            id: "2".into(),
            title: "New".into(),
            subtitle: "2026-05-29 · Сингл".into(),
            artwork_url: None,
            web_url: Url::parse("https://open.spotify.com/album/2").unwrap(),
            track_count: 1,
        },
        crate::provider::CollectionItem {
            kind: CollectionKind::Album,
            provider: ProviderKind::Spotify,
            id: "3".into(),
            title: "Mid".into(),
            subtitle: "2024 · EP".into(),
            artwork_url: None,
            web_url: Url::parse("https://open.spotify.com/album/3").unwrap(),
            track_count: 4,
        },
    ];

    sort_releases_by_date(&mut releases);
    assert_eq!(releases[0].id, "2"); // 2026-05-29
    assert_eq!(releases[1].id, "3"); // 2024
    assert_eq!(releases[2].id, "1"); // 2020-01-01
}

#[test]
fn pf_release_to_item_parsing() {
    let mut seen = std::collections::HashSet::new();
    let release_json = json!({
        "uri": "spotify:album:test123",
        "name": "Test Album",
        "coverArt": {
            "sources": [{ "url": "https://i.scdn.co/image/ab67616d0000b273test" }]
        },
        "date": {
            "year": 2025,
            "month": 6,
            "day": 15
        },
        "type": "ALBUM",
        "tracks": {
            "totalCount": 12
        }
    });

    let item = pf_release_to_item(&release_json, &mut seen).expect("item mapped");
    assert_eq!(item.id, "test123");
    assert_eq!(item.title, "Test Album");
    assert_eq!(item.subtitle, "2025-06-15 · Альбом");
    assert_eq!(item.track_count, 12);
    assert_eq!(item.provider, ProviderKind::Spotify);

    // Повторный вызов отфильтровывается через seen
    assert!(pf_release_to_item(&release_json, &mut seen).is_none());
}

#[test]
fn collect_discography_releases_groups() {
    let disco_json = json!({
        "albums": {
            "items": [{
                "releases": {
                    "items": [{
                        "uri": "spotify:album:alb1",
                        "name": "Album 1",
                        "type": "ALBUM",
                        "date": { "year": 2024 }
                    }]
                }
            }]
        },
        "singles": {
            "items": [{
                "releases": {
                    "items": [{
                        "uri": "spotify:album:sng1",
                        "name": "Single 1",
                        "type": "SINGLE",
                        "date": { "year": 2025 }
                    }]
                }
            }]
        }
    });

    let releases = collect_discography_releases(&disco_json);
    assert_eq!(releases.len(), 2);
    assert!(releases.iter().any(|r| r.id == "alb1"));
    assert!(releases.iter().any(|r| r.id == "sng1"));
}

#[test]
fn extract_album_tracks_from_tracks_v2() {
    let album_json = json!({
        "data": {
            "albumUnion": {
                "tracksV2": {
                    "totalCount": 2,
                    "items": [
                        {
                            "track": {
                                "uri": "spotify:track:track1",
                                "name": "Song One",
                                "artists": {
                                    "items": [
                                        { "profile": { "name": "Artist A" } }
                                    ]
                                },
                                "duration": { "totalMilliseconds": 210000 },
                                "contentRating": { "label": "EXPLICIT" }
                            }
                        },
                        {
                            "track": {
                                "uri": "spotify:track:track2",
                                "name": "Song Two",
                                "artists": {
                                    "items": [
                                        { "profile": { "name": "Artist B" } }
                                    ]
                                },
                                "duration": { "totalMilliseconds": 180000 }
                            }
                        }
                    ]
                }
            }
        }
    });

    let tracks = extract_album_tracks(&album_json);
    assert_eq!(tracks.len(), 2);
    assert_eq!(tracks[0].id, "track1");
    assert_eq!(tracks[0].title, "Song One");
    assert_eq!(tracks[0].artists, vec!["Artist A"]);
    assert_eq!(tracks[0].duration_ms, Some(210000));
    assert!(tracks[0].explicit);
    assert_eq!(tracks[0].capability, PlaybackCapability::Full);

    assert_eq!(tracks[1].id, "track2");
    assert_eq!(tracks[1].title, "Song Two");
    assert!(!tracks[1].explicit);
}

#[test]
fn extract_album_tracks_from_classic_discs() {
    let album_json = json!({
        "data": {
            "albumUnion": {
                "discs": {
                    "items": [
                        {
                            "items": [
                                {
                                    "item": {
                                        "data": {
                                            "uri": "spotify:track:discTrack1",
                                            "name": "Disc Song",
                                            "artists": {
                                                "items": [
                                                    { "profile": { "name": "Disc Artist" } }
                                                ]
                                            },
                                            "duration": { "totalMilliseconds": 150000 }
                                        }
                                    }
                                }
                            ]
                        }
                    ]
                }
            }
        }
    });

    let tracks = extract_album_tracks(&album_json);
    assert_eq!(tracks.len(), 1);
    assert_eq!(tracks[0].id, "discTrack1");
    assert_eq!(tracks[0].title, "Disc Song");
    assert_eq!(tracks[0].artists, vec!["Disc Artist"]);
}

#[test]
fn extract_album_tracks_empty_when_album_union_missing() {
    let empty_json = json!({
        "data": {}
    });
    let tracks = extract_album_tracks(&empty_json);
    assert!(tracks.is_empty());
}

#[test]
fn extract_album_tracks_from_nested_item_data() {
    let album_json = json!({
        "data": {
            "albumUnion": {
                "tracksV2": {
                    "items": [
                        {
                            "item": {
                                "data": {
                                    "uri": "spotify:track:itemDataTrack1",
                                    "name": "Nested Item Song",
                                    "artists": {
                                        "items": [
                                            { "profile": { "name": "Item Artist" } }
                                        ]
                                    },
                                    "trackDuration": { "totalMilliseconds": 204000 },
                                    "contentRating": { "label": "NONE" }
                                }
                            }
                        }
                    ]
                }
            }
        }
    });

    let tracks = extract_album_tracks(&album_json);
    assert_eq!(tracks.len(), 1);
    assert_eq!(tracks[0].id, "itemDataTrack1");
    assert_eq!(tracks[0].title, "Nested Item Song");
    assert_eq!(tracks[0].artists, vec!["Item Artist"]);
    assert_eq!(tracks[0].duration_ms, Some(204000));
    assert!(!tracks[0].explicit);
}

#[test]
fn extract_album_tracks_from_nested_track_data() {
    let album_json = json!({
        "data": {
            "album": {
                "tracksV2": {
                    "items": [
                        {
                            "track": {
                                "data": {
                                    "uri": "spotify:track:trackDataTrack1",
                                    "name": "Track Data Song",
                                    "artists": [
                                        { "name": "Direct Artist A" },
                                        { "name": "Direct Artist B" }
                                    ],
                                    "duration_ms": 195000,
                                    "explicit": true
                                }
                            }
                        }
                    ]
                }
            }
        }
    });

    let tracks = extract_album_tracks(&album_json);
    assert_eq!(tracks.len(), 1);
    assert_eq!(tracks[0].id, "trackDataTrack1");
    assert_eq!(tracks[0].title, "Track Data Song");
    assert_eq!(
        tracks[0].artists,
        vec!["Direct Artist A", "Direct Artist B"]
    );
    assert_eq!(tracks[0].duration_ms, Some(195000));
    assert!(tracks[0].explicit);
}

#[test]
fn extract_album_tracks_from_track_uri_with_separated_data() {
    let album_json = json!({
        "data": {
            "albumUnion": {
                "tracksV2": {
                    "items": [
                        {
                            "track": {
                                "_uri": "spotify:track:separatedUriTrack",
                                "data": {
                                    "name": "Separated URI Song",
                                    "artists": {
                                        "items": [
                                            { "name": "Fallback Artist" }
                                        ]
                                    },
                                    "trackDuration": { "totalMilliseconds": 182000 }
                                }
                            }
                        }
                    ]
                }
            }
        }
    });

    let tracks = extract_album_tracks(&album_json);
    assert_eq!(tracks.len(), 1);
    assert_eq!(tracks[0].id, "separatedUriTrack");
    assert_eq!(tracks[0].title, "Separated URI Song");
    assert_eq!(tracks[0].artists, vec!["Fallback Artist"]);
    assert_eq!(tracks[0].duration_ms, Some(182000));
}

#[test]
fn extract_album_tracks_multi_disc_ordering_preserved() {
    let album_json = json!({
        "data": {
            "albumUnion": {
                "discs": {
                    "items": [
                        {
                            "items": [
                                {
                                    "item": {
                                        "data": {
                                            "uri": "spotify:track:disc1_track1",
                                            "name": "Disc 1 Track 1"
                                        }
                                    }
                                },
                                {
                                    "item": {
                                        "data": {
                                            "uri": "spotify:track:disc1_track2",
                                            "name": "Disc 1 Track 2"
                                        }
                                    }
                                }
                            ]
                        },
                        {
                            "items": [
                                {
                                    "item": {
                                        "data": {
                                            "uri": "spotify:track:disc2_track1",
                                            "name": "Disc 2 Track 1"
                                        }
                                    }
                                },
                                {
                                    "item": {
                                        "data": {
                                            "uri": "spotify:track:disc2_track2",
                                            "name": "Disc 2 Track 2"
                                        }
                                    }
                                }
                            ]
                        }
                    ]
                }
            }
        }
    });

    let tracks = extract_album_tracks(&album_json);
    assert_eq!(tracks.len(), 4);
    assert_eq!(tracks[0].id, "disc1_track1");
    assert_eq!(tracks[1].id, "disc1_track2");
    assert_eq!(tracks[2].id, "disc2_track1");
    assert_eq!(tracks[3].id, "disc2_track2");
}

#[test]
fn extract_album_tracks_skips_episodes_and_junk() {
    let album_json = json!({
        "data": {
            "albumUnion": {
                "tracksV2": {
                    "items": [
                        {
                            "track": {
                                "uri": "spotify:track:validTrack1",
                                "name": "Valid Song 1"
                            }
                        },
                        {
                            "track": {
                                "uri": "spotify:episode:podcast123",
                                "name": "Podcast Episode"
                            }
                        },
                        {},
                        {
                            "track": null
                        },
                        {
                            "item": {
                                "data": {
                                    "uri": "spotify:track:validTrack2",
                                    "name": "Valid Song 2"
                                }
                            }
                        }
                    ]
                }
            }
        }
    });

    let tracks = extract_album_tracks(&album_json);
    assert_eq!(tracks.len(), 2);
    assert_eq!(tracks[0].id, "validTrack1");
    assert_eq!(tracks[1].id, "validTrack2");
}

#[test]
fn extract_track_artists_various_formats() {
    // 1. items with profile.name
    let n1 = json!({
        "artists": {
            "items": [{ "profile": { "name": "Profile Artist" } }]
        }
    });
    assert_eq!(extract_track_artists(&n1), vec!["Profile Artist"]);

    // 2. items with name
    let n2 = json!({
        "artists": {
            "items": [{ "name": "Name Artist" }]
        }
    });
    assert_eq!(extract_track_artists(&n2), vec!["Name Artist"]);

    // 3. flat array of objects
    let n3 = json!({
        "artists": [{ "name": "Flat Artist" }]
    });
    assert_eq!(extract_track_artists(&n3), vec!["Flat Artist"]);

    // 4. flat array of strings
    let n4 = json!({
        "artists": ["String Artist A", "String Artist B"]
    });
    assert_eq!(
        extract_track_artists(&n4),
        vec!["String Artist A", "String Artist B"]
    );

    // 5. empty/missing
    let n5 = json!({});
    assert!(extract_track_artists(&n5).is_empty());
}

#[test]
fn extract_album_tracks_anonymized_full_album_fixture() {
    let fixture = json!({
        "data": {
            "albumUnion": {
                "__typename": "Album",
                "uri": "spotify:album:2mCuS7r6d9n8f4b0",
                "name": "Test Full Album",
                "tracksV2": {
                    "totalCount": 3,
                    "items": [
                        {
                            "uid": "track-uid-1",
                            "track": {
                                "saved": false,
                                "uri": "spotify:track:7xG3F1eEaBC",
                                "name": "Intro",
                                "trackDuration": { "totalMilliseconds": 65000 },
                                "artists": {
                                    "items": [
                                        { "uri": "spotify:artist:1a2b", "profile": { "name": "Main Artist" } }
                                    ]
                                },
                                "contentRating": { "label": "NONE" }
                            }
                        },
                        {
                            "uid": "track-uid-2",
                            "item": {
                                "data": {
                                    "saved": true,
                                    "uri": "spotify:track:8yH4G2fFbCD",
                                    "name": "Hit Single",
                                    "trackDuration": { "totalMilliseconds": 215000 },
                                    "artists": {
                                        "items": [
                                            { "uri": "spotify:artist:1a2b", "profile": { "name": "Main Artist" } },
                                            { "uri": "spotify:artist:3c4d", "profile": { "name": "Featured Guest" } }
                                        ]
                                    },
                                    "contentRating": { "label": "EXPLICIT" }
                                }
                            }
                        },
                        {
                            "uid": "track-uid-3",
                            "track": {
                                "data": {
                                    "uri": "spotify:track:9zI5H3gGcDE",
                                    "name": "Outro",
                                    "duration": { "totalMilliseconds": 120000 },
                                    "artists": {
                                        "items": [
                                            { "profile": { "name": "Main Artist" } }
                                        ]
                                    }
                                }
                            }
                        }
                    ]
                }
            }
        }
    });

    let tracks = extract_album_tracks(&fixture);
    assert_eq!(tracks.len(), 3);
    assert_eq!(tracks[0].id, "7xG3F1eEaBC");
    assert_eq!(tracks[0].title, "Intro");
    assert_eq!(tracks[0].duration_ms, Some(65000));
    assert!(!tracks[0].explicit);

    assert_eq!(tracks[1].id, "8yH4G2fFbCD");
    assert_eq!(tracks[1].title, "Hit Single");
    assert_eq!(tracks[1].artists, vec!["Main Artist", "Featured Guest"]);
    assert_eq!(tracks[1].duration_ms, Some(215000));
    assert!(tracks[1].explicit);

    assert_eq!(tracks[2].id, "9zI5H3gGcDE");
    assert_eq!(tracks[2].title, "Outro");
    assert_eq!(tracks[2].duration_ms, Some(120000));
}

#[test]
fn artist_all_tracks_deduplication_and_ordering() {
    let mut seen = std::collections::HashSet::new();
    let mut discography_tracks = Vec::new();

    // 1. Популярные треки
    let top_raw = json!([
        {
            "track": {
                "uri": "spotify:track:popular1",
                "name": "Popular 1",
                "artists": { "items": [{ "profile": { "name": "Artist" } }] }
            }
        },
        {
            "track": {
                "uri": "spotify:track:popular2",
                "name": "Popular 2",
                "artists": { "items": [{ "profile": { "name": "Artist" } }] }
            }
        }
    ]);
    for item in top_raw.as_array().unwrap() {
        if let Some(t) = parse_album_track_wrapper(item) {
            if seen.insert(t.provider_key()) {
                discography_tracks.push(t);
            }
        }
    }

    // 2. Треки из свежего альбома (содержит популярный трек и новый)
    let album_tracks = vec![
        parse_album_track_wrapper(&json!({
            "track": { "uri": "spotify:track:albumTrack1", "name": "Album Track 1" }
        }))
        .unwrap(),
        parse_album_track_wrapper(&json!({
            "track": { "uri": "spotify:track:popular1", "name": "Popular 1" }
        }))
        .unwrap(),
        parse_album_track_wrapper(&json!({
            "track": { "uri": "spotify:track:albumTrack2", "name": "Album Track 2" }
        }))
        .unwrap(),
    ];
    for t in album_tracks {
        if seen.insert(t.provider_key()) {
            discography_tracks.push(t);
        }
    }

    // 3. Треки из старого сингла (содержит уже добавленный трек)
    let single_tracks = vec![
        parse_album_track_wrapper(&json!({
            "track": { "uri": "spotify:track:albumTrack2", "name": "Album Track 2" }
        }))
        .unwrap(),
    ];
    for t in single_tracks {
        if seen.insert(t.provider_key()) {
            discography_tracks.push(t);
        }
    }

    assert_eq!(discography_tracks.len(), 4);
    assert_eq!(discography_tracks[0].id, "popular1");
    assert_eq!(discography_tracks[1].id, "popular2");
    assert_eq!(discography_tracks[2].id, "albumTrack1");
    assert_eq!(discography_tracks[3].id, "albumTrack2");
}
