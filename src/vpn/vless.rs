//! Парсер VLESS-ссылок (vless://uuid@host:port?params#name).
//!
//! Неизвестные и неподдерживаемые параметры НЕ игнорируются молча —
//! возвращается понятная ошибка со списком.

use anyhow::{bail, Result};

#[derive(Clone, Debug, PartialEq)]
pub enum VlessTransport {
    Tcp,
    Ws { path: String, host: Option<String> },
    Grpc { service: Option<String> },
    Http { path: String, host: Option<String> },
}

impl VlessTransport {
    /// Подпись для UI и конфига sing-box.
    pub fn label(&self) -> String {
        match self {
            Self::Tcp => "TCP".to_string(),
            Self::Ws { .. } => "WS".to_string(),
            Self::Grpc { .. } => "gRPC".to_string(),
            Self::Http { .. } => "HTTP".to_string(),
        }
    }

    pub fn kind(&self) -> &'static str {
        match self {
            Self::Tcp => "tcp",
            Self::Ws { .. } => "ws",
            Self::Grpc { .. } => "grpc",
            Self::Http { .. } => "http",
        }
    }
}

#[derive(Clone, Debug, PartialEq)]
pub struct VlessUri {
    pub uuid: String,
    pub host: String,
    pub port: u16,
    /// "none" | "tls" | "reality"
    pub security: String,
    pub sni: Option<String>,
    pub fingerprint: Option<String>,
    /// Reality public key
    pub public_key: Option<String>,
    /// Reality short id
    pub short_id: Option<String>,
    /// Обычно "xtls-rprx-vision"
    pub flow: Option<String>,
    pub transport: VlessTransport,
    /// Имя из фрагмента (для подстановки в название профиля).
    pub name: Option<String>,
}

const KNOWN_PARAMS: &[&str] = &[
    "encryption", "security", "sni", "alpn", "fp", "pbk", "sid", "spx", "flow",
    "type", "path", "host", "serviceName", "serviceNameMode", "method", "mode",
    "headerType", "authority", "allowInsecure", "allowInsecure_1", "insecure",
];

const FINGERPRINTS: &[&str] = &[
    "chrome", "firefox", "safari", "ios", "android", "edge", "360", "qq", "random", "randomized",
];

pub fn parse_vless_uri(raw: &str) -> Result<VlessUri> {
    let trimmed = raw.trim();
    let Some(rest) = trimmed.strip_prefix("vless://") else {
        bail!("это не VLESS-ссылка — она должна начинаться с vless://")
    };
    if rest.is_empty() {
        bail!("VLESS-ссылка пустая — скопируй её целиком из клиента")
    }

    // Фрагмент — имя профиля
    let (main, name) = match rest.split_once('#') {
        Some((main, name)) => (main, Some(percent_decode(name))),
        None => (rest, None),
    };
    let name = name.map(|n| n.trim().to_string()).filter(|n| !n.is_empty());

    // Query
    let (authority, query) = match main.split_once('?') {
        Some((authority, query)) => (authority, query),
        None => (main, ""),
    };

    // uuid@host:port
    let (uuid, host_port) = authority
        .rsplit_once('@')
        .ok_or_else(|| anyhow::anyhow!("в VLESS-ссылке нет разделителя @ — проверь, что скопирована вся ссылка"))?;
    let uuid = percent_decode(uuid).trim().to_string();
    if uuid.is_empty() {
        bail!("в VLESS-ссылке отсутствует UUID")
    }
    let (host, port_str) = split_host_port(host_port)?;
    let host = percent_decode(host).trim().trim_matches('[').trim_matches(']').to_string();
    if host.is_empty() {
        bail!("в VLESS-ссылке отсутствует адрес сервера")
    }
    let port: u16 = port_str
        .parse()
        .map_err(|_| anyhow::anyhow!("некорректный порт «{port_str}» в VLESS-ссылке"))?;

    // Query-параметры
    let mut params: Vec<(String, String)> = Vec::new();
    for pair in query.split('&') {
        if pair.is_empty() {
            continue;
        }
        let (key, value) = pair.split_once('=').unwrap_or((pair, ""));
        params.push((percent_decode(key), percent_decode(value)));
    }

    let mut unknown: Vec<String> = Vec::new();
    let get = |key: &str| -> Option<String> {
        params
            .iter()
            .find(|(k, _)| k == key)
            .map(|(_, v)| v.clone())
    };
    for (key, _) in &params {
        if !KNOWN_PARAMS.contains(&key.as_str()) {
            unknown.push(key.clone());
        }
    }
    if !unknown.is_empty() {
        bail!(
            "VLESS-ссылка содержит неподдерживаемые параметры: {}. \
             Возможно, сервер использует функцию, которой нет в ядре Vessel",
            unknown.join(", ")
        );
    }

    match get("encryption").as_deref() {
        None | Some("none") => {}
        Some(other) => bail!("неподдерживаемое шифрование «{other}» — VLESS использует encryption=none"),
    }

    let security = get("security").unwrap_or_else(|| "none".to_string());
    if !matches!(security.as_str(), "none" | "tls" | "reality") {
        bail!("неподдерживаемый security «{security}» — поддерживаются none, tls и reality")
    }

    let sni = get("sni").filter(|s| !s.is_empty());
    let fingerprint = get("fp").filter(|s| !s.is_empty());
    if let Some(fp) = &fingerprint {
        if !FINGERPRINTS.contains(&fp.as_str()) {
            bail!(
                "неподдерживаемый fingerprint «{fp}» — поддерживаются: {}",
                FINGERPRINTS.join(", ")
            );
        }
    }
    let public_key = get("pbk").filter(|s| !s.is_empty());
    let short_id = get("sid").filter(|s| !s.is_empty());
    if security == "reality" && public_key.is_none() {
        bail!("в Reality-ссылке отсутствует публичный ключ (pbk) — без него подключение невозможно")
    }

    let flow = get("flow").filter(|s| !s.is_empty());
    if let Some(flow) = &flow {
        if flow != "xtls-rprx-vision" {
            bail!("неподдерживаемый flow «{flow}» — ядро поддерживает только xtls-rprx-vision")
        }
    }

    let transport_type = get("type").unwrap_or_else(|| "tcp".to_string());
    let transport = match transport_type.as_str() {
        "tcp" => VlessTransport::Tcp,
        "ws" => VlessTransport::Ws {
            path: get("path").filter(|p| !p.is_empty()).unwrap_or_else(|| "/".to_string()),
            host: get("host").filter(|h| !h.is_empty()),
        },
        "grpc" => VlessTransport::Grpc {
            service: get("serviceName").filter(|s| !s.is_empty()),
        },
        "http" | "h2" => VlessTransport::Http {
            path: get("path").filter(|p| !p.is_empty()).unwrap_or_else(|| "/".to_string()),
            host: get("host").filter(|h| !h.is_empty()),
        },
        other if other == "xhttp" || other == "splithttp" => bail!(
            "транспорт {other} не поддерживается ядром — его нет в текущей версии amnezia-box; \
             попроси у того, кто выдал ссылку, вариант с ws или grpc"
        ),
        other => bail!(
            "неподдерживаемый транспорт «{other}» — поддерживаются tcp, ws, grpc и http"
        ),
    };

    Ok(VlessUri {
        uuid,
        host,
        port,
        security,
        sni,
        fingerprint,
        public_key,
        short_id,
        flow,
        transport,
        name,
    })
}

fn split_host_port(value: &str) -> Result<(&str, &str)> {
    // IPv6 в скобках: [::1]:443
    if let Some(close) = value.rfind(']') {
        let host = &value[..=close];
        let rest = &value[close + 1..];
        let port = rest
            .strip_prefix(':')
            .ok_or_else(|| anyhow::anyhow!("после IPv6-адреса должен идти порт"))?;
        return Ok((host, port));
    }
    let (host, port) = value
        .rsplit_once(':')
        .ok_or_else(|| anyhow::anyhow!("в VLESS-ссылке нет порта — добавь host:port"))?;
    Ok((host, port))
}

fn percent_decode(value: &str) -> String {
    let bytes = value.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%'
            && let Some(hex) = bytes.get(i + 1..i + 3)
            && let Ok(byte) = u8::from_str_radix(&String::from_utf8_lossy(hex), 16)
        {
            out.push(byte);
            i += 3;
            continue;
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).into_owned()
}

#[cfg(test)]
mod tests {
    use super::*;

    const REALITY_URI: &str = "vless://b831381d-6324-4d53-ad4f-8cda48b30811@example.com:443?encryption=none&security=reality&sni=www.microsoft.com&fp=chrome&pbk=SbVKOEMjK0sIlbwg4akyBg5mL5KZwwB-ed4eEE7YnRc&sid=6ba85179&type=tcp&flow=xtls-rprx-vision#Мой%20сервер";

    #[test]
    fn parses_reality_uri() {
        let uri = parse_vless_uri(REALITY_URI).unwrap();
        assert_eq!(uri.uuid, "b831381d-6324-4d53-ad4f-8cda48b30811");
        assert_eq!(uri.host, "example.com");
        assert_eq!(uri.port, 443);
        assert_eq!(uri.security, "reality");
        assert_eq!(uri.sni.as_deref(), Some("www.microsoft.com"));
        assert_eq!(uri.fingerprint.as_deref(), Some("chrome"));
        assert_eq!(uri.public_key.as_deref(), Some("SbVKOEMjK0sIlbwg4akyBg5mL5KZwwB-ed4eEE7YnRc"));
        assert_eq!(uri.short_id.as_deref(), Some("6ba85179"));
        assert_eq!(uri.flow.as_deref(), Some("xtls-rprx-vision"));
        assert_eq!(uri.transport, VlessTransport::Tcp);
        assert_eq!(uri.name.as_deref(), Some("Мой сервер"));
    }

    #[test]
    fn parses_ws_tls_uri() {
        let uri = parse_vless_uri(
            "vless://uuid-1@host.io:2053?security=tls&type=ws&path=%2Fws&host=cdn.host.io",
        )
        .unwrap();
        assert_eq!(uri.security, "tls");
        assert_eq!(
            uri.transport,
            VlessTransport::Ws {
                path: "/ws".to_string(),
                host: Some("cdn.host.io".to_string()),
            }
        );
    }

    #[test]
    fn parses_grpc_and_defaults() {
        let uri = parse_vless_uri("vless://uuid-2@1.2.3.4:443?security=tls&type=grpc&serviceName=grpc-svc").unwrap();
        assert_eq!(uri.transport, VlessTransport::Grpc { service: Some("grpc-svc".into()) });
        let simple = parse_vless_uri("vless://uuid-3@1.2.3.4:443").unwrap();
        assert_eq!(simple.security, "none");
        assert_eq!(simple.transport, VlessTransport::Tcp);
        assert_eq!(simple.port, 443);
    }

    #[test]
    fn rejects_non_vless_and_broken() {
        assert!(parse_vless_uri("https://example.com").is_err());
        assert!(parse_vless_uri("vless://").is_err());
        assert!(parse_vless_uri("vless://host.com:443").is_err()); // нет uuid
        assert!(parse_vless_uri("vless://uuid@host.com").is_err()); // нет порта
        assert!(parse_vless_uri("vless://uuid@host.com:abc").is_err()); // порт
        assert!(parse_vless_uri("vless://uuid@host.com:443?security=reality").is_err()); // нет pbk
    }

    #[test]
    fn rejects_unknown_params_and_flows() {
        let err = parse_vless_uri("vless://u@h:1?wizard=yes").unwrap_err();
        assert!(err.to_string().contains("wizard"), "{err}");
        let err = parse_vless_uri("vless://u@h:1?flow=xtls-rprx-direct").unwrap_err();
        assert!(err.to_string().contains("flow"), "{err}");
        let err = parse_vless_uri("vless://u@h:1?fp=netscape").unwrap_err();
        assert!(err.to_string().contains("fingerprint"), "{err}");
    }
}
