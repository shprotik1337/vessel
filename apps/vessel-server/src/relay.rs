//! Транзитный аудио-канал (`/api/v1/s/{token}`): сервер резолвит источник и,
//! если URL IP-привязан (googlevideo) или это временный расшифрованный файл,
//! раздаёт байты от своего имени.
//!
//! Никакого «серверного кэша музыки» здесь нет и быть не должно: токен живёт
//! ограниченное время, file-мишени удаляются при прунинге, в диске сервера
//! остаются только временные файлы провайдеров.

use std::{
    collections::HashMap,
    path::PathBuf,
    sync::Mutex,
    time::{Duration, Instant},
};

use url::Url;

#[derive(Clone, Debug)]
pub enum RelayTarget {
    Http { url: Url, headers: Vec<(String, String)> },
    File(PathBuf),
}

struct Entry {
    target: RelayTarget,
    content_type: Option<String>,
    expires: Instant,
}

pub struct RelayStore {
    entries: Mutex<HashMap<String, Entry>>,
    ttl: Duration,
    cap: usize,
}

impl RelayStore {
    pub fn new(ttl_seconds: u64) -> Self {
        Self {
            entries: Mutex::new(HashMap::new()),
            ttl: Duration::from_secs(ttl_seconds),
            cap: 4096,
        }
    }

    pub fn mint(&self, target: RelayTarget, content_type: Option<String>) -> String {
        let token = uuid::Uuid::new_v4().simple().to_string();
        let mut entries = self.entries.lock().unwrap_or_else(|p| p.into_inner());
        self.prune_locked(&mut entries);
        if entries.len() >= self.cap {
            // эвиктим самый протухший, чтобы стор не разрастался
            let oldest = entries
                .iter()
                .min_by_key(|(_, entry)| entry.expires)
                .map(|(key, _)| key.clone());
            if let Some(key) = oldest {
                if let Some(entry) = entries.remove(&key) {
                    delete_target_file(&entry.target);
                }
            }
        }
        entries.insert(
            token.clone(),
            Entry { target, content_type, expires: Instant::now() + self.ttl },
        );
        token
    }

    pub fn get(&self, token: &str) -> Option<(RelayTarget, Option<String>)> {
        let mut entries = self.entries.lock().unwrap_or_else(|p| p.into_inner());
        let entry = entries.get(token)?;
        if entry.expires < Instant::now() {
            let entry = entries.remove(token);
            if let Some(entry) = entry {
                delete_target_file(&entry.target);
            }
            return None;
        }
        Some((entry.target.clone(), entry.content_type.clone()))
    }

    pub fn prune(&self) {
        let mut entries = self.entries.lock().unwrap_or_else(|p| p.into_inner());
        self.prune_locked(&mut entries);
    }

    fn prune_locked(&self, entries: &mut HashMap<String, Entry>) {
        let now = Instant::now();
        let expired: Vec<String> = entries
            .iter()
            .filter(|(_, entry)| entry.expires < now)
            .map(|(key, _)| key.clone())
            .collect();
        for key in expired {
            if let Some(entry) = entries.remove(&key) {
                delete_target_file(&entry.target);
            }
        }
    }

    /// Удалить все file-мишени (закрытие сервера).
    pub fn cleanup_all(&self) {
        let mut entries = self.entries.lock().unwrap_or_else(|p| p.into_inner());
        for (_, entry) in entries.drain() {
            delete_target_file(&entry.target);
        }
    }
}

fn delete_target_file(target: &RelayTarget) {
    if let RelayTarget::File(path) = target {
        let _ = std::fs::remove_file(path);
    }
}

/// Счётчик активных relay-стримов против `max_streams` сервера.
/// Permit живёт в 'static-стриме, поэтому счётчик — Arc.
#[derive(Clone)]
pub struct RelayLimiter {
    active: std::sync::Arc<std::sync::atomic::AtomicUsize>,
    limit: usize,
}

impl RelayLimiter {
    pub fn new(limit: usize) -> Self {
        Self {
            active: std::sync::Arc::new(std::sync::atomic::AtomicUsize::new(0)),
            limit,
        }
    }

    pub fn try_acquire(&self) -> Option<RelayPermit> {
        let prev = self
            .active
            .fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        if prev >= self.limit {
            self.active.fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
            return None;
        }
        Some(RelayPermit {
            active: std::sync::Arc::clone(&self.active),
        })
    }
}

pub struct RelayPermit {
    active: std::sync::Arc<std::sync::atomic::AtomicUsize>,
}

impl Drop for RelayPermit {
    fn drop(&mut self) {
        self.active.fetch_sub(1, std::sync::atomic::Ordering::SeqCst);
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn mint_get_and_prune() {
        let store = RelayStore::new(60);
        let token = store.mint(
            RelayTarget::Http {
                url: Url::parse("https://x.test/a.mp3").unwrap(),
                headers: vec![],
            },
            Some("audio/mp4".to_string()),
        );
        let (target, mime) = store.get(&token).unwrap();
        assert!(matches!(target, RelayTarget::Http { .. }));
        assert_eq!(mime.as_deref(), Some("audio/mp4"));
        assert!(store.get("deadbeef").is_none());
        store.prune();
        assert!(store.get(&token).is_some());
    }

    #[test]
    fn expired_token_is_dropped() {
        let store = RelayStore::new(0);
        let token =
            store.mint(RelayTarget::Http { url: Url::parse("https://x.test").unwrap(), headers: vec![] }, None);
        assert!(store.get(&token).is_none());
    }

    #[test]
    fn limiter_counts_down_on_drop() {
        let limiter = RelayLimiter::new(2);
        let a = limiter.try_acquire().expect("permit a");
        let b = limiter.try_acquire().expect("permit b");
        assert!(limiter.try_acquire().is_none());
        drop(a);
        assert!(limiter.try_acquire().is_some());
        drop(b);
    }
}
