use std::{collections::HashMap, time::Duration};

use tokio::time::{Instant, timeout_at};

use crate::{
    model::{ProviderKind, TrackRef},
    provider::ProviderRegistry,
    storage::HistoryEntry,
};

use super::{
    WaveCandidateOrigin, WaveGenreProfile, WaveMode, WaveQueueQuotas, WaveRankInput, WaveSettings,
    WaveSourceMode, WaveTasteProfile, explore_queries, pool::CandidatePool, rank_candidates,
    recent_title_keywords, seeds::build_seeds, select_ranked, text::normalize_search_text,
    track_key,
};

pub struct WaveGenerationRequest {
    pub settings: WaveSettings,
    pub history: Vec<HistoryEntry>,
    pub liked: Vec<(TrackRef, i64)>,
    pub playlist_tracks: Vec<TrackRef>,
    pub manual_seeds: Vec<TrackRef>,
    pub manual_seed_only: bool,
    pub preview: bool,
    pub now_ms: i64,
}

#[derive(Clone, Debug, Default)]
pub struct WaveGeneration {
    pub tracks: Vec<TrackRef>,
    pub failures: Vec<String>,
}

pub async fn generate_wave(
    providers: &ProviderRegistry,
    request: WaveGenerationRequest,
) -> WaveGeneration {
    let settings = request.settings.normalized(request.preview);
    let profile = WaveTasteProfile::build(
        &request.history,
        &request.liked,
        &request.playlist_tracks,
        request.now_ms,
    );
    let seeds = build_seeds(
        &profile,
        &request.liked,
        &request.playlist_tracks,
        &request.manual_seeds,
        request.manual_seed_only,
        &settings,
    );
    let genre_profile = WaveGenreProfile::from_tracks(&seeds.tracks);
    let deadline = Instant::now() + Duration::from_secs(if request.preview { 4 } else { 8 });
    let target_pool_size = if request.preview {
        settings.size.saturating_mul(4).clamp(32, 96)
    } else {
        settings.size.saturating_mul(8).clamp(120, 480)
    };
    let native_related = settings.source_mode != WaveSourceMode::LibraryOnly
        && !settings.mixed_providers
        && !seeds.tracks.is_empty()
        && matches!(
            settings.primary_provider,
            ProviderKind::YandexMusic
                | ProviderKind::SoundCloud
                | ProviderKind::Spotify
                | ProviderKind::Deezer
                | ProviderKind::YouTubeMusic
        );
    let candidate_target = if native_related {
        if request.preview {
            settings.size.saturating_mul(3).clamp(24, 72)
        } else {
            settings.size.saturating_mul(4).clamp(48, 160)
        }
    } else {
        target_pool_size
    };
    let mut pool = CandidatePool::default();
    let mut failures = Vec::new();

    if !request.preview
        && settings.primary_provider == ProviderKind::YandexMusic
        && settings.source_mode != WaveSourceMode::LibraryOnly
        && request.manual_seeds.is_empty()
        && let Some(provider) = providers.get(ProviderKind::YandexMusic)
    {
        let target = settings.size.saturating_mul(4).clamp(32, 120);
        match timeout_at(deadline, provider.personal_wave(target)).await {
            Ok(Ok(tracks)) => pool.extend(
                tracks,
                WaveCandidateOrigin::YandexPersonal,
                candidate_target,
            ),
            Ok(Err(error)) => push_failure(&mut failures, provider.kind(), &error),
            Err(_) => push_timeout(&mut failures, provider.kind()),
        }
    }

    if settings.source_mode != WaveSourceMode::LibraryOnly && !native_related {
        for chunk in seeds.artist_names.chunks(3) {
            if Instant::now() >= deadline || pool.len() >= candidate_target {
                break;
            }
            let mut search_futs = Vec::new();
            for name in chunk {
                search_futs.push(async {
                    let mut local_pool = CandidatePool::default();
                    let mut local_fails = Vec::new();
                    collect_search_order(
                        providers,
                        &settings,
                        name,
                        24,
                        deadline,
                        &mut local_pool,
                        WaveCandidateOrigin::Seed,
                        candidate_target,
                        &mut local_fails,
                    )
                    .await;
                    (local_pool, local_fails)
                });
            }
            let results = futures_util::future::join_all(search_futs).await;
            for (local_pool, local_fails) in results {
                pool.merge(local_pool, candidate_target);
                failures.extend(local_fails);
                if pool.len() >= candidate_target {
                    break;
                }
            }
        }
    }

    if settings.source_mode != WaveSourceMode::LibraryOnly {
        collect_related(
            providers,
            &settings,
            &seeds.tracks,
            request.manual_seeds.is_empty(),
            native_related,
            deadline,
            &mut pool,
            candidate_target,
            &mut failures,
        )
        .await;
    }

    let explore = if settings.source_mode == WaveSourceMode::LibraryOnly
        || native_related
        || request.manual_seed_only
    {
        Vec::new()
    } else {
        explore_queries(&profile.recent_tracks, &settings)
    };
    if settings.source_mode != WaveSourceMode::LibraryOnly && !native_related {
        let per_query = ((settings.size as f64) * (0.15 + settings.novelty * 0.95))
            .round()
            .clamp(6.0, 28.0) as usize;
        for chunk in explore.chunks(3) {
            if Instant::now() >= deadline || pool.len() >= candidate_target {
                break;
            }
            let mut explore_futs = Vec::new();
            for query in chunk {
                explore_futs.push(async {
                    let mut local_pool = CandidatePool::default();
                    let mut local_fails = Vec::new();
                    collect_search_order(
                        providers,
                        &settings,
                        query,
                        per_query,
                        deadline,
                        &mut local_pool,
                        WaveCandidateOrigin::Explore,
                        candidate_target,
                        &mut local_fails,
                    )
                    .await;
                    (local_pool, local_fails)
                });
            }
            let results = futures_util::future::join_all(explore_futs).await;
            for (local_pool, local_fails) in results {
                pool.merge(local_pool, candidate_target);
                failures.extend(local_fails);
                if pool.len() >= candidate_target {
                    break;
                }
            }
        }
    }

    if (settings.mode == WaveMode::Favorites || settings.source_mode == WaveSourceMode::LibraryOnly)
        && !request.manual_seed_only
    {
        let allowed = settings.provider_order();
        pool.extend(
            comfort_tracks(&request.history, &request.liked, 80, &allowed),
            WaveCandidateOrigin::Comfort,
            candidate_target.max(80),
        );
    }

    if settings.source_mode != WaveSourceMode::LibraryOnly && pool.len() < settings.size {
        let mut backfill = seeds.artist_names.clone();
        backfill.extend(recent_title_keywords(&profile.recent_tracks, 6));
        backfill.extend(explore.iter().take(6).cloned());
        if backfill.is_empty() {
            backfill.push("popular music".to_string());
        }
        let mut seen_queries = Vec::<String>::new();
        for query in backfill {
            if seen_queries
                .iter()
                .any(|current| current.eq_ignore_ascii_case(&query))
            {
                continue;
            }
            seen_queries.push(query.clone());
            collect_search_order(
                providers,
                &settings,
                &query,
                24,
                deadline,
                &mut pool,
                WaveCandidateOrigin::Backfill,
                candidate_target,
                &mut failures,
            )
            .await;
            if pool.len() >= settings.size || Instant::now() >= deadline {
                break;
            }
        }
    }

    let ranked = rank_candidates(WaveRankInput {
        candidates: pool.into_candidates(),
        profile: &profile,
        genre_profile: &genre_profile,
        settings: &settings,
        now_ms: request.now_ms,
        exclude_track_keys: &Default::default(),
        exclude_artist_ids: &Default::default(),
        strict_seed_artist_ids: &seeds.strict_artist_ids,
    });
    let quotas = WaveQueueQuotas::calculate(settings.size, settings.mode, settings.novelty);
    let tracks = select_ranked(ranked, &settings, quotas)
        .into_iter()
        .map(|item| item.track)
        .collect();
    WaveGeneration { tracks, failures }
}

#[allow(clippy::too_many_arguments)]
async fn collect_related(
    providers: &ProviderRegistry,
    settings: &WaveSettings,
    seeds: &[TrackRef],
    automatic_seeds: bool,
    native_related: bool,
    deadline: Instant,
    pool: &mut CandidatePool,
    candidate_target: usize,
    failures: &mut Vec<String>,
) {
    let target = if native_related {
        ((settings.size as f64) * (0.85 + (1.0 - settings.novelty) * 0.55))
            .round()
            .clamp(16.0, 72.0) as usize
    } else {
        ((settings.size as f64) * (0.18 + settings.novelty * 0.82))
            .round()
            .clamp(8.0, 48.0) as usize
    };
    let seed_limit = if native_related {
        if automatic_seeds { 10 } else { 12 }
    } else if automatic_seeds {
        4
    } else {
        10
    };
    let mut seeds_processed = 0usize;
    for seed in seeds.iter().take(seed_limit) {
        if Instant::now() >= deadline {
            break;
        }
        if !settings.mixed_providers && pool.len() >= candidate_target * 2 && seeds_processed >= 6 {
            break;
        }
        if settings.mixed_providers {
            let provider_count = settings.provider_order().len().max(1);
            let per_cap = (candidate_target / provider_count).max(8);
            if settings.provider_order().iter().all(|k| pool.provider_count(*k) >= per_cap) && seeds_processed >= 6 {
                break;
            }
        }
        seeds_processed += 1;
        if !settings.mixed_providers && native_related && seed.provider != settings.primary_provider {
            let query = format!("{} {}", seed.display_artist(), seed.title);
            if let Some(provider) = providers.get(settings.primary_provider) {
                if let Ok(Ok(page)) = timeout_at(deadline, provider.search(&query, None)).await {
                    if let Some(matched) = page.tracks.into_iter().next() {
                        let related_res = timeout_at(deadline, provider.related(&matched, target.min(64))).await;
                        if let Ok(Ok(rel_tracks)) = related_res
                            && !rel_tracks.is_empty()
                        {
                            let capped: Vec<TrackRef> = rel_tracks.into_iter().take(8).collect();
                            pool.extend(capped, WaveCandidateOrigin::Related, candidate_target * 2);
                        }
                        pool.extend(vec![matched], WaveCandidateOrigin::Related, candidate_target * 2);
                        if pool.len() >= candidate_target * 2 && seeds_processed >= 6 {
                            break;
                        }
                    }
                }
            }
            continue;
        }
        for kind in related_provider_order(settings, seed.provider) {
            let Some(provider) = providers.get(kind) else {
                continue;
            };
            let provider_cap = if settings.mixed_providers {
                let provider_count = settings.provider_order().len().max(1);
                Some((candidate_target / provider_count).max(8))
            } else {
                None
            };
            let result = if kind == seed.provider {
                timeout_at(deadline, provider.related(seed, target.min(64))).await
            } else {
                // Кросс-провайдерный запрос: семя от другого сервиса.
                // Ищем эквивалент на целевом провайдере и получаем его нативный related!
                let query = format!("{} {}", seed.display_artist(), seed.title);
                if let Ok(Ok(page)) = timeout_at(deadline, provider.search(&query, None)).await {
                    if let Some(matched) = page.tracks.into_iter().next() {
                        let rel_res = timeout_at(deadline, provider.related(&matched, target.min(64))).await;
                        match rel_res {
                            Ok(Ok(rel_tracks)) if !rel_tracks.is_empty() => Ok(Ok(rel_tracks)),
                            _ => Ok(Ok(vec![matched])),
                        }
                    } else {
                        Ok(Ok(Vec::new()))
                    }
                } else {
                    Ok(Ok(Vec::new()))
                }
            };
            match result {
                Ok(Ok(tracks)) if !tracks.is_empty() => {
                    if settings.mixed_providers {
                        pool.extend_balanced(
                            tracks,
                            WaveCandidateOrigin::Related,
                            candidate_target * 2,
                            provider_cap,
                        );
                    } else {
                        pool.extend(tracks, WaveCandidateOrigin::Related, candidate_target * 2);
                    }
                }
                Ok(Ok(_)) => {
                    let query = format!("{} {}", seed.display_artist(), seed.title);
                    collect_search_provider(
                        providers,
                        kind,
                        &query,
                        target.min(24),
                        deadline,
                        pool,
                        WaveCandidateOrigin::Related,
                        candidate_target,
                        provider_cap,
                        failures,
                    )
                    .await;
                }
                Ok(Err(error)) => push_failure(failures, kind, &error),
                Err(_) => push_timeout(failures, kind),
            }
        }
    }
}

#[allow(clippy::too_many_arguments)]
async fn collect_search_order(
    providers: &ProviderRegistry,
    settings: &WaveSettings,
    query: &str,
    target: usize,
    deadline: Instant,
    pool: &mut CandidatePool,
    origin: WaveCandidateOrigin,
    candidate_target: usize,
    failures: &mut Vec<String>,
) {
    let provider_count = settings.provider_order().len().max(1);
    for (index, kind) in settings.provider_order().into_iter().enumerate() {
        let before = pool.len();
        let per_target = if settings.mixed_providers {
            // при смешивании — каждому провайдеру своя доля
            (target / provider_count).max(6)
        } else {
            target
        };
        let provider_cap = if settings.mixed_providers {
            Some((candidate_target / provider_count).max(8))
        } else {
            None
        };
        collect_search_provider(
            providers,
            kind,
            query,
            per_target,
            deadline,
            pool,
            origin,
            candidate_target,
            provider_cap,
            failures,
        )
        .await;
        // для смешанного режима не прерываемся после первого провайдера
        if !settings.mixed_providers && index == 0 && pool.len() > before {
            break;
        }
    }
}

#[allow(clippy::too_many_arguments)]
async fn collect_search_provider(
    providers: &ProviderRegistry,
    kind: ProviderKind,
    query: &str,
    target: usize,
    deadline: Instant,
    pool: &mut CandidatePool,
    origin: WaveCandidateOrigin,
    candidate_target: usize,
    provider_cap: Option<usize>,
    failures: &mut Vec<String>,
) {
    let Some(provider) = providers.get(kind) else {
        return;
    };
    for variant in query_variants(query, kind) {
        if Instant::now() >= deadline || pool.len() >= candidate_target {
            break;
        }
        match timeout_at(deadline, provider.search(&variant, None)).await {
            Ok(Ok(page)) => pool.extend_balanced(
                page.tracks.into_iter().take(target),
                origin,
                candidate_target,
                provider_cap,
            ),
            Ok(Err(error)) => push_failure(failures, kind, &error),
            Err(_) => push_timeout(failures, kind),
        }
    }
}

fn query_variants(query: &str, kind: ProviderKind) -> Vec<String> {
    let base = query.trim();
    if base.is_empty() {
        return Vec::new();
    }
    let mut variants = vec![base.to_string()];
    let normalized = normalize_search_text(base);
    if !normalized.is_empty() && normalized != base {
        variants.push(normalized);
    }
    let lower = base.to_ascii_lowercase();
    if kind == ProviderKind::SoundCloud && !lower.contains("music") && !lower.contains("музык")
    {
        variants.push(format!("{base} music"));
    }
    variants.truncate(3);
    variants
}

fn related_provider_order(settings: &WaveSettings, seed: ProviderKind) -> Vec<ProviderKind> {
    let allowed = settings.provider_order();
    if settings.mixed_providers {
        let mut order = Vec::new();
        if allowed.contains(&seed) {
            order.push(seed);
        }
        for provider in allowed {
            if !order.contains(&provider) {
                order.push(provider);
            }
        }
        if order.is_empty() {
            return vec![settings.primary_provider];
        }
        return order;
    }
    if settings.source_mode == WaveSourceMode::CurrentService {
        return vec![settings.primary_provider];
    }
    let mut order = Vec::new();
    if allowed.contains(&seed) {
        order.push(seed);
    }
    for provider in allowed {
        if !order.contains(&provider) {
            order.push(provider);
        }
    }
    if order.is_empty() {
        vec![settings.primary_provider]
    } else {
        order
    }
}

fn comfort_tracks(
    history: &[HistoryEntry],
    liked: &[(TrackRef, i64)],
    limit: usize,
    allowed_providers: &[ProviderKind],
) -> Vec<TrackRef> {
    let mut result = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for (track, _) in liked {
        if (allowed_providers.is_empty() || allowed_providers.contains(&track.provider))
            && seen.insert(track_key(track))
        {
            result.push(track.clone());
        }
        if result.len() >= limit {
            return result;
        }
    }
    let mut counted = HashMap::<String, (TrackRef, usize, i64)>::new();
    for entry in history {
        if !allowed_providers.is_empty() && !allowed_providers.contains(&entry.track.provider) {
            continue;
        }
        let key = track_key(&entry.track);
        counted
            .entry(key)
            .and_modify(|value| {
                value.1 += 1;
                value.2 = value.2.max(entry.played_at_ms);
            })
            .or_insert((entry.track.clone(), 1, entry.played_at_ms));
    }
    let mut history_tracks = counted.into_values().collect::<Vec<_>>();
    history_tracks.sort_by(|left, right| right.1.cmp(&left.1).then_with(|| right.2.cmp(&left.2)));
    for (track, _, _) in history_tracks {
        if seen.insert(track_key(&track)) {
            result.push(track);
        }
        if result.len() >= limit {
            break;
        }
    }
    result
}

fn push_failure(failures: &mut Vec<String>, provider: ProviderKind, error: &anyhow::Error) {
    let message = format!("{}: {error}", provider.label());
    if !failures.contains(&message) {
        failures.push(message);
    }
}

fn push_timeout(failures: &mut Vec<String>, provider: ProviderKind) {
    let message = format!("{}: превышено время ожидания", provider.label());
    if !failures.contains(&message) {
        failures.push(message);
    }
}

#[cfg(test)]
mod tests {
    use std::sync::{
        Arc,
        atomic::{AtomicUsize, Ordering},
    };

    use anyhow::{Result, bail};
    use async_trait::async_trait;
    use url::Url;

    use crate::{
        model::{PlaybackCapability, PlaybackSource},
        provider::{Attribution, ImportedPlaylist, MusicProvider, SearchPage},
    };

    use super::*;

    struct FakeProvider {
        searches: Arc<AtomicUsize>,
        related: Arc<AtomicUsize>,
    }

    #[async_trait]
    impl MusicProvider for FakeProvider {
        fn kind(&self) -> ProviderKind {
            ProviderKind::SoundCloud
        }

        fn attribution(&self) -> Attribution {
            Attribution {
                label: "test".to_string(),
                url: Url::parse("https://soundcloud.com").unwrap(),
            }
        }

        async fn search(&self, _query: &str, _cursor: Option<&str>) -> Result<SearchPage> {
            self.searches.fetch_add(1, Ordering::Relaxed);
            Ok(SearchPage {
                tracks: (0..20)
                    .map(|index| {
                        track(
                            &format!("search-{index}"),
                            &format!("Search Artist {index}"),
                        )
                    })
                    .collect(),
                next_cursor: None,
            })
        }

        async fn import_playlist(&self, _url: &Url) -> Result<ImportedPlaylist> {
            bail!("не нужен")
        }

        async fn related(&self, _track: &TrackRef, _limit: usize) -> Result<Vec<TrackRef>> {
            self.related.fetch_add(1, Ordering::Relaxed);
            Ok((0..20)
                .map(|index| {
                    track(
                        &format!("related-{index}"),
                        &format!("Related Artist {index}"),
                    )
                })
                .collect())
        }

        async fn playback_source(&self, _track: &TrackRef) -> Result<PlaybackSource> {
            bail!("не нужен")
        }
    }

    #[tokio::test]
    async fn generator_uses_native_related_before_search_like_pc() {
        let searches = Arc::new(AtomicUsize::new(0));
        let related = Arc::new(AtomicUsize::new(0));
        let mut providers = ProviderRegistry::default();
        providers.register(FakeProvider {
            searches: Arc::clone(&searches),
            related: Arc::clone(&related),
        });
        let now = 2_000_000_000_000;
        let generation = generate_wave(
            &providers,
            WaveGenerationRequest {
                settings: WaveSettings {
                    primary_provider: ProviderKind::SoundCloud,
                    size: 10,
                    ..WaveSettings::default()
                },
                history: vec![HistoryEntry {
                    track: track("seed", "Seed Artist"),
                    played_at_ms: now - 25 * 3_600_000,
                    completed: true,
                    skipped: false,
                }],
                liked: Vec::new(),
                playlist_tracks: Vec::new(),
                manual_seeds: Vec::new(),
                manual_seed_only: false,
                preview: false,
                now_ms: now,
            },
        )
        .await;
        assert_eq!(generation.tracks.len(), 10);
        assert_eq!(related.load(Ordering::Relaxed), 1);
        assert_eq!(searches.load(Ordering::Relaxed), 0);
        assert!(generation.failures.is_empty());
    }

    #[tokio::test]
    async fn empty_history_falls_back_to_popular_search() {
        let searches = Arc::new(AtomicUsize::new(0));
        let mut providers = ProviderRegistry::default();
        providers.register(FakeProvider {
            searches: Arc::clone(&searches),
            related: Arc::new(AtomicUsize::new(0)),
        });
        let generation = generate_wave(
            &providers,
            WaveGenerationRequest {
                settings: WaveSettings {
                    primary_provider: ProviderKind::SoundCloud,
                    size: 10,
                    ..WaveSettings::default()
                },
                history: Vec::new(),
                liked: Vec::new(),
                playlist_tracks: Vec::new(),
                manual_seeds: Vec::new(),
                manual_seed_only: false,
                preview: false,
                now_ms: 2_000_000_000_000,
            },
        )
        .await;
        assert_eq!(generation.tracks.len(), 10);
        assert!(searches.load(Ordering::Relaxed) > 0);
    }

    fn track(id: &str, artist: &str) -> TrackRef {
        TrackRef {
            provider: ProviderKind::SoundCloud,
            id: id.to_string(),
            title: format!("Track {id}"),
            artists: vec![artist.to_string()],
            duration_ms: Some(180_000),
            artwork_url: None,
            web_url: Url::parse(&format!("https://soundcloud.com/test/{id}")).unwrap(),
            capability: PlaybackCapability::Full,
            genres: Vec::new(),
            explicit: false,
            drm: false,
            isrc: None,
            origin: crate::model::TrackOrigin::Original,
            album_url: None,
            album_title: None,
        }
    }
}
