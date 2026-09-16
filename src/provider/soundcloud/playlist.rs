use anyhow::{Context, Result, ensure};
use url::Url;

use crate::provider::ImportedPlaylist;

use super::{
    client::SoundCloudClient, models::ScPlaylist, normalizovat_track, proverit_soundcloud_url,
    track_details::zagruzit_dannye_trekov,
};

pub(super) async fn import_playlist(
    client: &SoundCloudClient,
    source_url: &Url,
) -> Result<ImportedPlaylist> {
    proverit_soundcloud_url(source_url)?;
    let resolve_raw: serde_json::Value = client
        .get_json(
            client.v2_url(&["resolve"])?,
            &[("url", source_url.as_str().to_string())],
        )
        .await
        .context("SoundCloud не разобрал ссылку на плейлист")?;

    let kind = resolve_raw.get("kind").and_then(|v| v.as_str()).unwrap_or("");
    if kind == "user" || source_url.path().ends_with("/likes") {
        let user_id = resolve_raw
            .get("id")
            .map(|v| v.to_string().trim_matches('"').to_string())
            .unwrap_or_default();
        let username = resolve_raw
            .get("username")
            .and_then(|v| v.as_str())
            .unwrap_or("SoundCloud");
        let avatar_url = resolve_raw
            .get("avatar_url")
            .and_then(|v| v.as_str())
            .and_then(|u| Url::parse(u).ok());

        let mut tracks = Vec::new();
        let mut url = client.v2_url(&["users", &user_id, "track_likes"])?;
        let mut query: Vec<(&str, String)> = vec![
            ("limit", "50".to_string()),
            ("linked_partitioning", "true".to_string()),
        ];
        for _ in 0..10 {
            let page: super::models::ScCollection<super::models::ScLikeItem> = client
                .get_json(url.clone(), &query)
                .await
                .context("не удалось загрузить лайки пользователя SoundCloud")?;
            for item in page.collection {
                if let Some(track) = item.track.and_then(normalizovat_track) {
                    tracks.push(track);
                }
            }
            match page.next_href {
                Some(next) if !next.trim().is_empty() => {
                    url = Url::parse(&next).context("некорректный next_href от SoundCloud")?;
                    query.clear();
                }
                _ => break,
            }
        }
        return Ok(ImportedPlaylist {
            title: format!("Лайки {username}"),
            description: format!("Импортированные лайки пользователя {username} из SoundCloud"),
            source_url: source_url.clone(),
            cover_url: avatar_url,
            tracks,
        });
    }

    let playlist: ScPlaylist = serde_json::from_value(resolve_raw)
        .context("ссылка SoundCloud ведет не на плейлист или альбом")?;
    ensure!(
        matches!(
            playlist.kind.as_str(),
            "playlist" | "system-playlist" | "album"
        ),
        "ссылка SoundCloud ведет не на плейлист"
    );

    let cover_url = playlist
        .artwork_url
        .as_deref()
        .or_else(|| {
            playlist
                .tracks
                .iter()
                .find_map(|track| track.artwork_url.as_deref())
        })
        .and_then(|value| Url::parse(&value).ok());
    let tracks = zagruzit_dannye_trekov(client, playlist.tracks)
        .await?
        .into_iter()
        .filter_map(normalizovat_track)
        .collect();
    let title = if playlist.title.trim().is_empty() {
        "Плейлист SoundCloud".to_string()
    } else {
        playlist.title
    };

    Ok(ImportedPlaylist {
        title,
        description: playlist.description.unwrap_or_default(),
        source_url: source_url.clone(),
        cover_url,
        tracks,
    })
}

#[cfg(test)]
mod tests {
    use std::{
        io::{Read, Write},
        net::{Shutdown, TcpListener, TcpStream},
        thread,
    };

    use super::*;

    #[tokio::test]
    async fn import_hydrates_partial_tracks_and_keeps_order() {
        let listener = TcpListener::bind("127.0.0.1:0").unwrap();
        let address = listener.local_addr().unwrap();
        let server = thread::spawn(move || {
            for _ in 0..2 {
                let (mut socket, _) = listener.accept().unwrap();
                answer(&mut socket);
            }
        });
        let client = SoundCloudClient::with_base(
            "fake-key".to_string(),
            Url::parse(&format!("http://{address}/")).unwrap(),
        )
        .unwrap();
        let source = Url::parse("https://soundcloud.com/test/set").unwrap();
        let imported = import_playlist(&client, &source).await.unwrap();
        server.join().unwrap();

        assert_eq!(imported.title, "Набор");
        assert_eq!(imported.tracks.len(), 2);
        assert_eq!(imported.tracks[0].id, "42");
        assert_eq!(imported.tracks[0].artists, vec!["Автор"]);
        assert_eq!(imported.tracks[1].id, "9");
    }

    fn answer(socket: &mut TcpStream) {
        let mut request = [0u8; 4096];
        let read = socket.read(&mut request).unwrap();
        let request = String::from_utf8_lossy(&request[..read]);
        let body = if request.contains("GET /resolve?") {
            r#"{"id":7,"kind":"playlist","title":"Набор","tracks":[{"id":42},{"id":9,"title":"Готовый","permalink_url":"https://soundcloud.com/test/ready","user":{"username":"Другой"}}]}"#
        } else {
            assert!(request.contains("GET /tracks?"));
            assert!(request.contains("ids=42"));
            r#"[{"id":42,"title":"Раскрытый","permalink_url":"https://soundcloud.com/test/full","user":{"username":"Автор"}}]"#
        };
        let response = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
        );
        socket.write_all(response.as_bytes()).unwrap();
        socket.flush().unwrap();
        socket.shutdown(Shutdown::Write).unwrap();
    }
}
