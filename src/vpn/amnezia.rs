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
use serde::{Deserialize, Serialize};

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
        DNS = 1.1.1.1\n\
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
}
