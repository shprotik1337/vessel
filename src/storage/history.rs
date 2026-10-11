use anyhow::Result;
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};

use crate::model::TrackRef;
use super::codec::{decode_track, encode_track};

#[derive(Clone, Debug, Deserialize, Eq, PartialEq, Serialize)]
pub struct HistoryEntry {
    pub track: TrackRef,
    pub played_at_ms: i64,
    pub completed: bool,
    pub skipped: bool,
}

pub struct HistoryRepository;

impl HistoryRepository {
    pub fn record(connection: &Connection, entry: &HistoryEntry, history_limit: usize) -> Result<()> {
        connection.execute(
            "
            INSERT INTO history(provider_key, track_json, played_at_ms, completed, skipped)
            VALUES (?1, ?2, ?3, ?4, ?5)
            ",
            params![
                entry.track.provider_key(),
                encode_track(&entry.track)?,
                entry.played_at_ms,
                entry.completed,
                entry.skipped,
            ],
        )?;
        Self::prune(connection, history_limit)?;
        Ok(())
    }

    pub fn prune(connection: &Connection, limit: usize) -> Result<usize> {
        let deleted = connection.execute(
            "DELETE FROM history WHERE id IN (
                SELECT id FROM history ORDER BY played_at_ms DESC LIMIT -1 OFFSET ?1
            )",
            [limit.clamp(1, 10_000) as i64],
        )?;
        Ok(deleted)
    }

    pub fn recent(connection: &Connection, limit: usize) -> Result<Vec<HistoryEntry>> {
        let mut statement = connection.prepare(
            "
            SELECT track_json, played_at_ms, completed, skipped
            FROM history
            ORDER BY played_at_ms DESC
            LIMIT ?1
            ",
        )?;
        let rows = statement.query_map([limit.clamp(1, 10_000) as i64], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, bool>(2)?,
                row.get::<_, bool>(3)?,
            ))
        })?;
        let mut history = Vec::new();
        for row in rows {
            let (track, played_at_ms, completed, skipped) = row?;
            history.push(HistoryEntry {
                track: decode_track(&track)?,
                played_at_ms,
                completed,
                skipped,
            });
        }
        Ok(history)
    }

    pub fn between(
        connection: &Connection,
        start_ms: i64,
        end_ms: i64,
        limit: usize,
    ) -> Result<Vec<HistoryEntry>> {
        let mut statement = connection.prepare(
            "
            SELECT track_json, played_at_ms, completed, skipped
            FROM history
            WHERE played_at_ms >= ?1 AND played_at_ms < ?2
            ORDER BY played_at_ms DESC
            LIMIT ?3
            ",
        )?;
        let rows = statement.query_map(
            params![start_ms, end_ms, limit.clamp(1, 10_000) as i64],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, i64>(1)?,
                    row.get::<_, bool>(2)?,
                    row.get::<_, bool>(3)?,
                ))
            },
        )?;
        let mut history = Vec::new();
        for row in rows {
            let (track, played_at_ms, completed, skipped) = row?;
            history.push(HistoryEntry {
                track: decode_track(&track)?,
                played_at_ms,
                completed,
                skipped,
            });
        }
        Ok(history)
    }

    pub fn clear(connection: &Connection) -> Result<()> {
        connection.execute("DELETE FROM history", [])?;
        Ok(())
    }
}
