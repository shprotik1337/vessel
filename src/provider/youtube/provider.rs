use anyhow::{Context, Result, bail};
use async_trait::async_trait;
use serde_json::Value;
use url::Url;

use futures_util::future::join_all;

use crate::{
    model::{PlaybackSource, ProviderKind, TrackRef},
    provider::{
        ArtistProfile, Attribution, CollectionItem, CollectionKind, ImportedPlaylist, MusicProvider,
        SearchPage,
    },
};

use super::{
    attribution, client::YoutubeClient,
    mapping::{normalize_collection, normalize_track},
    search::{search_collections, search_tracks},
};

/// Провайдер YouTube Music. Не требует credentials: поиск и стримы работают
/// анонимно через Innertube API.
pub struct YouTubeMusicProvider {
    pub(crate) client: YoutubeClient,
    /// Кэш «вся музыка» по artistId: первая загрузка делает десятки browse-
    /// запросов, повторные (открытие карточки, «показать всё») — мгновенны.
    pub(crate) all_tracks_cache:
        std::sync::Mutex<std::collections::HashMap<String, Vec<TrackRef>>>,
    /// Кэш профилей артистов: artist_profile делает 2 тяжёлых browse
    /// (страница + плейлист топ-треков), повторное открытие карточки — мгновенно.
    pub(crate) profile_cache:
        std::sync::Mutex<std::collections::HashMap<String, ArtistProfile>>,
}

impl YouTubeMusicProvider {
    /// Доступ к общему Innertube-клиенту (для общего поиска резолвера).
    pub fn client(&self) -> YoutubeClient {
        self.client.clone()
    }

    async fn artist_profile_uncached(
        client: &YoutubeClient,
        artist_id: &str,
    ) -> Result<ArtistProfile> {
        let value = client.browse(artist_id, None).await?;
        let name = value
            .pointer("/header/musicImmersiveHeaderRenderer/title/runs/0/text")
            .or_else(|| {
                value
                    .pointer("/header/musicEditablePlaylistDetailHeaderRenderer/title/runs/0/text")
            })
            .and_then(Value::as_str)
            .unwrap_or("Артист")
            .to_string();

        // Аватар: thumbnail хедера (последняя = самая большая)
        let avatar_url = value
            .pointer("/header/musicImmersiveHeaderRenderer/thumbnail/musicThumbnailRenderer/thumbnail/thumbnails")
            .and_then(Value::as_array)
            .and_then(|thumbs| thumbs.iter().last())
            .and_then(|t| t.get("url"))
            .and_then(Value::as_str)
            .and_then(|u| {
                let mut u = u.to_string();
                if u.starts_with("//") {
                    u.insert_str(0, "https:");
                }
                url::Url::parse(&u).ok()
            });

        // Топ-треки: шельф показывает лишь 5 — полный список в плейлисте
        // по bottomEndpoint (VLOLAK5uy_...). Если он есть — тянем его.
        let mut popular = collect_artist_tracks(&value);
        if let Some(playlist_id) = artist_top_songs_playlist(&value)
            && let Ok(top) = client.browse(&playlist_id, None).await
        {
            let full = collect_playlist_tracks(&top);
            if full.len() > popular.len() {
                popular = full;
            }
        }

        let releases = collect_artist_releases(&value);

        // Как у других платформ: 10 популярных треков
        popular.truncate(10);
        for track in &mut popular {
            track.artists.retain(|a| !is_play_count(a));
            if track.artists.is_empty() {
                track.artists = vec![name.clone()];
            }
        }

        Ok(ArtistProfile {
            name,
            avatar_url,
            popular_tracks: popular,
            releases,
        })
    }


    pub fn new() -> Result<Self> {
        Ok(Self {
            client: YoutubeClient::new()?,
            all_tracks_cache: std::sync::Mutex::new(std::collections::HashMap::new()),
            profile_cache: std::sync::Mutex::new(std::collections::HashMap::new()),
        })
    }

    /// Задаёт URL potoken-провайдера для полного стрима.
    pub fn set_potoken_provider(&self, url: Option<String>) {
        self.client.set_potoken_provider(url);
    }

    /// Задаёт cookie залогиненного YouTube-аккаунта для полного стрима.
    pub fn set_cookie(&self, cookie: Option<String>) {
        self.client.set_cookie(cookie);
    }

    /// Задаёт OAuth refresh_token для полного стрима после перезапуска.
    pub fn set_oauth_refresh(&self, refresh: Option<String>) {
        self.client.set_oauth_refresh(refresh);
    }

    /// Начало OAuth-флоу (device code): возвращает user_code и verification_url.
    pub async fn oauth_begin(&self) -> Result<(String, String)> {
        self.client.oauth_begin().await
    }

    /// Завершение OAuth: ожидает подтверждения, возвращает refresh_token.
    pub async fn oauth_complete(&self) -> Result<String> {
        self.client.oauth_complete().await
    }

    /// Стрим по videoId: Kopuz-путь (WEB_REMIX+cookie+decipher → ANDROID_VR).
    /// Использует общий клиент: его cookie/OAuth проходят бот-чек на серверных
    /// IP, potoken-провайдер даёт POT там, где локальный BotGuard не тянет.
    pub async fn stream(&self, video_id: &str) -> Result<PlaybackSource> {
        let resolved = super::player::resolve_stream(&self.client, video_id).await?;
        let mut source = resolved.source;
        if !resolved.range_safe {
            // ANDROID_VR без POT: сервер отдаст ~1 MiB; запрещаем seek,
            // чтобы плеер не получил 403 на глубоком range.
            source.supports_range = false;
        }
        Ok(source)
    }
}

#[async_trait]
impl MusicProvider for YouTubeMusicProvider {
    fn kind(&self) -> ProviderKind {
        ProviderKind::YouTubeMusic
    }

    fn as_any(&self) -> &dyn std::any::Any {
        self
    }

    fn attribution(&self) -> Attribution {
        attribution()
    }

    async fn search(&self, query: &str, cursor: Option<&str>) -> Result<SearchPage> {
        let _ = cursor;
        let tracks = search_tracks(&self.client, query).await?;
        Ok(SearchPage {
            tracks,
            next_cursor: None,
        })
    }

    async fn search_collections(
        &self,
        query: &str,
        kind: CollectionKind,
    ) -> Result<Vec<CollectionItem>> {
        search_collections(&self.client, query, kind).await
    }

    async fn artist_profile(&self, artist_id: &str) -> Result<ArtistProfile> {
        // Кэш: профиль = 2 тяжёлых browse (страница + плейлист топ-треков)
        if let Ok(cache) = self.profile_cache.lock()
            && let Some(cached) = cache.get(artist_id)
        {
            return Ok(cached.clone());
        }
        let profile = Self::artist_profile_uncached(&self.client, artist_id).await?;
        if let Ok(mut cache) = self.profile_cache.lock() {
            cache.insert(artist_id.to_string(), profile.clone());
        }
        Ok(profile)
    }

    async fn import_playlist(&self, url: &Url) -> Result<ImportedPlaylist> {
        let browse_id = extract_playlist_browse_id(url)
            .context("не удалось определить ID плейлиста YouTube Music")?;
        let value = self.client.browse(&browse_id, None).await?;

        let title = value
            .pointer("/header/musicEditablePlaylistDetailHeaderRenderer/title/runs/0/text")
            .or_else(|| value.pointer("/header/musicPlaylistHeaderRenderer/title/runs/0/text"))
            .or_else(|| {
                // Альбомы: header внутри twoColumnBrowseResultsRenderer
                value
                    .pointer("/contents/twoColumnBrowseResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents/0/musicResponsiveHeaderRenderer/title/runs/0/text")
            })
            .and_then(Value::as_str)
            .unwrap_or("YouTube Music плейлист")
            .to_string();

        let description = value
            .pointer("/header/musicEditablePlaylistDetailHeaderRenderer/subtitle/runs/0/text")
            .and_then(Value::as_str)
            .map(|s| s.to_string())
            .or_else(|| {
                // Альбомы: subtitle = [Тип, " • ", Год] — склеиваем runs
                value
                    .pointer("/contents/twoColumnBrowseResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents/0/musicResponsiveHeaderRenderer/subtitle/runs")
                    .and_then(Value::as_array)
                    .map(|runs| {
                        runs.iter()
                            .filter_map(|r| r.get("text").and_then(Value::as_str))
                            .collect::<String>()
                    })
            })
            .unwrap_or_default();

        let cover_url_raw: Option<String> = value
            .pointer("/header/musicEditablePlaylistDetailHeaderRenderer/thumbnail/musicThumbnailRenderer/thumbnail/thumbnails/0/url")
            .or_else(|| {
                value
                    .pointer("/header/musicPlaylistHeaderRenderer/playlistHeaderBanner/musicThumbnailRenderer/thumbnail/thumbnails/0/url")
            })
            .and_then(Value::as_str)
            .map(str::to_string)
            .or_else(|| {
                // Альбомы: обложка из responsiveHeader (последняя = самая большая)
                value
                    .pointer("/contents/twoColumnBrowseResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents/0/musicResponsiveHeaderRenderer/thumbnail/musicThumbnailRenderer/thumbnail/thumbnails")
                    .and_then(Value::as_array)
                    .and_then(|thumbs| thumbs.iter().last())
                    .and_then(|t| t.get("url"))
                    .and_then(Value::as_str)
                    .map(str::to_string)
            });
        let cover_url = cover_url_raw.and_then(|url| {
            let mut url = url;
            if url.starts_with("//") {
                url.insert_str(0, "https:");
            }
            url::Url::parse(&url).ok()
        });

        let mut tracks = collect_playlist_tracks(&value);
        // В album/playlist-шельфах у треков нет thumbnail — подставляем
        // обложку релиза каждому треку
        for track in &mut tracks {
            if track.artwork_url.is_none() {
                track.artwork_url = cover_url.clone();
            }
        }

        Ok(ImportedPlaylist {
            title,
            description,
            source_url: url.clone(),
            cover_url,
            tracks,
        })
    }

    /// Все треки артиста: плейлист «Top songs» (bottomEndpoint шельфа) содержит
    /// полный каталог; шельф на странице — только первые 5.
    async fn artist_all_tracks(&self, artist_id: &str) -> Result<Vec<TrackRef>> {
        // Кэш: первая загрузка тяжёлая (browse всех релизов), повторы мгновенны
        if let Ok(cache) = self.all_tracks_cache.lock()
            && let Some(cached) = cache.get(artist_id)
        {
            return Ok(cached.clone());
        }
        let value = self.client.browse(artist_id, None).await?;
        // Полный каталог = треки всех релизов (Albums → Singles & EPs,
        // каждый релиз в оригинальном порядке). Новые релизы — первыми,
        // т.к. карусели YouTube отсортированы от новых к старым.
        let releases = collect_artist_releases(&value);
        if !releases.is_empty() {
            let mut seen = std::collections::HashSet::new();
            let mut tracks = Vec::new();
            // Параллельные чанки по 4: 16 релизов серией в ~4 волны вместо
            // 16 последовательных browse-запросов. Порядок сохраняем.
            for chunk in releases.chunks(6) {
                let jobs = chunk.iter().map(|release| async move {
                    let album = self.client.browse(&release.id, None).await;
                    (release, album)
                });
                let results = join_all(jobs).await;
                for (release, album) in results {
                    let Ok(album) = album else { continue };
                    for mut track in collect_playlist_tracks(&album) {
                        // Обложка релиза, если у трека нет своей
                        if track.artwork_url.is_none() {
                            track.artwork_url = release.artwork_url.clone();
                        }
                        if seen.insert(track.id.clone()) {
                            tracks.push(track);
                        }
                    }
                }
            }
            if !tracks.is_empty() {
                return Ok(tracks);
            }
        }
        // Fallback: плейлист Top songs (по популярности, ~100 шт.)
        if let Some(playlist_id) = artist_top_songs_playlist(&value)
            && let Ok(top) = self.client.browse(&playlist_id, None).await
        {
            let mut tracks = collect_playlist_tracks(&top);
            tracks.dedup_by(|a, b| a.id == b.id);
            if !tracks.is_empty() {
                return Ok(tracks);
            }
        }
        // Fallback: всё, что есть на странице артиста.
        let tracks = collect_artist_songs(&value);
            if !tracks.is_empty() {
                if let Ok(mut cache) = self.all_tracks_cache.lock() {
                    cache.insert(artist_id.to_string(), tracks.clone());
                }
                return Ok(tracks);
            }
        // Последний fallback: поиск по имени.
        let name = value
            .pointer("/header/musicImmersiveHeaderRenderer/title/runs/0/text")
            .or_else(|| {
                value
                    .pointer("/header/musicEditablePlaylistDetailHeaderRenderer/title/runs/0/text")
            })
            .and_then(Value::as_str)
            .unwrap_or("Артист")
            .to_string();
        let tracks = search_tracks(&self.client, &name).await?;
        Ok(tracks)
    }

    async fn related(&self, track: &TrackRef, limit: usize) -> Result<Vec<TrackRef>> {
        let next = self.client.next(&track.id).await?;
        Ok(collect_related_tracks(&next, limit))
    }

    async fn playback_source(&self, track: &TrackRef) -> Result<PlaybackSource> {
        // Если трек уже скачан в общий кэш — играем из него
        if let Some(source) = crate::provider::cache::cached_source(track) {
            return Ok(source);
        }
        self.stream(&track.id).await
    }
}

impl YouTubeMusicProvider {
    /// Проверяет доступность: делает реальный поисковый запрос.
    pub async fn probe(&self) -> Result<()> {
        search_tracks(&self.client, "vessel probe").await.map(|_| ())
    }

    /// Поиск в Innertube с сырыми параметрами (для отладки).
    pub async fn client_search(&self, query: &str, params: Option<&str>) -> Result<serde_json::Value> {
        self.client.search(query, params).await
    }
}

/// Достаёт browseId из URL плейлиста YouTube Music.
fn extract_playlist_browse_id(url: &Url) -> Option<String> {
    if url.host_str()?.to_ascii_lowercase().contains("music.youtube.com") {
        // https://music.youtube.com/playlist?list=...
        if let Some(list) = url.query_pairs().find_map(|(key, value)| {
            (key == "list").then(|| value.into_owned())
        }) {
            return Some(if list.starts_with("VL") { list } else { format!("VL{list}") });
        }
        // https://music.youtube.com/browse/MPREb_... / VL... (клик по карточке
        // альбома/плейлиста из поиска)
        let last = url.path_segments()?.next_back()?;
        if last.is_empty() {
            return None;
        }
        return Some(last.to_string());
    }
    None
}

/// Проверяет, является ли строка количеством прослушиваний (например, "34K plays", "347 тыс. прослушиваний").
pub fn is_play_count(text: &str) -> bool {
    let trimmed = text.trim();
    if trimmed.is_empty() {
        return false;
    }
    let lower = trimmed.to_lowercase();
    if lower.contains("play")
        || lower.contains("view")
        || lower.contains("прослушиван")
        || lower.contains("воспроизведен")
        || lower.contains("просмотр")
        || lower.contains("reprodu")
        || lower.contains("écoute")
        || lower.contains("ecoute")
        || lower.contains("lecture")
        || lower.contains("wiedergabe")
        || lower.contains("aufruf")
        || lower.contains("odtworze")
        || lower.contains("oynatma")
        || lower.contains("görüntüleme")
        || lower.contains("goruntuleme")
        || lower.contains("riproduzion")
        || lower.contains("visualizzazion")
    {
        return true;
    }
    let clean: String = lower
        .chars()
        .filter(|c| !c.is_whitespace() && *c != '.' && *c != ',')
        .collect();
    if !clean.is_empty() && clean.chars().next().map_or(false, |c| c.is_ascii_digit()) {
        let is_number_suffix = clean
            .chars()
            .all(|c| c.is_ascii_digit() || matches!(c, 'k' | 'm' | 'b'));
        if is_number_suffix {
            return true;
        }
    }
    false
}

fn is_play_count_column(column: &Value) -> bool {
    if let Some(label) = column
        .pointer("/musicResponsiveListItemFlexColumnRenderer/text/accessibility/accessibilityData/label")
        .and_then(Value::as_str)
    {
        if is_play_count(label) {
            return true;
        }
    }
    if let Some(runs) = column
        .pointer("/musicResponsiveListItemFlexColumnRenderer/text/runs")
        .and_then(Value::as_array)
    {
        for run in runs {
            if let Some(text) = run.get("text").and_then(Value::as_str) {
                if is_play_count(text) {
                    return true;
                }
            }
        }
    }
    false
}

/// Извлекает артиста альбома/плейлиста из шапки browse-ответа.
pub fn extract_album_artist(value: &Value) -> Option<String> {
    // 1. Шапка альбома в twoColumnBrowseResultsRenderer
    let responsive_header = value
        .pointer("/contents/twoColumnBrowseResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents/0/musicResponsiveHeaderRenderer")
        .or_else(|| value.pointer("/header/musicResponsiveHeaderRenderer"));

    if let Some(h) = responsive_header {
        // straplineTextOne: стандартное поле для артиста альбома в YouTube Music
        if let Some(runs) = h.pointer("/straplineTextOne/runs").and_then(Value::as_array) {
            let names: Vec<String> = runs
                .iter()
                .filter_map(|r| r.get("text").and_then(Value::as_str))
                .map(str::trim)
                .filter(|s| !s.is_empty() && *s != "," && *s != "•" && *s != "&" && *s != "+" && *s != "and")
                .filter(|s| !is_play_count(s))
                .map(str::to_string)
                .collect();
            if !names.is_empty() {
                return Some(names.join(", "));
            }
        }
        // subtitle runs с MUSIC_PAGE_TYPE_ARTIST
        if let Some(runs) = h.pointer("/subtitle/runs").and_then(Value::as_array) {
            for run in runs {
                let page_type = run
                    .pointer("/navigationEndpoint/browseEndpoint/browseEndpointContextSupportedConfigs/browseEndpointContextMusicConfig/pageType")
                    .and_then(Value::as_str);
                if page_type == Some("MUSIC_PAGE_TYPE_ARTIST")
                    && let Some(text) = run.get("text").and_then(Value::as_str)
                {
                    let trimmed = text.trim();
                    if !trimmed.is_empty() && !is_play_count(trimmed) {
                        return Some(trimmed.to_string());
                    }
                }
            }
        }
    }

    // 2. Шапка плейлиста: author
    let author = value
        .pointer("/header/musicEditablePlaylistDetailHeaderRenderer/author/runs/0/text")
        .or_else(|| value.pointer("/header/musicPlaylistHeaderRenderer/author/runs/0/text"))
        .and_then(Value::as_str)
        .map(str::trim)
        .filter(|s| !s.is_empty() && !is_play_count(s));
    if let Some(author) = author {
        return Some(author.to_string());
    }

    // 3. Fallback: поиск артиста в заголовках
    if let Some(header) = value.get("header") {
        if let Some(artist) = find_artist_in_runs(header) {
            return Some(artist);
        }
    }

    None
}

fn find_artist_in_runs(value: &Value) -> Option<String> {
    match value {
        Value::Object(map) => {
            if let Some(runs) = map.get("runs").and_then(Value::as_array) {
                for run in runs {
                    let page_type = run
                        .pointer("/navigationEndpoint/browseEndpoint/browseEndpointContextSupportedConfigs/browseEndpointContextMusicConfig/pageType")
                        .and_then(Value::as_str);
                    if page_type == Some("MUSIC_PAGE_TYPE_ARTIST")
                        && let Some(text) = run.get("text").and_then(Value::as_str)
                    {
                        let trimmed = text.trim();
                        if !trimmed.is_empty() && !is_play_count(trimmed) {
                            return Some(trimmed.to_string());
                        }
                    }
                }
            }
            for val in map.values() {
                if let Some(found) = find_artist_in_runs(val) {
                    return Some(found);
                }
            }
        }
        Value::Array(items) => {
            for item in items {
                if let Some(found) = find_artist_in_runs(item) {
                    return Some(found);
                }
            }
        }
        _ => {}
    }
    None
}

/// Собирает треки из playlistPanelRenderer / sectionListRenderer.
fn collect_playlist_tracks(value: &Value) -> Vec<TrackRef> {
    let mut tracks = Vec::new();
    collect_tracks_recursive(value, &mut tracks);
    tracks.dedup_by(|a, b| a.id == b.id);
    let album_artist = extract_album_artist(value);
    let fallback_artists: Vec<String> = album_artist
        .as_deref()
        .map(|a| {
            a.split(',')
                .map(str::trim)
                .filter(|s| !s.is_empty() && !is_play_count(s))
                .map(str::to_string)
                .collect()
        })
        .unwrap_or_default();

    for track in &mut tracks {
        track.artists.retain(|a| !is_play_count(a));
        if track.artists.is_empty() && !fallback_artists.is_empty() {
            track.artists = fallback_artists.clone();
        }
    }
    tracks
}

fn collect_tracks_recursive(value: &Value, out: &mut Vec<TrackRef>) {
    match value {
        Value::Array(items) => {
            for item in items {
                collect_tracks_recursive(item, out);
            }
        }
        Value::Object(map) => {
            for value in map.values() {
                collect_tracks_recursive(value, out);
            }
        }
        _ => {}
    }
    collect_track(value, out);
}

fn collect_track(value: &Value, out: &mut Vec<TrackRef>) {
    if let Some(renderer) = value.get("musicResponsiveListItemRenderer") {
        if let Some(track) = map_playlist_track(renderer) {
            out.push(track);
        }
    }
}

fn map_playlist_track(renderer: &Value) -> Option<TrackRef> {
    let video_id = renderer
        .pointer("/playlistItemData/videoId")
        .or_else(|| renderer.pointer("/navigationEndpoint/watchEndpoint/videoId"))
        .and_then(Value::as_str)?;
    let video_id = video_id.to_string();

    let mut title = String::new();
    let mut artists = Vec::new();
    let mut duration_ms = None;
    let mut thumbnail = None;

    if let Some(columns) = renderer.get("flexColumns").and_then(Value::as_array) {
        for column in columns {
            if is_play_count_column(column) {
                continue;
            }

            let runs = column
                .pointer("/musicResponsiveListItemFlexColumnRenderer/text/runs")
                .and_then(Value::as_array);

            if let Some(runs) = runs {
                if runs.is_empty() {
                    continue;
                }

                if title.is_empty() {
                    let full_title: String = runs
                        .iter()
                        .filter_map(|r| r.get("text").and_then(Value::as_str))
                        .collect();
                    let trimmed = full_title.trim();
                    if !trimmed.is_empty() {
                        title = trimmed.to_string();
                    }
                } else if artists.is_empty() {
                    // Проверяем явные ссылки на артистов
                    let mut found_artists = Vec::new();
                    for run in runs {
                        let page_type = run
                            .pointer("/navigationEndpoint/browseEndpoint/browseEndpointContextSupportedConfigs/browseEndpointContextMusicConfig/pageType")
                            .and_then(Value::as_str);
                        if (page_type == Some("MUSIC_PAGE_TYPE_ARTIST")
                            || page_type == Some("MUSIC_PAGE_TYPE_USER_CHANNEL"))
                            && let Some(text) = run.get("text").and_then(Value::as_str)
                        {
                            let t = text.trim();
                            if !t.is_empty() && t != "," && t != "•" && !is_play_count(t) {
                                found_artists.push(t.to_string());
                            }
                        }
                    }

                    if !found_artists.is_empty() {
                        artists = found_artists;
                    } else {
                        // Текст до разделителя " • "
                        let full_text: String = runs
                            .iter()
                            .filter_map(|r| r.get("text").and_then(Value::as_str))
                            .collect();
                        let text_before_dot = full_text
                            .split_once(" • ")
                            .map(|(a, _)| a)
                            .unwrap_or(&full_text)
                            .trim();

                        if !text_before_dot.is_empty() && !is_play_count(text_before_dot) {
                            let is_duration = text_before_dot.contains(':')
                                && text_before_dot.chars().all(|c| c.is_ascii_digit() || c == ':' || c == ' ');
                            if !is_duration {
                                let parsed: Vec<String> = text_before_dot
                                    .split(',')
                                    .map(str::trim)
                                    .filter(|s| !s.is_empty() && !is_play_count(s))
                                    .map(str::to_string)
                                    .collect();
                                if !parsed.is_empty() {
                                    artists = parsed;
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if let Some(fixed) = renderer
        .pointer("/fixedColumns/0/musicResponsiveListItemFixedColumnRenderer/text/runs/0/text")
        .and_then(Value::as_str)
    {
        duration_ms = parse_duration(fixed);
    }

    thumbnail = renderer
        .pointer("/thumbnail/musicThumbnailRenderer/thumbnail")
        .cloned();

    artists.retain(|a| !is_play_count(a));

    Some(normalize_track(
        &video_id,
        &title,
        artists,
        duration_ms,
        thumbnail.as_ref(),
    ))
}

fn collect_artist_tracks(value: &Value) -> Vec<TrackRef> {
    let mut tracks = Vec::new();
    // Artist page: singleColumn или twoColumn со sectionList в первой вкладке
    if let Some(contents) = value
        .pointer("/contents/singleColumnBrowseResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents")
        .or_else(|| {
            value.pointer("/contents/twoColumnBrowseResultsRenderer/tabs/0/tabRenderer/content/sectionListRenderer/contents")
        })
        .and_then(Value::as_array)
    {
        for content in contents {
            if let Some(shelf) = content.get("musicShelfRenderer") {
                if let Some(items) = shelf.get("contents").and_then(Value::as_array) {
                    for item in items {
                        if let Some(renderer) = item.get("musicResponsiveListItemRenderer") {
                            if let Some(track) = map_playlist_track(renderer) {
                                tracks.push(track);
                            }
                        }
                    }
                }
            }
        }
    }
    for track in &mut tracks {
        track.artists.retain(|a| !is_play_count(a));
    }
    tracks
}

/// BrowseId плейлиста «Top songs» артиста (bottomEndpoint шельфа) — там
/// полный список, шельф на странице артиста показывает лишь первые 5.
fn artist_top_songs_playlist(value: &Value) -> Option<String> {
    // Ищем browseId, начинающийся с VL, рядом с bottomEndpoint шельфа
    fn walk(v: &Value, in_bottom: bool, out: &mut Option<String>) {
        if out.is_some() {
            return;
        }
        match v {
            Value::Object(m) => {
                let is_bottom = in_bottom || m.contains_key("bottomEndpoint");
                for (k, val) in m {
                    let next_bottom = is_bottom || k == "bottomEndpoint";
                    if k == "browseEndpoint"
                        && let Some(bid) = val.get("browseId").and_then(Value::as_str)
                        && bid.starts_with("VL")
                    {
                        *out = Some(bid.to_string());
                        return;
                    }
                    walk(val, next_bottom, out);
                }
            }
            Value::Array(items) => {
                for item in items {
                    walk(item, in_bottom, out);
                }
            }
            _ => {}
        }
    }
    let mut out = None;
    walk(value, false, &mut out);
    out
}

fn collect_artist_releases(value: &Value) -> Vec<CollectionItem> {
    let mut releases = Vec::new();
    // Релизы лежат в каруселях Albums / Singles & EPs на странице артиста.
    // Обход в порядке появления (FIFO), чтобы карусель Albums шла первой.
    let mut queue = std::collections::VecDeque::new();
    queue.push_back(value);
    while let Some(node) = queue.pop_front() {
        match node {
            Value::Object(m) => {
                if let Some(carousel) = m.get("musicCarouselShelfRenderer") {
                    let title = carousel
                        .pointer("/header/musicCarouselShelfBasicHeaderRenderer/title/runs/0/text")
                        .and_then(Value::as_str)
                        .unwrap_or("");
                    let is_release_carousel =
                        title.contains("Album") || title.contains("Single") || title.contains("EP");
                    if is_release_carousel {
                        if let Some(items) = carousel.get("contents").and_then(Value::as_array) {
                            for item in items {
                                if let Some(renderer) = item.get("musicTwoRowItemRenderer")
                                    && let Some(browse_id) = renderer
                                        .pointer("/navigationEndpoint/browseEndpoint/browseId")
                                        .and_then(Value::as_str)
                                {
                                    let title = renderer
                                        .pointer("/title/runs/0/text")
                                        .and_then(Value::as_str)
                                        .unwrap_or("Релиз");
                                    let subtitle = renderer
                                        .pointer("/subtitle/runs")
                                        .and_then(Value::as_array)
                                        .map(|runs| {
                                            runs.iter()
                                                .filter_map(|r| r.get("text").and_then(Value::as_str))
                                                .collect::<String>()
                                        })
                                        .unwrap_or_else(|| "Альбом".to_string());
                                    releases.push(normalize_collection(
                                        browse_id,
                                        title,
                                        &subtitle,
                                        CollectionKind::Album,
                                        renderer.pointer("/thumbnailRenderer/musicThumbnailRenderer/thumbnail"),
                                        0,
                                    ));
                                }
                            }
                        }
                    }
                }
                for val in m.values() {
                    queue.push_back(val);
                }
            }
            Value::Array(items) => {
                for item in items {
                    queue.push_back(item);
                }
            }
            _ => {}
        }
    }
    releases.dedup_by(|a, b| a.id == b.id);
    // Единый порядок по дате выхода: новые → старые. Дата — год в subtitle
    // ("2025", "Single • 2024"). Релизы без года — в конец.
    releases.sort_by_cached_key(|r| {
        std::cmp::Reverse(
            r.subtitle
                .split(|c: char| !c.is_ascii_digit())
                .find_map(|part| part.parse::<u32>().ok())
                .filter(|year| (1900..=2100).contains(year))
                .unwrap_or(0),
        )
    });
    releases
}

/// Похожие треки из watch-next.
fn collect_related_tracks(value: &Value, limit: usize) -> Vec<TrackRef> {
    let mut tracks = Vec::new();
    let push = |value: &Value, out: &mut Vec<TrackRef>| {
        if let Some(renderer) = value.get("musicResponsiveListItemRenderer") {
            if let Some(track) = map_playlist_track(renderer) {
                out.push(track);
            }
        }
    };
    // ищем во всех содержимых
    let mut stack = vec![value];
    while let Some(node) = stack.pop() {
        match node {
            Value::Array(items) => stack.extend(items),
            Value::Object(map) => {
                for value in map.values() {
                    push(value, &mut tracks);
                    stack.push(value);
                }
            }
            _ => {}
        }
        if tracks.len() >= limit {
            break;
        }
    }
    tracks.truncate(limit);
    tracks.dedup_by(|a, b| a.id == b.id);
    tracks
}

fn parse_duration(value: &str) -> Option<u64> {
    let parts: Vec<&str> = value.split(':').collect();
    let seconds: u64 = parts.last()?.parse().ok()?;
    let minutes: u64 = if parts.len() > 1 { parts[parts.len() - 2].parse().ok()? } else { 0 };
    let hours: u64 = if parts.len() > 2 { parts[0].parse().ok()? } else { 0 };
    Some((hours * 3600 + minutes * 60 + seconds) * 1000)
}

/// Собирает треки из всех musicShelfRenderer на странице артиста.
/// Раздел «Популярное» и остальные песни — треки артиста.
fn collect_artist_songs(value: &Value) -> Vec<TrackRef> {
    let mut tracks = Vec::new();
    collect_tracks_recursive(value, &mut tracks);
    tracks.dedup_by(|a, b| a.id == b.id);
    for track in &mut tracks {
        track.artists.retain(|a| !is_play_count(a));
    }
    tracks
}
