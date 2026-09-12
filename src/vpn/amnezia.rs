//! Импорт конфигураций Amnezia (AmneziaWG / WireGuard в .conf-формате,
//! который экспортирует приложение AmneziaVPN). Формат — INI-подобный текст:
//!
//! ```text
//! [Interface]
//! PrivateKey = ...
//! Address = 10.8.1.2/32
//! DNS = 1.1.1.1
//! Jc = 4 ... H4 = 4
//!
//! [Peer]
//! PublicKey = ...
//! PresharedKey = ...
//! AllowedIPs = 0.0.0.0/0, ::/0
//! Endpoint = host:port
//! PersistentKeepalive = 25
//! ```
//!
//! Зашифрованные архивы .vpn не поддерживаются — честная ошибка.

use anyhow::{bail, Result};
use base64::Engine;
use flate2::read::ZlibDecoder;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::io::Read;

/// Импорт ссылки `vpn://` из приложения AmneziaVPN.
///
/// Формат (как в AmneziaVPN `exportController`): `vpn://` + base64url от
/// zlib-потока с 4-байтовым big-endian префиксом длины (формат Qt
/// `qCompress`). Внутри — JSON с контейнерами; в контейнере
/// `amnezia-awg` поле `last_config` содержит текстовую WireGuard/AmneziaWG
/// конфигурацию (то, что умеет `parse_awg_conf`).
pub fn parse_amnezia_vpn_uri(raw: &str) -> Result<(AwgConfig, Option<String>)> {
    let trimmed = raw.trim();
    let Some(payload) = trimmed.strip_prefix("vpn://") else {
        bail!("это не ссылка Amnezia — она должна начинаться с vpn://")
    };
    let payload = payload.trim();
    if payload.is_empty() {
        bail!("ссылка Amnezia пустая — скопируй её целиком")
    }

    let engine = base64::engine::general_purpose::URL_SAFE_NO_PAD;
    let bytes = engine
        .decode(payload)
        .map_err(|_| anyhow::anyhow!("ссылка повреждена — не удалось раскодировать base64"))?;
    if bytes.len() < 10 {
        bail!("ссылка слишком короткая — внутри нет конфигурации")
    }

    // Qt qCompress: 4 байта big-endian (размер распакованных данных) + zlib
    let mut decoder = ZlibDecoder::new(&bytes[4..]);
    let mut json_bytes = Vec::new();
    decoder
        .read_to_end(&mut json_bytes)
        .map_err(|_| {
            anyhow::anyhow!(
                "не удалось распаковать ссылку — возможно, она экспортирована с паролем; \
                 экспортируй конфиг из Amnezia без пароля"
            )
        })?;
    let json: Value = serde_json::from_slice(&json_bytes)
        .map_err(|_| anyhow::anyhow!("внутри ссылки не конфигурация Amnezia"))?;

    extract_awg_from_amnezia_json(&json)
}

/// Достаёт AmneziaWG-конфиг из распакованного JSON Amnezia.
fn extract_awg_from_amnezia_json(json: &Value) -> Result<(AwgConfig, Option<String>)> {
    let mut last_config: Option<Value> = None;

    if let Some(containers) = json.get("containers").and_then(Value::as_array) {
        for container in containers {
            let kind = container
                .get("container")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_ascii_lowercase();
            if !(kind.contains("awg") || kind.contains("wg") || kind.contains("wireguard")) {
                continue;
            }
            let settings = container
                .get(kind.as_str())
                .or_else(|| container.get("awg"))
                .or_else(|| container.get("wireguard"));
            if let Some(settings) = settings
                && let Some(config) = settings.get("last_config")
            {
                last_config = Some(config.clone());
                break;
            }
        }
    }
    if last_config.is_none()
        && let Some(settings) = json.get("awg")
        && let Some(config) = settings.get("last_config")
    {
        last_config = Some(config.clone());
    }

    let Some(last_config) = last_config else {
        bail!("в ссылке нет AmneziaWG-контейнера — эта ссылка от другого типа VPN")
    };

    // last_config — либо JSON-строка, либо уже объект
    let last_value: Value = match &last_config {
        Value::String(text) => serde_json::from_str(text.trim())
            .map_err(|_| anyhow::anyhow!("внутренний конфиг Amnezia повреждён"))?,
        value @ Value::Object(_) => value.clone(),
        _ => bail!("внутренний конфиг Amnezia имеет неожиданный формат"),
    };

    let ini = last_value
        .get("config")
        .and_then(Value::as_str)
        .or_else(|| last_value.get("Config").and_then(Value::as_str));
    let Some(ini) = ini else {
        bail!("внутренний конфиг Amnezia не содержит текстовую конфигурацию")
    };
    let config = parse_awg_conf(ini)?;
    let description = json
        .get("description")
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(str::to_string);
    Ok((config, description))
}

#[derive(Clone, Debug, PartialEq, Default, Serialize, Deserialize)]
#[serde(default)]
pub struct AwgObfuscation {
    pub jc: Option<i64>,
    pub jmin: Option<i64>,
    pub jmax: Option<i64>,
    pub s1: Option<i64>,
    pub s2: Option<i64>,
    pub h1: Option<String>,
    pub h2: Option<String>,
    pub h3: Option<String>,
    pub h4: Option<String>,
    pub i1: Option<String>,
    pub i2: Option<String>,
    pub i3: Option<String>,
    pub i4: Option<String>,
    pub i5: Option<String>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct AwgConfig {
    pub private_key: String,
    pub address: Vec<String>,
    pub peer_public_key: String,
    pub preshared_key: Option<String>,
    pub endpoint_host: String,
    pub endpoint_port: u16,
    pub allowed_ips: Vec<String>,
    /// DNS из [Interface] — резолвим через туннель, чтобы не было утечек.
    pub dns_servers: Vec<String>,
    pub keepalive: Option<u16>,
    pub mtu: Option<u16>,
    pub obfuscation: AwgObfuscation,
}

pub fn parse_awg_conf(raw: &str) -> Result<AwgConfig> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        bail!("конфигурация пустая — вставь содержимое .conf файла от Amnezia")
    }
    if trimmed.starts_with("PK\u{1}") || trimmed.contains("[AmneziaVPN]") {
        bail!("это внутренний формат Amnezia (.vpn) — экспортируй конфиг как текст AmneziaWG/WireGuard (.conf)")
    }
    if !trimmed.contains("[Interface]") || !trimmed.contains("[Peer]") {
        bail!("в конфигурации нет секций [Interface] и [Peer] — это не похоже на AmneziaWG/WireGuard конфиг")
    }

    let mut section = String::new();
    let mut values: Vec<(String, String, String)> = Vec::new(); // (section, key, value)
    for line in trimmed.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') || line.starts_with(';') {
            continue;
        }
        if line.starts_with('[') && line.ends_with(']') {
            section = line[1..line.len() - 1].trim().to_ascii_lowercase();
            continue;
        }
        let Some((key, value)) = line.split_once('=') else {
            bail!("непонятная строка в конфигурации: «{}» — проверь файл", truncate(line));
        };
        values.push((
            section.clone(),
            key.trim().to_ascii_lowercase(),
            value.trim().to_string(),
        ));
    }

    let get = |section: &str, key: &str| -> Option<String> {
        values
            .iter()
            .find(|(s, k, _)| s == section && k == key)
            .map(|(_, _, v)| v.clone())
    };

    let Some(private_key) = get("interface", "privatekey").filter(|v| !v.is_empty()) else {
        bail!("в конфигурации отсутствует PrivateKey — без него подключение невозможно")
    };
    let Some(peer_public_key) = get("peer", "publickey").filter(|v| !v.is_empty()) else {
        bail!("в конфигурации отсутствует PublicKey пира — без него подключение невозможно")
    };
    let Some(endpoint) = get("peer", "endpoint").filter(|v| !v.is_empty()) else {
        bail!("в конфигурации отсутствует Endpoint (адрес сервера) — без него подключение невозможно")
    };
    let (endpoint_host, endpoint_port_str) = endpoint
        .rsplit_once(':')
        .ok_or_else(|| anyhow::anyhow!("Endpoint без порта — должен быть вида host:port"))?;
    let endpoint_port: u16 = endpoint_port_str
        .parse()
        .map_err(|_| anyhow::anyhow!("некорректный порт в Endpoint: «{endpoint_port_str}»"))?;

    let address = split_list(&get("interface", "address").unwrap_or_default());
    if address.is_empty() {
        bail!("в конфигурации отсутствует Address — адрес интерфейса обязателен");
    }
    let allowed_ips = split_list(&get("peer", "allowedips").unwrap_or_default());
    if allowed_ips.is_empty() {
        bail!("в конфигурации отсутствует AllowedIPs — без них не построить маршрут");
    }

    let dns_servers = split_list(&get("interface", "dns").unwrap_or_default())
        .into_iter()
        .filter(|ip| ip.trim().parse::<std::net::IpAddr>().is_ok())
        .collect();

    let preshared_key = get("peer", "presharedkey").filter(|v| !v.is_empty());
    let keepalive = get("peer", "persistentkeepalive")
        .and_then(|v| v.parse().ok());
    let mtu = get("interface", "mtu").and_then(|v| v.parse().ok());

    let obfuscation = AwgObfuscation {
        jc: get("interface", "jc").and_then(|v| v.parse().ok()),
        jmin: get("interface", "jmin").and_then(|v| v.parse().ok()),
        jmax: get("interface", "jmax").and_then(|v| v.parse().ok()),
        s1: get("interface", "s1").and_then(|v| v.parse().ok()),
        s2: get("interface", "s2").and_then(|v| v.parse().ok()),
        h1: get("interface", "h1"),
        h2: get("interface", "h2"),
        h3: get("interface", "h3"),
        h4: get("interface", "h4"),
        i1: get("interface", "i1"),
        i2: get("interface", "i2"),
        i3: get("interface", "i3"),
        i4: get("interface", "i4"),
        i5: get("interface", "i5"),
    };

    Ok(AwgConfig {
        private_key,
        address,
        peer_public_key,
        preshared_key,
        endpoint_host: endpoint_host.trim().to_string(),
        endpoint_port,
        allowed_ips,
        dns_servers,
        keepalive,
        mtu,
        obfuscation,
    })
}

fn split_list(value: &str) -> Vec<String> {
    value
        .split(',')
        .map(|item| item.trim().to_string())
        .filter(|item| !item.is_empty())
        .collect()
}

fn truncate(line: &str) -> &str {
    if line.len() > 40 {
        &line[..40]
    } else {
        line
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const AWG_CONF: &str = "[Interface]\n\
        PrivateKey = yAnz5fB4eQqTJ5hVvWXGJp3kL9K2mN8qRs4TuV1wXy0=\n\
        Address = 10.8.1.2/32, fd42:42:42::2/128\n\
        DNS = 1.1.1.1, 8.8.8.8\n\
        MTU = 1408\n\
        Jc = 4\n\
        Jmin = 40\n\
        Jmax = 70\n\
        S1 = 116\n\
        S2 = 61\n\
        H1 = 1\n\
        H2 = 2\n\
        H3 = 3\n\
        H4 = 4\n\n\
        [Peer]\n\
        PublicKey = qR9mF3wK7xV2nB8cD1sA5tG6hJ4kL0pQ9rT2uW3eIy0=\n\
        PresharedKey = aA1bB2cC3dD4eE5fF6gG7hH8iI9jJ0kK1lL2mM3nN4o=\n\
        AllowedIPs = 0.0.0.0/0, ::/0\n\
        Endpoint = vpn.example.com:51820\n\
        PersistentKeepalive = 25";

    #[test]
    fn parses_awg_conf() {
        let conf = parse_awg_conf(AWG_CONF).unwrap();
        assert_eq!(conf.private_key, "yAnz5fB4eQqTJ5hVvWXGJp3kL9K2mN8qRs4TuV1wXy0=");
        assert_eq!(conf.address, vec!["10.8.1.2/32", "fd42:42:42::2/128"]);
        assert_eq!(conf.endpoint_host, "vpn.example.com");
        assert_eq!(conf.endpoint_port, 51820);
        assert_eq!(conf.allowed_ips, vec!["0.0.0.0/0", "::/0"]);
        assert_eq!(conf.dns_servers, vec!["1.1.1.1", "8.8.8.8"]);
        assert_eq!(conf.keepalive, Some(25));
        assert_eq!(conf.mtu, Some(1408));
        assert_eq!(conf.obfuscation.jc, Some(4));
        assert_eq!(conf.obfuscation.h4.as_deref(), Some("4"));
        assert!(conf.preshared_key.is_some());
    }

    #[test]
    fn parses_plain_wireguard_without_obfuscation() {
        let conf = parse_awg_conf(
            "[Interface]\nPrivateKey = k1=\nAddress = 10.0.0.2/32\n\n[Peer]\nPublicKey = k2=\nAllowedIPs = 0.0.0.0/0\nEndpoint = 1.2.3.4:51820",
        )
        .unwrap();
        assert_eq!(conf.obfuscation, AwgObfuscation::default());
        assert_eq!(conf.endpoint_host, "1.2.3.4");
    }

    #[test]
    fn rejects_vpn_archive_and_garbage() {
        assert!(parse_awg_conf("").is_err());
        assert!(parse_awg_conf("PK\u{1}binary-zip-data").is_err());
        assert!(parse_awg_conf("[Interface]\nPrivateKey = x\n").is_err());
        let err = parse_awg_conf("[Interface]\nPrivateKey = k1=\nAddress = 10.0.0.2/32\n\n[Peer]\nAllowedIPs = 0.0.0.0/0\nEndpoint = 1.2.3.4:51820").unwrap_err();
        assert!(err.to_string().contains("PublicKey"), "{err}");
    }

    // ---------- vpn:// ----------

    /// Собирает ссылку vpn:// в формате Qt qCompress (4 байта BE-длины + zlib).
    fn make_vpn_link(json: &serde_json::Value) -> String {
        use flate2::write::ZlibEncoder;
        use flate2::Compression;
        use std::io::Write;
        let bytes = serde_json::to_vec(json).unwrap();
        let mut encoder = ZlibEncoder::new(Vec::new(), Compression::default());
        encoder.write_all(&bytes).unwrap();
        let compressed = encoder.finish().unwrap();
        let mut payload = Vec::new();
        payload.extend_from_slice(&(bytes.len() as u32).to_be_bytes());
        payload.extend_from_slice(&compressed);
        format!(
            "vpn://{}",
            base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(payload)
        )
    }

    #[test]
    fn parses_amnezia_vpn_link() {
        let inner = serde_json::json!({
            "H1": "1", "H2": "2", "H3": "3", "H4": "4",
            "Jc": 4, "Jmin": 40, "Jmax": 70, "S1": 116, "S2": 61,
            "config": "[Interface]\nPrivateKey = k1=\nAddress = 10.8.1.2/32\nDNS = 1.1.1.1, 8.8.8.8\nMTU = 1408\nJc = 4\nH1 = 1\n\n[Peer]\nPublicKey = k2=\nAllowedIPs = 0.0.0.0/0\nEndpoint = vpn.example.com:51820\nPersistentKeepalive = 25",
            "port": "51820",
        });
        let link = make_vpn_link(&serde_json::json!({
            "containers": [{
                "container": "amnezia-awg",
                "awg": { "last_config": serde_json::to_string(&inner).unwrap() }
            }],
            "defaultContainer": "amnezia-awg",
            "description": "Мой сервер Amnezia",
        }));
        let (config, name) = parse_amnezia_vpn_uri(&link).unwrap();
        assert_eq!(config.private_key, "k1=");
        assert_eq!(config.endpoint_host, "vpn.example.com");
        assert_eq!(config.endpoint_port, 51820);
        assert_eq!(config.dns_servers, vec!["1.1.1.1", "8.8.8.8"]);
        assert_eq!(config.obfuscation.jc, Some(4));
        assert_eq!(name.as_deref(), Some("Мой сервер Amnezia"));
    }

    #[test]
    fn rejects_broken_vpn_links() {
        assert!(parse_amnezia_vpn_uri("https://x").is_err());
        assert!(parse_amnezia_vpn_uri("vpn://").is_err());
        assert!(parse_amnezia_vpn_uri("vpn://не-base64!!!").is_err());
        // Случайные байты не распакуются как zlib
        assert!(parse_amnezia_vpn_uri("vpn://AAAAAAAAAAAAAAAAAAAAAAAAAAAA").is_err());
    }
}
