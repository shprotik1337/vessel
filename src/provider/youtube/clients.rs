//! InnerTube client identities (по образцу Kopuz `clients.rs`, EUPL-1.2).
//! Константы — публичные идентификаторы клиентов YouTube (NewPipe, yt-dlp).


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
pub fn clients_http() -> std::sync::Arc<reqwest::Client> {
    static CLIENT: std::sync::OnceLock<std::sync::Arc<reqwest::Client>> =
        std::sync::OnceLock::new();
    std::sync::Arc::clone(CLIENT.get_or_init(|| std::sync::Arc::new(new_client())))
}

fn new_client() -> reqwest::Client {
    reqwest::Client::builder()
        .build()
        .expect("youtube http client")
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

pub const ANDROID_VR_1_43_32: YouTubeClient = YouTubeClient {
    client_name: "ANDROID_VR",
    client_version: "1.43.32",
    client_id: "28",
    user_agent: "com.google.android.apps.youtube.vr.oculus/1.43.32 \
                 (Linux; U; Android 12; en_US; Quest 3; Build/SQ3A.220605.009.A1; \
                 Cronet/107.0.5284.2)",
    os_name: "Android",
    os_version: "12",
    device_make: "Oculus",
    device_model: "Quest 3",
    android_sdk_version: Some(32),
    login_supported: false,
    use_signature_timestamp: false,
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

pub const VISIONOS: YouTubeClient = YouTubeClient {
    client_name: "VISIONOS",
    client_version: "1.02",
    client_id: "101",
    user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 15_7_3) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Safari/605.1.15",
    os_name: "visionOS",
    os_version: "26.5.23O471",
    device_make: "Apple",
    device_model: "RealityDevice17,1",
    android_sdk_version: None,
    login_supported: false,
    use_signature_timestamp: false,
};

pub const STREAM_FALLBACK_CLIENTS: &[YouTubeClient] = &[VISIONOS, ANDROID_VR_1_43_32, ANDROID_VR_1_61_48];

/// Premium itag'и (256–270 kbps аудио). Free-аккаунт их не видит (Kopuz).
pub fn is_premium_itag(itag: u32) -> bool {
    matches!(itag, 774 | 141 | 256 | 258)
}

/// Free-tier itag'и (~128 kbps). Их WEB_REMIX-URL у free-аккаунта всё равно
/// rate-capped на первый MiB — нужен ANDROID_VR+POT путь (Kopuz).
pub fn is_free_itag(itag: u32) -> bool {
    matches!(itag, 140 | 251 | 249 | 250)
}
