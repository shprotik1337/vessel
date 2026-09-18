//! Vessel Server — `/api/v1` поверх тех же реализаций провайдеров, что и в
//! локальном режиме (vessel-core build_registry + SecretStore сервера).
//! Никакого постоянного музыкального кэша: только обработка запросов и
//! короткий транзитный relay аудио (`/api/v1/s/{token}`).

mod config;
mod relay;

use std::{net::SocketAddr, path::Path, path::PathBuf, sync::Arc, sync::Mutex};

use anyhow::anyhow;
use axum::{
    Json, Router,
    body::Body,
    extract::{Path as AxPath, Query, Request, State},
    http::{HeaderMap, HeaderName, HeaderValue, Method, StatusCode, header},
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use config::{RelayPolicy, ServerConfig};
use relay::{RelayLimiter, RelayStore, RelayTarget};
use serde::Deserialize;
use serde_json::json;
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use url::Url;
use vessel_core::{
    config::AppConfig,
    model::PlaybackSource,
    protocol::{
        API_PREFIX, CREDENTIALS_HEADER, CollectionsResponse, ImportPlaylistRequest,
        ImportedPlaylistResponse, LikedRequest, PageResponse, ProfileResponse, RelatedRequest,
        ResolveSourceRequest, ResolveSourceResponse, ServerCapabilities, ServerInfo,
        TracksResponse, UserCredentials, collection_from_segment, kind_from_segment, kind_segment,
    },
    provider::{CollectionKind, MusicProvider},
    runtime::providers::build_provider,
};

const VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Clone)]
struct AppState {
    /// Параметры провайдеров (spotify proxy, potoken URL) — без секретов.
    config: Arc<AppConfig>,
    /// Сегменты провайдеров, доступных на сервере (для capabilities).
    enabled: Arc<Vec<String>>,
    tokens: Arc<Vec<String>>,
    info: Arc<ServerInfo>,
    relay: Arc<RelayStore>,
    limiter: RelayLimiter,
    relay_policy: RelayPolicy,
    http: reqwest::Client,
    /// Кэш автообнаруженного публичного client_id SoundCloud (не аккаунт).
    soundcloud_id: Arc<Mutex<Option<String>>>,
    cache_dir: PathBuf,
}

impl AppState {
    /// Провайдер для конкретного запроса: строим из credentials клиента.
    /// Свои сохранённые аккаунты сервер не хранит и не использует.
    async fn provider(
        &self,
        segment: &str,
        creds: &UserCredentials,
    ) -> Result<Arc<dyn MusicProvider>, ApiError> {
        let kind = kind_from_segment(segment)
            .ok_or_else(|| ApiError(StatusCode::NOT_FOUND, "неизвестный провайдер".into()))?;
        if !self.enabled.iter().any(|enabled| enabled == segment) {
            return Err(ApiError(
                StatusCode::NOT_FOUND,
                format!("провайдер {} не настроен на сервере", kind.label()),
            ));
        }
        let mut creds = creds.clone();
        // SoundCloud: публичный client_id может обнаружить сам сервер
        // (это не аккаунт, а публичный ключ веб-плеера).
        if kind == vessel_core::model::ProviderKind::SoundCloud
            && creds.soundcloud_client_id.as_deref().map(str::trim).unwrap_or_default().is_empty()
        {
            creds.soundcloud_client_id = self.soundcloud_client_id().await?;
        }
        build_provider(kind, &creds, &self.config)
            .map(Arc::from)
            .map_err(ApiError::from)
    }

    async fn soundcloud_client_id(&self) -> Result<Option<String>, ApiError> {
        if let Some(id) = self
            .soundcloud_id
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
        {
            return Ok(Some(id));
        }
        let discovered = vessel_core::provider::soundcloud::discover_client_id()
            .await
            .ok();
        if let Some(id) = &discovered {
            *self
                .soundcloud_id
                .lock()
                .unwrap_or_else(|poisoned| poisoned.into_inner()) = Some(id.clone());
        }
        Ok(discovered)
    }
}

/// Учётные данные пользователя из заголовка запроса; отсутствие заголовка —
/// пустые credentials (для анонимно-работоспособных провайдеров).
fn user_credentials(headers: &HeaderMap) -> Result<UserCredentials, ApiError> {
    let Some(raw) = headers.get(CREDENTIALS_HEADER) else {
        return Ok(UserCredentials::default());
    };
    let raw = raw
        .to_str()
        .map_err(|_| ApiError(StatusCode::BAD_REQUEST, "заголовок учётных данных не-ASCII".into()))?;
    UserCredentials::decode(raw)
        .map_err(|error| ApiError(StatusCode::BAD_REQUEST, format!("{error}")))
}

struct ApiError(StatusCode, String);

impl From<anyhow::Error> for ApiError {
    fn from(error: anyhow::Error) -> Self {
        let text = format!("{error:#}");
        let code = if text.to_lowercase().contains("unsupported")
            || text.contains("не поддерживается")
        {
            StatusCode::NOT_IMPLEMENTED
        } else {
            StatusCode::BAD_GATEWAY
        };
        Self(code, text)
    }
}

impl ApiError {
    fn new(msg: impl Into<String>) -> Self {
        Self(StatusCode::BAD_GATEWAY, msg.into())
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        (self.0, Json(json!({ "detail": self.1 }))).into_response()
    }
}

type Api<T> = Result<T, ApiError>;

#[derive(Debug, Deserialize)]
struct SearchQuery {
    q: String,
    cursor: Option<String>,
}

#[derive(Debug, Deserialize)]
struct CollectionsQuery {
    q: String,
    #[serde(rename = "type")]
    kind: String,
}

#[derive(Debug, Deserialize)]
struct WaveQuery {
    limit: Option<usize>,
}

#[derive(Debug, Deserialize)]
struct ImageQuery {
    url: String,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let config_path = std::env::args()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("server.toml"));
    let cfg = ServerConfig::load(&config_path)?;
    std::fs::create_dir_all(&cfg.server.data_dir).ok();

    // Сервер НЕ хранит аккаунтов пользователей: провайдеры строятся на
    // каждый запрос из credentials клиента (заголовок x-vessel-credentials).
    // В capabilities попадают только включённые в конфиге провайдеры.
    let mut enabled: Vec<String> = Vec::new();
    if cfg.app.soundcloud_enabled {
        enabled.push(kind_segment(vessel_core::model::ProviderKind::SoundCloud).to_string());
    }
    if cfg.app.yandex_enabled {
        enabled.push(kind_segment(vessel_core::model::ProviderKind::YandexMusic).to_string());
    }
    if cfg.app.deezer_enabled {
        enabled.push(kind_segment(vessel_core::model::ProviderKind::Deezer).to_string());
    }
    if cfg.app.spotify_enabled {
        enabled.push(kind_segment(vessel_core::model::ProviderKind::Spotify).to_string());
    }
    if cfg.app.youtube_music_enabled {
        enabled.push(kind_segment(vessel_core::model::ProviderKind::YouTubeMusic).to_string());
    }
    let relay_policy = cfg.server.relay;
    let info = ServerInfo {
        name: cfg.server.name.clone(),
        version: VERSION.to_string(),
        api_version: vessel_core::protocol::API_VERSION.to_string(),
        capabilities: ServerCapabilities {
            processing: true,
            user_storage: false,
            playback_relay: relay_policy != RelayPolicy::Off,
        },
        providers: enabled.clone(),
    };
    println!(
        "[vessel-server] {} v{}: {} провайдеров (аккаунты — только от клиентов), relay={:?}, {} access-токенов",
        info.name,
        info.version,
        info.providers.len(),
        cfg.server.relay,
        cfg.server.tokens.len(),
    );

    let state = AppState {
        config: Arc::new(cfg.app.clone()),
        enabled: Arc::new(enabled),
        tokens: Arc::new(cfg.server.tokens.clone()),
        info: Arc::new(info),
        relay: Arc::new(RelayStore::new(cfg.server.relay_ttl_secs)),
        limiter: RelayLimiter::new(cfg.server.max_streams.max(1)),
        relay_policy,
        http: reqwest::Client::builder()
            .user_agent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36")
            .timeout(std::time::Duration::from_secs(60))
            .build()?,
        soundcloud_id: Arc::new(Mutex::new(None)),
        cache_dir: cfg.server.data_dir.join("cache"),
    };

    {
        // Периодическая зачистка протухших relay-токенов и их временных файлов.
        let relay = Arc::clone(&state.relay);
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(std::time::Duration::from_secs(30)).await;
                relay.prune();
            }
        });
    }

    let app = Router::new()
        .route("/api/v1/health", get(health))
        .route("/api/v1/capabilities", get(capabilities))
        .route("/api/v1/providers/{provider}/search", get(search))
        .route("/api/v1/providers/{provider}/collections", get(collections))
        .route("/api/v1/providers/{provider}/artists/{id}", get(artist_profile))
        .route("/api/v1/providers/{provider}/artists/{id}/tracks", get(artist_tracks))
        .route("/api/v1/providers/{provider}/wave", get(wave))
        .route("/api/v1/providers/{provider}/liked", post(liked))
        .route("/api/v1/providers/{provider}/playlists/import", post(import_playlist))
        .route("/api/v1/providers/{provider}/playback/resolve", post(resolve))
        .route("/api/v1/tracks/related", post(related))
        .route("/api/v1/s/{token}", get(stream))
        .route("/api/v1/image", get(image_proxy))
        .route("/api/v1/lyrics", get(lyrics_proxy))
        .layer(middleware::from_fn_with_state(state.clone(), require_token))
        .with_state(state.clone());

    let listener = tokio::net::TcpListener::bind(&cfg.server.listen)
        .await
        .map_err(|error| anyhow!("не удалось слушать {}: {error}", cfg.server.listen))?;
    let addr: SocketAddr = listener.local_addr()?;
    println!("[vessel-server] слушаю http://{addr}{API_PREFIX}/");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;
    state.relay.cleanup_all();
    println!("[vessel-server] остановлен, временные relay-файлы убраны");
    Ok(())
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
    println!("[vessel-server] сигнал остановки…");
}

/// Bearer-проверка; /api/v1/health открыт для пинга.
async fn require_token(State(state): State<AppState>, request: Request, next: Next) -> Response {
    let method = request.method().clone();
    let path = request.uri().path().to_string();
    if method == Method::GET && path == "/api/v1/health" {
        return next.run(request).await;
    }

    let bearer = request
        .headers()
        .get(header::AUTHORIZATION)
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.strip_prefix("Bearer "))
        .map(str::to_string);

    let query_token = request.uri().query().and_then(|q| {
        url::form_urlencoded::parse(q.as_bytes())
            .find(|(k, _)| k == "token")
            .map(|(_, v)| v.into_owned())
    });

    let token = bearer.or(query_token);

    // отладка resolve-401: печатаем ПРЕФИКС токена (не секрет) + сам header
    if path.contains("/playback/resolve") {
        let header_present = request
            .headers()
            .get(header::AUTHORIZATION)
            .map(|v| v.to_str().map(|s| s.chars().take(12).collect::<String>()).unwrap_or_default())
            .unwrap_or_else(|| "<нет header>".to_string());
        println!(
            "[auth] {method} {path}: header={header_present} bearer_prefix={}",
            token.as_deref().map(|t| t.chars().take(8).collect::<String>()).unwrap_or_else(|| "<нет>".to_string())
        );
    }

    let response = match token {
        Some(token) if state.tokens.iter().any(|allowed| allowed == &token) => next.run(request).await,
        _ => (
            StatusCode::UNAUTHORIZED,
            Json(json!({ "detail": "нужен корректный Authorization: Bearer <токен> или ?token=<токен>" })),
        )
            .into_response(),
    };
    // однопоточный лог запроса: видно ВСЁ, что шло через сервер (без секретов)
    println!("[api] {method} {path} -> {}", response.status().as_u16());
    response
}

async fn health() -> Json<serde_json::Value> {
    Json(json!({ "ok": true, "name": "vessel-server", "version": VERSION }))
}

async fn capabilities(State(state): State<AppState>) -> Json<ServerInfo> {
    Json((*state.info).clone())
}

async fn search(
    State(state): State<AppState>,
    AxPath(provider): AxPath<String>,
    Query(query): Query<SearchQuery>,
    headers: HeaderMap,
) -> Api<Json<PageResponse>> {
    let creds = user_credentials(&headers)?;
    let provider = state.provider(&provider, &creds).await?;
    let page = provider.search(&query.q, query.cursor.as_deref()).await?;
    Ok(Json(PageResponse { page }))
}

async fn collections(
    State(state): State<AppState>,
    AxPath(provider): AxPath<String>,
    Query(query): Query<CollectionsQuery>,
    headers: HeaderMap,
) -> Api<Json<CollectionsResponse>> {
    let kind: CollectionKind = collection_from_segment(&query.kind)
        .ok_or_else(|| ApiError(StatusCode::BAD_REQUEST, "неизвестный тип коллекции".into()))?;
    let creds = user_credentials(&headers)?;
    let provider = state.provider(&provider, &creds).await?;
    let items = provider.search_collections(&query.q, kind).await?;
    Ok(Json(CollectionsResponse { items }))
}

async fn artist_profile(
    State(state): State<AppState>,
    AxPath((provider, id)): AxPath<(String, String)>,
    headers: HeaderMap,
) -> Api<Json<ProfileResponse>> {
    let creds = user_credentials(&headers)?;
    let provider = state.provider(&provider, &creds).await?;
    let profile = provider.artist_profile(&id).await?;
    Ok(Json(ProfileResponse { profile }))
}

async fn artist_tracks(
    State(state): State<AppState>,
    AxPath((provider, id)): AxPath<(String, String)>,
    headers: HeaderMap,
) -> Api<Json<TracksResponse>> {
    let creds = user_credentials(&headers)?;
    let provider = state.provider(&provider, &creds).await?;
    let tracks = provider.artist_all_tracks(&id).await?;
    Ok(Json(TracksResponse { tracks }))
}

async fn wave(
    State(state): State<AppState>,
    AxPath(provider): AxPath<String>,
    Query(query): Query<WaveQuery>,
    headers: HeaderMap,
) -> Api<Json<TracksResponse>> {
    let creds = user_credentials(&headers)?;
    let provider = state.provider(&provider, &creds).await?;
    let tracks = provider.personal_wave(query.limit.unwrap_or(15)).await?;
    Ok(Json(TracksResponse { tracks }))
}

async fn liked(
    State(state): State<AppState>,
    AxPath(provider): AxPath<String>,
    headers: HeaderMap,
    Json(request): Json<LikedRequest>,
) -> Api<Json<TracksResponse>> {
    let creds = user_credentials(&headers)?;
    let provider = state.provider(&provider, &creds).await?;
    let tracks = provider.liked_tracks(request.profile_url.as_deref()).await?;
    Ok(Json(TracksResponse { tracks }))
}

async fn import_playlist(
    State(state): State<AppState>,
    AxPath(provider): AxPath<String>,
    headers: HeaderMap,
    Json(body): Json<ImportPlaylistRequest>,
) -> Api<Json<ImportedPlaylistResponse>> {
    let creds = user_credentials(&headers)?;
    let provider = state.provider(&provider, &creds).await?;
    let url = Url::parse(&body.url)
        .map_err(|_| ApiError(StatusCode::BAD_REQUEST, "некорректный URL плейлиста".into()))?;
    let playlist = provider.import_playlist(&url).await?;
    Ok(Json(ImportedPlaylistResponse { playlist }))
}

async fn related(
    State(state): State<AppState>,
    headers: HeaderMap,
    Json(body): Json<RelatedRequest>,
) -> Api<Json<TracksResponse>> {
    let creds = user_credentials(&headers)?;
    let provider = state.provider(kind_segment(body.track.provider), &creds).await?;
    let tracks = provider.related(&body.track, body.limit).await?;
    Ok(Json(TracksResponse { tracks }))
}

/// Разрешение аудио-источника. auto: релеим только то, что иначе не заиграет
/// с клиентского IP (file:// после расшифровки, googlevideo); prefer_relay —
/// весь http-трафик через сервер (клиент в гео-блоке).
async fn resolve(
    State(state): State<AppState>,
    AxPath(provider_segment): AxPath<String>,
    headers: HeaderMap,
    Json(body): Json<ResolveSourceRequest>,
) -> Api<Json<ResolveSourceResponse>> {
    let creds = user_credentials(&headers)?;
    let provider = state.provider(&provider_segment, &creds).await?;
    // Принцип Vessel: Spotify — метаданные, аудио играет цепочка Deezer/YTM.
    // На сервере этот путь закрыт: никаких сырых spotify-файлов под чужой сессией.
    if body.track.provider == vessel_core::model::ProviderKind::Spotify
        && provider.kind() == vessel_core::model::ProviderKind::Spotify
    {
        return Err(ApiError(
            StatusCode::NOT_IMPLEMENTED,
            "Spotify играет через Deezer/YouTube Music — сервер не отдаёт аудио Spotify".into(),
        ));
    }
    let source: PlaybackSource = provider.playback_source(&body.track).await?;

    let is_file = source.url.scheme() == "file";
    let is_hls = source.mime_type.as_deref() == Some("application/vnd.apple.mpegurl")
        || source.url.path().ends_with(".m3u8");
    let host = source.url.host_str().unwrap_or_default().to_ascii_lowercase();
    let ip_bound = host.contains("googlevideo") || host.ends_with("youtube.com") || is_hls;
    let use_relay = match state.relay_policy {
        RelayPolicy::Off => false,
        RelayPolicy::Always => true,
        RelayPolicy::Auto => (is_file || ip_bound) || body.prefer_relay,
    };
    if !use_relay && is_file {
        return Err(ApiError(
            StatusCode::NOT_IMPLEMENTED,
            "этот сервер не может отдать расшифрованный файл без relay".into(),
        ));
    }
    if !use_relay {
        println!("[api] resolve direct: {}", body.track.title);
        return Ok(Json(ResolveSourceResponse { source, relay_path: None }));
    }
    println!(
        "[api] resolve relay: {} ({})",
        body.track.title,
        if is_file {
            "file"
        } else if is_hls {
            "hls"
        } else {
            &host
        }
    );

    let (target, mime_type) = if is_file {
        let path = source
            .url
            .to_file_path()
            .map_err(|_| ApiError::new("некорректный путь временного файла сервера"))?;
        (RelayTarget::File(path), source.mime_type.clone())
    } else if is_hls {
        let hls_url = source.url.clone();
        let hls_headers = source.headers.clone();
        let (path, ext) = tokio::task::spawn_blocking(move || -> anyhow::Result<(std::path::PathBuf, &'static str)> {
            let mut hls = vessel_core::audio::HlsSource::open(&hls_url, &hls_headers, 0)?;
            let ext = hls.extension();
            let temp_dir = std::env::temp_dir().join("vessel-hls");
            std::fs::create_dir_all(&temp_dir)?;
            let file_path = temp_dir.join(format!("{}.{}", uuid::Uuid::new_v4().simple(), ext));
            let mut out = std::fs::File::create(&file_path)?;
            std::io::copy(&mut hls, &mut out)?;
            Ok((file_path, ext))
        })
        .await
        .map_err(|e| ApiError::new(format!("ошибка фоновой задачи скачивания HLS: {e}")))?
        .map_err(|e| ApiError::new(format!("не удалось собрать HLS на сервере: {e:#}")))?;

        let mime = match ext {
            "mp3" => "audio/mpeg",
            "aac" | "m4a" => "audio/mp4",
            "ogg" | "opus" => "audio/ogg",
            _ => "audio/mpeg",
        };
        (RelayTarget::File(path), Some(mime.to_string()))
    } else {
        (
            RelayTarget::Http {
                url: source.url.clone(),
                headers: relay_headers(&source.headers),
            },
            source.mime_type.clone(),
        )
    };
    let token = state.relay.mint(target, mime_type.clone());
    let mut source = source;
    source.mime_type = mime_type;
    source.supports_range = true;
    Ok(Json(ResolveSourceResponse {
        source,
        relay_path: Some(format!("{API_PREFIX}/s/{token}")),
    }))
}

/// Upstream-заголовки для relay-запроса: cookie/authorization провайдера
/// остаются на сервере, клиенту показываются только путь-токен + bearer.
fn relay_headers(headers: &std::collections::BTreeMap<String, String>) -> Vec<(String, String)> {
    headers
        .iter()
        .filter(|(name, _)| {
            !matches!(
                name.to_ascii_lowercase().as_str(),
                "cookie" | "authorization"
            )
        })
        .map(|(name, value)| (name.clone(), value.clone()))
        .collect()
}

async fn stream(
    State(state): State<AppState>,
    AxPath(token): AxPath<String>,
    headers: HeaderMap,
) -> Response {
    let Some((target, content_type)) = state.relay.get(&token) else {
        return (
            StatusCode::NOT_FOUND,
            Json(json!({ "detail": "relay-токен не найден или истёк" })),
        )
            .into_response();
    };
    let Some(permit) = state.limiter.try_acquire() else {
        return (
            StatusCode::TOO_MANY_REQUESTS,
            Json(json!({ "detail": "достигнут лимит одновременных стримов" })),
        )
            .into_response();
    };
    let range = headers
        .get(header::RANGE)
        .and_then(|value| value.to_str().ok())
        .map(str::to_string);

    match target {
        RelayTarget::Http { url, headers: upstream_headers } => {
            let mut builder = state.http.get(url.clone());
            for (name, value) in &upstream_headers {
                if let (Ok(name), Ok(value)) = (
                    HeaderName::from_bytes(name.as_bytes()),
                    HeaderValue::from_str(value),
                ) {
                    builder = builder.header(name, value);
                }
            }
            if let Some(range) = &range
                && let Ok(value) = HeaderValue::from_str(range)
            {
                builder = builder.header(header::RANGE, value);
            }
            match builder.send().await {
                Ok(upstream) => {
                    let status = upstream.status();
                    if !status.is_success() {
                        let err_text = upstream.text().await.unwrap_or_default();
                        println!("[relay upstream error] status={} url={} err={}", status, url, err_text);
                        return (status, err_text).into_response();
                    }
                    let mut keep: Vec<(HeaderName, HeaderValue)> = upstream
                        .headers()
                        .iter()
                        .filter_map(|(name, value)| {
                            matches!(
                                name.as_str(),
                                "content-length" | "content-range" | "accept-ranges" | "content-type"
                            )
                            .then(|| (name.clone(), value.clone()))
                        })
                        .collect();
                    if content_type.is_some()
                        && !keep.iter().any(|(name, _)| name == header::CONTENT_TYPE.as_str())
                    {
                        if let Ok(value) = HeaderValue::from_str(content_type.as_deref().unwrap()) {
                            keep.push((header::CONTENT_TYPE, value));
                        }
                    }
                    // Permit живёт внутри unfold-замыкания и освобождается
                    // только когда клиент доел/бросил поток.
                    let chunks = upstream.bytes_stream();
                    let body = Body::from_stream(futures_util::stream::unfold(
                        (chunks, permit),
                        |(mut chunks, guard)| async move {
                            use futures_util::StreamExt;
                            chunks.next().await.map(|item| {
                                (item.map_err(axum::Error::new), (chunks, guard))
                            })
                        },
                    ));
                    let mut response = Response::new(body);
                    *response.status_mut() = status;
                    for (name, value) in keep {
                        response.headers_mut().insert(name, value);
                    }
                    response
                }
                Err(error) => {
                    ApiError::from(anyhow!("relay-запрос к источнику не удался: {error}")).into_response()
                }
            }
        }
        RelayTarget::File(path) => serve_file(&path, range.as_deref(), content_type).await,
    }
}

/// Раздача временного расшифрованного файла (deezer/spotify) с Range.
async fn serve_file(path: &Path, range: Option<&str>, content_type: Option<String>) -> Response {
    let mut file = match tokio::fs::File::open(path).await {
        Ok(file) => file,
        Err(error) => {
            return ApiError(
                StatusCode::NOT_FOUND,
                format!("временный файл недоступен: {error}"),
            )
            .into_response();
        }
    };
    let size = match file.metadata().await {
        Ok(metadata) => metadata.len(),
        Err(error) => return ApiError::from(anyhow!("metadata файла: {error}")).into_response(),
    };
    let (start, end) = match parse_range(range, size) {
        Some(pair) => pair,
        None => (0, size.saturating_sub(1)),
    };
    let length = end.saturating_sub(start) + 1;
    if start > 0 && file.seek(std::io::SeekFrom::Start(start)).await.is_err() {
        return ApiError::new("не удалось перемотать файл").into_response();
    }
    let take = file.take(length);
    let body = Body::from_stream(tokio_util::io::ReaderStream::new(take));
    let mut response = Response::new(body);
    *response.status_mut() = if range.is_some() {
        StatusCode::PARTIAL_CONTENT
    } else {
        StatusCode::OK
    };
    {
        let headers = response.headers_mut();
        let ct = content_type.unwrap_or_else(|| "application/octet-stream".to_string());
        if let Ok(value) = HeaderValue::from_str(&ct) {
            headers.insert(header::CONTENT_TYPE, value);
        }
        if let Ok(value) = HeaderValue::from_str(&length.to_string()) {
            headers.insert(header::CONTENT_LENGTH, value);
        }
        if range.is_some()
            && let Ok(value) = HeaderValue::from_str(&format!("bytes {start}-{end}/{size}"))
        {
            headers.insert(header::CONTENT_RANGE, value);
        }
        headers.insert(header::ACCEPT_RANGES, HeaderValue::from_static("bytes"));
    }
    response
}

fn parse_range(range: Option<&str>, size: u64) -> Option<(u64, u64)> {
    let spec = range?.strip_prefix("bytes=")?;
    // суффиксный диапазон "bytes=-N" = последние N байт (symphonia ищет moov в конце)
    if let Some(suffix) = spec.strip_prefix('-') {
        let n: u64 = suffix.trim().parse().ok()?;
        let n = n.min(size);
        let start = size.checked_sub(n)?;
        return Some((start, size.saturating_sub(1)));
    }
    let (from, to) = spec.split_once('-')?;
    let start: u64 = from.trim().parse().ok()?;
    let end_raw = to.trim();
    let end: u64 = if end_raw.is_empty() || end_raw == "*" {
        size.checked_sub(1)?
    } else {
        end_raw.parse().ok()?
    };
    let end = end.min(size.saturating_sub(1));
    if start > end {
        return None;
    }
    Some((start, end))
}

fn is_allowed_image_host(host: &str) -> bool {
    let host = host.to_ascii_lowercase();
    let host = host.trim();
    // Spotify
    host.ends_with(".scdn.co") || host == "scdn.co"
        || host.ends_with(".spotifycdn.com") || host == "spotifycdn.com"
    // SoundCloud
        || host.ends_with(".sndcdn.com") || host == "sndcdn.com"
    // Deezer
        || host.ends_with(".dzcdn.net") || host == "dzcdn.net"
        || host.ends_with(".deezer.com") || host == "deezer.com"
    // YouTube / Google
        || host.ends_with(".googleusercontent.com") || host == "googleusercontent.com"
        || host.ends_with(".ggpht.com") || host == "ggpht.com"
        || host.ends_with(".ytimg.com") || host == "ytimg.com"
        || host.ends_with(".youtube.com") || host == "youtube.com"
    // Yandex
        || host.ends_with(".yandex.net") || host == "yandex.net"
        || host.ends_with(".yandex.ru") || host == "yandex.ru"
}

#[derive(Deserialize)]
struct LyricsQuery {
    track_name: Option<String>,
    artist_name: Option<String>,
    album_name: Option<String>,
    duration: Option<f64>,
    q: Option<String>,
    search: Option<bool>,
}

async fn lyrics_proxy(
    State(state): State<AppState>,
    Query(query): Query<LyricsQuery>,
) -> Response {
    let is_search = query.search.unwrap_or(false) || query.q.is_some();
    let target_base = if is_search {
        "https://lrclib.net/api/search"
    } else {
        "https://lrclib.net/api/get"
    };

    let mut url = match Url::parse(target_base) {
        Ok(u) => u,
        Err(_) => return (StatusCode::INTERNAL_SERVER_ERROR, "bad url").into_response(),
    };
    {
        let mut pairs = url.query_pairs_mut();
        if let Some(q) = query.q.as_deref().filter(|s| !s.is_empty()) {
            pairs.append_pair("q", q);
        }
        if let Some(t) = query.track_name.as_deref().filter(|s| !s.is_empty()) {
            pairs.append_pair("track_name", t);
        }
        if let Some(a) = query.artist_name.as_deref().filter(|s| !s.is_empty()) {
            pairs.append_pair("artist_name", a);
        }
        if let Some(al) = query.album_name.as_deref().filter(|s| !s.is_empty()) {
            pairs.append_pair("album_name", al);
        }
        if let Some(d) = query.duration {
            pairs.append_pair("duration", &d.to_string());
        }
    }

    match state
        .http
        .get(url)
        .timeout(std::time::Duration::from_secs(4))
        .header(header::USER_AGENT, "vessel/1.3.16 (https://github.com/shprotik1337/vessel)")
        .send()
        .await
    {
        Ok(resp) => {
            let status = resp.status();
            let bytes = resp.bytes().await.unwrap_or_default();
            let mut response = Response::new(Body::from(bytes));
            *response.status_mut() = status;
            response.headers_mut().insert(
                header::CONTENT_TYPE,
                HeaderValue::from_static("application/json"),
            );
            response
        }
        Err(err) => {
            (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "detail": format!("lrclib error: {err}") })),
            )
                .into_response()
        }
    }
}

async fn image_proxy(
    State(state): State<AppState>,
    Query(query): Query<ImageQuery>,
) -> Response {
    let parsed_url = match Url::parse(&query.url) {
        Ok(u) => u,
        Err(_) => {
            return (
                StatusCode::BAD_REQUEST,
                Json(json!({ "detail": "некорректный URL изображения" })),
            )
                .into_response();
        }
    };

    if parsed_url.scheme() != "http" && parsed_url.scheme() != "https" {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "detail": "поддерживаются только http/https URL" })),
        )
            .into_response();
    }

    let Some(host) = parsed_url.host_str() else {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({ "detail": "отсутствует хост в URL" })),
        )
            .into_response();
    };

    if !is_allowed_image_host(host) {
        return (
            StatusCode::FORBIDDEN,
            Json(json!({ "detail": format!("хост {host} не разрешён для проксирования") })),
        )
            .into_response();
    }

    // 1. Проверяем локальный дисковый кэш (отдача за 1-2 мс)
    use sha2::Digest;
    let url_hash = format!("{:x}", sha2::Sha256::digest(query.url.trim().as_bytes()));
    let img_cache_dir = state.cache_dir.join("images");
    let file_path = img_cache_dir.join(format!("{url_hash}.bin"));
    let meta_path = img_cache_dir.join(format!("{url_hash}.mime"));

    if let Ok(bytes) = tokio::fs::read(&file_path).await {
        let mime = tokio::fs::read_to_string(&meta_path)
            .await
            .unwrap_or_else(|_| "image/jpeg".to_string());
        let content_type = HeaderValue::from_str(&mime).unwrap_or_else(|_| HeaderValue::from_static("image/jpeg"));
        let mut response = Response::new(Body::from(bytes));
        *response.status_mut() = StatusCode::OK;
        response.headers_mut().insert(header::CONTENT_TYPE, content_type);
        response.headers_mut().insert(
            header::CACHE_CONTROL,
            HeaderValue::from_static("public, max-age=2592000, immutable"),
        );
        return response;
    }

    // 2. Скачиваем с источника с жестким таймаутом 4 секунды (чтобы сокеты клиента никогда не зависали)
    let upstream = match state
        .http
        .get(parsed_url.as_str())
        .timeout(std::time::Duration::from_secs(4))
        .header(
            header::ACCEPT,
            "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
        )
        .send()
        .await
    {
        Ok(resp) => resp,
        Err(err) => {
            return (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "detail": format!("ошибка запроса к источнику: {err}") })),
            )
                .into_response();
        }
    };

    let status = upstream.status();
    if !status.is_success() {
        return (
            status,
            Json(json!({ "detail": format!("источник вернул статус {status}") })),
        )
            .into_response();
    }

    let content_type = upstream
        .headers()
        .get(header::CONTENT_TYPE)
        .cloned()
        .unwrap_or_else(|| HeaderValue::from_static("image/jpeg"));

    let content_type_str = content_type
        .to_str()
        .unwrap_or("image/jpeg")
        .to_string();

    let bytes = match upstream.bytes().await {
        Ok(b) => b,
        Err(err) => {
            return (
                StatusCode::BAD_GATEWAY,
                Json(json!({ "detail": format!("ошибка чтения байт изображения: {err}") })),
            )
                .into_response();
        }
    };

    // Сохраняем в кэш в фоне
    let bytes_to_save = bytes.clone();
    tokio::spawn(async move {
        if tokio::fs::create_dir_all(&img_cache_dir).await.is_ok() {
            let _ = tokio::fs::write(&file_path, &bytes_to_save).await;
            let _ = tokio::fs::write(&meta_path, content_type_str).await;
        }
    });

    let mut response = Response::new(Body::from(bytes));
    *response.status_mut() = StatusCode::OK;
    response.headers_mut().insert(header::CONTENT_TYPE, content_type);
    response.headers_mut().insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("public, max-age=2592000, immutable"),
    );

    response
}

#[cfg(test)]
mod tests {
    use super::parse_range;

    #[test]
    fn ranges() {
        assert_eq!(parse_range(None, 100), None);
        assert_eq!(parse_range(Some("bytes=0-99"), 100), Some((0, 99)));
        assert_eq!(parse_range(Some("bytes=50-"), 100), Some((50, 99)));
        assert_eq!(parse_range(Some("bytes=0-250"), 100), Some((0, 99)));
        assert_eq!(parse_range(Some("bytes=200-300"), 100), None);
        assert_eq!(parse_range(Some("bytes=x-y"), 100), None);
        // суффиксный диапазон — последние N байт (moov в конце m4a)
        assert_eq!(parse_range(Some("bytes=-12"), 100), Some((88, 99)));
        assert_eq!(parse_range(Some("bytes=-512"), 6815744), Some((6815232, 6815743)));
    }

    #[test]
    fn allowed_image_hosts() {
        use super::is_allowed_image_host;
        assert!(is_allowed_image_host("i.scdn.co"));
        assert!(is_allowed_image_host("image-cdn-ak.spotifycdn.com"));
        assert!(is_allowed_image_host("i1.sndcdn.com"));
        assert!(is_allowed_image_host("e-cdns-images.dzcdn.net"));
        assert!(is_allowed_image_host("lh3.googleusercontent.com"));
        assert!(is_allowed_image_host("yt3.ggpht.com"));
        assert!(is_allowed_image_host("i.ytimg.com"));
        assert!(is_allowed_image_host("avatars.yandex.net"));

        assert!(!is_allowed_image_host("evil.com"));
        assert!(!is_allowed_image_host("internal.corp"));
        assert!(!is_allowed_image_host("localhost"));
        assert!(!is_allowed_image_host("192.168.1.1"));
    }
}
