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

/// Дополняет метаданные плейлиста для обратной совместимости со старыми серверами,
/// где is_album или artist_name могли отсутствовать.
fn enrich_playlist_metadata(
    p: &mut vessel_core::model::Playlist,
    local_playlists: &[vessel_core::model::Playlist],
    local_db: &[vessel_core::model::Playlist],
) {
    if !p.is_album {
        let is_album_from_local = local_playlists
            .iter()
            .find(|local| local.id == p.id)
            .map(|local| local.is_album)
            .unwrap_or(false);
        let is_album_from_db = local_db
            .iter()
            .find(|stored| stored.id == p.id)
            .map(|stored| stored.is_album)
            .unwrap_or(false);
        let is_album_from_canonical_url = p
            .source_url
            .as_ref()
            .map(|u| {
                let s = u.as_str().to_lowercase();
                s.contains("/album/")
                    || s.starts_with("spotify:album:")
                    || s.contains("browse/mpre")
                    || s.contains("list=olak5uy_")
            })
            .unwrap_or(false);

        if is_album_from_local || is_album_from_db || is_album_from_canonical_url {
            p.is_album = true;
        }
    }

    if p.artist_name.is_none() {
        if let Some(local) = local_playlists.iter().find(|l| l.id == p.id) {
            p.artist_name = local.artist_name.clone();
        } else if let Some(stored) = local_db.iter().find(|s| s.id == p.id) {
            p.artist_name = stored.artist_name.clone();
        }
    }
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
    let resp = client
        .auth_register(&req)
        .await
        .map_err(|e| e.to_string())?;

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
pub async fn auth_login(core: CoreState<'_>, req: LoginRequest) -> Result<AuthResult, String> {
    let client = official_client()?;
    let resp = client.auth_login(&req).await.map_err(|e| e.to_string())?;

    let lib = client.user_library(&resp.token).await.ok();
    let pl = client.user_playlists(&resp.token).await.ok();
    let cloud_settings = client.user_settings(&resp.token).await.ok();
    let cloud_artists = client.user_followed_artists(&resp.token).await.ok();

    let (has_local_data, secrets_file) = {
        let mut core = lock(&core);
        let has_local_data = !core.storage.library_tracks().unwrap_or_default().is_empty()
            || !core.storage.list_playlists().unwrap_or_default().is_empty()
            || !core
                .storage
                .list_followed_artists()
                .unwrap_or_default()
                .is_empty();

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
                enrich_playlist_metadata(p, &core.app.playlists, &local_db);
                let _ = core.storage.save_playlist(p);
            }
            core.app.playlists = pl.playlists;
        }
        if let Some(artists) = cloud_artists {
            for a in artists.artists {
                let _ = core.storage.follow_artist(&a);
            }
        }

        if let Some(ref cs) = cloud_settings {
            if let Some(ref s) = cs.settings {
                if let Some(ref lang) = s.language {
                    core.config.language = lang.clone();
                }
                if let Some(ref theme) = s.theme {
                    core.config.theme = theme.clone();
                }
                if let Some(ref rec) = s.recommendation_providers {
                    core.config.recommendation_providers = Some(rec.clone());
                }
                if let Some(incl) = s.include_playlists_in_recommendations {
                    core.config.include_playlists_in_recommendations = incl;
                }
                if let Some(ref excl) = s.excluded_recommendation_playlist_ids {
                    core.config.excluded_recommendation_playlist_ids = excl.clone();
                }
                if let Some(hist) = s.history_limit {
                    core.config.history_limit = hist.clamp(500, 10_000);
                }
                core.app.config_dirty = true;
            }
        }

        (has_local_data, core.paths.secrets_file.clone())
    };

    let secrets = SecretStore::new(secrets_file);
    let _ = secrets.set_named("vessel-user-session", &resp.token);
    let _ = secrets.set_named("vessel-user-username", &resp.user.username);
    let _ = secrets.set_named("vessel-user-id", &resp.user.id);

    // Синхронизация учетных данных музыкальных провайдеров из серверного Vault (Этап 6.5.1.D)
    let gen = vessel_core::vault_sync::next_account_generation();
    if let Ok(()) = vessel_core::vault_sync::sync_credentials_on_login(
        &client,
        &resp.token,
        &resp.user.id,
        gen,
        &secrets,
    )
    .await
    {
        let mut core = lock(&core);
        core.runtime.reload_providers();
        let creds = core.runtime.credential_state().unwrap_or_default();
        core.app.spotify_enabled = creds.spotify;
        core.app.yandex_enabled = creds.yandex;
        core.app.deezer_enabled = creds.deezer;
        core.app.soundcloud_enabled = creds.soundcloud;
        core.app.config_dirty = true;
    }

    Ok(AuthResult {
        user: resp.user,
        has_local_data,
    })
}

#[tauri::command]
pub async fn auth_logout(core: CoreState<'_>) -> Result<(), String> {
    let (token_opt, user_id_opt) = {
        let mut core = lock(&core);
        let user_id = match &core.account_state {
            AccountState::Authenticated { user_id, .. } => Some(user_id.clone()),
            _ => None,
        };
        core.account_state = AccountState::Guest;
        core.app.library = core.storage.library_tracks().unwrap_or_default();
        core.app.playlists = core.storage.list_playlists().unwrap_or_default();
        let secrets = SecretStore::new(core.paths.secrets_file.clone());
        let token = secrets.get_named("vessel-user-session").ok().flatten();
        let _ = secrets.remove_named("vessel-user-session");
        let _ = secrets.remove_named("vessel-user-username");
        let _ = secrets.remove_named("vessel-user-id");
        (token, user_id)
    };

    // Защита от гонок и инвалидация фоновых сетевых задач
    let _ = vessel_core::vault_sync::next_account_generation();

    // Безопасный logout: очищаем локальное пространство аккаунта и активные секреты,
    // не удаляя credentials на сервере и не затрагивая Guest/Offline
    if let Some(uid) = user_id_opt {
        let secrets = {
            let core = lock(&core);
            SecretStore::new(core.paths.secrets_file.clone())
        };
        vessel_core::vault_sync::clear_account_local_secrets(&uid, &secrets);
        let mut core = lock(&core);
        core.runtime.reload_providers();
        let creds = core.runtime.credential_state().unwrap_or_default();
        core.app.spotify_enabled = creds.spotify;
        core.app.yandex_enabled = creds.yandex;
        core.app.deezer_enabled = creds.deezer;
        core.app.soundcloud_enabled = creds.soundcloud;
        core.app.config_dirty = true;
    }

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
    let _ = vessel_core::vault_sync::next_account_generation();
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

    client
        .user_migrate(&token, &req)
        .await
        .map_err(|e| e.to_string())?;

    let local_artists = {
        let core = lock(&core);
        core.storage.list_followed_artists().unwrap_or_default()
    };
    if !local_artists.is_empty() {
        let sync_req = vessel_core::protocol::SyncArtistsRequest {
            artists: local_artists,
        };
        let _ = client.user_sync_artists(&token, &sync_req).await;
    }

    let lib = client
        .user_library(&token)
        .await
        .map_err(|e| e.to_string())?;
    let pl = client
        .user_playlists(&token)
        .await
        .map_err(|e| e.to_string())?;

    {
        let mut core = lock(&core);
        core.app.library = lib.tracks;
        let local_db = core.storage.list_playlists().unwrap_or_default();
        let mut playlists = pl.playlists;
        for p in &mut playlists {
            enrich_playlist_metadata(p, &core.app.playlists, &local_db);
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
    let lib = client
        .user_library(&token)
        .await
        .map_err(|e| e.to_string())?;
    let pl = client
        .user_playlists(&token)
        .await
        .map_err(|e| e.to_string())?;

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
            enrich_playlist_metadata(p, &core.app.playlists, &local_db);
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

#[tauri::command]
pub async fn auth_get_user_settings(
    core: CoreState<'_>,
) -> Result<vessel_core::protocol::UserSettingsResponse, String> {
    let token = {
        let core = lock(&core);
        if matches!(core.account_state, AccountState::Guest) {
            return Ok(vessel_core::protocol::UserSettingsResponse {
                settings: None,
                version: 0,
                updated_at_ms: 0,
            });
        }
        let secrets = SecretStore::new(core.paths.secrets_file.clone());
        secrets
            .get_named("vessel-user-session")
            .ok()
            .flatten()
            .ok_or_else(|| "Пользователь не авторизован".to_string())?
    };

    let client = official_client()?;
    client
        .user_settings(&token)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn auth_save_user_settings(
    core: CoreState<'_>,
    req: vessel_core::protocol::SaveUserSettingsRequest,
) -> Result<vessel_core::protocol::SaveUserSettingsResponse, String> {
    let token = {
        let core = lock(&core);
        if matches!(core.account_state, AccountState::Guest) {
            return Err("Гостевой режим: сохранение в облако отключено".to_string());
        }
        let secrets = SecretStore::new(core.paths.secrets_file.clone());
        secrets
            .get_named("vessel-user-session")
            .ok()
            .flatten()
            .ok_or_else(|| "Пользователь не авторизован".to_string())?
    };

    let client = official_client()?;
    client
        .user_settings_save(&token, &req)
        .await
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn auth_sync_settings(
    core: CoreState<'_>,
    local_settings: Option<vessel_core::protocol::SyncedUserSettings>,
) -> Result<vessel_core::protocol::UserSettingsResponse, String> {
    let (token_opt, is_guest) = {
        let core = lock(&core);
        let is_guest = matches!(core.account_state, AccountState::Guest);
        let secrets = SecretStore::new(core.paths.secrets_file.clone());
        let token = secrets.get_named("vessel-user-session").ok().flatten();
        (token, is_guest)
    };

    if is_guest || token_opt.is_none() {
        return Ok(vessel_core::protocol::UserSettingsResponse {
            settings: None,
            version: 0,
            updated_at_ms: 0,
        });
    }

    let token = token_opt.unwrap();
    let client = official_client()?;

    let remote = client
        .user_settings(&token)
        .await
        .map_err(|e| e.to_string())?;

    if let Some(ref remote_settings) = remote.settings {
        // Сервер имеет настройки: применяем только разрешённые поля к core.config
        let mut core = lock(&core);
        if let Some(ref lang) = remote_settings.language {
            core.config.language = lang.clone();
        }
        if let Some(ref theme) = remote_settings.theme {
            core.config.theme = theme.clone();
        }
        if let Some(ref rec) = remote_settings.recommendation_providers {
            core.config.recommendation_providers = Some(rec.clone());
        }
        if let Some(incl) = remote_settings.include_playlists_in_recommendations {
            core.config.include_playlists_in_recommendations = incl;
        }
        if let Some(ref excl) = remote_settings.excluded_recommendation_playlist_ids {
            core.config.excluded_recommendation_playlist_ids = excl.clone();
        }
        if let Some(hist) = remote_settings.history_limit {
            core.config.history_limit = hist.clamp(500, 10_000);
        }
        core.app.config_dirty = true;
        Ok(remote)
    } else {
        // На сервере настроек нет: первоначальная отправка локальных настроек с expected_version = 0
        let to_save = if let Some(local) = local_settings {
            local
        } else {
            let core = lock(&core);
            vessel_core::protocol::SyncedUserSettings {
                schema_version: 1,
                language: Some(core.config.language.clone()),
                theme: Some(core.config.theme.clone()),
                recommendation_providers: core.config.recommendation_providers.clone(),
                include_playlists_in_recommendations: Some(
                    core.config.include_playlists_in_recommendations,
                ),
                excluded_recommendation_playlist_ids: Some(
                    core.config.excluded_recommendation_playlist_ids.clone(),
                ),
                history_limit: Some(core.config.history_limit),
                ..Default::default()
            }
        };

        let req = vessel_core::protocol::SaveUserSettingsRequest {
            settings: to_save.clone(),
            expected_version: 0,
        };

        let saved = client
            .user_settings_save(&token, &req)
            .await
            .map_err(|e| e.to_string())?;
        Ok(vessel_core::protocol::UserSettingsResponse {
            settings: Some(to_save),
            version: saved.version,
            updated_at_ms: saved.updated_at_ms,
        })
    }
}
