use anyhow::Result;
use rusqlite::{Connection, params};
use url::Url;

use crate::model::{FollowedArtist, ProviderKind};

pub struct FollowedArtistsRepository;

impl FollowedArtistsRepository {
    pub fn save(connection: &Connection, artist: &FollowedArtist) -> Result<()> {
        connection.execute(
            "
            INSERT INTO followed_artists (
                id, provider, name, avatar_url, header_image_url, monthly_listeners, verified, added_at_ms
            )
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
            ON CONFLICT(id) DO UPDATE SET
                provider = excluded.provider,
                name = excluded.name,
                avatar_url = excluded.avatar_url,
                header_image_url = excluded.header_image_url,
                monthly_listeners = excluded.monthly_listeners,
                verified = excluded.verified,
                added_at_ms = excluded.added_at_ms
            ",
            params![
                artist.id,
                artist.provider.as_str(),
                artist.name,
                artist.avatar_url.as_ref().map(ToString::to_string),
                artist.header_image_url.as_ref().map(ToString::to_string),
                artist.monthly_listeners.map(|v| v as i64),
                if artist.verified { 1 } else { 0 },
                artist.added_at_ms,
            ],
        )?;
        Ok(())
    }

    pub fn delete(connection: &Connection, id: &str) -> Result<bool> {
        let changed = connection.execute("DELETE FROM followed_artists WHERE id = ?1", [id])?;
        Ok(changed > 0)
    }

    pub fn is_followed(connection: &Connection, id: &str) -> Result<bool> {
        let count: i64 = connection.query_row(
            "SELECT COUNT(1) FROM followed_artists WHERE id = ?1",
            [id],
            |row| row.get(0),
        )?;
        Ok(count > 0)
    }

    pub fn list(connection: &Connection) -> Result<Vec<FollowedArtist>> {
        let mut statement = connection.prepare(
            "
            SELECT id, provider, name, avatar_url, header_image_url, monthly_listeners, verified, added_at_ms
            FROM followed_artists
            ORDER BY added_at_ms DESC, name COLLATE NOCASE
            ",
        )?;
        let rows = statement.query_map([], |row| {
            let id: String = row.get(0)?;
            let provider_str: String = row.get(1)?;
            let name: String = row.get(2)?;
            let avatar_url_str: Option<String> = row.get(3)?;
            let header_image_url_str: Option<String> = row.get(4)?;
            let monthly_listeners: Option<i64> = row.get(5)?;
            let verified_int: i64 = row.get(6)?;
            let added_at_ms: i64 = row.get(7)?;

            let provider = match provider_str.as_str() {
                "soundcloud" | "sound_cloud" => ProviderKind::SoundCloud,
                "yandex" | "yandex_music" => ProviderKind::YandexMusic,
                "deezer" => ProviderKind::Deezer,
                "spotify" => ProviderKind::Spotify,
                "youtube_music" | "you_tube_music" => ProviderKind::YouTubeMusic,
                _ => ProviderKind::Spotify,
            };

            let avatar_url = avatar_url_str.and_then(|u| Url::parse(&u).ok());
            let header_image_url = header_image_url_str.and_then(|u| Url::parse(&u).ok());

            Ok(FollowedArtist {
                id,
                provider,
                name,
                avatar_url,
                header_image_url,
                monthly_listeners: monthly_listeners.map(|v| v.max(0) as u64),
                verified: verified_int != 0,
                added_at_ms,
            })
        })?;

        let mut artists = Vec::new();
        for row in rows {
            artists.push(row?);
        }
        Ok(artists)
    }
}
