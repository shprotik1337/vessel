use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use vessel_core::{
    credentials::CredentialKind,
    model::{Playlist, RepeatMode, SearchProvider, TrackRef},
    secrets::SecretKey,
    storage::HistoryEntry,
};
use serde::Serialize;
use tauri::{AppHandle, Manager, State, WebviewUrl, WebviewWindowBuilder};

use crate::GuiCore;

type CoreState<'a> = State<'a, Arc<Mutex<GuiCore>>>;

fn lock<'a>(core: &'a CoreState<'a>) -> std::sync::MutexGuard<'a, GuiCore> {
    core.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn provider_kind_from_str(value: &str) -> Result<vessel_core::model::ProviderKind, String> {
    use vessel_core::model::ProviderKind;
    match value {
        "soundcloud" | "sound_cloud" => Ok(ProviderKind::SoundCloud),
        "yandex" | "yandex_music" => Ok(ProviderKind::YandexMusic),
        "deezer" => Ok(ProviderKind::Deezer),
        "spotify" => Ok(ProviderKind::Spotify),
        "youtube_music" | "you_tube_music" | "youtube" => Ok(ProviderKind::YouTubeMusic),
        _ => Err(format!("РЅРµРёР·РІРµСЃС‚РЅС‹Р№ РїСЂРѕРІР°Р№РґРµСЂ: {value}")),
    }
}

fn credential_kind_from_str(value: &str) -> Result<CredentialKind, String> {
    match value {
        "soundcloud" => Ok(CredentialKind::SoundCloudClientId),
        "yandex" => Ok(CredentialKind::YandexToken),
        "deezer" => Ok(CredentialKind::DeezerArl),
        "spotify" => Ok(CredentialKind::SpotifySpDc),
        "youtube" | "youtube_music" => Ok(CredentialKind::YouTubeCookie),
        _ => Err(format!("РЅРµРёР·РІРµСЃС‚РЅС‹Р№ РїСЂРѕРІР°Р№РґРµСЂ: {value}")),
    }
}

fn repeat_from_str(value: &str) -> Result<RepeatMode, String> {
    match value {
        "off" => Ok(RepeatMode::Off),
        "all" => Ok(RepeatMode::All),
        "one" => Ok(RepeatMode::One),
        _ => Err(format!("РЅРµРёР·РІРµСЃС‚РЅС‹Р№ repeat: {value}")),
    }
}

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
            "РЎРЅР°С‡Р°Р»Р° РґРѕР±Р°РІСЊ SoundCloud client_id РёР»Рё Yandex OAuth РІ РќР°СЃС‚СЂРѕР№РєР°С…".to_string(),
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
        Some(other) => return Err(format!("РЅРµРёР·РІРµСЃС‚РЅС‹Р№ РїСЂРѕРІР°Р№РґРµСЂ: {other}")),
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
) -> Result<Vec<vessel_core::provider::CollectionItem>, String> {
    use vessel_core::provider::CollectionKind;
    let kind = match kind.as_str() {
        "playlists" | "playlist" => CollectionKind::Playlist,
        "albums" | "album" => CollectionKind::Album,
        "artists" | "artist" => CollectionKind::Artist,
        other => return Err(format!("РЅРµРёР·РІРµСЃС‚РЅС‹Р№ С‚РёРї РєРѕР»Р»РµРєС†РёРё: {other}")),
    };
    let query = query.trim().to_string();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    let registry = {
        let core = lock(&core);
        core.runtime.provider_registry()
    };
    if registry.is_empty() {
        return Err("РЎРЅР°С‡Р°Р»Р° РґРѕР±Р°РІСЊ РєР»СЋС‡ РїСЂРѕРІР°Р№РґРµСЂР° РІ РќР°СЃС‚СЂРѕР№РєР°С…".to_string());
    }
    let kinds = [
        vessel_core::model::ProviderKind::SoundCloud,
        vessel_core::model::ProviderKind::YandexMusic,
        vessel_core::model::ProviderKind::Deezer,
        vessel_core::model::ProviderKind::Spotify,
        vessel_core::model::ProviderKind::YouTubeMusic,
    ];
    // РџР°СЂР°Р»Р»РµР»СЊРЅРѕ: РїРѕСЃР»РµРґРѕРІР°С‚РµР»СЊРЅС‹Р№ РѕР±С…РѕРґ РїРѕРґРІРµС€РёРІР°Р» РІРєР»Р°РґРєРё РЅР° ~7 СЃРµРє
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
                            "[search_collections] {provider_kind:?} {kind:?}: {} С€С‚.",
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
    let results = futures_util::future::join_all(jobs).await;
    let mut items = Vec::new();
    for found in results {
        items.extend(found);
    }
    vessel_core::dlog!("[search_collections] РёС‚РѕРіРѕ {} РґР»СЏ '{}' ({kind:?})", items.len(), query);
    Ok(items)
}

#[tauri::command]
pub async fn artist_profile(
    core: CoreState<'_>,
    provider: String,
    artist_id: String,
) -> Result<vessel_core::provider::ArtistProfile, String> {
    use vessel_core::model::ProviderKind;
    let kind = provider_kind_from_str(&provider)?;
    let registry = {
        let core = lock(&core);
        core.runtime.provider_registry()
    };
    let provider_impl = registry
        .get(kind)
        .ok_or_else(|| "РїСЂРѕРІР°Р№РґРµСЂ РЅРµ РїРѕРґРєР»СЋС‡С‘РЅ".to_string())?;
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
        .ok_or_else(|| "РїСЂРѕРІР°Р№РґРµСЂ РЅРµ РїРѕРґРєР»СЋС‡С‘РЅ".to_string())?;
    provider_impl
        .artist_all_tracks(artist_id.trim())
        .await
        .map_err(|e| format!("{e:#}"))
}

fn resolve_download_dir(core: &GuiCore) -> String {
    if let Some(dir) = core
        .config
        .download_dir
        .as_deref()
        .map(str::trim)
        .filter(|dir| !dir.is_empty())
    {
        return dir.to_string();
    }
    vessel_core::provider::download::downloads_dir()
        .map(|p| p.display().to_string())
        .unwrap_or_default()
}

#[tauri::command]
pub async fn get_download_dir(core: CoreState<'_>) -> Result<String, String> {
    let core = lock(&core);
    Ok(resolve_download_dir(&core))
}

#[tauri::command]
pub async fn set_download_dir(core: CoreState<'_>, path: Option<String>) -> Result<(), String> {
    let mut core = lock(&core);
    core.config.download_dir = path.map(|p| p.trim().to_string()).filter(|p| !p.is_empty());
    core.app.config_dirty = true;
    Ok(())
}

fn resolve_track_cache_dir(core: &GuiCore) -> String {
    core.config
        .track_cache_dir
        .as_deref()
        .map(str::trim)
        .filter(|dir| !dir.is_empty())
        .map(str::to_string)
        .unwrap_or_else(|| {
            vessel_core::provider::cache::track_cache_dir()
                .display()
                .to_string()
        })
}

#[tauri::command]
pub async fn get_cache_dir(core: CoreState<'_>) -> Result<String, String> {
    let core = lock(&core);
    Ok(resolve_track_cache_dir(&core))
}

#[tauri::command]
pub async fn set_cache_dir(core: CoreState<'_>, path: Option<String>) -> Result<(), String> {
    let mut core = lock(&core);
    let value = path.map(|p| p.trim().to_string()).filter(|p| !p.is_empty());
    core.config.track_cache_dir = value.clone();
    vessel_core::provider::cache::set_track_cache_dir(value.map(PathBuf::from));
    core.app.config_dirty = true;
    Ok(())
}

#[tauri::command]
pub async fn get_spotify_proxy(core: CoreState<'_>) -> Result<String, String> {
    let core = lock(&core);
    Ok(core.config.spotify_proxy.clone().unwrap_or_default())
}

#[tauri::command]
pub async fn set_spotify_proxy(core: CoreState<'_>, path: Option<String>) -> Result<(), String> {
    let mut core = lock(&core);
    core.config.spotify_proxy = path.map(|p| p.trim().to_string()).filter(|p| !p.is_empty());
    core.app.config_dirty = true;
    Ok(())
}

/// РўРµРєСѓС‰РёР№ РёСЃС‚РѕС‡РЅРёРє Р°СѓРґРёРѕ РґР»СЏ Spotify-С‚СЂРµРєРѕРІ ("youtube_music" | "deezer" | "").
#[tauri::command]
pub async fn get_spotify_playback_source(core: CoreState<'_>) -> Result<String, String> {
    let core = lock(&core);
    let source = core.runtime.spotify_playback_source();
    Ok(source.as_str().to_string())
}

/// РЎРјРµРЅРёС‚СЊ РёСЃС‚РѕС‡РЅРёРє Р°СѓРґРёРѕ РґР»СЏ Spotify-С‚СЂРµРєРѕРІ (Р±РµР· РїРµСЂРµР·Р°РїСѓСЃРєР°).
/// Auto РїСЂРѕРІРµСЂСЏРµС‚СЃСЏ РїРѕ С†РµРїРѕС‡РєРµ: РЅСѓР¶РµРЅ С…РѕС‚СЏ Р±С‹ РѕРґРёРЅ РёСЃС‚РѕС‡РЅРёРє РёР· РЅРµС‘.
#[tauri::command]
pub async fn set_spotify_playback_source(core: CoreState<'_>, source: String) -> Result<(), String> {
    use vessel_core::runtime::playback_resolver::PlaybackSourceKind;
    let Some(kind) = PlaybackSourceKind::from_str(&source) else {
        return Err(format!("РЅРµРёР·РІРµСЃС‚РЅС‹Р№ РёСЃС‚РѕС‡РЅРёРє: {source}"));
    };
    let mut core = lock(&core);
    // РСЃС‚РѕС‡РЅРёРє РґРѕР»Р¶РµРЅ Р±С‹С‚СЊ РЅР°СЃС‚СЂРѕРµРЅ вЂ” РёРЅР°С‡Рµ С‚СЂРµРєРё РїСЂРѕСЃС‚Рѕ РЅРµ Р·Р°РёРіСЂР°СЋС‚
    let available = match kind {
        PlaybackSourceKind::Auto => kind
            .chain()
            .iter()
            .any(|s| core.runtime.provider_registry().get(s.provider_kind()).is_some()),
        other => core
            .runtime
            .provider_registry()
            .get(other.provider_kind())
            .is_some(),
    };
    if !available {
        return Err(format!(
            "РёСЃС‚РѕС‡РЅРёРє {} РЅРµРґРѕСЃС‚СѓРїРµРЅ вЂ” РїРѕРґРєР»СЋС‡Рё С…РѕС‚СЏ Р±С‹ РѕРґРёРЅ РёР·: Deezer, YouTube Music",
            kind.label()
        ));
    }
    core.runtime.set_spotify_playback_source(kind);
    // РЎРёРЅС…СЂРѕРЅРёР·РёСЂСѓРµРј core.config вЂ” persist СЃРѕС…СЂР°РЅСЏРµС‚ РёРјРµРЅРЅРѕ РµРіРѕ
    core.config.spotify_playback_source = Some(kind.as_str().to_string());
    core.app.config_dirty = true;
    Ok(())
}

#[tauri::command]
pub async fn download_track(
    core: CoreState<'_>,
    track: TrackRef,
) -> Result<String, String> {
    let registry = {
        let core = lock(&core);
        core.runtime.provider_registry()
    };
    let Some(provider) = registry.get(track.provider) else {
        return Err("РїСЂРѕРІР°Р№РґРµСЂ РЅРµ РїРѕРґРєР»СЋС‡С‘РЅ".to_string());
    };
    let source = provider
        .download_source(&track)
        .await
        .map_err(|e| format!("{e:#}"))?;
    let dir = {
        let core = lock(&core);
        resolve_download_dir(&core)
    };
    let file_name = vessel_core::provider::download::track_file_name(&track, &source);
    let dest = std::path::Path::new(&dir).join(file_name);
    if dest.exists() {
        return Ok(dest.display().to_string());
    }
    vessel_core::provider::download::download_playback_source(&source, &dest)
        .await
        .map_err(|e| format!("{e:#}"))?;
    Ok(dest.display().to_string())
}

#[tauri::command]
pub async fn download_track_to_cache(
    core: CoreState<'_>,
    track: TrackRef,
) -> Result<String, String> {
    let registry = {
        let core = lock(&core);
        core.runtime.provider_registry()
    };
    let Some(provider) = registry.get(track.provider) else {
        return Err("РїСЂРѕРІР°Р№РґРµСЂ РЅРµ РїРѕРґРєР»СЋС‡С‘РЅ".to_string());
    };
    if vessel_core::provider::cache::is_cached(&track) {
        if let Some(path) = vessel_core::provider::cache::cached_track_path(&track) {
            return Ok(path.display().to_string());
        }
    }
    let source = provider
        .download_source(&track)
        .await
        .map_err(|e| format!("{e:#}"))?;
    let path = vessel_core::provider::cache::download_track_to_cache(&track, &source)
        .await
        .map_err(|e| format!("{e:#}"))?;
    Ok(path.display().to_string())
}

#[derive(Serialize, Default)]
pub struct DownloadBatchResult {
    pub downloaded: usize,
    pub skipped: usize,
    pub failed: usize,
    pub total: usize,
}

#[tauri::command]
pub async fn download_all_to_cache(
    core: CoreState<'_>,
    tracks: Vec<TrackRef>,
) -> Result<DownloadBatchResult, String> {
    let total = tracks.len();
    let mut result = DownloadBatchResult {
        total,
        ..Default::default()
    };
    for track in tracks {
        if vessel_core::provider::cache::is_cached(&track) {
            result.skipped += 1;
            continue;
        }
        let registry = {
            let core = lock(&core);
            core.runtime.provider_registry()
        };
        let Some(provider) = registry.get(track.provider) else {
            result.failed += 1;
            continue;
        };
        let source = match provider.download_source(&track).await {
            Ok(source) => source,
            Err(_) => {
                result.failed += 1;
                continue;
            }
        };
        match vessel_core::provider::cache::download_track_to_cache(&track, &source).await {
            Ok(_) => result.downloaded += 1,
            Err(_) => result.failed += 1,
        }
    }
    Ok(result)
}

#[tauri::command]
pub async fn play(core: CoreState<'_>, track: TrackRef) -> Result<(), String> {
    let mut core = lock(&core);
    if !track.capability.can_play() {
        return Err("Р­С‚РѕС‚ С‚СЂРµРє РЅРµРґРѕСЃС‚СѓРїРµРЅ РґР»СЏ РІРѕСЃРїСЂРѕРёР·РІРµРґРµРЅРёСЏ".to_string());
    }
    core.app.gui_play_tracks(vec![track], 0);
    Ok(())
}

#[tauri::command]
pub async fn play_tracks(
    core: CoreState<'_>,
    tracks: Vec<TrackRef>,
    start: usize,
) -> Result<(), String> {
    let mut core = lock(&core);
    if tracks.is_empty() {
        return Err("РЅРµС‚ С‚СЂРµРєРѕРІ".to_string());
    }
    let start = start.min(tracks.len() - 1);
    if !tracks[start].capability.can_play() {
        return Err("Р’С‹Р±СЂР°РЅРЅС‹Р№ С‚СЂРµРє РЅРµРґРѕСЃС‚СѓРїРµРЅ РґР»СЏ РІРѕСЃРїСЂРѕРёР·РІРµРґРµРЅРёСЏ".to_string());
    }
    core.app.gui_play_tracks(tracks, start);
    Ok(())
}

#[tauri::command]
pub async fn toggle_playback(core: CoreState<'_>) -> Result<(), String> {
    let mut core = lock(&core);
    core.app.control_toggle()
}

#[tauri::command]
pub async fn next(core: CoreState<'_>) -> Result<(), String> {
    let mut core = lock(&core);
    if core.app.queue.is_empty() {
        return Err("РѕС‡РµСЂРµРґСЊ РїСѓСЃС‚Р°".to_string());
    }
    core.app.control_next();
    Ok(())
}

#[tauri::command]
pub async fn previous(core: CoreState<'_>) -> Result<(), String> {
    let mut core = lock(&core);
    if core.app.queue.is_empty() {
        return Err("РѕС‡РµСЂРµРґСЊ РїСѓСЃС‚Р°".to_string());
    }
    core.app.control_previous();
    Ok(())
}

#[tauri::command]
pub async fn seek(core: CoreState<'_>, position_ms: u64) -> Result<(), String> {
    vessel_core::dlog!("[seek] invoke position_ms={}", position_ms);
    let mut core = lock(&core);
    core.app.gui_seek_to(position_ms);
    vessel_core::dlog!("[seek] effect queued");
    Ok(())
}

#[tauri::command]
pub async fn set_volume(core: CoreState<'_>, volume_percent: u8) -> Result<(), String> {
    let mut core = lock(&core);
    let volume = volume_percent.min(100);
    core.app.player.volume_percent = volume;
    core.app
        .gui_dispatch(vessel_core::effect::AppEffect::SetVolume(volume));
    core.app.config_dirty = true;
    Ok(())
}

#[tauri::command]
pub async fn stop(core: CoreState<'_>) -> Result<(), String> {
    let mut core = lock(&core);
    core.app.control_stop();
    Ok(())
}

#[tauri::command]
pub async fn set_shuffle(core: CoreState<'_>, on: bool) -> Result<(), String> {
    let mut core = lock(&core);
    core.app.gui_set_shuffle(on);
    Ok(())
}

#[tauri::command]
pub async fn set_repeat(core: CoreState<'_>, mode: String) -> Result<(), String> {
    let mut core = lock(&core);
    core.app.gui_set_repeat(repeat_from_str(&mode)?);
    Ok(())
}

#[tauri::command]
pub async fn add_to_queue(core: CoreState<'_>, track: TrackRef) -> Result<(), String> {
    let mut core = lock(&core);
    core.app.gui_add_to_queue(track);
    Ok(())
}

#[tauri::command]
pub async fn play_next(core: CoreState<'_>, track: TrackRef) -> Result<(), String> {
    let mut core = lock(&core);
    core.app.gui_play_next(track);
    Ok(())
}

#[tauri::command]
pub async fn remove_from_queue(core: CoreState<'_>, index: usize) -> Result<(), String> {
    let mut core = lock(&core);
    if index >= core.app.queue.len() {
        return Err("РёРЅРґРµРєСЃ РІРЅРµ РѕС‡РµСЂРµРґРё".to_string());
    }
    core.app.gui_remove_from_queue(index);
    Ok(())
}

#[tauri::command]
pub async fn move_queue_item(
    core: CoreState<'_>,
    from: usize,
    to: usize,
) -> Result<(), String> {
    let mut core = lock(&core);
    if from >= core.app.queue.len() || to >= core.app.queue.len() {
        return Err("РёРЅРґРµРєСЃ РІРЅРµ РѕС‡РµСЂРµРґРё".to_string());
    }
    core.app.gui_move_queue_item(from, to);
    Ok(())
}

#[tauri::command]
pub async fn reorder_library(
    core: CoreState<'_>,
    from: usize,
    to: usize,
) -> Result<(), String> {
    let mut core = lock(&core);
    let len = core.app.library.len();
    if from >= len || to >= len {
        return Err("РёРЅРґРµРєСЃ РІРЅРµ Р±РёР±Р»РёРѕС‚РµРєРё".to_string());
    }
    let mut order: Vec<String> = core
        .app
        .library
        .iter()
        .map(|t| t.provider_key())
        .collect();
    let key = order.remove(from);
    order.insert(to, key);
    core.storage.reorder_library(&order).map_err(|e| e.to_string())?;
    let track = core.app.library.remove(from);
    core.app.library.insert(to, track);
    Ok(())
}

#[tauri::command]
pub async fn reorder_queue(
    core: CoreState<'_>,
    tracks: Vec<TrackRef>,
) -> Result<(), String> {
    let mut core = lock(&core);
    if tracks.is_empty() && !core.app.queue.is_empty() {
        return Err("РїСѓСЃС‚РѕР№ РїРѕСЂСЏРґРѕРє РѕС‡РµСЂРµРґРё".to_string());
    }
    // РўРµРєСѓС‰РёР№ С‚СЂРµРє РІСЃРµРіРґР° РїРµСЂРІС‹Р№ РІ РѕС‡РµСЂРµРґРё, РѕСЃС‚Р°Р»СЊРЅС‹Рµ вЂ” РІ РїРѕСЂСЏРґРєРµ РёР· UI.
    let now_key = core.app.now_playing.as_ref().map(|t| t.provider_key());
    let mut reordered = tracks;
    if let Some(now_key) = now_key {
        if let Some(pos) = reordered.iter().position(|t| t.provider_key() == now_key) {
            let now = reordered.remove(pos);
            reordered.insert(0, now);
        }
    }
    core.app.queue = reordered;
    core.app.queue_index = Some(0);
    core.app.queue_dirty = true;
    Ok(())
}

#[tauri::command]
pub async fn clear_queue(core: CoreState<'_>) -> Result<(), String> {
    let mut core = lock(&core);
    core.app.control_queue_clear();
    Ok(())
}

#[tauri::command]
pub async fn toggle_favorite(core: CoreState<'_>, track: TrackRef) -> Result<bool, String> {
    let mut core = lock(&core);
    Ok(core.app.gui_toggle_like_track(&track))
}

#[tauri::command]
pub async fn get_playlists(core: CoreState<'_>) -> Result<Vec<Playlist>, String> {
    let core = lock(&core);
    Ok(core.app.playlists.clone())
}

#[tauri::command]
pub async fn preview_playlist_url(core: CoreState<'_>, url: String) -> Result<Playlist, String> {
    let parsed = url::Url::parse(&url).map_err(|e| format!("РќРµРІРµСЂРЅС‹Р№ URL: {e}"))?;
    let registry = {
        let core = lock(&core);
        core.runtime.provider_registry()
    };
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    registry
        .import_url(&parsed, now_ms)
        .await
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
pub async fn save_imported_playlist(
    core: CoreState<'_>,
    playlist: Playlist,
) -> Result<(), String> {
    let mut core = lock(&core);
    // Р”СѓР±Р»Рё РїРѕ СЃСЃС‹Р»РєРµ РЅРµР»СЊР·СЏ: РѕРґРёРЅ РїР»РµР№Р»РёСЃС‚/Р°Р»СЊР±РѕРј вЂ” РѕРґРЅР° Р·Р°РїРёСЃСЊ
    if playlist
        .source_url
        .as_ref()
        .is_some_and(|url| core.app.playlists.iter().any(|p| p.source_url.as_ref() == Some(url)))
    {
        return Err("Р­С‚РѕС‚ РїР»РµР№Р»РёСЃС‚ СѓР¶Рµ РґРѕР±Р°РІР»РµРЅ РІ Р±РёР±Р»РёРѕС‚РµРєСѓ".to_string());
    }
    if core
        .app
        .playlists
        .iter()
        .any(|p| p.source_url.is_none() && p.title == playlist.title && playlist.source_url.is_none())
    {
        return Err("Р­С‚РѕС‚ РїР»РµР№Р»РёСЃС‚ СѓР¶Рµ РґРѕР±Р°РІР»РµРЅ РІ Р±РёР±Р»РёРѕС‚РµРєСѓ".to_string());
    }
    core.storage
        .save_playlist(&playlist)
        .map_err(|e| e.to_string())?;
    core.app.playlists.insert(0, playlist);
    persist_playlist_order(&mut core);
    core.app.playlists_dirty = true;
    Ok(())
}

/// РџРёС€РµС‚ position РґР»СЏ РІСЃРµС… РїР»РµР№Р»РёСЃС‚РѕРІ РІ РїРѕСЂСЏРґРєРµ app.playlists.
fn persist_playlist_order(core: &mut GuiCore) {
    let order: Vec<String> = core
        .app
        .playlists
        .iter()
        .map(|p| p.id.to_string())
        .collect();
    if let Err(error) = core.storage.save_playlists_order(&order) {
        vessel_core::dlog!("[vessel] save_playlists_order: {error}");
    }
}

#[tauri::command]
pub async fn reorder_playlists(
    core: CoreState<'_>,
    order: Vec<String>,
) -> Result<(), String> {
    let mut core = lock(&core);
    core.storage
        .save_playlists_order(&order)
        .map_err(|e| e.to_string())?;
    core.app.playlists.sort_by_key(|p| {
        order
            .iter()
            .position(|id| id == &p.id.to_string())
            .unwrap_or(usize::MAX)
    });
    Ok(())
}

/// РљР»СЋС‡ С‚СЂРµРєР° РІ С„РѕСЂРјР°С‚Рµ С„СЂРѕРЅС‚РµРЅРґР°: provider (snake_case) + id.
fn frontend_track_key(track: &TrackRef) -> String {
    use vessel_core::model::ProviderKind;
    let provider = match track.provider {
        ProviderKind::SoundCloud => "sound_cloud",
        ProviderKind::YandexMusic => "yandex_music",
        ProviderKind::Deezer => "deezer",
        ProviderKind::Spotify => "spotify",
        ProviderKind::YouTubeMusic => "youtube_music",
    };
    format!("{}:{}", provider, track.id.trim())
}

#[derive(Serialize)]
pub struct TrackTime {
    pub key: String,
    pub timestamp_ms: i64,
}

#[tauri::command]
pub async fn get_library_times(
    core: CoreState<'_>,
) -> Result<Vec<TrackTime>, String> {
    let core = lock(&core);
    let times = core
        .storage
        .liked_tracks_with_time()
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|(track, ts)| TrackTime {
            key: frontend_track_key(&track),
            timestamp_ms: ts,
        })
        .collect();
    Ok(times)
}

#[tauri::command]
pub async fn get_playlist_track_times(
    core: CoreState<'_>,
    id: String,
) -> Result<Vec<TrackTime>, String> {
    let core = lock(&core);
    let id = uuid::Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    let times = core
        .storage
        .playlist_track_times(id)
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|(track, ts)| TrackTime {
            key: frontend_track_key(&track),
            timestamp_ms: ts,
        })
        .collect();
    Ok(times)
}

#[tauri::command]
pub async fn import_playlist_url(
    core: CoreState<'_>,
    url: String,
) -> Result<Playlist, String> {
    let parsed = url::Url::parse(&url).map_err(|e| format!("РќРµРІРµСЂРЅС‹Р№ URL: {e}"))?;
    // Р”СѓР±Р»Рё РїРѕ СЃСЃС‹Р»РєРµ РЅРµР»СЊР·СЏ: РѕРґРёРЅ РїР»РµР№Р»РёСЃС‚/Р°Р»СЊР±РѕРј вЂ” РѕРґРЅР° Р·Р°РїРёСЃСЊ
    {
        let core = lock(&core);
        if core
            .app
            .playlists
            .iter()
            .any(|p| p.source_url.as_ref() == Some(&parsed))
        {
            return Err("Р­С‚РѕС‚ РїР»РµР№Р»РёСЃС‚ СѓР¶Рµ РґРѕР±Р°РІР»РµРЅ РІ Р±РёР±Р»РёРѕС‚РµРєСѓ".to_string());
        }
    }
    let registry = {
        let core = lock(&core);
        core.runtime.provider_registry()
    };
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let playlist = registry
        .import_url(&parsed, now_ms)
        .await
        .map_err(|e| format!("{e:#}"))?;
    let mut core = lock(&core);
    core.storage
        .save_playlist(&playlist)
        .map_err(|e| e.to_string())?;
    core.app.playlists.insert(0, playlist.clone());
    persist_playlist_order(&mut core);
    core.app.playlists_dirty = true;
    Ok(playlist)
}

#[tauri::command]
pub async fn create_playlist(core: CoreState<'_>, title: String) -> Result<Playlist, String> {
    let mut core = lock(&core);
    let id = core.app.gui_create_playlist(title);
    let playlist = core
        .app
        .playlists
        .iter()
        .find(|p| p.id == id)
        .cloned()
        .ok_or_else(|| "РїР»РµР№Р»РёСЃС‚ РЅРµ СЃРѕР·РґР°Р»СЃСЏ".to_string())?;
    persist_playlist_order(&mut core);
    Ok(playlist)
}

#[tauri::command]
pub async fn rename_playlist(core: CoreState<'_>, id: String, title: String) -> Result<(), String> {
    let mut core = lock(&core);
    let id = uuid::Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    core.app.gui_rename_playlist(id, title);
    Ok(())
}

#[tauri::command]
pub async fn delete_playlist(core: CoreState<'_>, id: String) -> Result<(), String> {
    let mut core = lock(&core);
    let id = uuid::Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    core.storage.delete_playlist(id).map_err(|e| e.to_string())?;
    core.app.gui_delete_playlist(id);
    Ok(())
}

#[tauri::command]
pub async fn add_to_playlist(
    core: CoreState<'_>,
    id: String,
    track: TrackRef,
) -> Result<bool, String> {
    let mut core = lock(&core);
    let id = uuid::Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    Ok(core.app.gui_add_to_playlist(id, track))
}

#[tauri::command]
pub async fn remove_from_playlist(
    core: CoreState<'_>,
    id: String,
    index: usize,
) -> Result<(), String> {
    let mut core = lock(&core);
    let id = uuid::Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    core.app.gui_remove_from_playlist(id, index);
    Ok(())
}

#[tauri::command]
pub async fn reorder_playlist(
    core: CoreState<'_>,
    id: String,
    from: usize,
    to: usize,
) -> Result<(), String> {
    let mut core = lock(&core);
    let id = uuid::Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    core.app.gui_reorder_playlist(id, from, to);
    Ok(())
}

#[tauri::command]
pub async fn set_playlist_cover(
    core: CoreState<'_>,
    id: String,
    coverUrl: Option<String>,
) -> Result<(), String> {
    let mut core = lock(&core);
    let id = uuid::Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    let cover_url = match coverUrl {
        Some(value) if !value.trim().is_empty() => {
            Some(url::Url::parse(value.trim()).map_err(|e| e.to_string())?)
        }
        _ => None,
    };
    core.app.gui_set_playlist_cover(id, cover_url);
    Ok(())
}

#[tauri::command]
pub async fn play_playlist(core: CoreState<'_>, id: String) -> Result<(), String> {
    let mut core = lock(&core);
    let id = uuid::Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    if !core.app.gui_play_playlist(id) {
        return Err("РїР»РµР№Р»РёСЃС‚ РЅРµ РЅР°Р№РґРµРЅ РёР»Рё РїСѓСЃС‚".to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn get_history(core: CoreState<'_>) -> Result<Vec<HistoryEntry>, String> {
    let core = lock(&core);
    core.storage.recent_history(100).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_history(core: CoreState<'_>) -> Result<(), String> {
    let mut core = lock(&core);
    core.storage.clear_history().map_err(|e| e.to_string())?;
    core.app.gui_clear_history();
    Ok(())
}

#[tauri::command]
pub async fn get_provider_status(core: CoreState<'_>) -> Result<Vec<crate::ProviderStatus>, String> {
    let core = lock(&core);
    Ok(crate::provider_statuses(&core))
}


/// РћС‚РєСЂС‹РІР°РµС‚ РѕРєРЅРѕ WebView СЃ Spotify РґР»СЏ РІС…РѕРґР° Рё Р·Р°РїСѓСЃРєР°РµС‚ С„РѕРЅРѕРІС‹Р№
/// РјРѕРЅРёС‚РѕСЂРёРЅРі cookies: РєР°Рє С‚РѕР»СЊРєРѕ sp_dc РїРѕСЏРІР»СЏРµС‚СЃСЏ (СЋР·РµСЂ Р·Р°Р»РѕРіРёРЅРёР»СЃСЏ),
/// credential СЃРѕС…СЂР°РЅСЏРµС‚СЃСЏ Рё РѕРєРЅРѕ Р·Р°РєСЂС‹РІР°РµС‚СЃСЏ СЃР°РјРѕ. РћС‚РґРµР»СЊРЅР°СЏ РєРЅРѕРїРєР°
/// В«Р—Р°Р±СЂР°С‚СЊ cookieВ» Р±РѕР»СЊС€Рµ РЅРµ РЅСѓР¶РЅР°.
#[tauri::command]
pub async fn spotify_browser_login(app: AppHandle, core: CoreState<'_>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("spotify_login") {
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }
    let url = WebviewUrl::External(
        url::Url::parse("https://accounts.spotify.com/en/login?continue=https://open.spotify.com/")
            .map_err(|e| e.to_string())?,
    );
    WebviewWindowBuilder::new(&app, "spotify_login", url)
        .title("Spotify вЂ” РІС…РѕРґ")
        .inner_size(900.0, 700.0)
        .min_inner_size(600.0, 500.0)
        .build()
        .map_err(|e| e.to_string())?;
    spawn_spotify_cookie_watcher(app, core);
    Ok(())
}

/// Р¤РѕРЅРѕРІР°СЏ Р·Р°РґР°С‡Р°: РѕРїСЂР°С€РёРІР°РµС‚ cookies РѕРєРЅР° РІС…РѕРґР°, Р¶РґС‘С‚ sp_dc. РџРѕСЏРІРёР»СЃСЏ вЂ”
/// РІР°Р»РёРґРёСЂСѓРµРј (РїСЂРѕР±СѓРµРј device-flow refresh, РЅРѕ РѕРЅ РЅРµ РѕР±СЏР·Р°С‚РµР»РµРЅ), СЃРѕС…СЂР°РЅСЏРµРј,
/// Р·Р°РєСЂС‹РІР°РµРј РѕРєРЅРѕ. РћС€РёР±РєР° РІР°Р»РёРґР°С†РёРё РќР• С„Р°С‚Р°Р»СЊРЅР°: cookies РІСЃС‘ СЂР°РІРЅРѕ СЃРѕС…СЂР°РЅСЏСЋС‚СЃСЏ,
/// Р° СЃС‚Р°С‚СѓСЃ В«РїРѕРґРєР»СЋС‡РµРЅРѕ/РЅРµС‚В» РїРѕРєР°Р¶РµС‚ provider status.
fn spawn_spotify_cookie_watcher(app: AppHandle, core: CoreState<'_>) {
    let core: Arc<Mutex<GuiCore>> = core.inner().clone();
    tokio::spawn(async move {
        const POLL_INTERVAL: std::time::Duration = std::time::Duration::from_millis(2000);
        // РњР°РєСЃРёРјСѓРј 15 РјРёРЅСѓС‚: СЋР·РµСЂ РјРѕР¶РµС‚ РїСЂРѕСЃС‚Рѕ СѓР№С‚Рё вЂ” С‚РѕРіРґР° AUTH_CANCELLED
        for _attempt in 0..450u32 {
            tokio::time::sleep(POLL_INTERVAL).await;
            let Some(window) = app.get_webview_window("spotify_login") else {
                vessel_core::dlog!("[spotify] auth window closed without login вЂ” cancelled");
                return;
            };
            if window.is_visible().unwrap_or(false) == false {
                continue;
            }
            // Всплывающие окна (вход через Google и т.п.) редиректим в это же окно
            let _ = window.eval(POPUP_HOOK_JS);
            let cookie = match tauri::async_runtime::spawn_blocking({
                let app = app.clone();
                move || crate::webview_cookies::collect_spotify_cookies(&app)
            })
            .await
            {
                Ok(Ok(cookie)) => cookie,
                Ok(Err(_)) => continue, // sp_dc РµС‰С‘ РЅРµС‚ вЂ” Р¶РґРµРј, СЌС‚Рѕ РЅРµ РѕС€РёР±РєР°
                Err(_) => continue,
            };
            let cookie_line: String = {
                let mut parts = Vec::new();
                for part in cookie.split(';') {
                    let part = part.trim();
                    if part.to_ascii_lowercase().starts_with("sp_dc=")
                        || part.to_ascii_lowercase().starts_with("sp_key=")
                    {
                        parts.push(part.to_string());
                    }
                }
                parts.join("; ")
            };
            if !cookie_line.to_ascii_lowercase().contains("sp_dc=") {
                continue;
            }
            vessel_core::dlog!(
                "[spotify] sp_dc detected ({} bytes) — saving",
                cookie_line.len()
            );
            // sp_dc сохраняем сразу: поиск/артисты/плеер оживают моментально.
            // Лайки идут через Pathfinder fetchLibraryTracks на том же sp_dc —
            // OAuth не нужен вовсе.
            {
                let mut core = core
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                let _ = core.runtime
                    .save_credential(CredentialKind::SpotifySpDc, &cookie_line);
                core.app.spotify_enabled = true;
                core.app.config_dirty = true;
                core.app.status_message = "Spotify подключён".to_string();
            }

            if let Some(window) = app.get_webview_window("spotify_login") {
                let _ = window.close();
            }
            vessel_core::dlog!("[spotify] authenticated: credential saved, window closed");
            return;
        }
        vessel_core::dlog!("[spotify] auth watcher timed out (15 min) — cancelled");
    });
}

/// РћС‚РєСЂС‹С‚Рѕ Р»Рё РѕРєРЅРѕ РІС…РѕРґР° Spotify (РґР»СЏ UI-РїРѕР»Р»РёРЅРіР° Р°РІС‚РѕРїРѕРґРєР»СЋС‡РµРЅРёСЏ).
#[tauri::command]
pub async fn spotify_login_window_open(app: AppHandle) -> Result<bool, String> {
    Ok(app.get_webview_window("spotify_login").is_some())
}

/// РћС‚РјРµРЅСЏРµС‚ РІС…РѕРґ РІ Spotify: Р·Р°РєСЂС‹РІР°РµС‚ РѕРєРЅРѕ, РјРѕРЅРёС‚РѕСЂРёРЅРі РѕСЃС‚Р°РЅРѕРІРёС‚СЃСЏ СЃР°Рј.
#[tauri::command]
pub async fn spotify_auth_cancel(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("spotify_login") {
        let _ = window.close();
    }
    vessel_core::dlog!("[spotify] auth cancelled by user");
    Ok(())
}

/// Р СѓС‡РЅРѕР№ Р·Р°Р±РѕСЂ cookies вЂ” СЃРѕРІРјРµСЃС‚РёРјРѕСЃС‚СЊ СЃРѕ СЃС‚Р°СЂС‹Рј UI. РќРѕРІР°СЏ РєРЅРѕРїРєР° РЅРµ
/// РёСЃРїРѕР»СЊР·СѓРµС‚ СЌС‚РѕС‚ РїСѓС‚СЊ (РјРѕРЅРёС‚РѕСЂРёРЅРі Р°РІС‚РѕРјР°С‚РёС‡РµСЃРєРёР№), РЅРѕ РєРѕРјР°РЅРґР° РѕСЃС‚Р°РІР»РµРЅР°,
/// С‡С‚РѕР±С‹ РЅРёС‡РµРіРѕ РЅРµ СЃР»РѕРјР°С‚СЊ Сѓ РїРѕР»СЊР·РѕРІР°С‚РµР»РµР№ СЃ РѕС‚РєСЂС‹С‚С‹Рј СЃС‚Р°СЂС‹Рј РѕРєРЅРѕРј.
#[tauri::command]
pub async fn spotify_capture_cookies(
    app: AppHandle,
    core: CoreState<'_>,
) -> Result<String, String> {
    use vessel_core::provider::spotify::SpotifyProvider;

    let cookie = crate::webview_cookies::collect_spotify_cookies(&app).map_err(|e| e.to_string())?;
    // Р”РѕСЃС‚Р°С‘Рј С‚РѕР»СЊРєРѕ sp_dc / sp_key вЂ” РёС… Р¶РґС‘С‚ РїСЂРѕРІР°Р№РґРµСЂ.
    let cookie_line = {
        let mut parts = Vec::new();
        for part in cookie.split(';') {
            let part = part.trim();
            if part.to_ascii_lowercase().starts_with("sp_dc=")
                || part.to_ascii_lowercase().starts_with("sp_key=")
            {
                parts.push(part.to_string());
            }
        }
        parts.join("; ")
    };
    if !cookie_line.to_ascii_lowercase().contains("sp_dc=") {
        return Err("РЅРµ РЅР°Р№РґРµРЅР° cookie sp_dc вЂ” РІРѕР№РґРё РІ Р°РєРєР°СѓРЅС‚ Spotify Рё РїРѕРІС‚РѕСЂРё".to_string());
    }

    let mut core = lock(&core);
    core.runtime
        .save_credential(CredentialKind::SpotifySpDc, &cookie_line)
        .map_err(|e| e.to_string())?;
    core.app.spotify_enabled = true;
    core.app.config_dirty = true;
    if let Some(window) = app.get_webview_window("spotify_login") {
        let _ = window.close();
    }
    Ok("sp_dc сохранён".to_string())
}

// ---------- Вход через браузер: SoundCloud (client_id) ----------

/// Общий JS-хук входа: Google OAuth и прочие «продолжить через…» открываются
/// всплывающими окнами, которые WebView блокирует — перенаправляем их в то же
/// окно, чтобы вход через аккаунт Google работал.
const POPUP_HOOK_JS: &str = r#"(function(){
  if (window.__vesselPopupHook) return;
  window.__vesselPopupHook = true;
  window.open = function(url){
    try { if (url) { window.location.href = url; } } catch (e) {}
    return null;
  };
  document.addEventListener('click', function(e){
    try {
      var a = e.target && e.target.closest ? e.target.closest('a[target="_blank"]') : null;
      if (a && a.href) { e.preventDefault(); window.location.href = a.href; }
    } catch (err) {}
  }, true);
})();"#;

/// JS-хук SoundCloud: перехватывает fetch/XHR, вычленяет client_id из URL
/// запросов к API и дублирует его в cookie (читается из Rust) и в заголовке.
const SOUNDCLOUD_HOOK_JS: &str = r#"(function(){
  if (window.__vesselScHook) return;
  window.__vesselScHook = true;
  var apply = function(id){
    if (id && /^[a-zA-Z0-9_-]{24,40}$/.test(id)) {
      document.cookie = 'vessel_sc_client_id=' + id + '; path=/; max-age=86400';
      document.title = 'SC_ID:' + id;
    }
  };
  var extract = function(u){
    try {
      if (typeof u === 'string' && u.indexOf('client_id=') !== -1) {
        apply(u.split('client_id=')[1].split('&')[0]);
      }
    } catch (e) {}
  };
  var origFetch = window.fetch;
  window.fetch = function(){
    try {
      var input = arguments[0];
      extract((input && input.url) ? input.url : input);
    } catch (e) {}
    return origFetch.apply(this, arguments);
  };
  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(m, u){
    extract(u);
    return origOpen.apply(this, arguments);
  };
  // Кукис мог остаться с прошлой сессии входа — сразу показываем его watcher'у
  try {
    var m = document.cookie.match(/vessel_sc_client_id=([^;]+)/);
    if (m) apply(m[1]);
  } catch (e) {}
})();"#;

/// Открывает окно WebView со soundcloud.com. Клиент_id нужен даже анониму —
/// страница сама шлёт его в каждом запросе к API, watcher перехватит и сохранит.
/// Логиниться не обязательно, но можно.
#[tauri::command]
pub async fn soundcloud_browser_login(app: AppHandle, core: CoreState<'_>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("soundcloud_login") {
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }
    let url = WebviewUrl::External(
        url::Url::parse("https://soundcloud.com/").map_err(|e| e.to_string())?,
    );
    WebviewWindowBuilder::new(&app, "soundcloud_login", url)
        .title("SoundCloud — подключение")
        .inner_size(1000.0, 720.0)
        .min_inner_size(600.0, 500.0)
        .build()
        .map_err(|e| e.to_string())?;
    spawn_soundcloud_client_id_watcher(app, core);
    Ok(())
}

/// Фоновая задача: каждые 2с инжектит хуки в окно и проверяет каналы перехвата:
/// cookie `vessel_sc_client_id`, заголовок окна. Через 10с без результата
/// подключает автопоиск client_id по HTTP (ассеты веб-плеера) — с ним вход
/// срабатывает даже если страница не отдала ключ через хук.
fn spawn_soundcloud_client_id_watcher(app: AppHandle, core: CoreState<'_>) {
    let core: Arc<Mutex<GuiCore>> = core.inner().clone();
    tokio::spawn(async move {
        const POLL_INTERVAL: std::time::Duration = std::time::Duration::from_millis(2000);
        let mut discovered: Option<String> = None;
        for attempt in 0..450u32 {
            tokio::time::sleep(POLL_INTERVAL).await;
            let Some(window) = app.get_webview_window("soundcloud_login") else {
                vessel_core::dlog!("[soundcloud] auth window closed without capture — cancelled");
                return;
            };
            if window.is_visible().unwrap_or(false) == false {
                continue;
            }
            // (Пере)инжектим хуки: на случай полной перезагрузки страницы.
            let _ = window.eval(POPUP_HOOK_JS);
            let _ = window.eval(SOUNDCLOUD_HOOK_JS);

            // Канал 1: cookie от JS-хука
            let cookie_id = tauri::async_runtime::spawn_blocking({
                let app = app.clone();
                move || crate::webview_cookies::collect_soundcloud_client_id(&app).ok()
            })
            .await
            .ok()
            .flatten();
            // Канал 2: заголовок окна
            let title_id = window
                .title()
                .ok()
                .and_then(|t| t.strip_prefix("SC_ID:").map(|s| s.trim().to_string()))
                .filter(|s| !s.is_empty());
            let captured = cookie_id.or(title_id);

            // Канал 3: автопоиск по HTTP (страница + JS-ассеты)
            if captured.is_none() && discovered.is_none() && attempt >= 5 && attempt % 5 == 0 {
                discovered = vessel_core::provider::soundcloud::discover_client_id()
                    .await
                    .ok();
            }
            let Some(client_id) = captured.or(discovered.clone()) else {
                continue;
            };

            vessel_core::dlog!(
                "[soundcloud] client_id detected ({} bytes) — saving",
                client_id.len()
            );
            {
                let mut core = core
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                let _ = core
                    .runtime
                    .save_credential(CredentialKind::SoundCloudClientId, &client_id);
                core.app.soundcloud_enabled = true;
                core.app.config_dirty = true;
                core.app.status_message = "SoundCloud подключён".to_string();
            }
            if let Some(window) = app.get_webview_window("soundcloud_login") {
                let _ = window.close();
            }
            vessel_core::dlog!("[soundcloud] authenticated: credential saved, window closed");
            return;
        }
        vessel_core::dlog!("[soundcloud] auth watcher timed out (15 min) — cancelled");
    });
}

/// Открыто ли окно входа SoundCloud (для UI-поллинга автоподключения).
#[tauri::command]
pub async fn soundcloud_login_window_open(app: AppHandle) -> Result<bool, String> {
    Ok(app.get_webview_window("soundcloud_login").is_some())
}

/// Отменяет вход в SoundCloud: закрывает окно, мониторинг остановится сам.
#[tauri::command]
pub async fn soundcloud_auth_cancel(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("soundcloud_login") {
        let _ = window.close();
    }
    vessel_core::dlog!("[soundcloud] auth cancelled by user");
    Ok(())
}

// ---------- Вход через браузер: Deezer (cookie arl) ----------

/// Открывает окно WebView со страницей входа Deezer. После логина сайт ставит
/// cookie `arl` — watcher перехватит её, сохранит и закроет окно.
#[tauri::command]
pub async fn deezer_browser_login(app: AppHandle, core: CoreState<'_>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("deezer_login") {
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }
    let url = WebviewUrl::External(
        url::Url::parse("https://www.deezer.com/login").map_err(|e| e.to_string())?,
    );
    WebviewWindowBuilder::new(&app, "deezer_login", url)
        .title("Deezer — вход")
        .inner_size(1000.0, 720.0)
        .min_inner_size(600.0, 500.0)
        .build()
        .map_err(|e| e.to_string())?;
    spawn_deezer_arl_watcher(app, core);
    Ok(())
}

/// Фоновая задача: опрашивает cookies окна, ждёт `arl`. Появилась — сохраняем
/// credential и закрываем окно. Ошибка сбора (пользователь ещё не вошёл) —
/// не фатальна, продолжаем ждать.
fn spawn_deezer_arl_watcher(app: AppHandle, core: CoreState<'_>) {
    let core: Arc<Mutex<GuiCore>> = core.inner().clone();
    tokio::spawn(async move {
        const POLL_INTERVAL: std::time::Duration = std::time::Duration::from_millis(2000);
        for _attempt in 0..450u32 {
            tokio::time::sleep(POLL_INTERVAL).await;
            let Some(window) = app.get_webview_window("deezer_login") else {
                vessel_core::dlog!("[deezer] auth window closed without login — cancelled");
                return;
            };
            if window.is_visible().unwrap_or(false) == false {
                continue;
            }
            // Всплывающие окна (вход через Google и т.п.) редиректим в это же окно
            let _ = window.eval(POPUP_HOOK_JS);
            let arl = match tauri::async_runtime::spawn_blocking({
                let app = app.clone();
                move || crate::webview_cookies::collect_deezer_arl(&app)
            })
            .await
            {
                Ok(Ok(arl)) => arl,
                Ok(Err(_)) => continue, // arl ещё нет — ждём, это не ошибка
                Err(_) => continue,
            };
            vessel_core::dlog!("[deezer] arl detected ({} bytes) — saving", arl.len());
            {
                let mut core = core
                    .lock()
                    .unwrap_or_else(|poisoned| poisoned.into_inner());
                let _ = core.runtime.save_credential(CredentialKind::DeezerArl, &arl);
                core.app.deezer_enabled = true;
                core.app.config_dirty = true;
                core.app.status_message = "Deezer подключён".to_string();
            }
            if let Some(window) = app.get_webview_window("deezer_login") {
                let _ = window.close();
            }
            vessel_core::dlog!("[deezer] authenticated: credential saved, window closed");
            return;
        }
        vessel_core::dlog!("[deezer] auth watcher timed out (15 min) — cancelled");
    });
}

/// Открыто ли окно входа Deezer (для UI-поллинга автоподключения).
#[tauri::command]
pub async fn deezer_login_window_open(app: AppHandle) -> Result<bool, String> {
    Ok(app.get_webview_window("deezer_login").is_some())
}

/// Отменяет вход в Deezer: закрывает окно, мониторинг остановится сам.
#[tauri::command]
pub async fn deezer_auth_cancel(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("deezer_login") {
        let _ = window.close();
    }
    vessel_core::dlog!("[deezer] auth cancelled by user");
    Ok(())
}

#[tauri::command]
pub async fn save_credential(
    core: CoreState<'_>,
    provider: String,
    value: String,
) -> Result<(), String> {
    let kind = credential_kind_from_str(&provider)?;
    let value = value.trim();
    if value.is_empty() {
        return Err("РєР»СЋС‡ РїСѓСЃС‚РѕР№".to_string());
    }
    let mut core = lock(&core);
    core.runtime
        .save_credential(kind, value)
        .map_err(|e| e.to_string())?;
    match kind {
        CredentialKind::SoundCloudClientId => {
            core.app.soundcloud_enabled = true;
        }
        CredentialKind::YandexToken => {
            core.app.yandex_enabled = true;
        }
        CredentialKind::DeezerArl => {
            core.app.deezer_enabled = true;
        }
        CredentialKind::SpotifySpDc => {
            core.app.spotify_enabled = true;
        }
        CredentialKind::SpotifyOAuthRefreshToken => {
            core.app.spotify_enabled = true;
        }
        CredentialKind::YouTubeCookie | CredentialKind::YouTubeOAuthRefresh => {
            core.app.youtube_music_enabled = true;
        }
    }
    core.app.config_dirty = true;
    Ok(())
}

#[tauri::command]
pub async fn probe_credential(
    core: CoreState<'_>,
    provider: String,
    value: String,
) -> Result<bool, String> {
    let kind = provider_kind_from_str(&provider)?;
    let value = value.trim();
    if value.is_empty() {
        return Err("РєР»СЋС‡ РїСѓСЃС‚РѕР№".to_string());
    }
    let proxy = {
        let core = lock(&core);
        core.config.spotify_proxy.clone()
    };
    match vessel_core::provider::probe_provider(kind, value, proxy.as_deref()).await {
        Ok(()) => Ok(true),
        Err(error) => Err(format!("{error:#}")),
    }
}

#[tauri::command]
pub async fn set_provider_enabled(
    core: CoreState<'_>,
    provider: String,
    enabled: bool,
) -> Result<(), String> {
    let mut core = lock(&core);
    let kind = match provider.as_str() {
        // YouTube Music РІСЃРµРіРґР° РІРєР»СЋС‡С‘РЅ вЂ” РІС‹РєР»СЋС‡РёС‚СЊ РЅРµР»СЊР·СЏ
        "youtube_music" | "youtube" => {
            core.app.youtube_music_enabled = true;
            return Ok(());
        }
        "soundcloud" => vessel_core::model::ProviderKind::SoundCloud,
        "yandex" => vessel_core::model::ProviderKind::YandexMusic,
        "deezer" => vessel_core::model::ProviderKind::Deezer,
        "spotify" => vessel_core::model::ProviderKind::Spotify,
        other => return Err(format!("РЅРµРёР·РІРµСЃС‚РЅС‹Р№ РїСЂРѕРІР°Р№РґРµСЂ: {other}")),
    };
    core.runtime.set_provider_enabled(kind, enabled);
    match kind {
        vessel_core::model::ProviderKind::SoundCloud => core.app.soundcloud_enabled = enabled,
        vessel_core::model::ProviderKind::YandexMusic => core.app.yandex_enabled = enabled,
        vessel_core::model::ProviderKind::Deezer => core.app.deezer_enabled = enabled,
        vessel_core::model::ProviderKind::Spotify => core.app.spotify_enabled = enabled,
        vessel_core::model::ProviderKind::YouTubeMusic => core.app.youtube_music_enabled = enabled,
    }
    core.app.config_dirty = true;
    Ok(())
}

#[tauri::command]
pub async fn remove_credential(core: CoreState<'_>, provider: String) -> Result<(), String> {
    let kind = credential_kind_from_str(&provider)?;
    let mut core = lock(&core);
    core.runtime
        .remove_credential(kind.secret_key())
        .map_err(|e| e.to_string())?;
    match kind {
        CredentialKind::SoundCloudClientId => {
            core.app.soundcloud_enabled = false;
        }
        CredentialKind::YandexToken => {
            core.app.yandex_enabled = false;
        }
        CredentialKind::DeezerArl => {
            core.app.deezer_enabled = false;
        }
        CredentialKind::SpotifySpDc => {
            core.app.spotify_enabled = false;
        }
        CredentialKind::SpotifyOAuthRefreshToken => {
            core.app.spotify_enabled = false;
        }
        CredentialKind::YouTubeCookie | CredentialKind::YouTubeOAuthRefresh => {}
    }
    core.app.config_dirty = true;
    Ok(())
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
        return Err("РїСЂРѕРІР°Р№РґРµСЂ С‚СЂРµРєР° РЅРµ РїРѕРґРєР»СЋС‡С‘РЅ".to_string());
    };
    provider
        .related(&track, limit.unwrap_or(20))
        .await
        .map_err(|e| format!("{e:#}"))
}

/// Р’РѕР·РІСЂР°С‰Р°РµС‚ СЂРµРєРѕРјРµРЅРґР°С†РёРё РґР»СЏ В«РњРѕРµР№ РІРѕР»РЅС‹В» / РїСѓСЃС‚РѕРіРѕ Search.
/// source: "favorites" | "playlists".
/// Р•СЃР»Рё source == "playlists" Рё РїРµСЂРµРґР°РЅ playlist_id вЂ” РІРѕР»РЅР° СЃС‚СЂРѕРёС‚СЃСЏ РёР· С‚СЂРµРєРѕРІ СЌС‚РѕРіРѕ РїР»РµР№Р»РёСЃС‚Р°.
/// providers: "all" РёР»Рё "soundcloud,deezer,yandex,spotify".
#[tauri::command]
pub async fn get_wave_recommendations(
    core: CoreState<'_>,
    source: String,
    size: Option<usize>,
    playlist_id: Option<uuid::Uuid>,
    providers: Option<String>,
) -> Result<Vec<TrackRef>, String> {
    let registry = {
        let core = lock(&core);
        core.runtime.provider_registry()
    };
    if registry.is_empty() {
        return Err("РЎРЅР°С‡Р°Р»Р° РґРѕР±Р°РІСЊ SoundCloud client_id РёР»Рё Yandex OAuth РІ РќР°СЃС‚СЂРѕР№РєР°С…".to_string());
    }
    let storage = {
        let core = lock(&core);
        core.storage.clone()
    };
    let src = vessel_core::recommendation::RecommendationSource::normalize(&source);
    let filter = providers.as_deref();
    let result = if src == vessel_core::recommendation::RecommendationSource::Playlists {
        if let Some(pid) = playlist_id {
            vessel_core::recommendation::recommend_from_playlist(&registry, &storage, pid, size.unwrap_or(20), filter).await
        } else {
            vessel_core::recommendation::recommend(&registry, &storage, src, size.unwrap_or(20), filter).await
        }
    } else {
        vessel_core::recommendation::recommend(&registry, &storage, src, size.unwrap_or(20), filter).await
    };
    Ok(result.tracks)
}

/// РўРµРєСѓС‰РёР№ РІС‹Р±СЂР°РЅРЅС‹Р№ РёСЃС‚РѕС‡РЅРёРє В«РњРѕРµР№ РІРѕР»РЅС‹В» ("favorites" | "playlists").
#[tauri::command]
pub async fn get_wave_source(core: CoreState<'_>) -> Result<String, String> {
    let core = lock(&core);
    Ok(core
        .config
        .wave_source
        .clone()
        .unwrap_or_else(|| "favorites".to_string()))
}

/// РЎРѕС…СЂР°РЅСЏРµС‚ РІС‹Р±СЂР°РЅРЅС‹Р№ РёСЃС‚РѕС‡РЅРёРє В«РњРѕРµР№ РІРѕР»РЅС‹В».
#[tauri::command]
pub async fn set_wave_source(core: CoreState<'_>, source: String) -> Result<(), String> {
    let mut core = lock(&core);
    let normalized = vessel_core::recommendation::RecommendationSource::normalize(&source).as_str();
    core.config.wave_source = Some(normalized.to_string());
    core.app.config_dirty = true;
    Ok(())
}

/// Р’С‹Р±СЂР°РЅРЅС‹Рµ РїСЂРѕРІР°Р№РґРµСЂС‹ В«РњРѕРµР№ РІРѕР»РЅС‹В» ("all" РёР»Рё "soundcloud,deezer,yandex,spotify").
#[tauri::command]
pub async fn get_wave_providers(core: CoreState<'_>) -> Result<String, String> {
    let core = lock(&core);
    Ok(core.config.wave_providers.clone().unwrap_or_else(|| "all".to_string()))
}

/// РЎРѕС…СЂР°РЅСЏРµС‚ РІС‹Р±СЂР°РЅРЅС‹Рµ РїСЂРѕРІР°Р№РґРµСЂС‹ В«РњРѕРµР№ РІРѕР»РЅС‹В».
#[tauri::command]
pub async fn set_wave_providers(core: CoreState<'_>, providers: String) -> Result<(), String> {
    let mut core = lock(&core);
    let normalized = if providers.trim().is_empty() {
        "all".to_string()
    } else {
        providers.trim().to_string()
    };
    core.config.wave_providers = Some(normalized);
    core.app.config_dirty = true;
    Ok(())
}

/// Р’С‹Р±СЂР°РЅРЅС‹Рµ РїСЂРѕРІР°Р№РґРµСЂС‹ РґР»СЏ СЂРµРєРѕРјРµРЅРґР°С†РёР№ РІ РїРѕРёСЃРєРµ (РѕС‚РґРµР»СЊРЅРѕ РѕС‚ РІРѕР»РЅС‹).
#[tauri::command]
pub async fn get_recommendation_providers(core: CoreState<'_>) -> Result<String, String> {
    let core = lock(&core);
    Ok(core.config.recommendation_providers.clone().unwrap_or_else(|| "all".to_string()))
}

/// РЎРѕС…СЂР°РЅСЏРµС‚ РІС‹Р±СЂР°РЅРЅС‹Рµ РїСЂРѕРІР°Р№РґРµСЂС‹ РґР»СЏ СЂРµРєРѕРјРµРЅРґР°С†РёР№ РІ РїРѕРёСЃРєРµ.
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
pub async fn reset_settings(core: CoreState<'_>) -> Result<(), String> {
    let mut core = lock(&core);
    let defaults = vessel_core::config::AppConfig::default();
    core.config.server_url = defaults.server_url;
    core.config.volume_percent = defaults.volume_percent;
    core.config.global_hotkeys_enabled = false;
    core.app.player.volume_percent = defaults.volume_percent;
    core.app
        .gui_dispatch(vessel_core::effect::AppEffect::SetVolume(defaults.volume_percent));
    core.app.config_dirty = true;
    Ok(())
}

#[tauri::command]
pub async fn reset_data(core: CoreState<'_>) -> Result<(), String> {
    let mut core = lock(&core);
    core.storage.clear_all().map_err(|e| e.to_string())?;
    core.app.gui_clear_history();
    core.app.queue.clear();
    core.app.queue_index = None;
    core.app.now_playing = None;
    core.app.library.clear();
    core.app.playlists.clear();
    core.app.queue_dirty = true;
    core.app.playlists_dirty = true;
    core.app.config_dirty = true;
    Ok(())
}

#[tauri::command]
pub async fn get_user_profile(core: CoreState<'_>) -> Result<Option<vessel_core::user::UserProfile>, String> {
    let core = lock(&core);
    Ok(core.app.user_profile.clone())
}

#[tauri::command]
pub async fn get_known_users(core: CoreState<'_>) -> Result<Vec<vessel_core::user::UserProfile>, String> {
    let core = lock(&core);
    core.users.known_users().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn switch_user(core: CoreState<'_>, name: String) -> Result<(), String> {
    let mut core = lock(&core);
    // РЎРѕС…СЂР°РЅСЏРµРј С‚РµРєСѓС‰РµРµ СЃРѕСЃС‚РѕСЏРЅРёРµ РїРµСЂРµРґ РїРµСЂРµРєР»СЋС‡РµРЅРёРµРј
    if let Err(e) = core.storage.save_queue(&core.app.queue_snapshot()) {
        vessel_core::dlog!("[vessel] save_queue on switch: {e}");
    }
    for playlist in &core.app.playlists {
        if let Err(e) = core.storage.save_playlist(playlist) {
            vessel_core::dlog!("[vessel] save_playlist on switch: {e}");
        }
    }
    core.users.switch_user(&name).map_err(|e| e.to_string())?;
    let storage = core.users.storage().clone();
    core.storage = storage;
    core.app.user_profile = Some(core.users.active_user().profile.clone());
    // РџРµСЂРµР·Р°РіСЂСѓР¶Р°РµРј РґР°РЅРЅС‹Рµ РЅРѕРІРѕРіРѕ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ
    core.app.library = core.storage.library_tracks().map_err(|e| e.to_string())?;
    core.app.playlists = core.storage.list_playlists().map_err(|e| e.to_string())?;
    let queue = core.storage.load_queue().map_err(|e| e.to_string())?;
    core.app.queue = queue.tracks;
    core.app.queue_index = queue.current_index;
    core.app.now_playing = queue.current_index.and_then(|i| core.app.queue.get(i).cloned());
    core.app.home_tracks = core
        .storage
        .recent_history(24)
        .unwrap_or_default()
        .into_iter()
        .map(|e| e.track)
        .collect();
    Ok(())
}

#[tauri::command]
pub async fn create_user(core: CoreState<'_>, name: String) -> Result<vessel_core::user::UserProfile, String> {
    let mut core = lock(&core);
    core.users.create_user(&name).map_err(|e| e.to_string())?;
    let storage = core.users.storage().clone();
    core.storage = storage;
    core.app.user_profile = Some(core.users.active_user().profile.clone());
    core.app.library.clear();
    core.app.playlists.clear();
    core.app.queue.clear();
    core.app.queue_index = None;
    core.app.now_playing = None;
    Ok(core.users.active_user().profile.clone())
}

#[tauri::command]
pub async fn export_user(core: CoreState<'_>, destination: String) -> Result<String, String> {
    let core = lock(&core);
    let dest = PathBuf::from(&destination);
    let exported = core.users.export_user(&dest).map_err(|e| e.to_string())?;
    Ok(exported.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn import_user(core: CoreState<'_>, source: String) -> Result<vessel_core::user::UserProfile, String> {
    let mut core = lock(&core);
    let src = PathBuf::from(&source);
    core.users.import_user(&src).map_err(|e| e.to_string())?;
    let storage = core.users.storage().clone();
    core.storage = storage;
    core.app.user_profile = Some(core.users.active_user().profile.clone());
    core.app.library = core.storage.library_tracks().map_err(|e| e.to_string())?;
    core.app.playlists = core.storage.list_playlists().map_err(|e| e.to_string())?;
    Ok(core.users.active_user().profile.clone())
}

#[tauri::command]
pub async fn backup_user(core: CoreState<'_>) -> Result<String, String> {
    let core = lock(&core);
    let path = core.users.active_user().backup().map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

/// Р’С‹Р±РѕСЂ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РїСЂРё СЃС‚Р°СЂС‚Рµ. Р•СЃР»Рё remember=true вЂ” СЃРѕС…СЂР°РЅСЏРµС‚ РІС‹Р±РѕСЂ РІ config
/// (auto_login_user), С‡С‚РѕР±С‹ Р±РѕР»СЊС€Рµ РЅРµ СЃРїСЂР°С€РёРІР°С‚СЊ.
#[tauri::command]
pub async fn select_user(core: CoreState<'_>, name: String, remember: bool) -> Result<(), String> {
    let mut core = lock(&core);
    core.users.switch_user(&name).map_err(|e| e.to_string())?;
    let storage = core.users.storage().clone();
    core.storage = storage;
    core.app.user_profile = Some(core.users.active_user().profile.clone());
    core.app.library = core.storage.library_tracks().map_err(|e| e.to_string())?;
    core.app.playlists = core.storage.list_playlists().map_err(|e| e.to_string())?;
    let queue = core.storage.load_queue().map_err(|e| e.to_string())?;
    core.app.queue = queue.tracks;
    core.app.queue_index = queue.current_index;
    core.app.now_playing = queue.current_index.and_then(|i| core.app.queue.get(i).cloned());
    core.app.home_tracks = core
        .storage
        .recent_history(24)
        .unwrap_or_default()
        .into_iter()
        .map(|e| e.track)
        .collect();
    if remember {
        core.config.auto_login_user = Some(name);
    } else {
        core.config.auto_login_user = None;
    }
    core.app.config_dirty = true;
    core.needs_user_selection = false;
    Ok(())
}

/// РЎР±СЂР°СЃС‹РІР°РµС‚ Р°РІС‚Рѕ-РІС…РѕРґ: РїСЂРё СЃР»РµРґСѓСЋС‰РµРј СЃС‚Р°СЂС‚Рµ РІС‹Р±РѕСЂ РїРѕСЏРІРёС‚СЃСЏ СЃРЅРѕРІР°.
#[tauri::command]
pub async fn clear_auto_login(core: CoreState<'_>) -> Result<(), String> {
    let mut core = lock(&core);
    core.config.auto_login_user = None;
    core.app.config_dirty = true;
    Ok(())
}

/// Р’РѕР·РІСЂР°С‰Р°РµС‚ С‚РµРєСѓС‰РёР№ Р°РІС‚Рѕ-РІС…РѕРґ (РёРјСЏ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ РёР»Рё null).
#[tauri::command]
pub async fn get_auto_login(core: CoreState<'_>) -> Result<Option<String>, String> {
    let core = lock(&core);
    Ok(core.config.auto_login_user.clone())
}

/// РЈРґР°Р»СЏРµС‚ РїРѕР»СЊР·РѕРІР°С‚РµР»СЏ (РЅРµР»СЊР·СЏ СѓРґР°Р»РёС‚СЊ Р°РєС‚РёРІРЅРѕРіРѕ).
#[tauri::command]
pub async fn delete_user(core: CoreState<'_>, name: String) -> Result<(), String> {
    let mut core = lock(&core);
    if core.config.auto_login_user.as_deref() == Some(name.as_str()) {
        core.config.auto_login_user = None;
        core.app.config_dirty = true;
    }
    core.users.delete_user(&name).map_err(|e| e.to_string())
}

/// Р’РѕР·РІСЂР°С‰Р°РµС‚ С‚РµРєСѓС‰РёР№ СЏР·С‹Рє РёРЅС‚РµСЂС„РµР№СЃР° ("ru" | "en").
#[tauri::command]
pub async fn get_language(core: CoreState<'_>) -> Result<String, String> {
    let core = lock(&core);
    Ok(core.config.language.clone())
}

/// РЈСЃС‚Р°РЅР°РІР»РёРІР°РµС‚ СЏР·С‹Рє РёРЅС‚РµСЂС„РµР№СЃР° ("ru" | "en").
#[tauri::command]
pub async fn set_language(core: CoreState<'_>, language: String) -> Result<(), String> {
    let mut core = lock(&core);
    let normalized = match language.as_str() {
        "en" | "english" | "English" => "en".to_string(),
        _ => "ru".to_string(),
    };
    core.config.language = normalized;
    core.app.config_dirty = true;
    Ok(())
}

/// РРјРїРѕСЂС‚ Р»Р°Р№РєРѕРІ РёР· РїР»Р°С‚С„РѕСЂРјС‹.
/// target: "favorites" | "playlist" (СЃРѕР·РґР°С‚СЊ РЅРѕРІС‹Р№ РїР»РµР№Р»РёСЃС‚)
/// profile_url РЅСѓР¶РµРЅ РґР»СЏ SoundCloud (https://soundcloud.com/username).
#[tauri::command]
pub async fn import_likes(
    core: CoreState<'_>,
    provider: String,
    target: String,
    profile_url: Option<String>,
    playlist_title: Option<String>,
) -> Result<usize, String> {
    let registry = {
        let core = lock(&core);
        core.runtime.provider_registry()
    };
    let kind = provider_kind_from_str(&provider)?;
    let Some(provider_impl) = registry.get(kind) else {
        return Err(format!("{} РЅРµ РїРѕРґРєР»СЋС‡С‘РЅ", kind.label()));
    };
    let tracks = provider_impl
        .liked_tracks(profile_url.as_deref())
        .await
        .map_err(|e| format!("{e:#}"))?;
    if tracks.is_empty() {
        return Err("Р»Р°Р№РєРѕРІ РЅРµ РЅР°Р№РґРµРЅРѕ".to_string());
    }

    let mut core = lock(&core);
    match target.as_str() {
        "favorites" => {
            let now_ms = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|d| d.as_millis() as i64)
                .unwrap_or_default();
            let mut added = 0;
            for track in &tracks {
                if core.storage.like_track(track, now_ms).is_ok() {
                    added += 1;
                }
            }
            core.app.library = core.storage.library_tracks().map_err(|e| e.to_string())?;
            core.app.config_dirty = true;
            Ok(added)
        }
        "playlist" => {
            let title = playlist_title
                .filter(|t| !t.trim().is_empty())
                .map(|t| t.trim().to_string())
                .unwrap_or_else(|| format!("Р›Р°Р№РєРё {}", kind.label()));
            let mut playlist = vessel_core::model::Playlist::new(title, now_ms());
            for track in tracks {
                playlist.push_unique(track);
            }
            core.storage
                .save_playlist(&playlist)
                .map_err(|e| e.to_string())?;
            core.app.playlists.insert(0, playlist.clone());
            core.app.playlists_dirty = true;
            Ok(playlist.tracks.len())
        }
        _ => Err("РЅРµРёР·РІРµСЃС‚РЅР°СЏ С†РµР»СЊ РёРјРїРѕСЂС‚Р°".to_string()),
    }
}

fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or_default()
}

// ---------- Нативные диалоги и проводник ----------

fn file_path_to_string(path: tauri_plugin_dialog::FilePath) -> String {
    match path {
        tauri_plugin_dialog::FilePath::Url(url) => url.to_string(),
        tauri_plugin_dialog::FilePath::Path(p) => p.to_string_lossy().into_owned(),
    }
}

#[tauri::command]
pub async fn pick_folder(app: AppHandle) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri_plugin_dialog::DialogExt;
        app.dialog()
            .file()
            .blocking_pick_folder()
            .map(file_path_to_string)
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn pick_file(app: AppHandle, extensions: Option<Vec<String>>) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri_plugin_dialog::DialogExt;
        let mut dialog = app.dialog().file();
        if let Some(exts) = extensions {
            if !exts.is_empty() {
                dialog = dialog.add_filter("Файлы", &exts.iter().map(String::as_str).collect::<Vec<_>>());
            }
        }
        dialog.blocking_pick_file().map(file_path_to_string)
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn save_file_as(
    app: AppHandle,
    default_name: Option<String>,
    extensions: Option<Vec<String>>,
) -> Result<Option<String>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        use tauri_plugin_dialog::DialogExt;
        let mut dialog = app.dialog().file();
        if let Some(name) = default_name {
            dialog = dialog.set_file_name(name);
        }
        if let Some(exts) = extensions {
            if !exts.is_empty() {
                dialog = dialog.add_filter("Файлы", &exts.iter().map(String::as_str).collect::<Vec<_>>());
            }
        }
        dialog.blocking_save_file().map(file_path_to_string)
    })
    .await
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn open_path(app: AppHandle, path: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener().open_path(path, None::<String>).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_users_dir(core: CoreState<'_>) -> Result<String, String> {
    let dir = lock(&core)
        .users
        .users_dir()
        .to_path_buf();
    Ok(dir.to_string_lossy().into_owned())
}




// ---------- VPN ----------

fn vpn_secret_name(id: &str) -> String {
    format!("vpn-profile:{id}")
}

#[tauri::command]
pub fn vpn_status(core: CoreState<'_>) -> Result<serde_json::Value, String> {
    let core = lock(&core);
    let status = core.vpn.status();
    Ok(serde_json::json!({
        "status": status.status,
        "profile_id": status.profile_id,
        "profile_name": status.profile_name,
        "error": status.error,
        "proxy_port": status.proxy_port,
        "core_present": core.vpn.core_present(),
        "core_path": core.vpn.core_binary_path(),
        "enabled": core.config.vpn_enabled,
    }))
}

#[tauri::command]
pub fn vpn_profiles(
    core: CoreState<'_>,
) -> Result<Vec<vessel_core::config::VpnProfileConfig>, String> {
    let core = lock(&core);
    Ok(core.config.vpn_profiles.clone())
}

fn vless_transport_label(
    security: &str,
    transport: &vessel_core::vpn::vless::VlessTransport,
) -> String {
    let security_label = match security {
        "reality" => "Reality",
        "tls" => "TLS",
        _ => "",
    };
    match (security_label.is_empty(), transport.kind()) {
        (true, "tcp") => "TCP".to_string(),
        (true, _) => transport.label(),
        (false, "tcp") => security_label.to_string(),
        (false, _) => format!("{security_label} · {}", transport.label()),
    }
}

#[tauri::command]
pub fn vpn_add_vless(
    core: CoreState<'_>,
    name: String,
    uri: String,
) -> Result<vessel_core::config::VpnProfileConfig, String> {
    let uri = uri.trim();
    let parsed = vessel_core::vpn::vless::parse_vless_uri(uri).map_err(|e| e.to_string())?;
    let now = now_ms();
    let display_name = {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            parsed.name.clone().unwrap_or_else(|| parsed.host.clone())
        } else {
            trimmed.to_string()
        }
    };
    let profile = vessel_core::config::VpnProfileConfig {
        id: uuid::Uuid::new_v4().to_string(),
        name: display_name,
        kind: "vless".to_string(),
        server: parsed.host.clone(),
        port: parsed.port,
        transport: vless_transport_label(&parsed.security, &parsed.transport),
        created_at_ms: now,
        updated_at_ms: now,
    };
    let secret = serde_json::json!({ "uri": uri }).to_string();
    let mut core = lock(&core);
    core.runtime
        .save_named_secret(&vpn_secret_name(&profile.id), &secret)
        .map_err(|e| e.to_string())?;
    core.config.vpn_profiles.push(profile.clone());
    core.config.vpn_active_profile_id = Some(profile.id.clone());
    core.app.config_dirty = true;
    Ok(profile)
}

#[tauri::command]
pub fn vpn_add_amnezia(
    core: CoreState<'_>,
    name: String,
    config_text: String,
) -> Result<vessel_core::config::VpnProfileConfig, String> {
    let parsed =
        vessel_core::vpn::amnezia::parse_awg_conf(&config_text).map_err(|e| e.to_string())?;
    let now = now_ms();
    let is_awg = parsed.obfuscation.jc.is_some() || parsed.obfuscation.h1.is_some();
    let display_name = {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            parsed.endpoint_host.clone()
        } else {
            trimmed.to_string()
        }
    };
    let profile = vessel_core::config::VpnProfileConfig {
        id: uuid::Uuid::new_v4().to_string(),
        name: display_name,
        kind: "amnezia".to_string(),
        server: parsed.endpoint_host.clone(),
        port: parsed.endpoint_port,
        transport: if is_awg { "AmneziaWG" } else { "WireGuard" }.to_string(),
        created_at_ms: now,
        updated_at_ms: now,
    };
    let secret = serde_json::json!({
        "private_key": parsed.private_key,
        "address": parsed.address,
        "peer_public_key": parsed.peer_public_key,
        "preshared_key": parsed.preshared_key,
        "allowed_ips": parsed.allowed_ips,
        "keepalive": parsed.keepalive,
        "mtu": parsed.mtu,
        "obfuscation": parsed.obfuscation,
    })
    .to_string();
    let mut core = lock(&core);
    core.runtime
        .save_named_secret(&vpn_secret_name(&profile.id), &secret)
        .map_err(|e| e.to_string())?;
    core.config.vpn_profiles.push(profile.clone());
    core.config.vpn_active_profile_id = Some(profile.id.clone());
    core.app.config_dirty = true;
    Ok(profile)
}

#[tauri::command]
pub fn vpn_remove_profile(core: CoreState<'_>, id: String) -> Result<(), String> {
    let mut core = lock(&core);
    let active = core.vpn.status().profile_id;
    if active.as_deref() == Some(id.as_str()) {
        return Err("нельзя удалить подключённый профиль — сначала отключись".to_string());
    }
    core.config.vpn_profiles.retain(|p| p.id != id);
    core.app.config_dirty = true;
    let _ = core.runtime.remove_named_secret(&vpn_secret_name(&id));
    Ok(())
}

#[tauri::command]
pub fn vpn_connect(core: CoreState<'_>, id: String) -> Result<(), String> {
    let profile = {
        let core = lock(&core);
        core.config
            .vpn_profiles
            .iter()
            .find(|p| p.id == id)
            .cloned()
            .ok_or_else(|| "профиль не найден".to_string())?
    };
    let secret_json = {
        let core = lock(&core);
        core.runtime
            .get_named_secret(&vpn_secret_name(&id))
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "секретные данные профиля не найдены — добавь профиль заново".to_string())?
    };
    let mut core = lock(&core);
    core.config.vpn_active_profile_id = Some(id.clone());
    core.app.config_dirty = true;
    core.vpn
        .connect(vessel_core::vpn::VpnConnectRequest {
            profile_id: profile.id,
            profile_name: profile.name,
            kind: profile.kind,
            secret_json,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vpn_set_enabled(core: CoreState<'_>, enabled: bool) -> Result<(), String> {
    let mut core = lock(&core);
    core.config.vpn_enabled = enabled;
    core.app.config_dirty = true;
    if !enabled {
        core.vpn.disconnect();
        return Ok(());
    }
    // Включаем: подключаемся к активному профилю (или первому доступному)
    let profile = core
        .config
        .vpn_profiles
        .iter()
        .find(|p| Some(&p.id) == core.config.vpn_active_profile_id.as_ref())
        .or_else(|| core.config.vpn_profiles.first())
        .cloned();
    let Some(profile) = profile else {
        return Err("нет ни одного профиля — сначала добавь подключение".to_string());
    };
    let secret_json = core
        .runtime
        .get_named_secret(&vpn_secret_name(&profile.id))
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "секретные данные профиля не найдены — добавь профиль заново".to_string())?;
    core.config.vpn_active_profile_id = Some(profile.id.clone());
    core.vpn
        .connect(vessel_core::vpn::VpnConnectRequest {
            profile_id: profile.id,
            profile_name: profile.name,
            kind: profile.kind,
            secret_json,
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vpn_select_profile(core: CoreState<'_>, id: String) -> Result<(), String> {
    let mut core = lock(&core);
    let profile = core
        .config
        .vpn_profiles
        .iter()
        .find(|p| p.id == id)
        .cloned()
        .ok_or_else(|| "профиль не найден".to_string())?;
    core.config.vpn_active_profile_id = Some(profile.id.clone());
    core.app.config_dirty = true;
    // VPN включён и активный профиль сменился — переподключаемся сами
    if core.config.vpn_enabled {
        let secret_json = core
            .runtime
            .get_named_secret(&vpn_secret_name(&profile.id))
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "секретные данные профиля не найдены — добавь профиль заново".to_string())?;
        core.vpn
            .connect(vessel_core::vpn::VpnConnectRequest {
                profile_id: profile.id,
                profile_name: profile.name,
                kind: profile.kind,
                secret_json,
            })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn vpn_disconnect(core: CoreState<'_>) -> Result<(), String> {
    let core = lock(&core);
    core.vpn.disconnect();
    Ok(())
}

#[tauri::command]
pub fn vpn_logs(core: CoreState<'_>, tail: Option<usize>) -> Result<Vec<String>, String> {
    let core = lock(&core);
    Ok(core.vpn.logs(tail.unwrap_or(80)))
}

#[tauri::command]
pub async fn vpn_check(core: CoreState<'_>) -> Result<Option<String>, String> {
    let proxy = lock(&core).vpn.active_proxy_string();
    let Some(proxy) = proxy else {
        return Ok(None);
    };
    tauri::async_runtime::spawn_blocking(move || {
        vessel_core::vpn::core::fetch_external_ip(&proxy)
    })
    .await
    .map_err(|e| e.to_string())?
    .map(Some)
    .map_err(|e| e.to_string())
}