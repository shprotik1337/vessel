use std::{sync::Arc, time::SystemTime};

use tokio::{sync::mpsc::UnboundedSender, task::JoinHandle};

use crate::{
    model::ProviderKind,
    provider::ProviderRegistry,
    storage::Storage,
    wave::{WaveGenerationRequest, WaveSettings, generate_wave},
};

use super::message::RuntimeMessage;

pub(super) fn spawn_wave(
    providers: Arc<ProviderRegistry>,
    storage: Storage,
    sender: UnboundedSender<RuntimeMessage>,
    generation: u64,
    primary_provider: ProviderKind,
    include_playlists: bool,
    excluded_playlist_ids: Vec<String>,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        let loaded = tokio::task::spawn_blocking(move || {
            let history = storage.recent_history(10_000)?;
            let liked = storage.liked_tracks_with_time()?;
            let playlist_tracks = if include_playlists {
                crate::recommendation::load_playlist_tracks(&storage, &excluded_playlist_ids)
            } else {
                Vec::new()
            };
            Ok::<_, anyhow::Error>((history, liked, playlist_tracks))
        })
        .await;
        let (history, liked, playlist_tracks) = match loaded {
            Ok(Ok(data)) => data,
            Ok(Err(error)) => {
                let _ = sender.send(RuntimeMessage::WaveFinished {
                    generation,
                    tracks: Vec::new(),
                    failures: vec![format!("Не удалось прочитать историю: {error}")],
                });
                return;
            }
            Err(error) => {
                let _ = sender.send(RuntimeMessage::WaveFinished {
                    generation,
                    tracks: Vec::new(),
                    failures: vec![format!("Задача истории упала: {error}")],
                });
                return;
            }
        };
        let now_ms = SystemTime::now()
            .duration_since(SystemTime::UNIX_EPOCH)
            .map(|duration| duration.as_millis() as i64)
            .unwrap_or_default();
        let result = generate_wave(
            &providers,
            WaveGenerationRequest {
                settings: WaveSettings {
                    primary_provider,
                    ..WaveSettings::default()
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
        let _ = sender.send(RuntimeMessage::WaveFinished {
            generation,
            tracks: result.tracks,
            failures: result.failures,
        });
    })
}
