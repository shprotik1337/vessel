use std::time::SystemTime;

use crate::{
    model::{ProviderKind, TrackRef},
    provider::ProviderRegistry,
    storage::Storage,
    wave::{
        WaveGenerationRequest, WaveMode, WaveSettings, WaveSourceMode, generate_wave, track_key,
    },
};

pub mod autoplay;
pub mod home;
pub mod mixes;
pub mod scoring;
pub mod smart_shuffle;

#[cfg(test)]
mod tests;

pub use autoplay::generate_autoplay_chunk;
pub use home::generate_home_recommendations;
pub use mixes::{
    ExploreContent, MIX_THEMES, MixItem, get_or_generate_explore_content,
    get_or_generate_personal_mixes,
};
pub use scoring::{balance_collections, balance_providers_organic};
pub use smart_shuffle::apply_smart_shuffle;

#[cfg(test)]
pub use scoring::clear_smart_shuffle_memory_for_tests;

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
    if kinds.is_empty() { None } else { Some(kinds) }
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
    let primary_provider = provider_priority
        .first()
        .copied()
        .unwrap_or(primary_provider);
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

pub fn load_playlist_tracks(storage: &Storage, excluded_playlist_ids: &[String]) -> Vec<TrackRef> {
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
