use anyhow::Result;
use reqwest::cookie::Jar;
use serde_json::Value;
use url::Url;

pub const COOKIE_URL: &str = "https://www.deezer.com/";
pub const COOKIE_URL_HTTP: &str = "http://www.deezer.com/";

pub fn normalize_auth_token(value: &str) -> String {
    let value = value.trim().trim_matches(['\'', '"']).trim();
    value
        .split_once(':')
        .filter(|(prefix, _)| prefix.trim().eq_ignore_ascii_case("cookie"))
        .map_or_else(|| value.to_string(), |(_, rest)| rest.trim().to_string())
}

pub fn normalize_arl(value: &str) -> String {
    let value = value
        .trim()
        .strip_prefix("Cookie:")
        .unwrap_or(value.trim())
        .trim();
    value
        .split(';')
        .find_map(|part| {
            let part = part.trim();
            if let Some((name, value)) = part.split_once('=')
                && name.trim().eq_ignore_ascii_case("arl")
            {
                return Some(value.trim().trim_matches(['\'', '"']).to_string());
            }
            None
        })
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| value.trim_matches(['\'', '"']).to_string())
}

pub fn parse_cookie_pairs(value: &str) -> Vec<(String, String)> {
    normalize_auth_token(value)
        .split(';')
        .filter_map(|segment| {
            let (name, value) = segment.trim().split_once('=')?;
            let name = name.trim();
            if name.is_empty()
                || matches!(
                    name.to_ascii_lowercase().as_str(),
                    "domain" | "path" | "expires" | "max-age" | "samesite" | "secure" | "httponly"
                )
            {
                return None;
            }
            let value = value.trim().trim_matches(['\'', '"']).trim();
            (!value.is_empty()).then(|| (name.to_string(), value.to_string()))
        })
        .collect()
}

pub fn setup_cookie_jar(jar: &Jar, auth_token: &str) -> Result<()> {
    let arl = normalize_arl(auth_token);
    if arl.is_empty() {
        return Ok(());
    }
    let https = Url::parse(COOKIE_URL)?;
    let http_url = Url::parse(COOKIE_URL_HTTP)?;
    let pairs = parse_cookie_pairs(auth_token);
    if pairs.is_empty() {
        for url in [&https, &http_url] {
            jar.add_cookie_str(
                &format!("arl={arl}; Domain=.deezer.com; Path=/; HttpOnly"),
                url,
            );
        }
    } else {
        for (name, cookie_value) in pairs {
            for url in [&https, &http_url] {
                jar.add_cookie_str(
                    &format!("{name}={cookie_value}; Domain=.deezer.com; Path=/; HttpOnly"),
                    url,
                );
            }
        }
    }
    Ok(())
}

pub fn gateway_has_error(value: &Value) -> bool {
    match value {
        Value::Array(items) => !items.is_empty(),
        Value::Object(items) => !items.is_empty(),
        _ => false,
    }
}

pub fn gateway_has_invalid_token(payload: &Value) -> bool {
    let Some(errors) = payload.get("error").and_then(Value::as_object) else {
        return false;
    };
    let gateway = errors
        .get("GATEWAY_ERROR")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let required = errors.get("VALID_TOKEN_REQUIRED");
    gateway.eq_ignore_ascii_case("invalid api token")
        || required.and_then(Value::as_bool).unwrap_or(false)
        || required.and_then(Value::as_str).is_some_and(|value| {
            value.eq_ignore_ascii_case("true")
                || value.to_ascii_lowercase().contains("invalid csrf token")
        })
}

pub fn text_at<'a>(value: &'a Value, path: &[&str]) -> Option<&'a str> {
    path.iter()
        .try_fold(value, |current, key| current.get(*key))?
        .as_str()
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

pub fn user_id_at(value: &Value, path: &[&str]) -> Option<String> {
    let v = path.iter().try_fold(value, |current, key| current.get(*key))?;
    match v {
        Value::Number(n) => n.to_string().into(),
        Value::String(s) if !s.trim().is_empty() => Some(s.trim().to_string()),
        _ => None,
    }
}
