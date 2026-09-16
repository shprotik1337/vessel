//! Общий контракт Vessel Client ↔ Vessel Server (`/api/v1`).
//!
//! Только сериализуемые DTO — HTTP-зависимостей здесь нет, чтобы и клиент
//! (vessel-core), и сервер (crate vessel-server) использовали один источник
//! истины форм.

use serde::{Deserialize, Serialize};

use crate::{
    model::{PlaybackSource, ProviderKind, TrackRef},
    provider::{ArtistProfile, CollectionItem, CollectionKind, ImportedPlaylist, SearchPage},
};

pub const API_PREFIX: &str = "/api/v1";
pub const API_VERSION: &str = "v1";

/// Заголовок, в котором клиент передаёт серверу свои учётные данные
/// (sp_dc, ARL, …). Значение — base64url(JSON `UserCredentials`).
/// Сервер НЕ хранит аккаунтов: каждый запрос работает под аккаунтом клиента.
pub const CREDENTIALS_HEADER: &str = "x-vessel-credentials";

/// Учётные данные клиента для серверной обработки. Клиент собирает их из
/// своего SecretStore, сервер строит провайдера на каждый запрос из этих
/// полей вместо собственных сохранённых аккаунтов.
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
pub struct UserCredentials {
    #[serde(default)]
    pub soundcloud_client_id: Option<String>,
    #[serde(default)]
    pub soundcloud_oauth_token: Option<String>,
    #[serde(default)]
    pub yandex_token: Option<String>,
    #[serde(default)]
    pub deezer_arl: Option<String>,
    #[serde(default)]
    pub spotify_sp_dc: Option<String>,
    #[serde(default)]
    pub spotify_oauth_refresh: Option<String>,
    #[serde(default)]
    pub youtube_cookie: Option<String>,
    #[serde(default)]
    pub youtube_oauth_refresh: Option<String>,
}

impl UserCredentials {
    /// true, если не передано ни одного ключа — заголовок можно не слать.
    pub fn is_empty(&self) -> bool {
        self.soundcloud_client_id.is_none()
            && self.soundcloud_oauth_token.is_none()
            && self.yandex_token.is_none()
            && self.deezer_arl.is_none()
            && self.spotify_sp_dc.is_none()
            && self.spotify_oauth_refresh.is_none()
            && self.youtube_cookie.is_none()
            && self.youtube_oauth_refresh.is_none()
    }

    /// base64url(JSON) для транспорта в заголовке.
    pub fn encode(&self) -> Result<String, serde_json::Error> {
        use base64::Engine;
        let json = serde_json::to_vec(self)?;
        Ok(base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(json))
    }

    /// Обратная операция: заголовок → credentials. Пустое/отсутствующее
    /// значение — дефолт (None везде).
    pub fn decode(raw: &str) -> Result<Self, anyhow::Error> {
        use anyhow::Context;
        use base64::Engine;
        let bytes = base64::engine::general_purpose::URL_SAFE_NO_PAD
            .decode(raw.trim())
            .context("заголовок учётных данных повреждён (base64)")?;
        serde_json::from_slice(&bytes).context("заголовок учётных данных повреждён (JSON)")
    }
}

/// Сегмент провайдера в URL (`/providers/youtube_music/...`).
pub fn kind_segment(kind: ProviderKind) -> &'static str {
    match kind {
        ProviderKind::SoundCloud => "soundcloud",
        ProviderKind::YandexMusic => "yandex_music",
        ProviderKind::Deezer => "deezer",
        ProviderKind::Spotify => "spotify",
        ProviderKind::YouTubeMusic => "youtube_music",
    }
}

pub fn kind_from_segment(segment: &str) -> Option<ProviderKind> {
    match segment {
        "soundcloud" => Some(ProviderKind::SoundCloud),
        "yandex_music" => Some(ProviderKind::YandexMusic),
        "deezer" => Some(ProviderKind::Deezer),
        "spotify" => Some(ProviderKind::Spotify),
        "youtube_music" => Some(ProviderKind::YouTubeMusic),
        _ => None,
    }
}

/// Ответ `GET /api/v1/capabilities` — рукопожатие сервера (§9 задачи).
#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
pub struct ServerInfo {
    pub name: String,
    pub version: String,
    #[serde(default)]
    pub api_version: String,
    #[serde(default)]
    pub capabilities: ServerCapabilities,
    /// Сегменты провайдеров, доступных на этом сервере прямо сейчас.
    #[serde(default)]
    pub providers: Vec<String>,
}

#[derive(Clone, Debug, Default, Serialize, Deserialize, PartialEq)]
pub struct ServerCapabilities {
    /// Сервер обрабатывает запросы к провайдерам.
    #[serde(default)]
    pub processing: bool,
    /// Полный Vessel Server: хранит пользователей (users/*).
    #[serde(default)]
    pub user_storage: bool,
    /// Сервер умеет транзитом отдавать аудио (`/api/v1/s/{token}`).
    #[serde(default)]
    pub playback_relay: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct PageResponse {
    pub page: SearchPage,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct CollectionsResponse {
    pub items: Vec<CollectionItem>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TracksResponse {
    pub tracks: Vec<TrackRef>,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ProfileResponse {
    pub profile: ArtistProfile,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ImportedPlaylistResponse {
    pub playlist: ImportedPlaylist,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct RelatedRequest {
    pub track: TrackRef,
    #[serde(default = "default_limit")]
    pub limit: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ImportPlaylistRequest {
    pub url: String,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct LikedRequest {
    #[serde(default)]
    pub profile_url: Option<String>,
}

/// Разрешение источника воспроизведения. `prefer_relay=true` — сервер обязан
/// вернуть транзитный путь, даже если URL не IP-привязанный (гео-клиент).
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ResolveSourceRequest {
    pub track: TrackRef,
    #[serde(default)]
    pub prefer_relay: bool,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ResolveSourceResponse {
    pub source: PlaybackSource,
    /// Если задан — клиент обязан стримить через этот путь сервера вместо
    /// `source.url` (url в `source` тогда остаётся исходным, для информации).
    #[serde(default)]
    pub relay_path: Option<String>,
}

fn default_limit() -> usize {
    12
}

/// Строковый код CollectionKind для query-параметров.
pub fn collection_segment(kind: CollectionKind) -> &'static str {
    match kind {
        CollectionKind::Playlist => "playlist",
        CollectionKind::Album => "album",
        CollectionKind::Artist => "artist",
    }
}

pub fn collection_from_segment(segment: &str) -> Option<CollectionKind> {
    match segment {
        "playlist" => Some(CollectionKind::Playlist),
        "album" => Some(CollectionKind::Album),
        "artist" => Some(CollectionKind::Artist),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn credentials_roundtrip() {
        let creds = UserCredentials {
            deezer_arl: Some("arl=abc-123".to_string()),
            spotify_sp_dc: Some("sp-dc-secret".to_string()),
            youtube_cookie: Some("SID=xxx; LOGIN_INFO=yyy".to_string()),
            ..UserCredentials::default()
        };
        let encoded = creds.encode().unwrap();
        let decoded = UserCredentials::decode(&encoded).unwrap();
        assert_eq!(decoded, creds);
        // пустые credentials — тоже валидны и не требуют заголовка
        assert!(UserCredentials::default().is_empty());
        assert!(!creds.is_empty());
        // мусор — понятная ошибка
        assert!(UserCredentials::decode("@@not-base64@@").is_err());
    }

    #[test]
    fn kind_segments_roundtrip() {
        for kind in [
            ProviderKind::SoundCloud,
            ProviderKind::YandexMusic,
            ProviderKind::Deezer,
            ProviderKind::Spotify,
            ProviderKind::YouTubeMusic,
        ] {
            let segment = kind_segment(kind);
            assert_eq!(kind_from_segment(segment), Some(kind));
        }
        assert_eq!(kind_from_segment("nope"), None);
    }

    #[test]
    fn server_info_json_contract() {
        let raw = r#"{
            "name": "My Vessel Server",
            "version": "0.2.0",
            "api_version": "v1",
            "capabilities": {"processing": true, "user_storage": false, "playback_relay": true},
            "providers": ["youtube_music", "spotify"]
        }"#;
        let info: ServerInfo = serde_json::from_str(raw).unwrap();
        assert_eq!(info.name, "My Vessel Server");
        assert!(info.capabilities.playback_relay);
        assert_eq!(info.providers.len(), 2);
        // минимальный ответ (без capabilities/providers) валиден
        let min: ServerInfo = serde_json::from_str(r#"{"name":"x","version":"1","api_version":"v1"}"#).unwrap();
        assert!(!min.capabilities.processing);
        assert!(min.providers.is_empty());
    }
}
