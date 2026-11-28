use std::{
    io::{Read, Write},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use serde_json::json;
use uuid::Uuid;
use vessel_core::{
    app::PlaybackStatus,
    config::{DiscordRpcSettings, DiscordStatusFormat},
    model::{ProviderKind, TrackRef},
};

const DEFAULT_CLIENT_ID: &str = "1575313641517883463"; // Registered as "Vessel"
const VESSEL_RELEASES_URL: &str = "https://github.com/shprotik1337/vessel/releases/latest";
const MAX_IMAGE_URL_LENGTH: usize = 256;

#[cfg(windows)]
type IpcStream = std::fs::File;

#[cfg(unix)]
type IpcStream = std::os::unix::net::UnixStream;

pub struct DiscordRpc {
    client_id: String,
    stream: Option<IpcStream>,
    last_connect_attempt: Option<Instant>,
    last_activity_hash: u64,
    has_active_presence: bool,
    last_position_ms: u64,
    last_position_at: Instant,
}

impl Default for DiscordRpc {
    fn default() -> Self {
        Self::new(DEFAULT_CLIENT_ID)
    }
}

impl DiscordRpc {
    pub fn new(client_id: impl Into<String>) -> Self {
        Self {
            client_id: client_id.into(),
            stream: None,
            last_connect_attempt: None,
            last_activity_hash: 0,
            has_active_presence: false,
            last_position_ms: 0,
            last_position_at: Instant::now(),
        }
    }

    pub fn set_client_id(&mut self, client_id: Option<&str>) {
        let new_id = client_id
            .filter(|id| !id.trim().is_empty())
            .unwrap_or(DEFAULT_CLIENT_ID)
            .to_string();
        if self.client_id != new_id {
            self.client_id = new_id;
            self.disconnect();
        }
    }

    pub fn disconnect(&mut self) {
        if let Some(mut stream) = self.stream.take() {
            if self.has_active_presence {
                let _ = send_clear_activity(&mut stream);
            }
        }
        self.stream = None;
        self.has_active_presence = false;
        self.last_activity_hash = 0;
    }

    fn ensure_connected(&mut self) -> bool {
        if self.stream.is_some() {
            return true;
        }

        let now = Instant::now();
        if let Some(last) = self.last_connect_attempt {
            if now.duration_since(last) < Duration::from_secs(5) {
                return false;
            }
        }
        self.last_connect_attempt = Some(now);

        match connect_ipc(&self.client_id) {
            Ok(stream) => {
                vessel_core::dlog!("[discord-rpc] connected to Discord IPC pipe");
                self.stream = Some(stream);
                true
            }
            Err(_err) => false,
        }
    }

    pub fn update(
        &mut self,
        enabled: bool,
        settings: &DiscordRpcSettings,
        language: &str,
        status: PlaybackStatus,
        now_playing: Option<&TrackRef>,
        position_ms: u64,
        duration_ms: u64,
    ) {
        let paused_hidden = status == PlaybackStatus::Paused && !settings.show_paused;
        if !enabled || status == PlaybackStatus::Stopped || paused_hidden || now_playing.is_none() {
            if self.has_active_presence {
                if self.ensure_connected() {
                    if let Some(stream) = self.stream.as_mut() {
                        let _ = send_clear_activity(stream);
                    }
                }
                self.has_active_presence = false;
                self.last_activity_hash = 0;
            }
            return;
        }

        let track = now_playing.unwrap();

        let now = Instant::now();
        let track_key = track.provider_key();
        let status_code = match status {
            PlaybackStatus::Playing => 1u8,
            PlaybackStatus::Paused => 2u8,
            _ => 0u8,
        };

        let elapsed_since_pos = now.duration_since(self.last_position_at).as_millis() as u64;
        let expected_pos = if status == PlaybackStatus::Playing {
            self.last_position_ms + elapsed_since_pos
        } else {
            self.last_position_ms
        };
        let is_seek = (position_ms as i64 - expected_pos as i64).abs() > 3500;

        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        use std::hash::{Hash, Hasher};
        track_key.hash(&mut hasher);
        status_code.hash(&mut hasher);
        settings.hash(&mut hasher);
        language.hash(&mut hasher);
        let hash = hasher.finish();

        if hash == self.last_activity_hash && !is_seek {
            return;
        }

        if !self.ensure_connected() {
            return;
        }

        self.last_activity_hash = hash;
        self.last_position_ms = position_ms;
        self.last_position_at = now;

        let res = if let Some(stream) = self.stream.as_mut() {
            send_playback_activity(stream, track, settings, language, status, position_ms, duration_ms)
        } else {
            Ok(())
        };

        match res {
            Ok(()) => {
                self.has_active_presence = true;
            }
            Err(err) => {
                vessel_core::dlog!("[discord-rpc] error sending activity: {err}");
                self.disconnect();
            }
        }
    }
}

fn connect_ipc(client_id: &str) -> std::io::Result<IpcStream> {
    #[cfg(windows)]
    let mut stream = {
        let mut found = None;
        for i in 0..10 {
            let path = format!(r"\\.\pipe\discord-ipc-{}", i);
            if let Ok(file) = std::fs::OpenOptions::new()
                .read(true)
                .write(true)
                .open(&path)
            {
                found = Some(file);
                break;
            }
        }
        found.ok_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::NotFound, "Discord IPC pipe not found")
        })?
    };

    #[cfg(unix)]
    let mut stream = {
        let dirs = [
            std::env::var("XDG_RUNTIME_DIR").ok(),
            std::env::var("TMPDIR").ok(),
            std::env::var("TMP").ok(),
            std::env::var("TEMP").ok(),
            Some("/tmp".to_string()),
        ];
        let mut found = None;
        for dir in dirs.into_iter().flatten() {
            for i in 0..10 {
                let path = std::path::Path::new(&dir).join(format!("discord-ipc-{}", i));
                if let Ok(s) = std::os::unix::net::UnixStream::connect(path) {
                    found = Some(s);
                    break;
                }
            }
            if found.is_some() {
                break;
            }
        }
        found.ok_or_else(|| {
            std::io::Error::new(std::io::ErrorKind::NotFound, "Discord IPC socket not found")
        })?
    };

    // Handshake: Opcode 0
    let handshake_payload = json!({
        "v": 1,
        "client_id": client_id
    })
    .to_string();

    write_frame(&mut stream, 0, handshake_payload.as_bytes())?;

    let (_op, _body) = read_frame(&mut stream)?;

    Ok(stream)
}

fn write_frame(stream: &mut IpcStream, opcode: u32, payload: &[u8]) -> std::io::Result<()> {
    let mut header = [0u8; 8];
    header[0..4].copy_from_slice(&opcode.to_le_bytes());
    header[4..8].copy_from_slice(&(payload.len() as u32).to_le_bytes());
    stream.write_all(&header)?;
    stream.write_all(payload)?;
    stream.flush()?;
    Ok(())
}

fn read_frame(stream: &mut IpcStream) -> std::io::Result<(u32, Vec<u8>)> {
    let mut header = [0u8; 8];
    stream.read_exact(&mut header)?;
    let opcode = u32::from_le_bytes(header[0..4].try_into().unwrap());
    let length = u32::from_le_bytes(header[4..8].try_into().unwrap()) as usize;

    let mut body = vec![0u8; length];
    stream.read_exact(&mut body)?;
    Ok((opcode, body))
}

fn send_clear_activity(stream: &mut IpcStream) -> std::io::Result<()> {
    let payload = json!({
        "cmd": "SET_ACTIVITY",
        "args": {
            "pid": std::process::id(),
            "activity": serde_json::Value::Null
        },
        "nonce": Uuid::new_v4().to_string()
    })
    .to_string();

    write_frame(stream, 1, payload.as_bytes())?;
    let _ = read_frame(stream);
    Ok(())
}

fn sanitize_discord_text(text: &str, max_chars: usize) -> Option<String> {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return None;
    }
    let mut result: String = trimmed.chars().take(max_chars).collect();
    if result.chars().count() == 1 {
        result.push(' ');
    }
    Some(result)
}

fn to_discord_image_url(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() || trimmed.len() > MAX_IMAGE_URL_LENGTH {
        return None;
    }
    if trimmed.starts_with("https://") {
        Some(trimmed.to_string())
    } else {
        None
    }
}

fn send_playback_activity(
    stream: &mut IpcStream,
    track: &TrackRef,
    settings: &DiscordRpcSettings,
    language: &str,
    status: PlaybackStatus,
    position_ms: u64,
    duration_ms: u64,
) -> std::io::Result<()> {
    let (platform_name, platform_icon) = match track.provider {
        ProviderKind::Spotify => (
            "Spotify",
            "https://cdn.rcd.gg/PreMiD/websites/S/Spotify/assets/logo.png",
        ),
        ProviderKind::YouTubeMusic => (
            "YouTube Music",
            "https://cdn.rcd.gg/PreMiD/websites/Y/YouTube%20Music/assets/logo.png",
        ),
        ProviderKind::SoundCloud => (
            "SoundCloud",
            "https://cdn.rcd.gg/PreMiD/websites/S/SoundCloud/assets/logo.png",
        ),
        ProviderKind::Deezer => (
            "Deezer",
            "https://cdn.rcd.gg/PreMiD/websites/D/Deezer/assets/logo.png",
        ),
        ProviderKind::YandexMusic => (
            "Яндекс Музыка",
            "https://cdn.rcd.gg/PreMiD/websites/Y/Yandex%20Music/assets/logo.png",
        ),
        ProviderKind::Local => (
            "Локальный файл",
            "https://cdn.rcd.gg/PreMiD/websites/S/SoundCloud/assets/logo.png",
        ),
    };

    let is_ru = language != "en";
    let is_paused = status == PlaybackStatus::Paused;
    let paused_suffix = if is_paused {
        if is_ru { " (Пауза)" } else { " (Paused)" }
    } else {
        ""
    };

    let title = track.title.trim();
    let title = if title.is_empty() { "Unknown Track" } else { title };
    let artists_raw = track.display_artist();
    let artists = if artists_raw.trim().is_empty() {
        "Unknown Artist"
    } else {
        artists_raw.trim()
    };

    let (activity_name, status_display_type, details_raw, state_raw) = match settings.status_format {
        DiscordStatusFormat::Title => (
            title.to_string(),
            2u8, // DETAILS -> "Слушает <Название трека>"
            format!("{title}{paused_suffix}"),
            artists.to_string(),
        ),
        DiscordStatusFormat::ArtistTitle => {
            let combined = format!("{artists} — {title}");
            (
                combined.clone(),
                1u8, // STATE -> "Слушает <Исполнитель — Трек>"
                title.to_string(),
                format!("{combined}{paused_suffix}"),
            )
        }
        DiscordStatusFormat::TitleArtist => {
            let combined = format!("{title} — {artists}");
            (
                combined.clone(),
                2u8, // DETAILS -> "Слушает <Трек — Исполнитель>"
                format!("{combined}{paused_suffix}"),
                artists.to_string(),
            )
        }
        DiscordStatusFormat::Artist => (
            artists.to_string(),
            1u8, // STATE -> "Слушает <Исполнитель>"
            title.to_string(),
            format!("{artists}{paused_suffix}"),
        ),
        DiscordStatusFormat::App => (
            "Vessel".to_string(),
            0u8, // NAME -> "Слушает Vessel"
            title.to_string(),
            format!("{artists}{paused_suffix}"),
        ),
    };

    let mut activity = json!({
        "type": 2, // Listening
        "name": sanitize_discord_text(&activity_name, 128).unwrap_or_else(|| "Vessel".to_string()),
        "status_display_type": status_display_type,
        "details": sanitize_discord_text(&details_raw, 128).unwrap_or_else(|| "Vessel".to_string()),
        "state": sanitize_discord_text(&state_raw, 128).unwrap_or_else(|| "Vessel".to_string()),
    });

    let mut assets = serde_json::Map::new();
    if settings.show_artwork {
        let large_image = to_discord_image_url(&settings.custom_artwork_url).or_else(|| {
            track
                .artwork_url
                .as_ref()
                .and_then(|u| to_discord_image_url(u.as_str()))
        });
        if let Some(img) = large_image {
            assets.insert("large_image".to_string(), json!(img));
        }
    }

    if settings.show_small_icon {
        assets.insert("small_image".to_string(), json!(platform_icon));
        assets.insert(
            "small_text".to_string(),
            json!(format!("{platform_name}{paused_suffix}")),
        );
    }

    if !assets.is_empty() {
        activity["assets"] = serde_json::Value::Object(assets);
    }

    if settings.show_time && status == PlaybackStatus::Playing && duration_ms > 0 {
        let now_sec = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs();
        let pos_sec = position_ms / 1000;
        let dur_sec = duration_ms / 1000;
        let start_sec = now_sec.saturating_sub(pos_sec);
        let end_sec = start_sec + dur_sec;

        activity["timestamps"] = json!({
            "start": start_sec,
            "end": end_sec
        });
    }

    if settings.show_download_button {
        let label = if is_ru { "Скачать Vessel" } else { "Download Vessel" };
        activity["buttons"] = json!([
            {
                "label": label,
                "url": VESSEL_RELEASES_URL
            }
        ]);
    }

    let payload = json!({
        "cmd": "SET_ACTIVITY",
        "args": {
            "pid": std::process::id(),
            "activity": activity
        },
        "nonce": Uuid::new_v4().to_string()
    })
    .to_string();

    write_frame(stream, 1, payload.as_bytes())?;
    let _ = read_frame(stream);
    Ok(())
}

pub struct RpcMessage {
    pub client_id: Option<String>,
    pub enabled: bool,
    pub settings: DiscordRpcSettings,
    pub language: String,
    pub status: PlaybackStatus,
    pub now_playing: Option<TrackRef>,
    pub position_ms: u64,
    pub duration_ms: u64,
}

#[derive(Clone)]
pub struct DiscordRpcHandle {
    tx: std::sync::mpsc::SyncSender<RpcMessage>,
}

impl Default for DiscordRpcHandle {
    fn default() -> Self {
        Self::spawn()
    }
}

impl DiscordRpcHandle {
    pub fn spawn() -> Self {
        let (tx, rx) = std::sync::mpsc::sync_channel::<RpcMessage>(1);
        std::thread::Builder::new()
            .name("discord-rpc-worker".to_string())
            .spawn(move || {
                let mut rpc = DiscordRpc::default();
                while let Ok(msg) = rx.recv() {
                    let mut latest = msg;
                    while let Ok(newer) = rx.try_recv() {
                        latest = newer;
                    }
                    rpc.set_client_id(latest.client_id.as_deref());
                    rpc.update(
                        latest.enabled,
                        &latest.settings,
                        &latest.language,
                        latest.status,
                        latest.now_playing.as_ref(),
                        latest.position_ms,
                        latest.duration_ms,
                    );
                }
                rpc.disconnect();
            })
            .expect("spawn discord-rpc-worker thread");

        Self { tx }
    }

    pub fn send_update(&self, msg: RpcMessage) {
        let _ = self.tx.try_send(msg);
    }
}
