use anyhow::Result;
use rusqlite::Connection;

pub fn initialize_schema(connection: &Connection) -> Result<()> {
    connection.execute_batch(
        "
        CREATE TABLE IF NOT EXISTS schema_meta (
            version INTEGER NOT NULL
        );
        INSERT INTO schema_meta(version)
        SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM schema_meta);

        CREATE TABLE IF NOT EXISTS playlists (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            description TEXT NOT NULL,
            source_url TEXT,
            cover_url TEXT,
            created_at_ms INTEGER NOT NULL,
            updated_at_ms INTEGER NOT NULL
        );
        CREATE TABLE IF NOT EXISTS playlist_tracks (
            playlist_id TEXT NOT NULL,
            position INTEGER NOT NULL,
            provider_key TEXT NOT NULL,
            track_json TEXT NOT NULL,
            PRIMARY KEY (playlist_id, position),
            FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
        );
        CREATE UNIQUE INDEX IF NOT EXISTS idx_playlist_track_provider
            ON playlist_tracks(playlist_id, provider_key);

        CREATE TABLE IF NOT EXISTS library_tracks (
            provider_key TEXT PRIMARY KEY,
            canonical_key TEXT NOT NULL,
            track_json TEXT NOT NULL,
            liked_at_ms INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_library_canonical
            ON library_tracks(canonical_key);

        CREATE TABLE IF NOT EXISTS history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            provider_key TEXT NOT NULL,
            track_json TEXT NOT NULL,
            played_at_ms INTEGER NOT NULL,
            completed INTEGER NOT NULL,
            skipped INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_history_played
            ON history(played_at_ms DESC);

        CREATE TABLE IF NOT EXISTS queue_tracks (
            position INTEGER PRIMARY KEY,
            track_json TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS queue_state (
            singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
            current_index INTEGER,
            shuffle INTEGER NOT NULL,
            repeat_mode TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS recommendation_cache (
            key TEXT PRIMARY KEY,
            payload_json TEXT NOT NULL,
            updated_at INTEGER NOT NULL
        );

        CREATE TABLE IF NOT EXISTS followed_artists (
            id TEXT PRIMARY KEY,
            provider TEXT NOT NULL,
            name TEXT NOT NULL,
            avatar_url TEXT,
            header_image_url TEXT,
            monthly_listeners INTEGER,
            verified INTEGER NOT NULL DEFAULT 0,
            added_at_ms INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_followed_artists_provider
            ON followed_artists(provider);
        CREATE INDEX IF NOT EXISTS idx_followed_artists_added
            ON followed_artists(added_at_ms DESC);

        CREATE TABLE IF NOT EXISTS pending_artist_deletions (
            user_id TEXT NOT NULL,
            provider TEXT NOT NULL,
            artist_id TEXT NOT NULL,
            created_at_ms INTEGER NOT NULL,
            PRIMARY KEY (user_id, provider, artist_id)
        );
        CREATE INDEX IF NOT EXISTS idx_pending_artist_deletions_user
            ON pending_artist_deletions(user_id);
        ",
    )?;

    // Миграция: колонка cover_url для обложек плейлистов
    let has_cover = connection
        .prepare("PRAGMA table_info(playlists)")?
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<Result<Vec<_>, _>>()?
        .iter()
        .any(|name| name == "cover_url");
    if !has_cover {
        connection.execute("ALTER TABLE playlists ADD COLUMN cover_url TEXT", [])?;
    }

    // Миграция: колонка position для ручного порядка плейлистов
    let playlist_columns = connection
        .prepare("PRAGMA table_info(playlists)")?
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<Result<Vec<_>, _>>()?;
    if !playlist_columns.iter().any(|name| name == "position") {
        connection.execute("ALTER TABLE playlists ADD COLUMN position INTEGER", [])?;
    }

    // Миграция: колонки is_album и artist_name для разделения альбомов и плейлистов
    if !playlist_columns.iter().any(|name| name == "is_album") {
        connection.execute(
            "ALTER TABLE playlists ADD COLUMN is_album INTEGER NOT NULL DEFAULT 0",
            [],
        )?;
    }
    if !playlist_columns.iter().any(|name| name == "artist_name") {
        connection.execute("ALTER TABLE playlists ADD COLUMN artist_name TEXT", [])?;
    }

    // Автоматически размечаем уже импортированные альбомы для всех провайдеров
    let _ = connection.execute(
        "UPDATE playlists SET is_album = 1 WHERE is_album = 0 AND (source_url LIKE '%/album/%' OR source_url LIKE '%spotify:album:%' OR source_url LIKE '%browse/MPRE%' OR source_url LIKE '%album%')",
        [],
    );

    // Миграция: колонка added_at_ms для даты добавления трека в плейлист
    let track_columns = connection
        .prepare("PRAGMA table_info(playlist_tracks)")?
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<Result<Vec<_>, _>>()?;
    if !track_columns.iter().any(|name| name == "added_at_ms") {
        connection.execute(
            "ALTER TABLE playlist_tracks ADD COLUMN added_at_ms INTEGER",
            [],
        )?;
    }
    Ok(())
}
