use anyhow::Result;
use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};

use crate::model::{RepeatMode, TrackRef};
use super::codec::{encode_track, load_track_column};

#[derive(Clone, Debug, Default, Deserialize, Eq, PartialEq, Serialize)]
pub struct QueueSnapshot {
    pub tracks: Vec<TrackRef>,
    pub current_index: Option<usize>,
    pub shuffle: bool,
    pub repeat: RepeatMode,
}

pub struct QueueRepository;

impl QueueRepository {
    pub fn save(connection: &mut Connection, snapshot: &QueueSnapshot) -> Result<()> {
        let transaction = connection.transaction()?;
        transaction.execute("DELETE FROM queue_tracks", [])?;
        for (position, track) in snapshot.tracks.iter().enumerate() {
            transaction.execute(
                "INSERT INTO queue_tracks(position, track_json) VALUES (?1, ?2)",
                params![position as i64, encode_track(track)?],
            )?;
        }
        transaction.execute(
            "
            INSERT INTO queue_state(singleton, current_index, shuffle, repeat_mode)
            VALUES (1, ?1, ?2, ?3)
            ON CONFLICT(singleton) DO UPDATE SET
                current_index = excluded.current_index,
                shuffle = excluded.shuffle,
                repeat_mode = excluded.repeat_mode
            ",
            params![
                snapshot.current_index.map(|value| value as i64),
                snapshot.shuffle,
                repeat_name(snapshot.repeat),
            ],
        )?;
        transaction.commit()?;
        Ok(())
    }

    pub fn load(connection: &Connection) -> Result<QueueSnapshot> {
        let tracks = load_track_column(
            connection,
            "SELECT track_json FROM queue_tracks ORDER BY position",
            &[],
        )?;
        let state = connection
            .query_row(
                "SELECT current_index, shuffle, repeat_mode FROM queue_state WHERE singleton = 1",
                [],
                |row| {
                    Ok((
                        row.get::<_, Option<i64>>(0)?,
                        row.get::<_, bool>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                },
            )
            .optional()?;
        let Some((current_index, shuffle, repeat)) = state else {
            return Ok(QueueSnapshot::default());
        };
        let current_index = current_index
            .and_then(|value| usize::try_from(value).ok())
            .filter(|value| *value < tracks.len());
        Ok(QueueSnapshot {
            tracks,
            current_index,
            shuffle,
            repeat: parse_repeat(&repeat),
        })
    }
}

const fn repeat_name(value: RepeatMode) -> &'static str {
    match value {
        RepeatMode::Off => "off",
        RepeatMode::All => "all",
        RepeatMode::One => "one",
    }
}

fn parse_repeat(value: &str) -> RepeatMode {
    match value {
        "all" => RepeatMode::All,
        "one" => RepeatMode::One,
        _ => RepeatMode::Off,
    }
}
