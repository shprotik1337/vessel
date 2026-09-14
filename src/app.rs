use std::time::{SystemTime, UNIX_EPOCH};

use anyhow::Result;
use serde::Serialize;

use crate::{
    action::Action,
    config::{AppConfig, HotkeyBindings},
    effect::AppEffect,
    model::{Playlist, RepeatMode, SearchProvider, TrackRef},
    onboarding::OnboardingResult,
    storage::{QueueSnapshot, Storage},
    user::UserProfile,
};

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum PlaybackStatus {
    Playing,
    #[default]
    Paused,
    Buffering,
    Stopped,
    /// Трек не смог включиться (матч не найден / источник недоступен).
    /// От Stopped отличается тем, что UI показывает ошибку и предлагает
    /// повторить; повторный Play пересоздаёт сессию с нуля.
    Error,
}

#[derive(Clone, Debug, Serialize)]
pub struct PlayerState {
    pub status: PlaybackStatus,
    pub position_ms: u64,
    pub buffered_ms: u64,
    pub duration_ms: u64,
    pub volume_percent: u8,
    pub shuffle: bool,
    pub repeat: RepeatMode,
}

impl Default for PlayerState {
    fn default() -> Self {
        Self {
            status: PlaybackStatus::Stopped,
            position_ms: 0,
            buffered_ms: 0,
            duration_ms: 0,
            volume_percent: 75,
            shuffle: false,
            repeat: RepeatMode::Off,
        }
    }
}

#[derive(Debug)]
pub struct App {
    pub home_tracks: Vec<TrackRef>,
    pub library: Vec<TrackRef>,
    pub playlists: Vec<Playlist>,
    pub queue: Vec<TrackRef>,
    pub queue_index: Option<usize>,
    pub now_playing: Option<TrackRef>,
    pub player: PlayerState,
    pub soundcloud_enabled: bool,
    pub yandex_enabled: bool,
    pub deezer_enabled: bool,
    pub spotify_enabled: bool,
    pub youtube_music_enabled: bool,
    pub global_hotkeys_enabled: bool,
    pub hotkeys: HotkeyBindings,
    pub keybindings_notice_seen: bool,
    pub queue_dirty: bool,
    pub config_dirty: bool,
    pub playlists_dirty: bool,
    pub status_message: String,
    pub user_profile: Option<UserProfile>,
    pub user_dirty: bool,
    onboarding_result: Option<OnboardingResult>,
    effects: Vec<AppEffect>,
    /// Треки, для которых уже был перезапуск из-за обрезанного кэш-файла
    /// (защита от бесконечного цикла переигрывания)
    retried_corrupt_cache: std::collections::HashSet<String>,
}

impl App {
    pub fn load(storage: &Storage, config: &AppConfig) -> Result<Self> {
        let queue = storage.load_queue()?;
        let queue_index = queue.current_index;
        let now_playing = queue_index.and_then(|index| queue.tracks.get(index).cloned());
        Ok(Self {
            home_tracks: storage
                .recent_history(24)?
                .into_iter()
                .map(|entry| entry.track)
                .collect(),
            library: storage.library_tracks()?,
            playlists: storage.list_playlists()?,
            queue: queue.tracks,
            queue_index,
            now_playing,
            player: PlayerState {
                volume_percent: config.volume_percent,
                shuffle: queue.shuffle,
                repeat: queue.repeat,
                ..PlayerState::default()
            },
            soundcloud_enabled: config.soundcloud_enabled,
            yandex_enabled: config.yandex_enabled,
            deezer_enabled: config.deezer_enabled,
            spotify_enabled: config.spotify_enabled,
            youtube_music_enabled: config.youtube_music_enabled,
            global_hotkeys_enabled: config.global_hotkeys_enabled,
            hotkeys: config.hotkeys.clone(),
            keybindings_notice_seen: config.keybindings_notice_seen,
            queue_dirty: false,
            config_dirty: false,
            playlists_dirty: false,
            status_message: "Готово".to_string(),
            user_profile: None,
            user_dirty: false,
            onboarding_result: None,
            effects: Vec::new(),
            retried_corrupt_cache: std::collections::HashSet::new(),
        })
    }

    pub fn handle(&mut self, action: Action) {
        match action {
            Action::TogglePause => {
                if let Some(track) = self.now_playing.clone() {
                    let (status, effect) = match self.player.status {
                        PlaybackStatus::Playing | PlaybackStatus::Buffering => {
                            (PlaybackStatus::Paused, AppEffect::Pause)
                        }
                        // Stopped/Error: перезапуск сессии, а не бездействующий Resume
                        PlaybackStatus::Stopped | PlaybackStatus::Error => {
                            self.player.position_ms = 0;
                            self.player.buffered_ms = 0;
                            (PlaybackStatus::Buffering, AppEffect::Play(Box::new(track)))
                        }
                        _ => (PlaybackStatus::Playing, AppEffect::Resume),
                    };
                    self.player.status = status;
                    self.effects.push(effect);
                }
            }
            Action::NextTrack => self.next_track(),
            Action::PreviousTrack => self.previous_track(),
            Action::ChangeVolume(delta) => {
                self.player.volume_percent =
                    (i16::from(self.player.volume_percent) + i16::from(delta)).clamp(0, 100) as u8;
                self.effects
                    .push(AppEffect::SetVolume(self.player.volume_percent));
                self.config_dirty = true;
            }
            Action::Seek(delta) => {
                self.player.position_ms = (self.player.position_ms as i64 + delta)
                    .clamp(0, self.player.duration_ms as i64) as u64;
                if self.now_playing.is_some() {
                    self.effects.push(AppEffect::Seek(self.player.position_ms));
                }
            }
            Action::ToggleShuffle => {
                self.player.shuffle = !self.player.shuffle;
                self.queue_dirty = true;
            }
            Action::CycleRepeat => {
                self.player.repeat = match self.player.repeat {
                    RepeatMode::Off => RepeatMode::All,
                    RepeatMode::All => RepeatMode::One,
                    RepeatMode::One => RepeatMode::Off,
                };
                self.queue_dirty = true;
            }
            Action::ToggleLike => {
                if let Some(track) = self.library.last().cloned() {
                    self.gui_toggle_like_track(&track);
                }
            }
            Action::SearchFinished { .. } => {}
            Action::ControlSearchFinished { .. } => {}
            Action::WaveFinished { .. } => {}
            Action::ControlWaveFinished { .. } => {}
            Action::AudioProgress { position_ms, buffered_ms, duration_ms } => {
                // Декодерная длительность применяется только для локальных
                // файлов (file://): скачанные старым пайплайном файлы бывают
                // обрезаны (1 MiB лимит) — тогда доверяем декодеру и
                // перескачиваем битый кэш.
                // Для потоков (http/hls) декодерная длительность ненадёжна
                // (SoundCloud HLS отдаёт длительность сегмента ~10с) — там
                // всегда используем метаданные трека.
                let is_local_file = self
                    .now_playing
                    .as_ref()
                    .is_some_and(|track| {
                        crate::provider::cache::cached_track_path(track).is_some_and(|p| {
                            p.file_stem()
                                .map(|s| s.to_string_lossy().to_string())
                                .is_some_and(|s| {
                                    let id: String = track.id.trim().chars().take(64).collect();
                                    s.contains(&id)
                                })
                        })
                    });
                let _ = is_local_file;

                // Обрезанный кэш-файл: декодерная длительность сильно меньше
                // метаданных — удаляем битый кэш и перезапускаем трек
                if let Some(track) = self.now_playing.clone()
                    && let Some(meta) = track.duration_ms
                    && duration_ms > 0
                    && duration_ms + 10_000 < meta
                {
                    let key = track.provider_key();
                    if self.retried_corrupt_cache.insert(key) {
                        crate::dlog!(
                            "[cache] файл обрезан: декодер {}ms < метаданные {}ms — перескачиваю",
                            duration_ms, meta
                        );
                        crate::provider::cache::delete_cached_track(&track);
                        self.effects.push(AppEffect::Play(Box::new(track)));
                        return;
                    }
                }

                // Честная длительность: декодерная — для локальных файлов,
                // метаданные — для потоков
                if duration_ms > 0 {
                    let decoded_is_truth = self.now_playing.as_ref().is_some_and(|track| {
                        crate::provider::cache::cached_source(track)
                            .is_some_and(|s| s.url.scheme() == "file")
                    });
                    if decoded_is_truth {
                        self.player.duration_ms = duration_ms;
                    } else if self.player.duration_ms == 0 {
                        self.player.duration_ms = duration_ms;
                    }
                }
                self.player.position_ms = if self.player.duration_ms == 0 {
                    position_ms
                } else {
                    position_ms.min(self.player.duration_ms)
                };
                self.player.buffered_ms = buffered_ms;
            }
            Action::Audio(event) => self.handle_audio_event(event),
            Action::PlaybackFailed(error) => {
                // Явный ERROR-статус: не возвращаемся молча в старое состояние
                self.player.status = PlaybackStatus::Error;
                self.status_message = format!("Не удалось включить трек: {error}");
            }
            Action::PlaybackNotice(message) => {
                // Некритичное предупреждение (клип-версия и т.п.)
                self.status_message = message;
            }
            Action::OpenPlaylistImport => {
                self.status_message = "Вставь ссылку на плейлист SoundCloud, Yandex или Deezer".to_string();
            }
            Action::CloseModal | Action::ModalSubmit | Action::ModalPrevious
                | Action::ModalNext | Action::ModalToggle
                | Action::ModalInput(_) | Action::ModalBackspace => {}
            Action::CredentialSaved { kind, result } => {
                if let Err(error) = result {
                    self.status_message = format!("Не удалось сохранить {:?}: {error}", kind);
                }
            }
            Action::PlaylistImported(result) => {
                if let Ok(playlist) = result {
                    if !self.playlists.iter().any(|p| p.id == playlist.id) {
                        self.playlists.insert(0, playlist);
                    }
                    self.playlists_dirty = true;
                } else if let Err(error) = result {
                    self.status_message = format!("Импорт не удался: {error}");
                }
            }
            Action::LikeSaved { track, liked, result } => {
                if result.is_err() {
                    let key = track.provider_key();
                    if liked {
                        self.library.retain(|current| current.provider_key() != key);
                    } else if !self.library.iter().any(|c| c.provider_key() == key) {
                        self.library.insert(0, *track);
                    }
                    self.status_message = "Библиотека не сохранилась".to_string();
                }
            }
            Action::SoundCloudChecked(_) => {
                self.onboarding_result = Some(OnboardingResult {
                    soundcloud_enabled: true,
                    yandex_enabled: true,
                    audio_output: None,
                });
            }
            Action::ZapretPlanned(_) | Action::ZapretApplied(_) => {}
            Action::AudioOutputChanged(result) => {
                self.status_message = match result {
                    Ok(name) => format!("Аудиовыход готов: {name}"),
                    Err(error) => format!("Аудиовыход не переключился: {error}"),
                };
            }
            Action::Quit => {}
        }
    }

    pub fn take_onboarding_result(&mut self) -> Option<OnboardingResult> {
        self.onboarding_result.take()
    }

    pub fn queue_snapshot(&self) -> QueueSnapshot {
        QueueSnapshot {
            tracks: self.queue.clone(),
            current_index: self.queue_index,
            shuffle: self.player.shuffle,
            repeat: self.player.repeat,
        }
    }

    pub fn control_play(&mut self, track: TrackRef) {
        if let Some(index) = self.queue.iter().position(|current| current.provider_key() == track.provider_key()) {
            self.queue_index = Some(index);
        } else {
            self.queue.push(track.clone());
            self.queue_index = Some(self.queue.len() - 1);
        }
        self.now_playing = Some(track.clone());
        self.player.position_ms = 0;
        self.player.buffered_ms = 0;
        self.player.duration_ms = track.duration_ms.unwrap_or_default();
        self.player.status = PlaybackStatus::Buffering;
        self.queue_dirty = true;
        self.effects.push(AppEffect::Play(Box::new(track)));
    }

    pub fn control_queue_add(&mut self, track: TrackRef) -> usize {
        self.queue.push(track);
        self.queue_dirty = true;
        self.queue.len()
    }

    pub fn control_queue_clear(&mut self) {
        self.queue.clear();
        self.queue_index = None;
        self.now_playing = None;
        self.player.status = PlaybackStatus::Stopped;
        self.queue_dirty = true;
        self.effects.push(AppEffect::Stop);
    }

    pub fn control_pause(&mut self) -> Result<(), String> {
        if self.now_playing.is_none() {
            return Err("сейчас ничего не играет".to_string());
        }
        self.player.status = PlaybackStatus::Paused;
        self.effects.push(AppEffect::Pause);
        Ok(())
    }

    pub fn control_resume(&mut self) -> Result<(), String> {
        let Some(track) = self.now_playing.clone() else {
            return Err("нечего продолжать".to_string());
        };
        if matches!(
            self.player.status,
            PlaybackStatus::Stopped | PlaybackStatus::Error
        ) {
            // После Stop/Error перезапускаем сессию с нуля (retry для ERROR)
            self.player.position_ms = 0;
            self.player.buffered_ms = 0;
            self.player.status = PlaybackStatus::Buffering;
            self.effects.push(AppEffect::Play(Box::new(track)));
        } else {
            self.player.status = PlaybackStatus::Playing;
            self.effects.push(AppEffect::Resume);
        }
        Ok(())
    }

    pub fn control_toggle(&mut self) -> Result<(), String> {
        if matches!(self.player.status, PlaybackStatus::Playing | PlaybackStatus::Buffering) {
            self.control_pause()
        } else {
            self.control_resume()
        }
    }

    pub fn control_next(&mut self) {
        self.next_track();
    }

    pub fn control_previous(&mut self) {
        self.previous_track();
    }

    pub fn control_stop(&mut self) {
        self.player.status = PlaybackStatus::Stopped;
        self.effects.push(AppEffect::Stop);
    }

    pub fn take_effects(&mut self) -> Vec<AppEffect> {
        std::mem::take(&mut self.effects)
    }

    pub fn set_credentials(&mut self, _credentials: crate::credentials::CredentialState) {
        self.status_message = "Ключи загружены".to_string();
    }

    // ── Управление очередью ────────────────────────────────────────────────

    fn next_track(&mut self) {
        if self.queue.is_empty() {
            return;
        }
        let current = self.queue_index.unwrap_or(0);
        let next = if self.player.repeat == RepeatMode::One {
            current
        } else if current + 1 < self.queue.len() {
            current + 1
        } else if self.player.repeat == RepeatMode::All {
            0
        } else {
            self.player.status = PlaybackStatus::Stopped;
            self.effects.push(AppEffect::Stop);
            return;
        };
        self.set_queue_track(next);
    }

    fn previous_track(&mut self) {
        if self.queue.is_empty() {
            return;
        }
        if self.player.position_ms > 5_000 {
            self.player.position_ms = 0;
            self.effects.push(AppEffect::Seek(0));
            return;
        }
        let current = self.queue_index.unwrap_or(0);
        let previous = if current > 0 {
            current - 1
        } else if self.player.repeat == RepeatMode::All {
            self.queue.len() - 1
        } else {
            0
        };
        self.set_queue_track(previous);
    }

    fn set_queue_track(&mut self, index: usize) {
        self.queue_index = Some(index);
        self.now_playing = self.queue.get(index).cloned();
        self.player.position_ms = 0;
        self.player.buffered_ms = 0;
        self.player.duration_ms = self.now_playing.as_ref().and_then(|t| t.duration_ms).unwrap_or_default();
        self.player.status = PlaybackStatus::Buffering;
        self.queue_dirty = true;
        if let Some(track) = self.now_playing.clone() {
            self.effects.push(AppEffect::Play(Box::new(track)));
        }
    }

    fn handle_audio_event(&mut self, event: crate::audio::AudioEvent) {
        match event {
            crate::audio::AudioEvent::Buffering => self.player.status = PlaybackStatus::Buffering,
            crate::audio::AudioEvent::Playing => self.player.status = PlaybackStatus::Playing,
            crate::audio::AudioEvent::Paused => self.player.status = PlaybackStatus::Paused,
            crate::audio::AudioEvent::Stopped => self.player.status = PlaybackStatus::Stopped,
            crate::audio::AudioEvent::Ended => self.next_track(),
            crate::audio::AudioEvent::Failed(error) | crate::audio::AudioEvent::OutputFailed(error) => {
                self.player.status = PlaybackStatus::Error;
                self.status_message = format!("Аудио сломалось: {error}");
            }
        }
    }
}

// ── GUI-методы ──────────────────────────────────────────────────────────────

impl App {
    pub fn gui_play_tracks(&mut self, tracks: Vec<TrackRef>, start: usize) -> bool {
        if tracks.is_empty() {
            return false;
        }
        let index = start.min(tracks.len() - 1);
        self.queue = tracks;
        self.queue_index = Some(index);
        let track = self.queue[index].clone();
        self.now_playing = Some(track.clone());
        self.player.position_ms = 0;
        self.player.buffered_ms = 0;
        self.player.duration_ms = track.duration_ms.unwrap_or_default();
        self.player.status = PlaybackStatus::Buffering;
        self.queue_dirty = true;
        self.effects.push(AppEffect::Play(Box::new(track)));
        true
    }

    pub fn gui_toggle_like_track(&mut self, track: &TrackRef) -> bool {
        let key = track.provider_key();
        let liked = !self.library.iter().any(|current| current.provider_key() == key);
        if liked {
            self.library.insert(0, track.clone());
        } else {
            self.library.retain(|current| current.provider_key() != key);
        }
        self.effects.push(AppEffect::SetLiked {
            track: Box::new(track.clone()),
            liked,
        });
        liked
    }

    pub fn gui_seek_to(&mut self, position_ms: u64) {
        self.player.position_ms = position_ms.min(self.player.duration_ms);
        self.effects.push(AppEffect::Seek(self.player.position_ms));
    }

    pub fn gui_play_next(&mut self, track: TrackRef) {
        let index = self.queue_index.map(|i| i + 1).unwrap_or(self.queue.len());
        self.queue.insert(index.min(self.queue.len()), track);
        self.queue_dirty = true;
    }

    pub fn gui_add_to_queue(&mut self, track: TrackRef) {
        self.control_queue_add(track);
    }

    pub fn gui_remove_from_queue(&mut self, index: usize) {
        if index < self.queue.len() {
            let _removed = self.queue.remove(index);
            self.queue_index = match self.queue_index {
                Some(current) if current == index => {
                    self.now_playing = None;
                    self.player.status = PlaybackStatus::Stopped;
                    self.effects.push(AppEffect::Stop);
                    None
                }
                Some(current) if current > index => Some(current - 1),
                Some(current) => Some(current.min(self.queue.len().saturating_sub(1))),
                None => None,
            };
            self.queue_dirty = true;
        }
    }

    pub fn gui_clear_history(&mut self) {
        self.home_tracks.clear();
    }

    pub fn gui_move_queue_item(&mut self, from: usize, to: usize) {
        if from >= self.queue.len() || to >= self.queue.len() || from == to {
            return;
        }
        let track = self.queue.remove(from);
        self.queue.insert(to, track);
        if let Some(current) = self.queue_index {
            self.queue_index = Some(match (from, current, to) {
                (_, _, _) if from == current => to,
                (_, _, _) if from < current && to >= current => current - 1,
                (_, _, _) if from > current && to <= current => current + 1,
                _ => current,
            });
        }
        self.queue_dirty = true;
    }

    pub fn gui_set_shuffle(&mut self, on: bool) {
        if self.player.shuffle != on {
            self.player.shuffle = on;
            self.queue_dirty = true;
        }
    }

    pub fn gui_set_repeat(&mut self, mode: RepeatMode) {
        if self.player.repeat != mode {
            self.player.repeat = mode;
            self.queue_dirty = true;
        }
    }

    pub fn gui_play_playlist(&mut self, id: uuid::Uuid) -> bool {
        let Some(playlist) = self.playlists.iter().find(|item| item.id == id) else {
            return false;
        };
        self.gui_play_tracks(playlist.tracks.clone(), 0)
    }

    pub fn gui_create_playlist(&mut self, title: String) -> uuid::Uuid {
        let playlist = Playlist::new(title, now_ms());
        let id = playlist.id;
        self.playlists.insert(0, playlist);
        self.playlists_dirty = true;
        id
    }

    pub fn gui_rename_playlist(&mut self, id: uuid::Uuid, title: String) {
        if let Some(playlist) = self.playlists.iter_mut().find(|item| item.id == id) {
            playlist.title = title;
            playlist.updated_at_ms = now_ms();
            self.playlists_dirty = true;
        }
    }

    pub fn gui_delete_playlist(&mut self, id: uuid::Uuid) {
        self.playlists.retain(|item| item.id != id);
        self.playlists_dirty = true;
    }

    pub fn gui_set_playlist_cover(&mut self, id: uuid::Uuid, cover_url: Option<url::Url>) {
        if let Some(playlist) = self.playlists.iter_mut().find(|item| item.id == id) {
            playlist.cover_url = cover_url;
            playlist.updated_at_ms = now_ms();
            self.playlists_dirty = true;
        }
    }

    pub fn gui_add_to_playlist(&mut self, id: uuid::Uuid, track: TrackRef) -> bool {
        if let Some(playlist) = self.playlists.iter_mut().find(|item| item.id == id) {
            if playlist.push_unique(track) {
                playlist.updated_at_ms = now_ms();
                self.playlists_dirty = true;
                return true;
            }
        }
        false
    }

    pub fn gui_remove_from_playlist(&mut self, id: uuid::Uuid, index: usize) {
        if let Some(playlist) = self.playlists.iter_mut().find(|item| item.id == id)
            && index < playlist.tracks.len()
        {
            playlist.tracks.remove(index);
            playlist.updated_at_ms = now_ms();
            self.playlists_dirty = true;
        }
    }

    pub fn gui_reorder_playlist(&mut self, id: uuid::Uuid, from: usize, to: usize) {
        if let Some(playlist) = self.playlists.iter_mut().find(|item| item.id == id)
            && from < playlist.tracks.len()
            && to < playlist.tracks.len()
            && from != to
        {
            let track = playlist.tracks.remove(from);
            playlist.tracks.insert(to, track);
            playlist.updated_at_ms = now_ms();
            self.playlists_dirty = true;
        }
    }

    pub fn gui_search(&mut self, query: String, provider: SearchProvider, immediate: bool) {
        self.effects.push(AppEffect::Search { query, provider, immediate });
    }

    pub fn gui_dispatch(&mut self, effect: AppEffect) {
        self.effects.push(effect);
    }
}

fn now_ms() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis().min(i64::MAX as u128) as i64)
        .unwrap_or_default()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{config::AppConfig, effect::AppEffect, model::{PlaybackCapability, ProviderKind}};
    use url::Url;

    fn test_track() -> TrackRef {
        TrackRef {
            provider: ProviderKind::SoundCloud,
            id: "test".to_string(),
            title: "Test Track".to_string(),
            artists: vec!["Test Artist".to_string()],
            duration_ms: Some(180_000),
            artwork_url: None,
            web_url: Url::parse("https://soundcloud.com/test/track").unwrap(),
            capability: PlaybackCapability::Full,
            genres: Vec::new(),
            explicit: false,
            drm: false,
            isrc: None,
        }
    }

    fn test_app() -> (tempfile::TempDir, App) {
        let temp = tempfile::tempdir().unwrap();
        let storage = crate::storage::Storage::new(temp.path().join("db.sqlite3"));
        storage.initialize().unwrap();
        let app = App::load(&storage, &AppConfig::default()).unwrap();
        (temp, app)
    }

    #[test]
    fn queue_roundtrip_works() {
        let (_temp, mut app) = test_app();
        let track = test_track();
        app.control_play(track.clone());
        assert_eq!(app.queue, vec![track.clone()]);
        assert_eq!(app.queue_index, Some(0));
        assert_eq!(app.now_playing, Some(track.clone()));
        assert_eq!(app.take_effects(), vec![AppEffect::Play(Box::new(track))]);
    }

    #[test]
    fn toggle_like_adds_and_removes_from_library() {
        let (_temp, mut app) = test_app();
        let track = test_track();
        assert!(app.gui_toggle_like_track(&track));
        assert_eq!(app.library, vec![track.clone()]);
        assert!(!app.gui_toggle_like_track(&track));
        assert!(app.library.is_empty());
    }

    #[test]
    fn play_playlist_sets_queue_and_returns_true() {
        let (_temp, mut app) = test_app();
        let pl = Playlist::new("Test", 1);
        let id = pl.id;
        let track = test_track();
        app.playlists.push(pl);
        app.gui_add_to_playlist(id, track.clone());
        assert!(app.gui_play_playlist(id));
        assert_eq!(app.now_playing, Some(track));
    }

    #[test]
    fn audio_progress_clamps_to_duration() {
        let (_temp, mut app) = test_app();
        app.player.duration_ms = 100_000;
        app.handle(Action::AudioProgress { position_ms: 200_000, buffered_ms: 50_000, duration_ms: 0 });
        assert_eq!(app.player.position_ms, 100_000);
        assert_eq!(app.player.buffered_ms, 50_000);
    }
}