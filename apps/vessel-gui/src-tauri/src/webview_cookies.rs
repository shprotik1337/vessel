use std::{thread, time::Duration};

use tauri::{AppHandle, Manager};
use url::Url;

/// Домены, с которых собираем cookies для входа в YouTube.
const COOKIE_DOMAINS: &[&str] = &[
    "https://www.youtube.com/",
    "https://music.youtube.com/",
    "https://accounts.google.com/",
    "https://www.google.com/",
    "https://google.com/",
];

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

/// Собирает все cookies из WebView2 окна youtube_login, используя встроенный
/// Tauri API (работает даже с httpOnly cookies).
pub fn collect_youtube_cookies(app: &AppHandle) -> anyhow::Result<String> {
    let window = app
        .get_webview_window("youtube_login")
        .ok_or_else(|| anyhow::anyhow!("окно входа YouTube не открыто"))?;

    // Пробуем несколько раз: после редиректа логина cookies пишутся не мгновенно.
    let mut all_cookies: Vec<(String, String)> = Vec::new();
    let mut last_error: Option<String> = None;
    for attempt in 0..3 {
        all_cookies.clear();
        // Сначала текущий URL окна — там наверняка уже youtube.com после логина.
        let mut urls: Vec<Url> = Vec::new();
        if let Ok(current) = window.url() {
            urls.push(current);
        }
        for url_str in COOKIE_DOMAINS {
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
        if !all_cookies.is_empty() {
            break;
        }
        thread::sleep(Duration::from_millis(500 * (attempt + 1)));
    }

    if all_cookies.is_empty() {
        return Err(anyhow::anyhow!(
            "{} — войди в аккаунт и нажми «Забрать cookies» ещё раз",
            last_error.unwrap_or_else(|| "в окне нет cookies".to_string())
        ));
    }

    // Важные YouTube-куки. Если есть SID — аккаунт точно залогинен.
    let names: Vec<String> = all_cookies.iter().map(|(n, _)| n.clone()).collect();
    if !names.iter().any(|n| n == "SID" || n == "LOGIN_INFO") {
        return Err(anyhow::anyhow!(
            "найдены cookies, но без признаков входа (нет SID/LOGIN_INFO) — войди в аккаунт"
        ));
    }

    let cookie_string = all_cookies
        .into_iter()
        .map(|(n, v)| format!("{n}={v}"))
        .collect::<Vec<_>>()
        .join("; ");
    Ok(cookie_string)
}
