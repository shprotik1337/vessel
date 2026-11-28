use anyhow::Result;
use rusqlite::{Connection, params};

use super::codec::{decode_track, encode_track};
use crate::model::TrackRef;

pub struct LocalTracksRepository;

impl LocalTracksRepository {
    pub fn list(connection: &Connection) -> Result<Vec<TrackRef>> {
        let mut statement = connection.prepare(
            "SELECT track_json FROM local_tracks ORDER BY added_at_ms DESC",
        )?;
        let rows = statement.query_map([], |row| row.get::<_, String>(0))?;
        let mut out = Vec::new();
        for row in rows {
            out.push(decode_track(&row?)?);
        }
        Ok(out)
    }

    pub fn insert_if_missing(
        connection: &Connection,
        file_path: &str,
        track: &TrackRef,
        added_at_ms: i64,
    ) -> Result<bool> {
        let encoded = encode_track(track)?;
        let affected = connection.execute(
            "
            INSERT INTO local_tracks(id, file_path, track_json, added_at_ms)
            VALUES (?1, ?2, ?3, ?4)
            ON CONFLICT(file_path) DO NOTHING
            ",
            params![track.id, file_path, encoded, added_at_ms],
        )?;
        Ok(affected > 0)
    }

    pub fn remove_by_id(connection: &Connection, id: &str) -> Result<bool> {
        let affected = connection.execute(
            "DELETE FROM local_tracks WHERE id = ?1",
            [id],
        )?;
        Ok(affected > 0)
    }
}
