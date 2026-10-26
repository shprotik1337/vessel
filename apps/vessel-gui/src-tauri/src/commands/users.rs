use std::path::PathBuf;

pub use super::auth::official_client;
use super::common::{lock, CoreState};

#[tauri::command]
pub async fn get_user_profile(
    core: CoreState<'_>,
) -> Result<Option<vessel_core::user::UserProfile>, String> {
    let core = lock(&core);
    Ok(core.app.user_profile.clone())
}

#[tauri::command]
pub async fn get_known_users(
    core: CoreState<'_>,
) -> Result<Vec<vessel_core::user::UserProfile>, String> {
    let core = lock(&core);
    core.users.known_users().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn switch_user(core: CoreState<'_>, name: String) -> Result<(), String> {
    let mut core = lock(&core);
    // Сохраняем текущее состояние перед переключением
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
    // Перезагружаем данные нового пользователя
    core.app.library = core.storage.library_tracks().map_err(|e| e.to_string())?;
    core.app.playlists = core.storage.list_playlists().map_err(|e| e.to_string())?;
    let queue = core.storage.load_queue().map_err(|e| e.to_string())?;
    core.app.queue = queue.tracks;
    core.app.queue_index = queue.current_index;
    core.app.now_playing = queue
        .current_index
        .and_then(|i| core.app.queue.get(i).cloned());
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
pub async fn create_user(
    core: CoreState<'_>,
    name: String,
) -> Result<vessel_core::user::UserProfile, String> {
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
pub async fn import_user(
    core: CoreState<'_>,
    source: String,
) -> Result<vessel_core::user::UserProfile, String> {
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
    let path = core
        .users
        .active_user()
        .backup()
        .map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().to_string())
}

/// Выбор пользователя при старте. Если remember=true — сохраняет выбор в config
/// (auto_login_user), чтобы больше не спрашивать.
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
    core.app.now_playing = queue
        .current_index
        .and_then(|i| core.app.queue.get(i).cloned());
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

/// Сбрасывает авто-вход: при следующем старте выбор появится снова.
#[tauri::command]
pub async fn clear_auto_login(core: CoreState<'_>) -> Result<(), String> {
    let mut core = lock(&core);
    core.config.auto_login_user = None;
    core.app.config_dirty = true;
    Ok(())
}

/// Возвращает текущий авто-вход (имя пользователя или null).
#[tauri::command]
pub async fn get_auto_login(core: CoreState<'_>) -> Result<Option<String>, String> {
    let core = lock(&core);
    Ok(core.config.auto_login_user.clone())
}

/// Удаляет пользователя (нельзя удалить активного).
#[tauri::command]
pub async fn delete_user(core: CoreState<'_>, name: String) -> Result<(), String> {
    let mut core = lock(&core);
    if core.config.auto_login_user.as_deref() == Some(name.as_str()) {
        core.config.auto_login_user = None;
        core.app.config_dirty = true;
    }
    core.users.delete_user(&name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_users_dir(core: CoreState<'_>) -> Result<String, String> {
    let dir = lock(&core).users.users_dir().to_path_buf();
    Ok(dir.to_string_lossy().into_owned())
}
