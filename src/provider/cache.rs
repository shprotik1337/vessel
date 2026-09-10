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
        ProviderKind::YouTubeMusic => "yt",
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

/// Удаляет скачанный файл трека (битый/устаревший кэш). Возвращает true, если файл был.
pub fn delete_cached_track(track: &TrackRef) -> bool {
    let Some(path) = cached_track_path(track) else { return false };
    std::fs::remove_file(&path).is_ok()
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
        return validate_cached_file(track, &dest).map(|_| dest);
    }
    if let Some(existing) = cached_track_path(track) {
        return validate_cached_file(track, &existing).map(|_| existing);
    }
    download_playback_source(source, &dest).await?;
    validate_cached_file(track, &dest).map(|_| dest)
}

/// Валидация скачанного файла: размер не нулевой, а если известна длительность
/// трека — декодер не должен показывать сильно меньшую длительность
/// (файл обрезан). Битый файл удаляется, чтобы следующий download перескачал.
fn validate_cached_file(track: &TrackRef, path: &Path) -> Result<()> {
    let metadata = std::fs::metadata(path)
        .with_context(|| format!("кэш-файл исчез: {}", path.display()))?;
    if metadata.len() == 0 {
        let _ = std::fs::remove_file(path);
        anyhow::bail!("кэш-файл пустой, удалён: {}", path.display());
    }
    // Полная проверка декодером — дорогая, гоняем только при сомнении
    let Some(expected_ms) = track.duration_ms else {
        return Ok(());
    };
    let decoded_ms = probe_duration_ms(path);
    match decoded_ms {
        Some(decoded) if decoded + 10_000 < expected_ms => {
            let _ = std::fs::remove_file(path);
            anyhow::bail!(
                "кэш-файл обрезан (декодер {decoded}ms < метаданные {expected_ms}ms), удалён"
            )
        }
        _ => Ok(()),
    }
}

/// Быстро узнаёт длительность аудиофайла (проба формата, без полного декода).
fn probe_duration_ms(path: &Path) -> Option<u64> {
    use symphonia::core::{
        formats::{FormatOptions, TrackType, probe::Hint},
        io::{MediaSourceStream, MediaSourceStreamOptions},
        meta::MetadataOptions,
    };
    let file = std::fs::File::open(path).ok()?;
    let stream = MediaSourceStream::new(
        Box::new(file),
        MediaSourceStreamOptions { buffer_len: 32 * 1024 },
    );
    let mut hint = Hint::new();
    if let Some(ext) = path.extension().and_then(|value| value.to_str()) {
        hint.with_extension(ext);
    }
    let format = symphonia::default::get_probe()
        .probe(
            &hint,
            stream,
            FormatOptions::default(),
            MetadataOptions::default(),
        )
        .ok()?;
    let track = format.default_track(TrackType::Audio)?;
    let duration = track.duration.as_ref()?;
    let time_base = track.time_base.as_ref()?;
    Some(
        duration.get() as u64 * u64::from(time_base.numer.get())
            / u64::from(time_base.denom.get())
            * 1000,
    )
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

/// Папки временного playback-кэша (расшифрованные файлы Deezer/Spotify).
/// Это НЕ offline-кэш: файлы перескачиваются автоматически при
/// воспроизведении, живут недолго и обязаны чиститься.
const TEMP_PLAYBACK_CACHE_DIRS: &[&str] = &["deezer-cache", "spotify-cache"];

/// Очистка временных playback-кэшей при старте приложения.
///
/// Убирает:
/// * все файлы из временных каталогов Deezer/Spotify (legacy-файлы, орфаны,
///   обрезанные файлы прошлых сессий — надёжно отличить валидный offline
///   download от автоматического кэша невозможно, считаем их playback-кэшем);
/// * орфанные .part-файлы из offline-кэша;
/// * нулевые (битые) файлы offline-кэша — валидные сохранённые загрузки
///   остаются.
///
/// Возвращает количество удалённых файлов и число ошибок удаления
/// (Windows может держать файл открытым — проблема логируется).
pub fn cleanup_playback_caches() -> (usize, usize) {
    let temp_base = std::env::temp_dir().join("vessel");
    cleanup_caches_in(&temp_base, &track_cache_dir())
}

/// Внутренняя реализация очистки с инъекцией путей (для тестов).
fn cleanup_caches_in(temp_base: &Path, offline_dir: &Path) -> (usize, usize) {
    let mut removed = 0usize;
    let mut errors = 0usize;

    for dir_name in TEMP_PLAYBACK_CACHE_DIRS {
        let dir = temp_base.join(dir_name);
        if let Ok(entries) = std::fs::read_dir(&dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    match std::fs::remove_file(&path) {
                        Ok(()) => removed += 1,
                        Err(error) => {
                            crate::dlog!(
                                "[cache] не удалось удалить временный файл {}: {error}",
                                path.display()
                            );
                            errors += 1;
                        }
                    }
                } else if path.is_dir() {
                    match std::fs::remove_dir_all(&path) {
                        Ok(()) => {}
                        Err(_) => errors += 1,
                    }
                }
            }
        }
        // пустой каталог больше не нужен
        let _ = std::fs::remove_dir(&dir);
    }

    // Offline-кэш: орфанные .part и нулевые файлы — битое, остальное валидно
    if let Ok(entries) = std::fs::read_dir(offline_dir) {
        for entry in entries.flatten() {
            let path = entry.path();
            if !path.is_file() {
                continue;
            }
            let is_part = path
                .extension()
                .and_then(|value| value.to_str())
                .is_some_and(|value| value.eq_ignore_ascii_case("part"));
            let is_empty = entry.metadata().map(|meta| meta.len() == 0).unwrap_or(false);
            if is_part || is_empty {
                match std::fs::remove_file(&path) {
                    Ok(()) => removed += 1,
                    Err(error) => {
                        crate::dlog!(
                            "[cache] не удалось удалить битый offline-файл {}: {error}",
                            path.display()
                        );
                        errors += 1;
                    }
                }
            }
        }
    }

    (removed, errors)
}

#[cfg(test)]
mod cleanup_tests {
    use super::*;

    #[test]
    fn temp_playback_cache_cleared_offline_persists() {
        let temp = tempfile::tempdir().unwrap();
        let offline = tempfile::tempdir().unwrap();
        let temp = temp.path();
        let offline = offline.path();

        // Legacy/битые файлы временного playback-кэша
        let dz = temp.join("deezer-cache");
        let sp = temp.join("spotify-cache");
        std::fs::create_dir_all(&dz).unwrap();
        std::fs::create_dir_all(&sp).unwrap();
        std::fs::write(dz.join("12345.mp3"), b"legacy").unwrap();
        std::fs::write(dz.join("67890.mp3.part"), b"orphan").unwrap();
        std::fs::write(sp.join("abc.m4a"), b"legacy2").unwrap();

        // Offline-кэш: валидный файл + .part + пустой
        let valid = offline.join("dz_12345.mp3");
        std::fs::write(&valid, b"real audio bytes here").unwrap();
        std::fs::write(offline.join("dz_67890.mp3.part"), b"partial").unwrap();
        std::fs::write(offline.join("sp_1.m4a"), b"").unwrap();

        let (removed, _errors) = cleanup_caches_in(temp, offline);
        assert!(removed >= 4, "removed={removed}");

        // Временный кэш полностью очищен (каталоги удалены)
        assert!(!dz.exists());
        assert!(!sp.exists());
        // Валидный offline-файл пережил очистку
        assert!(valid.is_file());
        // Битые offline-файлы удалены
        assert!(!offline.join("dz_67890.mp3.part").exists());
        assert!(!offline.join("sp_1.m4a").exists());
    }

    #[test]
    fn missing_dirs_are_not_errors() {
        let temp = tempfile::tempdir().unwrap();
        let offline = tempfile::tempdir().unwrap();
        let (removed, errors) =
            cleanup_caches_in(temp.path(), offline.path());
        assert_eq!((removed, errors), (0, 0));
    }
}

