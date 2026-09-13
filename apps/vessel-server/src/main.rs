//! Vessel Server — `/api/v1` поверх тех же реализаций провайдеров, что и в
//! локальном режиме (vessel-core build_registry + SecretStore сервера).
//! Никакого постоянного музыкального кэша: только обработка запросов и
//! короткий транзитный relay аудио (`/api/v1/s/{token}`).

mod config;
mod relay;

use std::{net::SocketAddr, path::Path, path::PathBuf, sync::Arc};

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
    model::PlaybackSource,
    protocol::{
        API_PREFIX, CollectionsResponse, ImportPlaylistRequest, ImportedPlaylistResponse,
        LikedRequest, PageResponse, ProfileResponse, RelatedRequest, ResolveSourceRequest,
        ResolveSourceResponse, ServerCapabilities, ServerInfo, TracksResponse,
        collection_from_segment, kind_from_segment, kind_segment,
    },
    provider::{CollectionKind, MusicProvider, ProviderRegistry},
    secrets::SecretStore,
};

const VERSION: &str = env!("CARGO_PKG_VERSION");

#[derive(Clone)]
struct AppState {
    registry: Arc<ProviderRegistry>,
    tokens: Arc<Vec<String>>,
    info: Arc<ServerInfo>,
    relay: Arc<RelayStore>,
    limiter: RelayLimiter,
    relay_policy: RelayPolicy,
    http: reqwest::Client,
}

impl AppState {
    fn provider(&self, segment: &str) -> Result<Arc<dyn MusicProvider>, ApiError> {
        let kind = kind_from_segment(segment)
            .ok_or_else(|| ApiError(StatusCode::NOT_FOUND, "неизвестный провайдер".into()))?;
        self.registry
            .get(kind)
            .ok_or_else(|| ApiError(
                StatusCode::NOT_FOUND,
                format!("провайдер {} не настроен на сервере", kind.label()),
            ))
    }
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

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let config_path = std::env::args()
        .nth(1)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("server.toml"));
    let cfg = ServerConfig::load(&config_path)?;
    std::fs::create_dir_all(&cfg.server.data_dir).ok();

    let secrets = SecretStore::new(cfg.secrets_file());
    let setup = vessel_core::runtime::providers::build_registry(&cfg.app, &secrets, false);
    for notice in &setup.notices {
        println!("[vessel-server] {notice}");
    }
    let providers: Vec<String> = setup.registry.kinds().map(|k| kind_segment(k).to_string()).collect();
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
        providers,
    };
    println!(
        "[vessel-server] {} v{}: {} провайдеров на бэкенде, relay={:?}, {} access-токенов",
        info.name,
        info.version,
        info.providers.len(),
        cfg.server.relay,
        cfg.server.tokens.len(),
    );

    let mut http_builder = reqwest::Client::builder()
        .user_agent(concat!("vessel-server/", env!("CARGO_PKG_VERSION")))
        .timeout(std::time::Duration::from_secs(60));
    // googlevideo/youtube стримы привязаны к IP, который их получил (через
    // egress), поэтому relay-вытягивание идёт тем же SOCKS5- exit'ом.
    if let Ok(egress) = std::env::var("VESSEL_YT_PROXY")
        && !egress.is_empty()
    {
        let egress = egress.clone();
        let proxy = reqwest::Proxy::custom(move |url| {
            let host = url.host_str().unwrap_or_default().to_ascii_lowercase();
            if host.contains("googlevideo") || host.ends_with("youtube.com") {
                Some(egress.clone())
            } else {
                None
            }
        });
        http_builder = http_builder.proxy(proxy);
    }

    let state = AppState {
        registry: Arc::new(setup.registry),
        tokens: Arc::new(cfg.server.tokens.clone()),
        info: Arc::new(info),
        relay: Arc::new(RelayStore::new(cfg.server.relay_ttl_secs)),
        limiter: RelayLimiter::new(cfg.server.max_streams.max(1)),
        relay_policy,
        http: http_builder.build()?,
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
    let response = if method == Method::GET && path == "/api/v1/health" {
        return next.run(request).await;
    } else {
        let bearer = request
            .headers()
            .get(header::AUTHORIZATION)
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.strip_prefix("Bearer "))
            .map(str::to_string);
        match bearer {
            Some(token) if state.tokens.iter().any(|allowed| allowed == &token) => next.run(request).await,
            _ => (
                StatusCode::UNAUTHORIZED,
                Json(json!({ "detail": "нужен корректный Authorization: Bearer <токен>" })),
            )
                .into_response(),
        }
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
) -> Api<Json<PageResponse>> {
    let provider = state.provider(&provider)?;
    let page = provider.search(&query.q, query.cursor.as_deref()).await?;
    Ok(Json(PageResponse { page }))
}

async fn collections(
    State(state): State<AppState>,
    AxPath(provider): AxPath<String>,
    Query(query): Query<CollectionsQuery>,
) -> Api<Json<CollectionsResponse>> {
    let kind: CollectionKind = collection_from_segment(&query.kind)
        .ok_or_else(|| ApiError(StatusCode::BAD_REQUEST, "неизвестный тип коллекции".into()))?;
    let provider = state.provider(&provider)?;
    let items = provider.search_collections(&query.q, kind).await?;
    Ok(Json(CollectionsResponse { items }))
}

async fn artist_profile(
    State(state): State<AppState>,
    AxPath((provider, id)): AxPath<(String, String)>,
) -> Api<Json<ProfileResponse>> {
    let provider = state.provider(&provider)?;
    let profile = provider.artist_profile(&id).await?;
    Ok(Json(ProfileResponse { profile }))
}

async fn artist_tracks(
    State(state): State<AppState>,
    AxPath((provider, id)): AxPath<(String, String)>,
) -> Api<Json<TracksResponse>> {
    let provider = state.provider(&provider)?;
    let tracks = provider.artist_all_tracks(&id).await?;
    Ok(Json(TracksResponse { tracks }))
}

async fn wave(
    State(state): State<AppState>,
    AxPath(provider): AxPath<String>,
    Query(query): Query<WaveQuery>,
) -> Api<Json<TracksResponse>> {
    let provider = state.provider(&provider)?;
    let tracks = provider.personal_wave(query.limit.unwrap_or(15)).await?;
    Ok(Json(TracksResponse { tracks }))
}

async fn liked(
    State(state): State<AppState>,
    AxPath(provider): AxPath<String>,
    Json(request): Json<LikedRequest>,
) -> Api<Json<TracksResponse>> {
    let provider = state.provider(&provider)?;
    let tracks = provider.liked_tracks(request.profile_url.as_deref()).await?;
    Ok(Json(TracksResponse { tracks }))
}

async fn import_playlist(
    State(state): State<AppState>,
    AxPath(provider): AxPath<String>,
    Json(body): Json<ImportPlaylistRequest>,
) -> Api<Json<ImportedPlaylistResponse>> {
    let provider = state.provider(&provider)?;
    let url = Url::parse(&body.url)
        .map_err(|_| ApiError(StatusCode::BAD_REQUEST, "некорректный URL плейлиста".into()))?;
    let playlist = provider.import_playlist(&url).await?;
    Ok(Json(ImportedPlaylistResponse { playlist }))
}

async fn related(
    State(state): State<AppState>,
    Json(body): Json<RelatedRequest>,
) -> Api<Json<TracksResponse>> {
    let provider = state.provider(kind_segment(body.track.provider))?;
    let tracks = provider.related(&body.track, body.limit).await?;
    Ok(Json(TracksResponse { tracks }))
}

/// Разрешение аудио-источника. auto: релеим только то, что иначе не заиграет
/// с клиентского IP (file:// после расшифровки, googlevideo); prefer_relay —
/// весь http-трафик через сервер (клиент в гео-блоке).
async fn resolve(
    State(state): State<AppState>,
    AxPath(provider_segment): AxPath<String>,
    Json(body): Json<ResolveSourceRequest>,
) -> Api<Json<ResolveSourceResponse>> {
    let provider = state.provider(&provider_segment)?;
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
    let host = source.url.host_str().unwrap_or_default().to_ascii_lowercase();
    let ip_bound = host.contains("googlevideo") || host.ends_with("youtube.com");
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
    println!("[api] resolve relay: {} ({})", body.track.title, if is_file { "file" } else { &host });

    let target = if is_file {
        let path = source
            .url
            .to_file_path()
            .map_err(|_| ApiError::new("некорректный путь временного файла сервера"))?;
        RelayTarget::File(path)
    } else {
        RelayTarget::Http {
            url: source.url.clone(),
            headers: relay_headers(&source.headers),
        }
    };
    let token = state.relay.mint(target, source.mime_type.clone());
    let mut source = source;
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
            let mut builder = state.http.get(url);
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
}
