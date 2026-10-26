use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
    time::{Duration, SystemTime},
};

use anyhow::Result;
use futures_util::future::join_all;
use tokio::sync::Semaphore;
use tokio::time::timeout;

use crate::{
    model::{ProviderKind, TrackRef},
    provider::ProviderRegistry,
    storage::Storage,
    wave::{
        ArtistDiversityGuard, WaveTasteProfile, clean_artist_name, is_tracklike,
        is_valid_artist_name, track_semantic_key,
    },
};

use super::{
    parse_provider_filter,
    scoring::{balance_providers_organic, get_recently_served_recs, remember_served_recs},
};

/// Чистая генерация рекомендаций для домашней страницы («Рекомендации», 20-30 треков).
/// Использует двухуровневую архитектуру Candidate Pool:
/// 1. В SQLite кэшируется богатый пул кандидатов (60-80 треков) на 2 часа;
/// 2. При каждом обращении/перезапуске за <2 мс выполняется взвешенное динамическое сэмплирование
///    со штрафом за недавние показы (Impression Cooldown), что дает свежую витрину без лишней нагрузки на сеть.
pub async fn generate_home_recommendations(
    storage: &Storage,
    providers: &ProviderRegistry,
    size: usize,
    provider_filter: Option<&str>,
    force_refresh: bool,
) -> Result<Vec<TrackRef>> {
    let allowed_providers =
        parse_provider_filter(provider_filter).unwrap_or_else(|| providers.kinds().collect());
    if allowed_providers.is_empty() {
        return Ok(Vec::new());
    }

    let library = storage.library_tracks().unwrap_or_default();
    let now_ms = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);

    let mut prov_sorted: Vec<String> = allowed_providers
        .iter()
        .map(|p| p.as_str().to_string())
        .collect();
    prov_sorted.sort();

    let pool_cache_key = format!(
        "home_candidate_pool_v4_{}_{}",
        prov_sorted.join("_"),
        library.len(),
    );

    // 1. Попытка взять готовый пул кандидатов из SQLite (TTL 7200 сек = 2 часа)
    let mut candidate_pool: Vec<TrackRef> = if !force_refresh {
        if let Ok(Some(cached_json)) = storage.get_cached_recommendation(&pool_cache_key, 7200) {
            serde_json::from_str(&cached_json).unwrap_or_default()
        } else {
            Vec::new()
        }
    } else {
        Vec::new()
    };

    let profile = WaveTasteProfile::build_from_storage(storage, &library, true, &[], now_ms);

    // 2. Если пул кандидатов пуст или мал — собираем богатый пул (60-80 треков)
    if candidate_pool.len() < size.max(24) * 2 {
        let mut rng = (now_ms as u64)
            .wrapping_mul(6364136223846793005)
            .wrapping_add(1442695040888963407);

        // Взвешенный отбор сидов: делим артистов на Tier 1 (Core), Tier 2 (Rotation), Tier 3 (Recent)
        let mut seed_tracks = Vec::new();
        let mut seen_seed_artists = HashSet::new();

        // Tier 3: Недавние треки (до 3 разных артистов)
        let mut recent_candidates = Vec::new();
        for t in &profile.recent_tracks {
            let artist_key = clean_artist_name(&t.display_artist());
            if !artist_key.is_empty()
                && is_valid_artist_name(&artist_key)
                && !seen_seed_artists.contains(&artist_key)
            {
                recent_candidates.push((artist_key, t.clone()));
            }
        }
        let r_len = recent_candidates.len();
        for i in (1..r_len).rev() {
            rng = rng
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            let j = ((rng >> 32) as usize) % (i + 1);
            recent_candidates.swap(i, j);
        }
        for (a_key, t) in recent_candidates.into_iter().take(3) {
            if seen_seed_artists.insert(a_key) {
                seed_tracks.push(t);
            }
        }

        // Tier 1: Топ-5 артистов фонотеки (Core favorites)
        let mut tier1_artists: Vec<String> = profile
            .top_artists
            .iter()
            .take(5)
            .map(|(a, _)| a.clone())
            .collect();
        let t1_len = tier1_artists.len();
        for i in (1..t1_len).rev() {
            rng = rng
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            let j = ((rng >> 32) as usize) % (i + 1);
            tier1_artists.swap(i, j);
        }
        for artist in tier1_artists.into_iter().take(4) {
            let a_key = clean_artist_name(&artist);
            if !a_key.is_empty()
                && is_valid_artist_name(&a_key)
                && seen_seed_artists.insert(a_key.clone())
            {
                if let Some(t) = library
                    .iter()
                    .find(|tr| clean_artist_name(&tr.display_artist()) == a_key)
                {
                    seed_tracks.push(t.clone());
                }
            }
        }

        // Tier 2: Топ 6-15 артистов фонотеки (Rotation)
        let mut tier2_artists: Vec<String> = profile
            .top_artists
            .iter()
            .skip(5)
            .take(10)
            .map(|(a, _)| a.clone())
            .collect();
        let t2_len = tier2_artists.len();
        for i in (1..t2_len).rev() {
            rng = rng
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            let j = ((rng >> 32) as usize) % (i + 1);
            tier2_artists.swap(i, j);
        }
        for artist in tier2_artists.into_iter().take(3) {
            if seed_tracks.len() >= 10 {
                break;
            }
            let a_key = clean_artist_name(&artist);
            if !a_key.is_empty()
                && is_valid_artist_name(&a_key)
                && seen_seed_artists.insert(a_key.clone())
            {
                if let Some(t) = library
                    .iter()
                    .find(|tr| clean_artist_name(&tr.display_artist()) == a_key)
                {
                    seed_tracks.push(t.clone());
                }
            }
        }

        // Если сидов всё ещё мало, добираем любые доступные из библиотеки
        if seed_tracks.len() < 6 {
            for t in &library {
                let a_key = clean_artist_name(&t.display_artist());
                if !a_key.is_empty()
                    && is_valid_artist_name(&a_key)
                    && seen_seed_artists.insert(a_key)
                {
                    seed_tracks.push(t.clone());
                    if seed_tracks.len() >= 8 {
                        break;
                    }
                }
            }
        }

        let semaphore = Arc::new(Semaphore::new(10));
        let mut new_candidates = Vec::new();
        let mut seen_candidates = HashSet::new();

        // Параллельный сбор: related для сидов на родном сервисе, поиск артиста на остальных
        let mut tasks = Vec::new();
        for seed in &seed_tracks {
            let seed_artist = seed.artists.first().cloned();
            for &prov_kind in &allowed_providers {
                if let Some(provider) = providers.get(prov_kind) {
                    let sem = semaphore.clone();
                    let seed_clone = seed.clone();
                    let artist_clone = seed_artist.clone();
                    tasks.push(async move {
                        let _permit = sem.acquire().await;
                        if seed_clone.provider == prov_kind {
                            timeout(
                                Duration::from_millis(3000),
                                provider.related(&seed_clone, 12),
                            )
                            .await
                            .ok()
                            .and_then(|r| r.ok())
                            .unwrap_or_default()
                        } else if let Some(artist) = artist_clone {
                            timeout(Duration::from_millis(3000), provider.search(&artist, None))
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

        let results = join_all(tasks).await;
        for list in results {
            for t in list {
                let sk = track_semantic_key(&t);
                if is_tracklike(&t)
                    && !profile.known_semantic_keys.contains(&sk)
                    && !profile.known_track_ids.contains(&t.id)
                    && seen_candidates.insert(sk)
                {
                    new_candidates.push(t);
                }
            }
        }

        // Добираем треки соавторов любимых артистов (до 8 соавторов)
        if new_candidates.len() < 70 {
            let mut collab_tasks = Vec::new();
            for (_artist, collabs) in profile.collaborator_map.iter().take(8) {
                for collab in collabs.iter().take(2) {
                    for &prov_kind in &allowed_providers {
                        if let Some(provider) = providers.get(prov_kind) {
                            let sem = semaphore.clone();
                            let collab_clone = collab.clone();
                            collab_tasks.push(async move {
                                let _permit = sem.acquire().await;
                                timeout(
                                    Duration::from_millis(2500),
                                    provider.search(&collab_clone, None),
                                )
                                .await
                                .ok()
                                .and_then(|r| r.ok())
                                .map(|res| {
                                    res.tracks.into_iter().take(4).collect::<Vec<TrackRef>>()
                                })
                                .unwrap_or_default()
                            });
                        }
                    }
                }
            }
            let collab_results = join_all(collab_tasks).await;
            for list in collab_results {
                for t in list {
                    let sk = track_semantic_key(&t);
                    if is_tracklike(&t)
                        && !profile.known_semantic_keys.contains(&sk)
                        && !profile.known_track_ids.contains(&t.id)
                        && seen_candidates.insert(sk)
                    {
                        new_candidates.push(t);
                    }
                }
            }
        }

        // Fallback: если кандидатов все еще мало
        if new_candidates.len() < 24 {
            let fallback_query = if profile.genre_profile.similarity(&TrackRef {
                provider: ProviderKind::SoundCloud,
                id: String::new(),
                title: "rap".into(),
                artists: vec!["rap".into()],
                duration_ms: None,
                artwork_url: None,
                web_url: url::Url::parse("https://example.com").unwrap(),
                capability: crate::model::PlaybackCapability::Full,
                genres: vec!["rap".into()],
                explicit: false,
                drm: false,
                isrc: None,
                origin: crate::model::TrackOrigin::Original,
                album_url: None,
                album_title: None,
            }) > 0.0
            {
                "hip hop hits"
            } else {
                "top hits 2026"
            };
            for &prov_kind in &allowed_providers {
                if let Some(provider) = providers.get(prov_kind) {
                    if let Ok(s_res) = provider.search(fallback_query, None).await {
                        for t in s_res.tracks {
                            let sk = track_semantic_key(&t);
                            if is_tracklike(&t) && seen_candidates.insert(sk) {
                                new_candidates.push(t);
                            }
                        }
                    }
                }
            }
        }

        // Fair Quota балансировка пула кандидатов:
        // Если выбрано несколько провайдеров, проверяем, нет ли сильного перекоса кандидатов.
        // При нехватке кандидатов у одного из сервисов (например, Spotify), точечно добираем треки его топ-артистов фонотеки.
        if allowed_providers.len() > 1 && !profile.top_artists.is_empty() {
            let mut provider_counts: HashMap<ProviderKind, usize> = HashMap::new();
            for t in &new_candidates {
                *provider_counts.entry(t.provider).or_default() += 1;
            }
            let max_count = provider_counts.values().copied().max().unwrap_or(0);
            let target_quota = (max_count / 2).max(size.max(12));

            let mut topup_tasks = Vec::new();
            for &prov_kind in &allowed_providers {
                let current_c = provider_counts.get(&prov_kind).copied().unwrap_or(0);
                if current_c < target_quota {
                    if let Some(provider) = providers.get(prov_kind) {
                        for (top_artist, _) in profile.top_artists.iter().take(4) {
                            let sem = semaphore.clone();
                            let artist_name = top_artist.clone();
                            let provider_cloned = provider.clone();
                            topup_tasks.push(async move {
                                let _permit = sem.acquire().await;
                                timeout(
                                    Duration::from_millis(3000),
                                    provider_cloned.search(&artist_name, None),
                                )
                                .await
                                .ok()
                                .and_then(|r| r.ok())
                                .map(|res| {
                                    res.tracks.into_iter().take(8).collect::<Vec<TrackRef>>()
                                })
                                .unwrap_or_default()
                            });
                        }
                    }
                }
            }

            if !topup_tasks.is_empty() {
                let topup_results = join_all(topup_tasks).await;
                for list in topup_results {
                    for t in list {
                        let sk = track_semantic_key(&t);
                        if is_tracklike(&t)
                            && !profile.known_semantic_keys.contains(&sk)
                            && !profile.known_track_ids.contains(&t.id)
                            && seen_candidates.insert(sk)
                        {
                            new_candidates.push(t);
                        }
                    }
                }
            }
        }

        candidate_pool = new_candidates;
        // Сохраняем собранный пул кандидатов в SQLite (TTL 2 часа)
        if candidate_pool.len() >= 12 {
            let _ = storage.set_cached_recommendation(
                &pool_cache_key,
                &serde_json::to_string(&candidate_pool)?,
            );
        }
    }

    if candidate_pool.is_empty() {
        return Ok(Vec::new());
    }

    // 3. Динамическое сэмплирование и ранжирование из пула кандидатов
    let recently_served = get_recently_served_recs();
    let mut rng = (now_ms as u64)
        .wrapping_mul(6364136223846793005)
        .wrapping_add(1442695040888963407);

    let mut scored_candidates: Vec<(TrackRef, f64)> = candidate_pool
        .into_iter()
        .map(|t| {
            let sk = track_semantic_key(&t);
            let sim =
                profile.genre_profile.similarity(&t) - profile.genre_profile.alien_penalty(&t);
            let mut score = sim;

            // Штраф за недавний показ (Impression Cooldown): треки, показанные в прошлый раз, уступают место другим
            if recently_served.contains(&sk) {
                score -= 0.35;
            }

            // Мягкий шум для ротации треков с близким скором (-0.06..+0.06)
            rng = rng
                .wrapping_mul(6364136223846793005)
                .wrapping_add(1442695040888963407);
            let noise = (((rng >> 32) % 1000) as f64 / 1000.0 - 0.5) * 0.12;
            score += noise;

            (t, score)
        })
        .collect();

    scored_candidates.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    // Ограничиваем не более 2 треков одного артиста для отличного разнообразия
    let diversity_guard = ArtistDiversityGuard::new(2);
    let mut diverse_candidates = Vec::new();
    for (t, _) in scored_candidates {
        if diversity_guard.can_add(&t, &diverse_candidates) {
            diverse_candidates.push(t);
        }
    }

    let balanced = balance_providers_organic(diverse_candidates, size, &allowed_providers);

    // Запоминаем выданные треки для cooldown на следующий показ/обновление
    if !balanced.is_empty() {
        let served_keys: Vec<String> = balanced.iter().map(track_semantic_key).collect();
        remember_served_recs(&served_keys);
    }

    Ok(balanced)
}
