use anyhow::{Context, Result};
use rusqlite::Connection;
use crate::model::TrackRef;

pub fn encode_track(track: &TrackRef) -> Result<String> {
    serde_json::to_string(track).context("Не удалось сохранить трек")
}

pub fn decode_track(value: &str) -> Result<TrackRef> {
    serde_json::from_str(value).context("В БД найден повреждённый трек")
}

pub fn load_track_column(
    connection: &Connection,
    query: &str,
    params: &[&dyn rusqlite::ToSql],
) -> Result<Vec<TrackRef>> {
    let mut statement = connection.prepare(query)?;
    let rows = statement.query_map(params, |row| row.get::<_, String>(0))?;
    let mut tracks = Vec::new();
    for row in rows {
        tracks.push(decode_track(&row?)?);
    }
    Ok(tracks)
}
