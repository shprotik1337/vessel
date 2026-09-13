use std::{
    collections::HashMap,
    sync::Mutex,
    time::{Duration, Instant},
};

use anyhow::Result;
use serde_json::Value;

use crate::{
    model::{PlaybackCapability, PlaybackSource, ProviderKind, TrackRef},
};
use url::Url;

use super::{
    Innertube,
    search::search_tracks,
};

/// Кэширует не videoId, а сразу готовый PlaybackSource (URL),
/// потому что стрим-ссылка протухает через ~6 часов.
/// URL с pot= живёт меньше гугловских 6ч (pot привязан к сессии BotGuard) —
/// кэш 30 минут, дольше держать нельзя: протухший pot = трек обрывается
/// после первого MiB.
const CACHE_TTL: Duration = Duration::from_secs(30 * 60);

/// Резолвер: Spotify-трек → YouTube-стрим.
/// Создаётся один раз и переиспользуется SpotifyProvider.
pub struct YoutubeResolver {
    pub(crate) innertube: Innertube,
    /// Кэш: provider_key → (video_id, stream_url, expires_at, mime)
    cache: Mutex<HashMap<String, CachedStream>>,
}

struct CachedStream {
    url: String,
    mime: String,
    expires_at: Instant,
}

impl YoutubeResolver {
    pub fn new() -> Result<Self> {
        Ok(Self {
            innertube: Innertube::new()?,
            cache: Mutex::new(HashMap::new()),
        })
    }

    /// Задаёт URL potoken-провайдера для полного стрима.
    pub fn set_potoken_provider(&self, url: Option<String>) {
        self.innertube.client.set_potoken_provider(url);
    }

    /// Задаёт cookie залогиненного YouTube-аккаунта для полного стрима.
    pub fn set_cookie(&self, cookie: Option<String>) {
        self.innertube.client.set_cookie(cookie);
    }

    /// Задаёт OAuth refresh_token для полного стрима после перезапуска.
    pub fn set_oauth_refresh(&self, refresh: Option<String>) {
        self.innertube.client.set_oauth_refresh(refresh);
    }

    /// Ищет трек в YouTube Music по названию и артисту, матчит по длительности.
    pub async fn resolve_track(&self, track: &TrackRef) -> Result<PlaybackSource> {
        let key = track.provider_key();

        // проверяем кэш
        {
            let cache = self.cache.lock().unwrap();
            if let Some(cached) = cache.get(&key) {
                if cached.expires_at > Instant::now() {
                    let url = Url::parse(&cached.url)?;
                    return Ok(PlaybackSource {
                        url,
                        headers: std::collections::BTreeMap::new(),
                        mime_type: Some(cached.mime.clone()),
                        supports_range: true,
                        expires_at_ms: None,
                        capability: PlaybackCapability::Full,
                    });
                }
            }
        }

        // строим поисковый запрос
        let query = if track.artists.is_empty() {
            track.title.clone()
        } else {
            format!("{} - {}", track.artists.join(", "), track.title)
        };
        let results = search_tracks(self.innertube.client.as_ref(), &query).await?;

        // матчим по длительности: ±2с
        let target_ms = track.duration_ms;
        let best = results
            .iter()
            .filter(|result| {
                target_ms.is_none()
                    || result.duration_ms.is_none()
                    || result
                        .duration_ms
                        .is_some_and(|dur| {
                            let diff = (dur as i64 - target_ms.unwrap() as i64).abs();
                            diff < 3000
                        })
            })
            .min_by_key(|result| {
                result
                    .duration_ms
                    .map(|dur| {
                        target_ms
                            .map(|target| (dur as i64 - target as i64).unsigned_abs())
                            .unwrap_or(0)
                    })
                    .unwrap_or(0)
            });

        let match_track = best.ok_or_else(|| anyhow::anyhow!("YouTube не нашёл подходящего трека"))?;

        // Полный стрим через Kopuz-путь. Клиент несёт cookie/OAuth (проходят
        // бот-чек на серверных IP) и potoken-провайдер (POT без BotGuard).
        let source = super::player::resolve_stream(self.innertube.client.as_ref(), &match_track.id).await?;
        let mut source = source;
        if !source.range_safe {
            source.source.supports_range = false;
        }

        // Кэшируем только seekable-стримы: без pot URL живёт 1 MiB и портит
        // следующий запуск (перемотка ломается, хотя новая резолвка дала бы pot).
        if source.range_safe {
            let mime = source.source.mime_type.clone().unwrap_or_default();
            let url = source.source.url.to_string();
            {
                let mut cache = self.cache.lock().unwrap();
                cache.insert(
                    key,
                    CachedStream {
                        url,
                        mime,
                        expires_at: Instant::now() + CACHE_TTL,
                    },
                );
            }
        }

        Ok(source.source)
    }

    /// Поиск треков в YouTube Music (для волны и т.п.).
    pub async fn search(&self, query: &str) -> Result<Vec<TrackRef>> {
        search_tracks(self.innertube.client.as_ref(), query).await
    }

    /// Сырой Innertube search (для отладки фильтров).
    pub async fn search_raw(&self, query: &str, params: Option<&str>) -> Result<serde_json::Value> {
        self.innertube.client.search(query, params).await
    }

    /// Сырой Innertube browse (для отладки).
    pub async fn browse_raw(&self, browse_id: &str) -> Result<serde_json::Value> {
        self.innertube.client.browse(browse_id, None).await
    }

    /// Поиск похожих треков (watch-next).
    pub async fn related(&self, track_id: &str, limit: usize) -> Result<Vec<TrackRef>> {
        let next = self.innertube.client.next(track_id).await?;
        let mut tracks = Vec::new();
        collect_watch_next(&next, &mut tracks, limit);
        Ok(tracks)
    }

    /// Получает стрим по videoId (для YouTubeMusicProvider).
    pub async fn stream_for(&self, video_id: &str, _title: &str) -> Result<PlaybackSource> {
        let mut source = super::player::resolve_stream(self.innertube.client.as_ref(), video_id).await?;
        if !source.range_safe {
            source.source.supports_range = false;
        }
        Ok(source.source)
    }
}

/// Собирает похожие треки из watch-next ответа.
fn collect_watch_next(value: &Value, out: &mut Vec<TrackRef>, limit: usize) {
    // ищем musicResponsiveListItemRenderer
    if let Some(contents) = value.pointer("/contents/twoColumnWatchNextResults/results/results/contents") {
        if let Some(contents) = contents.as_array() {
            for content in contents {
                if let Some(renderer) = content.get("musicResponsiveListItemRenderer") {
                    if let Some(track) = map_watch_next_item(renderer) {
                        if out.len() < limit {
                            out.push(track);
                        }
                    }
                }
            }
        }
    }
    // также пробуем альтернативный путь
    if let Some(contents) = value.pointer("/contents/singleColumnWatchNextResults/results/results/contents") {
        if let Some(contents) = contents.as_array() {
            for content in contents {
                if let Some(renderer) = content.get("musicResponsiveListItemRenderer") {
                    if let Some(track) = map_watch_next_item(renderer) {
                        if out.len() < limit {
                            out.push(track);
                        }
                    }
                }
            }
        }
    }
}

fn map_watch_next_item(renderer: &Value) -> Option<TrackRef> {
    let video_id = renderer
        .pointer("/playlistItemData/videoId")
        .or_else(|| renderer.pointer("/navigationEndpoint/watchEndpoint/videoId"))
        .and_then(Value::as_str)?;
    let video_id = video_id.to_string();

    let mut title = String::new();
    let mut artists = Vec::new();
    if let Some(columns) = renderer.get("flexColumns").and_then(Value::as_array) {
        for column in columns {
            let text = column
                .pointer("/musicResponsiveListItemFlexColumnRenderer/text/runs/0/text")
                .and_then(Value::as_str);
            if let Some(text) = text {
                if title.is_empty() {
                    title = text.to_string();
                } else if artists.is_empty() {
                    artists = text.split(',').map(str::trim).map(str::to_string).collect();
                }
            }
        }
    }

    let duration_ms = renderer
        .pointer("/fixedColumns/0/musicResponsiveListItemFixedColumnRenderer/text/runs/0/text")
        .and_then(Value::as_str)
        .and_then(parse_duration_short);

    let web_url = Url::parse(&format!("https://music.youtube.com/watch?v={video_id}")).ok()?;

    Some(TrackRef {
        provider: ProviderKind::YouTubeMusic,
        id: video_id,
        title: if title.is_empty() { "Без названия".to_string() } else { title },
        artists,
        duration_ms,
        artwork_url: None,
        web_url,
        capability: PlaybackCapability::Full,
        genres: Vec::new(),
        explicit: false,
        drm: false,
            isrc: None,
    })
}

fn parse_duration_short(value: &str) -> Option<u64> {
    let parts: Vec<&str> = value.split(':').collect();
    let seconds: u64 = parts.last()?.parse().ok()?;
    let minutes: u64 = if parts.len() > 1 { parts[parts.len() - 2].parse().ok()? } else { 0 };
    let hours: u64 = if parts.len() > 2 { parts[0].parse().ok()? } else { 0 };
    Some((hours * 3600 + minutes * 60 + seconds) * 1000)
}
