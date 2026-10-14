use serde::Serialize;
use vessel_core::model::{Playlist, TrackRef};

use crate::GuiCore;
use super::common::{CoreState, lock, now_ms, provider_kind_from_str};

#[derive(Serialize)]
pub struct TrackTime {
    pub key: String,
    pub timestamp_ms: i64,
}

/// Ключ трека в формате фронтенда: provider (snake_case) + id.
fn frontend_track_key(track: &TrackRef) -> String {
    use vessel_core::model::ProviderKind;
    let provider = match track.provider {
        ProviderKind::SoundCloud => "sound_cloud",
        ProviderKind::YandexMusic => "yandex_music",
        ProviderKind::Deezer => "deezer",
        ProviderKind::Spotify => "spotify",
        ProviderKind::YouTubeMusic => "youtube_music",
    };
    format!("{}:{}", provider, track.id.trim())
}

/// Пишет position для всех плейлистов в порядке app.playlists.
fn persist_playlist_order(core: &mut GuiCore) {
    let order: Vec<String> = core
        .app
        .playlists
        .iter()
        .map(|p| p.id.to_string())
        .collect();
    if let Err(error) = core.storage.save_playlists_order(&order) {
        vessel_core::dlog!("[vessel] save_playlists_order: {error}");
    }
}

fn sync_playlist_if_authenticated(core: &GuiCore, playlist_id: uuid::Uuid) {
    if !core.account_state.is_authenticated() {
        return;
    }
    let Some(playlist) = core.app.playlists.iter().find(|p| p.id == playlist_id).cloned() else {
        return;
    };
    let secrets = vessel_core::secrets::SecretStore::new(core.paths.secrets_file.clone());
    let Some(token) = secrets.get_named("vessel-user-session").ok().flatten() else {
        return;
    };
    tokio::spawn(async move {
        if let Ok(client) = super::users::official_client() {
            let req = vessel_core::protocol::SavePlaylistRequest { playlist };
            let _ = client.user_playlists_save(&token, &req).await;
        }
    });
}

#[tauri::command]
pub async fn toggle_favorite(core: CoreState<'_>, track: TrackRef) -> Result<bool, String> {
    let (liked, token_opt) = {
        let mut core = lock(&core);
        let liked = core.app.gui_toggle_like_track(&track);
        let token = if core.account_state.is_authenticated() {
            let secrets = vessel_core::secrets::SecretStore::new(core.paths.secrets_file.clone());
            secrets.get_named("vessel-user-session").ok().flatten()
        } else {
            None
        };
        (liked, token)
    };

    if let Some(token) = token_opt {
        let track_clone = track.clone();
        tokio::spawn(async move {
            if let Ok(client) = super::users::official_client() {
                let req = vessel_core::protocol::ToggleLikeRequest { track: track_clone };
                let _ = client.user_library_toggle(&token, &req).await;
            }
        });
    }

    Ok(liked)
}

#[tauri::command]
pub async fn reorder_library(
    core: CoreState<'_>,
    from: usize,
    to: usize,
) -> Result<(), String> {
    let mut core = lock(&core);
    let len = core.app.library.len();
    if from >= len || to >= len {
        return Err("индекс вне библиотеки".to_string());
    }
    let mut order: Vec<String> = core
        .app
        .library
        .iter()
        .map(|t| t.provider_key())
        .collect();
    let key = order.remove(from);
    order.insert(to, key);
    core.storage.reorder_library(&order).map_err(|e| e.to_string())?;
    let track = core.app.library.remove(from);
    core.app.library.insert(to, track);
    Ok(())
}

#[tauri::command]
pub async fn get_playlists(core: CoreState<'_>) -> Result<Vec<Playlist>, String> {
    let core = lock(&core);
    Ok(core.app.playlists.clone())
}

#[tauri::command]
pub async fn preview_playlist_url(core: CoreState<'_>, url: String) -> Result<Playlist, String> {
    let parsed = url::Url::parse(&url).map_err(|e| format!("Неверный URL: {e}"))?;
    let registry = {
        let core = lock(&core);
        core.runtime.provider_registry()
    };
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    registry
        .import_url(&parsed, now_ms)
        .await
        .map_err(|e| format!("{e:#}"))
}

#[tauri::command]
pub async fn save_imported_playlist(
    core: CoreState<'_>,
    playlist: Playlist,
) -> Result<(), String> {
    let mut core = lock(&core);
    // Дубли по ссылке нельзя: один плейлист/альбом — одна запись
    if playlist
        .source_url
        .as_ref()
        .is_some_and(|url| core.app.playlists.iter().any(|p| p.source_url.as_ref() == Some(url)))
    {
        return Err("Этот плейлист уже добавлен в библиотеку".to_string());
    }
    if core
        .app
        .playlists
        .iter()
        .any(|p| p.source_url.is_none() && p.title == playlist.title && playlist.source_url.is_none())
    {
        return Err("Этот плейлист уже добавлен в библиотеку".to_string());
    }
    core.storage
        .save_playlist(&playlist)
        .map_err(|e| e.to_string())?;
    core.app.playlists.insert(0, playlist.clone());
    persist_playlist_order(&mut core);
    core.app.playlists_dirty = true;
    sync_playlist_if_authenticated(&core, playlist.id);
    Ok(())
}

#[tauri::command]
pub async fn reorder_playlists(
    core: CoreState<'_>,
    order: Vec<String>,
) -> Result<(), String> {
    let mut core = lock(&core);
    core.storage
        .save_playlists_order(&order)
        .map_err(|e| e.to_string())?;
    core.app.playlists.sort_by_key(|p| {
        order
            .iter()
            .position(|id| id == &p.id.to_string())
            .unwrap_or(usize::MAX)
    });
    Ok(())
}

#[tauri::command]
pub async fn get_library_times(
    core: CoreState<'_>,
) -> Result<Vec<TrackTime>, String> {
    let core = lock(&core);
    let times = core
        .storage
        .liked_tracks_with_time()
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|(track, ts)| TrackTime {
            key: frontend_track_key(&track),
            timestamp_ms: ts,
        })
        .collect();
    Ok(times)
}

#[tauri::command]
pub async fn get_playlist_track_times(
    core: CoreState<'_>,
    id: String,
) -> Result<Vec<TrackTime>, String> {
    let core = lock(&core);
    let id = uuid::Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    let times = core
        .storage
        .playlist_track_times(id)
        .map_err(|e| e.to_string())?
        .into_iter()
        .map(|(track, ts)| TrackTime {
            key: frontend_track_key(&track),
            timestamp_ms: ts,
        })
        .collect();
    Ok(times)
}

#[tauri::command]
pub async fn import_playlist_url(
    core: CoreState<'_>,
    url: String,
) -> Result<Playlist, String> {
    let parsed = url::Url::parse(&url).map_err(|e| format!("Неверный URL: {e}"))?;
    // Дубли по ссылке нельзя: один плейлист/альбом — одна запись
    {
        let core = lock(&core);
        if core
            .app
            .playlists
            .iter()
            .any(|p| p.source_url.as_ref() == Some(&parsed))
        {
            return Err("Этот плейлист уже добавлен в библиотеку".to_string());
        }
    }
    let registry = {
        let core = lock(&core);
        core.runtime.provider_registry()
    };
    let now_ms = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0);
    let playlist = match registry.import_url(&parsed, now_ms).await {
        Ok(p) => p,
        Err(err) => {
            let local_registry = {
                let core = lock(&core);
                core.runtime.local_provider_registry()
            };
            match local_registry.import_url(&parsed, now_ms).await {
                Ok(p) => p,
                Err(local_err) => return Err(format!("{err:#} (локально: {local_err:#})")),
            }
        }
    };
    let mut core = lock(&core);
    core.storage
        .save_playlist(&playlist)
        .map_err(|e| e.to_string())?;
    core.app.playlists.insert(0, playlist.clone());
    persist_playlist_order(&mut core);
    core.app.playlists_dirty = true;
    sync_playlist_if_authenticated(&core, playlist.id);
    Ok(playlist)
}

#[tauri::command]
pub async fn create_playlist(core: CoreState<'_>, title: String) -> Result<Playlist, String> {
    let mut core = lock(&core);
    let id = core.app.gui_create_playlist(title);
    let playlist = core
        .app
        .playlists
        .iter()
        .find(|p| p.id == id)
        .cloned()
        .ok_or_else(|| "плейлист не создался".to_string())?;
    persist_playlist_order(&mut core);
    sync_playlist_if_authenticated(&core, playlist.id);
    Ok(playlist)
}

#[tauri::command]
pub async fn rename_playlist(core: CoreState<'_>, id: String, title: String) -> Result<(), String> {
    let mut core = lock(&core);
    let id = uuid::Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    core.app.gui_rename_playlist(id, title);
    sync_playlist_if_authenticated(&core, id);
    Ok(())
}

#[tauri::command]
pub async fn delete_playlist(core: CoreState<'_>, id: String) -> Result<(), String> {
    let mut core = lock(&core);
    let id = uuid::Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    core.storage.delete_playlist(id).map_err(|e| e.to_string())?;
    core.app.gui_delete_playlist(id);
    if core.account_state.is_authenticated() {
        let secrets = vessel_core::secrets::SecretStore::new(core.paths.secrets_file.clone());
        if let Some(token) = secrets.get_named("vessel-user-session").ok().flatten() {
            tokio::spawn(async move {
                if let Ok(client) = super::users::official_client() {
                    let req = vessel_core::protocol::DeletePlaylistRequest { id };
                    let _ = client.user_playlists_delete(&token, &req).await;
                }
            });
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn add_to_playlist(
    core: CoreState<'_>,
    id: String,
    track: TrackRef,
) -> Result<bool, String> {
    let mut core = lock(&core);
    let id = uuid::Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    let res = core.app.gui_add_to_playlist(id, track);
    sync_playlist_if_authenticated(&core, id);
    Ok(res)
}

#[tauri::command]
pub async fn remove_from_playlist(
    core: CoreState<'_>,
    id: String,
    index: usize,
) -> Result<(), String> {
    let mut core = lock(&core);
    let id = uuid::Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    core.app.gui_remove_from_playlist(id, index);
    sync_playlist_if_authenticated(&core, id);
    Ok(())
}

#[tauri::command]
pub async fn reorder_playlist(
    core: CoreState<'_>,
    id: String,
    from: usize,
    to: usize,
) -> Result<(), String> {
    let mut core = lock(&core);
    let id = uuid::Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    core.app.gui_reorder_playlist(id, from, to);
    sync_playlist_if_authenticated(&core, id);
    Ok(())
}

#[tauri::command]
pub async fn set_playlist_cover(
    core: CoreState<'_>,
    id: String,
    cover_url: Option<String>,
) -> Result<(), String> {
    let mut core = lock(&core);
    let id = uuid::Uuid::parse_str(&id).map_err(|e| e.to_string())?;
    let parsed_cover = match cover_url {
        Some(value) if !value.trim().is_empty() => {
            Some(url::Url::parse(value.trim()).map_err(|e| e.to_string())?)
        }
        _ => None,
    };
    core.app.gui_set_playlist_cover(id, parsed_cover);
    sync_playlist_if_authenticated(&core, id);
    Ok(())
}

#[tauri::command]
pub async fn import_likes(
    core: CoreState<'_>,
    provider: String,
    target: String,
    profile_url: Option<String>,
    playlist_title: Option<String>,
) -> Result<usize, String> {
    let kind = provider_kind_from_str(&provider)?;
    let clean_url = profile_url
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty());

    let registry = {
        let core = lock(&core);
        core.runtime.provider_registry()
    };
    let Some(provider_impl) = registry.get(kind) else {
        return Err(format!("{} не подключён", kind.label()));
    };
    let tracks = match provider_impl.liked_tracks(clean_url).await {
        Ok(tracks) => tracks,
        Err(err) => {
            // Если провайдер был удалённым (Vessel Server) и вернул ошибку
            // (например 502 или старая версия сервера) — делаем fallback на локального провайдера!
            if provider_impl.is_remote() {
                let local_registry = {
                    let core = lock(&core);
                    core.runtime.local_provider_registry()
                };
                if let Some(local_provider) = local_registry.get(kind) {
                    local_provider
                        .liked_tracks(clean_url)
                        .await
                        .map_err(|e| format!("Ошибка сервера ({err:#}), а локально: {e:#}"))?
                } else {
                    return Err(format!("{err:#}"));
                }
            } else {
                return Err(format!("{err:#}"));
            }
        }
    };
    if tracks.is_empty() {
        return Err("лайков не найдено".to_string());
    }

    let mut core = lock(&core);
    match target.as_str() {
        "favorites" => {
            let now = now_ms();
            let mut added = 0;
            for track in &tracks {
                if core.storage.like_track(track, now).is_ok() {
                    added += 1;
                }
            }
            core.app.library = core.storage.library_tracks().map_err(|e| e.to_string())?;
            core.app.config_dirty = true;
            Ok(added)
        }
        "playlist" => {
            let title = playlist_title
                .filter(|t| !t.trim().is_empty())
                .map(|t| t.trim().to_string())
                .unwrap_or_else(|| format!("Лайки {}", kind.label()));
            let mut playlist = vessel_core::model::Playlist::new(title, now_ms());
            for track in tracks {
                playlist.push_unique(track);
            }
            core.storage
                .save_playlist(&playlist)
                .map_err(|e| e.to_string())?;
            core.app.playlists.insert(0, playlist.clone());
            core.app.playlists_dirty = true;
            Ok(playlist.tracks.len())
        }
        _ => Err("неизвестная цель импорта".to_string()),
    }
}

#[tauri::command]
pub async fn import_tracks_batch(
    core: CoreState<'_>,
    tracks: Vec<TrackRef>,
) -> Result<usize, String> {
    let mut added = 0;
    let mut core = lock(&core);
    let now = now_ms();
    for track in tracks {
        let key = track.provider_key();
        if !core.app.library.iter().any(|t| t.provider_key() == key) {
            if let Ok(()) = core.storage.like_track(&track, now) {
                core.app.library.push(track);
                added += 1;
            }
        }
    }
    Ok(added)
}
