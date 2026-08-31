use std::{
    collections::BTreeMap,
    fs,
    path::{Path, PathBuf},
    sync::Mutex,
    time::{Duration, Instant},
};

use aes::{
    Aes128,
    cipher::{BlockEncrypt, KeyInit as AesKeyInit, generic_array::GenericArray},
};
use anyhow::{Context, Result, bail};
use async_trait::async_trait;
use hmac::{Hmac, Mac};
use reqwest::{
    Client,
    header::{AUTHORIZATION, COOKIE, HeaderValue, USER_AGENT},
};
use serde::Deserialize;
use serde_json::Value;
use sha1::Sha1;
use url::Url;

use crate::{
    model::{PlaybackCapability, PlaybackSource, ProviderKind, TrackRef},
    provider::{
        ArtistProfile, Attribution, CollectionItem, CollectionKind, ImportedPlaylist, MusicProvider,
        SearchPage,
    },
};

type HmacSha1 = Hmac<Sha1>;

const API: &str = "https://api.spotify.com/v1";
const PATHFINDER: &str = "https://api-partner.spotify.com/pathfinder/v2/query";
const SESSION_TOKEN_URL: &str = "https://open.spotify.com/api/token";
const SERVER_TIME_URL: &str = "https://open.spotify.com/api/server-time";
const CLIENT_TOKEN_URL: &str = "https://clienttoken.spotify.com/v1/clienttoken";
const TOTP_SECRETS_URL: &str = "https://git.gay/thereallo/totp-secrets/raw/branch/main/secrets/secretDict.json";
const DEVICE_AUTH_URL: &str = "https://accounts.spotify.com/oauth2/device/authorize";
const DEVICE_TOKEN_URL: &str = "https://accounts.spotify.com/api/token";
const DEVICE_RESOLVE_URL: &str = "https://accounts.spotify.com/pair/api/resolve";
const DEVICE_CLIENT_ID: &str = "65b708073fc0480ea92a077233ca87bd";
const DEVICE_FLOW_USER_AGENT: &str = "Spotify/128600502 Win32_x86_64/0 (PC desktop)";
const DEVICE_SCOPE: &str = "app-remote-control,playlist-modify,playlist-modify-private,playlist-modify-public,playlist-read,playlist-read-collaborative,playlist-read-private,streaming,transfer-auth-session,ugc-image-upload,user-follow-modify,user-follow-read,user-library-modify,user-library-read,user-modify,user-modify-playback-state,user-personalized,user-read-birthdate,user-read-currently-playing,user-read-email,user-read-play-history,user-read-playback-position,user-read-playback-state,user-read-private,user-read-recently-played,user-top-read";
const SPCLIENT: &str = "https://spclient.wg.spotify.com";
const WEB_URL: &str = "https://open.spotify.com";
const PAGE_SIZE: usize = 50;
const CLIENT_VERSION: &str = "1.2.87.27.ga2033a72";
const BROWSER_UA: &str = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36";

const SEARCH_TRACKS_HASH: &str = "5307479c18ff24aa1bd70691fdb0e77734bede8cce3bd7d43b6ff7314f52a6b8";
const SEARCH_ARTISTS_HASH: &str = "0e6f9020a66fe15b93b3bb5c7e6484d1d8cb3775963996eaede72bac4d97e909";
const SEARCH_ALBUMS_HASH: &str = "a71d2c993fc98e1c880093738a55a38b57e69cc4ce5a8c113e6c5920f9513ee2";
const SEARCH_PLAYLISTS_HASH: &str = "fc3a690182167dbad20ac7a03f842b97be4e9737710600874cb903f30112ad58";
const GET_TRACK_HASH: &str = "ae85b52abb74d20a4c331d4143d4772c95f34757bfa8c625474b912b9055b5c0";
const GET_ALBUM_HASH: &str = "8f4cd5650f9d80349dbe68684057476d8bf27a5c51687b2b1686099ab5631589";
const FETCH_PLAYLIST_HASH: &str = "19ff1327c29e99c208c86d7a9d8f1929cfdf3d3202a0ff4253c821f1901aa94d";
const ARTIST_OVERVIEW_HASH: &str = "4bc52527bb77a5f8bbb9afe491e9aa725698d29ab73bff58d49169ee29800167";
const ARTIST_DISCOGRAPHY_HASH: &str = "9380995a9d4663cbcb5113fef3c6aabf70ae6d407ba61793fd01e2a1dd6929b0";
/// Секрет SpotiCrypt: ключ расшифровки выводится из file_id, IV — сам file_id.
const SPOTICRYPT_SECRET: &[u8; 16] = b"g+1s?Fz?k=z?j1?0";
/// Первые 0xA7 байт расшифрованного файла — заголовок, его отбрасываем.
const AUDIO_HEADER_SKIP: usize = 0xA7;

pub struct SpotifyProvider {
    http: Client,
    /// Полная строка cookies: sp_dc=...; sp_key=...
    cookie: String,
    access_token: Mutex<Option<(String, String, Instant)>>,
    totp_state: Mutex<Option<(String, Vec<u8>)>>,
}

impl SpotifyProvider {
    pub fn new(value: impl AsRef<str>) -> Result<Self> {
        Self::with_proxy(value, None)
    }

    pub fn with_proxy(value: impl AsRef<str>, proxy: Option<&str>) -> Result<Self> {
        let value = value.as_ref().trim();
        let cookie = normalize_cookie_string(value);
        if cookie.is_empty() {
            bail!("для Spotify нужна cookie sp_dc")
        }
        if !cookie.to_ascii_lowercase().contains("sp_dc=") {
            bail!("в строке нет cookie sp_dc — вставь хотя бы sp_dc")
        }
        // Кладём sp_dc/sp_key в cookie jar, чтобы reqwest слал их автоматически
        // на все поддомены spotify.com (нужно для device flow на accounts.spotify.com).
        let jar = std::sync::Arc::new(reqwest::cookie::Jar::default());
        for url in [
            "https://open.spotify.com/",
            "https://accounts.spotify.com/",
            "https://api.spotify.com/",
            "https://spclient.wg.spotify.com/",
        ] {
            if let Ok(parsed) = Url::parse(url) {
                jar.add_cookie_str(&format!("{cookie}; Domain=.spotify.com; Path=/"), &parsed);
            }
        }
        let mut builder = Client::builder()
            .user_agent(BROWSER_UA)
            .cookie_provider(jar.clone());
        if let Some(proxy) = proxy
            .map(str::trim)
            .filter(|proxy| !proxy.is_empty())
        {
            builder = builder
                .proxy(reqwest::Proxy::all(proxy).context("не удалось разобрать прокси Spotify")?);
        }
        let http = builder.build().context("не удалось создать HTTP-клиент Spotify")?;
        Ok(Self {
            http,
            cookie,
            access_token: Mutex::new(None),
            totp_state: Mutex::new(None),
        })
    }

    /// Получает (и кэширует) access_token через sp_dc.
    async fn access_token(&self) -> Result<(String, String)> {
        if let Some((token, client_token, fetched_at)) = self.access_token.lock().unwrap().as_ref()
            && fetched_at.elapsed() < Duration::from_secs(25 * 60)
        {
            return Ok((token.clone(), client_token.clone()));
        }
        let (token, client_token) = self.fetch_access_token().await?;
        *self.access_token.lock().unwrap() = Some((
            token.clone(),
            client_token.clone(),
            Instant::now(),
        ));
        Ok((token, client_token))
    }

    async fn fetch_access_token(&self) -> Result<(String, String)> {
        let (totp_secret, totp_ver) = self.get_totp_state().await?;
        let server_time = self.get_server_time().await?;
        let totp = generate_totp(&totp_secret, server_time);

        let url = Url::parse_with_params(
            SESSION_TOKEN_URL,
            &[
                ("reason", "init"),
                ("productType", "web-player"),
                ("totp", &totp),
                ("totpServer", &totp),
                ("totpVer", &totp_ver),
            ],
        )?;
        let response = self
            .http
            .get(url)
            .headers(browser_headers())
            .header(COOKIE, &self.cookie)
            .send()
            .await
            .context("Spotify не ответил на запрос токена")?;
        if !response.status().is_success() {
            let status = response.status();
            let body = response.text().await.unwrap_or_default();
            bail!(
                "Spotify отклонил запрос токена ({status}): {body} — проверь, что cookie sp_dc свежая"
            );
        }
        let value: Value = response
            .json()
            .await
            .context("Spotify вернул непонятный ответ токена")?;
        let access_token = value
            .get("accessToken")
            .and_then(Value::as_str)
            .context("sp_dc не авторизован: Spotify не выдал accessToken")?
            .trim()
            .to_string();
        if access_token.is_empty() {
            bail!("sp_dc не авторизован: пустой accessToken")
        }
        let client_id = value
            .get("clientId")
            .and_then(Value::as_str)
            .unwrap_or("65b708073fc0480ea92a077233ca87bd");

        // Client token нужен только для аудио (spclient). Если Spotify его не
        // отдал — не проваливаем подключение, просто работаем без него.
        let client_token = match self.get_client_token(client_id).await {
            Ok(token) => token,
            Err(error) => {
                eprintln!("[spotify] client token недоступен: {error:#}");
                String::new()
            }
        };

        Ok((access_token, client_token))
    }

    async fn get_totp_state(&self) -> Result<(Vec<u8>, String)> {
        if let Some((ver, secret)) = self.totp_state.lock().unwrap().as_ref() {
            return Ok((secret.clone(), ver.clone()));
        }
        let (secret, ver) = fetch_totp_secret(&self.http).await?;
        *self.totp_state.lock().unwrap() = Some((ver.clone(), secret.clone()));
        Ok((secret, ver))
    }

    async fn get_server_time(&self) -> Result<i64> {
        let response: Value = self
            .http
            .get(SERVER_TIME_URL)
            .headers(browser_headers())
            .send()
            .await
            .context("не удалось получить время сервера Spotify")?
            .error_for_status()
            .context("Spotify не дал время сервера")?
            .json()
            .await
            .context("Spotify вернул непонятное время")?;
        let seconds = response
            .get("serverTime")
            .and_then(Value::as_i64)
            .context("Spotify не вернул serverTime")?;
        // generate() ждёт миллисекунды
        Ok(seconds.saturating_mul(1000))
    }

    /// Получает OAuth-токен через device flow (работает с api.spotify.com/v1).
    async fn device_flow_token(&self) -> Result<String> {
        let auth = self
            .http
            .post(DEVICE_AUTH_URL)
            .form(&[
                ("client_id", DEVICE_CLIENT_ID),
                ("scope", DEVICE_SCOPE),
            ])
            .header(USER_AGENT, HeaderValue::from_static(DEVICE_FLOW_USER_AGENT))
            .send()
            .await
            .context("device auth request failed")?
            .error_for_status()
            .context("device auth rejected")?
            .json::<Value>()
            .await
            .context("device auth json")?;
        let device_code = auth
            .get("device_code")
            .and_then(Value::as_str)
            .context("no device_code")?
            .to_string();
        let user_code = auth
            .get("user_code")
            .and_then(Value::as_str)
            .context("no user_code")?
            .to_string();
        let verify_url = auth
            .get("verification_uri_complete")
            .and_then(Value::as_str)
            .context("no verification_uri")?
            .to_string();
        let verify_url = Url::parse(&verify_url)?;

        let verify_resp = self
            .http
            .get(verify_url)
            .header(COOKIE, &self.cookie)
            .send()
            .await
            .context("verify page")?
            .error_for_status()
            .context("verify page rejected")?;
        let final_url = verify_resp.url().clone();
        let flow_ctx_full = final_url
            .query_pairs()
            .find(|(k, _)| k == "flow_ctx")
            .map(|(_, v)| v.into_owned())
            .context("no flow_ctx")?;
        let flow_ctx = flow_ctx_full.split(':').next().unwrap_or(&flow_ctx_full).to_string();

        let html = verify_resp.text().await.context("verify page text")?;
        let csrf = extract_csrf(&html).context("no csrf token")?;
        let current_ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
            .to_string();
        let flow_ctx_param = format!("{flow_ctx}:{current_ts}");
        let referer_url = final_url.to_string();

        self.http
            .post(DEVICE_RESOLVE_URL)
            .query(&[("flow_ctx", &flow_ctx_param)])
            .json(&serde_json::json!({"code": user_code}))
            .header("x-csrf-token", &csrf)
            .header("referer", &referer_url)
            .header("origin", "https://accounts.spotify.com")
            .send()
            .await
            .context("resolve request")?
            .error_for_status()
            .context("resolve rejected")?;

        tokio::time::sleep(Duration::from_secs(2)).await;
        let token = self
            .http
            .post(DEVICE_TOKEN_URL)
            .form(&[
                ("client_id", DEVICE_CLIENT_ID),
                ("device_code", &device_code),
                ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
            ])
            .send()
            .await
            .context("token exchange")?
            .error_for_status()
            .context("token exchange rejected")?
            .json::<Value>()
            .await
            .context("token json")?;
        token
            .get("access_token")
            .and_then(Value::as_str)
            .map(str::to_string)
            .context("no access_token in device flow")
    }

    async fn get_client_token(&self, client_id: &str) -> Result<String> {        let payload = serde_json::json!({
            "client_data": {
                "client_version": CLIENT_VERSION,
                "client_id": client_id,
                "js_sdk_data": {}
            }
        });
        let body = serde_json::to_string(&payload).context("client token json")?;
        let headers = client_token_headers(&self.cookie);
        let response = self
            .http
            .post(CLIENT_TOKEN_URL)
            .headers(headers)
            .body(body)
            .send()
            .await
            .context("Spotify не ответил на запрос client token")?;
        let status = response.status();
        let body_text = response.text().await.unwrap_or_default();
        if !status.is_success() || body_text.is_empty() {
            bail!("Spotify не отдал client token ({status}): {body_text}")
        }
        let value: Value = serde_json::from_str(&body_text)
            .with_context(|| format!("Spotify вернул непонятный client token: {body_text}"))?;
        value
            .pointer("/granted_token/token")
            .and_then(Value::as_str)
            .map(str::to_string)
            .context("Spotify не вернул granted_token в client token")
    }

    async fn get_json<T: serde::de::DeserializeOwned>(&self, url: Url) -> Result<T> {
        let (token, client_token) = self.access_token().await?;
        let response = self
            .http
            .get(url)
            .header(AUTHORIZATION, format!("Bearer {token}"))
            .header("client-token", &client_token)
            .header(COOKIE, &self.cookie)
            .send()
            .await
            .context("Spotify не ответил")?
            .error_for_status()
            .context("Spotify отклонил запрос")?;
        response
            .json()
            .await
            .context("Spotify вернул непонятный JSON")
    }

    /// Запрос к внутреннему GraphQL Pathfinder API (работает с web-player токеном).
    async fn pathfinder(
        &self,
        operation: &str,
        hash: &str,
        variables: Value,
    ) -> Result<Value> {
        let (token, client_token) = self.access_token().await?;
        let payload = serde_json::json!({
            "operationName": operation,
            "variables": variables,
            "extensions": {
                "persistedQuery": { "version": 1, "sha256Hash": hash }
            }
        });
        let response = self
            .http
            .post(PATHFINDER)
            .headers(browser_headers())
            .header(AUTHORIZATION, format!("Bearer {token}"))
            .header("client-token", &client_token)
            .json(&payload)
            .send()
            .await
            .context("Pathfinder не ответил")?;
        let status = response.status();
        let text = response.text().await.unwrap_or_default();
        if !status.is_success() {
            bail!("Pathfinder отклонил запрос ({status}): {text}")
        }
        let value: Value = serde_json::from_str(&text)
            .with_context(|| format!("Pathfinder вернул непонятный JSON: {text}"))?;
        if let Some(errors) = value.get("errors") {
            bail!("Pathfinder: {errors}")
        }
        Ok(value)
    }

    /// Полный трек: скачивает зашифрованный файл и расшифровывает его.
    async fn prepare_full_track(&self, track_id: &str) -> Result<PathBuf> {
        let cached_mp3 = spotify_cache_dir().join(format!("{track_id}.mp3"));
        let cached_m4a = spotify_cache_dir().join(format!("{track_id}.m4a"));
        if cached_mp3
            .metadata()
            .is_ok_and(|metadata| metadata.len() > 0)
        {
            return Ok(cached_mp3);
        }
        if cached_m4a
            .metadata()
            .is_ok_and(|metadata| metadata.len() > 0)
        {
            return Ok(cached_m4a);
        }

        let (token, client_token) = self.access_token().await?;
        let spclient_headers = |req: reqwest::RequestBuilder| {
            req.header(AUTHORIZATION, format!("Bearer {token}"))
                .header("client-token", &client_token)
                .header(COOKIE, &self.cookie)
        };

        // 1. track-playback: получаем file_id из манифеста
        let playback_url = Url::parse(&format!(
            "https://gue1-spclient.spotify.com/track-playback/v1/media/spotify:track:{track_id}?manifestFileFormat=file_ids_mp4"
        ))?;
        let playback: Value = spclient_headers(self.http.get(playback_url))
            .send()
            .await
            .context("Spotify track-playback не ответил")?
            .error_for_status()
            .context("Spotify track-playback отклонил запрос")?
            .json()
            .await
            .context("Spotify track-playback вернул непонятный JSON")?;

        // Выбираем лучший аудиофайл (наибольший битрейт)
        let manifest = playback
            .pointer(&format!("/media/spotify:track:{track_id}/item/manifest/file_ids_mp4"))
            .or_else(|| {
                playback
                    .get("media")
                    .and_then(|m| m.as_object())
                    .and_then(|map| map.values().next())
                    .and_then(|item| item.get("item"))
                    .and_then(|i| i.get("manifest"))
                    .and_then(|m| m.get("file_ids_mp4"))
            })
            .and_then(Value::as_array)
            .context("track-playback не отдал манифест")?;
        let entry = manifest
            .iter()
            .filter(|entry| {
                entry
                    .get("track_type")
                    .and_then(Value::as_str)
                    .map(|t| t == "AUDIO")
                    .unwrap_or(false)
            })
            .max_by_key(|entry| entry.get("bitrate").and_then(Value::as_u64).unwrap_or(0))
            .context("в манифесте нет аудиофайлов")?;
        let file_id = entry
            .get("file_id")
            .and_then(Value::as_str)
            .context("у аудиофайла нет file_id")?
            .to_string();
        let format_id = entry
            .get("format")
            .and_then(Value::as_str)
            .unwrap_or("11");

        // 2. storage-resolve: получаем CDN URL
        let resolve_url = Url::parse(&format!(
            "https://gue1-spclient.spotify.com/storage-resolve/v2/files/audio/interactive/{format_id}/{file_id}?version=10000000&product=9&platform=39&alt=json"
        ))?;
        let resolved: Value = spclient_headers(self.http.get(resolve_url))
            .send()
            .await
            .context("Spotify storage-resolve не ответил")?
            .error_for_status()
            .context("Spotify storage-resolve отклонил запрос")?
            .json()
            .await
            .context("Spotify storage-resolve вернул непонятный JSON")?;
        let cdn_url = resolved
            .get("cdnurl")
            .and_then(Value::as_array)
            .and_then(|urls| urls.iter().find(|u| u.as_str().map(|s| !s.contains("scdn.co/audio/")).unwrap_or(false)))
            .or_else(|| {
                resolved
                    .get("cdnurl")
                    .and_then(Value::as_array)
                    .and_then(|urls| urls.first())
            })
            .and_then(Value::as_str)
            .context("storage-resolve не отдал CDN URL")?;
        let media_url = Url::parse(cdn_url).context("Spotify отдал битую CDN ссылку")?;

        // 3. Скачиваем аудио (формат 11 = MP4/AAC, расшифровка не нужна)
        let bytes = self
            .http
            .get(media_url)
            .header(USER_AGENT, HeaderValue::from_static(BROWSER_UA))
            .send()
            .await
            .context("не удалось скачать аудио Spotify")?
            .error_for_status()
            .context("Spotify CDN отклонил запрос аудио")?
            .bytes()
            .await
            .context("не удалось прочитать аудио Spotify")?;
        if bytes.is_empty() {
            bail!("Spotify CDN вернул пустое аудио")
        }
        let extension = if format_id == "11" { "m4a" } else { "m4a" };
        let path = spotify_cache_dir().join(format!("{track_id}.{extension}"));
        write_cache(&path, &bytes)?;
        Ok(path)
    }
}

#[async_trait]
impl MusicProvider for SpotifyProvider {
    fn kind(&self) -> ProviderKind {
        ProviderKind::Spotify
    }

    fn attribution(&self) -> Attribution {
        Attribution {
            label: "Spotify".to_string(),
            url: Url::parse(WEB_URL).expect("статический адрес Spotify"),
        }
    }

    async fn search(&self, query: &str, cursor: Option<&str>) -> Result<SearchPage> {
        let query = query.trim();
        if query.is_empty() {
            return Ok(SearchPage::default());
        }
        let offset = cursor
            .and_then(|value| value.parse().ok())
            .unwrap_or(0usize);
        let variables = serde_json::json!({
            "searchTerm": query,
            "offset": offset,
            "limit": PAGE_SIZE,
            "numberOfTopResults": 0,
            "includeAudiobooks": false,
            "includePreReleases": true,
        });
        let value = self
            .pathfinder("searchTracks", SEARCH_TRACKS_HASH, variables)
            .await?;
        let tracks = extract_pathfinder_tracks(&value);
        let next_cursor = if tracks.len() >= PAGE_SIZE {
            Some((offset + tracks.len()).to_string())
        } else {
            None
        };
        Ok(SearchPage { tracks, next_cursor })
    }

    async fn search_collections(
        &self,
        query: &str,
        kind: CollectionKind,
    ) -> Result<Vec<CollectionItem>> {
        let query = query.trim();
        if query.is_empty() {
            return Ok(Vec::new());
        }
        let (operation, hash) = match kind {
            CollectionKind::Playlist => ("searchPlaylists", SEARCH_PLAYLISTS_HASH),
            CollectionKind::Album => ("searchAlbums", SEARCH_ALBUMS_HASH),
            CollectionKind::Artist => ("searchArtists", SEARCH_ARTISTS_HASH),
        };
        let variables = serde_json::json!({
            "searchTerm": query,
            "offset": 0,
            "limit": 30,
            "numberOfTopResults": 0,
            "includeAudiobooks": false,
            "includePreReleases": true,
        });
        let value = self.pathfinder(operation, hash, variables).await?;
        let items = match kind {
            CollectionKind::Playlist => extract_pathfinder_playlists(&value),
            CollectionKind::Album => extract_pathfinder_albums(&value),
            CollectionKind::Artist => extract_pathfinder_artists(&value),
        };
        Ok(items)
    }

    async fn artist_profile(&self, artist_id: &str) -> Result<ArtistProfile> {
        let variables = serde_json::json!({
            "uri": format!("spotify:artist:{artist_id}"),
            "locale": "",
        });
        let value = self
            .pathfinder("queryArtistOverview", ARTIST_OVERVIEW_HASH, variables)
            .await?;
        let artist = value
            .pointer("/data/artistUnion")
            .context("Pathfinder не вернул artistUnion")?;
        let name = jstr(artist, &["profile", "name"])
            .unwrap_or("Неизвестный артист")
            .to_string();
        let avatar_url = artist
            .get("visuals")
            .and_then(|v| v.get("avatarImage"))
            .and_then(|a| a.get("sources"))
            .and_then(Value::as_array)
            .and_then(|sources| sources.iter().last())
            .and_then(|s| s.get("url"))
            .and_then(Value::as_str)
            .and_then(|u| Url::parse(u).ok());
        let popular_tracks: Vec<TrackRef> = artist
            .get("discography")
            .and_then(|d| d.get("topTracks"))
            .and_then(|t| t.get("items"))
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
            .iter()
            .filter_map(|wrapper| {
                wrapper
                    .get("track")
                    .and_then(|t| map_pf_track(t))
            })
            .collect();
        let releases: Vec<CollectionItem> = artist
            .get("discography")
            .and_then(|d| d.get("all"))
            .and_then(|a| a.get("items"))
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default()
            .iter()
            .filter_map(|wrapper| {
                let item = wrapper.get("releasedItem").and_then(|r| r.get("data")).unwrap_or(&wrapper);
                let uri = jstr(item, &["uri"])?;
                let id = pf_bare_id(uri)?;
                let album_title = jstr(item, &["name"]).unwrap_or("Без названия").to_string();
                let artwork_url = item
                    .get("coverArt")
                    .and_then(|c| c.get("sources"))
                    .and_then(Value::as_array)
                    .and_then(|sources| sources.iter().last())
                    .and_then(|s| s.get("url"))
                    .and_then(Value::as_str)
                    .and_then(|u| Url::parse(u).ok());
                let date = jstr(item, &["date", "isoString"]).unwrap_or_default();
                let record = match jstr(item, &["type"]) {
                    Some("SINGLE") => "Сингл",
                    Some("EP") => "EP",
                    _ => "Альбом",
                };
                let subtitle = if date.is_empty() {
                    record.to_string()
                } else {
                    format!("{date} · {record}")
                };
                let web_url = Url::parse(&format!("{WEB_URL}/album/{id}")).expect("album url");
                Some(CollectionItem {
                    kind: CollectionKind::Album,
                    provider: ProviderKind::Spotify,
                    id,
                    title: album_title,
                    subtitle,
                    artwork_url,
                    web_url,
                    track_count: 0,
                })
            })
            .collect();
        Ok(ArtistProfile {
            name,
            avatar_url,
            popular_tracks,
            releases,
        })
    }

    async fn artist_all_tracks(&self, artist_id: &str) -> Result<Vec<TrackRef>> {
        let mut seen = std::collections::HashSet::new();
        let mut tracks = Vec::new();
        let mut offset = 0usize;
        loop {
            let variables = serde_json::json!({
                "uri": format!("spotify:artist:{artist_id}"),
                "offset": offset,
                "limit": 50,
            });
            let value = self
                .pathfinder(
                    "queryArtistDiscographyAll",
                    ARTIST_DISCOGRAPHY_HASH,
                    variables,
                )
                .await?;
            let items = value
                .pointer("/data/artistUnion/discography/all/items")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            let loaded = items.len();
            for wrapper in &items {
                let item = wrapper
                    .get("releasedItem")
                    .and_then(|r| r.get("data"))
                    .unwrap_or(wrapper);
                // Проходим треки альбома через getAlbum
                if let Some(uri) = jstr(item, &["uri"])
                    && let Some(id) = pf_bare_id(uri)
                {
                    let album_vars = serde_json::json!({
                        "uri": format!("spotify:album:{id}"),
                        "locale": "",
                        "offset": 0,
                        "limit": 50,
                    });
                    if let Ok(album_value) = self
                        .pathfinder("getAlbum", GET_ALBUM_HASH, album_vars)
                        .await
                    {
                        let album_tracks = extract_album_tracks(&album_value);
                        for track in album_tracks {
                            if seen.insert(track.provider_key()) {
                                tracks.push(track);
                            }
                        }
                    }
                    tokio::time::sleep(Duration::from_millis(40)).await;
                }
            }
            if loaded < 50 {
                break;
            }
            offset += loaded;
        }
        Ok(tracks)
    }

    async fn import_playlist(&self, source: &Url) -> Result<ImportedPlaylist> {
        if let Some(id) = entity_id(source, "album") {
            return self.import_album(&id, source).await;
        }
        let id =
            entity_id(source, "playlist").context("не удалось определить ID плейлиста Spotify")?;
        let variables = serde_json::json!({
            "uri": format!("spotify:playlist:{id}"),
            "offset": 0,
            "limit": 50,
        });
        let value = self
            .pathfinder("fetchPlaylist", FETCH_PLAYLIST_HASH, variables)
            .await?;
        let playlist = value
            .pointer("/data/playlistV2")
            .context("Pathfinder не вернул playlistV2")?;
        let title = jstr(playlist, &["name"]).unwrap_or("Spotify плейлист").to_string();
        let owner = playlist
            .get("ownerV2")
            .and_then(|o| o.get("data"))
            .and_then(|d| d.get("name"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let cover_url = playlist
            .get("images")
            .and_then(|i| i.get("items"))
            .and_then(Value::as_array)
            .and_then(|items| items.iter().last())
            .and_then(|img| img.get("sources"))
            .and_then(Value::as_array)
            .and_then(|sources| sources.iter().last())
            .and_then(|s| s.get("url"))
            .and_then(Value::as_str)
            .and_then(|u| Url::parse(u).ok());
        let mut tracks = extract_playlist_tracks(&value);
        // Догружаем остальные страницы плейлиста
        let mut offset = 50usize;
        loop {
            let variables = serde_json::json!({
                "uri": format!("spotify:playlist:{id}"),
                "offset": offset,
                "limit": 50,
            });
            let Ok(next_value) = self
                .pathfinder("fetchPlaylist", FETCH_PLAYLIST_HASH, variables)
                .await
            else {
                break;
            };
            let more = extract_playlist_tracks(&next_value);
            let loaded = more.len();
            tracks.extend(more);
            if loaded < 50 {
                break;
            }
            offset += loaded;
        }
        Ok(ImportedPlaylist {
            title,
            description: owner,
            source_url: source.clone(),
            cover_url,
            tracks,
        })
    }

    async fn related(&self, track: &TrackRef, limit: usize) -> Result<Vec<TrackRef>> {
        let uri = format!("spotify:track:{}", track.id);
        let value = self
            .pathfinder(
                "internalLinkRecommenderTrack",
                "eda0a1e9140af4114340bf3098980172dfd1003b65cfc980c36ab238dbfcef84",
                serde_json::json!({ "uri": uri }),
            )
            .await?;
        let items = value
            .pointer("/data/trackUnion/relatedContent/tracks/items")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        Ok(items
            .into_iter()
            .filter_map(|wrapper| {
                let item = wrapper.get("track").and_then(|t| t.get("data")).unwrap_or(&wrapper);
                map_pf_track(item)
            })
            .take(limit)
            .collect())
    }

    async fn playback_source(&self, track: &TrackRef) -> Result<PlaybackSource> {
        // Если трек уже скачан в общий кэш — играем из него
        if let Some(source) = crate::provider::cache::cached_source(track) {
            return Ok(source);
        }
        let path = self.prepare_full_track(&track.id).await?;
        full_cache_source(&path)
    }
}

impl SpotifyProvider {
    async fn import_album(&self, id: &str, source: &Url) -> Result<ImportedPlaylist> {
        let variables = serde_json::json!({
            "uri": format!("spotify:album:{id}"),
            "locale": "",
            "offset": 0,
            "limit": 50,
        });
        let value = self
            .pathfinder("getAlbum", GET_ALBUM_HASH, variables)
            .await?;
        let album = value
            .pointer("/data/albumUnion")
            .context("Pathfinder не вернул albumUnion")?;
        let title = jstr(album, &["name"]).unwrap_or("Spotify альбом").to_string();
        let artist = album
            .get("artists")
            .and_then(|a| a.get("items"))
            .and_then(Value::as_array)
            .and_then(|items| items.first())
            .and_then(|artist| artist.get("profile"))
            .and_then(|p| p.get("name"))
            .and_then(Value::as_str)
            .unwrap_or_default()
            .to_string();
        let cover_url = album
            .get("coverArt")
            .and_then(|c| c.get("sources"))
            .and_then(Value::as_array)
            .and_then(|sources| sources.iter().last())
            .and_then(|s| s.get("url"))
            .and_then(Value::as_str)
            .and_then(|u| Url::parse(u).ok());
        let mut tracks = extract_album_tracks(&value);
        // Догружаем остальные треки альбома
        let mut offset = 50usize;
        loop {
            let variables = serde_json::json!({
                "uri": format!("spotify:album:{id}"),
                "locale": "",
                "offset": offset,
                "limit": 50,
            });
            let Ok(next_value) = self
                .pathfinder("getAlbum", GET_ALBUM_HASH, variables)
                .await
            else {
                break;
            };
            let more = extract_album_tracks(&next_value);
            let loaded = more.len();
            tracks.extend(more);
            if loaded < 50 {
                break;
            }
            offset += loaded;
        }
        Ok(ImportedPlaylist {
            title,
            description: artist,
            source_url: source.clone(),
            cover_url,
            tracks,
        })
    }

    /// Проверяет, что sp_dc действительно авторизован.
    pub async fn probe(&self) -> Result<()> {
        let (token, _) = self.fetch_access_token().await?;
        if token.is_empty() {
            bail!("Spotify sp_dc не авторизован — проверь токен")
        }
        Ok(())
    }
}

/// Скачивает TOTP-секреты и выбирает самую свежую версию.
async fn fetch_totp_secret(http: &Client) -> Result<(Vec<u8>, String)> {
    let response = http
        .get(TOTP_SECRETS_URL)
        .send()
        .await
        .context("не удалось получить TOTP-секреты Spotify")?
        .error_for_status()
        .context("TOTP-секреты Spotify недоступны")?
        .json::<Value>()
        .await
        .context("TOTP-секреты Spotify повреждены")?;
    let map = response
        .as_object()
        .context("TOTP-секреты Spotify не объект")?;
    let version = map
        .keys()
        .filter_map(|key| key.parse::<i64>().ok())
        .max()
        .context("нет TOTP-версий")?
        .to_string();
    let ciphertext = map
        .get(&version)
        .and_then(Value::as_array)
        .context("нет TOTP-секрета для свежей версии")?
        .iter()
        .filter_map(Value::as_u64)
        .map(|value| value as u8)
        .collect::<Vec<u8>>();
    let secret = derive_totp_secret(&ciphertext);
    Ok((secret, version))
}

/// Тот же derive, что в Dotify: byte ^ ((i % 33) + 9), затем ascii-байты строки.
fn derive_totp_secret(ciphertext: &[u8]) -> Vec<u8> {
    let mut out = String::new();
    for (i, byte) in ciphertext.iter().enumerate() {
        let value = byte ^ ((i % 33) as u8 + 9);
        out.push_str(&value.to_string());
    }
    out.into_bytes()
}

/// RFC 6238 TOTP: HMAC-SHA1, 6 цифр, период 30 секунд, counter = timestamp(мс)/1000/30.
fn generate_totp(secret: &[u8], timestamp_ms: i64) -> String {
    let counter = timestamp_ms / 1000 / 30;
    let counter_bytes = counter.to_be_bytes();
    let mut mac = <HmacSha1 as Mac>::new_from_slice(secret).expect("HMAC key любого размера");
    mac.update(&counter_bytes);
    let digest = mac.finalize().into_bytes();

    let offset = (digest[19] & 0x0F) as usize;
    let binary = ((digest[offset] & 0x7F) as u32) << 24
        | ((digest[offset + 1] as u32) << 16)
        | ((digest[offset + 2] as u32) << 8)
        | (digest[offset + 3] as u32);
    let code = binary % 1_000_000;
    format!("{code:06}")
}

/// Достаёт треки из ответа getAlbum: data.albumUnion.discs.items[].items[].item
fn extract_album_tracks(value: &Value) -> Vec<TrackRef> {
    let discs = value
        .pointer("/data/albumUnion/discs/items")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut out = Vec::new();
    for disc in discs {
        let items = disc
            .get("items")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        for entry in items {
            let track = entry
                .get("item")
                .and_then(|t| t.get("data"))
                .unwrap_or(&entry);
            if let Some(t) = map_pf_track(track) {
                out.push(t);
            }
        }
    }
    out
}

/// Достаёт треки из ответа fetchPlaylist: data.playlistV2.content.items[].itemV2.data
fn extract_playlist_tracks(value: &Value) -> Vec<TrackRef> {
    let items = value
        .pointer("/data/playlistV2/content/items")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut out = Vec::new();
    for entry in items {
        let track = entry
            .get("itemV2")
            .and_then(|t| t.get("data"))
            .unwrap_or(&entry);
        if let Some(t) = map_pf_track(track) {
            out.push(t);
        }
    }
    out
}

fn normalize_cookie_string(value: &str) -> String {
    let value = value.trim().trim_matches(['\'', '"']).trim();
    let after_prefix = value
        .split_once(':')
        .filter(|(prefix, _)| prefix.trim().eq_ignore_ascii_case("cookie"))
        .map_or(value, |(_, rest)| rest.trim());
    let mut cookies = Vec::new();
    for part in after_prefix.split(';') {
        let part = part.trim();
        if let Some((name, val)) = part.split_once('=') {
            let name = name.trim().to_ascii_lowercase();
            if name == "sp_dc" || name == "sp_key" {
                cookies.push(format!("{name}={}", val.trim().trim_matches(['\'', '"'])));
            }
        }
    }
    if cookies.is_empty() {
        let cleaned = after_prefix.trim_matches(['\'', '"']).trim();
        if !cleaned.is_empty() {
            return format!("sp_dc={cleaned}");
        }
    }
    cookies.join("; ")
}

fn jstr<'a>(value: &'a Value, path: &[&str]) -> Option<&'a str> {
    path.iter()
        .try_fold(value, |current, key| current.get(*key))
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
}

fn jarray(value: &Value, path: &[&str]) -> Vec<Value> {
    let mut current = value;
    for key in path {
        match current.get(*key) {
            Some(next) => current = next,
            None => return Vec::new(),
        }
    }
    current.as_array().cloned().unwrap_or_default()
}

fn pf_bare_id(uri: &str) -> Option<String> {
    uri.rsplit(':').next().filter(|s| !s.is_empty()).map(str::to_string)
}

/// Достаёт треки из ответа searchTracks: data.searchV2.tracksV2.items[].item.data
fn extract_pathfinder_tracks(value: &Value) -> Vec<TrackRef> {
    let Some(data) = value.get("data") else { return Vec::new() };
    let Some(search_v2) = data.get("searchV2") else { return Vec::new() };
    let Some(tracks_v2) = search_v2.get("tracksV2") else { return Vec::new() };
    let items = tracks_v2.get("items").and_then(Value::as_array).cloned().unwrap_or_default();
    let mut out = Vec::new();
    for wrapper in items {
        let item = wrapper.get("item").and_then(|v| v.get("data")).unwrap_or(&wrapper);
        if let Some(track) = map_pf_track(item) {
            out.push(track);
        }
    }
    out
}

fn map_pf_track(item: &Value) -> Option<TrackRef> {
    let uri = jstr(item, &["uri"])?;
    let id = pf_bare_id(uri)?;
    let title = jstr(item, &["name"]).unwrap_or("Без названия").to_string();
    let artists: Vec<String> = item
        .get("artists")
        .and_then(|a| a.get("items"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default()
        .iter()
        .filter_map(|artist| {
            artist
                .get("profile")
                .and_then(|p| p.get("name"))
                .and_then(Value::as_str)
                .map(str::to_string)
        })
        .collect();
    let duration_ms = item
        .get("duration")
        .and_then(|d| d.get("totalMilliseconds"))
        .and_then(Value::as_u64);
    let artwork_url = item
        .get("albumOfTrack")
        .and_then(|a| a.get("coverArt"))
        .and_then(|c| c.get("sources"))
        .and_then(Value::as_array)
        .and_then(|sources| sources.iter().last())
        .and_then(|source| source.get("url"))
        .and_then(Value::as_str)
        .and_then(|u| Url::parse(u).ok());
    let explicit = item
        .get("contentRating")
        .and_then(|c| c.get("label"))
        .and_then(Value::as_str)
        .map(|label| label.eq_ignore_ascii_case("explicit"))
        .unwrap_or(false);
    let web_url = Url::parse(&format!("{WEB_URL}/track/{id}")).expect("track url");
    Some(TrackRef {
        provider: ProviderKind::Spotify,
        id,
        title,
        artists,
        duration_ms,
        artwork_url,
        web_url,
        capability: PlaybackCapability::Full,
        genres: Vec::new(),
        explicit,
        drm: true,
    })
}

/// Достаёт артистов: data.searchV2.artists.items[].data
fn extract_pathfinder_artists(value: &Value) -> Vec<CollectionItem> {
    let items = jarray(
        value,
        &["data", "searchV2", "artists", "items"],
    );
    items
        .into_iter()
        .filter_map(|wrapper| {
            let item = wrapper.get("data").unwrap_or(&wrapper);
            let uri = jstr(item, &["uri"])?;
            let id = pf_bare_id(uri)?;
            let title = jstr(item, &["name"])
                .or_else(|| jstr(item, &["profile", "name"]))
                .unwrap_or("Неизвестный артист")
                .to_string();
            let artwork_url = item
                .get("visuals")
                .and_then(|v| v.get("avatarImage"))
                .and_then(|a| a.get("sources"))
                .and_then(Value::as_array)
                .and_then(|sources| sources.iter().last())
                .and_then(|s| s.get("url"))
                .and_then(Value::as_str)
                .and_then(|u| Url::parse(u).ok());
            let web_url = Url::parse(&format!("{WEB_URL}/artist/{id}")).expect("artist url");
            Some(CollectionItem {
                kind: CollectionKind::Artist,
                provider: ProviderKind::Spotify,
                id,
                title,
                subtitle: "Артист".to_string(),
                artwork_url,
                web_url,
                track_count: 0,
            })
        })
        .collect()
}

/// Достаёт альбомы: data.searchV2.albumsV2.items[].data
fn extract_pathfinder_albums(value: &Value) -> Vec<CollectionItem> {
    let items = jarray(
        value,
        &["data", "searchV2", "albumsV2", "items"],
    );
    items
        .into_iter()
        .filter_map(|wrapper| {
            let item = wrapper.get("data").unwrap_or(&wrapper);
            let uri = jstr(item, &["uri"])?;
            let id = pf_bare_id(uri)?;
            let title = jstr(item, &["name"]).unwrap_or("Без названия").to_string();
            let artists: String = item
                .get("artists")
                .and_then(|a| a.get("items"))
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default()
                .iter()
                .filter_map(|artist| {
                    artist
                        .get("profile")
                        .and_then(|p| p.get("name"))
                        .and_then(Value::as_str)
                })
                .collect::<Vec<_>>()
                .join(", ");
            let artwork_url = item
                .get("coverArt")
                .and_then(|c| c.get("sources"))
                .and_then(Value::as_array)
                .and_then(|sources| sources.iter().last())
                .and_then(|s| s.get("url"))
                .and_then(Value::as_str)
                .and_then(|u| Url::parse(u).ok());
            let date = jstr(item, &["date", "isoString"]).unwrap_or_default();
            let subtitle = if artists.is_empty() {
                if date.is_empty() { "Альбом".to_string() } else { format!("{date} · Альбом") }
            } else if date.is_empty() {
                artists
            } else {
                format!("{artists} · {date}")
            };
            let track_count = item
                .get("tracksV2")
                .and_then(|t| t.get("pagingInfo"))
                .and_then(|p| p.get("total"))
                .and_then(Value::as_u64)
                .or_else(|| {
                    item.get("tracksV2")
                        .and_then(|t| t.get("totalCount"))
                        .and_then(Value::as_u64)
                })
                .unwrap_or(0) as usize;
            let web_url = Url::parse(&format!("{WEB_URL}/album/{id}")).expect("album url");
            Some(CollectionItem {
                kind: CollectionKind::Album,
                provider: ProviderKind::Spotify,
                id,
                title,
                subtitle,
                artwork_url,
                web_url,
                track_count,
            })
        })
        .collect()
}

/// Достаёт плейлисты: data.searchV2.playlists.items[].data
fn extract_pathfinder_playlists(value: &Value) -> Vec<CollectionItem> {
    let items = jarray(
        value,
        &["data", "searchV2", "playlists", "items"],
    );
    items
        .into_iter()
        .filter_map(|wrapper| {
            let item = wrapper.get("data").unwrap_or(&wrapper);
            let uri = jstr(item, &["uri"])?;
            let id = pf_bare_id(uri)?;
            let title = jstr(item, &["name"]).unwrap_or("Без названия").to_string();
            let owner = item
                .get("ownerV2")
                .and_then(|o| o.get("data"))
                .and_then(|d| d.get("name"))
                .and_then(Value::as_str)
                .unwrap_or_default();
            let track_count = item
                .get("content")
                .and_then(|c| c.get("totalCount"))
                .and_then(Value::as_u64)
                .unwrap_or(0) as usize;
            let artwork_url = item
                .get("images")
                .and_then(|i| i.get("items"))
                .and_then(Value::as_array)
                .and_then(|items| items.iter().last())
                .and_then(|img| img.get("sources"))
                .and_then(Value::as_array)
                .and_then(|sources| sources.iter().last())
                .and_then(|s| s.get("url"))
                .and_then(Value::as_str)
                .and_then(|u| Url::parse(u).ok());
            let subtitle = if owner.is_empty() {
                format!("{} треков", track_count)
            } else {
                format!("{owner} · {track_count} треков")
            };
            let web_url = Url::parse(&format!("{WEB_URL}/playlist/{id}")).expect("playlist url");
            Some(CollectionItem {
                kind: CollectionKind::Playlist,
                provider: ProviderKind::Spotify,
                id,
                title,
                subtitle,
                artwork_url,
                web_url,
                track_count,
            })
        })
        .collect()
}

/// Извлекает csrf-токен из __NEXT_DATA__ на странице подтверждения.
fn extract_csrf(html: &str) -> Option<String> {
    let marker = r#"<script id="__NEXT_DATA__" type="application/json"#;
    let start = html.find(marker)?;
    let json_start = html[start..].find('>')?;
    let json_str = &html[start + json_start + 1..];
    let end = json_str.find("</script>")?;
    let json: Value = serde_json::from_str(&json_str[..end]).ok()?;
    json.pointer("/props/initialToken")
        .and_then(Value::as_str)
        .map(str::to_string)
}

/// Декодирует Spotify-идентификатор (base62, инвертированный алфавит) в 16-байтовый gid.
fn base62_to_gid(media_id: &str) -> String {
    const ALPHABET: &str = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ";
    let mut value: u128 = 0;
    for ch in media_id.chars() {
        let Some(digit) = ALPHABET.find(ch) else {
            return String::new();
        };
        value = value * 62 + digit as u128;
    }
    format!("{value:032x}")
}

fn browser_headers() -> reqwest::header::HeaderMap {
    use reqwest::header::*;
    let mut h = reqwest::header::HeaderMap::new();
    h.insert(USER_AGENT, HeaderValue::from_static(BROWSER_UA));
    h.insert(ACCEPT, HeaderValue::from_static("*/*"));
    h.insert(ACCEPT_LANGUAGE, HeaderValue::from_static("en-US,en;q=0.9"));
    h.insert("App-Platform", HeaderValue::from_static("WebPlayer"));
    h.insert("spotify-app-version", HeaderValue::from_static(CLIENT_VERSION));
    h.insert("Sec-Fetch-Dest", HeaderValue::from_static("empty"));
    h.insert("Sec-Fetch-Mode", HeaderValue::from_static("cors"));
    h.insert("Sec-Fetch-Site", HeaderValue::from_static("same-site"));
    h.insert("Sec-Ch-Ua", HeaderValue::from_static(r#""Not)A;Brand";v="99", "Google Chrome";v="138", "Chromium";v="138""#));
    h.insert("Sec-Ch-Ua-Mobile", HeaderValue::from_static("?0"));
    h.insert("Sec-Ch-Ua-Platform", HeaderValue::from_static("Windows"));
    h.insert("Priority", HeaderValue::from_static("u=1, i"));
    h.insert("Origin", HeaderValue::from_static("https://open.spotify.com"));
    h.insert("Referer", HeaderValue::from_static("https://open.spotify.com/"));
    h
}

/// Заголовки для clienttoken.spotify.com — точный набор как в Dotify.
fn client_token_headers(cookie: &str) -> reqwest::header::HeaderMap {
    use reqwest::header::*;
    let mut h = reqwest::header::HeaderMap::new();
    h.insert("accept", "application/json".parse().unwrap());
    h.insert("accept-language", "en-US".parse().unwrap());
    h.insert("content-type", "application/json".parse().unwrap());
    h.insert("origin", "https://open.spotify.com".parse().unwrap());
    h.insert("priority", "u=1, i".parse().unwrap());
    h.insert("referer", "https://open.spotify.com/".parse().unwrap());
    h.insert("sec-ch-ua", r#""Not)A;Brand";v="99", "Google Chrome";v="138", "Chromium";v="138""#.parse().unwrap());
    h.insert("sec-ch-ua-mobile", "?0".parse().unwrap());
    h.insert("sec-ch-ua-platform", "\"Windows\"".parse().unwrap());
    h.insert("sec-fetch-dest", "empty".parse().unwrap());
    h.insert("sec-fetch-mode", "cors".parse().unwrap());
    h.insert("sec-fetch-site", "same-site".parse().unwrap());
    h.insert(USER_AGENT, BROWSER_UA.parse().unwrap());
    h.insert("spotify-app-version", CLIENT_VERSION.parse().unwrap());
    h.insert("app-platform", "WebPlayer".parse().unwrap());
    h.insert(COOKIE, cookie.parse().unwrap());
    h
}

fn spotify_cache_dir() -> PathBuf {
    std::env::temp_dir().join("vessel").join("spotify-cache")
}

fn write_cache(path: &Path, bytes: &[u8]) -> Result<()> {
    let parent = path.parent().context("повреждённый путь кэша Spotify")?;
    fs::create_dir_all(parent).context("не удалось создать кэш Spotify")?;
    let temporary = path.with_extension("part");
    fs::write(&temporary, bytes).context("не удалось записать кэш Spotify")?;
    if path.exists() {
        fs::remove_file(path).context("не удалось обновить кэш Spotify")?;
    }
    fs::rename(temporary, path).context("не удалось завершить кэш Spotify")
}

fn full_cache_source(path: &Path) -> Result<PlaybackSource> {
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or("mp3");
    Ok(PlaybackSource {
        url: Url::from_file_path(path)
            .map_err(|_| anyhow::anyhow!("повреждённый путь кэша Spotify"))?,
        headers: BTreeMap::new(),
        mime_type: Some(
            if extension.eq_ignore_ascii_case("ogg") {
                "audio/ogg"
            } else if extension.eq_ignore_ascii_case("m4a") {
                "audio/mp4"
            } else {
                "audio/mpeg"
            }
            .to_string(),
        ),
        supports_range: true,
        expires_at_ms: None,
        capability: PlaybackCapability::Full,
    })
}

fn file_extension_from_url(url: &Url) -> Option<&str> {
    url.path_segments()
        .and_then(|mut segments| segments.next_back())
        .and_then(|segment| segment.rsplit_once('.').map(|(_, ext)| ext))
}

/// Дешифровка SpotiCrypt: AES-128-CTR, ключ = file_id XOR secret, IV = file_id.
fn decrypt_audio(encrypted: &[u8], file_id: &str) -> Result<Vec<u8>> {
    let file_id_bytes = decode_file_id(file_id)?;
    let mut key = [0u8; 16];
    for (index, byte) in file_id_bytes.iter().enumerate() {
        key[index] = byte ^ SPOTICRYPT_SECRET[index];
    }
    let cipher = Aes128::new(GenericArray::from_slice(&key));
    let mut counter = file_id_bytes;
    let mut output = Vec::with_capacity(encrypted.len());
    for chunk in encrypted.chunks(16) {
        let mut keystream = GenericArray::clone_from_slice(&counter);
        cipher.encrypt_block(&mut keystream);
        for (byte, stream) in chunk.iter().zip(keystream.iter()) {
            output.push(byte ^ stream);
        }
        increment_counter(&mut counter);
    }
    if output.len() <= AUDIO_HEADER_SKIP {
        bail!("расшифрованный аудиофайл Spotify подозрительно мал")
    }
    output.drain(..AUDIO_HEADER_SKIP);
    Ok(output)
}

fn decode_file_id(value: &str) -> Result<[u8; 16]> {
    let decoded = hex::decode(value).context("повреждённый file_id Spotify")?;
    decoded
        .try_into()
        .map_err(|_| anyhow::anyhow!("file_id Spotify не 16 байт"))
}

fn increment_counter(counter: &mut [u8; 16]) {
    for byte in counter.iter_mut().rev() {
        *byte = byte.wrapping_add(1);
        if *byte != 0 {
            break;
        }
    }
}

fn entity_id(url: &Url, kind: &str) -> Option<String> {
    url.path_segments()?.collect::<Vec<_>>().windows(2).find_map(
        |pair| {
            (pair[0].eq_ignore_ascii_case(kind) && !pair[1].contains('/')).then(|| pair[1].to_string())
        },
    )
}

fn map_track(track: ApiTrack) -> Option<TrackRef> {
    let id = track.id?;
    if !id.starts_with("spotify:track:") {
        return None;
    }
    let bare_id = id.trim_start_matches("spotify:track:");
    Some(TrackRef {
        provider: ProviderKind::Spotify,
        id: bare_id.to_string(),
        title: track.name,
        artists: track
            .artists
            .into_iter()
            .map(|artist| artist.name)
            .collect(),
        duration_ms: track.duration_ms,
        artwork_url: track
            .album
            .as_ref()
            .and_then(|album| album.images.first())
            .and_then(|image| Url::parse(&image.url).ok()),
        web_url: Url::parse(&format!("{WEB_URL}/track/{bare_id}"))
            .expect("статический адрес трека Spotify"),
        capability: PlaybackCapability::Full,
        genres: Vec::new(),
        explicit: track.explicit.unwrap_or(false),
        drm: true,
    })
}

fn map_playlist_item(item: ApiPlaylistItem) -> Option<CollectionItem> {
    let id = item.id?;
    let bare_id = id.trim_start_matches("spotify:playlist:");
    Some(CollectionItem {
        kind: CollectionKind::Playlist,
        provider: ProviderKind::Spotify,
        id: bare_id.to_string(),
        title: item.name,
        subtitle: item.owner.map(|owner| owner.display_name).unwrap_or_default(),
        artwork_url: item
            .images
            .first()
            .and_then(|image| Url::parse(&image.url).ok()),
        web_url: Url::parse(&format!("{WEB_URL}/playlist/{bare_id}"))
            .expect("статический адрес плейлиста Spotify"),
        track_count: item.tracks.map(|count| count.total).unwrap_or(0),
    })
}

fn map_album_item(item: ApiAlbumItem) -> Option<CollectionItem> {
    let id = item.id?;
    let bare_id = id.trim_start_matches("spotify:album:");
    Some(CollectionItem {
        kind: CollectionKind::Album,
        provider: ProviderKind::Spotify,
        id: bare_id.to_string(),
        title: item.name,
        subtitle: item
            .artists
            .first()
            .map(|artist| artist.name.clone())
            .unwrap_or_default(),
        artwork_url: item
            .images
            .first()
            .and_then(|image| Url::parse(&image.url).ok()),
        web_url: Url::parse(&format!("{WEB_URL}/album/{bare_id}"))
            .expect("статический адрес альбома Spotify"),
        track_count: item.total_tracks.unwrap_or(0),
    })
}

fn map_artist_item(item: ApiArtistItem) -> Option<CollectionItem> {
    let id = item.id?;
    let bare_id = id.trim_start_matches("spotify:artist:");
    let fans = item.followers.map(|count| count.total).unwrap_or(0);
    Some(CollectionItem {
        kind: CollectionKind::Artist,
        provider: ProviderKind::Spotify,
        id: bare_id.to_string(),
        title: item.name,
        subtitle: format!("Артист · {fans} слушателей"),
        artwork_url: item
            .images
            .first()
            .and_then(|image| Url::parse(&image.url).ok()),
        web_url: Url::parse(&format!("{WEB_URL}/artist/{bare_id}"))
            .expect("статический адрес артиста Spotify"),
        track_count: 0,
    })
}

fn map_album_as_release(album: ApiAlbumItem) -> Option<CollectionItem> {
    let item = map_album_item(album)?;
    Some(CollectionItem {
        subtitle: item.subtitle,
        ..item
    })
}

#[derive(Deserialize)]
struct SearchResponse {
    #[serde(default)]
    tracks: PagedItems<ApiTrack>,
    #[serde(default)]
    playlists: Option<PagedItems<ApiPlaylistItem>>,
    #[serde(default)]
    albums: Option<PagedItems<ApiAlbumItem>>,
    #[serde(default)]
    artists: Option<PagedItems<ApiArtistItem>>,
}

struct PagedItems<T> {
    items: Vec<T>,
    next: Option<String>,
}

impl<T> Default for PagedItems<T> {
    fn default() -> Self {
        Self {
            items: Vec::new(),
            next: None,
        }
    }
}

// Вручную реализуем Deserialize, чтобы не требовать T: Default
impl<'de, T: serde::Deserialize<'de>> serde::Deserialize<'de> for PagedItems<T> {
    fn deserialize<D: serde::de::Deserializer<'de>>(d: D) -> Result<Self, D::Error> {
        struct PagedVisitor<T>(std::marker::PhantomData<T>);

        impl<'de, T: serde::Deserialize<'de>> serde::de::Visitor<'de> for PagedVisitor<T> {
            type Value = PagedItems<T>;

            fn expecting(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
                formatter.write_str("объект с полями items и next")
            }

            fn visit_map<A: serde::de::MapAccess<'de>>(
                self,
                mut map: A,
            ) -> Result<Self::Value, A::Error> {
                let mut items: Option<Vec<T>> = None;
                let mut next: Option<String> = None;
                while let Some(key) = map.next_key::<String>()? {
                    match key.as_str() {
                        "items" => items = Some(map.next_value()?),
                        "next" => next = Some(map.next_value()?),
                        _ => {
                            map.next_value::<serde::de::IgnoredAny>()?;
                        }
                    }
                }
                Ok(PagedItems {
                    items: items.unwrap_or_default(),
                    next,
                })
            }
        }

        d.deserialize_map(PagedVisitor(std::marker::PhantomData))
    }
}

#[derive(Deserialize)]
struct ApiTrack {
    id: Option<String>,
    name: String,
    duration_ms: Option<u64>,
    explicit: Option<bool>,
    artists: Vec<ApiArtist>,
    album: Option<ApiAlbumRef>,
}

#[derive(Deserialize)]
struct ApiArtist {
    name: String,
}

#[derive(Deserialize)]
struct ApiAlbumRef {
    images: Vec<ApiImage>,
}

#[derive(Deserialize)]
struct ApiImage {
    url: String,
}

#[derive(Deserialize)]
struct ApiPlaylistItem {
    id: Option<String>,
    name: String,
    owner: Option<ApiOwner>,
    images: Vec<ApiImage>,
    tracks: Option<ApiTracksSummary>,
}

#[derive(Deserialize)]
struct ApiOwner {
    display_name: String,
}

#[derive(Deserialize)]
struct ApiTracksSummary {
    total: usize,
}

#[derive(Deserialize)]
struct ApiAlbumItem {
    id: Option<String>,
    name: String,
    artists: Vec<ApiArtist>,
    images: Vec<ApiImage>,
    total_tracks: Option<usize>,
}

#[derive(Deserialize)]
struct ApiArtistItem {
    id: Option<String>,
    name: String,
    images: Vec<ApiImage>,
    followers: Option<ApiFollowers>,
}

#[derive(Deserialize)]
struct ApiFollowers {
    total: usize,
}

#[derive(Deserialize)]
struct ArtistFull {
    name: String,
    images: Vec<ApiImage>,
}

#[derive(Deserialize)]
struct TopTracks {
    tracks: Vec<ApiTrack>,
}

#[derive(Deserialize)]
struct AlbumsResponse {
    #[serde(default)]
    items: Vec<ApiAlbumItem>,
    next: Option<String>,
}

#[derive(Deserialize)]
struct AlbumTracksResponse {
    #[serde(default)]
    items: Vec<ApiTrack>,
    #[allow(dead_code)]
    next: Option<String>,
}

#[derive(Deserialize)]
struct PlaylistDetails {
    name: String,
    description: Option<String>,
    images: Vec<ApiImage>,
    tracks: PagedItems<ApiTrack>,
}

#[derive(Deserialize)]
struct AlbumDetails {
    name: String,
    artists: Vec<ApiArtist>,
    images: Vec<ApiImage>,
    tracks: PagedItems<ApiTrack>,
}

#[derive(Deserialize)]
struct Recommendations {
    #[serde(default)]
    tracks: Vec<ApiTrack>,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sp_dc_accepts_raw_value_and_cookie_prefix() {
        assert_eq!(normalize_cookie_string("token"), "sp_dc=token");
        assert_eq!(normalize_cookie_string("Cookie: sp_dc='token'"), "sp_dc=token");
        assert_eq!(
            normalize_cookie_string("sp_dc=abc; sp_key=def; path=/"),
            "sp_dc=abc; sp_key=def"
        );
    }

    #[test]
    fn spotify_is_detected_from_playlist_and_album_urls() {
        assert_eq!(
            ProviderKind::from_url("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M"),
            Some(ProviderKind::Spotify)
        );
        assert_eq!(
            ProviderKind::from_url("https://open.spotify.com/album/6ak1I1hjf2QkVpQRxHFUoE"),
            Some(ProviderKind::Spotify)
        );
    }

    #[test]
    fn entity_id_extracts_spotify_ids() {
        let url = Url::parse("https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M").unwrap();
        assert_eq!(
            entity_id(&url, "playlist").as_deref(),
            Some("37i9dQZF1DXcBWIGoYBM5M")
        );
    }

    #[test]
    fn spoticrypt_key_is_derived_from_file_id() {
        let file_id = hex::decode("0123456789abcdef0123456789abcdef").unwrap();
        let mut key = [0u8; 16];
        for (index, byte) in file_id.iter().enumerate() {
            key[index] = byte ^ SPOTICRYPT_SECRET[index];
        }
        assert_ne!(key, [0u8; 16]);
    }

    #[test]
    fn full_cache_source_is_not_downgraded_to_preview() {
        let path = std::path::Path::new("C:/cache/spotify-track.ogg");
        let source = full_cache_source(path).unwrap();
        assert_eq!(source.capability, PlaybackCapability::Full);
        assert_eq!(source.mime_type.as_deref(), Some("audio/ogg"));
        assert_eq!(source.url.scheme(), "file");
    }

    /// Отладочный тест: читает sp_dc из SPOTIFY_SP_DC, прогоняет TOTP-поток
    /// и печатает сырые ответы. Запуск: SPOTIFY_SP_DC=... cargo test -p vessel-core --lib provider::spotify::tests::live_totp_flow -- --ignored --nocapture
    #[tokio::test]
    #[ignore]
    async fn live_totp_flow() {
        let token = std::env::var("SPOTIFY_SP_DC").expect("нет SPOTIFY_SP_DC");
        let provider = SpotifyProvider::new(&token).unwrap();

        match provider.fetch_access_token().await {
            Ok((access, client)) => {
                println!("OK access_token.len={} client_token.len={}", access.len(), client.len());
                println!("client_token prefix: {}", &client[..client.len().min(40)]);
            }
            Err(error) => {
                println!("ERR: {error:#}");
            }
        }
    }

    /// Перебирает варианты заголовков для clienttoken endpoint.
    #[tokio::test]
    #[ignore]
    async fn live_client_token_variants() {
        let token = std::env::var("SPOTIFY_SP_DC").expect("нет SPOTIFY_SP_DC");
        let provider = SpotifyProvider::new(&token).unwrap();
        // Получаем access token напрямую, не через fetch_access_token (он сам запрашивает client token)
        let (totp_secret, totp_ver) = provider.get_totp_state().await.expect("totp");
        let server_time = provider.get_server_time().await.expect("server time");
        let totp = generate_totp(&totp_secret, server_time);
        let url = Url::parse_with_params(
            SESSION_TOKEN_URL,
            &[
                ("reason", "init"),
                ("productType", "web-player"),
                ("totp", &totp),
                ("totpServer", &totp),
                ("totpVer", &totp_ver),
            ],
        )
        .unwrap();
        let resp = provider
            .http
            .get(url)
            .headers(browser_headers())
            .header(COOKIE, &provider.cookie)
            .send()
            .await
            .expect("session request");
        let value: Value = resp.json().await.expect("session json");
        let client_id = value
            .get("clientId")
            .and_then(Value::as_str)
            .expect("clientId")
            .to_string();
        println!("[session] clientId={client_id}");

        let payload = serde_json::json!({
            "client_data": {
                "client_version": CLIENT_VERSION,
                "client_id": client_id,
                "js_sdk_data": {}
            }
        });
        let body = serde_json::to_string(&payload).unwrap();
        println!("[client-token-body] {body}");

        let mut full = reqwest::header::HeaderMap::new();
        full.insert("accept", "application/json".parse().unwrap());
        full.insert("accept-language", "en-US".parse().unwrap());
        full.insert("content-type", "application/json".parse().unwrap());
        full.insert("origin", "https://open.spotify.com".parse().unwrap());
        full.insert("priority", "u=1, i".parse().unwrap());
        full.insert("referer", "https://open.spotify.com/".parse().unwrap());
        full.insert("sec-ch-ua", r#""Not)A;Brand";v="99", "Google Chrome";v="138", "Chromium";v="138""#.parse().unwrap());
        full.insert("sec-ch-ua-mobile", "?0".parse().unwrap());
        full.insert("sec-ch-ua-platform", "\"Windows\"".parse().unwrap());
        full.insert("sec-fetch-dest", "empty".parse().unwrap());
        full.insert("sec-fetch-mode", "cors".parse().unwrap());
        full.insert("sec-fetch-site", "same-site".parse().unwrap());
        full.insert("user-agent", BROWSER_UA.parse().unwrap());
        full.insert("spotify-app-version", CLIENT_VERSION.parse().unwrap());
        full.insert("app-platform", "WebPlayer".parse().unwrap());
        full.insert("Cookie", provider.cookie.parse().unwrap());

        let resp = provider.http.post(CLIENT_TOKEN_URL).headers(full).body(body).send().await.unwrap();
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        println!("[full-dotify] status={status} len={} body={}", text.len(), &text[..text.len().min(300)]);
    }

    /// Тестирует поиск треков и коллекций с реальным токеном.
    #[tokio::test]
    #[ignore]
    async fn live_search() {
        let token = std::env::var("SPOTIFY_SP_DC").expect("нет SPOTIFY_SP_DC");
        let provider = SpotifyProvider::new(&token).unwrap();

        let (access, client_token) = provider.fetch_access_token().await.expect("auth");
        println!("access_token ok, client_token ok len={}", client_token.len());

        // Поиск треков БЕЗ client-token
        let url = Url::parse_with_params(
            "https://api.spotify.com/v1/search",
            &[("q", "carti"), ("type", "track"), ("limit", "5"), ("offset", "0")],
        ).unwrap();
        let resp = provider.http.get(url.clone())
            .header("Authorization", format!("Bearer {access}"))
            .send().await.unwrap();
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        println!("[search-tracks-no-client-token] status={status} body={}", &text[..text.len().min(300)]);

        // Поиск треков С client-token
        let resp = provider.http.get(url)
            .header("Authorization", format!("Bearer {access}"))
            .header("client-token", &client_token)
            .send().await.unwrap();
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        println!("[search-tracks-with-client-token] status={status} body={}", &text[..text.len().min(300)]);

        // Pathfinder API
        let resp = provider.http.post("https://api-partner.spotify.com/pathfinder/v1/query")
            .header("Authorization", format!("Bearer {access}"))
            .header("client-token", &client_token)
            .json(&serde_json::json!({
                "variables": { "uri": "spotify:track:4uLU6hMCjMI75M1A2tKUQC", "locale": "" },
                "extensions": { "persistedQuery": { "version": 1, "sha256Hash": "612585ae06ba435ad26369870deaae23b5c8800a256cd8a57e08eddc25a37294" } }
            }))
            .send().await.unwrap();
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        println!("[pathfinder-getTrack] status={status} body={}", &text[..text.len().min(400)]);

        // Pathfinder full query search (без persisted hash)
        let resp = provider.http.post("https://api-partner.spotify.com/pathfinder/v1/query")
            .header("Authorization", format!("Bearer {access}"))
            .header("client-token", &client_token)
            .json(&serde_json::json!({
                "query": "query($query: String!) { searchTracks(query: $query, first: 5) { items { id name uri artists { name } album { name images { url } } durationMs } } }",
                "variables": { "query": "carti" }
            }))
            .send().await.unwrap();
        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        println!("[pathfinder-raw-search] status={status} body={}", &text[..text.len().min(500)]);
    }

    /// Тестирует device flow OAuth.
    #[tokio::test]
    #[ignore]
    async fn live_device_flow() {
        let token = std::env::var("SPOTIFY_SP_DC").expect("нет SPOTIFY_SP_DC");
        let provider = SpotifyProvider::new(&token).unwrap();

        let auth = provider.http.post(DEVICE_AUTH_URL)
            .form(&[("client_id", DEVICE_CLIENT_ID), ("scope", DEVICE_SCOPE)])
            .header(USER_AGENT, HeaderValue::from_static(DEVICE_FLOW_USER_AGENT))
            .send().await.unwrap();
        let status = auth.status();
        let text = auth.text().await.unwrap_or_default();
        println!("[device-auth] status={status} body={}", &text[..text.len().min(400)]);
        let auth: Value = serde_json::from_str(&text).unwrap_or(Value::Null);
        let device_code = auth.get("device_code").and_then(Value::as_str).unwrap_or("").to_string();
        let user_code = auth.get("user_code").and_then(Value::as_str).unwrap_or("").to_string();
        let verify = auth.get("verification_uri_complete").and_then(Value::as_str).unwrap_or("").to_string();
        println!("[device-auth] user_code={user_code} verify={verify}");

        let verify_resp = provider.http.get(Url::parse(&verify).unwrap())
            .header(COOKIE, &provider.cookie)
            .send().await.unwrap();
        let status = verify_resp.status();
        let final_url = verify_resp.url().clone();
        let html = verify_resp.text().await.unwrap_or_default();
        println!("[verify] status={status} final_url={final_url} html_len={}", html.len());
        let flow_ctx = final_url.query_pairs().find(|(k, _)| k == "flow_ctx").map(|(_, v)| v.into_owned());
        println!("[verify] flow_ctx={flow_ctx:?}");
        let csrf = extract_csrf(&html);
        println!("[verify] csrf={csrf:?}");

        if let (Some(flow_ctx_full), Some(csrf)) = (flow_ctx, csrf) {
            let flow_ctx = flow_ctx_full.split(':').next().unwrap_or(&flow_ctx_full).to_string();
            let current_ts = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_secs().to_string();
            let flow_ctx_param = format!("{flow_ctx}:{current_ts}");
            let resolve = provider.http.post(DEVICE_RESOLVE_URL)
                .query(&[("flow_ctx", &flow_ctx_param)])
                .json(&serde_json::json!({"code": user_code}))
                .header("x-csrf-token", &csrf)
                .header("referer", final_url.as_str())
                .header("origin", "https://accounts.spotify.com")
                .send().await.unwrap();
            let status = resolve.status();
            let text = resolve.text().await.unwrap_or_default();
            println!("[resolve] status={status} body={}", &text[..text.len().min(300)]);
        }

        if !device_code.is_empty() {
            let token = provider.http.post(DEVICE_TOKEN_URL)
                .form(&[
                    ("client_id", DEVICE_CLIENT_ID),
                    ("device_code", &device_code),
                    ("grant_type", "urn:ietf:params:oauth:grant-type:device_code"),
                ])
                .send().await.unwrap();
            let status = token.status();
            let text = token.text().await.unwrap_or_default();
            println!("[token-exchange] status={status} body={}", &text[..text.len().min(400)]);
        }
    }

    /// Тестирует поиск через Pathfinder API.
    #[tokio::test]
    #[ignore]
    async fn live_pathfinder_search() {        let token = std::env::var("SPOTIFY_SP_DC").expect("нет SPOTIFY_SP_DC");
        let provider = SpotifyProvider::new(&token).unwrap();

        match provider.search("carti", None).await {
            Ok(page) => {
                println!("[search-tracks] count={}", page.tracks.len());
                for t in page.tracks.iter().take(5) {
                    println!("  - {} — {} ({})", t.title, t.display_artist(), t.id);
                }
            }
            Err(e) => println!("[search-tracks] ERR: {e:#}"),
        }

        match provider.search_collections("carti", CollectionKind::Artist).await {
            Ok(items) => {
                println!("[search-artists] count={}", items.len());
                for i in items.iter().take(5) {
                    println!("  - {} ({})", i.title, i.id);
                }
            }
            Err(e) => println!("[search-artists] ERR: {e:#}"),
        }

        match provider.search_collections("carti", CollectionKind::Album).await {
            Ok(items) => {
                println!("[search-albums] count={}", items.len());
                for i in items.iter().take(5) {
                    println!("  - {} — {} ({})", i.title, i.subtitle, i.id);
                }
            }
            Err(e) => println!("[search-albums] ERR: {e:#}"),
        }

        match provider.search_collections("carti", CollectionKind::Playlist).await {
            Ok(items) => {
                println!("[search-playlists] count={}", items.len());
                for i in items.iter().take(5) {
                    println!("  - {} — {} ({})", i.title, i.subtitle, i.id);
                }
            }
            Err(e) => println!("[search-playlists] ERR: {e:#}"),
        }
    }

    /// Тестирует получение URL аудио через spclient.
    #[tokio::test]
    #[ignore]
    async fn live_audio() {
        let token = std::env::var("SPOTIFY_SP_DC").expect("нет SPOTIFY_SP_DC");
        let provider = SpotifyProvider::new(&token).unwrap();
        let (access, client_token) = provider.fetch_access_token().await.expect("auth");

        let track_id = "1s9DTymg5UQrdorZf43JQm";

        // Путь 1: Dotify track-playback
        for host in ["gue1-spclient"] {
            for fmt in ["file_ids_mp4", "file_ids_ogg", "file_ids_aac"] {
                let url = format!("https://{host}.spotify.com/track-playback/v1/media/spotify:track:{track_id}?manifestFileFormat={fmt}");
                let resp = provider.http.get(&url)
                    .header("Authorization", format!("Bearer {access}"))
                    .header("client-token", &client_token)
                    .header("Cookie", &provider.cookie)
                    .send().await.unwrap();
                let status = resp.status();
                let text = resp.text().await.unwrap_or_default();
                println!("[track-playback-{fmt}] status={status} len={}", text.len());
                if text.len() > 0 && text.len() < 2500 {
                    println!("  body={text}");
                }
            }
        }

        // Путь 2: storage-resolve с реальным file_id
        for format in ["11", "10"] {
            let file_id = if format == "11" { "d969ffb9c93ea5d4dd12300bab63b98f0b22b632" } else { "24b8548e7c559f9dfc821e61a67beb986c7ccb00" };
            let url = format!("https://gue1-spclient.spotify.com/storage-resolve/v2/files/audio/interactive/{format}/{file_id}?version=10000000&product=9&platform=39&alt=json");
            let resp = provider.http.get(&url)
                .header("Authorization", format!("Bearer {access}"))
                .header("client-token", &client_token)
                .header("Cookie", &provider.cookie)
                .send().await.unwrap();
            let status = resp.status();
            let text = resp.text().await.unwrap_or_default();
            println!("[storage-resolve-{format}] status={status} len={}", text.len());
            if text.len() > 0 && text.len() < 3000 {
                println!("  body={text}");
            }
        }

        // Путь 3: Pathfinder getTrack (уже работает)
        let value = provider.pathfinder("getTrack", GET_TRACK_HASH, serde_json::json!({"uri": format!("spotify:track:{track_id}")})).await.unwrap();
        println!("[getTrack] OK");

        // Путь 4: playplay license endpoint
        let file_id = "d969ffb9c93ea5d4dd12300bab63b98f0b22b632";
        let url = format!("https://gew4-spclient.spotify.com/playplay/v1/key/{file_id}");
        // Протобуф PlayPlayLicenseRequest: version=5, token(bytes), interactivity=1, content_type=1
        // version(field1, varint)=5
        // token(field2, bytes)=PLAYPLAY_TOKEN (16 bytes)
        // interactivity(field4, varint)=1 (INTERACTIVE)
        // content_type(field5, varint)=1 (AUDIO_TRACK)
        let mut proto = Vec::new();
        proto.push(0x08); proto.push(5); // field1 varint = 5
        let token = hex::decode("02811027c51620c0fd36cd1de59e227a").unwrap();
        proto.push(0x12); proto.push(token.len() as u8); // field2 length-delimited
        proto.extend_from_slice(&token);
        proto.push(0x20); proto.push(1); // field4 varint = 1 (INTERACTIVE)
        proto.push(0x28); proto.push(1); // field5 varint = 1 (AUDIO_TRACK)
        let resp = provider.http.post(&url)
            .header("Authorization", format!("Bearer {access}"))
            .header("client-token", &client_token)
            .header("Cookie", &provider.cookie)
            .header("Accept", "application/x-protobuf")
            .header("Content-Type", "application/x-protobuf")
            .body(proto)
            .send().await.unwrap();
        let status = resp.status();
        let bytes = resp.bytes().await.unwrap_or_default();
        println!("[playplay] status={status} len={} bytes={:?}", bytes.len(), &bytes[..bytes.len().min(64)]);
        // Деобфускация ключа — для старой Playplay-схемы просто xor с INIT_VALUE
        // (это надо проверить, но INIT_VALUE = 8df84f8c610a1ab4c449a214fb08305e)
    }

    /// Тестирует получение аудио-ключа через librespot.
    #[tokio::test]
    #[ignore]
    async fn live_librespot_audio_key() {
        use librespot_core::authentication::Credentials;
        use librespot_core::config::SessionConfig;
        use librespot_core::{FileId, SpotifyId};

        let token = std::env::var("SPOTIFY_SP_DC").expect("нет SPOTIFY_SP_DC");
        let provider = SpotifyProvider::new(&token).unwrap();
        let device_token = provider.device_flow_token().await.expect("device flow");
        println!("[librespot] device token len={}", device_token.len());

        let track_id = "1s9DTymg5UQrdorZf43JQm";
        let file_id_hex = "d969ffb9c93ea5d4dd12300bab63b98f0b22b632";

        let session = librespot_core::Session::new(SessionConfig::default(), None);
        let creds = Credentials::with_access_token(device_token);
        match session.connect(creds, false).await {
            Ok(()) => println!("[librespot] session connected (device flow)"),
            Err(e) => {
                println!("[librespot] session connect (device flow) ERR: {e:#}");
            }
        }
        let track = match SpotifyId::from_base62(track_id) {
            Ok(id) => id,
            Err(e) => { println!("[librespot] SpotifyId ERR: {e:#}"); return; }
        };
        for file_id_hex in ["d969ffb9c93ea5d4dd12300bab63b98f0b22b632", "24b8548e7c559f9dfc821e61a67beb986c7ccb00"] {
            let file_id = FileId::from_raw(&hex::decode(file_id_hex).unwrap_or_default());
            match session.audio_key().request(track, file_id).await {
                Ok(key) => println!("[librespot] audio key OK ({}): {:?}", file_id_hex, key.0),
                Err(e) => println!("[librespot] audio key ERR ({}): {e:#}", file_id_hex),
            }
        }

        // Попробуем с TOTP-токеном
        let (access_token, _) = provider.fetch_access_token().await.expect("totp token");
        println!("[librespot] totp token len={}", access_token.len());
        let session2 = librespot_core::Session::new(SessionConfig::default(), None);
        let creds2 = Credentials::with_access_token(access_token);
        match session2.connect(creds2, false).await {
            Ok(()) => println!("[librespot] session connected (totp)"),
            Err(e) => {
                println!("[librespot] session connect (totp) ERR: {e:#}");
                return;
            }
        }
        let file_id2 = FileId::from_raw(&hex::decode(file_id_hex).unwrap_or_default());
        match session2.audio_key().request(track, file_id2).await {
            Ok(key) => println!("[librespot] audio key (totp) OK: {:?}", key.0),
            Err(e) => println!("[librespot] audio key (totp) ERR: {e:#}"),
        }

        // Проверим статус аккаунта через accountAttributes
        let attrs = provider.pathfinder("accountAttributes", "4fbd57be3c6ec2157adcc5b8573ec571f61412de23bbb798d8f6a156b7d34cdf", serde_json::json!({})).await;
        match attrs {
            Ok(v) => println!("[accountAttributes] {}", serde_json::to_string_pretty(&v).unwrap_or_default()),
            Err(e) => println!("[accountAttributes] ERR: {e:#}"),
        }
    }

    /// Тестирует полный конвейер подготовки трека.
    #[tokio::test]
    #[ignore]
    async fn live_prepare_full_track() {
        let token = std::env::var("SPOTIFY_SP_DC").expect("нет SPOTIFY_SP_DC");
        let provider = SpotifyProvider::new(&token).unwrap();
        let track_id = "1s9DTymg5UQrdorZf43JQm";
        match provider.prepare_full_track(track_id).await {
            Ok(path) => {
                let meta = std::fs::metadata(&path).ok();
                println!("[prepare] OK path={} len={:?}", path.display(), meta.map(|m| m.len()));
                let bytes = std::fs::read(&path).unwrap_or_default();
                println!("[prepare] magic={:?}", &bytes[..bytes.len().min(16)]);
            }
            Err(e) => println!("[prepare] ERR: {e:#}"),
        }
    }
}
