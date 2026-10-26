use std::{sync::Arc, time::SystemTime};

use tokio::{sync::mpsc::UnboundedSender, task::JoinHandle};

use crate::{
    action::Action,
    model::{ProviderKind, TrackRef},
    provider::MusicProvider,
    storage::HistoryEntry,
};

use super::{
    Runtime,
    message::RuntimeMessage,
    playback_resolver::{PlaybackResolver, PlaybackSourceKind},
};

pub(super) fn spawn_playback(
    provider: Arc<dyn MusicProvider>,
    sender: UnboundedSender<RuntimeMessage>,
    generation: u64,
    track: TrackRef,
    auto_cache: bool,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        // 1. Если трек уже в локальном кэше — играем локально сразу
        if let Some(mut cached) = crate::provider::cache::cached_source(&track) {
            if cached.duration_ms.is_none() {
                cached.duration_ms = track.duration_ms;
            }
            let _ = sender.send(RuntimeMessage::PlaybackReady {
                generation,
                source: cached,
                video_only_notice: None,
            });
            return;
        }

        // 2. Получаем сетевой/локальный источник от провайдера
        let source_result = provider.playback_source(&track).await;
        let mut source = match source_result {
            Ok(s) => s,
            Err(error) => {
                let _ = sender.send(RuntimeMessage::PlaybackFailed {
                    generation,
                    error: error.to_string(),
                });
                return;
            }
        };
        if source.duration_ms.is_none() {
            source.duration_ms = track.duration_ms;
        }

        // 3. Фоновое сохранение потока в кэш (если включено в настройках)
        if auto_cache {
            let cache_track = track.clone();
            let cache_source = source.clone();
            tokio::spawn(async move {
                let _ =
                    crate::provider::cache::download_track_to_cache(&cache_track, &cache_source)
                        .await;
            });
        }

        // 4. Отдаём источник воспроизведения для потокового стриминга через HttpRangeSource / HlsSource
        let _ = sender.send(RuntimeMessage::PlaybackReady {
            generation,
            source,
            video_only_notice: None,
        });
    })
}

impl Runtime {
    /// Резолвер цепочки Deezer/YouTube — единственный путь к аудио Spotify
    /// (и для проигрывания, и для скачивания в «Скачать в кэш»).
    pub fn playback_resolver(&self) -> Arc<PlaybackResolver> {
        Arc::clone(&self.playback_resolver)
    }

    /// Текущий источник аудио для Spotify-треков.
    pub fn spotify_playback_source(&self) -> PlaybackSourceKind {
        self.playback_resolver.source()
    }

    /// Сменить источник аудио для Spotify-треков (сразу, без перезапуска).
    pub fn set_spotify_playback_source(&mut self, source: PlaybackSourceKind) {
        self.playback_resolver.set_source(source);
        self.config.spotify_playback_source = Some(source.as_str().to_string());
    }

    pub fn set_audio_crossfade(&self, duration_ms: u32) {
        if let Some(audio) = &self.audio {
            audio.set_crossfade(duration_ms);
        }
    }

    pub fn set_audio_agc(&self, enabled: bool) {
        if let Some(audio) = &self.audio {
            audio.set_agc(enabled);
        }
    }

    #[allow(dead_code)]
    pub(super) fn start_playback(&mut self, track: TrackRef, actions: &mut Vec<Action>) {
        self.start_playback_with_cache_flag(track, true, actions);
    }

    pub(super) fn start_playback_with_cache_flag(
        &mut self,
        track: TrackRef,
        allow_cache: bool,
        actions: &mut Vec<Action>,
    ) {
        self.record_current(false, true);
        self.cancel_playback();

        // Session id для корреляции логов всего playback-пайплайна
        self.playback_session_id = format!("p{:04x}", self.playback_session_counter);
        self.playback_session_counter = self.playback_session_counter.wrapping_add(1);
        let session = self.playback_session_id.clone();
        crate::dlog!(
            "[Playback][{session}] requested {} track «{}» ({}), source={}, allow_cache={allow_cache}",
            track.provider.label(),
            track.title,
            track.id,
            self.playback_resolver.source().as_str()
        );

        // Выбор источника аудио: Spotify-треки играют через цепочку каталогов.
        // Ручной режим — один источник; «Автоматически» —
        // Deezer → YouTube Music → YouTube (каждый следующий только если
        // предыдущий не смог).
        if track.provider == ProviderKind::Spotify {
            // Мгновенный офлайн-старт из локального кэша, если трек уже скачан и кэш разрешён
            if allow_cache
                && let Some(mut cached_source) = crate::provider::cache::cached_source(&track)
            {
                if cached_source.duration_ms.is_none() {
                    cached_source.duration_ms = track.duration_ms;
                }
                crate::dlog!(
                    "[Playback][{session}] Spotify-трек «{}» уже в кэше — играем напрямую",
                    track.title
                );
                if let Some(audio) = &self.audio {
                    audio.reset();
                }
                self.current_track = Some(track.clone());
                self.current_track_started = false;
                actions.push(Action::Audio(crate::audio::AudioEvent::Buffering));
                let sender = self.sender.clone();
                let generation = self.playback_generation;
                self.playback_task = Some(tokio::spawn(async move {
                    let _ = sender.send(RuntimeMessage::PlaybackReady {
                        generation,
                        source: cached_source,
                        video_only_notice: None,
                    });
                }));
                return;
            }

            let requested_source = self.playback_resolver.source();
            let is_remote_deezer = self
                .providers
                .get(ProviderKind::Deezer)
                .map_or(false, |p| p.is_remote());
            let has_deezer_arl = self
                .secrets
                .get(crate::secrets::SecretKey::DeezerArl)
                .ok()
                .flatten()
                .map(|s| !s.trim().is_empty())
                .unwrap_or(false);
            let chain: Vec<_> = requested_source
                .chain()
                .into_iter()
                .filter(|source| {
                    if *source == PlaybackSourceKind::Deezer && !has_deezer_arl && !is_remote_deezer
                    {
                        return false;
                    }
                    self.playback_resolver.source_available(*source)
                })
                .collect();
            if chain.is_empty() {
                // Аудио Spotify нативным путём не играется НИКОГДА: только
                // Deezer / YouTube Music каталоги.
                actions.push(Action::PlaybackFailed(format!(
                    "Spotify играет через Deezer/YouTube Music — ни один источник \
                     не подключён (Настройки → источник аудио для Spotify: {label})",
                    label = requested_source.label()
                )));
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
            let auto_cache = self.config.auto_cache;
            self.playback_task = Some(tokio::spawn(async move {
                let mut failures: Vec<String> = Vec::new();
                let mut any_candidates_found = false;

                for source in chain {
                    crate::dlog!("[Playback][{session}] trying provider={}", source.label());

                    // Этап 1: матчинг в этом каталоге
                    let (candidates, candidates_from_general) = match resolver
                        .resolve_candidates_in(source, &track)
                        .await
                    {
                        Ok((Some(candidates), stage)) => {
                            crate::dlog!(
                                "[Playback][{session}] {} {} candidates={}",
                                stage.describe(),
                                source.as_str(),
                                candidates.len()
                            );
                            if !candidates.is_empty() {
                                any_candidates_found = true;
                            }
                            (candidates, false)
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
                            // Фолбэк: честный поиск не нашёл,
                            // но в YTM остался официальный клип — общий поиск
                            if source == PlaybackSourceKind::YouTubeMusic {
                                match resolver.resolve_candidates_general(&track).await {
                                    Ok((Some(video_candidates), stage)) => {
                                        crate::dlog!(
                                            "[Playback][{session}] {} {} candidates={}",
                                            stage.describe(),
                                            source.as_str(),
                                            video_candidates.len()
                                        );
                                        if !video_candidates.is_empty() {
                                            any_candidates_found = true;
                                        }
                                        (video_candidates, true)
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
                                        failures.push(format!("YouTube Music (клипы): {error:#}"));
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
                            Ok(mut source_stream) => {
                                if source_stream.duration_ms.is_none() {
                                    source_stream.duration_ms =
                                        track.duration_ms.or(foreign_track.duration_ms);
                                }
                                // Играем через чужого провайдера, но
                                // UI-трек остаётся Spotify (лайки/история)
                                crate::dlog!(
                                    "[Playback][{session}] selected provider={} ({} канд.)",
                                    source.label(),
                                    candidates.len()
                                );

                                if auto_cache {
                                    let cache_track = foreign_track.clone();
                                    let cache_orig = track.clone();
                                    let cache_source = source_stream.clone();
                                    tokio::spawn(async move {
                                        let _ = crate::provider::cache::download_track_to_cache_with_alias(
                                            &cache_track,
                                            Some(&cache_orig),
                                            &cache_source,
                                        )
                                        .await;
                                    });
                                }

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

                let err_msg = if any_candidates_found {
                    "Не удалось загрузить трек".to_string()
                } else {
                    "Трек не был найден".to_string()
                };

                let _ = sender.send(RuntimeMessage::PlaybackFailed {
                    generation,
                    error: err_msg,
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
    pub(super) fn start_native_playback(
        &mut self,
        provider: Arc<dyn MusicProvider>,
        track: TrackRef,
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
            self.config.auto_cache,
        ));
    }

    pub(super) fn cancel_playback(&mut self) {
        if let Some(task) = self.playback_task.take() {
            task.abort();
            crate::dlog!("[Playback][{}] session cancelled", self.playback_session_id);
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
        self.last_audio_status = None;
    }

    pub(super) fn record_current(&mut self, completed: bool, skipped: bool) {
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
        let storage = self.storage.clone();
        std::thread::spawn(move || {
            if let Err(error) = storage.record_history(&HistoryEntry {
                track,
                played_at_ms,
                completed,
                skipped,
            }) {
                crate::dlog!("[vessel] record_history error: {error}");
            }
        });
    }
}
