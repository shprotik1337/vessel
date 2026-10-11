use vessel_core::{model::TrackRef, storage::HistoryEntry};

use super::common::{CoreState, lock, repeat_from_str};

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
pub async fn reorder_queue(
    core: CoreState<'_>,
    tracks: Vec<TrackRef>,
) -> Result<(), String> {
    let mut core = lock(&core);
    if tracks.is_empty() && !core.app.queue.is_empty() {
        return Err("пустой порядок очереди".to_string());
    }
    let now_key = core.app.now_playing.as_ref().map(|t| t.provider_key());
    if let Some(now_key) = now_key {
        if let Some(pos) = tracks.iter().position(|t| t.provider_key() == now_key) {
            core.app.queue_index = Some(pos);
        }
    }
    core.app.queue = tracks;
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
pub async fn set_crossfade(core: CoreState<'_>, duration_ms: u32) -> Result<(), String> {
    let core = lock(&core);
    core.runtime.set_audio_crossfade(duration_ms);
    Ok(())
}

#[tauri::command]
pub async fn set_audio_agc(core: CoreState<'_>, enabled: bool) -> Result<(), String> {
    let core = lock(&core);
    core.runtime.set_audio_agc(enabled);
    Ok(())
}
