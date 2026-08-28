use std::sync::{Arc, Mutex};

use noverplay_tui::{
    credentials::CredentialKind,
    model::{Playlist, RepeatMode, SearchProvider, TrackRef},
    storage::HistoryEntry,
};
use tauri::State;

use crate::GuiCore;

type CoreState<'a> = State<'a, Arc<Mutex<GuiCore>>>;

fn lock<'a>(core: &'a CoreState<'a>) -> std::sync::MutexGuard<'a, GuiCore> {
    core.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn provider_kind_from_str(value: &str) -> Result<noverplay_tui::model::ProviderKind, String> {
    use noverplay_tui::model::ProviderKind;
    match value {
        "soundcloud" => Ok(ProviderKind::SoundCloud),
        "yandex" => Ok(ProviderKind::YandexMusic),
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
pub async fn search(core: CoreState<'_>, query: String) -> Result<crate::SearchOutcome, String> {
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
    let pages = registry.search(&query, SearchProvider::All).await;
    let (tracks, failures) = noverplay_tui::runtime::merge_pages(pages);
    Ok(crate::SearchOutcome { tracks, failures })
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
