use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use noverplay_tui::{
    credentials::CredentialKind,
    model::{Playlist, RepeatMode, SearchProvider, TrackRef},
    storage::HistoryEntry,
};
use serde::Serialize;
use tauri::State;

use crate::GuiCore;

type CoreState<'a> = State<'a, Arc<Mutex<GuiCore>>>;

fn lock<'a>(core: &'a CoreState<'a>) -> std::sync::MutexGuard<'a, GuiCore> {
    core.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn provider_kind_from_str(value: &str) -> Result<noverplay_tui::model::ProviderKind, String> {
    use noverplay_tui::model::ProviderKind;
    match value {
        "soundcloud" | "sound_cloud" => Ok(ProviderKind::SoundCloud),
        "yandex" | "yandex_music" => Ok(ProviderKind::YandexMusic),
        "deezer" => Ok(ProviderKind::Deezer),
        _ => Err(format!("неизвестный провайдер: {value}")),
    }
}

fn credential_kind_from_str(value: &str) -> Result<CredentialKind, String> {
    match value {
        "soundcloud" => Ok(CredentialKind::SoundCloudClientId),
        "yandex" => Ok(CredentialKind::YandexToken),
        "deezer" => Ok(CredentialKind::DeezerArl),
        _ => Err(format!("неизвестный провайдер: {value}")),
    }
}

fn repeat_from_str(value: &str) -> Result<RepeatMode, String> {
    match value {
        "off" => Ok(RepeatMode::Off),
        "all" => Ok(RepeatMode::All),
        "one" => Ok(RepeatMode::One),
        _ => Err(format!("неизвестный repeat: {value}")),
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
        Some(other) => return Err(format!("неизвестный провайдер: {other}")),
    };
    let pages = registry.search(&query, selection).await;
    let (tracks, failures) = noverplay_tui::runtime::merge_pages(pages);
    Ok(crate::SearchOutcome { tracks, failures })
}

#[tauri::command]
pub async fn search_collections(
    core: CoreState<'_>,
    query: String,
    kind: String,
) -> Result<Vec<noverplay_tui::provider::CollectionItem>, String> {
    use noverplay_tui::provider::CollectionKind;
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
    let registry = {
        let core = lock(&core);
        core.runtime.provider_registry()
    };
    if registry.is_empty() {
        return Err("Сначала добавь ключ провайдера в Настройках".to_string());
    }
    let kinds = [
        noverplay_tui::model::ProviderKind::SoundCloud,
        noverplay_tui::model::ProviderKind::YandexMusic,
        noverplay_tui::model::ProviderKind::Deezer,
    ];
    let mut items = Vec::new();
    for provider_kind in kinds {
        let Some(provider) = registry.get(provider_kind) else {
            continue;
        };
        if let Ok(found) = provider.search_collections(&query, kind).await {
            items.extend(found);
        }
    }
    Ok(items)
}

#[tauri::command]
pub async fn artist_profile(
    core: CoreState<'_>,
    provider: String,
    artist_id: String,
) -> Result<noverplay_tui::provider::ArtistProfile, String> {
    use noverplay_tui::model::ProviderKind;
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
    noverplay_tui::provider::download::downloads_dir()
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
            noverplay_tui::provider::cache::track_cache_dir()
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
    noverplay_tui::provider::cache::set_track_cache_dir(value.map(PathBuf::from));
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
        return Err("провайдер не подключён".to_string());
    };
    let source = provider
        .download_source(&track)
        .await
        .map_err(|e| format!("{e:#}"))?;
    let dir = {
        let core = lock(&core);
        resolve_download_dir(&core)
    };
    let file_name = noverplay_tui::provider::download::track_file_name(&track, &source);
    let dest = std::path::Path::new(&dir).join(file_name);
    if dest.exists() {
        return Ok(dest.display().to_string());
    }
    noverplay_tui::provider::download::download_playback_source(&source, &dest)
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
        return Err("провайдер не подключён".to_string());
    };
    if noverplay_tui::provider::cache::is_cached(&track) {
        if let Some(path) = noverplay_tui::provider::cache::cached_track_path(&track) {
            return Ok(path.display().to_string());
        }
    }
    let source = provider
        .download_source(&track)
        .await
        .map_err(|e| format!("{e:#}"))?;
    let path = noverplay_tui::provider::cache::download_track_to_cache(&track, &source)
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
        if noverplay_tui::provider::cache::is_cached(&track) {
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
        match noverplay_tui::provider::cache::download_track_to_cache(&track, &source).await {
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
        return Err("Этот трек недоступен для воспроизведения".to_string());
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
        return Err("нет треков".to_string());
    }
    let start = start.min(tracks.len() - 1);
    if !tracks[start].capability.can_play() {
        return Err("Выбранный трек недоступен для воспроизведения".to_string());
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
        return Err("очередь пуста".to_string());
    }
    core.app.control_next();
    Ok(())
}

#[tauri::command]
pub async fn previous(core: CoreState<'_>) -> Result<(), String> {
    let mut core = lock(&core);
    if core.app.queue.is_empty() {
        return Err("очередь пуста".to_string());
    }
    core.app.control_previous();
    Ok(())
}

#[tauri::command]
pub async fn seek(core: CoreState<'_>, position_ms: u64) -> Result<(), String> {
    let mut core = lock(&core);
    core.app.gui_seek_to(position_ms);
    Ok(())
}

#[tauri::command]
pub async fn set_volume(core: CoreState<'_>, volume_percent: u8) -> Result<(), String> {
    let mut core = lock(&core);
    let volume = volume_percent.min(100);
    core.app.player.volume_percent = volume;
    core.app
        .gui_dispatch(noverplay_tui::effect::AppEffect::SetVolume(volume));
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
        return Err("индекс вне очереди".to_string());
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
        return Err("индекс вне очереди".to_string());
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
        return Err("индекс вне библиотеки".to_string());
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
        return Err("пустой порядок очереди".to_string());
    }
    // Текущий трек всегда первый в очереди, остальные — в порядке из UI.
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
    let parsed = url::Url::parse(&url).map_err(|e| format!("Неверный URL: {e}"))?;
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
    // Дубли по ссылке нельзя: один плейлист/альбом — одна запись
    if playlist
        .source_url
        .as_ref()
        .is_some_and(|url| core.app.playlists.iter().any(|p| p.source_url.as_ref() == Some(url)))
    {
        return Err("Этот плейлист уже добавлен в библиотеку".to_string());
    }
    if core
        .app
        .playlists
        .iter()
        .any(|p| p.source_url.is_none() && p.title == playlist.title && playlist.source_url.is_none())
    {
        return Err("Этот плейлист уже добавлен в библиотеку".to_string());
    }
    core.storage
        .save_playlist(&playlist)
        .map_err(|e| e.to_string())?;
    core.app.playlists.insert(0, playlist);
    persist_playlist_order(&mut core);
    core.app.playlists_dirty = true;
    Ok(())
}

/// Пишет position для всех плейлистов в порядке app.playlists.
fn persist_playlist_order(core: &mut GuiCore) {
    let order: Vec<String> = core
        .app
        .playlists
        .iter()
        .map(|p| p.id.to_string())
        .collect();
    if let Err(error) = core.storage.save_playlists_order(&order) {
        eprintln!("[vessel] save_playlists_order: {error}");
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

/// Ключ трека в формате фронтенда: provider (snake_case) + id.
fn frontend_track_key(track: &TrackRef) -> String {
    use noverplay_tui::model::ProviderKind;
    let provider = match track.provider {
        ProviderKind::SoundCloud => "sound_cloud",
        ProviderKind::YandexMusic => "yandex_music",
        ProviderKind::Deezer => "deezer",
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
    let parsed = url::Url::parse(&url).map_err(|e| format!("Неверный URL: {e}"))?;
    // Дубли по ссылке нельзя: один плейлист/альбом — одна запись
    {
        let core = lock(&core);
        if core
            .app
            .playlists
            .iter()
            .any(|p| p.source_url.as_ref() == Some(&parsed))
        {
            return Err("Этот плейлист уже добавлен в библиотеку".to_string());
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
        .ok_or_else(|| "плейлист не создался".to_string())?;
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
        return Err("плейлист не найден или пуст".to_string());
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

#[tauri::command]
pub async fn save_credential(
    core: CoreState<'_>,
    provider: String,
    value: String,
) -> Result<(), String> {
    let kind = credential_kind_from_str(&provider)?;
    let value = value.trim();
    if value.is_empty() {
        return Err("ключ пустой".to_string());
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
    }
    core.app.config_dirty = true;
    Ok(())
}

#[tauri::command]
pub async fn probe_credential(
    _core: CoreState<'_>,
    provider: String,
    value: String,
) -> Result<bool, String> {
    let kind = provider_kind_from_str(&provider)?;
    let value = value.trim();
    if value.is_empty() {
        return Err("ключ пустой".to_string());
    }
    match noverplay_tui::provider::probe_provider(kind, value).await {
        Ok(()) => Ok(true),
        Err(error) => Err(format!("{error:#}")),
    }
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
        return Err("провайдер трека не подключён".to_string());
    };
    provider
        .related(&track, limit.unwrap_or(20))
        .await
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
pub async fn reset_settings(core: CoreState<'_>) -> Result<(), String> {
    let mut core = lock(&core);
    let defaults = noverplay_tui::config::AppConfig::default();
    core.config.server_url = defaults.server_url;
    core.config.volume_percent = defaults.volume_percent;
    core.config.global_hotkeys_enabled = false;
    core.app.player.volume_percent = defaults.volume_percent;
    core.app
        .gui_dispatch(noverplay_tui::effect::AppEffect::SetVolume(defaults.volume_percent));
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
