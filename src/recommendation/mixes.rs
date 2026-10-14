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
    provider::{CollectionItem, CollectionKind, MusicProvider, ProviderRegistry},
    storage::Storage,
    wave::{
        is_tracklike, is_valid_artist_name, track_semantic_key, WaveGenreProfile,
        WaveTasteProfile,
    },
};

use super::scoring::{balance_collections, balance_providers_organic, normalize_album_title};

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
