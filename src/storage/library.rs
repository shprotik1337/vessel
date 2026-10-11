use anyhow::Result;
use rusqlite::{Connection, params};

use crate::model::TrackRef;
use super::codec::{decode_track, encode_track, load_track_column};

pub struct LibraryRepository;

impl LibraryRepository {
    pub fn like_track(connection: &Connection, track: &TrackRef, liked_at_ms: i64) -> Result<()> {
        connection.execute(
            "
            INSERT INTO library_tracks(provider_key, canonical_key, track_json, liked_at_ms)
            VALUES (?1, ?2, ?3, ?4)
            ON CONFLICT(provider_key) DO UPDATE SET
                canonical_key = excluded.canonical_key,
                track_json = excluded.track_json,
                liked_at_ms = excluded.liked_at_ms
            ",
            params![
                track.provider_key(),
                track.canonical_key(),
                encode_track(track)?,
                liked_at_ms,
            ],
        )?;
        Ok(())
    }

    pub fn unlike_track(connection: &Connection, track: &TrackRef) -> Result<bool> {
        let changed = connection.execute(
            "DELETE FROM library_tracks WHERE provider_key = ?1",
            [track.provider_key()],
        )?;
        Ok(changed > 0)
    }

    pub fn reorder(connection: &mut Connection, order: &[String]) -> Result<()> {
        let transaction = connection.transaction()?;
        let base = i64::from(1_000_000_000u32) + order.len() as i64;
        for (index, key) in order.iter().enumerate() {
            transaction.execute(
                "UPDATE library_tracks SET liked_at_ms = ?1 WHERE provider_key = ?2",
                params![base - index as i64, key],
            )?;
        }
        transaction.commit()?;
        Ok(())
    }

    pub fn list(connection: &Connection) -> Result<Vec<TrackRef>> {
        load_track_column(
            connection,
            "SELECT track_json FROM library_tracks ORDER BY liked_at_ms DESC",
            &[],
        )
    }

    pub fn list_with_time(connection: &Connection) -> Result<Vec<(TrackRef, i64)>> {
        let mut statement = connection.prepare(
            "SELECT track_json, liked_at_ms FROM library_tracks ORDER BY liked_at_ms DESC",
        )?;
        let rows = statement.query_map([], |row| {
            Ok((row.get::<_, String>(0)?, row.get::<_, i64>(1)?))
        })?;
        let mut tracks = Vec::new();
        for row in rows {
            let (track, liked_at_ms) = row?;
            tracks.push((decode_track(&track)?, liked_at_ms));
        }
        Ok(tracks)
    }
}
