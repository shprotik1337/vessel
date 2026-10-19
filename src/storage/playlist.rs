use std::collections::HashMap;
use anyhow::{Context, Result};
use rusqlite::{Connection, params};
use uuid::Uuid;

use crate::model::{Playlist, TrackRef};
use super::codec::{decode_track, encode_track, load_track_column};

pub struct PlaylistRepository;

impl PlaylistRepository {
    pub fn save(connection: &mut Connection, playlist: &Playlist) -> Result<()> {
        let transaction = connection.transaction()?;
        // Помним, когда трек добавляли: пересохранение не должно обнулять даты
        let existing_dates: HashMap<String, i64> = transaction
            .prepare(
                "SELECT provider_key, added_at_ms FROM playlist_tracks WHERE playlist_id = ?1",
            )?
            .query_map([playlist.id.to_string()], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
            })?
            .collect::<Result<HashMap<_, _>, _>>()?;
        let now_ms = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_millis() as i64)
            .unwrap_or_default();
        transaction.execute(
            "
            INSERT INTO playlists(id, title, description, source_url, cover_url, created_at_ms, updated_at_ms, is_album, artist_name)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            ON CONFLICT(id) DO UPDATE SET
                title = excluded.title,
                description = excluded.description,
                source_url = excluded.source_url,
                cover_url = excluded.cover_url,
                updated_at_ms = excluded.updated_at_ms,
                is_album = excluded.is_album,
                artist_name = excluded.artist_name
            ",
            params![
                playlist.id.to_string(),
                playlist.title,
                playlist.description,
                playlist.source_url.as_ref().map(ToString::to_string),
                playlist.cover_url.as_ref().map(ToString::to_string),
                playlist.created_at_ms,
                playlist.updated_at_ms,
                if playlist.is_album { 1 } else { 0 },
                playlist.artist_name.as_deref(),
            ],
        )?;
        transaction.execute(
            "DELETE FROM playlist_tracks WHERE playlist_id = ?1",
            [playlist.id.to_string()],
        )?;
        for (position, track) in playlist.tracks.iter().enumerate() {
            let added_at_ms = existing_dates.get(&track.provider_key()).copied().unwrap_or(now_ms);
            transaction.execute(
                "
                INSERT INTO playlist_tracks(playlist_id, position, provider_key, track_json, added_at_ms)
                VALUES (?1, ?2, ?3, ?4, ?5)
                ",
                params![
                    playlist.id.to_string(),
                    position as i64,
                    track.provider_key(),
                    encode_track(track)?,
                    added_at_ms,
                ],
            )?;
        }
        transaction.commit()?;
        Ok(())
    }

    /// Ручной порядок плейлистов: id в нужном порядке получают position.
    pub fn save_order(connection: &mut Connection, order: &[String]) -> Result<()> {
        let transaction = connection.transaction()?;
        for (index, id) in order.iter().enumerate() {
            transaction.execute(
                "UPDATE playlists SET position = ?1 WHERE id = ?2",
                params![index as i64, id],
            )?;
        }
        transaction.commit()?;
        Ok(())
    }

    /// Даты добавления треков плейлиста: (трек, added_at_ms).
    pub fn track_times(connection: &Connection, id: Uuid) -> Result<Vec<(TrackRef, i64)>> {
        let mut statement = connection.prepare(
            "SELECT track_json, added_at_ms FROM playlist_tracks WHERE playlist_id = ?1",
        )?;
        let rows = statement.query_map([id.to_string()], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })?;
        let mut times = Vec::new();
        for row in rows {
            let (track_json, added_at_ms) = row?;
            times.push((decode_track(&track_json)?, added_at_ms));
        }
        Ok(times)
    }

    pub fn delete(connection: &Connection, id: Uuid) -> Result<bool> {
        let changed = connection.execute("DELETE FROM playlists WHERE id = ?1", [id.to_string()])?;
        Ok(changed > 0)
    }

    pub fn list(connection: &Connection) -> Result<Vec<Playlist>> {
        let mut statement = connection.prepare(
            "
            SELECT id, title, description, source_url, cover_url, created_at_ms, updated_at_ms, is_album, artist_name
            FROM playlists
            ORDER BY (position IS NULL), position, updated_at_ms DESC, title COLLATE NOCASE
            ",
        )?;
        let rows = statement.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, i64>(5)?,
                row.get::<_, i64>(6)?,
                row.get::<_, Option<i64>>(7)?.unwrap_or(0),
                row.get::<_, Option<String>>(8)?,
            ))
        })?;
        let mut playlists = Vec::new();
        for row in rows {
            let (id, title, description, source_url, cover_url, created_at_ms, updated_at_ms, is_album_int, artist_name) =
                row?;
            let id = Uuid::parse_str(&id).context("В БД найден повреждённый плейлист")?;
            let source_url = source_url
                .map(|value| url::Url::parse(&value))
                .transpose()
                .context("В БД найден повреждённый URL плейлиста")?;
            let cover_url = cover_url
                .map(|value| url::Url::parse(&value))
                .transpose()
                .context("В БД найден повреждённый URL обложки плейлиста")?;
            let tracks = load_playlist_tracks(connection, id)?;
            playlists.push(Playlist {
                id,
                title,
                description,
                source_url,
                cover_url,
                tracks,
                created_at_ms,
                updated_at_ms,
                is_album: is_album_int != 0,
                artist_name,
            });
        }
        Ok(playlists)
    }
}

pub fn load_playlist_tracks(connection: &Connection, id: Uuid) -> Result<Vec<TrackRef>> {
    load_track_column(
        connection,
        "SELECT track_json FROM playlist_tracks WHERE playlist_id = ?1 ORDER BY position",
        &[&id.to_string()],
    )
}
