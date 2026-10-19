mod credentials;
mod importer;
mod message;
mod onboarding;
mod playback;
pub mod playback_resolver;
pub mod providers;
mod search;
mod tasks;
mod wave;

pub use search::merge_pages;

use std::{
    sync::Arc,
    time::{Duration, SystemTime},
};

use tokio::{sync::mpsc, task::JoinHandle};

use crate::{
    action::Action,
    audio::{AudioEngine, AudioStatus},
    config::AppConfig,
    effect::AppEffect,
    provider::ProviderRegistry,
    secrets::SecretStore,
    storage::{HistoryEntry, Storage},
};

use message::RuntimeMessage;
use onboarding::{spawn_soundcloud_probe, spawn_zapret_apply, spawn_zapret_plan};
use providers::build_registry;

pub struct Runtime {
    pub(super) providers: Arc<ProviderRegistry>,
    /// Резолвер Spotify → YT/Deezer (выбор источника в настройках).
    pub(super) playback_resolver: Arc<playback_resolver::PlaybackResolver>,
    pub(super) config: AppConfig,
    pub(super) secrets: SecretStore,
    pub(super) audio: Option<AudioEngine>,
    pub(super) sender: mpsc::UnboundedSender<RuntimeMessage>,
    pub(super) receiver: mpsc::UnboundedReceiver<RuntimeMessage>,
    pub(super) search_task: Option<JoinHandle<()>>,
    pub(super) playback_task: Option<JoinHandle<()>>,
    pub(super) wave_task: Option<JoinHandle<()>>,
    pub(super) control_search_task: Option<JoinHandle<()>>,
    pub(super) control_wave_task: Option<JoinHandle<()>>,
    pub(super) import_task: Option<JoinHandle<()>>,
    pub(super) onboarding_task: Option<JoinHandle<()>>,
    pub(super) search_generation: u64,
    pub(super) playback_generation: u64,
    /// Идентификатор активной playback-сессии для логов [Playback][id].
    pub(super) playback_session_id: String,
    /// Счётчик сессий (для генерации коротких id).
    pub(super) playback_session_counter: u64,
    pub(super) wave_generation: u64,
    pub(super) control_search_generation: u64,
    pub(super) control_wave_generation: u64,
    pub(super) import_generation: u64,
    pub(super) onboarding_generation: u64,
    pub(super) search_delay: Duration,
    pub(super) last_audio_status: Option<AudioStatus>,
    pub(super) notices: Vec<String>,
    pub(super) storage: Storage,
    pub(super) current_track: Option<crate::model::TrackRef>,
    pub(super) current_track_started: bool,
}

impl Runtime {
    pub fn new(config: &AppConfig, secrets: &SecretStore, storage: Storage) -> Self {
        let setup = build_registry(config, secrets, true);
        let mut notices = setup.notices;
        let audio = match AudioEngine::new(config.audio_output.as_deref(), config.volume_percent) {
            Ok(audio) => Some(audio),
            Err(error) => {
                notices.push(format!("Аудиовыход недоступен: {error}"));
                None
            }
        };
        let (sender, receiver) = mpsc::unbounded_channel();
        let providers_arc = Arc::new(setup.registry);
        let playback_source = config
            .spotify_playback_source
            .as_deref()
            .and_then(playback_resolver::PlaybackSourceKind::from_str)
            .unwrap_or(playback_resolver::PlaybackSourceKind::Auto);
        let playback_resolver = Arc::new(playback_resolver::PlaybackResolver::new(
            Arc::clone(&providers_arc),
            playback_source,
        ));
        Self {
            providers: providers_arc,
            playback_resolver,
            config: config.clone(),
            secrets: secrets.clone(),
            audio,
            sender,
            receiver,
            search_task: None,
            playback_task: None,
            wave_task: None,
            control_search_task: None,
            control_wave_task: None,
            import_task: None,
            onboarding_task: None,
            search_generation: 0,
            playback_generation: 0,
            playback_session_id: String::new(),
            playback_session_counter: 0,
            wave_generation: 0,
            control_search_generation: 0,
            control_wave_generation: 0,
            import_generation: 0,
            onboarding_generation: 0,
            search_delay: Duration::from_millis(config.search_debounce_ms),
            last_audio_status: None,
            notices,
            storage,
            current_track: None,
            current_track_started: false,
        }
    }

    pub fn take_notices(&mut self) -> Vec<String> {
        std::mem::take(&mut self.notices)
    }

    pub fn playback_generation(&self) -> u64 {
        self.playback_generation
    }


    pub fn dispatch(&mut self, effects: Vec<AppEffect>) -> Vec<Action> {
        let mut actions = Vec::new();
        for effect in effects {
            match effect {
                AppEffect::Search {
                    query,
                    provider,
                    immediate,
                } => self.start_search(query, provider, immediate, &mut actions),
                AppEffect::ControlSearch { query, provider } => {
                    self.start_control_search(query, provider)
                }
                AppEffect::GenerateWave => self.start_wave(&mut actions),
                AppEffect::ControlWave => self.start_control_wave(&mut actions),
                AppEffect::SetLiked { track, liked } => {
                    actions.push(Action::LikeSaved {
                        result: self.set_liked(&track, liked),
                        track,
                        liked,
                    });
                }
                AppEffect::ImportPlaylist(source) => self.start_import(source),
                AppEffect::SaveCredential { kind, value } => {
                    actions.push(Action::CredentialSaved {
                        kind,
                        result: self.save_credential(kind, &value),
                    });
                }
                AppEffect::ProbeSoundCloud => {
                    self.start_onboarding_task(|sender, generation| {
                        spawn_soundcloud_probe(sender, generation)
                    });
                }
                AppEffect::PlanZapret(path) => {
                    self.start_onboarding_task(|sender, generation| {
                        spawn_zapret_plan(sender, generation, path)
                    });
                }
                AppEffect::ApplyZapret(plan) => {
                    self.start_onboarding_task(|sender, generation| {
                        spawn_zapret_apply(sender, generation, *plan)
                    });
                }
                AppEffect::SelectAudioOutput {
                    output,
                    volume_percent,
                } => match AudioEngine::new(output.as_deref(), volume_percent) {
                    Ok(audio) => {
                        let name = audio.status().output_name;
                        self.audio = Some(audio);
                        self.last_audio_status = None;
                        actions.push(Action::AudioOutputChanged(Ok(name)));
                    }
                    Err(error) => {
                        actions.push(Action::AudioOutputChanged(Err(error.to_string())));
                    }
                },
                AppEffect::Play(track) => self.start_playback_with_cache_flag(*track, true, &mut actions),
                AppEffect::PlayWithoutCache(track) => {
                    self.start_playback_with_cache_flag(*track, false, &mut actions)
                }
                AppEffect::Pause => {
                    if let Some(audio) = &self.audio {
                        audio.pause();
                    }
                }
                AppEffect::Resume => {
                    if let Some(audio) = &self.audio {
                        audio.resume();
                    }
                }
                AppEffect::Seek(position_ms) => {
                    if let Some(audio) = &self.audio
                        && let Err(error) = audio.seek_to(position_ms)
                        && !error.to_string().contains("сейчас ничего не воспроизводится")
                    {
                        // «Нечего мотать» ( buffering/резолв нового трека) —
                        // не фейлим воспроизведение, просто игнорируем seek
                        actions.push(Action::PlaybackFailed(error.to_string()));
                    }
                }
                AppEffect::SetVolume(volume) => {
                    if let Some(audio) = &self.audio {
                        audio.set_volume(volume);
                    }
                }
                AppEffect::Stop => {
                    self.record_current(false, true);
                    self.cancel_playback();
                    if let Some(audio) = &self.audio {
                        audio.stop();
                    }
                }
            }
        }
        actions
    }

    pub fn poll_actions(&mut self) -> Vec<Action> {
        let mut actions = Vec::new();
        while let Ok(message) = self.receiver.try_recv() {
            match message {
                RuntimeMessage::SearchFinished {
                    generation,
                    query,
                    tracks,
                    failures,
                } if generation == self.search_generation => {
                    actions.push(Action::SearchFinished {
                        query,
                        tracks,
                        failures,
                    });
                }
                RuntimeMessage::ControlSearchFinished {
                    generation,
                    tracks,
                    failures,
                } if generation == self.control_search_generation => {
                    actions.push(Action::ControlSearchFinished { tracks, failures });
                }
                RuntimeMessage::PlaybackReady {
                    generation,
                    source,
                    video_only_notice,
                } if generation == self.playback_generation =>
                {
                    crate::dlog!(
                        "[Playback][{}] playback started (gen {generation})",
                        self.playback_session_id
                    );
                    self.last_audio_status = None;
                    // Предупреждение «только клип» — до старта, UI покажет
                    // в статусной строке
                    if let Some(notice) = video_only_notice {
                        actions.push(Action::PlaybackNotice(notice));
                    }
                    if let Some(audio) = &self.audio {
                        audio.play(source);
                    } else {
                        actions.push(Action::PlaybackFailed(
                            "в системе не найден аудиовыход".to_string(),
                        ));
                    }
                }
                RuntimeMessage::PlaybackFailed { generation, error }
                    if generation == self.playback_generation =>
                {
                    crate::dlog!(
                        "[Playback][{}] playback failed: {error}",
                        self.playback_session_id
                    );
                    self.current_track = None;
                    self.current_track_started = false;
                    actions.push(Action::PlaybackFailed(error));
                }
                RuntimeMessage::WaveFinished {
                    generation,
                    tracks,
                    failures,
                } if generation == self.wave_generation => {
                    actions.push(Action::WaveFinished { tracks, failures });
                }
                RuntimeMessage::ControlWaveFinished {
                    generation,
                    tracks,
                    failures,
                } if generation == self.control_wave_generation => {
                    actions.push(Action::ControlWaveFinished { tracks, failures });
                }
                RuntimeMessage::PlaylistImported { generation, result }
                    if generation == self.import_generation =>
                {
                    actions.push(Action::PlaylistImported(result));
                }
                RuntimeMessage::SoundCloudChecked { generation, access }
                    if generation == self.onboarding_generation =>
                {
                    actions.push(Action::SoundCloudChecked(access));
                }
                RuntimeMessage::ZapretPlanned { generation, result }
                    if generation == self.onboarding_generation =>
                {
                    actions.push(Action::ZapretPlanned(result));
                }
                RuntimeMessage::ZapretApplied { generation, result }
                    if generation == self.onboarding_generation =>
                {
                    actions.push(Action::ZapretApplied(result));
                }
                // Устаревшие playback-результаты не имеют права менять
                // состояние нового воспроизведения — только лог
                RuntimeMessage::PlaybackReady { generation, .. }
                | RuntimeMessage::PlaybackFailed { generation, .. } => {
                    crate::dlog!(
                        "[Playback][{}] stale session result ignored (gen {generation})",
                        self.playback_session_id
                    );
                }
                _ => {}
            }
        }
        let mut audio_events = Vec::new();
        if let Some(audio) = &self.audio {
            while let Some(event) = audio.try_event() {
                audio_events.push(event);
            }
            let status = audio.status();
            if self.last_audio_status.as_ref() != Some(&status) {
                actions.push(Action::AudioProgress {
                    generation: self.playback_generation,
                    position_ms: status.position_ms,
                    buffered_ms: status.buffered_ms,
                    duration_ms: status.duration_ms,
                });
                self.last_audio_status = Some(status);
            }
        }
        for event in audio_events {
            match &event {
                crate::audio::AudioEvent::Playing => {
                    if !self.current_track_started && self.current_track.is_some() {
                        let played_at = SystemTime::now()
                            .duration_since(SystemTime::UNIX_EPOCH)
                            .map(|d| d.as_millis() as i64)
                            .unwrap_or_default();
                        let storage = self.storage.clone();
                        let track = self.current_track.clone().unwrap();
                        std::thread::spawn(move || {
                            if let Err(error) = storage.record_history(&HistoryEntry {
                                track,
                                played_at_ms: played_at,
                                completed: false,
                                skipped: false,
                            }) {
                                crate::dlog!("[vessel] record_history error: {error}");
                            }
                        });
                    }
                    self.current_track_started = true;
                }
                crate::audio::AudioEvent::Ended => self.record_current(true, false),
                crate::audio::AudioEvent::Failed(_) | crate::audio::AudioEvent::OutputFailed(_) => {
                    self.record_current(false, true)
                }
                _ => {}
            }
            actions.push(Action::Audio(event));
        }
        actions
    }

    pub fn local_provider_registry(&self) -> ProviderRegistry {
        providers::build_registry(&self.config, &self.secrets, false).registry
    }

    pub fn provider_registry(&self) -> Arc<ProviderRegistry> {
        Arc::clone(&self.providers)
    }

    /// Синхронизирует конфиг приложения (маршрутизацию провайдеров, список серверов и настройки)
    /// и пересобирает реестр провайдеров на лету.
    pub fn sync_config(&mut self, config: &AppConfig) {
        self.config = config.clone();
        self.search_delay = Duration::from_millis(config.search_debounce_ms);
        self.reload_providers();
    }

    pub fn set_auto_cache(&mut self, enabled: bool) {
        self.config.auto_cache = enabled;
    }

    pub fn reload_providers(&mut self) {
        let setup = build_registry(&self.config, &self.secrets, true);
        self.providers = Arc::new(setup.registry);
        let playback_source = self.playback_resolver.source();
        self.playback_resolver = Arc::new(playback_resolver::PlaybackResolver::new(
            Arc::clone(&self.providers),
            playback_source,
        ));
        self.notices.extend(setup.notices);
    }

    fn set_liked(&self, track: &crate::model::TrackRef, liked: bool) -> Result<(), String> {
        if liked {
            let liked_at_ms = SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .map(|duration| duration.as_millis().min(i64::MAX as u128) as i64)
                .unwrap_or_default();
            self.storage
                .like_track(track, liked_at_ms)
                .map_err(|error| error.to_string())
        } else {
            self.storage
                .unlike_track(track)
                .map(|_| ())
                .map_err(|error| error.to_string())
        }
    }
}

impl Drop for Runtime {
    fn drop(&mut self) {
        if let Some(task) = self.search_task.take() {
            task.abort();
        }
        if let Some(task) = self.control_search_task.take() {
            task.abort();
        }
        if let Some(task) = self.playback_task.take() {
            task.abort();
        }
        if let Some(task) = self.wave_task.take() {
            task.abort();
        }
        if let Some(task) = self.control_wave_task.take() {
            task.abort();
        }
        if let Some(task) = self.onboarding_task.take() {
            task.abort();
        }
        if let Some(task) = self.import_task.take() {
            task.abort();
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::credentials::CredentialKind;

    #[test]
    fn stale_runtime_message_never_reaches_app() {
        let (sender, receiver) = mpsc::unbounded_channel();
        let mut runtime = Runtime {
            providers: Arc::new(ProviderRegistry::default()),
            playback_resolver: Arc::new(playback_resolver::PlaybackResolver::new(
                Arc::new(ProviderRegistry::default()),
                playback_resolver::PlaybackSourceKind::YouTubeMusic,
            )),
            config: AppConfig::default(),
            secrets: SecretStore::new(std::path::PathBuf::from("unused-secrets.json")),
            audio: None,
            sender: sender.clone(),
            receiver,
            search_task: None,
            playback_task: None,
            wave_task: None,
            control_search_task: None,
            control_wave_task: None,
            import_task: None,
            onboarding_task: None,
            search_generation: 7,
            playback_generation: 3,
            playback_session_id: String::new(),
            playback_session_counter: 0,
            wave_generation: 0,
            control_search_generation: 0,
            control_wave_generation: 0,
            import_generation: 0,
            onboarding_generation: 0,
            search_delay: Duration::ZERO,
            last_audio_status: None,
            notices: Vec::new(),
            storage: Storage::new(std::path::PathBuf::from("unused.sqlite3")),
            current_track: None,
            current_track_started: false,
        };
        sender
            .send(RuntimeMessage::SearchFinished {
                generation: 6,
                query: "старьё".to_string(),
                tracks: Vec::new(),
                failures: Vec::new(),
            })
            .unwrap();
        sender
            .send(RuntimeMessage::PlaybackFailed {
                generation: 2,
                error: "старьё".to_string(),
            })
            .unwrap();
        sender
            .send(RuntimeMessage::WaveFinished {
                generation: 1,
                tracks: Vec::new(),
                failures: vec!["старьё".to_string()],
            })
            .unwrap();
        sender
            .send(RuntimeMessage::SoundCloudChecked {
                generation: 1,
                access: crate::onboarding::SoundCloudAccess::Reachable { status: 200 },
            })
            .unwrap();
        assert!(runtime.poll_actions().is_empty());
    }

    #[test]
    fn empty_search_cancels_task_and_clears_results_immediately() {
        let (sender, receiver) = mpsc::unbounded_channel();
        let mut runtime = Runtime {
            providers: Arc::new(ProviderRegistry::default()),
            playback_resolver: Arc::new(playback_resolver::PlaybackResolver::new(
                Arc::new(ProviderRegistry::default()),
                playback_resolver::PlaybackSourceKind::YouTubeMusic,
            )),
            config: AppConfig::default(),
            secrets: SecretStore::new(std::path::PathBuf::from("unused-secrets.json")),
            audio: None,
            sender,
            receiver,
            search_task: None,
            playback_task: None,
            wave_task: None,
            control_search_task: None,
            control_wave_task: None,
            import_task: None,
            onboarding_task: None,
            search_generation: 0,
            playback_generation: 0,
            playback_session_id: String::new(),
            playback_session_counter: 0,
            wave_generation: 0,
            control_search_generation: 0,
            control_wave_generation: 0,
            import_generation: 0,
            onboarding_generation: 0,
            search_delay: Duration::from_secs(1),
            last_audio_status: None,
            notices: Vec::new(),
            storage: Storage::new(std::path::PathBuf::from("unused.sqlite3")),
            current_track: None,
            current_track_started: false,
        };
        let actions = runtime.dispatch(vec![AppEffect::Search {
            query: String::new(),
            provider: crate::model::SearchProvider::All,
            immediate: false,
        }]);
        assert!(matches!(
            actions.as_slice(),
            [Action::SearchFinished { query, tracks, failures }]
                if query.is_empty() && tracks.is_empty() && failures.is_empty()
        ));
    }

    #[test]
    fn saved_credential_rebuilds_provider_without_restart() {
        let temp = tempfile::tempdir().unwrap();
        let (sender, receiver) = mpsc::unbounded_channel();
        let mut runtime = Runtime {
            providers: Arc::new(ProviderRegistry::default()),
            playback_resolver: Arc::new(playback_resolver::PlaybackResolver::new(
                Arc::new(ProviderRegistry::default()),
                playback_resolver::PlaybackSourceKind::YouTubeMusic,
            )),
            config: AppConfig::default(),
            secrets: SecretStore::file_only(temp.path().join("secrets.json")),
            audio: None,
            sender,
            receiver,
            search_task: None,
            playback_task: None,
            wave_task: None,
            control_search_task: None,
            control_wave_task: None,
            import_task: None,
            onboarding_task: None,
            search_generation: 0,
            playback_generation: 0,
            playback_session_id: String::new(),
            playback_session_counter: 0,
            wave_generation: 0,
            control_search_generation: 0,
            control_wave_generation: 0,
            import_generation: 0,
            onboarding_generation: 0,
            search_delay: Duration::ZERO,
            last_audio_status: None,
            notices: Vec::new(),
            storage: Storage::new(std::path::PathBuf::from("unused.sqlite3")),
            current_track: None,
            current_track_started: false,
        };

        let actions = runtime.dispatch(vec![AppEffect::SaveCredential {
            kind: CredentialKind::SoundCloudClientId,
            value: "client-id".to_string(),
        }]);

        assert!(matches!(
            actions.as_slice(),
            [Action::CredentialSaved {
                kind: CredentialKind::SoundCloudClientId,
                result: Ok(())
            }]
        ));
        assert!(
            runtime
                .providers
                .get(crate::model::ProviderKind::SoundCloud)
                .is_some()
        );
    }

    #[test]
    fn wave_without_configured_provider_finishes_instead_of_hanging() {
        let (sender, receiver) = mpsc::unbounded_channel();
        let mut runtime = Runtime {
            providers: Arc::new(ProviderRegistry::default()),
            playback_resolver: Arc::new(playback_resolver::PlaybackResolver::new(
                Arc::new(ProviderRegistry::default()),
                playback_resolver::PlaybackSourceKind::YouTubeMusic,
            )),
            config: AppConfig::default(),
            secrets: SecretStore::new(std::path::PathBuf::from("unused-secrets.json")),
            audio: None,
            sender,
            receiver,
            search_task: None,
            playback_task: None,
            wave_task: None,
            control_search_task: None,
            control_wave_task: None,
            import_task: None,
            onboarding_task: None,
            search_generation: 0,
            playback_generation: 0,
            playback_session_id: String::new(),
            playback_session_counter: 0,
            wave_generation: 0,
            control_search_generation: 0,
            control_wave_generation: 0,
            import_generation: 0,
            onboarding_generation: 0,
            search_delay: Duration::ZERO,
            last_audio_status: None,
            notices: Vec::new(),
            storage: Storage::new(std::path::PathBuf::from("unused.sqlite3")),
            current_track: None,
            current_track_started: false,
        };
        let actions = runtime.dispatch(vec![AppEffect::GenerateWave]);
        assert!(matches!(
            actions.as_slice(),
            [Action::WaveFinished { tracks, failures }]
                if tracks.is_empty() && failures.len() == 1
        ));
    }

    #[test]
    fn finished_track_reaches_wave_history_once() {
        let temp = tempfile::tempdir().unwrap();
        let storage = Storage::new(temp.path().join("history.sqlite3"));
        storage.initialize().unwrap();
        let (sender, receiver) = mpsc::unbounded_channel();
        let mut runtime = Runtime {
            providers: Arc::new(ProviderRegistry::default()),
            playback_resolver: Arc::new(playback_resolver::PlaybackResolver::new(
                Arc::new(ProviderRegistry::default()),
                playback_resolver::PlaybackSourceKind::YouTubeMusic,
            )),
            config: AppConfig::default(),
            secrets: SecretStore::new(std::path::PathBuf::from("unused-secrets.json")),
            audio: None,
            sender,
            receiver,
            search_task: None,
            playback_task: None,
            wave_task: None,
            control_search_task: None,
            control_wave_task: None,
            import_task: None,
            onboarding_task: None,
            search_generation: 0,
            playback_generation: 0,
            playback_session_id: String::new(),
            playback_session_counter: 0,
            wave_generation: 0,
            control_search_generation: 0,
            control_wave_generation: 0,
            import_generation: 0,
            onboarding_generation: 0,
            search_delay: Duration::ZERO,
            last_audio_status: None,
            notices: Vec::new(),
            storage: storage.clone(),
            current_track: Some(history_track()),
            current_track_started: true,
        };
        runtime.record_current(true, false);
        runtime.record_current(true, false);
        let mut history = Vec::new();
        for _ in 0..50 {
            history = storage.recent_history(10).unwrap();
            if !history.is_empty() {
                break;
            }
            std::thread::sleep(std::time::Duration::from_millis(5));
        }
        assert_eq!(history.len(), 1);
        assert!(history[0].completed);
        assert!(!history[0].skipped);
    }

    fn history_track() -> crate::model::TrackRef {
        crate::model::TrackRef {
            provider: crate::model::ProviderKind::SoundCloud,
            id: "history".to_string(),
            title: "History".to_string(),
            artists: vec!["Artist".to_string()],
            duration_ms: Some(180_000),
            artwork_url: None,
            web_url: url::Url::parse("https://soundcloud.com/test/history").unwrap(),
            capability: crate::model::PlaybackCapability::Full,
            genres: Vec::new(),
            explicit: false,
            drm: false,
            isrc: None,
            origin: crate::model::TrackOrigin::Original,
            album_url: None,
            album_title: None,
        }
    }

    #[tokio::test]
    async fn drop_aborts_all_runtime_tasks() {
        let (sender, receiver) = mpsc::unbounded_channel();
        let t1 = tokio::spawn(async { tokio::time::sleep(Duration::from_secs(60)).await; });
        let t2 = tokio::spawn(async { tokio::time::sleep(Duration::from_secs(60)).await; });
        let t3 = tokio::spawn(async { tokio::time::sleep(Duration::from_secs(60)).await; });
        let t4 = tokio::spawn(async { tokio::time::sleep(Duration::from_secs(60)).await; });
        let t5 = tokio::spawn(async { tokio::time::sleep(Duration::from_secs(60)).await; });
        let t6 = tokio::spawn(async { tokio::time::sleep(Duration::from_secs(60)).await; });
        let t7 = tokio::spawn(async { tokio::time::sleep(Duration::from_secs(60)).await; });

        let runtime = Runtime {
            providers: Arc::new(ProviderRegistry::default()),
            playback_resolver: Arc::new(playback_resolver::PlaybackResolver::new(
                Arc::new(ProviderRegistry::default()),
                playback_resolver::PlaybackSourceKind::YouTubeMusic,
            )),
            config: AppConfig::default(),
            secrets: SecretStore::new(std::path::PathBuf::from("unused-secrets.json")),
            audio: None,
            sender,
            receiver,
            search_task: Some(t1),
            control_search_task: Some(t2),
            playback_task: Some(t3),
            wave_task: Some(t4),
            control_wave_task: Some(t5),
            onboarding_task: Some(t6),
            import_task: Some(t7),
            search_generation: 0,
            playback_generation: 0,
            playback_session_id: String::new(),
            playback_session_counter: 0,
            wave_generation: 0,
            control_search_generation: 0,
            control_wave_generation: 0,
            import_generation: 0,
            onboarding_generation: 0,
            search_delay: Duration::ZERO,
            last_audio_status: None,
            notices: Vec::new(),
            storage: Storage::new(std::path::PathBuf::from("unused.sqlite3")),
            current_track: None,
            current_track_started: false,
        };

        drop(runtime);
    }

    #[test]
    fn set_liked_saves_and_unlikes_track() {
        let temp = tempfile::tempdir().unwrap();
        let storage = Storage::new(temp.path().join("likes.sqlite3"));
        storage.initialize().unwrap();
        let (sender, receiver) = mpsc::unbounded_channel();
        let runtime = Runtime {
            providers: Arc::new(ProviderRegistry::default()),
            playback_resolver: Arc::new(playback_resolver::PlaybackResolver::new(
                Arc::new(ProviderRegistry::default()),
                playback_resolver::PlaybackSourceKind::YouTubeMusic,
            )),
            config: AppConfig::default(),
            secrets: SecretStore::new(std::path::PathBuf::from("unused-secrets.json")),
            audio: None,
            sender,
            receiver,
            search_task: None,
            control_search_task: None,
            playback_task: None,
            wave_task: None,
            control_wave_task: None,
            onboarding_task: None,
            import_task: None,
            search_generation: 0,
            playback_generation: 0,
            playback_session_id: String::new(),
            playback_session_counter: 0,
            wave_generation: 0,
            control_search_generation: 0,
            control_wave_generation: 0,
            import_generation: 0,
            onboarding_generation: 0,
            search_delay: Duration::ZERO,
            last_audio_status: None,
            notices: Vec::new(),
            storage: storage.clone(),
            current_track: None,
            current_track_started: false,
        };

        let t = history_track();
        assert!(runtime.set_liked(&t, true).is_ok());
        assert_eq!(storage.liked_tracks_with_time().unwrap().len(), 1);

        assert!(runtime.set_liked(&t, false).is_ok());
        assert_eq!(storage.liked_tracks_with_time().unwrap().len(), 0);
    }
}
