use std::{
    collections::HashSet,
    sync::Arc,
    time::{Duration, SystemTime},
};

use anyhow::Result;
use futures_util::future::join_all;
use tokio::sync::Semaphore;
use tokio::time::timeout;

use crate::{
    model::TrackRef,
    provider::ProviderRegistry,
    storage::Storage,
    wave::{is_tracklike, track_semantic_key, ArtistDiversityGuard, QueueContext},
};

use super::{
    parse_provider_filter,
    scoring::{balance_providers_organic, get_recently_smart_shuffle_keys, remember_smart_shuffle_keys},
};

/// Генерация компактного чанка треков для продолжения очереди (Infinite Queue / Autoplay).
pub async fn generate_autoplay_chunk(
    storage: &Storage,
    providers: &ProviderRegistry,
    context: QueueContext,
    size: usize,
    provider_filter: Option<&str>,
) -> Result<Vec<TrackRef>> {
    let allowed_providers = parse_provider_filter(provider_filter)
        .unwrap_or_else(|| providers.kinds().collect());
    if allowed_providers.is_empty() {
        return Ok(Vec::new());
    }

    let seed_count = (size / 2).clamp(4, 12);
    let mut seed_tracks = context.extract_seed_tracks(seed_count);
    let mut seed_artists = context.extract_seed_artists(seed_count);

    // Обогащение сидов при короткой очереди: используем историю и библиотеку пользователя
    if seed_tracks.len() < seed_count || seed_artists.len() < seed_count {
        let mut seen_seed_artists: HashSet<String> = seed_artists.iter().cloned().collect();
        let mut seen_seed_keys: HashSet<String> = seed_tracks.iter().map(track_semantic_key).collect();

        // 1. Недавняя история прослушивания (свежие предпочтения)
        if let Ok(history) = storage.recent_history(30) {
            let mut hist_candidates: Vec<TrackRef> = history.into_iter().map(|h| h.track).collect();
            crate::app::shuffle_slice(&mut hist_candidates);
            for t in hist_candidates {
                let sk = track_semantic_key(&t);
                let art = crate::wave::clean_artist_name(&t.display_artist());
                if !seen_seed_keys.contains(&sk) && !art.is_empty() && seen_seed_artists.insert(art.clone()) {
                    seen_seed_keys.insert(sk);
                    if seed_tracks.len() < seed_count {
                        seed_tracks.push(t);
                    }
                    if seed_artists.len() < seed_count {
                        seed_artists.push(art);
                    }
                }
                if seed_tracks.len() >= seed_count && seed_artists.len() >= seed_count {
                    break;
                }
            }
        }

        // 2. Когорта любимых треков (библиотека)
        if (seed_tracks.len() < seed_count || seed_artists.len() < seed_count)
            && let Ok(mut lib) = storage.library_tracks()
            && !lib.is_empty()
        {
            crate::app::shuffle_slice(&mut lib);
            for t in lib {
                let sk = track_semantic_key(&t);
                let art = crate::wave::clean_artist_name(&t.display_artist());
                if !seen_seed_keys.contains(&sk) && !art.is_empty() && seen_seed_artists.insert(art.clone()) {
                    seen_seed_keys.insert(sk);
                    if seed_tracks.len() < seed_count {
                        seed_tracks.push(t);
                    }
                    if seed_artists.len() < seed_count {
                        seed_artists.push(art);
                    }
                }
                if seed_tracks.len() >= seed_count && seed_artists.len() >= seed_count {
                    break;
                }
            }
        }
    }

    crate::app::shuffle_slice(&mut seed_tracks);
    crate::app::shuffle_slice(&mut seed_artists);
    let genre_vec = context.calculate_genre_vector();

    let semaphore = Arc::new(Semaphore::new(10));
    let mut candidate_pool = Vec::new();
    let mut seen_candidates = HashSet::new();

    // 1. Параллельный сбор: related для seed_tracks (или поиск артиста на чужом сервисе)
    let mut seed_tasks = Vec::new();
    for seed in &seed_tracks {
        let seed_artist = seed.artists.first().cloned();
        for &prov_kind in &allowed_providers {
            if let Some(provider) = providers.get(prov_kind) {
                let sem = semaphore.clone();
                let seed_clone = seed.clone();
                let artist_clone = seed_artist.clone();
                seed_tasks.push(async move {
                    let _permit = sem.acquire().await;
                    if seed_clone.provider == prov_kind {
                        timeout(Duration::from_millis(3500), provider.related(&seed_clone, 8))
                            .await
                            .ok()
                            .and_then(|r| r.ok())
                            .unwrap_or_default()
                    } else if let Some(artist) = artist_clone {
                        timeout(Duration::from_millis(3500), provider.search(&artist, None))
                            .await
                            .ok()
                            .and_then(|r| r.ok())
                            .map(|res| res.tracks)
                            .unwrap_or_default()
                    } else {
                        Vec::new()
                    }
                });
            }
        }
    }

    // 2. Параллельный поиск по seed_artists
    let mut artist_tasks = Vec::new();
    for artist in &seed_artists {
        for &prov_kind in &allowed_providers {
            if let Some(provider) = providers.get(prov_kind) {
                let sem = semaphore.clone();
                let artist_clone = artist.clone();
                artist_tasks.push(async move {
                    let _permit = sem.acquire().await;
                    timeout(Duration::from_millis(3500), provider.search(&artist_clone, None))
                        .await
                        .ok()
                        .and_then(|r| r.ok())
                        .map(|res| res.tracks.into_iter().take(4).collect::<Vec<TrackRef>>())
                        .unwrap_or_default()
                });
            }
        }
    }

    let (seed_results, artist_results) = tokio::join!(join_all(seed_tasks), join_all(artist_tasks));
    for list in seed_results.into_iter().chain(artist_results.into_iter()) {
        for t in list {
            let sk = track_semantic_key(&t);
            if is_tracklike(&t)
                && !context.is_already_used(&t)
                && !context.feedback_skips.contains(&sk)
                && seen_candidates.insert(sk)
            {
                candidate_pool.push(t);
            }
        }
    }

    // 3. Скоринг и отбор с учетом ArtistDiversityGuard, Cooldown, стохастического PRNG и Alien Penalty
    let last_played_artist = context
        .current_track
        .as_ref()
        .and_then(|t| t.artists.first())
        .map(|a| crate::wave::clean_artist_name(a))
        .or_else(|| {
            context.recent_played.last().and_then(|t| t.artists.first()).map(|a| crate::wave::clean_artist_name(a))
        });

    let now_ms = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let mut rng = (now_ms as u64).wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
    let recent_smart_keys = get_recently_smart_shuffle_keys();

    let diversity_guard = ArtistDiversityGuard::new(2);
    let mut scored_candidates: Vec<(TrackRef, f64)> = candidate_pool
        .into_iter()
        .map(|mut track| {
            track.origin = crate::model::TrackOrigin::Autoplay;
            let sk = track_semantic_key(&track);
            let mut score = 1.0;
            let genre_sim = genre_vec.similarity(&track);
            let alien_pen = genre_vec.alien_penalty(&track);
            score += genre_sim * 2.5;
            score -= alien_pen * 3.0;

            if context.feedback_likes.contains(&sk) {
                score += 2.5;
            }

            let freq_pen = ArtistDiversityGuard::artist_frequency_penalty(&track, &context.recent_played);
            score -= freq_pen;

            // Artist Exhaustion Penalty: не давать артисту только что игравшего трека захватить чанк
            if let Some(ref last_art) = last_played_artist {
                let track_art = crate::wave::clean_artist_name(&track.display_artist());
                if !track_art.is_empty() && (track_art == *last_art || last_art.contains(&track_art) || track_art.contains(last_art)) {
                    score -= 1.8;
                }
            }

            // Штраф Cooldown за недавний показ в сессии Smart Shuffle
            if recent_smart_keys.contains(&sk) {
                score -= 0.40;
            }

            // Альтернативный сигнал релевантности при пустых жанрах: соответствие артисту очереди
            let candidate_artist = crate::wave::clean_artist_name(&track.display_artist());
            if !candidate_artist.is_empty() && seed_artists.contains(&candidate_artist) {
                score += 0.5;
            }

            // Контролируемый шум PRNG (-0.08..+0.08) для ротации кандидатов с близким скором
            rng = rng.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            let noise = (((rng >> 32) % 1000) as f64 / 1000.0 - 0.5) * 0.16;
            score += noise;

            (track, score)
        })
        .collect();

    scored_candidates.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    let mut selected_chunk = Vec::with_capacity(size);
    let mut last_artist_count = 0;
    for (track, _) in scored_candidates {
        let is_last_artist = if let Some(ref last_art) = last_played_artist {
            let track_art = crate::wave::clean_artist_name(&track.display_artist());
            !track_art.is_empty() && (track_art == *last_art || last_art.contains(&track_art) || track_art.contains(last_art))
        } else {
            false
        };

        if is_last_artist && last_artist_count >= 1 {
            continue;
        }

        if diversity_guard.can_add(&track, &selected_chunk) {
            if is_last_artist {
                last_artist_count += 1;
            }
            selected_chunk.push(track);
            if selected_chunk.len() >= size {
                break;
            }
        }
    }
    if selected_chunk.len() < size {
        if let Ok(mut library) = storage.library_tracks() {
            crate::app::shuffle_slice(&mut library);
            for mut track in library {
                if !context.is_already_used(&track)
                    && diversity_guard.can_add(&track, &selected_chunk)
                    && allowed_providers.contains(&track.provider)
                {
                    track.origin = crate::model::TrackOrigin::Autoplay;
                    selected_chunk.push(track);
                    if selected_chunk.len() >= size {
                        break;
                    }
                }
            }
        }
    }

    let balanced = balance_providers_organic(selected_chunk, size, &allowed_providers);
    if !balanced.is_empty() {
        let served_keys: Vec<String> = balanced.iter().map(track_semantic_key).collect();
        remember_smart_shuffle_keys(&served_keys);
    }
    Ok(balanced)
}
