use serde_json::json;
use url::Url;

use crate::model::PlaybackCapability;

use super::{
    auth::{gateway_has_invalid_token, normalize_arl, parse_cookie_pairs},
    cache::{full_cache_source, write_cache},
    client::{deezer_headers, entity_id},
    crypto::{blowfish_key, decrypt_audio, legacy_urls},
    mapping::map_favorite_song,
};

#[test]
fn arl_accepts_raw_value_and_cookie_header() {
    assert_eq!(normalize_arl("token"), "token");
    assert_eq!(normalize_arl("Cookie: foo=1; arl='token'; path=/"), "token");
}

#[test]
fn pc_cookie_parser_keeps_all_auth_cookies_and_drops_attributes() {
    assert_eq!(
        parse_cookie_pairs("arl=token; sid=session; Path=/; HttpOnly"),
        vec![
            ("arl".to_string(), "token".to_string()),
            ("sid".to_string(), "session".to_string())
        ]
    );
}

#[test]
fn pc_gateway_headers_use_browser_identity() {
    let headers = deezer_headers();
    assert_eq!(
        headers.get(reqwest::header::ACCEPT).unwrap(),
        "application/json, text/plain, */*"
    );
    assert!(
        headers
            .get(reqwest::header::USER_AGENT)
            .unwrap()
            .to_str()
            .unwrap()
            .contains("Mozilla/5.0")
    );
}

#[test]
fn pc_invalid_token_detection_triggers_session_refresh() {
    assert!(gateway_has_invalid_token(
        &json!({"error": {"GATEWAY_ERROR": "Invalid api token"}})
    ));
    assert!(gateway_has_invalid_token(
        &json!({"error": {"VALID_TOKEN_REQUIRED": true}})
    ));
    assert!(!gateway_has_invalid_token(&json!({"error": []})));
}

#[test]
fn pc_legacy_cdn_fallback_builds_encrypted_mobile_url() {
    let raw = json!({
        "SNG_ID": "3135556",
        "MD5_ORIGIN": "9e5e7f6b5f5a6ec7f10f23f606b3c2ec",
        "MEDIA_VERSION": "4",
        "FILESIZE_MP3_128": "123"
    });
    let urls = legacy_urls(&raw, "MP3_128").unwrap();
    assert_eq!(urls.len(), 2);
    assert!(urls.iter().all(|url| url.contains("dzcdn.net/mobile/1/")));
}

#[test]
fn full_cache_source_is_not_downgraded_to_preview() {
    let path = std::path::Path::new("C:/cache/deezer-track.mp3");
    let source = full_cache_source(path).unwrap();
    assert_eq!(source.capability, PlaybackCapability::Full);
    assert_eq!(source.mime_type.as_deref(), Some("audio/mpeg"));
    assert_eq!(source.url.scheme(), "file");
}

#[test]
fn playlist_id_survives_locale_prefix() {
    let url = Url::parse("https://www.deezer.com/ru/playlist/12345").unwrap();
    assert_eq!(entity_id(&url, "playlist").as_deref(), Some("12345"));
}

#[test]
fn blowfish_key_is_deterministic() {
    let key1 = blowfish_key("3135556");
    let key2 = blowfish_key("3135556");
    assert_eq!(key1, key2);
    assert_eq!(key1.len(), 16);

    let key_other = blowfish_key("9999999");
    assert_ne!(key1, key_other);
}

#[test]
fn decrypt_audio_passes_unaligned_chunks_through() {
    // Чанки менее 2048 байт отдаются без изменений
    let short_data = vec![0x42u8; 512];
    let decrypted = decrypt_audio(&short_data, "12345").expect("short decrypt");
    assert_eq!(decrypted, short_data);
}

#[test]
fn map_favorite_song_parses_gateway_json() {
    let raw = json!({
        "SNG_ID": "123456",
        "SNG_TITLE": "Test Track",
        "ART_NAME": "Test Artist",
        "ALB_ID": "654321",
        "ALB_TITLE": "Test Album",
        "ALB_PICTURE": "abcdef",
        "DURATION": "180",
        "ISRC": "USRC12345678"
    });

    let track = map_favorite_song(&raw).expect("mapped track");
    assert_eq!(track.id, "123456");
    assert_eq!(track.title, "Test Track");
    assert_eq!(track.artists, vec!["Test Artist"]);
    assert_eq!(track.duration_ms, Some(180_000));
    assert_eq!(track.isrc.as_deref(), Some("USRC12345678"));
    assert_eq!(track.album_title.as_deref(), Some("Test Album"));
}

#[test]
fn cache_write_and_read() {
    let temp_dir = std::env::temp_dir().join("vessel_test_deezer");
    let test_file = temp_dir.join("test_track.mp3");
    let data = b"ID3\x03\0\0\0\0\0#TIT2\0\0\0\x05\0\0\0Test";

    write_cache(&test_file, data).expect("write cache");
    assert!(test_file.exists());
    let read_back = std::fs::read(&test_file).expect("read back");
    assert_eq!(read_back, data);

    let _ = std::fs::remove_file(&test_file);
    let _ = std::fs::remove_dir(&temp_dir);
}
