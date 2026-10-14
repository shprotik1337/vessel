use std::collections::HashSet;

use anyhow::Result;

use crate::{
    model::TrackRef,
    provider::ProviderRegistry,
    storage::Storage,
    wave::{track_key, track_semantic_key, QueueContext, SmartShuffleInterleaver, SmartShuffleResult},
};

use super::{
    autoplay::generate_autoplay_chunk,
    scoring::remember_smart_shuffle_keys,
};

/// Применение Smart Shuffle к текущей очереди.
pub async fn apply_smart_shuffle(
    storage: &Storage,
    providers: &ProviderRegistry,
    current_queue: Vec<TrackRef>,
    current_index: usize,
    provider_filter: Option<&str>,
) -> Result<SmartShuffleResult> {
    if current_queue.is_empty() {
        return Ok(SmartShuffleResult {
            interleaved_queue: Vec::new(),
            injected_track_keys: HashSet::new(),
        });
    }

    let current_track = current_queue.get(current_index).cloned();
    let unplayed = if current_index + 1 < current_queue.len() {
        current_queue[current_index + 1..].to_vec()
    } else {
        Vec::new()
    };

    // Очищаем несыгранную часть от ранее вставленных smart_shuffle треков
    let unplayed_user_tracks: Vec<TrackRef> = unplayed
        .into_iter()
        .filter(|t| t.origin != crate::model::TrackOrigin::SmartShuffle)
        .collect();

    // Случай, когда несыгранных треков нет (пользователь на последнем треке или в очереди 1 трек):
    // Генерируем 6-8 рекомендаций и добавляем их в очередь!
    if unplayed_user_tracks.is_empty() {
        let rec_count = 8;
        let context = QueueContext {
            current_track: current_track.clone(),
            recent_played: current_queue[..=current_index].iter().rev().take(6).cloned().collect(),
            remaining_queue: Vec::new(),
            session_played_keys: HashSet::new(),
            feedback_skips: HashSet::new(),
            feedback_likes: HashSet::new(),
        };

        let mut recommendations = generate_autoplay_chunk(
            storage,
            providers,
            context,
            rec_count,
            provider_filter,
        ).await.unwrap_or_default();

        // Fallback к библиотеке, если онлайн-провайдеры ничего не вернули
        if recommendations.is_empty() {
            if let Ok(mut lib) = storage.library_tracks() {
                crate::app::shuffle_slice(&mut lib);
                let mut seen_lib = HashSet::new();
                for mut t in lib {
                    let sk = track_semantic_key(&t);
                    if seen_lib.insert(sk) && Some(&t) != current_track.as_ref() {
                        t.origin = crate::model::TrackOrigin::SmartShuffle;
                        recommendations.push(t);
                        if recommendations.len() >= rec_count {
                            break;
                        }
                    }
                }
            }
        }

        for r in &mut recommendations {
            r.origin = crate::model::TrackOrigin::SmartShuffle;
        }

        let mut injected_keys = HashSet::new();
        for r in &recommendations {
            injected_keys.insert(track_key(r));
        }

        let remembered_keys: Vec<String> = recommendations.iter().map(track_semantic_key).collect();
        remember_smart_shuffle_keys(&remembered_keys);

        let mut full_queue = current_queue[..=current_index].to_vec();
        full_queue.extend(recommendations);

        return Ok(SmartShuffleResult {
            interleaved_queue: full_queue,
            injected_track_keys: injected_keys,
        });
    }

    // Перемешиваем несыгранные оригинальные треки пользователя
    let mut unplayed_shuffled = unplayed_user_tracks;
    crate::app::shuffle_slice(&mut unplayed_shuffled);

    // Рассчитываем количество рекомендаций так, чтобы покрыть ВСЮ несыгранную очередь
    // с шагом 3:1 без искусственного потолка в 20 треков!
    let rec_count = ((unplayed_shuffled.len() + 2) / 3).max(4);
    let context = QueueContext {
        current_track: current_track.clone(),
        recent_played: current_queue[..=current_index].iter().rev().take(6).cloned().collect(),
        remaining_queue: unplayed_shuffled.clone(),
        session_played_keys: HashSet::new(),
        feedback_skips: HashSet::new(),
        feedback_likes: HashSet::new(),
    };

    let mut recommendations = generate_autoplay_chunk(
        storage,
        providers,
        context,
        rec_count,
        provider_filter,
    ).await.unwrap_or_default();

    // Fallback: если онлайн-рекомендации не вернулись, берем треки со схожим вайбом из фонотеки
    if recommendations.is_empty() {
        if let Ok(mut lib) = storage.library_tracks() {
            crate::app::shuffle_slice(&mut lib);
            let mut seen_lib = HashSet::new();
            for mut t in lib {
                let sk = track_semantic_key(&t);
                if seen_lib.insert(sk.clone())
                    && !unplayed_shuffled.iter().any(|u| track_semantic_key(u) == sk)
                    && Some(&t) != current_track.as_ref()
                {
                    t.origin = crate::model::TrackOrigin::SmartShuffle;
                    recommendations.push(t);
                    if recommendations.len() >= rec_count {
                        break;
                    }
                }
            }
        }
    }

    for r in &mut recommendations {
        r.origin = crate::model::TrackOrigin::SmartShuffle;
    }

    let shuffle_res = SmartShuffleInterleaver::interleave(&unplayed_shuffled, &recommendations, 3);
    let remembered_keys: Vec<String> = recommendations.iter().map(track_semantic_key).collect();
    remember_smart_shuffle_keys(&remembered_keys);

    let mut full_queue = Vec::with_capacity(current_index + 1 + shuffle_res.interleaved_queue.len());
    full_queue.extend(current_queue[..=current_index].iter().cloned());
    full_queue.extend(shuffle_res.interleaved_queue);

    Ok(SmartShuffleResult {
        interleaved_queue: full_queue,
        injected_track_keys: shuffle_res.injected_track_keys,
    })
}
