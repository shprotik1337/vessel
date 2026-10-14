use std::{
    sync::Arc,
    time::{Duration, SystemTime},
};

use tokio::{sync::mpsc, task::JoinHandle};

use crate::{
    action::Action,
    model::{ProviderKind, SearchProvider},
};

use super::{
    importer::spawn_import,
    message::RuntimeMessage,
    search::{self, spawn_search},
    wave::spawn_wave,
    Runtime,
};

impl Runtime {
    pub(super) fn start_search(
        &mut self,
        query: String,
        provider: SearchProvider,
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

    pub(super) fn start_control_search(&mut self, query: String, provider: SearchProvider) {
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

    fn select_wave_primary_provider(&self) -> Option<ProviderKind> {
        if self.providers.get(ProviderKind::Spotify).is_some() {
            Some(ProviderKind::Spotify)
        } else if self.providers.get(ProviderKind::YandexMusic).is_some() {
            Some(ProviderKind::YandexMusic)
        } else if self.providers.get(ProviderKind::SoundCloud).is_some() {
            Some(ProviderKind::SoundCloud)
        } else if self.providers.get(ProviderKind::YouTubeMusic).is_some() {
            Some(ProviderKind::YouTubeMusic)
        } else if self.providers.get(ProviderKind::Deezer).is_some() {
            Some(ProviderKind::Deezer)
        } else {
            self.providers.kinds().next()
        }
    }

    pub(super) fn start_wave(&mut self, actions: &mut Vec<Action>) {
        if let Some(task) = self.wave_task.take() {
            task.abort();
        }
        self.wave_generation = self.wave_generation.wrapping_add(1);
        let Some(primary_provider) = self.select_wave_primary_provider() else {
            actions.push(Action::WaveFinished {
                tracks: Vec::new(),
                failures: vec!["Для волны подключите хотя бы один музыкальный сервис".to_string()],
            });
            return;
        };
        let include_playlists = true;
        let excluded_playlists = self.config.excluded_recommendation_playlist_ids.clone();
        self.wave_task = Some(spawn_wave(
            Arc::clone(&self.providers),
            self.storage.clone(),
            self.sender.clone(),
            self.wave_generation,
            primary_provider,
            include_playlists,
            excluded_playlists,
        ));
    }

    pub(super) fn start_control_wave(&mut self, actions: &mut Vec<Action>) {
        if let Some(task) = self.control_wave_task.take() {
            task.abort();
        }
        self.control_wave_generation = self.control_wave_generation.wrapping_add(1);
        let Some(primary_provider) = self.select_wave_primary_provider() else {
            actions.push(Action::ControlWaveFinished {
                tracks: Vec::new(),
                failures: vec!["Для волны подключите хотя бы один музыкальный сервис".to_string()],
            });
            return;
        };
        let providers = Arc::clone(&self.providers);
        let storage = self.storage.clone();
        let sender = self.sender.clone();
        let generation = self.control_wave_generation;
        let include_playlists = true;
        let excluded_playlists = self.config.excluded_recommendation_playlist_ids.clone();
        self.control_wave_task = Some(tokio::spawn(async move {
            let loaded = tokio::task::spawn_blocking(move || {
                let history = storage.recent_history(10_000)?;
                let liked = storage.liked_tracks_with_time()?;
                let playlist_tracks = if include_playlists {
                    crate::recommendation::load_playlist_tracks(&storage, &excluded_playlists)
                } else {
                    Vec::new()
                };
                Ok::<_, anyhow::Error>((history, liked, playlist_tracks))
            })
            .await;
            let (history, liked, playlist_tracks) = match loaded {
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
                    playlist_tracks,
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

    pub(super) fn start_import(&mut self, source: String) {
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

    pub(super) fn start_onboarding_task(
        &mut self,
        spawn: impl FnOnce(mpsc::UnboundedSender<RuntimeMessage>, u64) -> JoinHandle<()>,
    ) {
        if let Some(task) = self.onboarding_task.take() {
            task.abort();
        }
        self.onboarding_generation = self.onboarding_generation.wrapping_add(1);
        self.onboarding_task = Some(spawn(self.sender.clone(), self.onboarding_generation));
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn wave_provider_selection_returns_none_when_no_providers() {
        let (sender, receiver) = mpsc::unbounded_channel();
        let runtime = Runtime {
            providers: Arc::new(crate::provider::ProviderRegistry::default()),
            playback_resolver: Arc::new(crate::runtime::playback_resolver::PlaybackResolver::new(
                Arc::new(crate::provider::ProviderRegistry::default()),
                crate::runtime::playback_resolver::PlaybackSourceKind::YouTubeMusic,
            )),
            config: crate::config::AppConfig::default(),
            secrets: crate::secrets::SecretStore::new(std::path::PathBuf::from("unused.json")),
            audio: None,
            sender,
            receiver,
            search_task: None,
            control_search_task: None,
            playback_task: None,
            wave_task: None,
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
            storage: crate::storage::Storage::new(std::path::PathBuf::from("unused.sqlite3")),
            current_track: None,
            current_track_started: false,
        };
        assert_eq!(runtime.select_wave_primary_provider(), None);
    }
}

