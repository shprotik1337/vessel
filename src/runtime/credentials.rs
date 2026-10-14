use crate::{
    credentials::{CredentialKind, CredentialState},
    model::ProviderKind,
    secrets::{SecretKey, SecretStore},
};

use super::Runtime;

impl Runtime {
    pub fn credential_state(&self) -> anyhow::Result<CredentialState> {
        CredentialState::load(&self.secrets)
    }

    pub fn secrets(&self) -> &SecretStore {
        &self.secrets
    }

    pub fn remove_credential(&mut self, key: SecretKey) -> anyhow::Result<()> {
        self.secrets.remove(key)?;
        if key == SecretKey::SoundCloudClientIdOverride
            || key == SecretKey::SoundCloudClientId
            || key == SecretKey::SoundCloudOAuthToken
        {
            let _ = self.secrets.remove(SecretKey::SoundCloudClientIdOverride);
            let _ = self.secrets.remove(SecretKey::SoundCloudClientId);
            let _ = self.secrets.remove(SecretKey::SoundCloudOAuthToken);
        }
        match key {
            SecretKey::SoundCloudClientIdOverride
            | SecretKey::SoundCloudClientId
            | SecretKey::SoundCloudOAuthToken => {
                self.config.soundcloud_enabled = false;
            }
            SecretKey::YandexToken => self.config.yandex_enabled = false,
            SecretKey::DeezerArl => self.config.deezer_enabled = false,
            SecretKey::SpotifySpDc => self.config.spotify_enabled = false,
            SecretKey::YouTubeCookie | SecretKey::YouTubeOAuthRefresh => {}
            _ => {}
        }
        self.reload_providers();
        Ok(())
    }

    pub fn save_credential(&mut self, kind: CredentialKind, value: &str) -> Result<(), String> {
        let value = value.trim();
        if value.is_empty() {
            return Err("ключ пустой".to_string());
        }
        self.secrets
            .set(kind.secret_key(), value)
            .map_err(|error| error.to_string())?;
        match kind {
            CredentialKind::SoundCloudClientId | CredentialKind::SoundCloudOAuthToken => {
                self.config.soundcloud_enabled = true;
                self.config.soundcloud_client_id_override = None;
            }
            CredentialKind::YandexToken => self.config.yandex_enabled = true,
            CredentialKind::DeezerArl => self.config.deezer_enabled = true,
            CredentialKind::SpotifySpDc => self.config.spotify_enabled = true,
            CredentialKind::SpotifyOAuthRefreshToken => {
                self.config.spotify_enabled = true;
            }
            CredentialKind::YouTubeCookie | CredentialKind::YouTubeOAuthRefresh => {
                self.config.youtube_music_enabled = true;
            }
        }
        self.reload_providers();
        Ok(())
    }

    /// Включает/выключает провайдера по флагу конфига и сразу пересобирает реестр,
    /// чтобы переключение в Настройках действовало без перезапуска приложения.
    pub fn set_provider_enabled(&mut self, kind: ProviderKind, enabled: bool) {
        match kind {
            ProviderKind::SoundCloud => self.config.soundcloud_enabled = enabled,
            ProviderKind::YandexMusic => self.config.yandex_enabled = enabled,
            ProviderKind::Deezer => self.config.deezer_enabled = enabled,
            ProviderKind::Spotify => self.config.spotify_enabled = enabled,
            ProviderKind::YouTubeMusic => self.config.youtube_music_enabled = enabled,
        }
        self.reload_providers();
    }

    pub fn save_named_secret(&self, name: &str, value: &str) -> Result<(), anyhow::Error> {
        self.secrets.set_named(name, value).map(|_| ())
    }

    pub fn get_named_secret(&self, name: &str) -> anyhow::Result<Option<String>> {
        self.secrets.get_named(name)
    }

    pub fn remove_named_secret(&self, name: &str) -> Result<(), anyhow::Error> {
        self.secrets.remove_named(name).map(|_| ())
    }
}
