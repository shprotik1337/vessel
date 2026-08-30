use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use vessel_core::{
    app::{App, PlaybackStatus, PlayerState},
    config::{AppConfig, AppPaths},
    model::{Playlist, TrackRef},
    provider::ProviderRegistry,
    runtime::Runtime,
    secrets::SecretStore,
    storage::{HistoryEntry, Storage},
};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

mod commands;

pub struct GuiCore {
    pub app: App,
    pub runtime: Runtime,
    pub config: AppConfig,
    pub paths: AppPaths,
    pub storage: Storage,
    pub last_state_hash: u64,
    pub last_progress_at: Instant,
}

/// Полное состояние приложения, которое фронтенд читает напрямую по запросу.
#[derive(Serialize, Clone)]
pub struct FullState {
    pub player: PlayerState,
    pub queue: Vec<TrackRef>,
    pub queue_index: Option<usize>,
    pub now_playing: Option<TrackRef>,
    pub library: Vec<TrackRef>,
    pub playlists: Vec<Playlist>,
    pub history: Vec<HistoryEntry>,
    pub providers: Vec<ProviderStatus>,
    pub volume_percent: u8,
    pub soundcloud_enabled: bool,
    pub yandex_enabled: bool,
    pub deezer_enabled: bool,
    pub spotify_enabled: bool,
    pub server_url: String,
    pub status_message: String,
}

#[derive(Serialize, Clone)]
pub struct ProviderStatus {
    pub kind: String,
    pub label: String,
    pub connected: bool,
    pub has_credentials: bool,
    pub enabled: bool,
}

#[derive(Serialize, Clone)]
pub struct SearchOutcome {
    pub tracks: Vec<TrackRef>,
    pub failures: Vec<String>,
}

fn state_hash(app: &App) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut hasher = DefaultHasher::new();
    format!("{:?}", app.player.status).hash(&mut hasher);
    app.player.volume_percent.hash(&mut hasher);
    app.player.shuffle.hash(&mut hasher);
    format!("{:?}", app.player.repeat).hash(&mut hasher);
    app.player.duration_ms.hash(&mut hasher);
    app.player.position_ms.hash(&mut hasher);
    app.player.buffered_ms.hash(&mut hasher);
    app.queue_index.hash(&mut hasher);
    app.now_playing
        .as_ref()
        .map(|t| t.provider_key())
        .hash(&mut hasher);
    app.library.len().hash(&mut hasher);
    app.playlists.len().hash(&mut hasher);
    app.queue.len().hash(&mut hasher);
    for track in app.queue.iter() {
        track.provider_key().hash(&mut hasher);
    }
    hasher.finish()
}

fn provider_statuses(core: &GuiCore) -> Vec<ProviderStatus> {
    let registry: &ProviderRegistry = &core.runtime.provider_registry();
    let credentials = core.runtime.credential_state().unwrap_or_default();
    let mut statuses = Vec::new();
    let kinds = [
        vessel_core::model::ProviderKind::SoundCloud,
        vessel_core::model::ProviderKind::YandexMusic,
        vessel_core::model::ProviderKind::Deezer,
        vessel_core::model::ProviderKind::Spotify,
    ];
    for kind in kinds {
        let label = kind.label().to_string();
        let kind_str = match kind {
            vessel_core::model::ProviderKind::SoundCloud => "soundcloud",
            vessel_core::model::ProviderKind::YandexMusic => "yandex",
            vessel_core::model::ProviderKind::Deezer => "deezer",
            vessel_core::model::ProviderKind::Spotify => "spotify",
        }
        .to_string();
        let enabled = match kind {
            vessel_core::model::ProviderKind::SoundCloud => core.app.soundcloud_enabled,
            vessel_core::model::ProviderKind::YandexMusic => core.app.yandex_enabled,
            vessel_core::model::ProviderKind::Deezer => core.app.deezer_enabled,
            vessel_core::model::ProviderKind::Spotify => core.app.spotify_enabled,
        };
        let has_credentials = match kind {
            vessel_core::model::ProviderKind::SoundCloud => credentials.soundcloud,
            vessel_core::model::ProviderKind::YandexMusic => credentials.yandex,
            vessel_core::model::ProviderKind::Deezer => credentials.deezer,
            vessel_core::model::ProviderKind::Spotify => credentials.spotify,
        };
        let connected = registry.get(kind).is_some() && enabled;
        statuses.push(ProviderStatus {
            kind: kind_str,
            label,
            connected,
            has_credentials,
            enabled,
        });
    }
    statuses
}

pub fn build_full_state(core: &GuiCore) -> FullState {
    let player = core.app.player.clone();
    FullState {
        player,
        queue: core.app.queue.clone(),
        queue_index: core.app.queue_index,
        now_playing: core.app.now_playing.clone(),
        library: core.app.library.clone(),
        playlists: core.app.playlists.clone(),
        history: core.storage.recent_history(100).unwrap_or_default(),
        providers: provider_statuses(core),
        volume_percent: core.app.player.volume_percent,
        soundcloud_enabled: core.app.soundcloud_enabled,
        yandex_enabled: core.app.yandex_enabled,
        deezer_enabled: core.app.deezer_enabled,
        spotify_enabled: core.app.spotify_enabled,
        server_url: core.config.server_url.clone(),
        status_message: core.app.status_message.clone(),
    }
}

fn emit_state(app: &AppHandle, state: &FullState) {
    let _ = app.emit("state", state);
}

fn emit_progress(app: &AppHandle, core: &GuiCore) {
    let payload = ProgressPayload {
        status: core.app.player.status,
        position_ms: core.app.player.position_ms,
        buffered_ms: core.app.player.buffered_ms,
        duration_ms: core.app.player.duration_ms,
    };
    let _ = app.emit("progress", payload);
}

#[derive(Serialize, Clone)]
pub struct ProgressPayload {
    pub status: PlaybackStatus,
    pub position_ms: u64,
    pub buffered_ms: u64,
    pub duration_ms: u64,
}

/// Основной цикл: гоняет runtime, персистит состояние, шлёт события.
fn driver_loop(core: Arc<Mutex<GuiCore>>, app: AppHandle) {
    loop {
        let mut core = match core.lock() {
            Ok(guard) => guard,
            Err(poisoned) => poisoned.into_inner(),
        };
        drive_runtime(&mut core);
        persist(&mut core);
        let now = Instant::now();
        let hash = state_hash(&core.app);
        if hash != core.last_state_hash {
            core.last_state_hash = hash;
            let full = build_full_state(&core);
            emit_state(&app, &full);
        }
        if now.duration_since(core.last_progress_at) >= Duration::from_millis(200)
            && core.app.player.status != PlaybackStatus::Stopped
        {
            core.last_progress_at = now;
            emit_progress(&app, &core);
        }
        drop(core);
        std::thread::sleep(Duration::from_millis(50));
    }
}

fn drive_runtime(core: &mut GuiCore) {
    loop {
        let mut actions = core.runtime.poll_actions();
        let effects = core.app.take_effects();
        if actions.is_empty() && effects.is_empty() {
            break;
        }
        actions.extend(core.runtime.dispatch(effects));
        for action in actions {
            core.app.handle(action);
        }
    }
}

fn persist(core: &mut GuiCore) {
    let mut config = core.config.clone();
    if core.app.queue_dirty {
        if let Err(error) = core.storage.save_queue(&core.app.queue_snapshot()) {
            eprintln!("[vessel] save_queue: {error}");
        } else {
            core.app.queue_dirty = false;
        }
    }
    if core.app.playlists_dirty {
        for playlist in &core.app.playlists {
            if let Err(error) = core.storage.save_playlist(playlist) {
                eprintln!("[vessel] save_playlist: {error}");
            }
        }
        core.app.playlists_dirty = false;
    }
    if core.app.config_dirty {
        config.volume_percent = core.app.player.volume_percent;
        config.soundcloud_enabled = core.app.soundcloud_enabled;
        config.yandex_enabled = core.app.yandex_enabled;
        config.deezer_enabled = core.app.deezer_enabled;
        config.spotify_enabled = core.app.spotify_enabled;
        config.global_hotkeys_enabled = core.app.global_hotkeys_enabled;
        config.hotkeys = core.app.hotkeys.clone();
        config.keybindings_notice_seen = core.app.keybindings_notice_seen;
        config.guest_mode = core.app.account.user().is_none();
        config.soundcloud_client_id_refresh_at_ms = core.app.soundcloud_refresh_at_ms;
        if let Err(error) = config.save(&core.paths) {
            eprintln!("[vessel] save config: {error}");
        } else {
            core.config = config;
            core.app.config_dirty = false;
        }
    }
}

fn load_core(paths: &AppPaths) -> anyhow::Result<GuiCore> {
    let mut config = AppConfig::load(paths)?.normalized();
    vessel_core::provider::cache::set_track_cache_dir(
        config
            .track_cache_dir
            .as_deref()
            .map(str::trim)
            .filter(|dir| !dir.is_empty())
            .map(PathBuf::from),
    );
    let secrets = SecretStore::new(paths.secrets_file.clone());
    if let Some(client_id) = config.soundcloud_client_id_override.take() {
        secrets.set(
            vessel_core::secrets::SecretKey::SoundCloudClientIdOverride,
            &client_id,
        )?;
        config.save(paths)?;
    }
    let storage = Storage::new(paths.database_file.clone());
    storage.initialize()?;
    let mut app = App::load(&storage, &config)?;
    let mut runtime = Runtime::new(&config, &secrets, storage.clone());
    match runtime.credential_state() {
        Ok(credentials) => app.set_credentials(credentials),
        Err(error) => app.status_message = format!("Не удалось проверить ключи: {error}"),
    }
    if let Some(notice) = runtime.take_notices().into_iter().last() {
        app.status_message = notice;
    }
    app.restore_account();
    Ok(GuiCore {
        app,
        runtime,
        config,
        paths: paths.clone(),
        storage,
        last_state_hash: 0,
        last_progress_at: Instant::now(),
    })
}

#[tauri::command]
async fn get_state(state: State<'_, Arc<Mutex<GuiCore>>>) -> Result<FullState, String> {
    let core = state
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner());
    Ok(build_full_state(&core))
}

pub fn run() {
    let paths = AppPaths::discover().expect("не удалось найти пути приложения");
    paths
        .ensure()
        .expect("не удалось создать каталоги приложения");
    let core = load_core(&paths).expect("не удалось загрузить ядро");
    let core = Arc::new(Mutex::new(core));

    tauri::Builder::default()
        .manage(core)
.invoke_handler(tauri::generate_handler![
            get_state,
            commands::search,
            commands::search_collections,
            commands::artist_profile,
            commands::artist_all_tracks,
            commands::play,
            commands::download_track,
            commands::get_download_dir,
            commands::set_download_dir,
            commands::get_cache_dir,
            commands::set_cache_dir,
            commands::play_tracks,
            commands::toggle_playback,
            commands::next,
            commands::previous,
            commands::seek,
            commands::set_volume,
            commands::stop,
            commands::set_shuffle,
            commands::set_repeat,
            commands::add_to_queue,
            commands::play_next,
            commands::remove_from_queue,
            commands::move_queue_item,
            commands::clear_queue,
            commands::toggle_favorite,
            commands::get_playlists,
            commands::import_playlist_url,
            commands::preview_playlist_url,
            commands::save_imported_playlist,
            commands::create_playlist,
            commands::rename_playlist,
            commands::delete_playlist,
            commands::add_to_playlist,
            commands::remove_from_playlist,
            commands::reorder_playlists,
            commands::get_library_times,
            commands::get_playlist_track_times,
            commands::reorder_playlist,
            commands::set_playlist_cover,
            commands::play_playlist,
            commands::get_history,
            commands::clear_history,
            commands::get_provider_status,
            commands::save_credential,
            commands::probe_credential,
            commands::remove_credential,
            commands::get_related,
            commands::reset_settings,
            commands::reset_data,
            commands::reorder_library,
            commands::reorder_queue,
            commands::download_track_to_cache,
            commands::download_all_to_cache,
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();
            let core = app.state::<Arc<Mutex<GuiCore>>>();
            let core = Arc::clone(core.inner());
            std::thread::spawn(move || {
                let runtime = match tokio::runtime::Builder::new_multi_thread()
                    .enable_all()
                    .build()
                {
                    Ok(runtime) => runtime,
                    Err(error) => {
                        eprintln!("[vessel] tokio runtime: {error}");
                        return;
                    }
                };
                let _guard = runtime.enter();
                driver_loop(core, app_handle);
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
