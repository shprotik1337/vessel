//! InnerTube client identities (по образцу Kopuz `clients.rs`, EUPL-1.2).
//! Константы — публичные идентификаторы клиентов YouTube (NewPipe, yt-dlp).

use crate::vpn::ApplyVpnProxy;

#[derive(Clone, Copy, Debug)]
pub struct YouTubeClient {
    pub client_name: &'static str,
    pub client_version: &'static str,
    /// Числовой id, идёт в `X-YouTube-Client-Name`.
    pub client_id: &'static str,
    pub user_agent: &'static str,
    pub os_name: &'static str,
    pub os_version: &'static str,
    pub device_make: &'static str,
    pub device_model: &'static str,
    pub android_sdk_version: Option<u32>,
    /// Отправлять `Cookie:` + `SAPISIDHASH`.
    pub login_supported: bool,
    /// Требует `playbackContext.contentPlaybackContext.signatureTimestamp`.
    pub use_signature_timestamp: bool,
}

pub const ORIGIN_YOUTUBE_MUSIC: &str = "https://music.youtube.com";

/// Общий HTTP-клиент для всех innertube/decipher запросов (тёплый TLS).
/// Кэшируется по активному VPN-прокси: сменился прокси — пересоздаётся.
pub fn clients_http() -> std::sync::Arc<reqwest::Client> {
    use std::sync::{Arc, Mutex, OnceLock};
    static CLIENT: OnceLock<Mutex<(Option<String>, Arc<reqwest::Client>)>> = OnceLock::new();
    let cell = CLIENT.get_or_init(|| Mutex::new((None, Arc::new(new_client()))));
    let mut cached = cell.lock().unwrap_or_else(|poisoned| poisoned.into_inner());
    let active = crate::vpn::current_proxy();
    if cached.0 != active {
        cached.1 = Arc::new(new_client());
        cached.0 = active;
    }
    Arc::clone(&cached.1)
}

fn new_client() -> reqwest::Client {
    build_http(reqwest::Client::builder().apply_vpn_proxy())
}

/// VESSEL_YT_PROXY (socks5h://...) — серверный egress через домашний выход:
/// Google с датацентровых IP режет InnerTube (пустой поиск, стримы без pot),
/// а с чистых всё как у пользователя на десктопе.
pub(crate) fn build_http(builder: reqwest::ClientBuilder) -> reqwest::Client {
    let mut builder = builder;
    if let Ok(proxy) = std::env::var("VESSEL_YT_PROXY")
        && !proxy.is_empty()
        && let Ok(parsed) = reqwest::Proxy::all(&proxy)
    {
        builder = builder.proxy(parsed);
    }
    builder.build().expect("youtube http client")
}

const USER_AGENT_WEB: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0";

/// Основной клиент: поиск/browse и `/player` с cookies (signatureCipher).
pub const WEB_REMIX: YouTubeClient = YouTubeClient {
    client_name: "WEB_REMIX",
    client_version: "1.20260213.01.00",
    client_id: "67",
    user_agent: USER_AGENT_WEB,
    os_name: "",
    os_version: "",
    device_make: "",
    device_model: "",
    android_sdk_version: None,
    login_supported: true,
    use_signature_timestamp: true,
};

/// Запасной клиент для стрима: анонимный, отдаёт plain URL (с POT).
pub const ANDROID_VR_1_61_48: YouTubeClient = YouTubeClient {
    client_name: "ANDROID_VR",
    client_version: "1.61.48",
    client_id: "28",
    user_agent: "com.google.android.apps.youtube.vr.oculus/1.61.48 \
                 (Linux; U; Android 12; en_US; Quest 3; Build/SQ3A.220605.009.A1; \
                 Cronet/132.0.6808.3)",
    os_name: "Android",
    os_version: "12",
    device_make: "Oculus",
    device_model: "Quest 3",
    android_sdk_version: Some(32),
    login_supported: false,
    use_signature_timestamp: false,
};

/// Premium itag'и (256–270 kbps аудио). Free-аккаунт их не видит (Kopuz).
pub fn is_premium_itag(itag: u32) -> bool {
    matches!(itag, 774 | 141 | 256 | 258)
}

/// Free-tier itag'и (~128 kbps). Их WEB_REMIX-URL у free-аккаунта всё равно
/// rate-capped на первый MiB — нужен ANDROID_VR+POT путь (Kopuz).
pub fn is_free_itag(itag: u32) -> bool {
    matches!(itag, 140 | 251 | 249 | 250)
}
