use std::path::{Path, PathBuf};

use sha2::{Digest, Sha256};
use tauri::AppHandle;
use url::Url;
use vessel_core::model::{PlaybackCapability, ProviderKind, TrackOrigin, TrackRef};

use super::common::{file_path_to_string, lock, now_ms, CoreState};

pub(crate) fn is_supported_audio_ext(ext: &str) -> bool {
    matches!(
        ext.to_ascii_lowercase().as_str(),
        "mp3" | "flac" | "m4a" | "aac" | "mp4" | "ogg" | "opus" | "wav"
    )
}

pub(crate) fn parse_filename_fallback(path: &Path) -> (String, Vec<String>) {
    let stem = path
        .file_stem()
        .and_then(|s| s.to_str())
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or("Unknown Track");

    if let Some((left, right)) = stem.split_once(" - ") {
        let artist = left.trim();
        let title = right.trim();
        if !artist.is_empty() && !title.is_empty() {
            return (title.to_string(), vec![artist.to_string()]);
        }
    }
    (stem.to_string(), Vec::new())
}

pub(crate) fn stable_file_id(prefix: &str, canonical_path: &Path) -> String {
    let mut hasher = Sha256::new();
    let normalized = canonical_path.to_string_lossy().to_ascii_lowercase();
    hasher.update(normalized.as_bytes());
    let digest = hex::encode(hasher.finalize());
    format!("{prefix}_{}", &digest[..24])
}

pub(crate) fn build_local_track_from_path(path: &Path, id_prefix: &str) -> Result<(String, TrackRef), String> {
    if !path.is_file() {
        return Err(format!("Файл не найден: {}", path.display()));
    }
    let ext = path
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or_default();
    if !is_supported_audio_ext(ext) {
        return Err(format!("Неподдерживаемый формат файла: {}", path.display()));
    }
    let canonical = std::fs::canonicalize(path).unwrap_or_else(|_| path.to_path_buf());
    let path_str = canonical.to_string_lossy().into_owned();
    let web_url = Url::from_file_path(&canonical)
        .map_err(|_| format!("Некорректный путь к файлу: {}", canonical.display()))?;

    let meta = vessel_core::provider::cache::probe_audio_metadata(&canonical);
    let (fallback_title, fallback_artists) = parse_filename_fallback(&canonical);

    let title = meta.title.unwrap_or(fallback_title);
    let artists = match meta.artist {
        Some(a) if !a.trim().is_empty() => vec![a],
        _ => fallback_artists,
    };

    let track = TrackRef {
        provider: ProviderKind::Local,
        id: stable_file_id(id_prefix, &canonical),
        title,
        artists,
        duration_ms: meta.duration_ms,
        artwork_url: None,
        web_url,
        capability: PlaybackCapability::Full,
        genres: Vec::new(),
        explicit: false,
        drm: false,
        isrc: None,
        origin: TrackOrigin::Original,
        album_url: None,
        album_title: meta.album,
    };
    Ok((path_str, track))
}

fn collect_audio_paths_recursive(input: &Path, out: &mut Vec<PathBuf>, depth: usize) {
    if input.is_file() {
        let ext = input.extension().and_then(|e| e.to_str()).unwrap_or_default();
        if is_supported_audio_ext(ext) {
            out.push(input.to_path_buf());
        }
        return;
    }
    if input.is_dir() && depth < 3 {
        if let Ok(entries) = std::fs::read_dir(input) {
            for entry in entries.flatten() {
                collect_audio_paths_recursive(&entry.path(), out, depth + 1);
            }
        }
    }
}

#[tauri::command]
pub async fn get_local_tracks(core: CoreState<'_>) -> Result<Vec<TrackRef>, String> {
    let core = lock(&core);
    core.storage.list_local_tracks().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_local_track_paths(
    core: CoreState<'_>,
    paths: Vec<String>,
) -> Result<Vec<TrackRef>, String> {
    let mut expanded = Vec::new();
    for raw in paths {
        let trimmed = raw.trim();
        if trimmed.is_empty() {
            continue;
        }
        let p = PathBuf::from(trimmed);
        collect_audio_paths_recursive(&p, &mut expanded, 0);
    }

    let prepared = tauri::async_runtime::spawn_blocking(move || {
        let mut parsed = Vec::new();
        for p in expanded {
            if let Ok(item) = build_local_track_from_path(&p, "loc") {
                parsed.push(item);
            }
        }
        parsed
    })
    .await
    .map_err(|e| e.to_string())?;

    let storage = {
        let core = lock(&core);
        core.storage.clone()
    };
    let ts = now_ms();
    for (idx, (path_str, track)) in prepared.into_iter().enumerate() {
        let _ = storage.add_local_track(&path_str, &track, ts + idx as i64);
    }
    storage.list_local_tracks().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn pick_and_add_local_tracks(
    app: AppHandle,
    core: CoreState<'_>,
) -> Result<Vec<TrackRef>, String> {
    let picked = tauri::async_runtime::spawn_blocking(move || {
        use tauri_plugin_dialog::DialogExt;
        app.dialog()
            .file()
            .add_filter("Audio", &["mp3", "flac", "m4a", "aac", "ogg", "opus", "wav"])
            .blocking_pick_files()
            .unwrap_or_default()
            .into_iter()
            .map(file_path_to_string)
            .collect::<Vec<_>>()
    })
    .await
    .map_err(|e| e.to_string())?;

    if picked.is_empty() {
        let core = lock(&core);
        return core.storage.list_local_tracks().map_err(|e| e.to_string());
    }
    add_local_track_paths(core, picked).await
}

#[tauri::command]
pub async fn remove_local_track(core: CoreState<'_>, id: String) -> Result<Vec<TrackRef>, String> {
    let storage = {
        let core = lock(&core);
        core.storage.clone()
    };
    storage
        .remove_local_track(id.trim())
        .map_err(|e| e.to_string())?;
    storage.list_local_tracks().map_err(|e| e.to_string())
}
