use std::collections::BTreeMap;

use anyhow::{Context, Result, ensure};
use url::Url;

use crate::model::{PlaybackCapability, PlaybackSource, ProviderKind, TrackRef};

use super::{
    client::SoundCloudClient,
    models::{ScResolvedStream, ScTrack, ScTranscoding},
};

pub(super) async fn poluchit_istochnik(
    client: &SoundCloudClient,
    track: &TrackRef,
) -> Result<PlaybackSource> {
    ensure!(
        track.provider == ProviderKind::SoundCloud,
        "для SoundCloud нужен трек SoundCloud"
    );
    ensure!(track.capability.can_play(), "трек SoundCloud недоступен");

    // Трек уже в кэше — играем из файла
    if let Some(source) = crate::provider::cache::cached_source(track) {
        return Ok(source);
    }

    let track_id = track
        .id
        .strip_prefix("soundcloud:tracks:")
        .unwrap_or(&track.id)
        .trim();
    ensure!(!track_id.is_empty(), "у трека SoundCloud потерялся id");

    let details: ScTrack = client
        .get_json(client.v2_url(&["tracks", track_id])?, &[])
        .await
        .context("SoundCloud не отдал данные для воспроизведения")?;
    let transcoding = select_transcoding(&details.media.transcodings, &track.capability)
        .context("SoundCloud не предложил открытый поток для этого трека")?;
    let resolved: ScResolvedStream = client
        .get_json(Url::parse(&transcoding.url)?, &[])
        .await
        .context("SoundCloud не разрешил адрес потока")?;
    let url = Url::parse(resolved.url.trim()).context("SoundCloud вернул неверный адрес потока")?;
    ensure!(
        url.scheme() == "https" && url.host_str().is_some(),
        "SoundCloud вернул небезопасный адрес потока"
    );

    let hls = transcoding.format.protocol.eq_ignore_ascii_case("hls");
    Ok(PlaybackSource {
        url,
        headers: BTreeMap::new(),
        mime_type: Some(if hls {
            "application/vnd.apple.mpegurl".to_string()
        } else {
            transcoding.format.mime_type.clone()
        }),
        supports_range: !hls,
        expires_at_ms: None,
        capability: track.capability.clone(),
    })
}

fn select_transcoding<'a>(
    transcodings: &'a [ScTranscoding],
    capability: &PlaybackCapability,
) -> Result<&'a ScTranscoding> {
    let needs_preview = matches!(capability, PlaybackCapability::Preview { .. });
    let mut candidates = transcodings
        .iter()
        .filter(|item| item.snipped == needs_preview)
        .filter(|item| {
            matches!(
                item.format.protocol.to_ascii_lowercase().as_str(),
                "progressive" | "hls"
            )
        })
        .collect::<Vec<_>>();
    // Сортировка скучная, зато потом никто не слушает opus из ведра при живом aac
    candidates.sort_by_key(|item| transcoding_weight(item));
    candidates
        .into_iter()
        .next()
        .ok_or_else(|| bail_no_stream(needs_preview))
}

fn transcoding_weight(item: &ScTranscoding) -> u8 {
    let protocol = item.format.protocol.to_ascii_lowercase();
    let mime = item.format.mime_type.to_ascii_lowercase();
    let preset = item.preset.to_ascii_lowercase();
    let aac = mime.contains("audio/mp4") || preset.contains("aac");
    let mp3 = mime.contains("audio/mpeg") || preset.contains("mp3");
    let opus = mime.contains("ogg") || preset.contains("opus");
    match (protocol.as_str(), aac, mp3, opus) {
        ("hls", true, _, _) => 0,
        ("hls", _, true, _) => 1,
        ("progressive", _, true, _) => 2,
        ("hls", _, _, true) => 3,
        ("progressive", _, _, false) => 4,
        _ => 5,
    }
}

fn bail_no_stream(preview: bool) -> anyhow::Error {
    if preview {
        anyhow::anyhow!("SoundCloud не отдал официальный поток превью")
    } else {
        anyhow::anyhow!("доступны только превью, защищённые или неизвестные потоки")
    }
}

/// Для скачивания: только progressive MP3, старший битрейт вперёд.
/// HLS (m3u8) для файла не годится — это плейлист сегментов.
pub(super) async fn zagruzit_progressivnyi(
    client: &SoundCloudClient,
    track: &TrackRef,
) -> Result<PlaybackSource> {
    ensure!(
        track.provider == ProviderKind::SoundCloud,
        "для SoundCloud нужен трек SoundCloud"
    );
    ensure!(track.capability.can_play(), "трек SoundCloud недоступен");

    let track_id = track
        .id
        .strip_prefix("soundcloud:tracks:")
        .unwrap_or(&track.id)
        .trim();
    ensure!(!track_id.is_empty(), "у трека SoundCloud потерялся id");

    let details: ScTrack = client
        .get_json(client.v2_url(&["tracks", track_id])?, &[])
        .await
        .context("SoundCloud не отдал данные для скачивания")?;
    let mut candidates: Vec<&ScTranscoding> = details
        .media
        .transcodings
        .iter()
        .filter(|item| !item.snipped)
        .filter(|item| item.format.protocol.eq_ignore_ascii_case("progressive"))
        .filter(|item| {
            item.format
                .mime_type
                .to_ascii_lowercase()
                .contains("audio/mpeg")
        })
        .collect();
    ensure!(
        !candidates.is_empty(),
        "у этого трека нет прямой mp3-дорожки (только HLS) — скачать нельзя"
    );
    candidates.sort_by_key(|item| {
        if item.preset.to_ascii_lowercase().contains("1_0") {
            0 // mp3_1_0 = 320 kbps
        } else {
            1 // mp3_1_25 = 128 kbps
        }
    });
    let transcoding = candidates[0];
    let resolved: ScResolvedStream = client
        .get_json(Url::parse(&transcoding.url)?, &[])
        .await
        .context("SoundCloud не разрешил адрес для скачивания")?;
    let url = Url::parse(resolved.url.trim())
        .context("SoundCloud вернул неверный адрес для скачивания")?;
    ensure!(
        url.scheme() == "https" && url.host_str().is_some(),
        "SoundCloud вернул небезопасный адрес потока"
    );
    Ok(PlaybackSource {
        url,
        headers: BTreeMap::new(),
        mime_type: Some("audio/mpeg".to_string()),
        supports_range: true,
        expires_at_ms: None,
        capability: track.capability.clone(),
    })
}

#[cfg(test)]
mod tests {
    use std::{
        io::{Read, Write},
        net::TcpListener,
        thread,
    };

    use super::*;

    #[tokio::test]
    async fn modern_transcoding_is_resolved_into_hls() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            let (mut first, _) = listener.accept().unwrap();
            let request = read_request(&mut first);
            assert!(request.contains("GET /tracks/42?"));
            let resolve_url = format!("http://{address}/resolve/aac");
            let body = format!(
                r#"{{"id":"42","title":"Mock","media":{{"transcodings":[{{"url":"{resolve_url}","preset":"aac_160k","snipped":false,"format":{{"protocol":"hls","mime_type":"audio/mp4"}}}}]}}}}"#
            );
            write_response(&mut first, &body);

            let (mut second, _) = listener.accept().unwrap();
            let request = read_request(&mut second);
            assert!(request.contains("GET /resolve/aac?"));
            write_response(
                &mut second,
                r#"{"url":"https://cf-hls-media.sndcdn.com/track.m3u8"}"#,
            );
        });
        let client = SoundCloudClient::with_base(
            "fake-key".to_string(),
            Url::parse(&format!("http://{address}/")).unwrap(),
        )
        .unwrap();
        let source = poluchit_istochnik(&client, &track(PlaybackCapability::Full))
            .await
            .unwrap();
        server.join().unwrap();
        assert_eq!(
            source.url.as_str(),
            "https://cf-hls-media.sndcdn.com/track.m3u8"
        );
        assert_eq!(
            source.mime_type.as_deref(),
            Some("application/vnd.apple.mpegurl")
        );
        assert!(!source.supports_range);
    }

    #[test]
    fn protected_and_preview_streams_do_not_leak_into_full_playback() {
        let transcodings = vec![
            transcoding("encrypted-hls", "aac_160k", false),
            transcoding("progressive", "mp3_0_1", true),
        ];
        let error = select_transcoding(&transcodings, &PlaybackCapability::Full).unwrap_err();
        assert!(error.to_string().contains("защищённые"));
    }

    fn transcoding(protocol: &str, preset: &str, snipped: bool) -> ScTranscoding {
        ScTranscoding {
            url: "https://api-v2.soundcloud.com/media/42".to_string(),
            preset: preset.to_string(),
            snipped,
            format: super::super::models::ScFormat {
                protocol: protocol.to_string(),
                mime_type: "audio/mpeg".to_string(),
            },
        }
    }

    fn read_request(socket: &mut std::net::TcpStream) -> String {
        let mut request = [0u8; 4096];
        let read = socket.read(&mut request).unwrap();
        String::from_utf8_lossy(&request[..read]).to_string()
    }

    fn write_response(socket: &mut std::net::TcpStream, body: &str) {
        write!(
            socket,
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        )
        .unwrap();
    }

    fn track(capability: PlaybackCapability) -> TrackRef {
        TrackRef {
            provider: ProviderKind::SoundCloud,
            id: "42".to_string(),
            title: "Трек".to_string(),
            artists: vec!["Автор".to_string()],
            duration_ms: None,
            artwork_url: None,
            web_url: Url::parse("https://soundcloud.com/test/track").unwrap(),
            capability,
            genres: Vec::new(),
            explicit: false,
            drm: false,
        }
    }
}
