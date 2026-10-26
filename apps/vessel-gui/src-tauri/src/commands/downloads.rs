use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicUsize, Ordering};
use std::sync::Arc;
use std::time::Duration;

use futures_util::StreamExt;
use serde::Serialize;
use tauri::{AppHandle, Emitter};
use vessel_core::model::{ProviderKind, TrackRef};

use super::common::{lock, CoreState};
use crate::GuiCore;

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

#[derive(Serialize, Clone, Debug)]
pub struct StorageStats {
    pub tracks_bytes: u64,
    pub tracks_count: usize,
    pub covers_bytes: u64,
    pub lyrics_bytes: u64,
    pub total_bytes: u64,
}

fn dir_recursive_size(path: &Path) -> u64 {
    let mut total = 0u64;
    if let Ok(entries) = std::fs::read_dir(path) {
        for entry in entries.flatten() {
            let p = entry.path();
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    total += meta.len();
                } else if meta.is_dir() {
                    total += dir_recursive_size(&p);
                }
            }
        }
    }
    total
}

#[tauri::command]
pub async fn get_auto_cache(core: CoreState<'_>) -> Result<bool, String> {
    let core = lock(&core);
    Ok(core.config.auto_cache)
}

#[tauri::command]
pub async fn set_auto_cache(core: CoreState<'_>, enabled: bool) -> Result<(), String> {
    let mut core = lock(&core);
    core.config.auto_cache = enabled;
    core.runtime.set_auto_cache(enabled);
    core.app.config_dirty = true;
    Ok(())
}

#[tauri::command]
pub async fn get_storage_stats(core: CoreState<'_>) -> Result<StorageStats, String> {
    let core = lock(&core);
    let track_cache = PathBuf::from(resolve_track_cache_dir(&core));

    let mut tracks_bytes = 0u64;
    let mut tracks_count = 0usize;
    if let Ok(entries) = std::fs::read_dir(&track_cache) {
        for entry in entries.flatten() {
            if let Ok(meta) = entry.metadata() {
                if meta.is_file() {
                    tracks_count += 1;
                    tracks_bytes += meta.len();
                }
            }
        }
    }

    let mut covers_bytes = 0u64;
    if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
        let webview_cache = PathBuf::from(local_app_data)
            .join("space.vessel.app")
            .join("EBWebView")
            .join("Default")
            .join("Cache");
        if webview_cache.exists() {
            covers_bytes = dir_recursive_size(&webview_cache);
        }
    }

    let mut lyrics_bytes = 0u64;
    if let Ok(app_data) = std::env::var("APPDATA") {
        let db_dir = PathBuf::from(app_data)
            .join("vessel")
            .join("vessel")
            .join("data")
            .join("Users")
            .join("default");
        if db_dir.exists() {
            lyrics_bytes = dir_recursive_size(&db_dir);
        }
    }

    let total_bytes = tracks_bytes + covers_bytes + lyrics_bytes;

    Ok(StorageStats {
        tracks_bytes,
        tracks_count,
        covers_bytes,
        lyrics_bytes,
        total_bytes,
    })
}

#[tauri::command]
pub async fn clear_storage_cache(
    core: CoreState<'_>,
    target: Option<String>,
) -> Result<StorageStats, String> {
    let target = target.as_deref().unwrap_or("all");
    let track_cache = {
        let core = lock(&core);
        PathBuf::from(resolve_track_cache_dir(&core))
    };

    if target == "all" || target == "tracks" {
        if let Ok(entries) = std::fs::read_dir(&track_cache) {
            for entry in entries.flatten() {
                let p = entry.path();
                if p.is_file() {
                    let _ = std::fs::remove_file(p);
                }
            }
        }
    }

    if target == "all" || target == "covers" {
        if let Ok(local_app_data) = std::env::var("LOCALAPPDATA") {
            let webview_cache = PathBuf::from(local_app_data)
                .join("space.vessel.app")
                .join("EBWebView")
                .join("Default")
                .join("Cache");
            if webview_cache.exists() {
                if let Ok(entries) = std::fs::read_dir(&webview_cache) {
                    for entry in entries.flatten() {
                        let p = entry.path();
                        if p.is_file() {
                            let _ = std::fs::remove_file(p);
                        }
                    }
                }
            }
        }
    }

    get_storage_stats(core).await
}

#[tauri::command]
pub async fn download_track(core: CoreState<'_>, track: TrackRef) -> Result<String, String> {
    // Spotify: скачиваем ТОТ ЖЕ аудио-кандидат из Deezer/YTM, что играет
    // (native-аудио Spotify не используется нигде).
    let (key_track, source) = if track.provider == ProviderKind::Spotify {
        let resolver = {
            let core = lock(&core);
            core.runtime.playback_resolver()
        };
        resolver
            .playable_for(&track)
            .await
            .map_err(|e| format!("{e:#}"))?
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
    let dest = Path::new(&dir).join(file_name);
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

fn resolve_ffmpeg_path() -> Option<PathBuf> {
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
    let cwd_candidate = PathBuf::from("ffmpeg.exe");
    if cwd_candidate.is_file() {
        return Some(cwd_candidate);
    }
    let res_candidate = PathBuf::from("resources/ffmpeg.exe");
    if res_candidate.is_file() {
        return Some(res_candidate);
    }
    if let Ok(output) = std::process::Command::new("ffmpeg")
        .arg("-version")
        .output()
    {
        if output.status.success() {
            return Some(PathBuf::from("ffmpeg"));
        }
    }
    None
}

async fn transcode_to_mp3_locally(input: &Path) -> Result<PathBuf, String> {
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
