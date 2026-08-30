use std::{
    collections::BTreeMap,
    path::{Path, PathBuf},
    sync::{Mutex, OnceLock},
};

use anyhow::{Context, Result};
use url::Url;

use crate::model::{PlaybackCapability, PlaybackSource, ProviderKind, TrackRef};

use super::download::{download_playback_source, track_file_extension};

/// Глобальный оверрайд папки кэша треков, задаётся из GUI-настроек.
static TRACK_CACHE_OVERRIDE: OnceLock<Mutex<Option<PathBuf>>> = OnceLock::new();

fn track_cache_override() -> &'static Mutex<Option<PathBuf>> {
    TRACK_CACHE_OVERRIDE.get_or_init(|| Mutex::new(None))
}

/// Задать папку кэша треков вручную (None — вернуть папку по умолчанию).
pub fn set_track_cache_dir(dir: Option<PathBuf>) {
    *track_cache_override().lock().unwrap() = dir;
}

/// Единая папка кэша треков: {cache_dir}/track-cache или заданная пользователем.
pub fn track_cache_dir() -> PathBuf {
    if let Some(dir) = track_cache_override().lock().unwrap().as_ref() {
        return dir.clone();
    }
    directories::ProjectDirs::from("dev", "vessel", "vessel")
        .map(|dirs| dirs.cache_dir().to_path_buf())
        .unwrap_or_else(|| std::env::temp_dir().join("vessel").join("cache"))
        .join("track-cache")
}

/// Короткий префикс провайдера для имён файлов.
fn provider_prefix(kind: ProviderKind) -> &'static str {
    match kind {
        ProviderKind::SoundCloud => "sc",
        ProviderKind::YandexMusic => "ya",
        ProviderKind::Deezer => "dz",
        ProviderKind::Spotify => "sp",
    }
}

/// Безопасное имя файла кэша для трека: {провайдер}_{id}.{ext}
fn cache_stem(track: &TrackRef) -> String {
    let id: String = track
        .id
        .trim()
        .chars()
        .filter(|c| c.is_alphanumeric())
        .take(64)
        .collect();
    format!("{}_{}", provider_prefix(track.provider), id)
}

/// Возвращает путь к закэшированному файлу трека, если он есть.
pub fn cached_track_path(track: &TrackRef) -> Option<PathBuf> {
    let dir = track_cache_dir();
    let stem = cache_stem(track);
    for ext in ["mp3", "m4a", "aac", "flac", "ogg", "wav"] {
        let path = dir.join(format!("{stem}.{ext}"));
        if path.is_file() {
            return Some(path);
        }
    }
    None
}

/// Есть ли трек в кэше.
pub fn is_cached(track: &TrackRef) -> bool {
    cached_track_path(track).is_some()
}

fn mime_by_ext(ext: &str) -> &'static str {
    match ext {
        "flac" => "audio/flac",
        "m4a" => "audio/mp4",
        "aac" => "audio/aac",
        "ogg" => "audio/ogg",
        "wav" => "audio/wav",
        _ => "audio/mpeg",
    }
}

/// Источник воспроизведения из кэша (file://), если файл уже скачан.
pub fn cached_source(track: &TrackRef) -> Option<PlaybackSource> {
    let path = cached_track_path(track)?;
    let url = Url::from_file_path(&path).ok()?;
    let ext = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("mp3");
    Some(PlaybackSource {
        url,
        headers: BTreeMap::new(),
        mime_type: Some(mime_by_ext(ext).to_string()),
        supports_range: true,
        expires_at_ms: None,
        capability: track.capability.clone(),
    })
}

/// Скачивает трек в кэш (если ещё нет) и возвращает путь к файлу.
pub async fn download_track_to_cache(
    track: &TrackRef,
    source: &PlaybackSource,
) -> Result<PathBuf> {
    let dir = track_cache_dir();
    std::fs::create_dir_all(&dir).with_context(|| {
        format!("не удалось создать кэш-папку {}", dir.display())
    })?;
    let ext = track_file_extension(source);
    let stem = cache_stem(track);
    let dest = dir.join(format!("{stem}.{ext}"));
    if dest.is_file() {
        return Ok(dest);
    }
    if let Some(existing) = cached_track_path(track) {
        return Ok(existing);
    }
    download_playback_source(source, &dest).await?;
    Ok(dest)
}

/// Пустой источник для file-кэша без capability (для тестов/заглушек).
pub fn cache_file_source(path: &Path) -> Result<PlaybackSource> {
    let url = Url::from_file_path(path)
        .map_err(|_| anyhow::anyhow!("повреждённый путь кэша"))?;
    let ext = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("mp3");
    Ok(PlaybackSource {
        url,
        headers: BTreeMap::new(),
        mime_type: Some(mime_by_ext(ext).to_string()),
        supports_range: true,
        expires_at_ms: None,
        capability: PlaybackCapability::Full,
    })
}
