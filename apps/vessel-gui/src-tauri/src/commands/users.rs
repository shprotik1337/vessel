use std::path::PathBuf;

use serde::Serialize;
use vessel_core::{
    config::{OFFICIAL_SERVER_TOKEN, OFFICIAL_SERVER_URL},
    model::TrackRef,
    protocol::{
        CaptchaChallenge, LoginRequest, MigrateDataRequest, RegisterRequest, UpdateProfileRequest,
        UserInfo,
    },
    provider::remote::ServerClient,
    secrets::SecretStore,
    user::AccountState,
};

use super::common::{lock, now_ms, CoreState};

#[derive(Serialize, Clone, Debug)]
pub struct AuthResult {
    pub user: UserInfo,
    pub has_local_data: bool,
}

pub fn official_client() -> Result<ServerClient, String> {
    ServerClient::new(OFFICIAL_SERVER_URL, OFFICIAL_SERVER_TOKEN)
        .map_err(|e| format!("Не удалось инициализировать клиент сервера: {e}"))
}

#[tauri::command]
pub async fn auth_get_captcha() -> Result<CaptchaChallenge, String> {
    let client = official_client()?;
    client.auth_captcha().await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn auth_register(
    core: CoreState<'_>,
    req: RegisterRequest,
) -> Result<AuthResult, String> {
    let client = official_client()?;
    let resp = client.auth_register(&req).await.map_err(|e| e.to_string())?;

    let (has_local_data, secrets_file) = {
        let mut core = lock(&core);
        let has_local_data = !core.storage.library_tracks().unwrap_or_default().is_empty()
            || !core.storage.list_playlists().unwrap_or_default().is_empty();

        core.account_state = AccountState::Authenticated {
            username: resp.user.username.clone(),
            user_id: resp.user.id.clone(),
        };
        (has_local_data, core.paths.secrets_file.clone())
    };

    let secrets = SecretStore::new(secrets_file);
    let _ = secrets.set_named("vessel-user-session", &resp.token);
    let _ = secrets.set_named("vessel-user-username", &resp.user.username);
    let _ = secrets.set_named("vessel-user-id", &resp.user.id);

    Ok(AuthResult {
        user: resp.user,
        has_local_data,
    })
}

#[tauri::command]
pub async fn auth_login(
    core: CoreState<'_>,
    req: LoginRequest,
) -> Result<AuthResult, String> {
    let client = official_client()?;
    let resp = client.auth_login(&req).await.map_err(|e| e.to_string())?;

    let lib = client.user_library(&resp.token).await.ok();
    let pl = client.user_playlists(&resp.token).await.ok();

    let (has_local_data, secrets_file) = {
        let mut core = lock(&core);
        let has_local_data = !core.storage.library_tracks().unwrap_or_default().is_empty()
            || !core.storage.list_playlists().unwrap_or_default().is_empty();

        core.account_state = AccountState::Authenticated {
            username: resp.user.username.clone(),
            user_id: resp.user.id.clone(),
        };

        if let Some(lib) = lib {
            core.app.library = lib.tracks;
        }
        if let Some(pl) = pl {
            core.app.playlists = pl.playlists;
        }

        (has_local_data, core.paths.secrets_file.clone())
    };

    let secrets = SecretStore::new(secrets_file);
    let _ = secrets.set_named("vessel-user-session", &resp.token);
    let _ = secrets.set_named("vessel-user-username", &resp.user.username);
    let _ = secrets.set_named("vessel-user-id", &resp.user.id);

    Ok(AuthResult {
        user: resp.user,
        has_local_data,
    })
}

#[tauri::command]
pub async fn auth_logout(core: CoreState<'_>) -> Result<(), String> {
    let token_opt = {
        let mut core = lock(&core);
        core.account_state = AccountState::Guest;
        core.app.library = core.storage.library_tracks().unwrap_or_default();
        core.app.playlists = core.storage.list_playlists().unwrap_or_default();
        let secrets = SecretStore::new(core.paths.secrets_file.clone());
        let token = secrets.get_named("vessel-user-session").ok().flatten();
        let _ = secrets.remove_named("vessel-user-session");
        let _ = secrets.remove_named("vessel-user-username");
        let _ = secrets.remove_named("vessel-user-id");
        token
    };

    if let Some(token) = token_opt {
        tokio::spawn(async move {
            if let Ok(client) = official_client() {
                let _ = client.auth_logout(&token).await;
            }
        });
    }

    Ok(())
}

#[tauri::command]
pub async fn auth_continue_guest(core: CoreState<'_>) -> Result<(), String> {
    let mut core = lock(&core);
    core.account_state = AccountState::Guest;
    core.app.library = core.storage.library_tracks().unwrap_or_default();
    core.app.playlists = core.storage.list_playlists().unwrap_or_default();
    let secrets = SecretStore::new(core.paths.secrets_file.clone());
    let _ = secrets.remove_named("vessel-user-session");
    Ok(())
}

#[tauri::command]
pub async fn auth_get_profile(core: CoreState<'_>) -> Result<UserInfo, String> {
    let token = {
        let core = lock(&core);
        let secrets = SecretStore::new(core.paths.secrets_file.clone());
        secrets
            .get_named("vessel-user-session")
            .ok()
            .flatten()
            .ok_or_else(|| "Пользователь не авторизован".to_string())?
    };

    let client = official_client()?;
    client.user_profile(&token).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn auth_update_profile(
    core: CoreState<'_>,
    req: UpdateProfileRequest,
) -> Result<UserInfo, String> {
    let token = {
        let core = lock(&core);
        let secrets = SecretStore::new(core.paths.secrets_file.clone());
        secrets
            .get_named("vessel-user-session")
            .ok()
            .flatten()
            .ok_or_else(|| "Пользователь не авторизован".to_string())?
    };

    let client = official_client()?;
    let updated = client
        .user_update_profile(&token, &req)
        .await
        .map_err(|e| e.to_string())?;

    {
        let mut core = lock(&core);
        if let AccountState::Authenticated { username, .. } = &mut core.account_state {
            *username = updated.username.clone();
        }
        let secrets = SecretStore::new(core.paths.secrets_file.clone());
        let _ = secrets.set_named("vessel-user-username", &updated.username);
    }

    Ok(updated)
}

#[tauri::command]
pub async fn auth_migrate_data(core: CoreState<'_>) -> Result<(), String> {
    let (secrets_file, local_library, local_playlists, local_history) = {
        let core = lock(&core);
        (
            core.paths.secrets_file.clone(),
            core.storage.library_tracks().unwrap_or_default(),
            core.storage.list_playlists().unwrap_or_default(),
            core.storage
                .recent_history(100)
                .unwrap_or_default()
                .into_iter()
                .map(|h| h.track)
                .collect::<Vec<_>>(),
        )
    };

    let secrets = SecretStore::new(secrets_file);
    let token = secrets
        .get_named("vessel-user-session")
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "Нет активной сессии пользователя".to_string())?;

    let client = official_client()?;
    let req = MigrateDataRequest {
        library: local_library,
        playlists: local_playlists,
        history: local_history,
    };

    client.user_migrate(&token, &req).await.map_err(|e| e.to_string())?;

    let lib = client.user_library(&token).await.map_err(|e| e.to_string())?;
    let pl = client.user_playlists(&token).await.map_err(|e| e.to_string())?;

    {
        let mut core = lock(&core);
        core.app.library = lib.tracks;
        core.app.playlists = pl.playlists;
    }

    Ok(())
}

#[derive(Serialize, Clone, Debug)]
pub struct CloudSyncResult {
    pub tracks_count: usize,
    pub playlists_count: usize,
}

#[tauri::command]
pub async fn auth_download_cloud_data(core: CoreState<'_>) -> Result<CloudSyncResult, String> {
    let (_secrets_file, token) = {
        let core = lock(&core);
        let secrets = SecretStore::new(core.paths.secrets_file.clone());
        let token = secrets
            .get_named("vessel-user-session")
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "Нет активной сессии пользователя".to_string())?;
        (core.paths.secrets_file.clone(), token)
    };

    let client = official_client()?;
    let lib = client.user_library(&token).await.map_err(|e| e.to_string())?;
    let pl = client.user_playlists(&token).await.map_err(|e| e.to_string())?;

    let tracks_count = lib.tracks.len();
    let playlists_count = pl.playlists.len();

    {
        let mut core = lock(&core);
        let now = now_ms();
        for track in &lib.tracks {
            let _ = core.storage.like_track(track, now);
        }
        for playlist in &pl.playlists {
            let _ = core.storage.save_playlist(playlist);
        }
        core.app.library = lib.tracks;
        core.app.playlists = pl.playlists;
    }

    Ok(CloudSyncResult {
        tracks_count,
        playlists_count,
    })
}

#[tauri::command]
pub async fn import_tracks_batch(
    core: CoreState<'_>,
    tracks: Vec<TrackRef>,
) -> Result<usize, String> {
    let mut added = 0;
    let mut core = lock(&core);
    let now = now_ms();
    for track in tracks {
        let key = track.provider_key();
        if !core.app.library.iter().any(|t| t.provider_key() == key) {
            if let Ok(()) = core.storage.like_track(&track, now) {
                core.app.library.push(track);
                added += 1;
            }
        }
    }
    Ok(added)
}

#[tauri::command]
pub async fn auth_get_account_state(core: CoreState<'_>) -> Result<AccountState, String> {
    let core = lock(&core);
    Ok(core.account_state.clone())
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
    let dir = lock(&core)
        .users
        .users_dir()
        .to_path_buf();
    Ok(dir.to_string_lossy().into_owned())
}
