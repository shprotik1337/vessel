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
use reqwest::{
    Client,
    header::{AUTHORIZATION, COOKIE, HeaderValue, USER_AGENT},
};
use serde::Deserialize;
use serde_json::Value;
use url::Url;

use crate::{
    model::{PlaybackCapability, PlaybackSource, ProviderKind, TrackRef},
    provider::{
        ArtistProfile, Attribution, CollectionItem, CollectionKind, ImportedPlaylist, MusicProvider,
        SearchPage,
    },
};

const API: &str = "https://api.spotify.com/v1";
const TOKEN_URL: &str = "https://open.spotify.com/get_access_token";
const SPCLIENT: &str = "https://spclient.wg.spotify.com";
const WEB_URL: &str = "https://open.spotify.com";
const PAGE_SIZE: usize = 50;
const BROWSER_UA: &str = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";
/// Секрет SpotiCrypt: ключ расшифровки выводится из file_id, IV — сам file_id.
const SPOTICRYPT_SECRET: &[u8; 16] = b"g+1s?Fz?k=z?j1?0";
/// Первые 0xA7 байт расшифрованного файла — заголовок, его отбрасываем.
const AUDIO_HEADER_SKIP: usize = 0xA7;

pub struct SpotifyProvider {
    http: Client,
    sp_dc: String,
    access_token: Mutex<Option<(String, Instant)>>,
}

impl SpotifyProvider {
    pub fn new(sp_dc: impl AsRef<str>) -> Result<Self> {
        let sp_dc = normalize_sp_dc(sp_dc.as_ref());
        if sp_dc.is_empty() {
            bail!("для Spotify нужен токен sp_dc")
        }
        let http = Client::builder()
            .user_agent(BROWSER_UA)
            .build()
            .context("не удалось создать HTTP-клиент Spotify")?;
        Ok(Self {
            http,
            sp_dc,
            access_token: Mutex::new(None),
        })
    }

    /// Получает (и кэширует) access_token через sp_dc.
    async fn access_token(&self) -> Result<String> {
        if let Some((token, fetched_at)) = self.access_token.lock().unwrap().as_ref()
            && fetched_at.elapsed() < Duration::from_secs(30 * 60)
        {
            return Ok(token.clone());
        }
        let token = self.fetch_access_token().await?;
        *self.access_token.lock().unwrap() = Some((token.clone(), Instant::now()));
        Ok(token)
    }

    async fn fetch_access_token(&self) -> Result<String> {
        let url = Url::parse_with_params(
            TOKEN_URL,
            &[("reason", "transport"), ("productType", "web_player")],
        )?;
        let response = self
            .http
            .get(url)
            .header(COOKIE, format!("sp_dc={}", self.sp_dc))
            .header("App-Platform", "WebPlayer")
            .send()
            .await
            .context("Spotify не ответил на запрос токена")?
            .error_for_status()
            .context("Spotify отклонил запрос токена")?;
        let value: Value = response
            .json()
            .await
            .context("Spotify вернул непонятный ответ токена")?;
        let token = value
            .get("accessToken")
            .and_then(Value::as_str)
            .context("sp_dc не авторизован: Spotify не выдал accessToken")?
            .trim();
        if token.is_empty() {
            bail!("sp_dc не авторизован: пустой accessToken")
        }
        Ok(token.to_string())
    }

    async fn get_json<T: serde::de::DeserializeOwned>(&self, url: Url) -> Result<T> {
        let token = self.access_token().await?;
        let response = self
            .http
            .get(url)
            .header(AUTHORIZATION, format!("Bearer {token}"))
            .header(COOKIE, format!("sp_dc={}", self.sp_dc))
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

    /// Полный трек: скачивает зашифрованный файл и расшифровывает его.
    async fn prepare_full_track(&self, track_id: &str) -> Result<PathBuf> {
        let cached_mp3 = spotify_cache_dir().join(format!("{track_id}.mp3"));
        let cached_ogg = spotify_cache_dir().join(format!("{track_id}.ogg"));
        if cached_mp3
            .metadata()
            .is_ok_and(|metadata| metadata.len() > 0)
        {
            return Ok(cached_mp3);
        }
        if cached_ogg
            .metadata()
            .is_ok_and(|metadata| metadata.len() > 0)
        {
            return Ok(cached_ogg);
        }

        let token = self.access_token().await?;
        let audio_url = Url::parse(&format!("{SPCLIENT}/playlist/v2/audio/{track_id}"))?;
        let audio: Value = self
            .http
            .get(audio_url)
            .header(AUTHORIZATION, format!("Bearer {token}"))
            .header(COOKIE, format!("sp_dc={}", self.sp_dc))
            .send()
            .await
            .context("Spotify spclient не ответил")?
            .error_for_status()
            .context("Spotify spclient отклонил запрос")?
            .json()
            .await
            .context("Spotify spclient вернул непонятный JSON")?;
        let media_url = audio
            .get("url")
            .and_then(Value::as_str)
            .context("Spotify не отдал URL аудио для этого трека")?;
        let media_url = Url::parse(media_url).context("Spotify отдал битую ссылку на аудио")?;
        let file_id = media_url
            .path_segments()
            .and_then(|mut segments| segments.next_back())
            .context("не удалось вытащить file_id из URL аудио Spotify")?
            .to_string();
        let extension = if file_extension_from_url(&media_url) == Some("ogg") {
            "ogg"
        } else {
            "mp3"
        };

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

        let decrypted = decrypt_audio(&bytes, &file_id)?;
        let path = spotify_cache_dir().join(format!("{track_id}.{extension}"));
        write_cache(&path, &decrypted)?;
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
        let url = Url::parse_with_params(
            &format!("{API}/search"),
            &[
                ("q", query),
                ("type", "track"),
                ("limit", &PAGE_SIZE.to_string()),
                ("offset", &offset.to_string()),
            ],
        )?;
        let page: SearchResponse = self.get_json(url).await?;
        let next_cursor = page
            .tracks
            .next
            .and_then(|url| Url::parse(&url).ok())
            .and_then(|url| {
                url.query_pairs()
                    .find_map(|(key, value)| (key == "offset").then(|| value.into_owned()))
            });
        Ok(SearchPage {
            tracks: page
                .tracks
                .items
                .into_iter()
                .filter_map(map_track)
                .collect(),
            next_cursor,
        })
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
        let search_type = match kind {
            CollectionKind::Playlist => "playlist",
            CollectionKind::Album => "album",
            CollectionKind::Artist => "artist",
        };
        let url = Url::parse_with_params(
            &format!("{API}/search"),
            &[
                ("q", query),
                ("type", search_type),
                ("limit", "30"),
                ("offset", "0"),
            ],
        )?;
        let page: SearchResponse = self.get_json(url).await?;
        let items = match kind {
            CollectionKind::Playlist => page
                .playlists
                .map(|section| {
                    section
                        .items
                        .into_iter()
                        .filter_map(map_playlist_item)
                        .collect()
                })
                .unwrap_or_default(),
            CollectionKind::Album => page
                .albums
                .map(|section| {
                    section
                        .items
                        .into_iter()
                        .filter_map(map_album_item)
                        .collect()
                })
                .unwrap_or_default(),
            CollectionKind::Artist => page
                .artists
                .map(|section| {
                    section
                        .items
                        .into_iter()
                        .filter_map(map_artist_item)
                        .collect()
                })
                .unwrap_or_default(),
        };
        Ok(items)
    }

    async fn artist_profile(&self, artist_id: &str) -> Result<ArtistProfile> {
        let artist: ArtistFull = self
            .get_json(Url::parse(&format!("{API}/artists/{artist_id}"))?)
            .await?;
        let top: TopTracks = self
            .get_json(Url::parse_with_params(
                &format!("{API}/artists/{artist_id}/top-tracks"),
                &[("market", "from_token")],
            )?)
            .await?;
        let albums: AlbumsResponse = self
            .get_json(Url::parse_with_params(
                &format!("{API}/artists/{artist_id}/albums"),
                &[
                    ("limit", "50"),
                    ("include_groups", "album,single"),
                    ("market", "from_token"),
                ],
            )?)
            .await?;
        let mut releases: Vec<CollectionItem> = albums
            .items
            .into_iter()
            .filter_map(|album| map_album_as_release(album))
            .collect();
        releases.sort_by(|a, b| b.subtitle.cmp(&a.subtitle));
        Ok(ArtistProfile {
            name: artist.name,
            avatar_url: artist
                .images
                .first()
                .and_then(|image| Url::parse(&image.url).ok()),
            popular_tracks: top.tracks.into_iter().filter_map(map_track).collect(),
            releases,
        })
    }

    async fn artist_all_tracks(&self, artist_id: &str) -> Result<Vec<TrackRef>> {
        let mut albums: Vec<String> = Vec::new();
        let mut offset = 0usize;
        loop {
            let url = Url::parse_with_params(
                &format!("{API}/artists/{artist_id}/albums"),
                &[
                    ("limit", "50"),
                    ("offset", &offset.to_string()),
                    ("include_groups", "album,single"),
                    ("market", "from_token"),
                ],
            )?;
            let page: AlbumsResponse = self.get_json(url).await?;
            let loaded = page.items.len();
            albums.extend(
                page.items
                    .into_iter()
                    .filter_map(|album| album.id),
            );
            if loaded < 50 || page.next.is_none() {
                break;
            }
            offset += loaded;
        }

        let mut seen = std::collections::HashSet::new();
        let mut tracks = Vec::new();
        for album_id in albums {
            match self
                .get_json::<AlbumTracksResponse>(Url::parse(&format!(
                    "{API}/albums/{album_id}/tracks"
                ))?)
                .await
            {
                Ok(details) => {
                    for track in details.items {
                        if let Some(track_ref) = map_track(track)
                            && seen.insert(track_ref.provider_key())
                        {
                            tracks.push(track_ref);
                        }
                    }
                }
                Err(_) => {}
            }
            tokio::time::sleep(Duration::from_millis(60)).await;
        }
        Ok(tracks)
    }

    async fn import_playlist(&self, source: &Url) -> Result<ImportedPlaylist> {
        if let Some(id) = entity_id(source, "album") {
            return self.import_album(&id, source).await;
        }
        let id =
            entity_id(source, "playlist").context("не удалось определить ID плейлиста Spotify")?;
        let details: PlaylistDetails = self
            .get_json(Url::parse(&format!("{API}/playlists/{id}"))?)
            .await?;
        let mut tracks = details.tracks.items;
        let mut next = details.tracks.next;
        while let Some(url) = next.take() {
            let page: PagedItems<ApiTrack> = self.get_json(Url::parse(&url)?).await?;
            tracks.extend(page.items);
            next = page.next;
        }
        Ok(ImportedPlaylist {
            title: details.name,
            description: details.description.unwrap_or_default(),
            source_url: source.clone(),
            cover_url: details
                .images
                .first()
                .and_then(|image| Url::parse(&image.url).ok()),
            tracks: tracks.into_iter().filter_map(map_track).collect(),
        })
    }

    async fn related(&self, track: &TrackRef, limit: usize) -> Result<Vec<TrackRef>> {
        let url = Url::parse_with_params(
            &format!("{API}/recommendations"),
            &[
                ("seed_tracks", &track.id),
                ("limit", &limit.clamp(1, 100).to_string()),
            ],
        )?;
        let recommendations: Recommendations = self.get_json(url).await?;
        Ok(recommendations
            .tracks
            .into_iter()
            .filter_map(map_track)
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
        let details: AlbumDetails = self
            .get_json(Url::parse(&format!("{API}/albums/{id}"))?)
            .await?;
        let mut tracks = details.tracks.items;
        let mut next = details.tracks.next;
        while let Some(url) = next.take() {
            let page: PagedItems<ApiTrack> = self.get_json(Url::parse(&url)?).await?;
            tracks.extend(page.items);
            next = page.next;
        }
        let artist = details
            .artists
            .first()
            .map(|artist| artist.name.clone())
            .unwrap_or_default();
        Ok(ImportedPlaylist {
            title: details.name,
            description: artist,
            source_url: source.clone(),
            cover_url: details
                .images
                .first()
                .and_then(|image| Url::parse(&image.url).ok()),
            tracks: tracks.into_iter().filter_map(map_track).collect(),
        })
    }

    /// Проверяет, что sp_dc действительно авторизован.
    pub async fn probe(&self) -> Result<()> {
        let token = self.fetch_access_token().await?;
        if token.is_empty() {
            bail!("Spotify sp_dc не авторизован — проверь токен")
        }
        Ok(())
    }
}

fn normalize_sp_dc(value: &str) -> String {
    let value = value.trim().trim_matches(['\'', '"']).trim();
    let after_prefix = value
        .split_once(':')
        .filter(|(prefix, _)| prefix.trim().eq_ignore_ascii_case("cookie"))
        .map_or(value, |(_, rest)| rest.trim());
    after_prefix
        .split(';')
        .find_map(|part| {
            let part = part.trim();
            if let Some((name, value)) = part.split_once('=')
                && name.trim().eq_ignore_ascii_case("sp_dc")
            {
                return Some(value.trim().trim_matches(['\'', '"']).to_string());
            }
            None
        })
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| after_prefix.trim_matches(['\'', '"']).trim().to_string())
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
        assert_eq!(normalize_sp_dc("token"), "token");
        assert_eq!(normalize_sp_dc("Cookie: sp_dc='token'"), "token");
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
}
