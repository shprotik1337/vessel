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
    user::UserManager,
};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, State};

mod commands;
mod webview_cookies;

pub struct GuiCore {
    pub app: App,
    pub runtime: Runtime,
    pub config: AppConfig,
    pub paths: AppPaths,
    pub storage: Storage,
    pub users: UserManager,
    pub needs_user_selection: bool,
    pub last_state_hash: u64,
    pub last_progress_at: Instant,
}

#[derive(Serialize, Clone)]
pub struct ImageProxyConfig {
    pub server_url: String,
    pub token: String,
    pub routed_providers: Vec<String>,
}

/// Р СџР С•Р В»Р Р…Р С•Р Вµ РЎРѓР С•РЎРѓРЎвЂљР С•РЎРЏР Р…Р С‘Р Вµ Р С—РЎР‚Р С‘Р В»Р С•Р В¶Р ВµР Р…Р С‘РЎРЏ, Р С”Р С•РЎвЂљР С•РЎР‚Р С•Р Вµ РЎвЂћРЎР‚Р С•Р Р…РЎвЂљР ВµР Р…Р Т‘ РЎвЂЎР С‘РЎвЂљР В°Р ВµРЎвЂљ Р Р…Р В°Р С—РЎР‚РЎРЏР С˜РЎС“РЎР‹ Р С—Р С• Р В·Р В°Р С—РЎР‚Р С•РЎРѓРЎС“.
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
    pub youtube_music_enabled: bool,
    pub status_message: String,
    pub user_profile: Option<vessel_core::user::UserProfile>,
    pub needs_user_selection: bool,
    pub language: String,
    pub wave_source: String,
    pub image_proxy: Option<ImageProxyConfig>,
}

#[derive(Serialize, Clone)]
pub struct ProviderStatus {
    pub kind: String,
    pub label: String,
    pub connected: bool,
    pub has_credentials: bool,
    pub enabled: bool,
    /// "local" РёР»Рё "server:<РЅР°Р·РІР°РЅРёРµ>" вЂ” РіРґРµ СЂРµР°Р»СЊРЅРѕ РёСЃРїРѕР»РЅСЏРµС‚СЃСЏ РїСЂРѕРІР°Р№РґРµСЂ.
    pub origin: String,
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
        vessel_core::model::ProviderKind::YouTubeMusic,
    ];
    for kind in kinds {
        let label = kind.label().to_string();
        let kind_str = match kind {
            vessel_core::model::ProviderKind::SoundCloud => "soundcloud",
            vessel_core::model::ProviderKind::YandexMusic => "yandex",
            vessel_core::model::ProviderKind::Deezer => "deezer",
            vessel_core::model::ProviderKind::Spotify => "spotify",
            vessel_core::model::ProviderKind::YouTubeMusic => "youtube_music",
        }
        .to_string();
        let enabled = match kind {
            vessel_core::model::ProviderKind::SoundCloud => core.app.soundcloud_enabled,
            vessel_core::model::ProviderKind::YandexMusic => core.app.yandex_enabled,
            vessel_core::model::ProviderKind::Deezer => core.app.deezer_enabled,
            vessel_core::model::ProviderKind::Spotify => core.app.spotify_enabled,
            vessel_core::model::ProviderKind::YouTubeMusic => core.app.youtube_music_enabled,
        };
        let has_credentials = match kind {
            vessel_core::model::ProviderKind::SoundCloud => credentials.soundcloud,
            vessel_core::model::ProviderKind::YandexMusic => credentials.yandex,
            vessel_core::model::ProviderKind::Deezer => credentials.deezer,
            vessel_core::model::ProviderKind::Spotify => credentials.spotify,
            vessel_core::model::ProviderKind::YouTubeMusic => credentials.youtube,
        };
        let connected = match kind {
            // YouTube Music работает анонимно — всегда connected, если enabled
            vessel_core::model::ProviderKind::YouTubeMusic => registry.get(kind).is_some() && enabled,
            // Остальные — показываем «подключено» только если пользователь
            // явно сохранил ключ/cookie (иначе на свежей установке SoundCloud
            // авто-дискавери показывает зелёный бейдж хотя никто не входил)
            _ => registry.get(kind).is_some() && enabled && has_credentials,
        };
        let origin = match core.config.provider_routing.get(vessel_core::protocol::kind_segment(kind)) {
            Some(target) if target.starts_with("server:") => {
                let id = &target["server:".len()..];
                core.config
                    .vessel_servers
                    .iter()
                    .find(|s| s.id == id)
                    .map(|s| format!("server:{}", s.name))
                    .unwrap_or_else(|| "local".to_string())
            }
            _ => "local".to_string(),
        };
        statuses.push(ProviderStatus {
            kind: kind_str,
            label,
            connected,
            has_credentials,
            enabled,
            origin,
        });
    }
    statuses
}

pub fn build_full_state(core: &GuiCore) -> FullState {
    let player = core.app.player.clone();
    let image_proxy = {
        // Проксируем изображения только для провайдеров, которые ЯВНО переключены на «Сервер».
        // В чисто локальном режиме VPS не используется вообще (image_proxy = None).
        let mut routed_providers = Vec::new();
        let mut active_server_id = None;

        for (provider_segment, target) in &core.config.provider_routing {
            if let Some(server_id) = target.strip_prefix("server:") {
                routed_providers.push(provider_segment.clone());
                if active_server_id.is_none() {
                    active_server_id = Some(server_id.to_string());
                }
            }
        }

        let server = active_server_id.and_then(|server_id| {
            core.config.vessel_servers.iter().find(|s| s.id == server_id)
        });

        if let Some(server) = server {
            if !routed_providers.is_empty() {
                let secret_name = format!("vessel-server:{}", server.id);
                let token = core
                    .runtime
                    .get_named_secret(&secret_name)
                    .ok()
                    .flatten()
                    .unwrap_or_default();
                Some(ImageProxyConfig {
                    server_url: server.url.trim_end_matches('/').to_string(),
                    token,
                    routed_providers,
                })
            } else {
                None
            }
        } else {
            None
        }
    };

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
        youtube_music_enabled: core.app.youtube_music_enabled,
        status_message: core.app.status_message.clone(),
        user_profile: core.app.user_profile.clone(),
        needs_user_selection: core.needs_user_selection,
        language: core.config.language.clone(),
        wave_source: core
            .config
            .wave_source
            .clone()
            .unwrap_or_else(|| "favorites".to_string()),
        image_proxy,
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

/// Р С›РЎРѓР Р…Р С•Р Р†Р Р…Р С•Р в„– РЎвЂ Р С‘Р С”Р В»: Р С–Р С•Р Р…РЎРЏР ВµРЎвЂљ runtime, Р С—Р ВµРЎР‚РЎРѓР С‘РЎРѓРЎвЂљР С‘РЎвЂљ РЎРѓР С•РЎРѓРЎвЂљР С•РЎРЏР Р…Р С‘Р Вµ, РЎв‚¬Р В»РЎвЂРЎвЂљ РЎРѓР С•Р В±РЎвЂ№РЎвЂљР С‘РЎРЏ.
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
            vessel_core::dlog!("[vessel] save_queue: {error}");
        } else {
            core.app.queue_dirty = false;
        }
    }
    if core.app.playlists_dirty {
        for playlist in &core.app.playlists {
            if let Err(error) = core.storage.save_playlist(playlist) {
                vessel_core::dlog!("[vessel] save_playlist: {error}");
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
        config.youtube_music_enabled = core.app.youtube_music_enabled;
        // Р ВРЎРѓРЎвЂљР С•РЎвЂЎР Р…Р С‘Р С” Р В°РЎС“Р Т‘Р С‘Р С• Spotify (Р СР ВµР Р…РЎРЏР ВµРЎвЂљРЎРѓРЎРЏ РЎвЂЎР ВµРЎР‚Р ВµР В· set_spotify_playback_source,
        // Р С”Р С•РЎвЂљР С•РЎР‚РЎвЂ№Р в„– Р С—Р С‘РЎв‚¬Р ВµРЎвЂљ Р ВµР С–Р С• Р Р† core.config РЎвЂЎР ВµРЎР‚Р ВµР В· Runtime)
        config.spotify_playback_source = core.config.spotify_playback_source.clone();
        config.global_hotkeys_enabled = core.app.global_hotkeys_enabled;
        config.hotkeys = core.app.hotkeys.clone();
        config.keybindings_notice_seen = core.app.keybindings_notice_seen;
        if let Err(error) = config.save(&core.paths) {
            vessel_core::dlog!("[vessel] save config: {error}");
        } else {
            core.config = config;
            core.app.config_dirty = false;
        }
    }
    if core.app.user_dirty {
        core.users.active_user_mut().profile.touch();
        if let Err(error) = core.users.active_user().save_profile() {
            vessel_core::dlog!("[vessel] save profile: {error}");
        } else {
            core.app.user_dirty = false;
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
    let users_dir = config
        .users_dir_override
        .as_deref()
        .map(str::trim)
        .filter(|dir| !dir.is_empty())
        .map(PathBuf::from)
        .unwrap_or_else(|| paths.users_dir());
    let mut users = UserManager::open(users_dir, config.history_limit, Some(paths.database_file.clone()))?;
    // Р С’Р Р†РЎвЂљР С•-Р Р†РЎвЂ¦Р С•Р Т‘ Р С‘Р В»Р С‘ Р Р†РЎвЂ№Р В±Р С•РЎР‚ Р С—Р С•Р В»РЎРЉР В·Р С•Р Р†Р В°РЎвЂљР ВµР В»РЎРЏ Р С—РЎР‚Р С‘ РЎРѓРЎвЂљР В°РЎР‚РЎвЂљР Вµ
    if let Some(auto) = config.auto_login_user.clone() {
        if users.user_exists(&auto) {
            users.switch_user(&auto)?;
        }
    }
    let needs_user_selection = config.auto_login_user.is_none() && users.count() > 1;
    let storage = users.storage().clone();
    let mut app = App::load(&storage, &config)?;
    app.user_profile = Some(users.active_user().profile.clone());
    let mut runtime = Runtime::new(&config, &secrets, storage.clone());
    match runtime.credential_state() {
        Ok(credentials) => app.set_credentials(credentials),
        Err(error) => app.status_message = format!("Р СњР Вµ РЎС“Р Т‘Р В°Р В»Р С•РЎРѓРЎРЉ Р С—РЎР‚Р С•Р Р†Р ВµРЎР‚Р С‘РЎвЂљРЎРЉ Р С”Р В»РЎР‹РЎвЂЎР С‘: {error}"),
    }
    if let Some(notice) = runtime.take_notices().into_iter().last() {
        app.status_message = notice;
    }
    Ok(GuiCore {
        app,
        runtime,
        config,
        paths: paths.clone(),
        storage,
        users,
        needs_user_selection,
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
pub fn run() -> anyhow::Result<()> {
    let paths = AppPaths::discover().expect("Р Р…Р Вµ РЎС“Р Т‘Р В°Р В»Р С•РЎРѓРЎРЉ Р Р…Р В°Р в„–РЎвЂљР С‘ Р С—РЎС“РЎвЂљР С‘ Р С—РЎР‚Р С‘Р В»Р С•Р В¶Р ВµР Р…Р С‘РЎРЏ");
    paths
        .ensure()
        .expect("Р Р…Р Вµ РЎС“Р Т‘Р В°Р В»Р С•РЎРѓРЎРЉ РЎРѓР С•Р В·Р Т‘Р В°РЎвЂљРЎРЉ Р С”Р В°РЎвЂљР В°Р В»Р С•Р С–Р С‘ Р С—РЎР‚Р С‘Р В»Р С•Р В¶Р ВµР Р…Р С‘РЎРЏ");

    // Р РЋРЎвЂљР В°РЎР‚РЎвЂљР С•Р Р†Р В°РЎРЏ Р С•РЎвЂЎР С‘РЎРѓРЎвЂљР С”Р В° Р С”РЎРЊРЎв‚¬Р ВµР в„–: Р Р†РЎР‚Р ВµР СР ВµР Р…Р Р…РЎвЂ№Р в„– playback-Р С”РЎРЊРЎв‚¬ (Deezer/Spotify)
    // РЎС“Р Т‘Р В°Р В»РЎРЏР ВµРЎвЂљРЎРѓРЎРЏ РЎвЂ Р ВµР В»Р С‘Р С”Р С•Р С (legacy-РЎвЂћР В°Р в„–Р В»РЎвЂ№, Р С•РЎР‚РЎвЂћР В°Р Р…РЎвЂ№, .part), Р Р† offline-Р С”РЎРЊРЎв‚¬Р Вµ
    // Р Р†РЎвЂ№РЎвЂЎР С‘РЎвЂ°Р В°РЎР‹РЎвЂљРЎРѓРЎРЏ РЎвЂљР С•Р В»РЎРЉР С”Р С• .part Р С‘ Р Р…РЎС“Р В»Р ВµР Р†РЎвЂ№Р Вµ РЎвЂћР В°Р в„–Р В»РЎвЂ№. Р вЂ™Р В°Р В»Р С‘Р Т‘Р Р…РЎвЂ№Р Вµ offline-Р В·Р В°Р С–РЎР‚РЎС“Р В·Р С”Р С‘
    // (Р’В«Р РЋР С”Р В°РЎвЂЎР В°РЎвЂљРЎРЉ Р Р† Р С”Р ВµРЎв‚¬Р’В») Р Р…Р Вµ РЎвЂљРЎР‚Р С•Р С–Р В°РЎР‹РЎвЂљРЎРѓРЎРЏ.
    let (removed, errors) = vessel_core::provider::cache::cleanup_playback_caches();
    if removed > 0 || errors > 0 {
        vessel_core::dlog!("[cache] startup cleanup: removed={removed} errors={errors}");
    }

    let core = load_core(&paths).expect("Р Р…Р Вµ РЎС“Р Т‘Р В°Р В»Р С•РЎРѓРЎРЉ Р В·Р В°Р С–РЎР‚РЎС“Р В·Р С‘РЎвЂљРЎРЉ РЎРЏР Т‘РЎР‚Р С•");
    let core = Arc::new(Mutex::new(core));

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
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
            commands::set_provider_enabled,
            commands::get_related,
            commands::get_wave_recommendations,
            commands::get_wave_source,
            commands::set_wave_source,
            commands::get_wave_providers,
            commands::set_wave_providers,
            commands::get_recommendation_providers,
            commands::set_recommendation_providers,
            commands::import_likes,
            commands::reset_settings,
            commands::reset_data,
            commands::reorder_library,
            commands::reorder_queue,
            commands::download_track_to_cache,
            commands::download_all_to_cache,
            commands::get_spotify_proxy,
            commands::set_spotify_proxy,
            commands::get_spotify_playback_source,
            commands::set_spotify_playback_source,
            commands::spotify_browser_login,
            commands::spotify_capture_cookies,
            commands::spotify_login_window_open,
            commands::spotify_auth_cancel,
            commands::soundcloud_browser_login,
            commands::soundcloud_login_window_open,
            commands::soundcloud_auth_cancel,
            commands::deezer_browser_login,
            commands::deezer_login_window_open,
            commands::deezer_auth_cancel,
            commands::get_user_profile,
            commands::get_known_users,
            commands::switch_user,
            commands::create_user,
            commands::export_user,
            commands::import_user,
            commands::backup_user,
            commands::select_user,
            commands::clear_auto_login,
            commands::get_auto_login,
            commands::delete_user,
            commands::get_language,
            commands::set_language,
            commands::pick_folder,
            commands::pick_file,
            commands::save_file_as,
            commands::open_path,
            commands::get_users_dir,
            commands::vessel_servers,
            commands::vessel_routes,
            commands::vessel_server_probe,
            commands::vessel_server_add,
            commands::vessel_server_remove,
            commands::vessel_route_set,
        ])
        .setup(|app| {
            let app_handle = app.handle().clone();
            let core_state = app.state::<Arc<Mutex<GuiCore>>>().inner();
            let core = Arc::clone(core_state);
            std::thread::spawn(move || {
                let runtime = match tokio::runtime::Builder::new_multi_thread()
                    .enable_all()
                    .build()
                {
                    Ok(runtime) => runtime,
                    Err(error) => {
                        vessel_core::dlog!("[vessel] tokio runtime: {error}");
                        return;
                    }
                };
                let _guard = runtime.enter();
                driver_loop(core, app_handle);
            });

            Ok(())
        })
    .run(tauri::generate_context!())?;

    Ok(())
}
