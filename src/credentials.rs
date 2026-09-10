use anyhow::Result;

use crate::secrets::{SecretKey, SecretStore};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum CredentialKind {
    SoundCloudClientId,
    YandexToken,
    DeezerArl,
    SpotifySpDc,
    SpotifyOAuthRefreshToken,
    YouTubeCookie,
    YouTubeOAuthRefresh,
}

impl CredentialKind {
    pub const ALL: [Self; 7] = [
        Self::SoundCloudClientId,
        Self::YandexToken,
        Self::DeezerArl,
        Self::SpotifySpDc,
        Self::SpotifyOAuthRefreshToken,
        Self::YouTubeCookie,
        Self::YouTubeOAuthRefresh,
    ];

    pub const fn label(self) -> &'static str {
        match self {
            Self::SoundCloudClientId => "SoundCloud client_id",
            Self::YandexToken => "Yandex OAuth токен",
            Self::DeezerArl => "Deezer ARL cookie",
            Self::SpotifySpDc => "Spotify sp_dc",
            Self::SpotifyOAuthRefreshToken => "Spotify OAuth refresh_token",
            Self::YouTubeCookie => "YouTube cookie",
            Self::YouTubeOAuthRefresh => "YouTube OAuth refresh_token",
        }
    }

    pub const fn secret_key(self) -> SecretKey {
        match self {
            Self::SoundCloudClientId => SecretKey::SoundCloudClientIdOverride,
            Self::YandexToken => SecretKey::YandexToken,
            Self::DeezerArl => SecretKey::DeezerArl,
            Self::SpotifySpDc => SecretKey::SpotifySpDc,
            Self::SpotifyOAuthRefreshToken => SecretKey::SpotifyOAuthRefreshToken,
            Self::YouTubeCookie => SecretKey::YouTubeCookie,
            Self::YouTubeOAuthRefresh => SecretKey::YouTubeOAuthRefresh,
        }
    }

    pub const fn hint(self) -> &'static str {
        match self {
            Self::SoundCloudClientId => {
                "После входа ключ приходит сам, здесь можно вставить собственный client_id"
            }
            Self::YandexToken => {
                "Вставь OAuth из расширения yandex-music-token, токен останется только локально"
            }
            Self::DeezerArl => {
                "Вставь значение cookie arl или строку arl=...; cookie останется только локально"
            }
            Self::SpotifySpDc => {
                "Вставь значение cookie sp_dc из браузера; токен останется только локально"
            }
            Self::SpotifyOAuthRefreshToken => {
                "Получается автоматически при входе через браузер"
            }
            Self::YouTubeCookie => {
                "Вставь cookie из браузера (SID, SSID, HSID, LOGIN_INFO и др.); даёт полные треки"
            }
            Self::YouTubeOAuthRefresh => {
                "Получается автоматически при входе через браузер"
            }
        }
    }
}

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub struct CredentialState {
    pub soundcloud: bool,
    pub yandex: bool,
    pub deezer: bool,
    pub spotify: bool,
    pub youtube: bool,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct CredentialEditor {
    pub kind: CredentialKind,
    pub value: String,
    pub saving: bool,
}

impl CredentialEditor {
    pub fn new(kind: CredentialKind) -> Self {
        Self {
            kind,
            value: String::new(),
            saving: false,
        }
    }

    pub fn input(&mut self, value: char) {
        if !self.saving && !value.is_control() && self.value.chars().count() < 512 {
            self.value.push(value);
        }
    }

    pub fn backspace(&mut self) {
        if !self.saving {
            self.value.pop();
        }
    }
}

impl CredentialState {
    pub fn load(secrets: &SecretStore) -> Result<Self> {
        Ok(Self {
            soundcloud: has_value(secrets, SecretKey::SoundCloudClientIdOverride)?
                || has_value(secrets, SecretKey::SoundCloudClientId)?,
            yandex: has_value(secrets, SecretKey::YandexToken)?,
            deezer: has_value(secrets, SecretKey::DeezerArl)?,
            spotify: has_value(secrets, SecretKey::SpotifySpDc)?
                || has_value(secrets, SecretKey::SpotifyOAuthRefreshToken)?,
            youtube: has_value(secrets, SecretKey::YouTubeCookie)?
                || has_value(secrets, SecretKey::YouTubeOAuthRefresh)?,
        })
    }

    pub const fn is_configured(self, kind: CredentialKind) -> bool {
        match kind {
            CredentialKind::SoundCloudClientId => self.soundcloud,
            CredentialKind::YandexToken => self.yandex,
            CredentialKind::DeezerArl => self.deezer,
            CredentialKind::SpotifySpDc | CredentialKind::SpotifyOAuthRefreshToken => self.spotify,
            CredentialKind::YouTubeCookie | CredentialKind::YouTubeOAuthRefresh => self.youtube,
        }
    }

    pub fn set_configured(&mut self, kind: CredentialKind, configured: bool) {
        match kind {
            CredentialKind::SoundCloudClientId => self.soundcloud = configured,
            CredentialKind::YandexToken => self.yandex = configured,
            CredentialKind::DeezerArl => self.deezer = configured,
            CredentialKind::SpotifySpDc | CredentialKind::SpotifyOAuthRefreshToken => {
                self.spotify = configured
            }
            CredentialKind::YouTubeCookie | CredentialKind::YouTubeOAuthRefresh => {
                self.youtube = configured
            }
        }
    }
}

fn has_value(secrets: &SecretStore, key: SecretKey) -> Result<bool> {
    Ok(secrets
        .get(key)?
        .is_some_and(|value| !value.trim().is_empty()))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn state_only_marks_non_empty_secrets_as_ready() {
        let temp = tempfile::tempdir().unwrap();
        let secrets = SecretStore::file_only(temp.path().join("secrets.json"));
        secrets
            .set(SecretKey::SoundCloudClientIdOverride, "client-id")
            .unwrap();

        let state = CredentialState::load(&secrets).unwrap();

        assert!(state.soundcloud);
        assert!(!state.yandex);
    }

    #[test]
    fn editor_hides_from_control_characters_and_runaway_paste() {
        let mut editor = CredentialEditor::new(CredentialKind::YandexToken);
        editor.input('\n');
        for _ in 0..600 {
            editor.input('x');
        }

        assert_eq!(editor.value.len(), 512);
        editor.backspace();
        assert_eq!(editor.value.len(), 511);
    }
}
