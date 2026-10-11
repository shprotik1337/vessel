use anyhow::Result;
use rusqlite::Connection;

pub struct RecommendationCacheRepository;

impl RecommendationCacheRepository {
    pub fn get(connection: &Connection, key: &str, max_age_secs: i64) -> Result<Option<String>> {
        let now = chrono::Utc::now().timestamp();
        let min_updated = now - max_age_secs;
        let mut statement = connection.prepare(
            "SELECT payload_json FROM recommendation_cache WHERE key = ?1 AND updated_at >= ?2",
        )?;
        let mut rows = statement.query(rusqlite::params![key, min_updated])?;
        if let Some(row) = rows.next()? {
            Ok(Some(row.get(0)?))
        } else {
            Ok(None)
        }
    }

    pub fn set(connection: &Connection, key: &str, payload_json: &str) -> Result<()> {
        let now = chrono::Utc::now().timestamp();
        connection.execute(
            "INSERT INTO recommendation_cache (key, payload_json, updated_at) VALUES (?1, ?2, ?3)
             ON CONFLICT(key) DO UPDATE SET payload_json = excluded.payload_json, updated_at = excluded.updated_at",
            rusqlite::params![key, payload_json, now],
        )?;
        Ok(())
    }
}
