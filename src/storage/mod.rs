pub mod artist;
pub mod cache;
pub mod codec;
pub mod history;
pub mod library;
pub mod playlist;
pub mod queue;
pub mod schema;

use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex, MutexGuard};

use anyhow::{Context, Result};
use rusqlite::Connection;
use uuid::Uuid;

use crate::model::{FollowedArtist, Playlist, TrackRef};

pub use artist::FollowedArtistsRepository;
pub use history::HistoryEntry;
pub use queue::QueueSnapshot;

pub use cache::RecommendationCacheRepository;
pub use history::HistoryRepository;
pub use library::LibraryRepository;
pub use playlist::PlaylistRepository;
pub use queue::QueueRepository;

#[derive(Clone)]
pub struct Storage {
    path: PathBuf,
    history_limit: usize,
    conn: Arc<Mutex<Option<Connection>>>,
}

impl std::fmt::Debug for Storage {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("Storage")
            .field("path", &self.path)
            .field("history_limit", &self.history_limit)
            .finish()
    }
}

pub struct StorageConnection<'a> {
    guard: MutexGuard<'a, Option<Connection>>,
}

impl<'a> std::ops::Deref for StorageConnection<'a> {
    type Target = Connection;
    fn deref(&self) -> &Self::Target {
        self.guard.as_ref().expect("Connection must be open")
    }
}

impl<'a> std::ops::DerefMut for StorageConnection<'a> {
    fn deref_mut(&mut self) -> &mut Self::Target {
        self.guard.as_mut().expect("Connection must be open")
    }
}

impl Storage {
    pub fn new(path: PathBuf) -> Self {
        Self {
            path,
            history_limit: 2000,
            conn: Arc::new(Mutex::new(None)),
        }
    }

    pub fn set_history_limit(&mut self, limit: usize) {
        self.history_limit = limit.clamp(500, 10_000);
    }

    pub fn prune_history(&self, limit: usize) -> Result<usize> {
        let conn = self.connection()?;
        HistoryRepository::prune(&conn, limit)
    }

    pub fn vacuum_into(&self, target: &Path) -> Result<()> {
        self.connection()?.execute_batch(
            &format!("VACUUM INTO '{}'", target.display().to_string().replace('\'', "''")),
        )?;
        Ok(())
    }

    pub fn path(&self) -> &Path {
        &self.path
    }

    pub fn initialize(&self) -> Result<()> {
        if let Some(parent) = self.path.parent() {
            std::fs::create_dir_all(parent)
                .with_context(|| format!("Не удалось создать каталог БД {}", parent.display()))?;
        }
        let connection = self.connection()?;
        schema::initialize_schema(&connection)
    }

    // --- Playlist Operations ---

    pub fn save_playlist(&self, playlist: &Playlist) -> Result<()> {
        let mut connection = self.connection()?;
        PlaylistRepository::save(&mut connection, playlist)
    }

    pub fn save_playlists_order(&self, order: &[String]) -> Result<()> {
        let mut connection = self.connection()?;
        PlaylistRepository::save_order(&mut connection, order)
    }

    pub fn playlist_track_times(&self, id: Uuid) -> Result<Vec<(TrackRef, i64)>> {
        let conn = self.connection()?;
        PlaylistRepository::track_times(&conn, id)
    }

    pub fn delete_playlist(&self, id: Uuid) -> Result<bool> {
        let conn = self.connection()?;
        PlaylistRepository::delete(&conn, id)
    }

    pub fn list_playlists(&self) -> Result<Vec<Playlist>> {
        let conn = self.connection()?;
        PlaylistRepository::list(&conn)
    }

    // --- Followed Artists Operations ---

    pub fn follow_artist(&self, artist: &FollowedArtist) -> Result<()> {
        let conn = self.connection()?;
        FollowedArtistsRepository::save(&conn, artist)
    }

    pub fn unfollow_artist(&self, id: &str) -> Result<bool> {
        let conn = self.connection()?;
        FollowedArtistsRepository::delete(&conn, id)
    }

    pub fn is_artist_followed(&self, id: &str) -> Result<bool> {
        let conn = self.connection()?;
        FollowedArtistsRepository::is_followed(&conn, id)
    }

    pub fn list_followed_artists(&self) -> Result<Vec<FollowedArtist>> {
        let conn = self.connection()?;
        FollowedArtistsRepository::list(&conn)
    }

    // --- Library Operations ---

    pub fn like_track(&self, track: &TrackRef, liked_at_ms: i64) -> Result<()> {
        let conn = self.connection()?;
        LibraryRepository::like_track(&conn, track, liked_at_ms)
    }

    pub fn unlike_track(&self, track: &TrackRef) -> Result<bool> {
        let conn = self.connection()?;
        LibraryRepository::unlike_track(&conn, track)
    }

    pub fn reorder_library(&self, order: &[String]) -> Result<()> {
        let mut connection = self.connection()?;
        LibraryRepository::reorder(&mut connection, order)
    }

    pub fn library_tracks(&self) -> Result<Vec<TrackRef>> {
        let conn = self.connection()?;
        LibraryRepository::list(&conn)
    }

    pub fn liked_tracks_with_time(&self) -> Result<Vec<(TrackRef, i64)>> {
        let conn = self.connection()?;
        LibraryRepository::list_with_time(&conn)
    }

    // --- History Operations ---

    pub fn record_history(&self, entry: &HistoryEntry) -> Result<()> {
        let conn = self.connection()?;
        HistoryRepository::record(&conn, entry, self.history_limit)
    }

    pub fn recent_history(&self, limit: usize) -> Result<Vec<HistoryEntry>> {
        let conn = self.connection()?;
        HistoryRepository::recent(&conn, limit)
    }

    pub fn history_between(
        &self,
        start_ms: i64,
        end_ms: i64,
        limit: usize,
    ) -> Result<Vec<HistoryEntry>> {
        let conn = self.connection()?;
        HistoryRepository::between(&conn, start_ms, end_ms, limit)
    }

    pub fn clear_history(&self) -> Result<()> {
        let conn = self.connection()?;
        HistoryRepository::clear(&conn)
    }

    // --- Queue Operations ---

    pub fn save_queue(&self, snapshot: &QueueSnapshot) -> Result<()> {
        let mut connection = self.connection()?;
        QueueRepository::save(&mut connection, snapshot)
    }

    pub fn load_queue(&self) -> Result<QueueSnapshot> {
        let conn = self.connection()?;
        QueueRepository::load(&conn)
    }

    // --- Maintenance & Cache ---

    pub fn clear_all(&self) -> Result<()> {
        let connection = self.connection()?;
        connection.execute_batch(
            "
            DELETE FROM playlist_tracks;
            DELETE FROM playlists;
            DELETE FROM library_tracks;
            DELETE FROM history;
            DELETE FROM queue_tracks;
            DELETE FROM queue_state;
            ",
        )?;
        Ok(())
    }

    pub fn get_cached_recommendation(&self, key: &str, max_age_secs: i64) -> Result<Option<String>> {
        let conn = self.connection()?;
        RecommendationCacheRepository::get(&conn, key, max_age_secs)
    }

    pub fn set_cached_recommendation(&self, key: &str, payload_json: &str) -> Result<()> {
        let conn = self.connection()?;
        RecommendationCacheRepository::set(&conn, key, payload_json)
    }

    pub fn connection(&self) -> Result<StorageConnection<'_>> {
        let mut guard = self.conn.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
        if guard.is_none() {
            if let Some(parent) = self.path.parent() {
                let _ = std::fs::create_dir_all(parent);
            }
            let connection = Connection::open(&self.path)
                .with_context(|| format!("Не удалось открыть БД {}", self.path.display()))?;
            // WAL, потому что морозить плеер одной записью умеют и без нас
            connection.pragma_update(None, "journal_mode", "WAL")?;
            connection.pragma_update(None, "foreign_keys", "ON")?;
            connection.busy_timeout(std::time::Duration::from_secs(5))?;
            *guard = Some(connection);
        }
        Ok(StorageConnection { guard })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{PlaybackCapability, ProviderKind, RepeatMode};
    use url::Url;

    fn track(id: &str) -> TrackRef {
        TrackRef {
            provider: ProviderKind::SoundCloud,
            id: id.to_string(),
            title: format!("Трек {id}"),
            artists: vec!["Исполнитель".to_string()],
            duration_ms: Some(100_000),
            artwork_url: None,
            web_url: Url::parse("https://soundcloud.com/a/b").unwrap(),
            capability: PlaybackCapability::Full,
            genres: vec!["test".to_string()],
            explicit: false,
            drm: false,
            isrc: None,
            origin: crate::model::TrackOrigin::Original,
            album_url: None,
            album_title: None,
        }
    }

    fn test_storage() -> (tempfile::TempDir, Storage) {
        let temp = tempfile::tempdir().unwrap();
        let storage = Storage::new(temp.path().join("library.sqlite3"));
        storage.initialize().unwrap();
        (temp, storage)
    }

    #[test]
    fn playlist_and_library_roundtrip_work() {
        let (_temp, storage) = test_storage();
        let mut playlist = Playlist::new("Плейлист", 10);
        playlist.push_unique(track("1"));
        storage.save_playlist(&playlist).unwrap();
        storage.like_track(&track("1"), 11).unwrap();
        let playlists = storage.list_playlists().unwrap();
        assert_eq!(playlists.len(), 1);
        assert_eq!(playlists[0].tracks, vec![track("1")]);
        assert_eq!(storage.library_tracks().unwrap(), vec![track("1")]);
    }

    #[test]
    fn history_and_queue_roundtrip_work() {
        let (_temp, storage) = test_storage();
        storage
            .record_history(&HistoryEntry {
                track: track("1"),
                played_at_ms: 20,
                completed: true,
                skipped: false,
            })
            .unwrap();
        let queue = QueueSnapshot {
            tracks: vec![track("1"), track("2")],
            current_index: Some(1),
            shuffle: true,
            repeat: RepeatMode::All,
        };
        storage.save_queue(&queue).unwrap();
        assert_eq!(storage.recent_history(10).unwrap().len(), 1);
        assert_eq!(storage.load_queue().unwrap(), queue);
    }

    #[test]
    fn wave_reads_real_like_timestamps_instead_of_inventing_them() {
        let (_temp, storage) = test_storage();
        let first = track("first");
        let second = track("second");
        storage.like_track(&first, 10).unwrap();
        storage.like_track(&second, 20).unwrap();
        assert_eq!(
            storage.liked_tracks_with_time().unwrap(),
            [(second, 20), (first, 10)]
        );
    }

    #[test]
    fn history_between_filters_both_date_boundaries() {
        let (_temp, storage) = test_storage();
        for played_at_ms in [999, 1_000, 1_999, 2_000] {
            storage
                .record_history(&HistoryEntry {
                    track: track(&played_at_ms.to_string()),
                    played_at_ms,
                    completed: false,
                    skipped: false,
                })
                .unwrap();
        }

        let entries = storage.history_between(1_000, 2_000, 10).unwrap();
        assert_eq!(
            entries
                .iter()
                .map(|entry| entry.played_at_ms)
                .collect::<Vec<_>>(),
            vec![1_999, 1_000]
        );
    }
}
