use anyhow::Result;
use serde_json::Value;

use crate::{
    model::{PlaybackCapability, ProviderKind, TrackRef},
    provider::{CollectionItem, CollectionKind},
};

use super::client::YoutubeClient;

/// params для youtubei/v1/search, фильтрующие результат по типу
/// (актуальные — из Kopuz search.rs).
const PARAMS_SONG: &str = "EgWKAQIIAWoMEAMQBBAJEAoQDhAV";
const PARAMS_ALBUM: &str = "EgWKAQIYAWoMEAMQBBAJEAoQDhAV";
const PARAMS_ARTIST: &str = "EgWKAQIgAWoMEAMQBBAJEAoQDhAV";

/// Песни. Лестница: со старым Kopuz-фильтром, пусто — тот же запрос без него.
/// Страховка на случай, когда Google начинает игнорировать/резать фильтры
/// (с IPv6-выходов VPS Google отдавал пустой рендер вообще всегда — см.
/// VESSEL_YT_PROXY; на IPv4 оба варианта рабочие).
pub async fn search_tracks(client: &YoutubeClient, query: &str) -> Result<Vec<TrackRef>> {
    let mut tracks = Vec::new();
    if let Ok(response) = client.search(query, Some(PARAMS_SONG)).await {
        tracks = collect_songs(&response);
    }
    if tracks.is_empty() {
        let response = client.search(query, None).await?;
        tracks = collect_songs(&response);
    }
    Ok(tracks)
}

/// Общий поиск YTM (без songs-фильтра): здесь всплывают официальные клипы
/// и «Видео»-результаты, которых нет в каталоге «Композиций» (трек удалён
/// из каталога, но клип остался). Тот же парсер musicResponsiveListItemRenderer.
pub async fn search_tracks_general(client: &YoutubeClient, query: &str) -> Result<Vec<TrackRef>> {
    let response = client.search(query, None).await?;
    Ok(collect_songs(&response))
}

/// Поиск коллекций (плейлисты/альбомы/артисты).
/// Плейлисты ищутся без params-фильтра (актуального фильтра нет) —
/// pageType-фильтрация в map_collection отбирает только плейлисты.
pub async fn search_collections(
    client: &YoutubeClient,
    query: &str,
    kind: CollectionKind,
) -> Result<Vec<CollectionItem>> {
    let params = match kind {
        CollectionKind::Playlist => None,
        CollectionKind::Album => Some(PARAMS_ALBUM),
        CollectionKind::Artist => Some(PARAMS_ARTIST),
    };
    let response = client.search(query, params).await?;
    let mut items = collect_items(&response, kind);
    // Если с фильтром пусто — повторяем без него (тот же страховочный путь).
    if items.is_empty() && params.is_some() {
        let retry = client.search(query, None).await?;
        items = collect_items(&retry, kind);
    }
    Ok(items)
}

/// Собирает треки из musicResponsiveListItemRenderer в ответе поиска.
pub fn collect_songs(response: &Value) -> Vec<TrackRef> {
    let mut tracks = Vec::new();
    collect_renderers(response, &mut |renderer| {
        if let Some(track) = map_song(renderer) {
            tracks.push(track);
        }
    });
    tracks
}

/// Собирает коллекции из musicResponsiveListItemRenderer.
pub fn collect_items(response: &Value, kind: CollectionKind) -> Vec<CollectionItem> {
    let mut items = Vec::new();
    collect_renderers(response, &mut |renderer| {
        if let Some(item) = map_collection(renderer, kind) {
            items.push(item);
        }
    });
    items
}

/// Рекурсивно обходит дерево и вызывает callback для каждого
/// musicResponsiveListItemRenderer.
fn collect_renderers<F>(value: &Value, callback: &mut F)
where
    F: FnMut(&Value),
{
    match value {
        Value::Object(map) => {
            for (key, value) in map {
                if key == "musicResponsiveListItemRenderer" {
                    callback(value);
                } else {
                    collect_renderers(value, callback);
                }
            }
        }
        Value::Array(items) => {
            for item in items {
                collect_renderers(item, callback);
            }
        }
        _ => {}
    }
}

/// Маппит musicResponsiveListItemRenderer в TrackRef.
fn map_song(renderer: &Value) -> Option<TrackRef> {
    // videoId — обязателен, без него трек не проиграть.
    // У видео лежит в playlistItemData, у песен — в первой flexColumn.
    let video_id = renderer
        .pointer("/playlistItemData/videoId")
        .or_else(|| {
            renderer.pointer(
                "/flexColumns/0/musicResponsiveListItemFlexColumnRenderer/text/runs/0/navigationEndpoint/watchEndpoint/videoId",
            )
        })
        .or_else(|| renderer.pointer("/navigationEndpoint/watchEndpoint/videoId"))
        .and_then(Value::as_str)?;
    let video_id = video_id.to_string();

    // Название — первая колонка flexColumns
    let mut title = String::new();
    let mut artists = Vec::new();
    let mut duration_ms: Option<u64> = None;

    if let Some(columns) = renderer.get("flexColumns").and_then(Value::as_array) {
        for column in columns {
            let text = column
                .pointer("/musicResponsiveListItemFlexColumnRenderer/text")
                .and_then(runs_text);
            let Some(text) = text else { continue };
            if title.is_empty() {
                title = text;
            } else if artists.is_empty() {
                // Вторая колонка в songs-результатах: "Артист • Альбом".
                // Артист — ДО первого " • ".
                let mut artist_raw = text.split_once(" • ").map(|(artist, _)| artist).unwrap_or(&text).to_string();
                // В общем поиске колонка начинается с категории:
                // «Видео • Элджей и FEDUK • 181 млн просмотров»,
                // «Композиция • Элджей» — артист идёт ПОСЛЕ категории.
                const CATEGORY_PREFIXES: &[&str] = &[
                    "видео", "композиция", "song", "video", "album", "single", "ep",
                    "исполнитель", "artist", "playlist", "плейлист", "album",
                ];
                if CATEGORY_PREFIXES.contains(&artist_raw.trim().to_lowercase().as_str()) {
                    if let Some((_, rest)) = text.split_once(" • ") {
                        artist_raw = rest
                            .split_once(" • ")
                            .map(|(artist, _)| artist)
                            .unwrap_or(rest)
                            .to_string();
                    }
                }
                artists = artist_raw
                    .split(',')
                    .map(str::trim)
                    .filter(|a| !a.is_empty() && !super::provider::is_play_count(a))
                    .map(str::to_string)
                    .collect();
                // Video-результаты: "Название • Длительность" — артиста нет
                if artists.len() == 1
                    && artists[0].contains(':')
                    && artists[0].chars().all(|c| c.is_ascii_digit() || c == ':' || c == ' ')
                {
                    artists.clear();
                }
            }
        }
    }

    // Длительность: в fixedColumns (редко) или в accessibility-лейбле вида
    // "Video • ... • 5 minutes, 19 seconds"
    if let Some(fixed) = renderer
        .pointer("/fixedColumns/0/musicResponsiveListItemFixedColumnRenderer/text/runs")
        .and_then(Value::as_array)
    {
        duration_ms = fixed
            .first()
            .and_then(|run| run.get("text"))
            .and_then(Value::as_str)
            .and_then(parse_duration);
    }
    if duration_ms.is_none() {
        // ищем в лейблах всех flex-колонок
        if let Some(columns) = renderer.get("flexColumns").and_then(Value::as_array) {
            for column in columns {
                let label = column
                    .pointer("/musicResponsiveListItemFlexColumnRenderer/text/accessibility/accessibilityData/label")
                    .and_then(Value::as_str)
                    .unwrap_or("");
                if let Some(ms) = parse_duration_label(label) {
                    duration_ms = Some(ms);
                    break;
                }
            }
        }
    }

    let artwork_url_str = renderer
        .pointer("/thumbnail/musicThumbnailRenderer/thumbnail/thumbnails/0/url")
        .and_then(Value::as_str)
        .map(str::to_string);
    let artwork_url = artwork_url_str.and_then(|mut url| {
        if url.starts_with("//") {
            url.insert_str(0, "https:");
        }
        url = url.replace("=w60-h60", "=w544-h544-l90");
        url::Url::parse(&url).ok()
    });

    let web_url = url::Url::parse(&format!(
        "https://music.youtube.com/watch?v={video_id}"
    ))
    .ok()?;

    artists.retain(|a| !super::provider::is_play_count(a));

    Some(TrackRef {
        provider: ProviderKind::YouTubeMusic,
        id: video_id,
        title: if title.is_empty() { "Без названия".to_string() } else { title },
        artists,
        duration_ms,
        artwork_url,
        web_url,
        capability: PlaybackCapability::Full,
        genres: Vec::new(),
        explicit: false,
        drm: false,
            isrc: None,
    })
}

/// Маппит коллекцию (плейлист/альбом/артист).
fn map_collection(renderer: &Value, kind: CollectionKind) -> Option<CollectionItem> {
    let browse_endpoint = renderer
        .pointer("/navigationEndpoint/browseEndpoint")?;
    let page_type = browse_endpoint
        .pointer("/browseEndpointContextSupportedConfigs/browseEndpointContextMusicConfig/pageType")
        .and_then(Value::as_str)?;
    let expected = match kind {
        CollectionKind::Album => "MUSIC_PAGE_TYPE_ALBUM",
        CollectionKind::Artist => "MUSIC_PAGE_TYPE_ARTIST",
        CollectionKind::Playlist => "MUSIC_PAGE_TYPE_PLAYLIST",
    };
    if page_type != expected {
        return None;
    }
    let browse_id = browse_endpoint
        .pointer("/browseId")
        .and_then(Value::as_str)?;
    let browse_id = browse_id.to_string();

    let mut title = String::new();
    let mut subtitle = String::new();

    if let Some(columns) = renderer.get("flexColumns").and_then(Value::as_array) {
        for column in columns {
            let text = column
                .pointer("/musicResponsiveListItemFlexColumnRenderer/text")
                .and_then(runs_text);
            let Some(text) = text else { continue };
            if title.is_empty() {
                title = text;
            } else if subtitle.is_empty() {
                subtitle = text;
            }
        }
    }

    let artwork_url = renderer
        .pointer("/thumbnail/musicThumbnailRenderer/thumbnail/thumbnails/0/url")
        .and_then(Value::as_str)
        .map(|url| {
            let mut url = url.to_string();
            if url.starts_with("//") {
                url.insert_str(0, "https:");
            }
            url.replace("=w60-h60", "=w544-h544-l90")
        })
        .and_then(|url| url::Url::parse(&url).ok());

    let web_url = url::Url::parse(&format!("https://music.youtube.com/browse/{browse_id}")).ok()?;

    let subtitle = if subtitle.is_empty() {
        match kind {
            CollectionKind::Playlist => "Плейлист".to_string(),
            CollectionKind::Album => "Альбом".to_string(),
            CollectionKind::Artist => "Артист".to_string(),
        }
    } else {
        subtitle
    };

    Some(CollectionItem {
        kind,
        provider: ProviderKind::YouTubeMusic,
        id: browse_id,
        title: if title.is_empty() { "Без названия".to_string() } else { title },
        subtitle,
        artwork_url,
        web_url,
        track_count: 0,
    })
}

/// Извлекает текст из runs/stringValue структуры.
fn runs_text(value: &Value) -> Option<String> {
    if let Some(runs) = value.get("runs").and_then(Value::as_array) {
        let mut result = String::new();
        for run in runs {
            if let Some(text) = run.get("text").and_then(Value::as_str) {
                result.push_str(text);
            }
        }
        return Some(result.trim().to_string());
    }
    value.get("simpleText").and_then(Value::as_str).map(str::to_string)
}

/// Парсит длительность вида "3:45" или "1:02:30" в миллисекунды.
fn parse_duration(value: &str) -> Option<u64> {
    let mut parts = value.split(':').filter_map(|part| part.trim().parse::<u64>().ok());
    let seconds = parts.next_back()?;
    let minutes = parts.next_back().unwrap_or(0);
    let hours = parts.next_back().unwrap_or(0);
    Some(((hours * 3600) + (minutes * 60) + seconds) * 1000)
}

/// Парсит длительность из accessibility-лейбла вида
/// "Video • WTFMusic HD • 254 thousand views • 5 minutes, 19 seconds".
/// Длительность всегда в конце после последнего "•".
fn parse_duration_label(label: &str) -> Option<u64> {
    let part = label.rsplit_once('•').map(|(_, rest)| rest).unwrap_or(label);
    let part = part.trim();
    if part.is_empty() {
        return None;
    }
    let lower = part.to_ascii_lowercase();
    // "5:19" или "1:02:30"
    if part.contains(':') {
        return parse_duration(part);
    }
    // "5 minutes, 19 seconds" / "3 min 30 sec"
    let nums: Vec<u64> = part
        .split(|ch: char| !ch.is_ascii_digit())
        .filter_map(|token| token.parse().ok())
        .collect();
    if nums.is_empty() {
        return None;
    }
    if lower.contains("hour") {
        let hours = nums.first().copied().unwrap_or(0);
        let minutes = nums.get(1).copied().unwrap_or(0);
        Some((hours * 3600 + minutes * 60) * 1000)
    } else if lower.contains("minute") || lower.contains("min ") || lower.contains(" min") {
        let minutes = nums.first().copied().unwrap_or(0);
        let seconds = nums.get(1).copied().unwrap_or(0);
        Some((minutes * 60 + seconds) * 1000)
    } else if lower.contains("second") {
        Some(nums.first().copied().unwrap_or(0) * 1000)
    } else {
        None
    }
}
