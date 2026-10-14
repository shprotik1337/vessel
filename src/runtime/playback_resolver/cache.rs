use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};

use crate::model::TrackRef;

pub const CACHE_CLEANUP_EVERY: Duration = Duration::from_secs(10 * 60);
pub const CACHE_MAX_ENTRIES: usize = 2000;

struct MatchCacheInner {
    map: HashMap<String, Vec<TrackRef>>,
    last_cleanup: Instant,
}

/// Кэш матчей: {провайдер}:{id} → список чужих TrackRef (лучший первым).
pub struct MatchCache {
    inner: Mutex<MatchCacheInner>,
}

impl MatchCache {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(MatchCacheInner {
                map: HashMap::new(),
                last_cleanup: Instant::now(),
            }),
        }
    }

    pub fn get(&self, key: &str) -> Option<Vec<TrackRef>> {
        self.inner.lock().ok()?.map.get(key).cloned()
    }

    pub fn put(&self, key: String, foreign: Vec<TrackRef>) {
        if let Ok(mut inner) = self.inner.lock() {
            // Ротация: раз в 10 минут при переполнении чистим всё
            // (матчи недорого восстановить поисковым запросом)
            if inner.map.len() >= CACHE_MAX_ENTRIES
                && inner.last_cleanup.elapsed() > CACHE_CLEANUP_EVERY
            {
                inner.map.clear();
                inner.last_cleanup = Instant::now();
            }
            inner.map.insert(key, foreign);
        }
    }

    /// Убрать матч из кэша (источник оказался непроигрываемым).
    pub fn drop_key(&self, key: &str) {
        if let Ok(mut inner) = self.inner.lock() {
            inner.map.remove(key);
        }
    }
}
