use serde::Serialize;
use vessel_core::{
    config::{OFFICIAL_SERVER_TOKEN, OFFICIAL_SERVER_URL},
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
        if let Some(mut pl) = pl {
            let local_db = core.storage.list_playlists().unwrap_or_default();
            for p in &mut pl.playlists {
                let is_album_from_url = p.source_url.as_ref().map(|u| {
                    let s = u.as_str().to_lowercase();
                    s.contains("/album/")
                        || s.contains("spotify:album:")
                        || s.contains("browse/mpre")
                        || s.contains("album")
                }).unwrap_or(false);

                let is_album_from_local = core.app.playlists.iter().find(|local| local.id == p.id).map(|local| local.is_album).unwrap_or(false);
                let is_album_from_db = local_db.iter().find(|stored| stored.id == p.id).map(|stored| stored.is_album).unwrap_or(false);

                if is_album_from_url || is_album_from_local || is_album_from_db {
                    p.is_album = true;
                }
                if p.artist_name.is_none() {
                    if let Some(local) = core.app.playlists.iter().find(|l| l.id == p.id) {
                        p.artist_name = local.artist_name.clone();
                    } else if let Some(stored) = local_db.iter().find(|s| s.id == p.id) {
                        p.artist_name = stored.artist_name.clone();
                    }
                }
                let _ = core.storage.save_playlist(p);
            }
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
        let local_db = core.storage.list_playlists().unwrap_or_default();
        let mut playlists = pl.playlists;
        for p in &mut playlists {
            let is_album_from_url = p.source_url.as_ref().map(|u| {
                let s = u.as_str().to_lowercase();
                s.contains("/album/")
                    || s.contains("spotify:album:")
                    || s.contains("browse/mpre")
                    || s.contains("album")
            }).unwrap_or(false);

            let is_album_from_local = core.app.playlists.iter().find(|local| local.id == p.id).map(|local| local.is_album).unwrap_or(false);
            let is_album_from_db = local_db.iter().find(|stored| stored.id == p.id).map(|stored| stored.is_album).unwrap_or(false);

            if is_album_from_url || is_album_from_local || is_album_from_db {
                p.is_album = true;
            }
            if p.artist_name.is_none() {
                if let Some(local) = core.app.playlists.iter().find(|l| l.id == p.id) {
                    p.artist_name = local.artist_name.clone();
                } else if let Some(stored) = local_db.iter().find(|s| s.id == p.id) {
                    p.artist_name = stored.artist_name.clone();
                }
            }
        }
        core.app.playlists = playlists;
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
        let local_db = core.storage.list_playlists().unwrap_or_default();
        let mut playlists = pl.playlists;
        for p in &mut playlists {
            let is_album_from_url = p.source_url.as_ref().map(|u| {
                let s = u.as_str().to_lowercase();
                s.contains("/album/")
                    || s.contains("spotify:album:")
                    || s.contains("browse/mpre")
                    || s.contains("album")
            }).unwrap_or(false);

            let is_album_from_local = core.app.playlists.iter().find(|local| local.id == p.id).map(|local| local.is_album).unwrap_or(false);
            let is_album_from_db = local_db.iter().find(|stored| stored.id == p.id).map(|stored| stored.is_album).unwrap_or(false);

            if is_album_from_url || is_album_from_local || is_album_from_db {
                p.is_album = true;
            }
            if p.artist_name.is_none() {
                if let Some(local) = core.app.playlists.iter().find(|l| l.id == p.id) {
                    p.artist_name = local.artist_name.clone();
                } else if let Some(stored) = local_db.iter().find(|s| s.id == p.id) {
                    p.artist_name = stored.artist_name.clone();
                }
            }
            let _ = core.storage.save_playlist(p);
        }
        core.app.library = lib.tracks;
        core.app.playlists = playlists;
    }

    Ok(CloudSyncResult {
        tracks_count,
        playlists_count,
    })
}

#[tauri::command]
pub async fn auth_get_account_state(core: CoreState<'_>) -> Result<AccountState, String> {
    let core = lock(&core);
    Ok(core.account_state.clone())
}
