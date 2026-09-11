use anyhow::{bail, Result};
use reqwest::Client;
use url::Url;

use super::client::build_http;

/// Автопоиск публичного client_id SoundCloud: тянет главную страницу,
/// собирает ссылки на JS-ассеты веб-плеера и сканирует их код. Ничего
/// не требует — ключ зашит в клиентский бандл, работает анонимно.
pub async fn discover_client_id() -> Result<String> {
    let http = build_http(Client::builder())?;

    let html = http
        .get("https://soundcloud.com/")
        .send()
        .await?
        .error_for_status()?
        .text()
        .await?;

    // 1) Иногда ключ виден прямо в HTML
    if let Some(id) = find_client_id(&html) {
        if client_id_works(&http, &id).await {
            return Ok(id);
        }
    }

    // 2) Сканируем ассеты веб-плеера
    let mut assets: Vec<String> = Vec::new();
    let mut rest = html.as_str();
    while let Some(pos) = rest.find("https://a-v2.sndcdn.com/assets/") {
        rest = &rest[pos..];
        let end = rest.find(['"', '\'']).unwrap_or(rest.len().min(160));
        let url = rest[..end].to_string();
        rest = &rest[end.min(1)..];
        if url.ends_with(".js") && !assets.contains(&url) {
            assets.push(url);
        }
        if assets.len() >= 12 {
            break;
        }
    }
    for asset in &assets {
        let body = match http.get(asset.as_str()).send().await {
            Ok(resp) => resp,
            Err(_) => continue,
        };
        let body = match body.error_for_status() {
            Ok(resp) => resp,
            Err(_) => continue,
        };
        let text = match body.text().await {
            Ok(text) => text,
            Err(_) => continue,
        };
        if let Some(id) = find_client_id(&text) {
            if client_id_works(&http, &id).await {
                return Ok(id);
            }
        }
    }

    bail!("не удалось автоматически найти client_id SoundCloud — вставь его вручную")
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

/// Первый ключ (32 буквенно-цифровых символа) рядом с упоминанием client_id.
fn find_client_id(text: &str) -> Option<String> {
    let mut rest = text;
    while let Some(pos) = rest.find("client_id") {
        rest = &rest[pos + "client_id".len()..];
        let candidate: String = rest
            .chars()
            .skip_while(|c| !c.is_ascii_alphanumeric())
            .take(32)
            .collect();
        if candidate.len() == 32
            && candidate
                .chars()
                .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
        {
            return Some(candidate);
        }
    }
    None
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
