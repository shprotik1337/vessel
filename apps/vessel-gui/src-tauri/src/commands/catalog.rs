use vessel_core::model::{SearchProvider, TrackRef};

use super::common::{lock, provider_kind_from_str, CoreState};

#[tauri::command]
pub async fn search(
    core: CoreState<'_>,
    query: String,
    provider: Option<String>,
) -> Result<crate::SearchOutcome, String> {
    let registry = {
        let core = lock(&core);
        core.runtime.provider_registry()
    };
    if registry.is_empty() {
        return Err(
            "Сначала добавь SoundCloud client_id или Yandex OAuth в Настройках".to_string(),
        );
    }
    let query = query.trim().to_string();
    if query.is_empty() {
        return Ok(crate::SearchOutcome {
            tracks: Vec::new(),
            failures: Vec::new(),
        });
    }
    let selection = match provider.as_deref() {
        None | Some("all") => SearchProvider::All,
        Some("soundcloud") => SearchProvider::SoundCloud,
        Some("yandex") => SearchProvider::YandexMusic,
        Some("deezer") => SearchProvider::Deezer,
        Some("spotify") => SearchProvider::Spotify,
        Some("youtube_music") => SearchProvider::YouTubeMusic,
        Some(other) => return Err(format!("неизвестный провайдер: {other}")),
    };
    let pages = registry.search(&query, selection).await;
    let (tracks, failures) = vessel_core::runtime::merge_pages(pages);
    Ok(crate::SearchOutcome { tracks, failures })
}

#[tauri::command]
pub async fn search_collections(
    core: CoreState<'_>,
    query: String,
    kind: String,
    provider: Option<String>,
) -> Result<Vec<vessel_core::provider::CollectionItem>, String> {
    use vessel_core::provider::CollectionKind;
    let kind = match kind.as_str() {
        "playlists" | "playlist" => CollectionKind::Playlist,
        "albums" | "album" => CollectionKind::Album,
        "artists" | "artist" => CollectionKind::Artist,
        other => return Err(format!("неизвестный тип коллекции: {other}")),
    };
    let query = query.trim().to_string();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let (registry, filter_kinds) = {
        let core = lock(&core);
        let registry = core.runtime.provider_registry();
        let pref = core
            .config
            .recommendation_providers
            .as_deref()
            .or(core.config.wave_providers.as_deref());
        let kinds = vessel_core::recommendation::parse_provider_filter(pref);
        (registry, kinds)
    };
    if registry.is_empty() {
        return Err("Сначала добавь ключ провайдера в Настройках".to_string());
    }
    let target_kind = match provider.as_deref().map(str::trim).filter(|s| !s.is_empty() && *s != "all") {
        Some(s) => Some(provider_kind_from_str(s)?),
        None => None,
    };
    let all_kinds = [
        vessel_core::model::ProviderKind::Spotify,
        vessel_core::model::ProviderKind::SoundCloud,
        vessel_core::model::ProviderKind::Deezer,
        vessel_core::model::ProviderKind::YandexMusic,
        vessel_core::model::ProviderKind::YouTubeMusic,
    ];
    let kinds: Vec<vessel_core::model::ProviderKind> = if let Some(tk) = target_kind {
        if registry.get(tk).is_some() {
            vec![tk]
        } else {
            return Ok(Vec::new());
        }
    } else {
        match filter_kinds {
            Some(explicit) => explicit
                .into_iter()
                .filter(|k| registry.get(*k).is_some())
                .collect(),
            _ => all_kinds
                .into_iter()
                .filter(|k| registry.get(*k).is_some())
                .collect(),
        }
    };
    if kinds.is_empty() {
        return Ok(Vec::new());
    }
    let take_count = if target_kind.is_some() { 24 } else { 6 };
    let query = query.clone();
    let jobs = kinds
        .into_iter()
        .filter_map(|kind| registry.get(kind).map(|provider| (kind, provider)))
        .map(|(provider_kind, provider)| {
            let query = query.clone();
            async move {
                match provider.search_collections(&query, kind).await {
                    Ok(found) => {
                        vessel_core::dlog!(
                            "[search_collections] {provider_kind:?} {kind:?}: {} шт.",
                            found.len()
                        );
                        found
                    }
                    Err(error) => {
                        vessel_core::dlog!("[search_collections] {provider_kind:?}: {error:#}");
                        Vec::new()
                    }
                }
            }
        })
        .collect::<Vec<_>>();
    let raw_results = futures_util::future::join_all(jobs).await;
    let results: Vec<Vec<_>> = raw_results
        .into_iter()
        .map(|list| {
            list.into_iter()
                .filter(|item| item.kind == vessel_core::provider::CollectionKind::Artist || item.track_count != 0 || !item.title.is_empty())
                .take(take_count)
                .collect()
        })
        .collect();
    let mut items = Vec::new();
    let max_len = results.iter().map(|r| r.len()).max().unwrap_or(0);
    for idx in 0..max_len {
        for list in &results {
            if let Some(item) = list.get(idx) {
                items.push(item.clone());
            }
        }
    }
    vessel_core::dlog!("[search_collections] итого {} для '{}' ({kind:?})", items.len(), query);
    Ok(items)
}

#[tauri::command]
pub async fn artist_profile(
    core: CoreState<'_>,
    provider: String,
    artist_id: String,
) -> Result<vessel_core::provider::ArtistProfile, String> {
    let kind = provider_kind_from_str(&provider)?;
    let registry = {
        let core = lock(&core);
        core.runtime.provider_registry()
    };
    let provider_impl = registry
        .get(kind)
        .ok_or_else(|| "провайдер не подключён".to_string())?;
    provider_impl
        .artist_profile(artist_id.trim())
        .await
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
pub async fn artist_all_tracks(
    core: CoreState<'_>,
    provider: String,
    artist_id: String,
) -> Result<Vec<TrackRef>, String> {
    let kind = provider_kind_from_str(&provider)?;
    let registry = {
        let core = lock(&core);
        core.runtime.provider_registry()
    };
    let provider_impl = registry
        .get(kind)
        .ok_or_else(|| "провайдер не подключён".to_string())?;
    provider_impl
        .artist_all_tracks(artist_id.trim())
        .await
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
pub async fn get_related(
    core: CoreState<'_>,
    track: TrackRef,
    limit: Option<usize>,
) -> Result<Vec<TrackRef>, String> {
    let registry = {
        let core = lock(&core);
        core.runtime.provider_registry()
    };
    let Some(provider) = registry.get(track.provider) else {
        return Err("провайдер трека не подключён".to_string());
    };
    provider
        .related(&track, limit.unwrap_or(20))
        .await
        .map_err(|e| format!("{e:#}"))
}

/// Возвращает рекомендации для «Моей волны» / пустого Search.
/// source: "favorites" | "playlists".
/// Если source == "playlists" и передан playlist_id — волна строится из треков этого плейлиста.
/// providers: "all" или "soundcloud,deezer,yandex,spotify".
#[tauri::command]
pub async fn get_wave_recommendations(
    core: CoreState<'_>,
    source: String,
    size: Option<usize>,
    playlist_id: Option<uuid::Uuid>,
    providers: Option<String>,
) -> Result<Vec<TrackRef>, String> {
    let (registry, storage, wave_config, excluded_playlists, include_playlists) = {
        let core = lock(&core);
        (
            core.runtime.provider_registry(),
            core.storage.clone(),
            core.config.wave_providers.clone(),
            core.config.excluded_recommendation_playlist_ids.clone(),
            true,
        )
    };
    if registry.is_empty() {
        return Err("Сначала добавь SoundCloud client_id или Yandex OAuth в Настройках".to_string());
    }
    let src = vessel_core::recommendation::RecommendationSource::normalize(&source);
    let explicit_filter = providers.as_deref().filter(|s| !s.trim().is_empty());
    let filter = explicit_filter.or(wave_config.as_deref());
    let result = if src == vessel_core::recommendation::RecommendationSource::Playlists {
        if let Some(pid) = playlist_id {
            vessel_core::recommendation::recommend_from_playlist(&registry, &storage, pid, size.unwrap_or(20), filter).await
        } else {
            vessel_core::recommendation::recommend(&registry, &storage, src, size.unwrap_or(20), filter, include_playlists, &excluded_playlists).await
        }
    } else {
        vessel_core::recommendation::recommend(&registry, &storage, src, size.unwrap_or(20), filter, include_playlists, &excluded_playlists).await
    };
    Ok(result.tracks)
}

/// Текущий выбранный источник «Моей волны» ("favorites" | "playlists").
#[tauri::command]
pub async fn get_wave_source(core: CoreState<'_>) -> Result<String, String> {
    let core = lock(&core);
    Ok(core
        .config
        .wave_source
        .clone()
        .unwrap_or_else(|| "favorites".to_string()))
}

/// Сохраняет выбранный источник «Моей волны».
#[tauri::command]
pub async fn set_wave_source(core: CoreState<'_>, source: String) -> Result<(), String> {
    let mut core = lock(&core);
    let normalized = vessel_core::recommendation::RecommendationSource::normalize(&source).as_str();
    core.config.wave_source = Some(normalized.to_string());
    core.app.config_dirty = true;
    Ok(())
}

/// Выбранные провайдеры «Моей волны» ("all" или "soundcloud,deezer,yandex,spotify").
#[tauri::command]
pub async fn get_wave_providers(core: CoreState<'_>) -> Result<String, String> {
    let core = lock(&core);
    Ok(core.config.wave_providers.clone().unwrap_or_else(|| "all".to_string()))
}

/// Сохраняет выбранные провайдеры «Моей волны».
#[tauri::command]
pub async fn set_wave_providers(core: CoreState<'_>, providers: String) -> Result<(), String> {
    let mut core = lock(&core);
    let normalized = if providers.trim().is_empty() {
        "all".to_string()
    } else {
        providers.trim().to_string()
    };
    core.config.wave_providers = Some(normalized.clone());
    core.config.recommendation_providers = Some(normalized);
    core.app.config_dirty = true;
    Ok(())
}

/// Выбранные провайдеры для рекомендаций в поиске (отдельно от волны).
#[tauri::command]
pub async fn get_recommendation_providers(core: CoreState<'_>) -> Result<String, String> {
    let core = lock(&core);
    Ok(core
        .config
        .recommendation_providers
        .clone()
        .unwrap_or_else(|| "all".to_string()))
}

/// Сохраняет выбранные провайдеры для рекомендаций в поиске.
#[tauri::command]
pub async fn set_recommendation_providers(core: CoreState<'_>, providers: String) -> Result<(), String> {
    let mut core = lock(&core);
    let normalized = if providers.trim().is_empty() {
        "all".to_string()
    } else {
        providers.trim().to_string()
    };
    core.config.recommendation_providers = Some(normalized);
    core.app.config_dirty = true;
    Ok(())
}

#[tauri::command]
pub async fn get_include_playlists_in_recommendations(core: CoreState<'_>) -> Result<bool, String> {
    let core = lock(&core);
    Ok(core.config.include_playlists_in_recommendations)
}

#[tauri::command]
pub async fn set_include_playlists_in_recommendations(core: CoreState<'_>, enabled: bool) -> Result<(), String> {
    let mut core = lock(&core);
    core.config.include_playlists_in_recommendations = enabled;
    core.app.config_dirty = true;
    Ok(())
}

#[tauri::command]
pub async fn get_excluded_recommendation_playlists(core: CoreState<'_>) -> Result<Vec<String>, String> {
    let core = lock(&core);
    Ok(core.config.excluded_recommendation_playlist_ids.clone())
}

#[tauri::command]
pub async fn toggle_playlist_taste_exclusion(core: CoreState<'_>, playlist_id: String) -> Result<bool, String> {
    let mut core = lock(&core);
    let target = playlist_id.trim();
    let is_now_excluded = if let Some(pos) = core.config.excluded_recommendation_playlist_ids.iter().position(|id| id == target) {
        core.config.excluded_recommendation_playlist_ids.remove(pos);
        false
    } else {
        core.config.excluded_recommendation_playlist_ids.push(target.to_string());
        true
    };
    core.app.config_dirty = true;
    Ok(is_now_excluded)
}

#[tauri::command]
pub async fn get_personal_mixes(
    core: CoreState<'_>,
    force_refresh: Option<bool>,
    providers: Option<String>,
) -> Result<Vec<vessel_core::recommendation::MixItem>, String> {
    let (registry, storage, rec_config, library, include_pl, excl_pl) = {
        let core = lock(&core);
        (
            core.runtime.provider_registry(),
            core.storage.clone(),
            core.config.recommendation_providers.clone(),
            core.app.library.clone(),
            true,
            core.config.excluded_recommendation_playlist_ids.clone(),
        )
    };
    let explicit_filter = providers.as_deref().filter(|s| !s.trim().is_empty());
    let filter = explicit_filter.or(rec_config.as_deref());
    let allowed_providers = vessel_core::recommendation::parse_provider_filter(filter)
        .unwrap_or_else(|| registry.kinds().collect());
    vessel_core::recommendation::get_or_generate_personal_mixes(
        &storage,
        &registry,
        &library,
        &allowed_providers,
        force_refresh.unwrap_or(false),
        include_pl,
        &excl_pl,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_explore_content(
    core: CoreState<'_>,
    force_refresh: Option<bool>,
    providers: Option<String>,
) -> Result<vessel_core::recommendation::ExploreContent, String> {
    let (registry, storage, rec_config, library, include_pl, excl_pl) = {
        let core = lock(&core);
        (
            core.runtime.provider_registry(),
            core.storage.clone(),
            core.config.recommendation_providers.clone(),
            core.app.library.clone(),
            true,
            core.config.excluded_recommendation_playlist_ids.clone(),
        )
    };
    let explicit_filter = providers.as_deref().filter(|s| !s.trim().is_empty());
    let filter = explicit_filter.or(rec_config.as_deref());
    let allowed_providers = vessel_core::recommendation::parse_provider_filter(filter)
        .unwrap_or_else(|| registry.kinds().collect());
    vessel_core::recommendation::get_or_generate_explore_content(
        &storage,
        &registry,
        &library,
        &allowed_providers,
        force_refresh.unwrap_or(false),
        include_pl,
        &excl_pl,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_home_recommendations(
    core: CoreState<'_>,
    size: Option<usize>,
    force_refresh: Option<bool>,
    providers: Option<String>,
) -> Result<Vec<TrackRef>, String> {
    let (registry, storage, rec_config) = {
        let core = lock(&core);
        (
            core.runtime.provider_registry(),
            core.storage.clone(),
            core.config.recommendation_providers.clone(),
        )
    };
    let explicit_filter = providers.as_deref().filter(|s| !s.trim().is_empty());
    let filter = explicit_filter.or(rec_config.as_deref());
    vessel_core::recommendation::generate_home_recommendations(
        &storage,
        &registry,
        size.unwrap_or(24),
        filter,
        force_refresh.unwrap_or(false),
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_next_autoplay_chunk(
    core: CoreState<'_>,
    context: vessel_core::wave::QueueContext,
    size: Option<usize>,
    providers: Option<String>,
) -> Result<Vec<TrackRef>, String> {
    let (registry, storage, rec_config) = {
        let core = lock(&core);
        (
            core.runtime.provider_registry(),
            core.storage.clone(),
            core.config.recommendation_providers.clone(),
        )
    };
    let explicit_filter = providers.as_deref().filter(|s| !s.trim().is_empty());
    let filter = explicit_filter.or(rec_config.as_deref());
    vessel_core::recommendation::generate_autoplay_chunk(
        &storage,
        &registry,
        context,
        size.unwrap_or(8),
        filter,
    )
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn apply_smart_shuffle(
    core: CoreState<'_>,
    current_queue: Vec<TrackRef>,
    current_index: usize,
    providers: Option<String>,
) -> Result<vessel_core::wave::SmartShuffleResult, String> {
    let (registry, storage, rec_config) = {
        let core = lock(&core);
        (
            core.runtime.provider_registry(),
            core.storage.clone(),
            core.config.recommendation_providers.clone(),
        )
    };
    let explicit_filter = providers.as_deref().filter(|s| !s.trim().is_empty());
    let filter = explicit_filter.or(rec_config.as_deref());
    let res = vessel_core::recommendation::apply_smart_shuffle(
        &storage,
        &registry,
        current_queue,
        current_index,
        filter,
    )
    .await
    .map_err(|e| e.to_string())?;

    // Синхронизируем очередь в core.app (без изменения состояния обычного shuffle)
    {
        let mut core = lock(&core);
        if core.app.unshuffled_queue.is_none() && !core.app.queue.is_empty() {
            core.app.unshuffled_queue = Some(core.app.queue.clone());
        }
        let now_key = core.app.now_playing.as_ref().map(|t| t.provider_key());
        if let Some(now_key) = now_key {
            if let Some(pos) = res.interleaved_queue.iter().position(|t| t.provider_key() == now_key) {
                core.app.queue_index = Some(pos);
            }
        }
        core.app.queue = res.interleaved_queue.clone();
        core.app.queue_dirty = true;
    }

    Ok(res)
}

