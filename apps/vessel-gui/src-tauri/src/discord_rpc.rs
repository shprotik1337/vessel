use std::{
    io::{Read, Write},
    time::{Duration, Instant, SystemTime, UNIX_EPOCH},
};

use serde_json::json;
use uuid::Uuid;
use vessel_core::{
    app::PlaybackStatus,
    model::{ProviderKind, TrackRef},
};

const DEFAULT_CLIENT_ID: &str = "1129859263741837373"; // Registered as "Music" (без упоминания Vessel)

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
        status: PlaybackStatus,
        now_playing: Option<&TrackRef>,
        position_ms: u64,
        duration_ms: u64,
    ) {
        if !enabled || status == PlaybackStatus::Stopped || now_playing.is_none() {
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
            send_playback_activity(stream, track, status, position_ms, duration_ms)
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

fn send_playback_activity(
    stream: &mut IpcStream,
    track: &TrackRef,
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
    };

    let artists = track.display_artist();
    let state_text = match status {
        PlaybackStatus::Playing => format!("{artists} • {platform_name}"),
        PlaybackStatus::Paused => format!("{artists} • {platform_name} (Пауза)"),
        _ => artists.clone(),
    };

    let artwork_url = track
        .artwork_url
        .as_ref()
        .map(|u| u.to_string())
        .unwrap_or_else(|| platform_icon.to_string());

    let mut activity = json!({
        "type": 2, // Listening
        "details": track.title,
        "state": state_text,
        "assets": {
            "large_image": artwork_url,
            "small_image": platform_icon,
            "small_text": match status {
                PlaybackStatus::Playing => platform_name.to_string(),
                PlaybackStatus::Paused => format!("{platform_name} (Пауза)"),
                _ => platform_name.to_string(),
            }
        }
    });

    if status == PlaybackStatus::Playing && duration_ms > 0 {
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

    let web_url_str = track.web_url.as_str();
    if web_url_str.starts_with("http://") || web_url_str.starts_with("https://") {
        let button_label = match track.provider {
            ProviderKind::YandexMusic => "Слушать на Яндекс Музыке",
            _ => &format!("Слушать на {platform_name}"),
        };
        activity["buttons"] = json!([
            {
                "label": button_label,
                "url": web_url_str
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
