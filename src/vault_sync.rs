//! Модуль клиентской синхронизации учетных данных провайдеров с серверным Vault (Этап 6.5.1.D).
//!
//! Обеспечивает:
//! - Строгое разделение Guest, Offline Profile и Vessel Account.
//! - Изоляцию локальных секретов в пространствах имён `vessel:account:{user_id}:*`.
//! - Защиту от гонок и отмену устаревших ответов после logout через `ACCOUNT_GENERATION`.
//! - Сохранение обратной совместимости с `SpotifyOAuthRefreshToken` (строго локально).
//! - Защиту от потери данных при конфликтах версий и пустых ответах сервера.

use std::sync::atomic::{AtomicU64, Ordering};

use crate::{
    credentials::CredentialKind,
    protocol::{
        DeleteUserCredentialResponse, SaveUserCredentialRequest, SaveUserCredentialResponse,
        UserProviderCredentialItem,
    },
    provider::remote::{ServerClient, VaultTransportError},
    secrets::{SecretKey, SecretStore},
    user::AccountState,
};

/// Глобальный счётчик поколений сессии для защиты от гонок и поздних ответов сети.
static ACCOUNT_GENERATION: AtomicU64 = AtomicU64::new(1);

/// Инкрементирует счётчик поколений и возвращает новый идентификатор.
pub fn next_account_generation() -> u64 {
    ACCOUNT_GENERATION.fetch_add(1, Ordering::SeqCst) + 1
}

/// Возвращает текущий идентификатор поколения.
pub fn current_account_generation() -> u64 {
    ACCOUNT_GENERATION.load(Ordering::SeqCst)
}

/// Формирует ключ пространства имён конкретного аккаунта: `vessel:account:{user_id}:{key_name}`.
pub fn account_secret_key(user_id: &str, key_name: &str) -> String {
    format!("vessel:account:{user_id}:{key_name}")
}

/// Формирует ключ кэша версии для конкретного аккаунта: `vessel:account:{user_id}:version:{provider_kind}`.
pub fn account_version_key(user_id: &str, provider_kind: &str) -> String {
    format!("vessel:account:{user_id}:version:{provider_kind}")
}

/// Сопоставляет `CredentialKind` с `provider_kind` серверного Vault.
///
/// Возвращает `None` для чисто локальных секретов, не подлежащих отправке на сервер
/// (например, `SpotifyOAuthRefreshToken`).
pub fn provider_for_credential(kind: CredentialKind) -> Option<&'static str> {
    match kind {
        CredentialKind::SpotifySpDc => Some("spotify"),
        CredentialKind::YandexToken => Some("yandex_music"),
        CredentialKind::DeezerArl => Some("deezer"),
        CredentialKind::SoundCloudOAuthToken | CredentialKind::SoundCloudClientId => {
            Some("soundcloud")
        }
        // YouTube Music работает полностью анонимно без аккаунта (Kopuz/potoken).
        // Локальные cookies остаются только на устройстве и не синхронизируются в Vault.
        CredentialKind::YouTubeCookie | CredentialKind::YouTubeOAuthRefresh => None,
        // SpotifyOAuthRefreshToken — чисто локальный секрет согласно разделу 8 спецификации.
        CredentialKind::SpotifyOAuthRefreshToken => None,
    }
}

/// Формирует JSON payload для сохранения на сервере в зависимости от типа секрета.
pub fn credential_payload_for_save(
    kind: CredentialKind,
    value: &str,
    secrets: &SecretStore,
    user_id: Option<&str>,
) -> serde_json::Value {
    match kind {
        CredentialKind::SpotifySpDc => serde_json::json!({ "sp_dc": value }),
        CredentialKind::YandexToken => serde_json::json!({ "token": value }),
        CredentialKind::DeezerArl => serde_json::json!({ "arl": value }),
        CredentialKind::SoundCloudOAuthToken => {
            let client_id = user_id
                .and_then(|uid| {
                    secrets
                        .get_named(&account_secret_key(
                            uid,
                            SecretKey::SoundCloudClientIdOverride.name(),
                        ))
                        .ok()
                        .flatten()
                })
                .or_else(|| {
                    secrets
                        .get(SecretKey::SoundCloudClientIdOverride)
                        .ok()
                        .flatten()
                });
            let mut map = serde_json::Map::new();
            map.insert(
                "oauth_token".to_string(),
                serde_json::Value::String(value.to_string()),
            );
            if let Some(cid) = client_id {
                map.insert("client_id".to_string(), serde_json::Value::String(cid));
            }
            serde_json::Value::Object(map)
        }
        CredentialKind::SoundCloudClientId => {
            let oauth_token = user_id
                .and_then(|uid| {
                    secrets
                        .get_named(&account_secret_key(
                            uid,
                            SecretKey::SoundCloudOAuthToken.name(),
                        ))
                        .ok()
                        .flatten()
                })
                .or_else(|| {
                    secrets
                        .get(SecretKey::SoundCloudOAuthToken)
                        .ok()
                        .flatten()
                });
            let mut map = serde_json::Map::new();
            map.insert(
                "client_id".to_string(),
                serde_json::Value::String(value.to_string()),
            );
            if let Some(tok) = oauth_token {
                map.insert("oauth_token".to_string(), serde_json::Value::String(tok));
            }
            serde_json::Value::Object(map)
        }
        CredentialKind::YouTubeCookie => {
            let oauth_refresh = user_id
                .and_then(|uid| {
                    secrets
                        .get_named(&account_secret_key(
                            uid,
                            SecretKey::YouTubeOAuthRefresh.name(),
                        ))
                        .ok()
                        .flatten()
                })
                .or_else(|| {
                    secrets
                        .get(SecretKey::YouTubeOAuthRefresh)
                        .ok()
                        .flatten()
                });
            let mut map = serde_json::Map::new();
            map.insert(
                "cookie".to_string(),
                serde_json::Value::String(value.to_string()),
            );
            if let Some(r) = oauth_refresh {
                map.insert("oauth_refresh".to_string(), serde_json::Value::String(r));
            }
            serde_json::Value::Object(map)
        }
        CredentialKind::YouTubeOAuthRefresh => {
            let cookie = user_id
                .and_then(|uid| {
                    secrets
                        .get_named(&account_secret_key(uid, SecretKey::YouTubeCookie.name()))
                        .ok()
                        .flatten()
                })
                .or_else(|| secrets.get(SecretKey::YouTubeCookie).ok().flatten());
            let mut map = serde_json::Map::new();
            map.insert(
                "oauth_refresh".to_string(),
                serde_json::Value::String(value.to_string()),
            );
            if let Some(c) = cookie {
                map.insert("cookie".to_string(), serde_json::Value::String(c));
            }
            serde_json::Value::Object(map)
        }
        CredentialKind::SpotifyOAuthRefreshToken => serde_json::Value::Null,
    }
}

/// Проверяет, существует ли в локальном пространстве имён аккаунта сохранённый секрет для провайдера.
pub fn has_local_credential(user_id: &str, provider_kind: &str, secrets: &SecretStore) -> bool {
    match provider_kind {
        "spotify" => secrets
            .get_named(&account_secret_key(user_id, SecretKey::SpotifySpDc.name()))
            .ok()
            .flatten()
            .is_some(),
        "yandex_music" => secrets
            .get_named(&account_secret_key(user_id, SecretKey::YandexToken.name()))
            .ok()
            .flatten()
            .is_some(),
        "deezer" => secrets
            .get_named(&account_secret_key(user_id, SecretKey::DeezerArl.name()))
            .ok()
            .flatten()
            .is_some(),
        "soundcloud" => secrets
            .get_named(&account_secret_key(
                user_id,
                SecretKey::SoundCloudOAuthToken.name(),
            ))
            .ok()
            .flatten()
            .is_some(),
        "youtube_music" => secrets
            .get_named(&account_secret_key(
                user_id,
                SecretKey::YouTubeCookie.name(),
            ))
            .ok()
            .flatten()
            .is_some(),
        _ => false,
    }
}

/// Проверяет, совпадает ли локальное значение секрета с серверным payload.
pub fn local_credential_matches_server(
    user_id: &str,
    item: &UserProviderCredentialItem,
    secrets: &SecretStore,
) -> bool {
    match item.provider_kind.as_str() {
        "spotify" => {
            let ns_key = account_secret_key(user_id, SecretKey::SpotifySpDc.name());
            let local = secrets.get_named(&ns_key).ok().flatten();
            let server = item
                .payload
                .get("sp_dc")
                .and_then(|v| v.as_str())
                .or_else(|| item.payload.as_str());
            local.as_deref() == server
        }
        "yandex_music" => {
            let ns_key = account_secret_key(user_id, SecretKey::YandexToken.name());
            let local = secrets.get_named(&ns_key).ok().flatten();
            let server = item
                .payload
                .get("token")
                .and_then(|v| v.as_str())
                .or_else(|| item.payload.as_str());
            local.as_deref() == server
        }
        "deezer" => {
            let ns_key = account_secret_key(user_id, SecretKey::DeezerArl.name());
            let local = secrets.get_named(&ns_key).ok().flatten();
            let server = item
                .payload
                .get("arl")
                .and_then(|v| v.as_str())
                .or_else(|| item.payload.as_str());
            local.as_deref() == server
        }
        "soundcloud" => {
            let ns_tok = account_secret_key(user_id, SecretKey::SoundCloudOAuthToken.name());
            let local_tok = secrets.get_named(&ns_tok).ok().flatten();
            let server_tok = item.payload.get("oauth_token").and_then(|v| v.as_str());
            local_tok.as_deref() == server_tok
        }
        "youtube_music" => {
            let ns_cookie = account_secret_key(user_id, SecretKey::YouTubeCookie.name());
            let local_cookie = secrets.get_named(&ns_cookie).ok().flatten();
            let server_cookie = item.payload.get("cookie").and_then(|v| v.as_str());
            local_cookie.as_deref() == server_cookie
        }
        _ => true,
    }
}

/// Применяет серверную запись credentials к локальному хранилищу пользователя.
///
/// Политика разрешения конфликтов:
/// 1. Если `local_version > server_version`: локальная версия новее, серверная запись отбрасывается.
/// 2. Если `local_version == server_version`, но содержимое отличается: фиксируется конфликт, локальные данные не затираются молча.
/// 3. Если локальная версия отсутствует, но есть локальный ключ другого содержимого: фиксируется конфликт.
/// 4. При отсутствии конфликта (`server_version > local_version` или чистая инициализация) серверные данные применяются.
pub fn apply_server_credential_to_local(
    user_id: &str,
    item: &UserProviderCredentialItem,
    secrets: &SecretStore,
) {
    let ver_key = account_version_key(user_id, &item.provider_kind);
    let cached_version: Option<i64> = secrets
        .get_named(&ver_key)
        .ok()
        .flatten()
        .and_then(|s| s.parse().ok());

    if let Some(local_ver) = cached_version {
        if local_ver > item.version {
            crate::dlog!(
                "[vault_sync] local version ({}) > server version ({}) for {}, skipping overwrite",
                local_ver,
                item.version,
                item.provider_kind
            );
            return;
        }
        if local_ver == item.version && !local_credential_matches_server(user_id, item, secrets) {
            let conflict_key = format!("vessel:account:{user_id}:conflict:{}", item.provider_kind);
            let _ = secrets.set_named(&conflict_key, "divergent_content_same_version");
            crate::dlog!(
                "[vault_sync] version match ({}) but divergent content for {}, preserving local",
                local_ver,
                item.provider_kind
            );
            return;
        }
    } else if has_local_credential(user_id, &item.provider_kind, secrets)
        && !local_credential_matches_server(user_id, item, secrets)
    {
        let conflict_key = format!("vessel:account:{user_id}:conflict:{}", item.provider_kind);
        let _ = secrets.set_named(&conflict_key, "unversioned_local_conflict");
        crate::dlog!(
            "[vault_sync] unversioned local credential differs from server for {}, preserving local",
            item.provider_kind
        );
        return;
    }

    let _ = secrets.set_named(&ver_key, &item.version.to_string());

    match item.provider_kind.as_str() {
        "spotify" => {
            let sp_dc = item
                .payload
                .get("sp_dc")
                .and_then(|v| v.as_str())
                .or_else(|| item.payload.as_str());
            if let Some(cookie) = sp_dc {
                let ns_key = account_secret_key(user_id, SecretKey::SpotifySpDc.name());
                let _ = secrets.set_named(&ns_key, cookie);
                let _ = secrets.set(SecretKey::SpotifySpDc, cookie);
            }
        }
        "yandex_music" => {
            let token = item
                .payload
                .get("token")
                .and_then(|v| v.as_str())
                .or_else(|| item.payload.as_str());
            if let Some(t) = token {
                let ns_key = account_secret_key(user_id, SecretKey::YandexToken.name());
                let _ = secrets.set_named(&ns_key, t);
                let _ = secrets.set(SecretKey::YandexToken, t);
            }
        }
        "deezer" => {
            let arl = item
                .payload
                .get("arl")
                .and_then(|v| v.as_str())
                .or_else(|| item.payload.as_str());
            if let Some(a) = arl {
                let ns_key = account_secret_key(user_id, SecretKey::DeezerArl.name());
                let _ = secrets.set_named(&ns_key, a);
                let _ = secrets.set(SecretKey::DeezerArl, a);
            }
        }
        "soundcloud" => {
            if let Some(tok) = item.payload.get("oauth_token").and_then(|v| v.as_str()) {
                let ns_key = account_secret_key(user_id, SecretKey::SoundCloudOAuthToken.name());
                let _ = secrets.set_named(&ns_key, tok);
                let _ = secrets.set(SecretKey::SoundCloudOAuthToken, tok);
            }
            if let Some(cid) = item.payload.get("client_id").and_then(|v| v.as_str()) {
                let ns_key =
                    account_secret_key(user_id, SecretKey::SoundCloudClientIdOverride.name());
                let _ = secrets.set_named(&ns_key, cid);
                let _ = secrets.set(SecretKey::SoundCloudClientIdOverride, cid);
            }
        }
        "youtube_music" => {
            if let Some(cookie) = item.payload.get("cookie").and_then(|v| v.as_str()) {
                let ns_key = account_secret_key(user_id, SecretKey::YouTubeCookie.name());
                let _ = secrets.set_named(&ns_key, cookie);
                let _ = secrets.set(SecretKey::YouTubeCookie, cookie);
            }
            if let Some(refresh) = item.payload.get("oauth_refresh").and_then(|v| v.as_str()) {
                let ns_key = account_secret_key(user_id, SecretKey::YouTubeOAuthRefresh.name());
                let _ = secrets.set_named(&ns_key, refresh);
                let _ = secrets.set(SecretKey::YouTubeOAuthRefresh, refresh);
            }
        }
        _ => {}
    }
}

/// Очищает локальные секреты конкретного аккаунта при выходе (logout).
///
/// Удаляет:
/// - Записи в пространстве `vessel:account:{user_id}:*`
/// - Активные секреты рантайма, предотвращая их утечку к следующему пользователю или гостю.
///
/// НЕ удаляет:
/// - Серверные credentials (они сохраняются в облачном Vault).
/// - Секреты других пользователей или гостя.
/// - `SpotifyOAuthRefreshToken` (сохраняет обратную совместимость).
pub fn clear_account_local_secrets(user_id: &str, secrets: &SecretStore) {
    let account_keys = [
        SecretKey::SpotifySpDc.name(),
        "version:spotify",
        SecretKey::YandexToken.name(),
        "version:yandex_music",
        SecretKey::DeezerArl.name(),
        "version:deezer",
        SecretKey::SoundCloudOAuthToken.name(),
        SecretKey::SoundCloudClientIdOverride.name(),
        "version:soundcloud",
        SecretKey::YouTubeCookie.name(),
        SecretKey::YouTubeOAuthRefresh.name(),
        "version:youtube_music",
    ];

    for sub in account_keys {
        let key = account_secret_key(user_id, sub);
        let _ = secrets.remove_named(&key);
    }

    // Очищаем активные секреты рантайма аккаунта (Spotify, Yandex, Deezer, SoundCloud).
    // YouTube Music работает анонимно/локально и не очищается на logout.
    let _ = secrets.remove(SecretKey::SpotifySpDc);
    let _ = secrets.remove(SecretKey::YandexToken);
    let _ = secrets.remove(SecretKey::DeezerArl);
    let _ = secrets.remove(SecretKey::SoundCloudOAuthToken);
    let _ = secrets.remove(SecretKey::SoundCloudClientIdOverride);
}

/// Синхронизирует credentials при успешном входе в Vessel Account.
pub async fn sync_credentials_on_login(
    client: &ServerClient,
    session_token: &str,
    user_id: &str,
    expected_generation: u64,
    secrets: &SecretStore,
) -> Result<(), VaultTransportError> {
    let resp = client.user_credentials(session_token).await?;

    // Защита от гонок: если произошёл logout во время выполнения сетевого запроса,
    // отбрасываем ответ и не создаём локальных секретов!
    if current_account_generation() != expected_generation {
        return Ok(());
    }

    // Если сервер вернул пустой список — НЕ очищаем существующие локальные секреты
    for item in &resp.credentials {
        apply_server_credential_to_local(user_id, item, secrets);
    }

    Ok(())
}

/// Сохраняет credentials с синхронизацией в серверный Vault.
///
/// Для Guest и Offline Profile сохраняет строго локально без сетевых запросов.
/// Для Vessel Account сохраняет локально и отправляет в облачный Vault.
pub async fn sync_save_credential(
    client: Option<&ServerClient>,
    session_token: Option<&str>,
    account_state: &AccountState,
    kind: CredentialKind,
    value: &str,
    secrets: &SecretStore,
) -> Result<Option<SaveUserCredentialResponse>, VaultTransportError> {
    // 1. Для Guest и Offline Profile — строго локальное сохранение
    let user_id = match account_state {
        AccountState::Authenticated { user_id, .. } => user_id,
        _ => {
            let _ = secrets.set(kind.secret_key(), value);
            return Ok(None);
        }
    };

    // 2. Сохраняем в активный runtime
    let _ = secrets.set(kind.secret_key(), value);

    // 3. Сохраняем в пространство имён аккаунта
    let ns_key = account_secret_key(user_id, kind.secret_key().name());
    let _ = secrets.set_named(&ns_key, value);

    // 4. Проверяем, поддерживается ли провайдер серверным хранилищем
    let Some(provider_kind) = provider_for_credential(kind) else {
        return Ok(None);
    };

    let Some(client) = client else {
        return Ok(None);
    };
    let Some(session_token) = session_token else {
        return Ok(None);
    };

    let payload = credential_payload_for_save(kind, value, secrets, Some(user_id));

    // Читаем текущую версию для оптимистического контроля
    let ver_key = account_version_key(user_id, provider_kind);
    let cached_version: Option<i64> = secrets
        .get_named(&ver_key)
        .ok()
        .flatten()
        .and_then(|s| s.parse().ok());

    let req = SaveUserCredentialRequest {
        provider_kind: provider_kind.to_string(),
        payload,
        expected_version: cached_version,
    };

    let res = client.user_credentials_save(session_token, &req).await?;

    // Обновляем версию в кэше
    let _ = secrets.set_named(&ver_key, &res.version.to_string());

    Ok(Some(res))
}

/// Удаляет credentials с синхронизацией в серверный Vault.
pub async fn sync_delete_credential(
    client: Option<&ServerClient>,
    session_token: Option<&str>,
    account_state: &AccountState,
    kind: CredentialKind,
    secrets: &SecretStore,
) -> Result<Option<DeleteUserCredentialResponse>, VaultTransportError> {
    let user_id = match account_state {
        AccountState::Authenticated { user_id, .. } => user_id,
        _ => {
            // Для Guest и Offline Profile — удаление только локально
            let _ = secrets.remove(kind.secret_key());
            return Ok(None);
        }
    };

    // Удаляем из активного runtime
    let _ = secrets.remove(kind.secret_key());

    // Удаляем из пространства имён аккаунта
    let ns_key = account_secret_key(user_id, kind.secret_key().name());
    let _ = secrets.remove_named(&ns_key);

    if kind == CredentialKind::SoundCloudOAuthToken || kind == CredentialKind::SoundCloudClientId {
        let ns_tok = account_secret_key(user_id, SecretKey::SoundCloudOAuthToken.name());
        let ns_cid = account_secret_key(user_id, SecretKey::SoundCloudClientIdOverride.name());
        let _ = secrets.remove_named(&ns_tok);
        let _ = secrets.remove_named(&ns_cid);
    }
    if kind == CredentialKind::YouTubeCookie || kind == CredentialKind::YouTubeOAuthRefresh {
        let ns_cookie = account_secret_key(user_id, SecretKey::YouTubeCookie.name());
        let ns_refresh = account_secret_key(user_id, SecretKey::YouTubeOAuthRefresh.name());
        let _ = secrets.remove_named(&ns_cookie);
        let _ = secrets.remove_named(&ns_refresh);
    }

    let Some(provider_kind) = provider_for_credential(kind) else {
        return Ok(None);
    };

    let ver_key = account_version_key(user_id, provider_kind);
    let _ = secrets.remove_named(&ver_key);

    let Some(client) = client else {
        return Ok(None);
    };
    let Some(session_token) = session_token else {
        return Ok(None);
    };

    let res = client.user_credentials_delete(session_token, provider_kind).await?;
    Ok(Some(res))
}

#[cfg(test)]
mod tests {
    use super::*;

    async fn start_mock_server(status_code: u16, body: &str) -> (String, tokio::task::JoinHandle<()>) {
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let url = format!("http://{}", addr);
        let body_string = body.to_string();
        let handle = tokio::spawn(async move {
            while let Ok((mut stream, _)) = listener.accept().await {
                use tokio::io::{AsyncReadExt, AsyncWriteExt};
                let mut buf = [0u8; 1024];
                let n = stream.read(&mut buf).await.unwrap_or(0);
                if n == 0 {
                    break;
                }
                let reason = match status_code {
                    200 => "OK",
                    401 => "Unauthorized",
                    409 => "Conflict",
                    503 => "Service Unavailable",
                    _ => "Unknown",
                };
                let response = format!(
                    "HTTP/1.1 {} {}\r\nContent-Type: application/json\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                    status_code,
                    reason,
                    body_string.len(),
                    body_string
                );
                let _ = stream.write_all(response.as_bytes()).await;
                let _ = stream.flush().await;
            }
        });
        (url, handle)
    }

    #[tokio::test]
    async fn test_scenario_1_guest_saves_locally_without_network() {
        let temp = tempfile::tempdir().unwrap();
        let secrets = SecretStore::file_only(temp.path().join("secrets.json"));

        let res = sync_save_credential(
            None,
            None,
            &AccountState::Guest,
            CredentialKind::SpotifySpDc,
            "guest_sp_dc_cookie",
            &secrets,
        )
        .await
        .unwrap();

        assert_eq!(res, None, "Для Guest сетевой ответ должен быть None");
        assert_eq!(
            secrets.get(SecretKey::SpotifySpDc).unwrap().as_deref(),
            Some("guest_sp_dc_cookie"),
            "Секрет должен быть сохранен в активный runtime"
        );
    }

    #[tokio::test]
    async fn test_scenario_2_offline_profile_saves_locally_without_network() {
        let temp = tempfile::tempdir().unwrap();
        let secrets = SecretStore::file_only(temp.path().join("secrets.json"));

        let res = sync_save_credential(
            None,
            None,
            &AccountState::Restoring,
            CredentialKind::YandexToken,
            "offline_ya_token",
            &secrets,
        )
        .await
        .unwrap();

        assert_eq!(res, None);
        assert_eq!(
            secrets.get(SecretKey::YandexToken).unwrap().as_deref(),
            Some("offline_ya_token")
        );
    }

    #[tokio::test]
    async fn test_scenario_3_vessel_account_syncs_own_user_id() {
        let temp = tempfile::tempdir().unwrap();
        let secrets = SecretStore::file_only(temp.path().join("secrets.json"));

        let mock_body = r#"{"provider_kind":"spotify","version":1,"updated_at_ms":1700000000}"#;
        let (url, server_handle) = start_mock_server(200, mock_body).await;
        let client = ServerClient::new(&url, "dummy_token").unwrap();

        let account = AccountState::Authenticated {
            username: "alice".to_string(),
            user_id: "usr_alice".to_string(),
        };

        let res = sync_save_credential(
            Some(&client),
            Some("alice_session"),
            &account,
            CredentialKind::SpotifySpDc,
            "alice_cookie",
            &secrets,
        )
        .await
        .unwrap();

        assert!(res.is_some());
        let res = res.unwrap();
        assert_eq!(res.version, 1);

        // Проверяем наличие в активном runtime
        assert_eq!(
            secrets.get(SecretKey::SpotifySpDc).unwrap().as_deref(),
            Some("alice_cookie")
        );
        // Проверяем изолированный namespaced ключ
        let ns_key = account_secret_key("usr_alice", SecretKey::SpotifySpDc.name());
        assert_eq!(
            secrets.get_named(&ns_key).unwrap().as_deref(),
            Some("alice_cookie")
        );
        // Проверяем сохраненную версию
        let ver_key = account_version_key("usr_alice", "spotify");
        assert_eq!(
            secrets.get_named(&ver_key).unwrap().as_deref(),
            Some("1")
        );

        server_handle.abort();
    }

    #[test]
    fn test_scenario_4_two_accounts_namespace_isolation() {
        let temp = tempfile::tempdir().unwrap();
        let secrets = SecretStore::file_only(temp.path().join("secrets.json"));

        let user_a = "user_alice_123";
        let user_b = "user_bob_456";

        let key_a = account_secret_key(user_a, SecretKey::SpotifySpDc.name());
        secrets.set_named(&key_a, "alice_sp_dc_cookie").unwrap();

        let key_b = account_secret_key(user_b, SecretKey::SpotifySpDc.name());
        secrets.set_named(&key_b, "bob_sp_dc_cookie").unwrap();

        assert_eq!(
            secrets.get_named(&key_a).unwrap().as_deref(),
            Some("alice_sp_dc_cookie")
        );
        assert_eq!(
            secrets.get_named(&key_b).unwrap().as_deref(),
            Some("bob_sp_dc_cookie")
        );

        clear_account_local_secrets(user_a, &secrets);

        assert_eq!(secrets.get_named(&key_a).unwrap(), None);
        assert_eq!(
            secrets.get_named(&key_b).unwrap().as_deref(),
            Some("bob_sp_dc_cookie")
        );
    }

    #[tokio::test]
    async fn test_scenario_5_empty_server_list_does_not_erase_local() {
        let temp = tempfile::tempdir().unwrap();
        let secrets = SecretStore::file_only(temp.path().join("secrets.json"));

        // Локально у пользователя уже есть Deezer ARL
        secrets.set(SecretKey::DeezerArl, "local_deezer_arl").unwrap();

        let mock_body = r#"{"credentials":[]}"#;
        let (url, server_handle) = start_mock_server(200, mock_body).await;
        let client = ServerClient::new(&url, "dummy_token").unwrap();

        let curr_gen = current_account_generation();
        let res = sync_credentials_on_login(
            &client,
            "session_token",
            "usr_alice",
            curr_gen,
            &secrets,
        )
        .await;

        assert!(res.is_ok());
        // Локальный секрет не должен быть удален!
        assert_eq!(
            secrets.get(SecretKey::DeezerArl).unwrap().as_deref(),
            Some("local_deezer_arl")
        );

        server_handle.abort();
    }

    #[tokio::test]
    async fn test_scenario_6_and_8_version_conflict_409_handled_safely() {
        let temp = tempfile::tempdir().unwrap();
        let secrets = SecretStore::file_only(temp.path().join("secrets.json"));

        // Устанавливаем локальный секрет
        secrets.set(SecretKey::YandexToken, "local_yandex_token").unwrap();

        let mock_body = r#"{"error":"conflict"}"#;
        let (url, server_handle) = start_mock_server(409, mock_body).await;
        let client = ServerClient::new(&url, "dummy_token").unwrap();

        let account = AccountState::Authenticated {
            username: "alice".to_string(),
            user_id: "usr_alice".to_string(),
        };

        let res = sync_save_credential(
            Some(&client),
            Some("session_token"),
            &account,
            CredentialKind::YandexToken,
            "new_yandex_token",
            &secrets,
        )
        .await;

        // Должен вернуть ошибку Conflict, не паниковать и не зацикливаться
        assert!(matches!(res, Err(VaultTransportError::Conflict)));
        // Локальные данные сохранены и не утеряны
        assert_eq!(
            secrets.get(SecretKey::YandexToken).unwrap().as_deref(),
            Some("new_yandex_token")
        );

        server_handle.abort();
    }

    #[tokio::test]
    async fn test_scenario_7_http_401_no_retry_loops() {
        let (url, server_handle) = start_mock_server(401, r#"{"error":"unauthorized"}"#).await;
        let client = ServerClient::new(&url, "bad_token").unwrap();

        let temp = tempfile::tempdir().unwrap();
        let secrets = SecretStore::file_only(temp.path().join("secrets.json"));

        let res = sync_credentials_on_login(
            &client,
            "bad_token",
            "usr_123",
            current_account_generation(),
            &secrets,
        )
        .await;

        assert!(matches!(res, Err(VaultTransportError::Unauthorized)));
        server_handle.abort();
    }

    #[tokio::test]
    async fn test_scenario_9_http_503_no_auto_init_or_loops() {
        let (url, server_handle) = start_mock_server(503, r#"{"error":"service unavailable"}"#).await;
        let client = ServerClient::new(&url, "token").unwrap();

        let temp = tempfile::tempdir().unwrap();
        let secrets = SecretStore::file_only(temp.path().join("secrets.json"));

        let res = sync_credentials_on_login(
            &client,
            "token",
            "usr_123",
            current_account_generation(),
            &secrets,
        )
        .await;

        assert!(matches!(res, Err(VaultTransportError::ServiceUnavailable)));
        server_handle.abort();
    }

    #[test]
    fn test_scenario_10_logout_clears_only_current_account_space() {
        let temp = tempfile::tempdir().unwrap();
        let secrets = SecretStore::file_only(temp.path().join("secrets.json"));

        let user_alice = "usr_alice";
        let user_bob = "usr_bob";

        // Alice
        let alice_key = account_secret_key(user_alice, SecretKey::SpotifySpDc.name());
        secrets.set_named(&alice_key, "alice_cookie").unwrap();
        secrets.set(SecretKey::SpotifySpDc, "alice_cookie").unwrap();

        // Bob
        let bob_key = account_secret_key(user_bob, SecretKey::SpotifySpDc.name());
        secrets.set_named(&bob_key, "bob_cookie").unwrap();

        // Logout Alice
        clear_account_local_secrets(user_alice, &secrets);

        // Alice очищена
        assert_eq!(secrets.get_named(&alice_key).unwrap(), None);
        assert_eq!(secrets.get(SecretKey::SpotifySpDc).unwrap(), None);

        // Bob сохранён
        assert_eq!(
            secrets.get_named(&bob_key).unwrap().as_deref(),
            Some("bob_cookie")
        );
    }

    #[tokio::test]
    async fn test_scenario_11_belated_response_after_logout_dropped() {
        let temp = tempfile::tempdir().unwrap();
        let secrets = SecretStore::file_only(temp.path().join("secrets.json"));

        let mock_body = r#"{"credentials":[{"provider_kind":"spotify","version":1,"payload":{"sp_dc":"late_cookie"},"updated_at_ms":1000}]}"#;
        let (url, server_handle) = start_mock_server(200, mock_body).await;
        let client = ServerClient::new(&url, "dummy_token").unwrap();

        let login_generation = current_account_generation();

        // Имитируем logout во время сетевого запроса
        let _ = next_account_generation();

        // Приходит поздний ответ
        let res = sync_credentials_on_login(
            &client,
            "session",
            "usr_alice",
            login_generation,
            &secrets,
        )
        .await;

        assert!(res.is_ok());
        // Секрет НЕ должен был примениться!
        assert_eq!(secrets.get(SecretKey::SpotifySpDc).unwrap(), None);
        let ns_key = account_secret_key("usr_alice", SecretKey::SpotifySpDc.name());
        assert_eq!(secrets.get_named(&ns_key).unwrap(), None);

        server_handle.abort();
    }

    #[test]
    fn test_scenario_12_regular_logout_does_not_delete_server_credentials() {
        let temp = tempfile::tempdir().unwrap();
        let secrets = SecretStore::file_only(temp.path().join("secrets.json"));

        let user_id = "usr_alice";
        let ns_key = account_secret_key(user_id, SecretKey::DeezerArl.name());
        secrets.set_named(&ns_key, "deezer_arl_value").unwrap();

        clear_account_local_secrets(user_id, &secrets);

        // Локальный кэш очищен
        assert_eq!(secrets.get_named(&ns_key).unwrap(), None);
        // Никаких вызовов HTTP DELETE в clear_account_local_secrets не происходит — облачные credentials сохранены
    }

    #[tokio::test]
    async fn test_scenario_13_spotify_oauth_refresh_token_stays_strictly_local() {
        let temp = tempfile::tempdir().unwrap();
        let secrets = SecretStore::file_only(temp.path().join("secrets.json"));

        assert_eq!(
            provider_for_credential(CredentialKind::SpotifyOAuthRefreshToken),
            None
        );

        let account = AccountState::Authenticated {
            username: "alice".to_string(),
            user_id: "usr_alice".to_string(),
        };

        // Сохранение SpotifyOAuthRefreshToken
        let res = sync_save_credential(
            None,
            None,
            &account,
            CredentialKind::SpotifyOAuthRefreshToken,
            "local_refresh_token",
            &secrets,
        )
        .await
        .unwrap();

        assert_eq!(res, None, "Не должно быть сетевого вызова");
        assert_eq!(
            secrets.get(SecretKey::SpotifyOAuthRefreshToken).unwrap().as_deref(),
            Some("local_refresh_token")
        );
    }

    #[tokio::test]
    async fn test_scenario_14_existing_auth_workflows_preserved() {
        let temp = tempfile::tempdir().unwrap();
        let secrets = SecretStore::file_only(temp.path().join("secrets.json"));

        // SoundCloud: oauth_token + client_id
        let payload = credential_payload_for_save(
            CredentialKind::SoundCloudOAuthToken,
            "sc_oauth_token",
            &secrets,
            None,
        );
        assert_eq!(payload.get("oauth_token").unwrap(), "sc_oauth_token");

        // YouTube: cookie
        let payload_yt = credential_payload_for_save(
            CredentialKind::YouTubeCookie,
            "yt_cookie_val",
            &secrets,
            None,
        );
        assert_eq!(payload_yt.get("cookie").unwrap(), "yt_cookie_val");

        // Deezer
        let payload_dz = credential_payload_for_save(
            CredentialKind::DeezerArl,
            "dz_arl_val",
            &secrets,
            None,
        );
        assert_eq!(payload_dz.get("arl").unwrap(), "dz_arl_val");
    }

    #[test]
    fn test_conflict_policy_higher_local_version_not_overwritten() {
        let temp = tempfile::tempdir().unwrap();
        let secrets = SecretStore::file_only(temp.path().join("secrets.json"));

        let user_id = "usr_alice";
        let ns_key = account_secret_key(user_id, SecretKey::SpotifySpDc.name());
        let ver_key = account_version_key(user_id, "spotify");

        // У Alice локальная версия 2 с кукой local_sp_dc
        secrets.set_named(&ns_key, "local_sp_dc").unwrap();
        secrets.set_named(&ver_key, "2").unwrap();

        // Сервер вернул более старую версию 1
        let item = UserProviderCredentialItem {
            provider_kind: "spotify".to_string(),
            payload: serde_json::json!({ "sp_dc": "old_remote_sp_dc" }),
            version: 1,
            updated_at_ms: 1000,
        };

        apply_server_credential_to_local(user_id, &item, &secrets);

        // Локальные данные и версия не должны были быть перезаписаны
        assert_eq!(secrets.get_named(&ns_key).unwrap().as_deref(), Some("local_sp_dc"));
        assert_eq!(secrets.get_named(&ver_key).unwrap().as_deref(), Some("2"));
    }

    #[test]
    fn test_conflict_policy_same_version_different_content_flags_conflict() {
        let temp = tempfile::tempdir().unwrap();
        let secrets = SecretStore::file_only(temp.path().join("secrets.json"));

        let user_id = "usr_alice";
        let ns_key = account_secret_key(user_id, SecretKey::SpotifySpDc.name());
        let ver_key = account_version_key(user_id, "spotify");

        secrets.set_named(&ns_key, "local_divergent_cookie").unwrap();
        secrets.set_named(&ver_key, "1").unwrap();

        let item = UserProviderCredentialItem {
            provider_kind: "spotify".to_string(),
            payload: serde_json::json!({ "sp_dc": "remote_divergent_cookie" }),
            version: 1,
            updated_at_ms: 1000,
        };

        apply_server_credential_to_local(user_id, &item, &secrets);

        // Локальное значение не затерто
        assert_eq!(secrets.get_named(&ns_key).unwrap().as_deref(), Some("local_divergent_cookie"));
        // Конфликт зарегистрирован
        let conflict_key = format!("vessel:account:{user_id}:conflict:spotify");
        assert_eq!(
            secrets.get_named(&conflict_key).unwrap().as_deref(),
            Some("divergent_content_same_version")
        );
    }

    #[tokio::test]
    async fn test_composite_delete_cleans_all_provider_keys() {
        let temp = tempfile::tempdir().unwrap();
        let secrets = SecretStore::file_only(temp.path().join("secrets.json"));

        let user_id = "usr_alice";
        let ns_tok = account_secret_key(user_id, SecretKey::SoundCloudOAuthToken.name());
        let ns_cid = account_secret_key(user_id, SecretKey::SoundCloudClientIdOverride.name());
        secrets.set_named(&ns_tok, "sc_token").unwrap();
        secrets.set_named(&ns_cid, "sc_client").unwrap();

        let account = AccountState::Authenticated {
            username: "alice".to_string(),
            user_id: user_id.to_string(),
        };

        let _ = sync_delete_credential(
            None,
            None,
            &account,
            CredentialKind::SoundCloudOAuthToken,
            &secrets,
        )
        .await;

        assert_eq!(secrets.get_named(&ns_tok).unwrap(), None);
        assert_eq!(secrets.get_named(&ns_cid).unwrap(), None);
    }

    #[test]
    fn test_generation_counter_increments() {
        let g1 = current_account_generation();
        let g2 = next_account_generation();
        assert!(g2 > g1);
        assert_eq!(current_account_generation(), g2);
    }

    #[tokio::test]
    async fn test_youtube_cookie_stays_strictly_local_and_untouched_on_logout() {
        let temp = tempfile::tempdir().unwrap();
        let secrets = SecretStore::file_only(temp.path().join("secrets.json"));

        assert_eq!(provider_for_credential(CredentialKind::YouTubeCookie), None);
        assert_eq!(
            provider_for_credential(CredentialKind::YouTubeOAuthRefresh),
            None
        );

        let account = AccountState::Authenticated {
            username: "alice".to_string(),
            user_id: "usr_alice".to_string(),
        };

        // Сохранение YouTube cookie не делает сетевых вызовов
        let res = sync_save_credential(
            None,
            None,
            &account,
            CredentialKind::YouTubeCookie,
            "yt_local_cookie_value",
            &secrets,
        )
        .await
        .unwrap();

        assert_eq!(res, None, "YouTube cookie не отправляется в облачный Vault");
        assert_eq!(
            secrets.get(SecretKey::YouTubeCookie).unwrap().as_deref(),
            Some("yt_local_cookie_value")
        );

        // При logout аккаунта локальная кука YouTube не стирается с машины
        clear_account_local_secrets("usr_alice", &secrets);
        assert_eq!(
            secrets.get(SecretKey::YouTubeCookie).unwrap().as_deref(),
            Some("yt_local_cookie_value"),
            "Локальная кука YouTube должна сохраняться на устройстве после logout"
        );
    }

    #[tokio::test]
    async fn test_multi_device_clean_device_hydration_and_logout_isolation() {
        // Имитируем хранилище на чистом устройстве Device B
        let temp_device_b = tempfile::tempdir().unwrap();
        let secrets_b = SecretStore::file_only(temp_device_b.path().join("secrets.json"));

        // Изначально Device B — чистое устройство в режиме Guest
        assert_eq!(secrets_b.get(SecretKey::SpotifySpDc).unwrap(), None);
        assert_eq!(secrets_b.get(SecretKey::YandexToken).unwrap(), None);
        assert_eq!(secrets_b.get(SecretKey::DeezerArl).unwrap(), None);
        assert_eq!(secrets_b.get(SecretKey::SoundCloudOAuthToken).unwrap(), None);

        // Серверный Vault возвращает все 4 сервиса, ранее сохранённые с другого устройства A
        let mock_body = r#"{
            "credentials": [
                {
                    "provider_kind": "spotify",
                    "version": 1,
                    "payload": { "sp_dc": "device_a_sp_dc" },
                    "updated_at_ms": 1700000001
                },
                {
                    "provider_kind": "yandex_music",
                    "version": 2,
                    "payload": { "token": "device_a_yandex_token" },
                    "updated_at_ms": 1700000002
                },
                {
                    "provider_kind": "deezer",
                    "version": 3,
                    "payload": { "arl": "device_a_deezer_arl" },
                    "updated_at_ms": 1700000003
                },
                {
                    "provider_kind": "soundcloud",
                    "version": 4,
                    "payload": {
                        "oauth_token": "device_a_sc_token",
                        "client_id": "device_a_sc_client_id"
                    },
                    "updated_at_ms": 1700000004
                }
            ]
        }"#;

        let (url, server_handle) = start_mock_server(200, mock_body).await;
        let client = ServerClient::new(&url, "dummy_token").unwrap();

        let user_id = "usr_traveler";
        let generation = next_account_generation();

        // 1. Вход на новом устройстве (Device B)
        sync_credentials_on_login(&client, "device_b_session", user_id, generation, &secrets_b)
            .await
            .expect("Гидратация учетных данных на Device B должна завершиться успешно");

        // 2. Проверяем, что все 4 сервиса гидратированы в активный runtime Device B
        assert_eq!(
            secrets_b.get(SecretKey::SpotifySpDc).unwrap().as_deref(),
            Some("device_a_sp_dc")
        );
        assert_eq!(
            secrets_b.get(SecretKey::YandexToken).unwrap().as_deref(),
            Some("device_a_yandex_token")
        );
        assert_eq!(
            secrets_b.get(SecretKey::DeezerArl).unwrap().as_deref(),
            Some("device_a_deezer_arl")
        );
        assert_eq!(
            secrets_b.get(SecretKey::SoundCloudOAuthToken).unwrap().as_deref(),
            Some("device_a_sc_token")
        );
        assert_eq!(
            secrets_b
                .get(SecretKey::SoundCloudClientIdOverride)
                .unwrap()
                .as_deref(),
            Some("device_a_sc_client_id")
        );

        // 3. Проверяем, что пространство имён аккаунта на Device B заполнено
        assert_eq!(
            secrets_b
                .get_named(&account_secret_key(user_id, SecretKey::SpotifySpDc.name()))
                .unwrap()
                .as_deref(),
            Some("device_a_sp_dc")
        );
        assert_eq!(
            secrets_b
                .get_named(&account_version_key(user_id, "spotify"))
                .unwrap()
                .as_deref(),
            Some("1")
        );

        // 4. Выход из аккаунта на Device B
        clear_account_local_secrets(user_id, &secrets_b);

        // 5. Проверяем полную изоляцию Guest на Device B: все секреты стёрты локально
        assert_eq!(secrets_b.get(SecretKey::SpotifySpDc).unwrap(), None);
        assert_eq!(secrets_b.get(SecretKey::YandexToken).unwrap(), None);
        assert_eq!(secrets_b.get(SecretKey::DeezerArl).unwrap(), None);
        assert_eq!(secrets_b.get(SecretKey::SoundCloudOAuthToken).unwrap(), None);
        assert_eq!(
            secrets_b.get(SecretKey::SoundCloudClientIdOverride).unwrap(),
            None
        );

        // Пространство имён аккаунта также чисто
        assert_eq!(
            secrets_b
                .get_named(&account_secret_key(user_id, SecretKey::SpotifySpDc.name()))
                .unwrap(),
            None
        );
        assert_eq!(
            secrets_b
                .get_named(&account_version_key(user_id, "spotify"))
                .unwrap(),
            None
        );

        server_handle.abort();
    }
}
