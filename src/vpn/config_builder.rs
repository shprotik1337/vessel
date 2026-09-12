//! Генерация конфига для amnezia-box (схема sing-box).
//!
//! Секреты попадают только в файл конфига в каталоге пользователя —
//! никогда не в логи и не в UI.

use anyhow::{bail, Result};
use serde_json::{json, Value};

use super::amnezia::AwgConfig;
use super::vless::{VlessTransport, VlessUri};

pub const PROXY_TAG: &str = "vessel-proxy";
pub const DIRECT_TAG: &str = "vessel-direct";
pub const INBOUND_TAG: &str = "vessel-in";

/// Конфиг для VLESS-профиля: mixed-inbound на 127.0.0.1:listen_port,
/// весь трафик по умолчанию уходит в VLESS-outbound.
pub fn build_vless_config(uri: &VlessUri, listen_port: u16) -> Result<Value> {
    let mut outbound = json!({
        "type": "vless",
        "tag": PROXY_TAG,
        "server": uri.host,
        "server_port": uri.port,
        "uuid": uri.uuid,
    });
    if let Some(flow) = &uri.flow {
        outbound["flow"] = json!(flow);
    }

    if uri.security != "none" {
        let mut tls = json!({ "enabled": true });
        if let Some(sni) = &uri.sni {
            tls["server_name"] = json!(sni);
        }
        if let Some(fp) = &uri.fingerprint {
            tls["utls"] = json!({ "enabled": true, "fingerprint": fp });
        }
        if uri.security == "reality" {
            let Some(public_key) = &uri.public_key else {
                bail!("в Reality-профиле нет публичного ключа")
            };
            let mut reality = json!({ "enabled": true, "public_key": public_key });
            if let Some(short_id) = &uri.short_id {
                reality["short_id"] = json!(short_id);
            }
            tls["reality"] = reality;
        }
        outbound["tls"] = tls;
    }

    match &uri.transport {
        VlessTransport::Tcp => {}
        VlessTransport::Ws { path, host } => {
            let mut transport = json!({ "type": "ws", "path": path });
            if let Some(host) = host {
                transport["headers"] = json!({ "Host": host });
            }
            outbound["transport"] = transport;
        }
        VlessTransport::Grpc { service } => {
            let mut transport = json!({ "type": "grpc" });
            if let Some(service) = service {
                transport["service_name"] = json!(service);
            }
            outbound["transport"] = transport;
        }
        VlessTransport::Http { path, host } => {
            let mut transport = json!({ "type": "http", "path": path });
            if let Some(host) = host {
                transport["host"] = json!([host]);
            }
            outbound["transport"] = transport;
        }
    }

    Ok(json!({
        // debug: видно хендшейки wireguard/awg — нужно для диагностики в UI-логах
        "log": { "level": "debug", "timestamp": true },
        "inbounds": [{
            "type": "mixed",
            "tag": INBOUND_TAG,
            "listen": "127.0.0.1",
            "listen_port": listen_port,
        }],
        "outbounds": [outbound, { "type": "direct", "tag": DIRECT_TAG }],
        "route": { "final": PROXY_TAG },
    }))
}

/// Конфиг для Amnezia (AmneziaWG endpoint). DNS из [Interface] резолвится
/// через туннель (detour) — без этого ядро ломается на системном резолвере,
/// а домены утекают мимо VPN.
pub fn build_awg_config(config: &AwgConfig, listen_port: u16) -> Result<Value> {
    let mut endpoint = json!({
        "type": "awg",
        "tag": PROXY_TAG,
        "address": config.address,
        "private_key": config.private_key,
        "peers": [{
            "address": config.endpoint_host,
            "port": config.endpoint_port,
            "public_key": config.peer_public_key,
            "allowed_ips": config.allowed_ips,
        }],
    });
    if let Some(preshared) = &config.preshared_key {
        endpoint["peers"][0]["preshared_key"] = json!(preshared);
    }
    if let Some(keepalive) = config.keepalive {
        endpoint["peers"][0]["persistent_keepalive_interval"] = json!(keepalive);
    }
    if let Some(mtu) = config.mtu {
        endpoint["mtu"] = json!(mtu);
    }

    let obf = &config.obfuscation;
    if let Some(jc) = obf.jc {
        endpoint["jc"] = json!(jc);
    }
    if let Some(jmin) = obf.jmin {
        endpoint["jmin"] = json!(jmin);
    }
    if let Some(jmax) = obf.jmax {
        endpoint["jmax"] = json!(jmax);
    }
    if let Some(s1) = obf.s1 {
        endpoint["s1"] = json!(s1);
    }
    if let Some(s2) = obf.s2 {
        endpoint["s2"] = json!(s2);
    }
    for (key, value) in [
        ("h1", &obf.h1), ("h2", &obf.h2), ("h3", &obf.h3), ("h4", &obf.h4),
        ("i1", &obf.i1), ("i2", &obf.i2), ("i3", &obf.i3), ("i4", &obf.i4), ("i5", &obf.i5),
    ] {
        if let Some(value) = value {
            endpoint[key] = json!(value);
        }
    }

    let mut dns_servers = config.dns_servers.clone();
    dns_servers.retain(|s| !s.trim().is_empty());
    if dns_servers.is_empty() {
        dns_servers.push("1.1.1.1".to_string());
    }
    let dns_entries: Vec<Value> = dns_servers
        .iter()
        .enumerate()
        .map(|(i, server)| {
            // Первый сервер носит тег "dns" — это дефолтный резолвер sing-box.
            // БЕЗ detour: эндпоинт (endpoint) нельзя использовать как
            // DNS-транспорт (синг это не поддерживает — падает
            // 'cannot marshal DNS message' на любом типе). Без detour синг
            // резолвит напрямую: утечка DNS остаётся, но туннель работает,
            // данные идут через AWG.
            let tag = if i == 0 { "dns".to_string() } else { format!("dns-{i}") };
            json!({
                "type": "tcp",
                "tag": tag,
                "server": server.trim(),
            })
        })
        .collect();

    Ok(json!({
        // debug: видно хендшейки wireguard/awg — нужно для диагностики в UI-логах
        "log": { "level": "debug", "timestamp": true },
        "dns": { "servers": dns_entries, "final": "dns", "strategy": "ipv4_only" },
        "inbounds": [{
            "type": "mixed",
            "tag": INBOUND_TAG,
            "listen": "127.0.0.1",
            "listen_port": listen_port,
        }],
        "endpoints": [endpoint],
        "outbounds": [{ "type": "direct", "tag": DIRECT_TAG }],
        "route": {
            "final": PROXY_TAG,
            "default_domain_resolver": { "server": "dns" },
        },
    }))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::vpn::vless::parse_vless_uri;

    #[test]
    fn vless_reality_config_shape() {
        let uri = parse_vless_uri(
            "vless://uuid-1@example.com:443?security=reality&sni=www.microsoft.com&fp=chrome&pbk=PBK123&sid=6ba85179&flow=xtls-rprx-vision#name",
        )
        .unwrap();
        let config = build_vless_config(&uri, 45678).unwrap();
        assert_eq!(config["inbounds"][0]["listen_port"], 45678);
        assert_eq!(config["route"]["final"], "vessel-proxy");
        let outbound = &config["outbounds"][0];
        assert_eq!(outbound["type"], "vless");
        assert_eq!(outbound["uuid"], "uuid-1");
        assert_eq!(outbound["tls"]["reality"]["public_key"], "PBK123");
        assert_eq!(outbound["tls"]["reality"]["short_id"], "6ba85179");
        assert_eq!(outbound["tls"]["utls"]["fingerprint"], "chrome");
        assert!(outbound.get("transport").is_none());
    }

    #[test]
    fn vless_ws_config_has_transport() {
        let uri = parse_vless_uri("vless://u@h:2053?security=tls&type=ws&path=%2Fws&host=cdn.h").unwrap();
        let config = build_vless_config(&uri, 1).unwrap();
        let transport = &config["outbounds"][0]["transport"];
        assert_eq!(transport["type"], "ws");
        assert_eq!(transport["path"], "/ws");
        assert_eq!(transport["headers"]["Host"], "cdn.h");
        // tls включён, но reality нет
        assert_eq!(config["outbounds"][0]["tls"]["enabled"], true);
        assert!(config["outbounds"][0]["tls"].get("reality").is_none());
    }

    #[test]
    fn awg_config_shape() {
        let awg = crate::vpn::amnezia::parse_awg_conf(
            "[Interface]\nPrivateKey = k1=\nAddress = 10.8.1.2/32\nJc = 4\nH1 = 1\n\n[Peer]\nPublicKey = k2=\nAllowedIPs = 0.0.0.0/0\nEndpoint = host.io:51820\nPersistentKeepalive = 25",
        )
        .unwrap();
        let config = build_awg_config(&awg, 40001).unwrap();
        assert_eq!(config["route"]["final"], "vessel-proxy");
        // DNS без detour (endpoint не тянет DNS-транспорт) и final=tag
        assert_eq!(config["dns"]["servers"][0]["tag"], "dns");
        assert!(config["dns"]["servers"][0].get("detour").is_none());
        assert_eq!(config["dns"]["final"], "dns");
        assert_eq!(config["route"]["default_domain_resolver"]["server"], "dns");
        let endpoint = &config["endpoints"][0];
        assert_eq!(endpoint["type"], "awg");
        assert_eq!(endpoint["private_key"], "k1=");
        assert_eq!(endpoint["peers"][0]["address"], "host.io");
        assert_eq!(endpoint["peers"][0]["port"], 51820);
        assert_eq!(endpoint["peers"][0]["persistent_keepalive_interval"], 25);
        assert_eq!(endpoint["jc"], 4);
        assert_eq!(endpoint["h1"], "1");
    }
}
