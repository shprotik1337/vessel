use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
};

use anyhow::{Context, Result};
use url::Url;

use crate::model::{PlaybackCapability, PlaybackSource};

pub fn deezer_cache_dir() -> PathBuf {
    std::env::temp_dir().join("vessel").join("deezer-cache")
}

pub fn get_cached_track(track_id: &str) -> Option<PathBuf> {
    let cached_mp3 = deezer_cache_dir().join(format!("{track_id}.mp3"));
    let cached_flac = deezer_cache_dir().join(format!("{track_id}.flac"));
    if cached_mp3
        .metadata()
        .is_ok_and(|metadata| metadata.len() > 0)
    {
        return Some(cached_mp3);
    }
    if cached_flac
        .metadata()
        .is_ok_and(|metadata| metadata.len() > 0)
    {
        return Some(cached_flac);
    }
    None
}

pub fn write_cache(path: &Path, bytes: &[u8]) -> Result<()> {
    let parent = path.parent().context("повреждённый путь кэша Deezer")?;
    fs::create_dir_all(parent).context("не удалось создать кэш Deezer")?;
    let temporary = path.with_extension("part");
    fs::write(&temporary, bytes).context("не удалось записать кэш Deezer")?;
    if path.exists() {
        fs::remove_file(path).context("не удалось обновить кэш Deezer")?;
    }
    fs::rename(temporary, path).context("не удалось завершить кэш Deezer")
}

pub fn full_cache_source(path: &Path) -> Result<PlaybackSource> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("mp3");
    Ok(PlaybackSource {
        url: Url::from_file_path(path)
            .map_err(|_| anyhow::anyhow!("повреждённый путь кэша Deezer"))?,
        headers: BTreeMap::new(),
        mime_type: Some(
            if extension.eq_ignore_ascii_case("flac") {
                "audio/flac"
            } else {
                "audio/mpeg"
            }
            .to_string(),
        ),
        supports_range: true,
        expires_at_ms: None,
        capability: PlaybackCapability::Full,
        duration_ms: None,
    })
}
