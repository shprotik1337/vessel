use std::time::SystemTime;

use crate::{
    model::{ProviderKind, TrackRef},
    provider::ProviderRegistry,
    storage::Storage,
    wave::{WaveGenerationRequest, WaveMode, WaveSettings, WaveSourceMode, generate_wave, track_key},
};

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub enum RecommendationSource {
    #[default]
    Favorites,
    Playlists,
}

impl RecommendationSource {
    pub fn normalize(value: &str) -> Self {
        match value.trim().to_ascii_lowercase().as_str() {
            "playlists" | "playlist" => Self::Playlists,
            _ => Self::Favorites,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Favorites => "favorites",
            Self::Playlists => "playlists",
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
///
/// `provider_filter` — строка с выбранными провайдерами ("all" или "soundcloud,deezer,yandex").
pub async fn recommend(
    providers: &ProviderRegistry,
    storage: &Storage,
    source: RecommendationSource,
    size: usize,
    provider_filter: Option<&str>,
) -> RecommendationResult {
    let manual_seeds = load_manual_seeds(storage, source);
    let manual_seed_only =
        matches!(source, RecommendationSource::Playlists) && !manual_seeds.is_empty();
    run(
        providers,
        storage,
        source,
        size,
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
    run(
        providers,
        storage,
        RecommendationSource::Playlists,
        size,
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

    // Смешиваем выбранные провайдеры (SoundCloud + Deezer + Yandex + Spotify),
    // чтобы волна собиралась из разных источников.
    let explicit = parse_provider_filter(provider_filter);
    let has_explicit = explicit.is_some();
    let mut provider_priority = match explicit {
        Some(kinds) => kinds,
        None => providers.kinds().collect::<Vec<_>>(),
    };
    // Если юзер явно выбрал провайдеров — не подмешиваем primary (иначе
    // при выборе только Deezer всё равно добавится SoundCloud).
    if !has_explicit && !provider_priority.contains(&primary_provider) {
        provider_priority.insert(0, primary_provider);
    }
    // Оставляем только реально подключённые провайдеры
    provider_priority.retain(|kind| providers.get(*kind).is_some());
    provider_priority.sort_by_key(|kind| match kind {
        ProviderKind::SoundCloud => 0,
        ProviderKind::YandexMusic => 1,
        ProviderKind::Deezer => 2,
        ProviderKind::Spotify => 3,
        ProviderKind::YouTubeMusic => 4,
    });

    let mut settings = WaveSettings {
        primary_provider,
        size: size.clamp(10, 80),
        mode: WaveMode::Balanced,
        source_mode: WaveSourceMode::CurrentService,
        novelty: 0.35,
        anti_repeat_hours: 24,
        max_plays: 2,
        play_window_days: 7,
        max_artist_streak: 2,
        provider_priority: provider_priority.clone(),
        mixed_providers: has_explicit || provider_priority.len() > 1,
        ..Default::default()
    };

    if source == RecommendationSource::Favorites {
        settings.mode = WaveMode::Favorites;
    }

    let result = generate_wave(
        providers,
        WaveGenerationRequest {
            settings,
            history,
            liked,
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

fn load_manual_seeds(storage: &Storage, source: RecommendationSource) -> Vec<TrackRef> {
    if source != RecommendationSource::Playlists {
        return Vec::new();
    }
    let Ok(playlists) = storage.list_playlists() else {
        return Vec::new();
    };
    let mut seen = std::collections::HashSet::new();
    let mut tracks = Vec::new();
    for playlist in &playlists {
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