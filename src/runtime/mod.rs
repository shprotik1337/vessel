mod account;
mod importer;
mod message;
mod onboarding;
mod playback;
pub mod playback_resolver;
pub mod providers;
mod search;
mod wave;

pub use search::merge_pages;

use std::{
    sync::Arc,
    time::{Duration, SystemTime},
};

use tokio::{sync::mpsc, task::JoinHandle};

use crate::{
    account::{client::AccountClient, error::AccountApiError},
    action::Action,
    audio::{AudioEngine, AudioStatus},
    config::AppConfig,
    credentials::{CredentialKind, CredentialState},
    effect::AppEffect,
    provider::ProviderRegistry,
    secrets::SecretStore,
    storage::{HistoryEntry, Storage},
};

use account::{
    AuthenticationRequest, spawn_authentication, spawn_bootstrap, spawn_captcha, spawn_logout,
    spawn_restore,
};
use importer::spawn_import;
use message::RuntimeMessage;
use onboarding::{spawn_soundcloud_probe, spawn_zapret_apply, spawn_zapret_plan};
use playback::spawn_playback;
use providers::build_registry;
use search::spawn_search;
use wave::spawn_wave;

pub struct Runtime {
    providers: Arc<ProviderRegistry>,
    /// Резолвер Spotify → YT/Deezer (выбор источника в настройках).
    playback_resolver: Arc<playback_resolver::PlaybackResolver>,
    account_client: Option<Arc<AccountClient>>,
    config: AppConfig,
    secrets: SecretStore,
    audio: Option<AudioEngine>,
    sender: mpsc::UnboundedSender<RuntimeMessage>,
    receiver: mpsc::UnboundedReceiver<RuntimeMessage>,
    search_task: Option<JoinHandle<()>>,
    playback_task: Option<JoinHandle<()>>,
    wave_task: Option<JoinHandle<()>>,
    control_search_task: Option<JoinHandle<()>>,
    control_wave_task: Option<JoinHandle<()>>,
    import_task: Option<JoinHandle<()>>,
    account_task: Option<JoinHandle<()>>,
    onboarding_task: Option<JoinHandle<()>>,
    search_generation: u64,
    playback_generation: u64,
    /// Идентификатор активной playback-сессии для логов [Playback][id].
    playback_session_id: String,
    /// Счётчик сессий (для генерации коротких id).
    playback_session_counter: u64,
    wave_generation: u64,
    control_search_generation: u64,
    control_wave_generation: u64,
    import_generation: u64,
    account_generation: u64,
    onboarding_generation: u64,
    search_delay: Duration,
    last_audio_status: Option<AudioStatus>,
    notices: Vec<String>,
    storage: Storage,
    current_track: Option<crate::model::TrackRef>,
    current_track_started: bool,
}

impl Runtime {
    pub fn new(config: &AppConfig, secrets: &SecretStore, storage: Storage) -> Self {
        let setup = build_registry(config, secrets, true);
        let mut notices = setup.notices;
        let account_client = match AccountClient::new(&config.server_url, secrets) {
            Ok(client) => Some(Arc::new(client)),
            Err(error) => {
                notices.push(format!("Аккаунт недоступен: {error}"));
                None
            }
        };
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
            account_client,
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
            account_task: None,
            onboarding_task: None,
            search_generation: 0,
            playback_generation: 0,
            playback_session_id: String::new(),
            playback_session_counter: 0,
            wave_generation: 0,
            control_search_generation: 0,
            control_wave_generation: 0,
            import_generation: 0,
            account_generation: 0,
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
                AppEffect::LoadAccountCaptcha(action) => {
                    self.start_account_captcha(action, &mut actions)
                }
                AppEffect::AuthenticateAccount {
                    action,
                    username,
                    password,
                    captcha_id,
                    solution,
                } => self.start_authentication(
                    AuthenticationRequest {
                        action,
                        username,
                        password,
                        captcha_id,
                        solution,
                    },
                    &mut actions,
                ),
                AppEffect::RestoreAccount => self.start_restore(&mut actions),
                AppEffect::RefreshBootstrap => self.start_bootstrap(&mut actions),
                AppEffect::LogoutAccount => self.start_logout(&mut actions),
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
                AppEffect::Play(track) => self.start_playback(*track, &mut actions),
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
                RuntimeMessage::AccountCaptcha {
                    generation,
                    action,
                    result,
                } if generation == self.account_generation => {
                    actions.push(Action::AccountCaptchaLoaded { action, result });
                }
                RuntimeMessage::AccountAuthenticated { generation, result }
                    if generation == self.account_generation =>
                {
                    actions.push(Action::AccountAuthenticated(result));
                }
                RuntimeMessage::AccountRestored { generation, result }
                    if generation == self.account_generation =>
                {
                    actions.push(Action::AccountRestored(result));
                }
                RuntimeMessage::BootstrapFinished { generation, result }
                    if generation == self.account_generation =>
                {
                    if result.is_ok() {
                        self.reload_providers();
                    }
                    actions.push(Action::BootstrapFinished(result));
                }
                RuntimeMessage::AccountLoggedOut { generation, result }
                    if generation == self.account_generation =>
                {
                    self.reload_providers();
                    let soundcloud_configured = self
                        .credential_state()
                        .map(|state| state.soundcloud)
                        .unwrap_or(false);
                    actions.push(Action::AccountLoggedOut {
                        result,
                        soundcloud_configured,
                    });
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
                        if let Err(error) = self.storage.record_history(&HistoryEntry {
                            track: self.current_track.clone().unwrap(),
                            played_at_ms: played_at,
                            completed: false,
                            skipped: false,
                        }) {
                            self.notices.push(format!("Не удалось сохранить историю: {error}"));
                        }
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

    pub fn credential_state(&self) -> anyhow::Result<CredentialState> {
        CredentialState::load(&self.secrets)
    }

    pub fn provider_registry(&self) -> Arc<ProviderRegistry> {
        Arc::clone(&self.providers)
    }

    /// Текущий источник аудио для Spotify-треков.
    pub fn spotify_playback_source(&self) -> playback_resolver::PlaybackSourceKind {
        self.playback_resolver.source()
    }

    /// Сменить источник аудио для Spotify-треков (сразу, без перезапуска).
    pub fn set_spotify_playback_source(
        &mut self,
        source: playback_resolver::PlaybackSourceKind,
    ) {
        self.playback_resolver.set_source(source);
        self.config.spotify_playback_source = Some(source.as_str().to_string());
    }

    pub fn remove_credential(&mut self, key: crate::secrets::SecretKey) -> anyhow::Result<()> {
        self.secrets.remove(key)?;
        match key {
            crate::secrets::SecretKey::SoundCloudClientIdOverride => {
                self.config.soundcloud_enabled = false;
            }
            crate::secrets::SecretKey::YandexToken => self.config.yandex_enabled = false,
            crate::secrets::SecretKey::DeezerArl => self.config.deezer_enabled = false,
            crate::secrets::SecretKey::SpotifySpDc => self.config.spotify_enabled = false,
            crate::secrets::SecretKey::YouTubeCookie
            | crate::secrets::SecretKey::YouTubeOAuthRefresh => {}
            _ => {}
        }
        self.reload_providers();
        Ok(())
    }

    pub fn save_credential(&mut self, kind: CredentialKind, value: &str) -> Result<(), String> {
        let value = value.trim();
        if value.is_empty() {
            return Err("ключ пустой".to_string());
        }
        self.secrets
            .set(kind.secret_key(), value)
            .map_err(|error| error.to_string())?;
        match kind {
            CredentialKind::SoundCloudClientId => {
                self.config.soundcloud_enabled = true;
                self.config.soundcloud_client_id_override = None;
            }
            CredentialKind::YandexToken => self.config.yandex_enabled = true,
            CredentialKind::DeezerArl => self.config.deezer_enabled = true,
            CredentialKind::SpotifySpDc => self.config.spotify_enabled = true,
            CredentialKind::SpotifyOAuthRefreshToken => {
                self.config.spotify_enabled = true;
            }
            CredentialKind::YouTubeCookie | CredentialKind::YouTubeOAuthRefresh => {
                self.config.youtube_music_enabled = true;
            }
        }
        let setup = build_registry(&self.config, &self.secrets, true);
        self.providers = Arc::new(setup.registry);
        self.notices.extend(setup.notices);
        Ok(())
    }

    /// Включает/выключает провайдера по флагу конфига и сразу пересобирает реестр,
    /// чтобы переключение в Настройках действовало без перезапуска приложения.
    pub fn set_provider_enabled(&mut self, kind: crate::model::ProviderKind, enabled: bool) {
        match kind {
            crate::model::ProviderKind::SoundCloud => self.config.soundcloud_enabled = enabled,
            crate::model::ProviderKind::YandexMusic => self.config.yandex_enabled = enabled,
            crate::model::ProviderKind::Deezer => self.config.deezer_enabled = enabled,
            crate::model::ProviderKind::Spotify => self.config.spotify_enabled = enabled,
            crate::model::ProviderKind::YouTubeMusic => self.config.youtube_music_enabled = enabled,
        }
        self.reload_providers();
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

    fn start_search(
        &mut self,
        query: String,
        provider: crate::model::SearchProvider,
        immediate: bool,
        actions: &mut Vec<Action>,
    ) {
        if let Some(task) = self.search_task.take() {
            task.abort();
        }
        self.search_generation = self.search_generation.wrapping_add(1);
        if query.is_empty() {
            actions.push(Action::SearchFinished {
                query,
                tracks: Vec::new(),
                failures: Vec::new(),
            });
            return;
        }
        if self.providers.is_empty() {
            actions.push(Action::SearchFinished {
                query,
                tracks: Vec::new(),
                failures: vec![
                    "Сначала добавь SoundCloud client_id или Yandex OAuth в Настройках".to_string(),
                ],
            });
            return;
        }
        let delay = if immediate {
            Duration::ZERO
        } else {
            self.search_delay
        };
        self.search_task = Some(spawn_search(
            Arc::clone(&self.providers),
            self.sender.clone(),
            self.search_generation,
            query,
            provider,
            delay,
        ));
    }

    fn start_control_search(&mut self, query: String, provider: crate::model::SearchProvider) {
        if let Some(task) = self.control_search_task.take() {
            task.abort();
        }
        self.control_search_generation = self.control_search_generation.wrapping_add(1);
        let providers = Arc::clone(&self.providers);
        let sender = self.sender.clone();
        let generation = self.control_search_generation;
        self.control_search_task = Some(tokio::spawn(async move {
            let pages = providers.search(&query, provider).await;
            let (tracks, failures) = search::merge_pages(pages);
            let _ = sender.send(RuntimeMessage::ControlSearchFinished {
                generation,
                tracks,
                failures,
            });
        }));
    }

    fn start_playback(&mut self, track: crate::model::TrackRef, actions: &mut Vec<Action>) {
        self.record_current(false, true);
        self.cancel_playback();

        // Session id для корреляции логов всего playback-пайплайна
        self.playback_session_id = format!("p{:04x}", self.playback_session_counter);
        self.playback_session_counter = self.playback_session_counter.wrapping_add(1);
        let session = self.playback_session_id.clone();
        crate::dlog!(
            "[Playback][{session}] requested {} track «{}» ({}), source={}",
            track.provider.label(),
            track.title,
            track.id,
            self.playback_resolver.source().as_str()
        );

        // Выбор источника аудио: Spotify-треки играют через цепочку каталогов.
        // Ручной режим — один источник; «Автоматически» —
        // Deezer → YouTube Music → YouTube (каждый следующий только если
        // предыдущий не смог).
        if track.provider == crate::model::ProviderKind::Spotify {
            let requested_source = self.playback_resolver.source();
            let chain: Vec<_> = requested_source
                .chain()
                .into_iter()
                .filter(|source| self.playback_resolver.source_available(*source))
                .collect();
            if chain.is_empty() {
                // Ни один источник не настроен — пробуем родной Spotify
                // (premium-путь), если и он не настроен — ошибка
                match self.providers.get(track.provider) {
                    Some(provider) => {
                        self.start_native_playback(provider, track, actions);
                    }
                    None => {
                        actions.push(Action::PlaybackFailed(format!(
                            "источник {} не подключён — добавь его в Настройках",
                            requested_source.label()
                        )));
                    }
                }
                return;
            }

            // Резолвим матч в фоне, аудио пойдёт из чужого каталога.
            // playback_generation уже поднят cancel_playback() выше —
            // дублировать нельзя: poll_actions отбросит PlaybackReady
            // как устаревшее, и трек повиснет в бесконечной загрузке.
            let resolver = Arc::clone(&self.playback_resolver);
            let providers = Arc::clone(&self.providers);
            let sender = self.sender.clone();
            let generation = self.playback_generation;
            if let Some(audio) = &self.audio {
                audio.reset();
            }
            self.current_track = Some(track.clone());
            self.current_track_started = false;
            // Пока резолвим матч и качаем трек — статус Buffering,
            // чтобы UI не давал мотать старый источник
            actions.push(Action::Audio(crate::audio::AudioEvent::Buffering));
            self.playback_task = Some(tokio::spawn(async move {
                let mut failures: Vec<String> = Vec::new();
                // Кандидаты пришли из общего поиска (клип-версия) — нужна
                // пометка для предупреждения в UI
                let mut candidates_from_general = false;

                for source in chain {
                    crate::dlog!("[Playback][{session}] trying provider={}", source.label());

                    // Этап 1: матчинг в этом каталоге
                    let candidates = match resolver.resolve_candidates_in(source, &track).await {
                        Ok((Some(candidates), stage)) => {
                            crate::dlog!(
                                "[Playback][{session}] {} {} candidates={}",
                                stage.describe(),
                                source.as_str(),
                                candidates.len()
                            );
                            candidates_from_general = false;
                            candidates
                        }
                        Ok((None, stage)) => {
                            crate::dlog!(
                                "[Playback][{session}] {} в {}",
                                stage.describe(),
                                source.label()
                            );
                            failures.push(format!(
                                "{}: матча нет ({})",
                                source.label(),
                                stage.describe()
                            ));
                            // Последний шанс в Auto: честный поиск не нашёл,
                            // но в YTM остался официальный клип — общий поиск
                            if requested_source
                                == playback_resolver::PlaybackSourceKind::Auto
                                && source
                                    == playback_resolver::PlaybackSourceKind::YouTubeMusic
                            {
                                match resolver.resolve_candidates_general(&track).await {
                                    Ok((Some(video_candidates), stage)) => {
                                        crate::dlog!(
                                            "[Playback][{session}] {} {} candidates={}",
                                            stage.describe(),
                                            source.as_str(),
                                            video_candidates.len()
                                        );
                                        candidates_from_general = true;
                                        video_candidates
                                    }
                                    Ok((None, stage)) => {
                                        crate::dlog!(
                                            "[Playback][{session}] {} в общем поиске {}",
                                            stage.describe(),
                                            source.label()
                                        );
                                        failures.push(format!(
                                            "YouTube Music (клипы): {}",
                                            stage.describe()
                                        ));
                                        continue;
                                    }
                                    Err(error) => {
                                        crate::dlog!(
                                            "[Playback][{session}] general search failed: {error:#}"
                                        );
                                        failures.push(format!(
                                            "YouTube Music (клипы): {error:#}"
                                        ));
                                        continue;
                                    }
                                }
                            } else {
                                continue;
                            }
                        }
                        Err(error) => {
                            crate::dlog!(
                                "[Playback][{session}] {} resolve failed: {error:#}",
                                source.label()
                            );
                            failures.push(format!("{}: {error:#}", source.label()));
                            continue;
                        }
                    };

                    // Этап 2: перебираем кандидатов, пока какой-нибудь
                    // не отдаст проигрываемый поток
                    let Some(foreign) = providers.get(source.provider_kind()) else {
                        continue;
                    };
                    // Предупреждение «играем клип-версию, а не полный трек» —
                    // только для матчей из общего поиска YTM
                    let video_only_notice = if candidates_from_general {
                        Some(format!(
                            "Играю клип-версию «{}» с YouTube Music — полная версия недоступна в каталогах",
                            track.title
                        ))
                    } else {
                        None
                    };
                    for (index, foreign_track) in candidates.iter().enumerate() {
                        crate::dlog!(
                            "[Playback][{session}] source resolution candidate {} {} «{}»",
                            index + 1,
                            source.as_str(),
                            foreign_track.title
                        );
                        match foreign.playback_source(foreign_track).await {
                            Ok(source_stream) => {
                                // Играем через чужого провайдера, но
                                // UI-трек остаётся Spotify (лайки/история)
                                crate::dlog!(
                                    "[Playback][{session}] selected provider={} ({} канд.)",
                                    source.label(),
                                    candidates.len()
                                );
                                let _ = sender.send(RuntimeMessage::PlaybackReady {
                                    generation,
                                    source: source_stream,
                                    video_only_notice: video_only_notice.clone(),
                                });
                                return;
                            }
                            Err(error) => {
                                crate::dlog!(
                                    "[Playback][{session}] {} candidate {} not playable: {error:#}",
                                    source.as_str(),
                                    index + 1
                                );
                            }
                        }
                    }

                    // Ни один кандидат каталога не проигрался — выкидываем
                    // матч из кэша и идём к следующему источнику цепочки
                    resolver.drop_cache(&track, source);
                    crate::dlog!("[Playback][{session}] {} failed", source.label());
                    failures.push(format!(
                        "{}: не проигрался ({} канд.)",
                        source.label(),
                        candidates.len()
                    ));
                }

                let _ = sender.send(RuntimeMessage::PlaybackFailed {
                    generation,
                    error: failures.join("; "),
                });
            }));
            return;
        }

        // Не-Spotify трек: играем через его родного провайдера
        match self.providers.get(track.provider) {
            Some(provider) => {
                self.start_native_playback(provider, track, actions);
            }
            None => {
                actions.push(Action::PlaybackFailed(format!(
                    "{} не настроен",
                    track.provider.label()
                )));
            }
        }
    }

    /// Родной путь: provider.playback_source(track) без матчинга
    /// (Spotify-фолбэк, треки уже чужого каталога, YouTube-треки из поиска).
    fn start_native_playback(
        &mut self,
        provider: Arc<dyn crate::provider::MusicProvider>,
        track: crate::model::TrackRef,
        _actions: &mut Vec<Action>,
    ) {
        if let Some(audio) = &self.audio {
            audio.reset();
        }
        self.current_track = Some(track.clone());
        self.current_track_started = false;
        self.playback_task = Some(spawn_playback(
            provider,
            self.sender.clone(),
            self.playback_generation,
            track,
        ));
    }

    fn start_wave(&mut self, actions: &mut Vec<Action>) {
        if let Some(task) = self.wave_task.take() {
            task.abort();
        }
        self.wave_generation = self.wave_generation.wrapping_add(1);
        let primary_provider = if self
            .providers
            .get(crate::model::ProviderKind::YandexMusic)
            .is_some()
        {
            crate::model::ProviderKind::YandexMusic
        } else if self
            .providers
            .get(crate::model::ProviderKind::SoundCloud)
            .is_some()
        {
            crate::model::ProviderKind::SoundCloud
        } else {
            actions.push(Action::WaveFinished {
                tracks: Vec::new(),
                failures: vec!["Для волны настрой Yandex Music или SoundCloud".to_string()],
            });
            return;
        };
        self.wave_task = Some(spawn_wave(
            Arc::clone(&self.providers),
            self.storage.clone(),
            self.sender.clone(),
            self.wave_generation,
            primary_provider,
        ));
    }

    fn start_control_wave(&mut self, actions: &mut Vec<Action>) {
        if let Some(task) = self.control_wave_task.take() {
            task.abort();
        }
        self.control_wave_generation = self.control_wave_generation.wrapping_add(1);
        let primary_provider = if self
            .providers
            .get(crate::model::ProviderKind::YandexMusic)
            .is_some()
        {
            crate::model::ProviderKind::YandexMusic
        } else if self
            .providers
            .get(crate::model::ProviderKind::SoundCloud)
            .is_some()
        {
            crate::model::ProviderKind::SoundCloud
        } else {
            actions.push(Action::ControlWaveFinished {
                tracks: Vec::new(),
                failures: vec!["Для волны настрой Yandex Music или SoundCloud".to_string()],
            });
            return;
        };
        let providers = Arc::clone(&self.providers);
        let storage = self.storage.clone();
        let sender = self.sender.clone();
        let generation = self.control_wave_generation;
        self.control_wave_task = Some(tokio::spawn(async move {
            let loaded = tokio::task::spawn_blocking(move || {
                Ok::<_, anyhow::Error>((
                    storage.recent_history(10_000)?,
                    storage.liked_tracks_with_time()?,
                ))
            })
            .await;
            let (history, liked) = match loaded {
                Ok(Ok(data)) => data,
                Ok(Err(error)) => {
                    let _ = sender.send(RuntimeMessage::ControlWaveFinished {
                        generation,
                        tracks: Vec::new(),
                        failures: vec![error.to_string()],
                    });
                    return;
                }
                Err(error) => {
                    let _ = sender.send(RuntimeMessage::ControlWaveFinished {
                        generation,
                        tracks: Vec::new(),
                        failures: vec![error.to_string()],
                    });
                    return;
                }
            };
            let now_ms = SystemTime::now()
                .duration_since(SystemTime::UNIX_EPOCH)
                .map(|duration| duration.as_millis() as i64)
                .unwrap_or_default();
            let result = crate::wave::generate_wave(
                &providers,
                crate::wave::WaveGenerationRequest {
                    settings: crate::wave::WaveSettings {
                        primary_provider,
                        ..crate::wave::WaveSettings::default()
                    },
                    history,
                    liked,
                    manual_seeds: Vec::new(),
                    manual_seed_only: false,
                    preview: false,
                    now_ms,
                },
            )
            .await;
            let _ = sender.send(RuntimeMessage::ControlWaveFinished {
                generation,
                tracks: result.tracks,
                failures: result.failures,
            });
        }));
    }

    fn start_import(&mut self, source: String) {
        if let Some(task) = self.import_task.take() {
            task.abort();
        }
        self.import_generation = self.import_generation.wrapping_add(1);
        self.import_task = Some(spawn_import(
            Arc::clone(&self.providers),
            self.storage.clone(),
            self.sender.clone(),
            self.import_generation,
            source,
        ));
    }

    fn start_account_captcha(
        &mut self,
        action: crate::account::models::AccountAction,
        actions: &mut Vec<Action>,
    ) {
        let Some(client) = self.account_client.clone() else {
            actions.push(Action::AccountCaptchaLoaded {
                action,
                result: Err(account_unavailable()),
            });
            return;
        };
        self.cancel_account_task();
        self.account_task = Some(spawn_captcha(
            client,
            self.sender.clone(),
            self.account_generation,
            action,
        ));
    }

    fn start_authentication(&mut self, request: AuthenticationRequest, actions: &mut Vec<Action>) {
        let Some(client) = self.account_client.clone() else {
            actions.push(Action::AccountAuthenticated(Err(account_unavailable())));
            return;
        };
        self.cancel_account_task();
        self.account_task = Some(spawn_authentication(
            client,
            self.secrets.clone(),
            self.sender.clone(),
            self.account_generation,
            request,
        ));
    }

    fn start_restore(&mut self, actions: &mut Vec<Action>) {
        let Some(client) = self.account_client.clone() else {
            actions.push(Action::AccountRestored(Err(account_unavailable())));
            return;
        };
        self.cancel_account_task();
        self.account_task = Some(spawn_restore(
            client,
            self.secrets.clone(),
            self.sender.clone(),
            self.account_generation,
        ));
    }

    fn start_logout(&mut self, actions: &mut Vec<Action>) {
        let Some(client) = self.account_client.clone() else {
            let session_result = self
                .secrets
                .remove(crate::secrets::SecretKey::SessionToken)
                .map_err(|error| AccountApiError::local("SESSION_REMOVE", error.to_string()));
            let cache_result = self
                .secrets
                .remove(crate::secrets::SecretKey::SoundCloudClientId)
                .map_err(|error| AccountApiError::local("BOOTSTRAP_REMOVE", error.to_string()));
            let result = session_result.and(cache_result);
            self.reload_providers();
            let soundcloud_configured = self
                .credential_state()
                .map(|state| state.soundcloud)
                .unwrap_or(false);
            actions.push(Action::AccountLoggedOut {
                result,
                soundcloud_configured,
            });
            return;
        };
        self.cancel_account_task();
        self.account_task = Some(spawn_logout(
            client,
            self.secrets.clone(),
            self.sender.clone(),
            self.account_generation,
        ));
    }

    fn start_bootstrap(&mut self, actions: &mut Vec<Action>) {
        let Some(client) = self.account_client.clone() else {
            actions.push(Action::BootstrapFinished(Err(account_unavailable())));
            return;
        };
        self.cancel_account_task();
        self.account_task = Some(spawn_bootstrap(
            client,
            self.secrets.clone(),
            self.sender.clone(),
            self.account_generation,
        ));
    }

    pub fn save_named_secret(&self, name: &str, value: &str) -> Result<(), anyhow::Error> {
        self.secrets.set_named(name, value).map(|_| ())
    }

    pub fn get_named_secret(&self, name: &str) -> anyhow::Result<Option<String>> {
        self.secrets.get_named(name)
    }

    pub fn remove_named_secret(&self, name: &str) -> Result<(), anyhow::Error> {
        self.secrets.remove_named(name).map(|_| ())
    }

    pub fn reload_providers(&mut self) {
        let setup = build_registry(&self.config, &self.secrets, true);
        self.providers = Arc::new(setup.registry);
        self.notices.extend(setup.notices);
    }

    fn cancel_account_task(&mut self) {
        if let Some(task) = self.account_task.take() {
            task.abort();
        }
        self.account_generation = self.account_generation.wrapping_add(1);
    }

    fn cancel_playback(&mut self) {
        if let Some(task) = self.playback_task.take() {
            task.abort();
            crate::dlog!(
                "[Playback][{}] session cancelled",
                self.playback_session_id
            );
        }
        if let Some(task) = self.control_search_task.take() {
            task.abort();
        }
        if let Some(task) = self.control_wave_task.take() {
            task.abort();
        }
        if let Some(task) = self.wave_task.take() {
            task.abort();
        }
        self.playback_generation = self.playback_generation.wrapping_add(1);
    }

    fn start_onboarding_task(
        &mut self,
        spawn: impl FnOnce(mpsc::UnboundedSender<RuntimeMessage>, u64) -> JoinHandle<()>,
    ) {
        if let Some(task) = self.onboarding_task.take() {
            task.abort();
        }
        self.onboarding_generation = self.onboarding_generation.wrapping_add(1);
        self.onboarding_task = Some(spawn(self.sender.clone(), self.onboarding_generation));
    }

    fn record_current(&mut self, completed: bool, skipped: bool) {
        let Some(track) = self.current_track.take() else {
            return;
        };
        if !self.current_track_started {
            return;
        }
        self.current_track_started = false;
        let played_at_ms = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|duration| duration.as_millis() as i64)
            .unwrap_or_default();
        if let Err(error) = self.storage.record_history(&HistoryEntry {
            track,
            played_at_ms,
            completed,
            skipped,
        }) {
            self.notices
                .push(format!("Не удалось сохранить историю: {error}"));
        }
    }
}

impl Drop for Runtime {
    fn drop(&mut self) {
        if let Some(task) = self.search_task.take() {
            task.abort();
        }
        if let Some(task) = self.playback_task.take() {
            task.abort();
        }
        if let Some(task) = self.onboarding_task.take() {
            task.abort();
        }
        if let Some(task) = self.import_task.take() {
            task.abort();
        }
        if let Some(task) = self.account_task.take() {
            task.abort();
        }
    }
}

fn account_unavailable() -> AccountApiError {
    AccountApiError::local(
        "ACCOUNT_CLIENT_UNAVAILABLE",
        "Клиент аккаунта не запустился, проверь адрес сервера в config.toml",
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn stale_runtime_message_never_reaches_app() {
        let (sender, receiver) = mpsc::unbounded_channel();
        let mut runtime = Runtime {
            providers: Arc::new(ProviderRegistry::default()),
            playback_resolver: Arc::new(playback_resolver::PlaybackResolver::new(
                Arc::new(ProviderRegistry::default()),
                playback_resolver::PlaybackSourceKind::YouTubeMusic,
            )),
            account_client: None,
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
            account_task: None,
            onboarding_task: None,
            search_generation: 7,
            playback_generation: 3,
            playback_session_id: String::new(),
            playback_session_counter: 0,
            wave_generation: 0,
            control_search_generation: 0,
            control_wave_generation: 0,
            import_generation: 0,
            account_generation: 0,
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
            account_client: None,
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
            account_task: None,
            onboarding_task: None,
            search_generation: 0,
            playback_generation: 0,
            playback_session_id: String::new(),
            playback_session_counter: 0,
            wave_generation: 0,
            control_search_generation: 0,
            control_wave_generation: 0,
            import_generation: 0,
            account_generation: 0,
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
            account_client: None,
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
            account_task: None,
            onboarding_task: None,
            search_generation: 0,
            playback_generation: 0,
            playback_session_id: String::new(),
            playback_session_counter: 0,
            wave_generation: 0,
            control_search_generation: 0,
            control_wave_generation: 0,
            import_generation: 0,
            account_generation: 0,
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
            account_client: None,
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
            account_task: None,
            onboarding_task: None,
            search_generation: 0,
            playback_generation: 0,
            playback_session_id: String::new(),
            playback_session_counter: 0,
            wave_generation: 0,
            control_search_generation: 0,
            control_wave_generation: 0,
            import_generation: 0,
            account_generation: 0,
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
            account_client: None,
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
            account_task: None,
            onboarding_task: None,
            search_generation: 0,
            playback_generation: 0,
            playback_session_id: String::new(),
            playback_session_counter: 0,
            wave_generation: 0,
            control_search_generation: 0,
            control_wave_generation: 0,
            import_generation: 0,
            account_generation: 0,
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
        let history = storage.recent_history(10).unwrap();
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
        }
    }
}
