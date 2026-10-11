use std::path::PathBuf;
use std::sync::Arc;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use vessel_core::model::TrackRef;

use crate::GuiCore;
use super::common::{file_path_to_string, lock, CoreState};

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
pub async fn download_track(
    core: CoreState<'_>,
    track: TrackRef,
) -> Result<String, String> {
    use vessel_core::model::ProviderKind;
    // Spotify: скачиваем ТОТ ЖЕ аудио-кандидат из Deezer/YTM, что играет
    // (native-аудио Spotify не используется нигде).
    let (key_track, source) = if track.provider == ProviderKind::Spotify {
        let resolver = {
            let core = lock(&core);
            core.runtime.playback_resolver()
        };
        resolver.playable_for(&track).await.map_err(|e| format!("{e:#}"))?
    } else {
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
        (track.clone(), source)
    };
    let dir = {
        let core = lock(&core);
        resolve_download_dir(&core)
    };
    
    let is_relayed = source.url.path().starts_with("/api/v1/s/");
    let mut source = source;
    if is_relayed {
        let mut url = source.url.clone();
        url.query_pairs_mut().append_pair("format", "mp3");
        source.url = url;
        source.mime_type = Some("audio/mpeg".to_string());
    }

    let file_name = vessel_core::provider::download::track_file_name(&key_track, &source);
    let dest = std::path::Path::new(&dir).join(file_name);
    let final_mp3_dest = dest.with_extension("mp3");
    if final_mp3_dest.exists() {
        return Ok(final_mp3_dest.display().to_string());
    }
    if dest.exists() && dest != final_mp3_dest {
        if let Ok(mp3) = transcode_to_mp3_locally(&dest).await {
            return Ok(mp3.display().to_string());
        }
        return Ok(dest.display().to_string());
    }
    vessel_core::provider::download::download_playback_source(&source, &dest)
        .await
        .map_err(|e| format!("{e:#}"))?;

    if !is_relayed && dest.extension().and_then(|e| e.to_str()) != Some("mp3") {
        if let Ok(mp3) = transcode_to_mp3_locally(&dest).await {
            return Ok(mp3.display().to_string());
        }
    }
    Ok(dest.display().to_string())
}

fn resolve_ffmpeg_path() -> Option<std::path::PathBuf> {
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let candidates = [
                dir.join("ffmpeg.exe"),
                dir.join("resources").join("ffmpeg.exe"),
                dir.join("resources").join("resources").join("ffmpeg.exe"),
            ];
            for candidate in candidates {
                if candidate.is_file() {
                    return Some(candidate);
                }
            }
        }
    }
    let cwd_candidate = std::path::PathBuf::from("ffmpeg.exe");
    if cwd_candidate.is_file() {
        return Some(cwd_candidate);
    }
    let res_candidate = std::path::PathBuf::from("resources/ffmpeg.exe");
    if res_candidate.is_file() {
        return Some(res_candidate);
    }
    if let Ok(output) = std::process::Command::new("ffmpeg").arg("-version").output() {
        if output.status.success() {
            return Some(std::path::PathBuf::from("ffmpeg"));
        }
    }
    None
}

async fn transcode_to_mp3_locally(input: &std::path::Path) -> Result<std::path::PathBuf, String> {
    let Some(ffmpeg) = resolve_ffmpeg_path() else {
        return Err("FFmpeg не найден на устройстве".to_string());
    };
    let output = input.with_extension("mp3");
    let mut cmd = tokio::process::Command::new(ffmpeg);
    cmd.args([
        "-y",
        "-i",
        input.to_str().unwrap_or_default(),
        "-vn",
        "-b:a",
        "320k",
        output.to_str().unwrap_or_default(),
    ]);
    cmd.stdin(std::process::Stdio::null());
    cmd.stdout(std::process::Stdio::null());
    cmd.stderr(std::process::Stdio::null());
    #[cfg(windows)]
    cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW

    let status = cmd
        .status()
        .await
        .map_err(|e| format!("Не удалось запустить FFmpeg: {e}"))?;

    if !status.success() {
        return Err(format!("FFmpeg завершился с кодом: {:?}", status.code()));
    }
    let _ = tokio::fs::remove_file(input).await;
    Ok(output)
}

#[tauri::command]
pub async fn download_track_to_cache(
    core: CoreState<'_>,
    track: TrackRef,
) -> Result<String, String> {
    use std::time::Duration;
    use vessel_core::model::ProviderKind;

    // Сначала проверяем, есть ли трек уже в кэше
    if vessel_core::provider::cache::is_cached(&track) {
        if let Some(path) = vessel_core::provider::cache::cached_track_path(&track) {
            return Ok(path.display().to_string());
        }
    }

    let (key_track, source) = if track.provider == ProviderKind::Spotify {
        let resolver = {
            let core = lock(&core);
            core.runtime.playback_resolver()
        };
        let resolve_fut = resolver.playable_for(&track);
        match tokio::time::timeout(Duration::from_secs(15), resolve_fut).await {
            Ok(Ok(pair)) => pair,
            Ok(Err(error)) => return Err(format!("{error:#}")),
            Err(_) => return Err("Таймаут поиска источника аудио (15с)".to_string()),
        }
    } else {
        let registry = {
            let core = lock(&core);
            core.runtime.provider_registry()
        };
        let Some(provider) = registry.get(track.provider) else {
            return Err("провайдер не подключён".to_string());
        };
        let source_fut = provider.download_source(&track);
        let source = match tokio::time::timeout(Duration::from_secs(15), source_fut).await {
            Ok(Ok(source)) => source,
            Ok(Err(e)) => return Err(format!("{e:#}")),
            Err(_) => return Err("Таймаут получения источника аудио (15с)".to_string()),
        };
        (track.clone(), source)
    };

    let dl_fut = vessel_core::provider::cache::download_track_to_cache_with_alias(
        &key_track,
        Some(&track),
        &source,
    );
    let path = match tokio::time::timeout(Duration::from_secs(45), dl_fut).await {
        Ok(Ok(path)) => path,
        Ok(Err(e)) => return Err(format!("{e:#}")),
        Err(_) => return Err("Таймаут скачивания аудиофайла в кэш (45с)".to_string()),
    };
    Ok(path.display().to_string())
}

#[derive(Clone, Serialize)]
pub struct CacheProgressPayload {
    pub completed: usize,
    pub total: usize,
    pub title: String,
    pub downloaded: usize,
    pub skipped: usize,
    pub failed: usize,
}

#[derive(Clone, Serialize, Default)]
pub struct DownloadBatchResult {
    pub downloaded: usize,
    pub skipped: usize,
    pub failed: usize,
    pub total: usize,
}

#[tauri::command]
pub async fn download_all_to_cache(
    app: AppHandle,
    core: CoreState<'_>,
    tracks: Vec<TrackRef>,
) -> Result<DownloadBatchResult, String> {
    use futures_util::StreamExt;
    use std::sync::atomic::{AtomicUsize, Ordering};
    use std::time::Duration;
    use vessel_core::model::ProviderKind;

    let resolver = {
        let core = lock(&core);
        core.runtime.playback_resolver()
    };
    let registry = {
        let core = lock(&core);
        core.runtime.provider_registry()
    };
    let total = tracks.len();
    if total == 0 {
        let empty = DownloadBatchResult::default();
        let _ = app.emit("cache-complete", &empty);
        return Ok(empty);
    }

    let downloaded = Arc::new(AtomicUsize::new(0));
    let skipped = Arc::new(AtomicUsize::new(0));
    let failed = Arc::new(AtomicUsize::new(0));
    let completed = Arc::new(AtomicUsize::new(0));

    // Скачиваем до 3 треков одновременно для максимальной скорости без блокировок
    const CONCURRENCY: usize = 3;

    futures_util::stream::iter(tracks)
        .map(|track| {
            let app = app.clone();
            let resolver = resolver.clone();
            let registry = registry.clone();
            let downloaded = downloaded.clone();
            let skipped = skipped.clone();
            let failed = failed.clone();
            let completed = completed.clone();

            async move {
                // 1. Мгновенный пропуск, если трек уже закэширован
                if vessel_core::provider::cache::is_cached(&track) {
                    let s = skipped.fetch_add(1, Ordering::SeqCst) + 1;
                    let c = completed.fetch_add(1, Ordering::SeqCst) + 1;
                    let d = downloaded.load(Ordering::SeqCst);
                    let f = failed.load(Ordering::SeqCst);
                    let _ = app.emit(
                        "cache-progress",
                        CacheProgressPayload {
                            completed: c,
                            total,
                            title: format!("В кэше: {}", track.title),
                            downloaded: d,
                            skipped: s,
                            failed: f,
                        },
                    );
                    return;
                }

                // Эмитим статус начала обработки трека ДО ожидания резолва и скачивания!
                let cur_c = completed.load(Ordering::SeqCst);
                let cur_d = downloaded.load(Ordering::SeqCst);
                let cur_s = skipped.load(Ordering::SeqCst);
                let cur_f = failed.load(Ordering::SeqCst);
                let _ = app.emit(
                    "cache-progress",
                    CacheProgressPayload {
                        completed: cur_c,
                        total,
                        title: format!("Скачивание: {}", track.title),
                        downloaded: cur_d,
                        skipped: cur_s,
                        failed: cur_f,
                    },
                );

                // 2. Поиск источника аудио
                let resolved = if track.provider == ProviderKind::Spotify {
                    let resolve_fut = resolver.playable_for(&track);
                    match tokio::time::timeout(Duration::from_secs(15), resolve_fut).await {
                        Ok(Ok(pair)) => Some(pair),
                        _ => None,
                    }
                } else {
                    if let Some(provider) = registry.get(track.provider) {
                        let source_fut = provider.download_source(&track);
                        match tokio::time::timeout(Duration::from_secs(15), source_fut).await {
                            Ok(Ok(source)) => Some((track.clone(), source)),
                            _ => None,
                        }
                    } else {
                        None
                    }
                };

                let Some((key_track, source)) = resolved else {
                    let f = failed.fetch_add(1, Ordering::SeqCst) + 1;
                    let c = completed.fetch_add(1, Ordering::SeqCst) + 1;
                    let d = downloaded.load(Ordering::SeqCst);
                    let s = skipped.load(Ordering::SeqCst);
                    let _ = app.emit(
                        "cache-progress",
                        CacheProgressPayload {
                            completed: c,
                            total,
                            title: format!("Ошибка: {}", track.title),
                            downloaded: d,
                            skipped: s,
                            failed: f,
                        },
                    );
                    return;
                };

                // 3. Проверка алиаса (если yt_... уже скачан для Spotify)
                if vessel_core::provider::cache::is_cached(&key_track) {
                    let _ = vessel_core::provider::cache::link_cache_alias(&track, &key_track);
                    let s = skipped.fetch_add(1, Ordering::SeqCst) + 1;
                    let c = completed.fetch_add(1, Ordering::SeqCst) + 1;
                    let d = downloaded.load(Ordering::SeqCst);
                    let f = failed.load(Ordering::SeqCst);
                    let _ = app.emit(
                        "cache-progress",
                        CacheProgressPayload {
                            completed: c,
                            total,
                            title: format!("В кэше: {}", track.title),
                            downloaded: d,
                            skipped: s,
                            failed: f,
                        },
                    );
                    return;
                }

                // 4. Скачивание аудиофайла в кэш
                let dl_fut = vessel_core::provider::cache::download_track_to_cache_with_alias(
                    &key_track,
                    Some(&track),
                    &source,
                );
                match tokio::time::timeout(Duration::from_secs(25), dl_fut).await {
                    Ok(Ok(_)) => {
                        let d = downloaded.fetch_add(1, Ordering::SeqCst) + 1;
                        let c = completed.fetch_add(1, Ordering::SeqCst) + 1;
                        let s = skipped.load(Ordering::SeqCst);
                        let f = failed.load(Ordering::SeqCst);
                        let _ = app.emit(
                            "cache-progress",
                            CacheProgressPayload {
                                completed: c,
                                total,
                                title: format!("Готово: {}", track.title),
                                downloaded: d,
                                skipped: s,
                                failed: f,
                            },
                        );
                    }
                    _ => {
                        let f = failed.fetch_add(1, Ordering::SeqCst) + 1;
                        let c = completed.fetch_add(1, Ordering::SeqCst) + 1;
                        let d = downloaded.load(Ordering::SeqCst);
                        let s = skipped.load(Ordering::SeqCst);
                        let _ = app.emit(
                            "cache-progress",
                            CacheProgressPayload {
                                completed: c,
                                total,
                                title: format!("Сбой: {}", track.title),
                                downloaded: d,
                                skipped: s,
                                failed: f,
                            },
                        );
                    }
                }
            }
        })
        .buffer_unordered(CONCURRENCY)
        .collect::<Vec<()>>()
        .await;

    let final_res = DownloadBatchResult {
        total,
        downloaded: downloaded.load(Ordering::SeqCst),
        skipped: skipped.load(Ordering::SeqCst),
        failed: failed.load(Ordering::SeqCst),
    };

    let _ = app.emit("cache-complete", &final_res);
    Ok(final_res)
}

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
        vessel_core::config::OFFICIAL_SERVER_URL
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

/// Свернуть окно
#[tauri::command]
pub fn window_minimize(window: tauri::Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

/// Переключить разворачивание окна на весь экран
#[tauri::command]
pub fn window_toggle_maximize(window: tauri::Window) -> Result<(), String> {
    let is_max = window.is_maximized().unwrap_or(false);
    if is_max {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

/// Проверить, развернуто ли окно
#[tauri::command]
pub fn window_is_maximized(window: tauri::Window) -> Result<bool, String> {
    window.is_maximized().map_err(|e| e.to_string())
}

/// Закрыть окно (свернуть в системный трей)
#[tauri::command]
pub fn window_close(window: tauri::Window) -> Result<(), String> {
    window.hide().map_err(|e| e.to_string())
}

/// Начать перемещение окна (drag)
#[tauri::command]
pub fn window_start_dragging(window: tauri::Window) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
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
