use std::{thread, time::Duration};

use tauri::{AppHandle, Manager};
use url::Url;

/// Домены, с которых собираем cookies для входа в Spotify.
const SPOTIFY_COOKIE_DOMAINS: &[&str] = &[
    "https://open.spotify.com/",
    "https://accounts.spotify.com/",
];

/// Собирает cookies Spotify (sp_dc и др.) из окна webview.
pub fn collect_spotify_cookies(app: &AppHandle) -> anyhow::Result<String> {
    let window = app
        .get_webview_window("spotify_login")
        .ok_or_else(|| anyhow::anyhow!("окно входа Spotify не открыто"))?;

    // Ждём, пока появится именно sp_dc — после редиректа логина на open.spotify.com
    // она пишется не мгновенно. Перебираем все домены на каждой попытке.
    let mut all_cookies: Vec<(String, String)> = Vec::new();
    let mut last_error: Option<String> = None;
    for attempt in 0..6 {
        all_cookies.clear();
        let mut urls: Vec<Url> = Vec::new();
        if let Ok(current) = window.url() {
            urls.push(current);
        }
        for url_str in SPOTIFY_COOKIE_DOMAINS {
            if let Ok(url) = Url::parse(url_str) {
                urls.push(url);
            }
        }
        for url in urls {
            let webview = window.as_ref();
            match webview.cookies_for_url(url) {
                Ok(cookies) => {
                    for cookie in cookies {
                        let name = cookie.name().to_string();
                        let value = cookie.value().to_string();
                        if !name.is_empty() && !all_cookies.iter().any(|(n, _)| *n == name) {
                            all_cookies.push((name, value));
                        }
                    }
                }
                Err(error) => {
                    last_error = Some(format!("cookies_for_url: {error}"));
                }
            }
        }
        if all_cookies.iter().any(|(n, _)| n == "sp_dc") {
            break;
        }
        thread::sleep(Duration::from_millis(700 * (attempt + 1)));
    }

    if !all_cookies.iter().any(|(n, _)| n == "sp_dc") {
        return Err(anyhow::anyhow!(
            "{} — войди в аккаунт Spotify и нажми «Забрать cookies» ещё раз",
            last_error.unwrap_or_else(|| "не найдена cookie sp_dc".to_string())
        ));
    }

    let cookie_string = all_cookies
        .into_iter()
        .map(|(n, v)| format!("{n}={v}"))
        .collect::<Vec<_>>()
        .join("; ");
    Ok(cookie_string)
}

/// Домены, с которых собираем cookies для входа в Deezer.
const DEEZER_COOKIE_DOMAINS: &[&str] = &[
    "https://www.deezer.com/",
    "https://deezer.com/",
    "https://account.deezer.com/",
];

/// Собирает cookie `arl` из окна входа Deezer (появляется после логина).
pub fn collect_deezer_arl(app: &AppHandle) -> anyhow::Result<String> {
    let window = app
        .get_webview_window("deezer_login")
        .ok_or_else(|| anyhow::anyhow!("окно входа Deezer не открыто"))?;

    let mut arl: Option<String> = None;
    let mut last_error: Option<String> = None;
    for attempt in 0..6 {
        let mut urls: Vec<Url> = Vec::new();
        if let Ok(current) = window.url() {
            urls.push(current);
        }
        for url_str in DEEZER_COOKIE_DOMAINS {
            if let Ok(url) = Url::parse(url_str) {
                urls.push(url);
            }
        }
        for url in urls {
            let webview = window.as_ref();
            match webview.cookies_for_url(url) {
                Ok(cookies) => {
                    for cookie in cookies {
                        if cookie.name() == "arl" {
                            arl = Some(cookie.value().to_string());
                        }
                    }
                }
                Err(error) => {
                    last_error = Some(format!("cookies_for_url: {error}"));
                }
            }
        }
        if arl.is_some() {
            break;
        }
        thread::sleep(Duration::from_millis(700 * (attempt + 1)));
    }

    match arl {
        Some(arl) if !arl.trim().is_empty() => Ok(arl),
        _ => Err(anyhow::anyhow!(
            "{} — войди в аккаунт Deezer, cookie появится после входа",
            last_error.unwrap_or_else(|| "не найдена cookie arl".to_string())
        )),
    }
}

/// Домены, с которых читаем cookies авторизации SoundCloud.
const SOUNDCLOUD_COOKIE_DOMAINS: &[&str] = &[
    "https://soundcloud.com/",
    "https://secure.soundcloud.com/",
    "https://api-v2.soundcloud.com/",
];

/// Читает `oauth_token` и `client_id` из окна входа SoundCloud.
/// Возвращает Ok((oauth_token, Option<client_id>)) только тогда, когда пользователь
/// успешно залогинился в свой аккаунт SoundCloud (появилась cookie `oauth_token`
/// или `vessel_sc_oauth_token`).
pub fn collect_soundcloud_auth(app: &AppHandle) -> anyhow::Result<(String, Option<String>)> {
    let window = app
        .get_webview_window("soundcloud_login")
        .ok_or_else(|| anyhow::anyhow!("окно входа SoundCloud не открыто"))?;

    let mut oauth_token: Option<String> = None;
    let mut client_id: Option<String> = None;
    let mut urls: Vec<Url> = Vec::new();

    if let Ok(current) = window.url() {
        urls.push(current);
    }
    for url_str in SOUNDCLOUD_COOKIE_DOMAINS {
        if let Ok(url) = Url::parse(url_str) {
            urls.push(url);
        }
    }

    let webview = window.as_ref();
    for url in urls {
        if let Ok(cookies) = webview.cookies_for_url(url) {
            for cookie in cookies {
                let name = cookie.name();
                let val = cookie.value().trim();
                if val.is_empty() {
                    continue;
                }
                if name == "oauth_token" || name == "vessel_sc_oauth_token" {
                    let clean = val
                        .trim_start_matches("OAuth ")
                        .trim_start_matches("oauth ")
                        .trim();
                    if clean.len() > 10 {
                        oauth_token = Some(clean.to_string());
                    }
                } else if name == "vessel_sc_client_id" {
                    client_id = Some(val.to_string());
                }
            }
        }
    }

    let token = oauth_token.ok_or_else(|| {
        anyhow::anyhow!("oauth_token ещё не получен — войдите в аккаунт SoundCloud")
    })?;
    Ok((token, client_id))
}

/// Читает cookie `vessel_sc_client_id` — её ставит JS-хук в окне входа,
/// перехватив client_id из запросов страницы к API.
#[allow(dead_code)]
pub fn collect_soundcloud_client_id(app: &AppHandle) -> anyhow::Result<String> {
    let window = app
        .get_webview_window("soundcloud_login")
        .ok_or_else(|| anyhow::anyhow!("окно входа SoundCloud не открыто"))?;

    let mut client_id: Option<String> = None;
    let mut urls: Vec<Url> = Vec::new();
    if let Ok(current) = window.url() {
        urls.push(current);
    }
    for url_str in SOUNDCLOUD_COOKIE_DOMAINS {
        if let Ok(url) = Url::parse(url_str) {
            urls.push(url);
        }
    }
    for url in urls {
        let webview = window.as_ref();
        if let Ok(cookies) = webview.cookies_for_url(url) {
            for cookie in cookies {
                if cookie.name() == "vessel_sc_client_id" {
                    let value = cookie.value().trim().to_string();
                    if !value.is_empty() {
                        client_id = Some(value);
                    }
                }
            }
        }
    }

    client_id.ok_or_else(|| anyhow::anyhow!("client_id ещё не перехвачен"))
}

