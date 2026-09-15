use std::sync::Arc;

use tokio::{sync::mpsc::UnboundedSender, task::JoinHandle};

use crate::{model::TrackRef, provider::MusicProvider};

use super::message::RuntimeMessage;

pub(super) fn spawn_playback(
    provider: Arc<dyn MusicProvider>,
    sender: UnboundedSender<RuntimeMessage>,
    generation: u64,
    track: TrackRef,
) -> JoinHandle<()> {
    tokio::spawn(async move {
        // 1. Если трек уже в локальном кэше — играем локально сразу
        if let Some(cached) = crate::provider::cache::cached_source(&track) {
            let _ = sender.send(RuntimeMessage::PlaybackReady {
                generation,
                source: cached,
                video_only_notice: None,
            });
            return;
        }

        // 2. Получаем сетевой/локальный источник от провайдера
        let source_result = provider.playback_source(&track).await;
        let source = match source_result {
            Ok(s) => s,
            Err(error) => {
                let _ = sender.send(RuntimeMessage::PlaybackFailed {
                    generation,
                    error: error.to_string(),
                });
                return;
            }
        };

        // 3. Отдаём источник воспроизведения для потокового стриминга через HttpRangeSource / HlsSource
        let _ = sender.send(RuntimeMessage::PlaybackReady {
            generation,
            source,
            video_only_notice: None,
        });
    })
}
