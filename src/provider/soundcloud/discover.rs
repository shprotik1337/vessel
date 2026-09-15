use anyhow::{bail, Context, Result};
use reqwest::Client;
use url::Url;

use super::client::build_http;

/// Автопоиск публичного client_id SoundCloud: тянет главную страницу,
/// собирает ссылки на JS-ассеты веб-плеера и сканирует их код с конца.
/// Использует браузерный User-Agent для обхода Cloudflare.
pub async fn discover_client_id() -> Result<String> {
    let http = build_http(Client::builder().timeout(std::time::Duration::from_secs(15)))?;

    let html = http
        .get("https://soundcloud.com")
        .send()
        .await
        .context("SoundCloud homepage request failed")?
        .error_for_status()
        .context("SoundCloud homepage returned error status")?
        .text()
        .await
        .context("SoundCloud homepage body read failed")?;

    let mut scripts = Vec::new();
    for chunk in html.split("<script") {
        if let Some(src) = extract_attr(chunk, "src") {
            if src.contains("sndcdn.com/assets/") && src.ends_with(".js") {
                scripts.push(src.to_string());
            }
        }
    }

    // Сканируем с конца (новые бандлы первыми)
    for src in scripts.iter().rev() {
        let resp = match http.get(src).send().await {
            Ok(r) => r,
            Err(_) => continue,
        };
        let js = match resp.text().await {
            Ok(t) => t,
            Err(_) => continue,
        };
        for id in find_all_client_ids(&js) {
            if client_id_works(&http, &id).await {
                crate::dlog!("[SoundCloud] найден рабочий client_id: {id}");
                return Ok(id);
            }
        }
    }

    bail!("не удалось автоматически найти client_id SoundCloud — укажи его вручную в Настройках")
}

fn extract_attr<'a>(chunk: &'a str, attr: &str) -> Option<&'a str> {
    let key = format!("{attr}=\"");
    let start = chunk.find(&key)? + key.len();
    let rest = &chunk[start..];
    let end = rest.find('"')?;
    Some(&rest[..end])
}

fn find_all_client_ids(js: &str) -> Vec<String> {
    let mut results = Vec::new();
    for marker in ["client_id:\"", "\"client_id\":\"", "client_id=\""] {
        let mut rest = js;
        while let Some(pos) = rest.find(marker) {
            rest = &rest[pos + marker.len()..];
            let id: String = rest
                .chars()
                .take_while(|c| c.is_ascii_alphanumeric() || *c == '-' || *c == '_')
                .collect();
            if id.len() >= 16 && !results.contains(&id) {
                results.push(id);
            }
        }
    }
    results
}

/// Проверяем, что ключ живой: с неверным client_id api-v2 отвечает 401/403.
async fn client_id_works(http: &Client, id: &str) -> bool {
    let Ok(url) = Url::parse(&format!(
        "https://api-v2.soundcloud.com/search/tracks?q=test&limit=1&client_id={id}"
    )) else {
        return false;
    };
    matches!(http.get(url).send().await, Ok(resp) if resp.status().is_success())
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Живой тест — ходит в сеть. Запуск:
    /// `cargo test discover_finds_working_client_id -- --ignored --nocapture`
    #[tokio::test]
    #[ignore]
    async fn discover_finds_working_client_id() {
        let id = discover_client_id().await.expect("client_id не найден");
        println!("client_id: {id}");
        assert_eq!(id.len(), 32);
    }
}
