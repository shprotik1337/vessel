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

    pub fn get(connection: &Connection, id: &str) -> Result<Option<FollowedArtist>> {
        let mut statement = connection.prepare(
            "
            SELECT id, provider, name, avatar_url, header_image_url, monthly_listeners, verified, added_at_ms
            FROM followed_artists
            WHERE id = ?1
            ",
        )?;
        let mut rows = statement.query_map([id], |row| {
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

        if let Some(row) = rows.next() {
            Ok(Some(row?))
        } else {
            Ok(None)
        }
    }

    pub fn record_pending_deletion(
        connection: &Connection,
        user_id: &str,
        provider: &str,
        artist_id: &str,
        created_at_ms: i64,
    ) -> Result<()> {
        connection.execute(
            "INSERT INTO pending_artist_deletions (user_id, provider, artist_id, created_at_ms)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(user_id, provider, artist_id) DO UPDATE SET created_at_ms = excluded.created_at_ms",
            params![user_id, provider, artist_id, created_at_ms],
        )?;
        Ok(())
    }

    pub fn remove_pending_deletion(
        connection: &Connection,
        user_id: &str,
        provider: &str,
        artist_id: &str,
    ) -> Result<bool> {
        let changed = connection.execute(
            "DELETE FROM pending_artist_deletions WHERE user_id = ?1 AND provider = ?2 AND artist_id = ?3",
            params![user_id, provider, artist_id],
        )?;
        Ok(changed > 0)
    }

    pub fn list_pending_deletions(
        connection: &Connection,
        user_id: &str,
    ) -> Result<Vec<(String, String)>> {
        let mut statement = connection.prepare(
            "SELECT provider, artist_id FROM pending_artist_deletions WHERE user_id = ?1 ORDER BY created_at_ms ASC",
        )?;
        let rows = statement.query_map([user_id], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
        })?;
        let mut res = Vec::new();
        for r in rows {
            res.push(r?);
        }
        Ok(res)
    }

    pub fn clear_pending_deletions(connection: &Connection, user_id: &str) -> Result<usize> {
        let changed = connection.execute(
            "DELETE FROM pending_artist_deletions WHERE user_id = ?1",
            [user_id],
        )?;
        Ok(changed)
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::storage::schema::initialize_schema;
    use rusqlite::Connection;

    fn make_test_db() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        initialize_schema(&conn).unwrap();
        conn
    }

    #[test]
    fn test_followed_artists_repository_crud() {
        let conn = make_test_db();

        let artist = FollowedArtist {
            id: "aurora".to_string(),
            provider: ProviderKind::Spotify,
            name: "AURORA".to_string(),
            avatar_url: Some(Url::parse("https://example.com/aurora.png").unwrap()),
            header_image_url: None,
            monthly_listeners: Some(4_500_000),
            verified: true,
            added_at_ms: 1000,
        };

        // 1. Сохранение
        FollowedArtistsRepository::save(&conn, &artist).unwrap();

        // 2. Проверка существования и получение
        assert!(FollowedArtistsRepository::is_followed(&conn, "aurora").unwrap());
        let loaded = FollowedArtistsRepository::get(&conn, "aurora")
            .unwrap()
            .unwrap();
        assert_eq!(loaded.id, "aurora");
        assert_eq!(loaded.name, "AURORA");
        assert_eq!(loaded.provider, ProviderKind::Spotify);
        assert!(loaded.verified);

        // 3. Список
        let list = FollowedArtistsRepository::list(&conn).unwrap();
        assert_eq!(list.len(), 1);

        // 4. Удаление
        let deleted = FollowedArtistsRepository::delete(&conn, "aurora").unwrap();
        assert!(deleted);
        assert!(!FollowedArtistsRepository::is_followed(&conn, "aurora").unwrap());
        assert!(
            FollowedArtistsRepository::get(&conn, "aurora")
                .unwrap()
                .is_none()
        );
    }

    #[test]
    fn test_pending_artist_deletions_flow_and_isolation() {
        let conn = make_test_db();

        // 1. Добавляем ожидающие удаления для пользователя user_1
        FollowedArtistsRepository::record_pending_deletion(
            &conn, "user_1", "spotify", "art_1", 100,
        )
        .unwrap();
        FollowedArtistsRepository::record_pending_deletion(
            &conn,
            "user_1",
            "youtube_music",
            "art_2",
            200,
        )
        .unwrap();

        // 2. Добавляем удаление для другого пользователя user_2
        FollowedArtistsRepository::record_pending_deletion(
            &conn, "user_2", "spotify", "art_3", 300,
        )
        .unwrap();

        // 3. Проверяем изоляцию по user_id
        let user1_deletions =
            FollowedArtistsRepository::list_pending_deletions(&conn, "user_1").unwrap();
        assert_eq!(user1_deletions.len(), 2);
        assert_eq!(
            user1_deletions[0],
            ("spotify".to_string(), "art_1".to_string())
        );
        assert_eq!(
            user1_deletions[1],
            ("youtube_music".to_string(), "art_2".to_string())
        );

        let user2_deletions =
            FollowedArtistsRepository::list_pending_deletions(&conn, "user_2").unwrap();
        assert_eq!(user2_deletions.len(), 1);
        assert_eq!(
            user2_deletions[0],
            ("spotify".to_string(), "art_3".to_string())
        );

        // 4. Удаляем одну запись для user_1
        let removed =
            FollowedArtistsRepository::remove_pending_deletion(&conn, "user_1", "spotify", "art_1")
                .unwrap();
        assert!(removed);

        let user1_remaining =
            FollowedArtistsRepository::list_pending_deletions(&conn, "user_1").unwrap();
        assert_eq!(user1_remaining.len(), 1);
        assert_eq!(user1_remaining[0].1, "art_2");

        // 5. Очистка для user_1 не трогает user_2
        let cleared = FollowedArtistsRepository::clear_pending_deletions(&conn, "user_1").unwrap();
        assert_eq!(cleared, 1);
        assert!(
            FollowedArtistsRepository::list_pending_deletions(&conn, "user_1")
                .unwrap()
                .is_empty()
        );

        let user2_still_intact =
            FollowedArtistsRepository::list_pending_deletions(&conn, "user_2").unwrap();
        assert_eq!(user2_still_intact.len(), 1);
    }
}
