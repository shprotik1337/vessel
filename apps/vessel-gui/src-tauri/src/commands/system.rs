use serde::Serialize;
use tauri::AppHandle;

use crate::GuiCore;
use super::common::{file_path_to_string, lock, CoreState};

#[tauri::command]
pub async fn reset_settings(core: CoreState<'_>) -> Result<(), String> {
    let mut core = lock(&core);
    let defaults = vessel_core::config::AppConfig::default();
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

/// Возвращает текущий язык интерфейса ("ru" | "en").
#[tauri::command]
pub async fn get_language(core: CoreState<'_>) -> Result<String, String> {
    let core = lock(&core);
    Ok(core.config.language.clone())
}

/// Сохраняет язык интерфейса ("ru" | "en").
#[tauri::command]
pub async fn set_language(core: CoreState<'_>, language: String) -> Result<(), String> {
    let mut core = lock(&core);
    core.config.language = match language.as_str() {
        "en" => "en".to_string(),
        _ => "ru".to_string(),
    };
    core.app.config_dirty = true;
    Ok(())
}

#[tauri::command]
pub async fn get_discord_rpc(core: CoreState<'_>) -> Result<bool, String> {
    let core = lock(&core);
    Ok(core.config.discord_rpc)
}

#[tauri::command]
pub async fn set_discord_rpc(core: CoreState<'_>, enabled: bool) -> Result<(), String> {
    let mut core = lock(&core);
    core.config.discord_rpc = enabled;
    core.app.config_dirty = true;
    Ok(())
}

// ---------- Нативные диалоги и проводник ----------

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
pub async fn open_url(app: AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener().open_url(url, None::<String>).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_data_dir(core: CoreState<'_>) -> Result<String, String> {
    let core = lock(&core);
    Ok(core.paths.data_dir.display().to_string())
}

#[tauri::command]
pub async fn get_database_path(core: CoreState<'_>) -> Result<String, String> {
    let core = lock(&core);
    Ok(core.paths.database_file.display().to_string())
}

#[tauri::command]
pub async fn write_text_file(path: String, content: String) -> Result<(), String> {
    std::fs::write(&path, content).map_err(|e| format!("Не удалось записать файл: {e}"))
}

#[tauri::command]
pub async fn read_text_file(path: String) -> Result<String, String> {
    std::fs::read_to_string(&path).map_err(|e| format!("Не удалось прочитать файл: {e}"))
}

// ---------- Vessel Server ----------

#[derive(Serialize)]
pub struct VesselServerView {
    pub id: String,
    pub name: String,
    pub url: String,
    pub has_token: bool,
    /// Сегменты провайдеров, маршрутизированных на этот сервер.
    pub providers: Vec<String>,
}

fn vessel_secret_name(id: &str) -> String {
    format!("vessel-server:{id}")
}

fn server_view(core: &GuiCore, server: &vessel_core::config::VesselServerConfig) -> VesselServerView {
    let prefix = format!("server:{}", server.id);
    let routed = core
        .config
        .provider_routing
        .iter()
        .filter(|(_, target)| **target == prefix)
        .map(|(segment, _)| segment.clone())
        .collect();
    VesselServerView {
        id: server.id.clone(),
        name: server.name.clone(),
        url: server.url.clone(),
        has_token: core
            .runtime
            .get_named_secret(&vessel_secret_name(&server.id))
            .ok()
            .flatten()
            .is_some_and(|token| !token.is_empty()),
        providers: routed,
    }
}

fn server_client(core: &GuiCore, server_id: &str) -> Result<vessel_core::provider::remote::ServerClient, String> {
    let config_server = core
        .config
        .vessel_servers
        .iter()
        .find(|s| s.id == server_id)
        .ok_or_else(|| "сервер не найден".to_string())?;
    let mut token = core
        .runtime
        .get_named_secret(&vessel_secret_name(server_id))
        .map_err(|e| e.to_string())?
        .unwrap_or_default();
    if token.trim().is_empty() && server_id == vessel_core::config::OFFICIAL_SERVER_ID {
        token = vessel_core::config::OFFICIAL_SERVER_TOKEN.to_string();
    }
    let server_url = if server_id == vessel_core::config::OFFICIAL_SERVER_ID {
        if !config_server.url.trim().is_empty() {
            config_server.url.as_str()
        } else {
            vessel_core::config::OFFICIAL_SERVER_URL
        }
    } else {
        &config_server.url
    };
    vessel_core::provider::remote::ServerClient::new(server_url, &token)
        .map_err(|e| format!("{e:#}"))
}

/// Подключённые экземпляры Vessel Server + кто на них маршрутизирован.
#[tauri::command]
pub fn vessel_servers(core: CoreState<'_>) -> Result<Vec<VesselServerView>, String> {
    let core = lock(&core);
    Ok(core.config.vessel_servers.iter().map(|s| server_view(&core, s)).collect())
}

/// Все маршруты «провайдер → локально/сервер».
#[tauri::command]
pub fn vessel_routes(core: CoreState<'_>) -> Result<std::collections::BTreeMap<String, String>, String> {
    let core = lock(&core);
    Ok(core.config.provider_routing.clone())
}

/// Проба чужого сервера по url+токену (до сохранения) — capabilities как рукопожатие.
#[tauri::command]
pub async fn vessel_server_probe(
    core: CoreState<'_>,
    id: Option<String>,
    url: Option<String>,
    token: Option<String>,
) -> Result<serde_json::Value, String> {
    let arc = core.inner().clone();
    let client = {
        let core = arc.lock().unwrap_or_else(|p| p.into_inner());
        match (&id, &url) {
            (Some(id), _) => server_client(&core, id)?,
            (None, Some(url)) => vessel_core::provider::remote::ServerClient::new(
                url,
                token.as_deref().unwrap_or_default(),
            )
            .map_err(|e| format!("{e:#}"))?,
            _ => return Err("нужен id сервера или url".to_string()),
        }
    };
    let info = client.info().await.map_err(|e| format!("{e:#}"))?;
    Ok(serde_json::json!({
        "name": info.name,
        "version": info.version,
        "api_version": info.api_version,
        "providers": info.providers,
        "capabilities": {
            "processing": info.capabilities.processing,
            "user_storage": info.capabilities.user_storage,
            "playback_relay": info.capabilities.playback_relay,
        },
    }))
}

/// Добавить и проверить сервер (рукопожатие обязательно).
#[tauri::command]
pub async fn vessel_server_add(
    core: CoreState<'_>,
    name: String,
    url: String,
    token: String,
) -> Result<VesselServerView, String> {
    if name.trim().is_empty() {
        return Err("нужно название сервера".to_string());
    }
    let url = url.trim().trim_end_matches('/').to_string();
    let client = vessel_core::provider::remote::ServerClient::new(&url, token.trim())
        .map_err(|e| format!("{e:#}"))?;
    client.info().await.map_err(|error| {
        format!("Vessel Server не ответил: {error:#} — проверь адрес, токен и что сервер запущен")
    })?;
    let arc = core.inner().clone();
    let mut core = arc.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    // Стабильный id из URL: повторное добавление того же сервера даёт тот же id,
    // токен не теряется в keyring/файле и маршруты не «протухают».
    let id = stable_server_id(&url);
    core.runtime
        .save_named_secret(&vessel_secret_name(&id), token.trim())
        .map_err(|e| e.to_string())?;
    if let Some(existing) = core.config.vessel_servers.iter_mut().find(|s| s.id == id) {
        existing.name = name.trim().to_string();
        existing.url = url.clone();
    } else {
        core.config.vessel_servers.push(vessel_core::config::VesselServerConfig {
            id: id.clone(),
            name: name.trim().to_string(),
            url,
        });
    }
    core.config.save(&core.paths).map_err(|e| format!("{e:#}"))?;
    core.app.config_dirty = true;
    let view = core
        .config
        .vessel_servers
        .iter()
        .find(|s| s.id == id)
        .map(|s| server_view(&core, s))
        .ok_or_else(|| "не удалось сохранить сервер".to_string())?;
    let config_clone = core.config.clone();
    core.runtime.sync_config(&config_clone);
    core.last_state_hash = 0;
    Ok(view)
}

/// Детерминированный id экземпляра Vessel Server из его URL (sha256, первые 16 hex).
fn stable_server_id(url: &str) -> String {
    use sha2::{Digest, Sha256};
    let mut hasher = Sha256::new();
    hasher.update(url.as_bytes());
    hex::encode(hasher.finalize())[..16].to_string()
}

#[tauri::command]
pub fn vessel_server_remove(core: CoreState<'_>, id: String) -> Result<(), String> {
    let mut core = lock(&core);
    core.config.vessel_servers.retain(|s| s.id != id);
    let prefix = format!("server:{id}");
    core.config.provider_routing.retain(|_, target| target != &prefix);
    let _ = core.runtime.remove_named_secret(&vessel_secret_name(&id));
    core.config.save(&core.paths).map_err(|e| format!("{e:#}"))?;
    core.app.config_dirty = true;
    let config_clone = core.config.clone();
    core.runtime.sync_config(&config_clone);
    core.last_state_hash = 0;
    Ok(())
}

/// Сменить место исполнения провайдера: "local" или "server:<id>".
#[tauri::command]
pub fn vessel_route_set(
    core: CoreState<'_>,
    provider: String,
    target: String,
) -> Result<(), String> {
    if vessel_core::protocol::kind_from_segment(&provider).is_none() {
        return Err(format!("неизвестный провайдер «{provider}»"));
    }
    let mut core = lock(&core);
    if target == "local" || target.is_empty() {
        core.config.provider_routing.remove(&provider);
    } else {
        let Some(id) = target.strip_prefix("server:") else {
            return Err("маршрут должен быть «local» или «server:<id>»".to_string());
        };
        if !core.config.vessel_servers.iter().any(|s| s.id == id) {
            return Err("такого сервера нет — сначала добавь его".to_string());
        }
        core.config.provider_routing.insert(provider.clone(), target.clone());
    }
    core.config.save(&core.paths).map_err(|e| format!("{e:#}"))?;
    core.app.config_dirty = true;
    let config_clone = core.config.clone();
    core.runtime.sync_config(&config_clone);
    core.last_state_hash = 0;
    Ok(())
}

/// Прочитать изображение с диска и вернуть data URL base64
#[tauri::command]
pub async fn load_image_as_data_url(path: String) -> Result<String, String> {
    use base64::Engine;
    let bytes = tokio::fs::read(&path)
        .await
        .map_err(|e| format!("Не удалось прочитать файл изображения: {e}"))?;

    let path_lower = path.to_lowercase();
    let mime = if path_lower.ends_with(".png") {
        "image/png"
    } else if path_lower.ends_with(".webp") {
        "image/webp"
    } else if path_lower.ends_with(".gif") {
        "image/gif"
    } else if path_lower.ends_with(".svg") {
        "image/svg+xml"
    } else if path_lower.ends_with(".bmp") {
        "image/bmp"
    } else {
        "image/jpeg"
    };

    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{mime};base64,{b64}"))
}
