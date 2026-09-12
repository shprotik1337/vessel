use crate::{
    config::AppConfig,
    model::ProviderKind,
    protocol::kind_from_segment,
    provider::{
        ProviderRegistry,
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

pub fn build_registry(config: &AppConfig, secrets: &SecretStore, allow_remote: bool) -> ProviderSetup {
    let mut registry = ProviderRegistry::default();
    let mut notices = Vec::new();

    if config.soundcloud_enabled {
        let soundcloud_key = config
            .soundcloud_client_id_override
            .clone()
            .or_else(|| load_secret(secrets, SecretKey::SoundCloudClientIdOverride, &mut notices))
            .or_else(|| load_secret(secrets, SecretKey::SoundCloudClientId, &mut notices));
        if let Some(client_id) = soundcloud_key.filter(|value| !value.trim().is_empty()) {
            match SoundCloudProvider::new(client_id) {
                Ok(provider) => registry.register(provider),
                Err(error) => notices.push(format!("SoundCloud не настроен: {error}")),
            }
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
            Ok(mut provider) => {
                if let Ok(resolver) = crate::provider::youtube::YoutubeResolver::new() {
                    provider.set_youtube_resolver(resolver);
                }
                registry.register(provider);
            }
            Err(error) => notices.push(format!("Spotify не настроен: {error}")),
        }
    }

    // YouTube Music всегда включён: поиск и стримы работают анонимно
    // (Kopuz-пайплайн: WEB_REMIX+decipher+pot), cookie не требуется.
    match YouTubeMusicProvider::new() {
        Ok(provider) => registry.register(provider),
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
        match ServerClient::new(&server.url, &token) {
            Ok(client) => registry.register(ServerProvider::new(kind, client)),
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
        assert!(setup.registry.get(crate::model::ProviderKind::SoundCloud).is_none());
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
}


