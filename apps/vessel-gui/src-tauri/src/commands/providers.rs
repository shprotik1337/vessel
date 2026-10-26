use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use vessel_core::credentials::CredentialKind;

use super::common::{
    credential_kind_from_str, lock, provider_kind_from_str, CoreState, POPUP_HOOK_JS,
    SOUNDCLOUD_HOOK_JS,
};
use crate::GuiCore;

/// Текущий источник аудио для Spotify-треков ("youtube_music" | "deezer" | "").
#[tauri::command]
pub async fn get_spotify_playback_source(core: CoreState<'_>) -> Result<String, String> {
    let core = lock(&core);
    let source = core.runtime.spotify_playback_source();
    Ok(source.as_str().to_string())
}

/// Сменить источник аудио для Spotify-треков (без перезапуска).
/// Auto проверяется по цепочке: нужен хотя бы один источник из неё.
#[tauri::command]
pub async fn set_spotify_playback_source(
    core: CoreState<'_>,
    source: String,
) -> Result<(), String> {
    use vessel_core::runtime::playback_resolver::PlaybackSourceKind;
    let Some(kind) = PlaybackSourceKind::from_str(&source) else {
        return Err(format!("неизвестный источник: {source}"));
    };
    let mut core = lock(&core);
    // Источник должен быть настроен — иначе треки просто не заиграют
    let available = match kind {
        PlaybackSourceKind::Auto => kind.chain().iter().any(|s| {
            core.runtime
                .provider_registry()
                .get(s.provider_kind())
                .is_some()
        }),
        other => core
            .runtime
            .provider_registry()
            .get(other.provider_kind())
            .is_some(),
    };
    if !available {
        return Err(format!(
            "источник {} недоступен — подключи хотя бы один из: Deezer, YouTube Music",
            kind.label()
        ));
    }
    core.runtime.set_spotify_playback_source(kind);
    // Синхронизируем core.config — persist сохраняет именно его
    core.config.spotify_playback_source = Some(kind.as_str().to_string());
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
    let config_clone = core.config.clone();
    core.runtime.sync_config(&config_clone);
    Ok(())
}

#[tauri::command]
pub async fn get_provider_status(
    core: CoreState<'_>,
) -> Result<Vec<crate::ProviderStatus>, String> {
    let core = lock(&core);
    Ok(crate::provider_statuses(&core))
}

/// Открывает окно WebView с Spotify для входа и запускает фоновый
/// мониторинг cookies: как только sp_dc появляется (юзер залогинился),
/// credential сохраняется и окно закрывается само. Отдельная кнопка
/// «Забрать cookie» больше не нужна.
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
        .title("Spotify — вход")
        .inner_size(900.0, 700.0)
        .min_inner_size(600.0, 500.0)
        .build()
        .map_err(|e| e.to_string())?;
    spawn_spotify_cookie_watcher(app, core);
    Ok(())
}

/// Фоновая задача: опрашивает cookies окна входа, ждёт sp_dc. Появился —
/// валидируем (пробуем device-flow refresh, но он не обязателен), сохраняем,
/// закрываем окно. Ошибка валидации НЕ фатальна: cookies всё равно сохраняются,
/// а статус «подключено/нет» покажет provider status.
fn spawn_spotify_cookie_watcher(app: AppHandle, core: CoreState<'_>) {
    let core: Arc<Mutex<GuiCore>> = core.inner().clone();
    tokio::spawn(async move {
        const POLL_INTERVAL: std::time::Duration = std::time::Duration::from_millis(2000);
        // Максимум 15 минут: юзер может просто уйти — тогда AUTH_CANCELLED
        for _attempt in 0..450u32 {
            tokio::time::sleep(POLL_INTERVAL).await;
            let Some(window) = app.get_webview_window("spotify_login") else {
                vessel_core::dlog!("[spotify] auth window closed without login — cancelled");
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
                Ok(Err(_)) => continue, // sp_dc ещё нет — ждем, это не ошибка
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
            let (account_state, secrets_file, session_token) = {
                let mut core = core.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
                let _ = core
                    .runtime
                    .save_credential(CredentialKind::SpotifySpDc, &cookie_line);
                core.app.spotify_enabled = true;
                core.app.config_dirty = true;
                core.app.status_message = "Spotify подключён".to_string();

                let secrets = vessel_core::secrets::SecretStore::new(core.paths.secrets_file.clone());
                let token = secrets.get_named("vessel-user-session").ok().flatten();
                (core.account_state.clone(), core.paths.secrets_file.clone(), token)
            };

            let secrets = vessel_core::secrets::SecretStore::new(secrets_file);
            let client = super::auth::official_client().ok();
            let _ = vessel_core::vault_sync::sync_save_credential(
                client.as_ref(),
                session_token.as_deref(),
                &account_state,
                CredentialKind::SpotifySpDc,
                &cookie_line,
                &secrets,
            )
            .await;

            if let Some(window) = app.get_webview_window("spotify_login") {
                let _ = window.close();
            }
            vessel_core::dlog!("[spotify] authenticated: credential saved, window closed");
            return;
        }
        vessel_core::dlog!("[spotify] auth watcher timed out (15 min) — cancelled");
    });
}

/// Открыто ли окно входа Spotify (для UI-поллинга автоподключения).
#[tauri::command]
pub async fn spotify_login_window_open(app: AppHandle) -> Result<bool, String> {
    Ok(app.get_webview_window("spotify_login").is_some())
}

/// Отменяет вход в Spotify: закрывает окно, мониторинг остановится сам.
#[tauri::command]
pub async fn spotify_auth_cancel(app: AppHandle) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("spotify_login") {
        let _ = window.close();
    }
    vessel_core::dlog!("[spotify] auth cancelled by user");
    Ok(())
}

/// Ручной забор cookies — совместимость со старым UI. Новая кнопка не
/// использует этот путь (мониторинг автоматический), но команда оставлена,
/// чтобы ничего не сломать у пользователей с открытым старым окном.
#[tauri::command]
pub async fn spotify_capture_cookies(
    app: AppHandle,
    core: CoreState<'_>,
) -> Result<String, String> {
    let app_clone = app.clone();
    let cookie = tauri::async_runtime::spawn_blocking(move || {
        crate::webview_cookies::collect_spotify_cookies(&app_clone)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;
    // Достаём только sp_dc / sp_key — их ждёт провайдер.
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
        return Err("не найдена cookie sp_dc — войди в аккаунт Spotify и повтори".to_string());
    }

    let (account_state, secrets_file, session_token) = {
        let mut core = lock(&core);
        core.runtime
            .save_credential(CredentialKind::SpotifySpDc, &cookie_line)
            .map_err(|e| e.to_string())?;
        core.app.spotify_enabled = true;
        core.app.config_dirty = true;
        let secrets = vessel_core::secrets::SecretStore::new(core.paths.secrets_file.clone());
        let token = secrets.get_named("vessel-user-session").ok().flatten();
        (core.account_state.clone(), core.paths.secrets_file.clone(), token)
    };

    let secrets = vessel_core::secrets::SecretStore::new(secrets_file);
    let client = super::auth::official_client().ok();
    let _ = vessel_core::vault_sync::sync_save_credential(
        client.as_ref(),
        session_token.as_deref(),
        &account_state,
        CredentialKind::SpotifySpDc,
        &cookie_line,
        &secrets,
    )
    .await;

    if let Some(window) = app.get_webview_window("spotify_login") {
        let _ = window.close();
    }
    Ok("sp_dc сохранён".to_string())
}

/// Открывает окно браузера на странице входа в SoundCloud (https://soundcloud.com/signin).
/// Окно НЕ закрывается до тех пор, пока пользователь не войдёт в свой реальный аккаунт
/// (получение cookie `oauth_token`).
#[tauri::command]
pub async fn soundcloud_browser_login(app: AppHandle, core: CoreState<'_>) -> Result<(), String> {
    if let Some(window) = app.get_webview_window("soundcloud_login") {
        window.set_focus().map_err(|e| e.to_string())?;
        return Ok(());
    }
    let url = WebviewUrl::External(
        url::Url::parse("https://soundcloud.com/signin").map_err(|e| e.to_string())?,
    );
    WebviewWindowBuilder::new(&app, "soundcloud_login", url)
        .title("SoundCloud — вход в аккаунт")
        .inner_size(1000.0, 720.0)
        .min_inner_size(600.0, 500.0)
        .build()
        .map_err(|e| e.to_string())?;
    spawn_soundcloud_auth_watcher(app, core);
    Ok(())
}

/// Фоновая задача: отслеживает авторизацию пользователя в SoundCloud.
/// Ждёт, пока в окне появится oauth_token (признак того, что пользователь вошёл
/// в личный профиль, а не просто гость), сохраняет токен и client_id,
/// после чего закрывает окно.
fn spawn_soundcloud_auth_watcher(app: AppHandle, core: CoreState<'_>) {
    let core: Arc<Mutex<GuiCore>> = core.inner().clone();
    tokio::spawn(async move {
        const POLL_INTERVAL: std::time::Duration = std::time::Duration::from_millis(1500);
        for _ in 0..600u32 {
            tokio::time::sleep(POLL_INTERVAL).await;
            let Some(window) = app.get_webview_window("soundcloud_login") else {
                vessel_core::dlog!("[soundcloud] auth window closed without login — cancelled");
                return;
            };
            if window.is_visible().unwrap_or(false) == false {
                continue;
            }
            let _ = window.eval(POPUP_HOOK_JS);
            let _ = window.eval(SOUNDCLOUD_HOOK_JS);

            let auth_res = tauri::async_runtime::spawn_blocking({
                let app = app.clone();
                move || crate::webview_cookies::collect_soundcloud_auth(&app).ok()
            })
            .await
            .ok()
            .flatten();

            let Some((oauth_token, client_id_from_cookie)) = auth_res else {
                continue;
            };

            vessel_core::dlog!(
                "[soundcloud] user login detected (oauth_token {} bytes) — saving",
                oauth_token.len()
            );

            let client_id = match client_id_from_cookie {
                Some(id) if !id.trim().is_empty() => Some(id),
                _ => vessel_core::provider::soundcloud::discover_client_id()
                    .await
                    .ok(),
            };

            let (account_state, secrets_file, session_token) = {
                let mut core = core.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
                let _ = core
                    .runtime
                    .save_credential(CredentialKind::SoundCloudOAuthToken, &oauth_token);
                if let Some(id) = &client_id {
                    let _ = core
                        .runtime
                        .save_credential(CredentialKind::SoundCloudClientId, id);
                }
                core.app.soundcloud_enabled = true;
                core.app.config_dirty = true;
                core.app.status_message = "SoundCloud аккаунт подключён".to_string();

                let secrets = vessel_core::secrets::SecretStore::new(core.paths.secrets_file.clone());
                let token = secrets.get_named("vessel-user-session").ok().flatten();
                (core.account_state.clone(), core.paths.secrets_file.clone(), token)
            };

            let secrets = vessel_core::secrets::SecretStore::new(secrets_file);
            let client = super::auth::official_client().ok();
            let _ = vessel_core::vault_sync::sync_save_credential(
                client.as_ref(),
                session_token.as_deref(),
                &account_state,
                CredentialKind::SoundCloudOAuthToken,
                &oauth_token,
                &secrets,
            )
            .await;

            if let Some(window) = app.get_webview_window("soundcloud_login") {
                let _ = window.close();
            }
            vessel_core::dlog!("[soundcloud] user account authenticated, window closed");
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
            let (account_state, secrets_file, session_token) = {
                let mut core = core.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
                let _ = core
                    .runtime
                    .save_credential(CredentialKind::DeezerArl, &arl);
                core.app.deezer_enabled = true;
                core.app.config_dirty = true;
                core.app.status_message = "Deezer подключён".to_string();

                let secrets = vessel_core::secrets::SecretStore::new(core.paths.secrets_file.clone());
                let token = secrets.get_named("vessel-user-session").ok().flatten();
                (core.account_state.clone(), core.paths.secrets_file.clone(), token)
            };

            let secrets = vessel_core::secrets::SecretStore::new(secrets_file);
            let client = super::auth::official_client().ok();
            let _ = vessel_core::vault_sync::sync_save_credential(
                client.as_ref(),
                session_token.as_deref(),
                &account_state,
                CredentialKind::DeezerArl,
                &arl,
                &secrets,
            )
            .await;

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
        return Err("ключ пустой".to_string());
    }
    let (account_state, secrets_file, session_token) = {
        let mut core = lock(&core);
        core.runtime
            .save_credential(kind, value)
            .map_err(|e| e.to_string())?;
        match kind {
            CredentialKind::SoundCloudClientId | CredentialKind::SoundCloudOAuthToken => {
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

        let secrets = vessel_core::secrets::SecretStore::new(core.paths.secrets_file.clone());
        let token = secrets.get_named("vessel-user-session").ok().flatten();
        (core.account_state.clone(), core.paths.secrets_file.clone(), token)
    };

    let secrets = vessel_core::secrets::SecretStore::new(secrets_file);
    let client = super::auth::official_client().ok();
    if let Err(err) = vessel_core::vault_sync::sync_save_credential(
        client.as_ref(),
        session_token.as_deref(),
        &account_state,
        kind,
        value,
        &secrets,
    )
    .await
    {
        match err {
            vessel_core::provider::remote::VaultTransportError::Conflict => {
                return Err("Конфликт версий в облачном Vault (409 Conflict). Обновите данные перед сохранением.".to_string());
            }
            _ => {
                vessel_core::dlog!("[vault_sync] save sync non-fatal error: {err}");
            }
        }
    }

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
        return Err("ключ пустой".to_string());
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
        // YouTube Music всегда включён — выключить нельзя
        "youtube_music" | "youtube" => {
            core.app.youtube_music_enabled = true;
            return Ok(());
        }
        "soundcloud" => vessel_core::model::ProviderKind::SoundCloud,
        "yandex" => vessel_core::model::ProviderKind::YandexMusic,
        "deezer" => vessel_core::model::ProviderKind::Deezer,
        "spotify" => vessel_core::model::ProviderKind::Spotify,
        other => return Err(format!("неизвестный провайдер: {other}")),
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
    let (account_state, secrets_file, session_token) = {
        let mut core = lock(&core);
        core.runtime
            .remove_credential(kind.secret_key())
            .map_err(|e| e.to_string())?;
        match kind {
            CredentialKind::SoundCloudClientId | CredentialKind::SoundCloudOAuthToken => {
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

        let secrets = vessel_core::secrets::SecretStore::new(core.paths.secrets_file.clone());
        let token = secrets.get_named("vessel-user-session").ok().flatten();
        (core.account_state.clone(), core.paths.secrets_file.clone(), token)
    };

    let secrets = vessel_core::secrets::SecretStore::new(secrets_file);
    let client = super::auth::official_client().ok();
    let _ = vessel_core::vault_sync::sync_delete_credential(
        client.as_ref(),
        session_token.as_deref(),
        &account_state,
        kind,
        &secrets,
    )
    .await;

    Ok(())
}
