use std::{
    collections::{HashMap, HashSet},
    sync::Arc,
    time::{Duration, SystemTime},
};

use anyhow::Result;
use futures_util::future::join_all;
use serde::{Deserialize, Serialize};
use tokio::sync::Semaphore;
use tokio::time::timeout;

use crate::{
    model::{ProviderKind, TrackRef},
    provider::{CollectionItem, CollectionKind, ProviderRegistry, MusicProvider},
    storage::Storage,
    wave::{
        clean_artist_name, is_tracklike, is_valid_artist_name, track_key, track_semantic_key,
        ArtistDiversityGuard, QueueContext, SmartShuffleInterleaver, SmartShuffleResult,
        WaveGenerationRequest, WaveGenreProfile, WaveMode, WaveSettings, WaveSourceMode,
        WaveTasteProfile, generate_wave,
    },
};

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub enum RecommendationSource {
    #[default]
    Favorites,
    Playlists,
    Discovery,
}

impl RecommendationSource {
    pub fn normalize(value: &str) -> Self {
        match value.trim().to_ascii_lowercase().as_str() {
            "playlists" | "playlist" => Self::Playlists,
            "discovery" => Self::Discovery,
            _ => Self::Favorites,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Favorites => "favorites",
            Self::Playlists => "playlists",
            Self::Discovery => "discovery",
        }
    }
}

#[derive(Clone, Debug)]
pub struct RecommendationResult {
    pub tracks: Vec<TrackRef>,
    pub failures: Vec<String>,
}

/// Сервис рекомендаций — единый слой поверх `wave::generate_wave`.
/// Используется для «Моей волны» на Главной и рекомендаций в пустом Search.
pub async fn recommend(
    providers: &ProviderRegistry,
    storage: &Storage,
    source: RecommendationSource,
    size: usize,
    provider_filter: Option<&str>,
    include_playlists: bool,
    excluded_playlist_ids: &[String],
) -> RecommendationResult {
    let playlist_tracks = if include_playlists {
        load_playlist_tracks(storage, excluded_playlist_ids)
    } else {
        Vec::new()
    };
    let (manual_seeds, manual_seed_only) = if matches!(source, RecommendationSource::Playlists) {
        let seeds = playlist_tracks.clone();
        let only = !seeds.is_empty();
        (seeds, only)
    } else {
        (Vec::new(), false)
    };
    run(
        providers,
        storage,
        source,
        size,
        playlist_tracks,
        manual_seeds,
        manual_seed_only,
        provider_filter,
    )
    .await
}

/// Рекомендации из конкретного плейлиста — его треки становятся примером для волны.
pub async fn recommend_from_playlist(
    providers: &ProviderRegistry,
    storage: &Storage,
    playlist_id: uuid::Uuid,
    size: usize,
    provider_filter: Option<&str>,
) -> RecommendationResult {
    let manual_seeds = playlist_tracks(storage, playlist_id);
    let playlist_tracks = manual_seeds.clone();
    run(
        providers,
        storage,
        RecommendationSource::Playlists,
        size,
        playlist_tracks,
        manual_seeds,
        true,
        provider_filter,
    )
    .await
}

/// Парсит строку выбранных провайдеров в список ProviderKind.
/// "all" / пустая строка = все доступные.
pub fn parse_provider_filter(filter: Option<&str>) -> Option<Vec<ProviderKind>> {
    let raw = filter?.trim();
    if raw.is_empty() || raw.eq_ignore_ascii_case("all") {
        return None;
    }
    let mut kinds = Vec::new();
    for part in raw.split(',') {
        let part = part.trim();
        let kind = match part.to_ascii_lowercase().as_str() {
            "soundcloud" | "sound_cloud" => ProviderKind::SoundCloud,
            "yandex" | "yandex_music" => ProviderKind::YandexMusic,
            "deezer" => ProviderKind::Deezer,
            "spotify" => ProviderKind::Spotify,
            "youtube_music" | "youtube" => ProviderKind::YouTubeMusic,
            _ => continue,
        };
        if !kinds.contains(&kind) {
            kinds.push(kind);
        }
    }
    if kinds.is_empty() {
        None
    } else {
        Some(kinds)
    }
}

async fn run(
    providers: &ProviderRegistry,
    storage: &Storage,
    source: RecommendationSource,
    size: usize,
    playlist_tracks: Vec<TrackRef>,
    manual_seeds: Vec<TrackRef>,
    manual_seed_only: bool,
    provider_filter: Option<&str>,
) -> RecommendationResult {
    let now_ms = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or_default();

    let history = storage.recent_history(10_000).unwrap_or_default();
    let liked = storage.liked_tracks_with_time().unwrap_or_default();

    let primary_provider = pick_primary_provider(providers);

    let explicit = parse_provider_filter(provider_filter);
    let has_explicit = explicit.is_some();
    let mut provider_priority = match explicit {
        Some(kinds) => kinds,
        None => providers.kinds().collect::<Vec<_>>(),
    };
    if !has_explicit && !provider_priority.contains(&primary_provider) {
        provider_priority.insert(0, primary_provider);
    }
    provider_priority.retain(|kind| providers.get(*kind).is_some());
    if !has_explicit {
        provider_priority.sort_by_key(|kind| match kind {
            ProviderKind::SoundCloud => 0,
            ProviderKind::YandexMusic => 1,
            ProviderKind::Deezer => 2,
            ProviderKind::Spotify => 3,
            ProviderKind::YouTubeMusic => 4,
        });
    }

    let is_mixed = provider_priority.len() > 1;
    let primary_provider = provider_priority.first().copied().unwrap_or(primary_provider);
    let source_mode = if is_mixed {
        WaveSourceMode::FallbackSoft
    } else {
        WaveSourceMode::CurrentService
    };

    let mut settings = WaveSettings {
        primary_provider,
        size: size.clamp(10, 80),
        mode: WaveMode::Balanced,
        source_mode,
        novelty: 0.35,
        anti_repeat_hours: 24,
        max_plays: 2,
        play_window_days: 7,
        max_artist_streak: 2,
        provider_priority: provider_priority.clone(),
        mixed_providers: is_mixed,
        ..Default::default()
    };

    if source == RecommendationSource::Favorites {
        settings.mode = WaveMode::Favorites;
    } else if source == RecommendationSource::Discovery {
        settings.mode = WaveMode::Discovery;
        settings.novelty = 0.85;
    }

    let result = generate_wave(
        providers,
        WaveGenerationRequest {
            settings,
            history,
            liked,
            playlist_tracks,
            manual_seeds,
            manual_seed_only,
            preview: size <= 16,
            now_ms,
        },
    )
    .await;

    RecommendationResult {
        tracks: result.tracks,
        failures: result.failures,
    }
}

pub fn load_playlist_tracks(
    storage: &Storage,
    excluded_playlist_ids: &[String],
) -> Vec<TrackRef> {
    let Ok(playlists) = storage.list_playlists() else {
        return Vec::new();
    };
    let mut seen = std::collections::HashSet::new();
    let mut tracks = Vec::new();
    for playlist in &playlists {
        let pl_id = playlist.id.to_string();
        if excluded_playlist_ids.iter().any(|id| id == &pl_id) {
            continue;
        }
        for track in &playlist.tracks {
            if seen.insert(track_key(track)) {
                tracks.push(track.clone());
            }
        }
    }
    tracks
}

fn playlist_tracks(storage: &Storage, playlist_id: uuid::Uuid) -> Vec<TrackRef> {
    let Ok(playlists) = storage.list_playlists() else {
        return Vec::new();
    };
    playlists
        .into_iter()
        .find(|p| p.id == playlist_id)
        .map(|p| p.tracks)
        .unwrap_or_default()
}

fn pick_primary_provider(providers: &ProviderRegistry) -> ProviderKind {
    if providers.get(ProviderKind::YandexMusic).is_some() {
        ProviderKind::YandexMusic
    } else if providers.get(ProviderKind::SoundCloud).is_some() {
        ProviderKind::SoundCloud
    } else if providers.get(ProviderKind::Deezer).is_some() {
        ProviderKind::Deezer
    } else if providers.get(ProviderKind::Spotify).is_some() {
        ProviderKind::Spotify
    } else {
        ProviderKind::SoundCloud
    }
}

// =========================================================================
// ПЕРСОНАЛЬНЫЕ МИКСЫ И EXPLORE ("ВОЗМОЖНО, ВАМ ПОНРАВИТСЯ") С SQLITE КЭШЕМ
// =========================================================================

pub const MIX_THEMES: &[(&str, &str)] = &[
    ("#c084fc", "#1e1b4b"), // MIX 1: Purple
    ("#60a5fa", "#172554"), // MIX 2: Blue
    ("#fde047", "#422006"), // MIX 3: Yellow
    ("#fb923c", "#431407"), // MIX 4: Orange
    ("#34d399", "#022c22"), // MIX 5: Emerald
    ("#f472b6", "#4c0519"), // MIX 6: Pink
    ("#38bdf8", "#082f49"), // MIX 7: Sky
    ("#a78bfa", "#2e1065"), // MIX 8: Indigo
    ("#4ade80", "#052e16"), // MIX 9: Light Green
    ("#f87171", "#450a0a"), // MIX 10: Coral Red
    ("#2dd4bf", "#042f2e"), // MIX 11: Teal
    ("#e879f9", "#3b0764"), // MIX 12: Fuchsia
];

#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MixItem {
    pub id: usize,
    pub pill_color: String,
    pub pill_text_color: String,
    pub title: String,
    pub artist: String,
    pub related_artists: Vec<String>,
    pub cover_url: Option<String>,
    pub tracks: Vec<TrackRef>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ExploreContent {
    pub artists: Vec<CollectionItem>,
    pub albums: Vec<CollectionItem>,
}


fn normalize_album_title(title: &str) -> String {
    title
        .trim()
        .to_lowercase()
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

pub fn balance_providers_organic(
    tracks: Vec<TrackRef>,
    target_count: usize,
    allowed: &[ProviderKind],
) -> Vec<TrackRef> {
    if tracks.is_empty() || allowed.is_empty() {
        return tracks.into_iter().take(target_count).collect();
    }

    let mut buckets: HashMap<ProviderKind, Vec<TrackRef>> = HashMap::new();
    let mut seen_keys = HashSet::new();

    for t in tracks {
        if !allowed.contains(&t.provider) {
            continue;
        }
        let sk = track_semantic_key(&t);
        if seen_keys.insert(sk) {
            buckets.entry(t.provider).or_default().push(t);
        }
    }

    let available_providers: Vec<ProviderKind> = allowed
        .iter()
        .copied()
        .filter(|p| buckets.get(p).map(|l| !l.is_empty()).unwrap_or(false))
        .collect();

    if available_providers.is_empty() {
        return Vec::new();
    }
    if available_providers.len() == 1 {
        let p = available_providers[0];
        return buckets.remove(&p).unwrap_or_default().into_iter().take(target_count).collect();
    }

    const MAX_PROVIDER_STREAK: usize = 2;

    let target_per_prov = (target_count + available_providers.len() - 1) / available_providers.len();
    let mut indices: HashMap<ProviderKind, usize> = HashMap::new();
    for &p in &available_providers {
        indices.insert(p, 0);
    }

    let mut result = Vec::new();
    let mut last_prov: Option<ProviderKind> = None;
    let mut current_streak = 0;
    let mut rng_seed = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(12345);

    let mut next_rand = move || -> usize {
        rng_seed = rng_seed.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        (rng_seed >> 32) as usize
    };

    while result.len() < target_count {
        let mut available: Vec<ProviderKind> = available_providers
            .iter()
            .copied()
            .filter(|p| {
                let cur = indices.get(p).copied().unwrap_or(0);
                let total = buckets.get(p).map(|l| l.len()).unwrap_or(0);
                cur < total && cur < target_per_prov
            })
            .collect();

        if available.is_empty() {
            available = available_providers
                .iter()
                .copied()
                .filter(|p| {
                    let cur = indices.get(p).copied().unwrap_or(0);
                    let total = buckets.get(p).map(|l| l.len()).unwrap_or(0);
                    cur < total
                })
                .collect();
        }

        if available.is_empty() {
            break;
        }

        // Если текущий провайдер исчерпал streak и есть альтернативы с доступными треками,
        // исключаем его из пула выбора на этом шаге
        let candidate_pool: Vec<ProviderKind> = if let Some(last) = last_prov {
            if current_streak >= MAX_PROVIDER_STREAK {
                let others: Vec<ProviderKind> = available.iter().copied().filter(|p| *p != last).collect();
                if !others.is_empty() {
                    others
                } else {
                    available.clone()
                }
            } else {
                available.clone()
            }
        } else {
            available.clone()
        };

        let next_prov = if candidate_pool.len() == 1 {
            candidate_pool[0]
        } else {
            let min_picks = candidate_pool.iter().map(|p| indices.get(p).copied().unwrap_or(0)).min().unwrap_or(0);
            let viable: Vec<ProviderKind> = candidate_pool
                .iter()
                .copied()
                .filter(|p| indices.get(p).copied().unwrap_or(0) == min_picks)
                .collect();
            let choices: Vec<ProviderKind> = if let Some(last) = last_prov {
                let others: Vec<ProviderKind> = viable.iter().copied().filter(|p| *p != last).collect();
                if !others.is_empty() { others } else { viable }
            } else {
                viable
            };
            choices[next_rand() % choices.len()]
        };

        if Some(next_prov) != last_prov {
            current_streak = 0;
            last_prov = Some(next_prov);
        }

        let list = buckets.get(&next_prov).unwrap();
        let cur_idx = indices.get(&next_prov).copied().unwrap_or(0);
        let remaining_in_bucket = list.len() - cur_idx;
        let remaining_to_target = target_count - result.len();
        let other_available_count = available_providers
            .iter()
            .filter(|p| **p != next_prov && indices.get(p).copied().unwrap_or(0) < buckets.get(p).map(|l| l.len()).unwrap_or(0))
            .count();

        let remaining_in_streak = if other_available_count > 0 {
            MAX_PROVIDER_STREAK.saturating_sub(current_streak).max(1)
        } else {
            remaining_to_target
        };

        let desired_burst = if other_available_count > 0 {
            (next_rand() % MAX_PROVIDER_STREAK) + 1 // 1 or 2
        } else {
            MAX_PROVIDER_STREAK
        };

        let quota_headroom = if other_available_count > 0 {
            target_per_prov.saturating_sub(cur_idx).max(1)
        } else {
            remaining_to_target
        };

        let min_other_active = available
            .iter()
            .filter(|p| **p != next_prov)
            .map(|p| indices.get(p).copied().unwrap_or(0))
            .min();

        let balance_headroom = if let Some(min_other) = min_other_active {
            (min_other + MAX_PROVIDER_STREAK).saturating_sub(cur_idx).max(1)
        } else {
            remaining_to_target
        };

        let max_burst = desired_burst
            .min(remaining_in_bucket)
            .min(remaining_to_target)
            .min(remaining_in_streak)
            .min(quota_headroom)
            .min(balance_headroom)
            .max(1);
        let burst = desired_burst.min(max_burst);

        for i in 0..burst {
            result.push(list[cur_idx + i].clone());
        }
        indices.insert(next_prov, cur_idx + burst);
        current_streak += burst;
    }

    result
}

static RECENT_SERVED_RECS: std::sync::Mutex<Option<Vec<String>>> = std::sync::Mutex::new(None);

fn remember_served_recs(keys: &[String]) {
    if let Ok(mut guard) = RECENT_SERVED_RECS.lock() {
        let list = guard.get_or_insert_with(Vec::new);
        for k in keys {
            if !list.contains(k) {
                list.push(k.clone());
            }
        }
        if list.len() > 64 {
            let overflow = list.len() - 64;
            list.drain(0..overflow);
        }
    }
}

fn get_recently_served_recs() -> HashSet<String> {
    if let Ok(guard) = RECENT_SERVED_RECS.lock() {
        if let Some(list) = guard.as_ref() {
            return list.iter().cloned().collect();
        }
    }
    HashSet::new()
}

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
    let allowed_providers = parse_provider_filter(provider_filter)
        .unwrap_or_else(|| providers.kinds().collect());
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

    let profile = WaveTasteProfile::build_from_storage(
        storage,
        &library,
        true,
        &[],
        now_ms,
    );

    // 2. Если пул кандидатов пуст или мал — собираем богатый пул (60-80 треков)
    if candidate_pool.len() < size.max(24) * 2 {
        let mut rng = (now_ms as u64).wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);

        // Взвешенный отбор сидов: делим артистов на Tier 1 (Core), Tier 2 (Rotation), Tier 3 (Recent)
        let mut seed_tracks = Vec::new();
        let mut seen_seed_artists = HashSet::new();

        // Tier 3: Недавние треки (до 3 разных артистов)
        let mut recent_candidates = Vec::new();
        for t in &profile.recent_tracks {
            let artist_key = clean_artist_name(&t.display_artist());
            if !artist_key.is_empty() && is_valid_artist_name(&artist_key) && !seen_seed_artists.contains(&artist_key) {
                recent_candidates.push((artist_key, t.clone()));
            }
        }
        let r_len = recent_candidates.len();
        for i in (1..r_len).rev() {
            rng = rng.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            let j = ((rng >> 32) as usize) % (i + 1);
            recent_candidates.swap(i, j);
        }
        for (a_key, t) in recent_candidates.into_iter().take(3) {
            if seen_seed_artists.insert(a_key) {
                seed_tracks.push(t);
            }
        }

        // Tier 1: Топ-5 артистов фонотеки (Core favorites)
        let mut tier1_artists: Vec<String> = profile.top_artists.iter().take(5).map(|(a, _)| a.clone()).collect();
        let t1_len = tier1_artists.len();
        for i in (1..t1_len).rev() {
            rng = rng.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            let j = ((rng >> 32) as usize) % (i + 1);
            tier1_artists.swap(i, j);
        }
        for artist in tier1_artists.into_iter().take(4) {
            let a_key = clean_artist_name(&artist);
            if !a_key.is_empty() && is_valid_artist_name(&a_key) && seen_seed_artists.insert(a_key.clone()) {
                if let Some(t) = library.iter().find(|tr| clean_artist_name(&tr.display_artist()) == a_key) {
                    seed_tracks.push(t.clone());
                }
            }
        }

        // Tier 2: Топ 6-15 артистов фонотеки (Rotation)
        let mut tier2_artists: Vec<String> = profile.top_artists.iter().skip(5).take(10).map(|(a, _)| a.clone()).collect();
        let t2_len = tier2_artists.len();
        for i in (1..t2_len).rev() {
            rng = rng.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            let j = ((rng >> 32) as usize) % (i + 1);
            tier2_artists.swap(i, j);
        }
        for artist in tier2_artists.into_iter().take(3) {
            if seed_tracks.len() >= 10 {
                break;
            }
            let a_key = clean_artist_name(&artist);
            if !a_key.is_empty() && is_valid_artist_name(&a_key) && seen_seed_artists.insert(a_key.clone()) {
                if let Some(t) = library.iter().find(|tr| clean_artist_name(&tr.display_artist()) == a_key) {
                    seed_tracks.push(t.clone());
                }
            }
        }

        // Если сидов всё ещё мало, добираем любые доступные из библиотеки
        if seed_tracks.len() < 6 {
            for t in &library {
                let a_key = clean_artist_name(&t.display_artist());
                if !a_key.is_empty() && is_valid_artist_name(&a_key) && seen_seed_artists.insert(a_key) {
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
                            timeout(Duration::from_millis(3000), provider.related(&seed_clone, 12))
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
                                timeout(Duration::from_millis(2500), provider.search(&collab_clone, None))
                                    .await
                                    .ok()
                                    .and_then(|r| r.ok())
                                    .map(|res| res.tracks.into_iter().take(4).collect::<Vec<TrackRef>>())
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
            }) > 0.0 {
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
                                timeout(Duration::from_millis(3000), provider_cloned.search(&artist_name, None))
                                    .await
                                    .ok()
                                    .and_then(|r| r.ok())
                                    .map(|res| res.tracks.into_iter().take(8).collect::<Vec<TrackRef>>())
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
            let _ = storage.set_cached_recommendation(&pool_cache_key, &serde_json::to_string(&candidate_pool)?);
        }
    }

    if candidate_pool.is_empty() {
        return Ok(Vec::new());
    }

    // 3. Динамическое сэмплирование и ранжирование из пула кандидатов
    let recently_served = get_recently_served_recs();
    let mut rng = (now_ms as u64).wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);

    let mut scored_candidates: Vec<(TrackRef, f64)> = candidate_pool
        .into_iter()
        .map(|t| {
            let sk = track_semantic_key(&t);
            let sim = profile.genre_profile.similarity(&t) - profile.genre_profile.alien_penalty(&t);
            let mut score = sim;

            // Штраф за недавний показ (Impression Cooldown): треки, показанные в прошлый раз, уступают место другим
            if recently_served.contains(&sk) {
                score -= 0.35;
            }

            // Мягкий шум для ротации треков с близким скором (-0.06..+0.06)
            rng = rng.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
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
                        timeout(Duration::from_millis(1800), provider.related(&seed_clone, 8))
                            .await
                            .ok()
                            .and_then(|r| r.ok())
                            .unwrap_or_default()
                    } else if let Some(artist) = artist_clone {
                        timeout(Duration::from_millis(1800), provider.search(&artist, None))
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
                    timeout(Duration::from_millis(1800), provider.search(&artist_clone, None))
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

    // 3. Скоринг и отбор с учетом ArtistDiversityGuard, Artist Exhaustion Penalty и Alien Penalty
    let last_played_artist = context
        .current_track
        .as_ref()
        .and_then(|t| t.artists.first())
        .map(|a| crate::wave::clean_artist_name(a))
        .or_else(|| {
            context.recent_played.last().and_then(|t| t.artists.first()).map(|a| crate::wave::clean_artist_name(a))
        });

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

            // Стохастический микро-джиттер для разнообразия между близкими по скору кандидатами
            let tie_breaker = {
                let bytes = sk.as_bytes();
                let hash_val = bytes.iter().fold(0u64, |acc, &b| acc.wrapping_mul(31).wrapping_add(b as u64));
                ((hash_val % 100) as f64) * 0.002
            };
            score += tie_breaker;

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
        if let Ok(library) = storage.library_tracks() {
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
    Ok(balanced)
}

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
            if let Ok(lib) = storage.library_tracks() {
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
        if let Ok(lib) = storage.library_tracks() {
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

    let mut full_queue = Vec::with_capacity(current_index + 1 + shuffle_res.interleaved_queue.len());
    full_queue.extend(current_queue[..=current_index].iter().cloned());
    full_queue.extend(shuffle_res.interleaved_queue);

    Ok(SmartShuffleResult {
        interleaved_queue: full_queue,
        injected_track_keys: shuffle_res.injected_track_keys,
    })
}

pub async fn get_or_generate_personal_mixes(
    storage: &Storage,
    providers: &ProviderRegistry,
    library: &[TrackRef],
    allowed_providers: &[ProviderKind],
    force_refresh: bool,
    include_playlists: bool,
    excluded_playlist_ids: &[String],
) -> Result<Vec<MixItem>> {
    let now_ms = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    // 1. Строим профиль вкуса по всей фонотеке, плейлистам и истории
    let profile = WaveTasteProfile::build_from_storage(
        storage,
        library,
        include_playlists,
        excluded_playlist_ids,
        now_ms,
    );

    // Если нет лайков и плейлистов — персональные миксы не генерируются
    if profile.top_artists.is_empty() {
        return Ok(Vec::new());
    }

    let mut prov_sorted: Vec<String> = allowed_providers
        .iter()
        .map(|p| p.as_str().to_string())
        .collect();
    prov_sorted.sort();
    let pl_suffix = if !include_playlists {
        "nopl".to_string()
    } else if !excluded_playlist_ids.is_empty() {
        format!("excl_{}", excluded_playlist_ids.len())
    } else {
        "allpl".to_string()
    };
    let pl_tracks_count: usize = if include_playlists {
        storage.list_playlists().map(|list| {
            list.into_iter()
                .filter(|p| !excluded_playlist_ids.iter().any(|id| id == &p.id.to_string()))
                .map(|p| p.tracks.len())
                .sum()
        }).unwrap_or(0)
    } else {
        0
    };
    let lib_count = library.len();
    let time_slot = if force_refresh {
        now_ms
    } else {
        now_ms / (1000 * 3600) // 1-часовой слот для ротации
    };
    let cache_key = format!("personal_mixes_v17_{}_{}_{}_{}_{}", prov_sorted.join("_"), lib_count, pl_tracks_count, pl_suffix, time_slot);

    if !force_refresh {
        if let Ok(Some(cached_json)) = storage.get_cached_recommendation(&cache_key, 3600) {
            if let Ok(mixes) = serde_json::from_str::<Vec<MixItem>>(&cached_json) {
                if mixes.len() == 12 && mixes.iter().all(|m| m.tracks.len() >= 8) {
                    return Ok(mixes);
                }
            }
        }
    }

    // 2. Отбираем ровно 12 хэдлайнеров с динамической ротацией (Core + Rotation + Collaborators)
    let mut rng = if force_refresh {
        now_ms as u64
    } else {
        (time_slot as u64).wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407)
    };

    let mut core_artists: Vec<String> = profile.top_artists.iter().take(4).map(|(a, _)| a.clone()).collect();
    let mut rotation_artists: Vec<String> = profile.top_artists.iter().skip(4).take(14).map(|(a, _)| a.clone()).collect();

    // Добавляем коллабораторов любимых артистов в пул ротации
    for (name, _) in profile.top_artists.iter().take(5) {
        if let Some(collabs) = profile.collaborator_map.get(name) {
            for c in collabs {
                if !core_artists.contains(c) && !rotation_artists.contains(c) {
                    rotation_artists.push(c.clone());
                }
            }
        }
    }

    // Перемешиваем core и rotation
    let c_len = core_artists.len();
    for i in (1..c_len).rev() {
        rng = rng.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        let j = ((rng >> 32) as usize) % (i + 1);
        core_artists.swap(i, j);
    }
    let r_len = rotation_artists.len();
    for i in (1..r_len).rev() {
        rng = rng.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
        let j = ((rng >> 32) as usize) % (i + 1);
        rotation_artists.swap(i, j);
    }

    let mut mix_seeds: Vec<String> = Vec::new();
    let mut seen_seeds = HashSet::new();

    // Первые слоты: Core артисты
    for a in core_artists {
        let lower = a.to_lowercase();
        if seen_seeds.insert(lower) {
            mix_seeds.push(a);
        }
    }
    // Остальные слоты (до 12): артисты ротации и коллабораторы
    for a in rotation_artists {
        let lower = a.to_lowercase();
        if seen_seeds.insert(lower) {
            mix_seeds.push(a);
            if mix_seeds.len() >= 12 {
                break;
            }
        }
    }

    if mix_seeds.is_empty() {
        return Ok(Vec::new());
    }

    let semaphore = Arc::new(Semaphore::new(8));
    let search_cache = Arc::new(tokio::sync::Mutex::new(HashMap::<(ProviderKind, String), Vec<TrackRef>>::new()));
    let mut mix_futures = Vec::new();

    for i in 0..12 {
        let artist_name = mix_seeds[i % mix_seeds.len()].clone();
        let theme = MIX_THEMES[i % MIX_THEMES.len()];
        let allowed = allowed_providers.to_vec();
        let profile_ref = profile.clone();
        let sem = semaphore.clone();
        let cache_ref = search_cache.clone();

        mix_futures.push(async move {
            let mut candidate_pool: Vec<TrackRef> = Vec::new();
            let mut seen_ids = HashSet::new();
            let mut seen_keys = HashSet::new();

            // СЛОЙ 1: 40% (~7 треков) ЯКОРЯ — Любимые треки хэдлайнера и прямых коллабораторов
            if let Some(liked) = profile_ref.artist_tracks.get(&artist_name) {
                for t in liked {
                    if allowed.contains(&t.provider) && seen_ids.insert(t.id.clone()) {
                        seen_keys.insert(track_semantic_key(t));
                        candidate_pool.push(t.clone());
                        if candidate_pool.len() >= 7 {
                            break;
                        }
                    }
                }
            }
            if candidate_pool.len() < 7 {
                if let Some(collabs) = profile_ref.collaborator_map.get(&artist_name) {
                    for collab_name in collabs {
                        if let Some(c_tracks) = profile_ref.artist_tracks.get(collab_name) {
                            for t in c_tracks {
                                if allowed.contains(&t.provider) && seen_ids.insert(t.id.clone()) {
                                    seen_keys.insert(track_semantic_key(t));
                                    candidate_pool.push(t.clone());
                                    if candidate_pool.len() >= 7 {
                                        break;
                                    }
                                }
                            }
                        }
                        if candidate_pool.len() >= 7 {
                            break;
                        }
                    }
                }
            }

            // СЛОЙ 2: 30% (~6 треков) ДИСКОГРАФИЯ — Неоткрытые треки хэдлайнера
            // Собираем кандидатов от каждого разрешенного провайдера
            let mut layer2_by_prov: HashMap<ProviderKind, Vec<TrackRef>> = HashMap::new();
            for &prov_kind in &allowed {
                if let Some(provider) = providers.get(prov_kind) {
                    let cache_key = (prov_kind, artist_name.to_lowercase());
                    let cached_res = {
                        let c = cache_ref.lock().await;
                        c.get(&cache_key).cloned()
                    };
                    let raw_tracks = if let Some(cached) = cached_res {
                        cached
                    } else {
                        let _permit = sem.acquire().await;
                        if let Ok(Ok(search_res)) = timeout(
                            Duration::from_millis(2500),
                            provider.search(&artist_name, None),
                        ).await {
                            let mut c = cache_ref.lock().await;
                            c.insert(cache_key, search_res.tracks.clone());
                            search_res.tracks
                        } else {
                            Vec::new()
                        }
                    };

                    let mut prov_tracks = Vec::new();
                    for t in raw_tracks {
                        if t.provider != prov_kind {
                            continue;
                        }
                        let sk = track_semantic_key(&t);
                        if !profile_ref.known_track_ids.contains(&t.id)
                            && !profile_ref.known_semantic_keys.contains(&sk)
                            && is_tracklike(&t)
                        {
                            prov_tracks.push(t);
                            if prov_tracks.len() >= 6 {
                                break;
                            }
                        }
                    }
                    if !prov_tracks.is_empty() {
                        layer2_by_prov.insert(prov_kind, prov_tracks);
                    }
                }
            }

            // Честное круговое распределение (round-robin) между всеми активными провайдерами
            let mut layer2_count = 0;
            let mut layer2_changed = true;
            while layer2_count < 6 && layer2_changed {
                layer2_changed = false;
                for &prov_kind in &allowed {
                    if let Some(list) = layer2_by_prov.get_mut(&prov_kind) {
                        if !list.is_empty() {
                            let t = list.remove(0);
                            let sk = track_semantic_key(&t);
                            if seen_ids.insert(t.id.clone()) && seen_keys.insert(sk) {
                                candidate_pool.push(t);
                                layer2_count += 1;
                                layer2_changed = true;
                                if layer2_count >= 6 {
                                    break;
                                }
                            }
                        }
                    }
                }
            }

            // Вычисляем акустический и жанровый профиль именно этого конкретного микса по трекам хэдлайнера
            let mix_genre_profile = WaveGenreProfile::from_tracks(&candidate_pool);

            // СЛОЙ 3: 30% (~6 треков) ОТКРЫТИЯ — Треки похожих артистов в том же жанре
            let partner_opt = profile_ref
                .collaborator_map
                .get(&artist_name)
                .and_then(|set| set.iter().next().cloned());

            if let Some(partner_name) = partner_opt {
                let mut layer3_by_prov: HashMap<ProviderKind, Vec<TrackRef>> = HashMap::new();
                for &prov_kind in &allowed {
                    if let Some(provider) = providers.get(prov_kind) {
                        let cache_key = (prov_kind, partner_name.to_lowercase());
                        let cached_res = {
                            let c = cache_ref.lock().await;
                            c.get(&cache_key).cloned()
                        };
                        let raw_tracks = if let Some(cached) = cached_res {
                            cached
                        } else {
                            let _permit = sem.acquire().await;
                            if let Ok(Ok(search_res)) = timeout(
                                Duration::from_millis(2500),
                                provider.search(&partner_name, None),
                            ).await {
                                let mut c = cache_ref.lock().await;
                                c.insert(cache_key, search_res.tracks.clone());
                                search_res.tracks
                            } else {
                                Vec::new()
                            }
                        };

                        let mut prov_tracks = Vec::new();
                        for t in raw_tracks {
                            if t.provider != prov_kind {
                                continue;
                            }
                            let sk = track_semantic_key(&t);
                            let genre_sim = if !mix_genre_profile.is_empty() {
                                mix_genre_profile.similarity(&t)
                            } else {
                                profile_ref.genre_profile.similarity(&t)
                            };
                            if !profile_ref.known_track_ids.contains(&t.id)
                                && !profile_ref.known_semantic_keys.contains(&sk)
                                && is_tracklike(&t)
                                && (genre_sim >= 0.22 || (mix_genre_profile.is_empty() && profile_ref.genre_profile.is_empty()))
                            {
                                prov_tracks.push(t);
                                if prov_tracks.len() >= 6 {
                                    break;
                                }
                            }
                        }
                        if !prov_tracks.is_empty() {
                            layer3_by_prov.insert(prov_kind, prov_tracks);
                        }
                    }
                }

                let mut layer3_count = 0;
                let mut layer3_changed = true;
                while layer3_count < 6 && layer3_changed {
                    layer3_changed = false;
                    for &prov_kind in &allowed {
                        if let Some(list) = layer3_by_prov.get_mut(&prov_kind) {
                            if !list.is_empty() {
                                let t = list.remove(0);
                                let sk = track_semantic_key(&t);
                                if seen_ids.insert(t.id.clone()) && seen_keys.insert(sk) {
                                    candidate_pool.push(t);
                                    layer3_count += 1;
                                    layer3_changed = true;
                                    if layer3_count >= 6 {
                                        break;
                                    }
                                }
                            }
                        }
                    }
                }
            }

            // Добор из фонотеки ТОЛЬКО релевантных треков того же жанра (исключает чужие жанры вроде рэпа в брейккоре)
            if candidate_pool.len() < 15 {
                for (other_artist, other_tracks) in &profile_ref.artist_tracks {
                    if other_artist != &artist_name {
                        for t in other_tracks {
                            if !allowed.contains(&t.provider) {
                                continue;
                            }
                            let genre_sim = if !mix_genre_profile.is_empty() {
                                mix_genre_profile.similarity(t)
                            } else {
                                profile_ref.genre_profile.similarity(t)
                            };
                            if genre_sim < 0.22 && (!mix_genre_profile.is_empty() || !profile_ref.genre_profile.is_empty()) {
                                continue;
                            }
                            let sk = track_semantic_key(t);
                            if seen_ids.insert(t.id.clone()) && seen_keys.insert(sk) {
                                candidate_pool.push(t.clone());
                                if candidate_pool.len() >= 18 {
                                    break;
                                }
                            }
                        }
                    }
                    if candidate_pool.len() >= 18 {
                        break;
                    }
                }
            }

            // Органическое чередование по платформам (серии по 1-3 трека)
            let organic_tracks = balance_providers_organic(candidate_pool, 18, &allowed);

            let mut sub_artists = Vec::new();
            for t in &organic_tracks {
                for a in &t.artists {
                    if !sub_artists.contains(a) && sub_artists.len() < 4 {
                        sub_artists.push(a.clone());
                    }
                }
            }

            let cover_url = organic_tracks.iter().find_map(|t| t.artwork_url.as_ref().map(|u| u.to_string()));
            MixItem {
                id: i + 1,
                pill_color: theme.0.to_string(),
                pill_text_color: theme.1.to_string(),
                title: format!("MIX {}", i + 1),
                artist: artist_name.clone(),
                related_artists: sub_artists,
                cover_url,
                tracks: organic_tracks,
            }
        });
    }

    let mixes = join_all(mix_futures).await;

    if let Ok(json) = serde_json::to_string(&mixes) {
        let _ = storage.set_cached_recommendation(&cache_key, &json);
    }

    Ok(mixes)
}

pub async fn get_or_generate_explore_content(
    storage: &Storage,
    providers: &ProviderRegistry,
    library: &[TrackRef],
    allowed_providers: &[ProviderKind],
    force_refresh: bool,
    include_playlists: bool,
    excluded_playlist_ids: &[String],
) -> Result<ExploreContent> {
    let now_ms = SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    // 1. Строим профиль вкуса пользователя
    let profile = WaveTasteProfile::build_from_storage(
        storage,
        library,
        include_playlists,
        excluded_playlist_ids,
        now_ms,
    );

    // Если нет лайков и плейлистов — рекомендации не генерируются
    if profile.top_artists.is_empty() {
        return Ok(ExploreContent {
            albums: Vec::new(),
            artists: Vec::new(),
        });
    }

    let mut prov_sorted: Vec<String> = allowed_providers
        .iter()
        .map(|p| p.as_str().to_string())
        .collect();
    prov_sorted.sort();
    let pl_suffix = if !include_playlists {
        "nopl".to_string()
    } else if !excluded_playlist_ids.is_empty() {
        format!("excl_{}", excluded_playlist_ids.len())
    } else {
        "allpl".to_string()
    };
    let pl_tracks_count: usize = if include_playlists {
        storage.list_playlists().map(|list| {
            list.into_iter()
                .filter(|p| !excluded_playlist_ids.iter().any(|id| id == &p.id.to_string()))
                .map(|p| p.tracks.len())
                .sum()
        }).unwrap_or(0)
    } else {
        0
    };
    let lib_count = library.len();
    let hour_slot = if force_refresh {
        now_ms
    } else {
        now_ms / (1000 * 1800) // 30-минутный временной слот ротации
    };
    let cache_key = format!("explore_content_v18_{}_{}_{}_{}_{}", prov_sorted.join("_"), lib_count, pl_tracks_count, pl_suffix, hour_slot);

    if !force_refresh {
        if let Ok(Some(cached_json)) = storage.get_cached_recommendation(&cache_key, 1800) {
            if let Ok(content) = serde_json::from_str::<ExploreContent>(&cached_json) {
                if !content.albums.is_empty() || !content.artists.is_empty() {
                    return Ok(content);
                }
            }
        }
    }

    // 2. Отбираем артистов для рекомендаций:
    // Широкий пул: соавторы любимых исполнителей + топовые артисты фонотеки
    let mut candidate_artists: Vec<String> = Vec::new();
    let mut seen_all = HashSet::new();

    for (name, _) in &profile.top_artists {
        if let Some(collabs) = profile.collaborator_map.get(name) {
            for c in collabs {
                let clean = c.trim();
                let lower = clean.to_lowercase();
                if is_valid_artist_name(clean)
                    && !profile.liked_artist_ids.contains(&lower)
                    && seen_all.insert(lower)
                {
                    candidate_artists.push(clean.to_string());
                }
            }
        }
    }

    // Добираем топ-артистов фонотеки
    for (name, _) in &profile.top_artists {
        let lower = name.to_lowercase();
        if is_valid_artist_name(name) && seen_all.insert(lower) {
            candidate_artists.push(name.clone());
        }
    }

    if candidate_artists.is_empty() {
        return Ok(ExploreContent {
            albums: Vec::new(),
            artists: Vec::new(),
        });
    }

    // Ротация кандидатов на основе временного слота: выдача меняется динамически
    if candidate_artists.len() > 14 {
        let mut rng = if force_refresh {
            now_ms as u64
        } else {
            hour_slot as u64
        };
        let len = candidate_artists.len();
        for i in (1..len).rev() {
            rng = rng.wrapping_mul(6364136223846793005).wrapping_add(1442695040888963407);
            let j = ((rng >> 32) as usize) % (i + 1);
            candidate_artists.swap(i, j);
        }
    }
    let target_artists: Vec<String> = candidate_artists.into_iter().take(14).collect();

    let sem_permits = if allowed_providers.len() == 1 { 3 } else { 8 };
    let semaphore = Arc::new(Semaphore::new(sem_permits));
    let prov_list: Vec<(ProviderKind, Arc<dyn MusicProvider>)> = allowed_providers
        .iter()
        .filter_map(|&k| providers.get(k).map(|p| (k, p)))
        .collect();

    let mut tasks = Vec::new();

    for artist_name in target_artists {
        let prov_list = prov_list.clone();
        let sem = semaphore.clone();
        tasks.push(async move {
            let artist_sub_futures = prov_list.iter().map(|&(_prov_kind, ref provider)| {
                let sem = sem.clone();
                let artist_name = artist_name.clone();
                let provider = provider.clone();
                async move {
                    let _permit = sem.acquire().await.ok()?;
                    let artists = timeout(
                        Duration::from_millis(3500),
                        provider.search_collections(&artist_name, CollectionKind::Artist),
                    ).await.ok()?.ok()?;
                    for item in &artists {
                        let title_lower = item.title.trim().to_lowercase();
                        let target_lower = artist_name.trim().to_lowercase();
                        let is_match = title_lower == target_lower
                            || title_lower.starts_with(&target_lower)
                            || target_lower.starts_with(&title_lower);
                        if is_match {
                            return Some(item.clone());
                        }
                    }
                    artists.into_iter().next()
                }
            });
            let matched_artists: Vec<CollectionItem> = join_all(artist_sub_futures).await.into_iter().flatten().collect();

            let album_sub_futures = prov_list.iter().map(|&(_prov_kind, ref provider)| {
                let sem = sem.clone();
                let artist_name = artist_name.clone();
                let provider = provider.clone();
                async move {
                    let _permit = sem.acquire().await.ok()?;
                    let albums = timeout(
                        Duration::from_millis(3500),
                        provider.search_collections(&artist_name, CollectionKind::Album),
                    ).await.ok()?.ok()?;
                    let mut found = Vec::new();
                    for item in albums {
                        if item.track_count > 0 {
                            found.push(item);
                            if found.len() >= 2 {
                                break;
                            }
                        }
                    }
                    Some(found)
                }
            });
            let matched_albums: Vec<CollectionItem> = join_all(album_sub_futures).await.into_iter().flatten().flatten().collect();

            (artist_name, matched_artists, matched_albums)
        });
    }

    let results = join_all(tasks).await;

    let mut artist_items = Vec::new();
    let mut album_items = Vec::new();
    let mut seen_artist_names = HashSet::new();
    let mut seen_album_keys = HashSet::new();
    let mut prov_artist_counts: HashMap<ProviderKind, usize> = HashMap::new();

    for (artist_name, mut matched_artists, albums) in results {
        let normalized_artist = artist_name.trim().to_lowercase();
        if !seen_artist_names.insert(normalized_artist.clone()) {
            continue;
        }

        // Выбираем единственную лучшую карточку артиста (приоритет студийных метаданных + баланс провайдеров)
        if !matched_artists.is_empty() {
            matched_artists.sort_by_key(|item| {
                let t = artist_name.trim().to_lowercase();
                let c = item.title.trim().to_lowercase();
                let match_score = if t == c { 100 } else { 50 };
                let quality_score = match item.provider {
                    ProviderKind::Deezer => 35,
                    ProviderKind::Spotify => 30,
                    ProviderKind::YandexMusic => 20,
                    ProviderKind::SoundCloud => 10,
                    ProviderKind::YouTubeMusic => 5,
                };
                let count = prov_artist_counts.get(&item.provider).copied().unwrap_or(0) as i32;
                std::cmp::Reverse(match_score + quality_score - (count * 15))
            });

            let best_artist = matched_artists.remove(0);
            *prov_artist_counts.entry(best_artist.provider).or_default() += 1;
            artist_items.push(best_artist);
        }

        // Альбомы этого артиста
        let mut per_artist_albums = 0;
        for item in albums {
            let clean_title = normalize_album_title(&item.title);
            let album_key = format!("{}:{}", normalized_artist, clean_title);
            if !clean_title.is_empty() && seen_album_keys.insert(album_key) {
                album_items.push(item);
                per_artist_albums += 1;
                if per_artist_albums >= 2 {
                    break;
                }
            }
        }
    }

    if artist_items.is_empty() {
        let fallback_prov = allowed_providers.first().copied().unwrap_or(ProviderKind::Spotify);
        for (artist_name, _) in profile.top_artists.iter().take(12) {
            artist_items.push(CollectionItem {
                kind: CollectionKind::Artist,
                provider: fallback_prov,
                id: format!("artist_{}", artist_name.to_lowercase()),
                title: artist_name.clone(),
                subtitle: "Исполнитель".to_string(),
                artwork_url: None,
                web_url: url::Url::parse("https://open.spotify.com").unwrap(),
                track_count: 0,
            });
        }
    }

    let balanced_albums = balance_collections(album_items, 12, allowed_providers);
    let balanced_artists = balance_collections(artist_items, 12, allowed_providers);

    let content = ExploreContent {
        albums: balanced_albums,
        artists: balanced_artists,
    };

    if let Ok(json) = serde_json::to_string(&content) {
        let _ = storage.set_cached_recommendation(&cache_key, &json);
    }

    Ok(content)
}

fn balance_collections(
    items: Vec<CollectionItem>,
    target_count: usize,
    allowed: &[ProviderKind],
) -> Vec<CollectionItem> {
    if items.is_empty() || allowed.is_empty() {
        return items.into_iter().take(target_count).collect();
    }

    let mut by_prov: HashMap<ProviderKind, Vec<CollectionItem>> = HashMap::new();
    for item in items {
        by_prov.entry(item.provider).or_default().push(item);
    }

    let mut result = Vec::new();
    let mut changed = true;
    while result.len() < target_count && changed {
        changed = false;
        for prov in allowed {
            if let Some(list) = by_prov.get_mut(prov) {
                if !list.is_empty() {
                    result.push(list.remove(0));
                    changed = true;
                    if result.len() >= target_count {
                        break;
                    }
                }
            }
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_test_track(provider: ProviderKind, id: &str, title: &str, artist: &str) -> TrackRef {
        TrackRef {
            provider,
            id: id.to_string(),
            title: title.to_string(),
            artists: vec![artist.to_string()],
            duration_ms: Some(180_000),
            artwork_url: None,
            web_url: url::Url::parse("https://example.com").unwrap(),
            capability: crate::model::PlaybackCapability::Full,
            genres: Vec::new(),
            explicit: false,
            drm: false,
            isrc: None,
            origin: crate::model::TrackOrigin::Original,
        }
    }

    #[test]
    fn balance_providers_organic_interleaves_without_starving_and_limits_streak() {
        let allowed = [ProviderKind::Spotify, ProviderKind::SoundCloud, ProviderKind::Deezer];
        let mut tracks = Vec::new();
        for i in 0..10 {
            tracks.push(make_test_track(ProviderKind::Spotify, &format!("sp_{i}"), &format!("SP Track {i}"), "Carti"));
        }
        for i in 0..10 {
            tracks.push(make_test_track(ProviderKind::SoundCloud, &format!("sc_{i}"), &format!("SC Track {i}"), "Kai"));
        }
        for i in 0..10 {
            tracks.push(make_test_track(ProviderKind::Deezer, &format!("dz_{i}"), &format!("DZ Track {i}"), "Travis"));
        }

        let balanced = balance_providers_organic(tracks, 18, &allowed);
        assert_eq!(balanced.len(), 18);

        let mut current_streak = 0;
        let mut last_prov = None;
        for t in &balanced {
            if Some(t.provider) == last_prov {
                current_streak += 1;
                assert!(current_streak <= 3, "Provider streak must not exceed 3 (got {current_streak})");
            } else {
                current_streak = 1;
                last_prov = Some(t.provider);
            }
        }

        let sp_count = balanced.iter().filter(|t| t.provider == ProviderKind::Spotify).count();
        let sc_count = balanced.iter().filter(|t| t.provider == ProviderKind::SoundCloud).count();
        let dz_count = balanced.iter().filter(|t| t.provider == ProviderKind::Deezer).count();
        assert!(sp_count >= 3, "Spotify must get a fair share, got {sp_count}");
        assert!(sc_count >= 3, "SoundCloud must get a fair share, got {sc_count}");
        assert!(dz_count >= 3, "Deezer must get a fair share, got {dz_count}");
    }

    #[test]
    fn artist_validation_and_junk_detection() {
        assert!(is_valid_artist_name("Playboi Carti"));
        assert!(is_valid_artist_name("Kai Angel"));
        assert!(is_valid_artist_name("9mice"));
        assert!(!is_valid_artist_name("Various Artists"));
        assert!(!is_valid_artist_name("SoundCloud"));
        assert!(!is_valid_artist_name("trap leaks podcast"));
    }

    #[test]
    fn tracklike_filter_rejects_podcasts_and_videos() {
        let good_track = make_test_track(ProviderKind::Spotify, "1", "FEIN", "Travis Scott");
        assert!(crate::wave::is_tracklike(&good_track));

        let podcast = make_test_track(ProviderKind::SoundCloud, "2", "Episode 12: Politics Podcast", "News Radio");
        assert!(!crate::wave::is_tracklike(&podcast));

        let video = make_test_track(ProviderKind::YouTubeMusic, "3", "Song Title (Official Video)", "Artist");
        assert!(!crate::wave::is_tracklike(&video));
    }

    #[test]
    fn genre_profile_scores_similar_tracks() {
        let library = vec![
            make_test_track(ProviderKind::Spotify, "1", "Stop Breathing (Rage Rap)", "Playboi Carti"),
            make_test_track(ProviderKind::SoundCloud, "2", "Heavy Metal Trap", "Kai Angel"),
        ];
        let profile = WaveGenreProfile::from_tracks(&library);
        assert!(!profile.is_empty());

        let matching = make_test_track(ProviderKind::Spotify, "3", "Dark Trap Rap", "Ken Carson");
        assert!(profile.similarity(&matching) > 0.0);
    }

    #[test]
    fn balance_collections_preserves_uniqueness_and_interleaves() {
        let allowed = [ProviderKind::Deezer, ProviderKind::Spotify, ProviderKind::SoundCloud];
        let dummy_url = url::Url::parse("https://example.com").unwrap();
        let items = vec![
            CollectionItem {
                id: "dz1".into(),
                provider: ProviderKind::Deezer,
                kind: CollectionKind::Artist,
                title: "Kai Angel".into(),
                subtitle: "Artist".into(),
                artwork_url: None,
                web_url: dummy_url.clone(),
                track_count: 0,
            },
            CollectionItem {
                id: "sp1".into(),
                provider: ProviderKind::Spotify,
                kind: CollectionKind::Artist,
                title: "Evanescence".into(),
                subtitle: "Artist".into(),
                artwork_url: None,
                web_url: dummy_url.clone(),
                track_count: 0,
            },
            CollectionItem {
                id: "sc1".into(),
                provider: ProviderKind::SoundCloud,
                kind: CollectionKind::Artist,
                title: "damnenby".into(),
                subtitle: "Artist".into(),
                artwork_url: None,
                web_url: dummy_url.clone(),
                track_count: 0,
            },
            CollectionItem {
                id: "dz2".into(),
                provider: ProviderKind::Deezer,
                kind: CollectionKind::Artist,
                title: "9mice".into(),
                subtitle: "Artist".into(),
                artwork_url: None,
                web_url: dummy_url.clone(),
                track_count: 0,
            },
        ];

        let balanced = balance_collections(items, 4, &allowed);
        assert_eq!(balanced.len(), 4);
        let names: HashSet<_> = balanced.iter().map(|item| item.title.as_str()).collect();
        assert_eq!(names.len(), 4, "Every artist must be unique in the balanced row");
    }

    #[test]
    fn provider_filter_preserves_order_and_sets_primary() {
        let spotify_first = parse_provider_filter(Some("spotify,soundcloud")).unwrap();
        assert_eq!(spotify_first, vec![ProviderKind::Spotify, ProviderKind::SoundCloud]);
        assert_eq!(spotify_first[0], ProviderKind::Spotify, "First specified provider must be primary");

        let soundcloud_first = parse_provider_filter(Some("soundcloud,spotify")).unwrap();
        assert_eq!(soundcloud_first, vec![ProviderKind::SoundCloud, ProviderKind::Spotify]);
        assert_eq!(soundcloud_first[0], ProviderKind::SoundCloud, "First specified provider must be primary");

        let single = parse_provider_filter(Some("spotify")).unwrap();
        assert_eq!(single, vec![ProviderKind::Spotify]);

        let all = parse_provider_filter(Some("all"));
        assert!(all.is_none(), "All should map to None (all available)");
    }

    #[test]
    fn balance_providers_two_providers_fair_quota_and_strict_streak() {
        let allowed = [ProviderKind::SoundCloud, ProviderKind::Spotify];
        let mut tracks = Vec::new();
        for i in 0..12 {
            tracks.push(make_test_track(ProviderKind::SoundCloud, &format!("sc_{i}"), &format!("SC {i}"), "Artist SC"));
        }
        for i in 0..12 {
            tracks.push(make_test_track(ProviderKind::Spotify, &format!("sp_{i}"), &format!("SP {i}"), "Artist SP"));
        }

        let balanced = balance_providers_organic(tracks, 16, &allowed);
        assert_eq!(balanced.len(), 16);

        let sc_count = balanced.iter().filter(|t| t.provider == ProviderKind::SoundCloud).count();
        let sp_count = balanced.iter().filter(|t| t.provider == ProviderKind::Spotify).count();
        assert_eq!(sc_count, 8, "SoundCloud should get exactly 50% fair share (8/16)");
        assert_eq!(sp_count, 8, "Spotify should get exactly 50% fair share (8/16)");

        let mut current_streak = 0;
        let mut last_prov = None;
        for t in &balanced {
            if Some(t.provider) == last_prov {
                current_streak += 1;
                assert!(current_streak <= 2, "Streak with alternative candidates must be <= 2, got {current_streak}");
            } else {
                current_streak = 1;
                last_prov = Some(t.provider);
            }
        }
    }

    #[test]
    fn balance_providers_handles_provider_exhaustion_without_panic() {
        let allowed = [ProviderKind::SoundCloud, ProviderKind::Spotify];
        let mut tracks = Vec::new();
        for i in 0..10 {
            tracks.push(make_test_track(ProviderKind::SoundCloud, &format!("sc_{i}"), &format!("SC {i}"), "Artist SC"));
        }
        for i in 0..2 {
            tracks.push(make_test_track(ProviderKind::Spotify, &format!("sp_{i}"), &format!("SP {i}"), "Artist SP"));
        }

        let balanced = balance_providers_organic(tracks, 10, &allowed);
        assert_eq!(balanced.len(), 10);
        let sp_count = balanced.iter().filter(|t| t.provider == ProviderKind::Spotify).count();
        assert_eq!(sp_count, 2, "Spotify tracks should all be included");
        let sc_count = balanced.iter().filter(|t| t.provider == ProviderKind::SoundCloud).count();
        assert_eq!(sc_count, 8, "Remaining slots taken by SoundCloud without panic or empty slots");
    }
}