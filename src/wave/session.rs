use std::{
    collections::{HashSet, VecDeque},
    sync::Arc,
};

use tokio::sync::RwLock;

use crate::model::{ProviderKind, TrackRef};

use super::{config::WaveMode, text::track_semantic_key};

/// Состояние сессии воспроизведения для непрерывного потока («Моя волна» или Autoplay).
#[derive(Clone, Debug)]
pub struct WaveSession {
    pub session_id: String,
    pub mode: WaveMode,
    pub primary_provider: Option<ProviderKind>,
    pub played_in_session: HashSet<String>,
    pub skipped_in_session: HashSet<String>,
    pub liked_in_session: HashSet<String>,
    pub current_seeds: Vec<TrackRef>,
    pub queue_buffer: VecDeque<TrackRef>,
    pub last_refreshed_at_ms: i64,
}

impl WaveSession {
    pub fn new(session_id: String, mode: WaveMode, primary_provider: Option<ProviderKind>) -> Self {
        Self {
            session_id,
            mode,
            primary_provider,
            played_in_session: HashSet::new(),
            skipped_in_session: HashSet::new(),
            liked_in_session: HashSet::new(),
            current_seeds: Vec::new(),
            queue_buffer: VecDeque::new(),
            last_refreshed_at_ms: 0,
        }
    }

    /// Отмечает трек как воспроизведенный в рамках текущей сессии
    pub fn mark_played(&mut self, track: &TrackRef) {
        let sk = track_semantic_key(track);
        self.played_in_session.insert(sk);
        // Добавляем в скользящее окно активных сидов (держим до 8 свежих треков)
        self.current_seeds
            .retain(|t| track_semantic_key(t) != track_semantic_key(track));
        self.current_seeds.push(track.clone());
        if self.current_seeds.len() > 8 {
            self.current_seeds.remove(0);
        }
    }

    /// Фиксирует обратную связь (пропуск трека за первые 20 сек или лайк)
    pub fn record_feedback(&mut self, track: &TrackRef, was_skipped: bool, was_liked: bool) {
        let sk = track_semantic_key(track);
        if was_skipped {
            self.skipped_in_session.insert(sk.clone());
            // Если пропустили — убираем из активных сидов
            self.current_seeds.retain(|t| track_semantic_key(t) != sk);
        }
        if was_liked {
            self.liked_in_session.insert(sk);
            // При лайке делаем этот трек приоритетным сидом
            self.current_seeds
                .retain(|t| track_semantic_key(t) != track_semantic_key(track));
            self.current_seeds.push(track.clone());
        }
    }

    /// Проверяет, играл ли уже этот трек в данной сессии
    pub fn is_played(&self, track: &TrackRef) -> bool {
        self.played_in_session.contains(&track_semantic_key(track))
    }
}

/// Глобальный менеджер сессий в оперативной памяти
#[derive(Clone, Default)]
pub struct WaveSessionManager {
    sessions: Arc<RwLock<std::collections::HashMap<String, WaveSession>>>,
}

impl WaveSessionManager {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(RwLock::new(std::collections::HashMap::new())),
        }
    }

    pub async fn get_or_create(
        &self,
        session_id: &str,
        mode: WaveMode,
        primary_provider: Option<ProviderKind>,
    ) -> WaveSession {
        let mut map = self.sessions.write().await;
        if let Some(session) = map.get(session_id) {
            session.clone()
        } else {
            let session = WaveSession::new(session_id.to_string(), mode, primary_provider);
            map.insert(session_id.to_string(), session.clone());
            session
        }
    }

    pub async fn update(&self, session: WaveSession) {
        let mut map = self.sessions.write().await;
        map.insert(session.session_id.clone(), session);
    }

    pub async fn remove(&self, session_id: &str) {
        let mut map = self.sessions.write().await;
        map.remove(session_id);
    }
}
