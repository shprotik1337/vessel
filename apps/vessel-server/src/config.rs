//! Конфиг Vessel Server (`server.toml`): секция `[server]` + те же поля
//! провайдеров, что в `AppConfig` клиента — неизвестные ключи serde игнорирует,
//! поэтому в одном файле живут и конфиг сервера, и конфиг локальных
//! провайдеров сервера (credentials этого экземпляра).

use std::path::PathBuf;

use anyhow::{Context, Result};
use serde::Deserialize;
use vessel_core::config::AppConfig;

#[derive(Clone, Debug, Deserialize)]
#[serde(default)]
pub struct ServerSection {
    pub name: String,
    pub listen: String,
    /// Bearer-токены, которым разрешён доступ к API (хотя бы один обязателен).
    pub tokens: Vec<String>,
    /// auto — релеить только IP-связанные источники (googlevideo, file://);
    /// always — весь аудио-трафик через сервер; off — без ретрая.
    pub relay: RelayPolicy,
    pub max_streams: usize,
    /// Базовый адрес для логов/проверок (клиент строит relay-URL сам).
    pub public_base_url: Option<String>,
    /// TTL relay-токена, сек.
    pub relay_ttl_secs: u64,
    pub data_dir: PathBuf,
}

#[derive(Clone, Copy, Debug, Default, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum RelayPolicy {
    #[default]
    Auto,
    Always,
    Off,
}

#[derive(Clone, Debug, Deserialize)]
struct File {
    #[serde(default)]
    server: ServerSection,
}

#[derive(Clone, Debug)]
pub struct ServerConfig {
    pub server: ServerSection,
    pub app: AppConfig,
}

impl Default for ServerSection {
    fn default() -> Self {
        Self {
            name: "Vessel Server".to_string(),
            listen: "0.0.0.0:7700".to_string(),
            tokens: Vec::new(),
            relay: RelayPolicy::Auto,
            max_streams: 64,
            public_base_url: None,
            relay_ttl_secs: 4 * 60 * 60,
            data_dir: PathBuf::from("/opt/vessel"),
        }
    }
}

impl ServerConfig {
    pub fn load(path: &Path) -> Result<Self> {
        let source = std::fs::read_to_string(path)
            .with_context(|| format!("не удалось прочитать {}", path.display()))?;
        let file: File = toml::from_str(&source).context("server.toml повреждён")?;
        // Поля провайдеров/секретов сервера — тот же AppConfig (лишний
        // [server] просто игнорируется).
        let app: AppConfig = toml::from_str(&source).context("секции провайдеров повреждены")?;
        if file.server.tokens.iter().all(|t| t.trim().is_empty()) {
            anyhow::bail!("в [server] нет ни одного токена доступа — сервер не запустишь");
        }
        if !app.provider_routing.is_empty() {
            anyhow::bail!("сервер не может маршрутизировать провайдеры на другой сервер");
        }
        Ok(Self { server: file.server, app })
    }
}

use std::path::Path;
