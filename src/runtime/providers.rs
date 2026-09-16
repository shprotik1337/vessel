use crate::{
    config::AppConfig,
    model::ProviderKind,
    protocol::{UserCredentials, kind_from_segment},
    provider::{
        MusicProvider, ProviderRegistry,
        remote::{ServerClient, ServerProvider},
        deezer::DeezerProvider,
        soundcloud::SoundCloudProvider,
        spotify::SpotifyProvider,
        yandex::YandexProvider,
        youtube::YouTubeMusicProvider,
    },
    secrets::{SecretKey, SecretStore},
};

pub struct ProviderSetup {
    pub registry: ProviderRegistry,
    pub notices: Vec<String>,
}

/// Собирает учётные данные пользователя из SecretStore клиента — их клиент
/// передаёт Vessel Server заголовком, чтобы сервер работал под аккаунтом
/// пользователя, а не под своими сохранёнными аккаунтами.
pub fn collect_credentials(secrets: &SecretStore) -> UserCredentials {
    UserCredentials {
        soundcloud_client_id: load_secret(secrets, SecretKey::SoundCloudClientIdOverride, &mut Vec::new())
            .or_else(|| load_secret(secrets, SecretKey::SoundCloudClientId, &mut Vec::new()))
            .filter(|value| !value.trim().is_empty()),
        soundcloud_oauth_token: load_secret(secrets, SecretKey::SoundCloudOAuthToken, &mut Vec::new())
            .filter(|value| !value.trim().is_empty()),
        yandex_token: load_secret(secrets, SecretKey::YandexToken, &mut Vec::new())
            .filter(|value| !value.trim().is_empty()),
        deezer_arl: load_secret(secrets, SecretKey::DeezerArl, &mut Vec::new())
            .filter(|value| !value.trim().is_empty()),
        spotify_sp_dc: load_secret(secrets, SecretKey::SpotifySpDc, &mut Vec::new())
            .filter(|value| !value.trim().is_empty()),
        spotify_oauth_refresh: load_secret(secrets, SecretKey::SpotifyOAuthRefreshToken, &mut Vec::new())
            .filter(|value| !value.trim().is_empty()),
        youtube_cookie: load_secret(secrets, SecretKey::YouTubeCookie, &mut Vec::new())
            .filter(|value| !value.trim().is_empty()),
        youtube_oauth_refresh: load_secret(secrets, SecretKey::YouTubeOAuthRefresh, &mut Vec::new())
            .filter(|value| !value.trim().is_empty()),
    }
}

/// Собирает одного провайдера из учётных данных (для Vessel Server: каждый
/// запрос строит провайдера из credentials клиента, свои аккаунты сервер не
/// хранит). YouTube Music работает и анонимно; SoundCloud может работать с
/// публичным client_id (если его нет в credentials — ошибка, серверная
/// обёртка подставит автообнаруженный ключ).
pub fn build_provider(
    kind: ProviderKind,
    creds: &UserCredentials,
    config: &AppConfig,
) -> anyhow::Result<Box<dyn MusicProvider>> {
    let provider: Box<dyn MusicProvider> = match kind {
        ProviderKind::SoundCloud => Box::new(SoundCloudProvider::with_oauth(
            creds.soundcloud_client_id.clone().unwrap_or_default(),
            creds.soundcloud_oauth_token.clone(),
        )?),
        ProviderKind::YandexMusic => Box::new(YandexProvider::new(
            creds.yandex_token.clone().ok_or_else(|| {
                anyhow::anyhow!("Yandex Music: не передан OAuth-токен пользователя")
            })?,
        )?),
        ProviderKind::Deezer => Box::new(DeezerProvider::new(
            creds.deezer_arl.clone().ok_or_else(|| {
                anyhow::anyhow!("Deezer: не передан ARL пользователя")
            })?,
        )?),
        ProviderKind::Spotify => Box::new(SpotifyProvider::with_proxy(
            creds.spotify_sp_dc.clone().ok_or_else(|| {
                anyhow::anyhow!("Spotify: не передан sp_dc пользователя")
            })?,
            config.spotify_proxy.as_deref(),
        )?),
        ProviderKind::YouTubeMusic => {
            let mut provider = YouTubeMusicProvider::new()?;
            if let Some(cookie) = creds.youtube_cookie.clone().filter(|v| !v.trim().is_empty()) {
                provider.set_cookie(Some(cookie));
            }
            if let Some(refresh) = creds
                .youtube_oauth_refresh
                .clone()
                .filter(|v| !v.trim().is_empty())
            {
                provider.set_oauth_refresh(Some(refresh));
            }
            if let Some(potoken_url) = youtube_potoken_url(config) {
                provider.set_potoken_provider(Some(potoken_url));
            }
            Box::new(provider)
        }
    };
    Ok(provider)
}

pub fn build_registry(config: &AppConfig, secrets: &SecretStore, allow_remote: bool) -> ProviderSetup {
    let mut registry = ProviderRegistry::default();
    let mut notices = Vec::new();

    if config.soundcloud_enabled {
        let soundcloud_key = config
            .soundcloud_client_id_override
            .clone()
            .or_else(|| load_secret(secrets, SecretKey::SoundCloudClientIdOverride, &mut notices))
            .or_else(|| load_secret(secrets, SecretKey::SoundCloudClientId, &mut notices))
            .unwrap_or_default();
        let oauth_token = load_secret(secrets, SecretKey::SoundCloudOAuthToken, &mut notices)
            .filter(|value| !value.trim().is_empty());
        match SoundCloudProvider::with_oauth(soundcloud_key, oauth_token) {
            Ok(provider) => registry.register(provider),
            Err(error) => notices.push(format!("SoundCloud не настроен: {error}")),
        }
    }

    if config.yandex_enabled
        && let Some(token) = load_secret(secrets, SecretKey::YandexToken, &mut notices)
            .filter(|value| !value.trim().is_empty())
    {
        match YandexProvider::new(token) {
            Ok(provider) => registry.register(provider),
            Err(error) => notices.push(format!("Yandex Music не настроен: {error}")),
        }
    }

    if config.deezer_enabled
        && let Some(arl) = load_secret(secrets, SecretKey::DeezerArl, &mut notices)
            .filter(|value| !value.trim().is_empty())
    {
        match DeezerProvider::new(arl) {
            Ok(provider) => registry.register(provider),
            Err(error) => notices.push(format!("Deezer не настроен: {error}")),
        }
    }

    if config.spotify_enabled
        && let Some(sp_dc) = load_secret(secrets, SecretKey::SpotifySpDc, &mut notices)
            .filter(|value| !value.trim().is_empty())
    {
        let proxy = config.spotify_proxy.as_deref();
        match SpotifyProvider::with_proxy(sp_dc, proxy) {
            Ok(provider) => registry.register(provider),
            Err(error) => notices.push(format!("Spotify не настроен: {error}")),
        }
    }

    // YouTube Music работает анонимно, но ключи сильно расширяют возможности:
    // - cookie/OAuth: поиск и browse проходят бот-чек на серверных (DC) IP,
    //   WEB_REMIX отдаёт полные форматы вместо 1 MiB preview;
    // - potoken-провайдер (bgutil HTTP): стабильный POT там, где BotGuard
    //   mint ненадёжен (датацентровые IP, слабые VPS).
    // Один и тот же код обслуживает и локальный клиент, и Vessel Server.
    match YouTubeMusicProvider::new() {
        Ok(mut provider) => {
            if let Some(cookie) = youtube_cookie(secrets, &mut notices) {
                provider.set_cookie(Some(cookie));
            }
            if let Some(refresh) = youtube_refresh(secrets, &mut notices) {
                provider.set_oauth_refresh(Some(refresh));
            }
            if let Some(potoken_url) = youtube_potoken_url(config) {
                provider.set_potoken_provider(Some(potoken_url));
            }
            registry.register(provider);
        }
        Err(error) => notices.push(format!("YouTube Music не настроен: {error}")),
    }

    if allow_remote {
        apply_provider_routing(&mut registry, config, secrets, &mut notices);
    }

    ProviderSetup { registry, notices }
}

/// Подмена локальных реализаций на `ServerProvider` по `config.provider_routing`
/// (`spotify` → `"server:<id>" | "local"`). Ключ карты — сегмент из protocol.
fn apply_provider_routing(
    registry: &mut ProviderRegistry,
    config: &AppConfig,
    secrets: &SecretStore,
    notices: &mut Vec<String>,
) {
    for (segment, target) in &config.provider_routing {
        let Some(kind) = kind_from_segment(segment) else {
            notices.push(format!("Маршрут «{segment}»: неизвестный провайдер — игнорируем"));
            continue;
        };
        let Some(server_id) = target.strip_prefix("server:") else {
            continue; // "local" и пустое — локальный режим уже собран выше
        };
        let Some(server) = config.vessel_servers.iter().find(|s| s.id == server_id) else {
            notices.push(format!("Маршрут «{segment}»: Vessel Server «{server_id}» не найден — остался локальный режим"));
            continue;
        };
        let token = secrets
            .get_named(&format!("vessel-server:{server_id}"))
            .ok()
            .flatten()
            .unwrap_or_default();
        if token.trim().is_empty() {
            notices.push(format!(
                "Vessel Server «{server_id}»: токен доступа не найден — добавь сервер заново или впиши токен (Настройки → Сервер)"
            ));
            continue;
        }
        match ServerClient::with_secrets(&server.url, &token, Some(secrets.clone())) {
            Ok(client) => {
                crate::dlog!("[routing] {} -> ServerProvider ({} @ {})", kind.label(), server_id, server.url);
                registry.register(ServerProvider::new(kind, client));
            }
            Err(error) => notices.push(format!("Vessel Server «{server_id}»: {error}")),
        }
    }
}

fn load_secret(secrets: &SecretStore, key: SecretKey, notices: &mut Vec<String>) -> Option<String> {
    match secrets.get(key) {
        Ok(value) => value,
        Err(error) => {
            // Хранилище секретов решило стать ребусом, сервис просто не включаем и живём дальше
            notices.push(format!("Не удалось прочитать локальный ключ: {error}"));
            None
        }
    }
}

/// Cookie YouTube из SecretStore (даёт полные стримы и поиск с серверных IP).
fn youtube_cookie(secrets: &SecretStore, notices: &mut Vec<String>) -> Option<String> {
    load_secret(secrets, SecretKey::YouTubeCookie, notices).filter(|value| !value.trim().is_empty())
}

/// OAuth refresh_token YouTube из SecretStore (для стримов после перезапуска).
fn youtube_refresh(secrets: &SecretStore, notices: &mut Vec<String>) -> Option<String> {
    load_secret(secrets, SecretKey::YouTubeOAuthRefresh, notices)
        .filter(|value| !value.trim().is_empty())
}

/// URL potoken-провайдера (bgutil-совместимый HTTP API) из конфига.
fn youtube_potoken_url(config: &AppConfig) -> Option<String> {
    config
        .youtube_potoken_provider
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn disabled_providers_ignore_even_existing_secrets() {
        let temp = tempfile::tempdir().unwrap();
        let secrets = SecretStore::new(temp.path().join("secrets.json"));
        secrets
            .set(SecretKey::SoundCloudClientId, "public-key")
            .unwrap();
        secrets.set(SecretKey::YandexToken, "oauth-token").unwrap();
        let config = AppConfig {
            soundcloud_enabled: false,
            yandex_enabled: false,
            ..AppConfig::default()
        };

        let setup = build_registry(&config, &secrets, true);

        assert!(
            setup
                .registry
                .get(crate::model::ProviderKind::SoundCloud)
                .is_none()
        );
        assert!(
            setup
                .registry
                .get(crate::model::ProviderKind::YandexMusic)
                .is_none()
        );
    }

    #[cfg(test)]
    fn routing_config() -> AppConfig {
        AppConfig {
            vessel_servers: vec![crate::config::VesselServerConfig {
                id: "s1".to_string(),
                name: "Home Server".to_string(),
                url: "http://127.0.0.1:7710".to_string(),
            }],
            provider_routing: std::collections::BTreeMap::from([(
                "soundcloud".to_string(),
                "server:s1".to_string(),
            )]),
            ..AppConfig::default()
        }
    }

    #[test]
    fn provider_routing_replaces_local_with_server_provider() {
        let temp = tempfile::tempdir().unwrap();
        let secrets = SecretStore::file_only(temp.path().join("secrets.json"));
        secrets
            .set_named("vessel-server:s1", "super-secret-token")
            .unwrap();
        let config = routing_config();

        let setup = build_registry(&config, &secrets, true);
        let provider = setup
            .registry
            .get(crate::model::ProviderKind::SoundCloud)
            .expect("SoundCloud обязан появиться как remote");
        assert!(
            provider.attribution().label.contains("Vessel Server"),
            "атрибуция remote-провайдера: {}",
            provider.attribution().label
        );

        // allow_remote=false (режим самого Vessel Server) — remote не подключается
        let setup = build_registry(&config, &secrets, false);
        assert!(!setup.registry.get(crate::model::ProviderKind::SoundCloud).unwrap().is_remote());
    }

    #[test]
    fn provider_routing_missing_server_keeps_local_and_warns() {
        let temp = tempfile::tempdir().unwrap();
        let secrets = SecretStore::file_only(temp.path().join("secrets.json"));
        let mut config = routing_config();
        config
            .provider_routing
            .insert("spotify".to_string(), "server:nope".to_string());

        let setup = build_registry(&config, &secrets, true);
        assert!(
            setup
                .notices
                .iter()
                .any(|n| n.contains("nope") && n.contains("не найден")),
            "ожидали предупреждение: {:?}",
            setup.notices
        );
    }

    #[test]
    fn runtime_sync_config_switches_providers_live() {
        let temp = tempfile::tempdir().unwrap();
        let secrets = SecretStore::file_only(temp.path().join("secrets.json"));
        secrets
            .set_named("vessel-server:s1", "super-secret-token")
            .unwrap();
        let storage = crate::storage::Storage::new(temp.path().join("storage.sqlite3"));
        storage.initialize().unwrap();

        let initial_config = AppConfig::default();
        let mut runtime = crate::runtime::Runtime::new(&initial_config, &secrets, storage);

        // По умолчанию YouTube Music локальный
        let initial_yt = runtime
            .provider_registry()
            .get(crate::model::ProviderKind::YouTubeMusic)
            .expect("YouTube Music должен быть зарегистрирован");
        assert!(!initial_yt.is_remote(), "Изначально провайдер должен быть локальным");

        // Переключаем YouTube Music на сервер
        let mut server_config = routing_config();
        server_config.provider_routing.insert(
            "youtube_music".to_string(),
            "server:s1".to_string(),
        );
        runtime.sync_config(&server_config);

        let remote_yt = runtime
            .provider_registry()
            .get(crate::model::ProviderKind::YouTubeMusic)
            .expect("YouTube Music должен быть зарегистрирован после sync");
        assert!(remote_yt.is_remote(), "После sync_config провайдер обязан стать удалённым (ServerProvider)");

        // Переключаем обратно на local
        let local_config = AppConfig::default();
        runtime.sync_config(&local_config);

        let back_yt = runtime
            .provider_registry()
            .get(crate::model::ProviderKind::YouTubeMusic)
            .expect("YouTube Music должен быть зарегистрирован после возврата");
        assert!(!back_yt.is_remote(), "После sync_config с local провайдер обязан снова стать локальным");
    }
}


