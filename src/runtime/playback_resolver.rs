//! PlaybackResolver: выбор источника звука для треков чужого каталога.
//!
//! Spotify (или любой другой provider) даёт метаданные, но само аудио может
//! играть через другой каталог — YouTube Music или Deezer. Резолвер живёт
//! в Runtime, знает реестр провайдеров и выбранный в настройках источник.
//!
//! Матчинг трека в чужом каталоге (порядок приоритета):
//! 1. ISRC (международный код записи) — confidence 1.0
//! 2. нормализованные artist + title (точное совпадение) — confidence 0.95
//! 3. артист совпал внутри кандидата + название (частичное) — 0.90
//! 4. нормализованные artist + title (частичное) — confidence 0.85
//! ниже 0.70 — трек «не найден», честная ошибка.
//!
//! Матчи кэшируются (список кандидатов до 3 — на случай недоступности
//! первого источника). URL стрима НЕ кэшируется — он протухает (pot=, CDN).

use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};

use anyhow::{Result, bail};

use crate::{
    model::{ProviderKind, TrackRef},
    provider::ProviderRegistry,
};

/// Порог: матчи ниже не принимаются.
pub const MIN_CONFIDENCE: f32 = 0.70;
/// Сколько кандидат-результатов смотреть в выдаче чужого каталога.
const SEARCH_LIMIT: usize = 15;
/// Сколько лучших кандидатов хранить (если первый источник недоступен).
const MAX_CANDIDATES: usize = 3;
/// Таймаут поиска в чужом каталоге — LOADING не должен зависать навсегда.
pub const SEARCH_TIMEOUT: Duration = Duration::from_secs(20);

/// На каком этапе сломался резолвинг — для логов и понятных ошибок.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ResolveStage {
    /// Матч не найден вообще.
    MatchNotFound,
    /// Кандидаты есть, но все ниже порога уверенности.
    MatchNotConfident,
    /// Матч найден (успех).
    MatchFound,
    /// Матч найден только в общем поиске YTM (клип-версия, длительность
    /// отличается от полного трека). Не ошибка: Runtime предупредит юзера.
    MatchFoundVideoOnly,
    /// Не удалось получить поток по найденному матчу.
    SourceResolutionFailed,
}

impl ResolveStage {
    pub fn describe(self) -> &'static str {
        match self {
            Self::MatchNotFound => "MATCH_NOT_FOUND",
            Self::MatchNotConfident => "MATCH_NOT_CONFIDENT",
            Self::MatchFound => "MATCH_FOUND",
            Self::MatchFoundVideoOnly => "MATCH_FOUND_VIDEO_ONLY",
            Self::SourceResolutionFailed => "SOURCE_RESOLUTION_FAILED",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlaybackSourceKind {
    /// Автоматически: Deezer → YouTube Music
    Auto,
    /// Аудио через каталог YouTube Music
    YouTubeMusic,
    /// Аудио через каталог Deezer
    Deezer,
}

impl PlaybackSourceKind {
    pub fn provider_kind(self) -> ProviderKind {
        match self {
            Self::Auto => ProviderKind::Deezer, // primary; реальная цепочка — chain()
            Self::YouTubeMusic => ProviderKind::YouTubeMusic,
            Self::Deezer => ProviderKind::Deezer,
        }
    }

    /// Человекочитаемое имя для логов и ошибок.
    pub fn label(self) -> &'static str {
        match self {
            Self::Auto => "Автоматически",
            Self::YouTubeMusic => "YouTube Music",
            Self::Deezer => "Deezer",
        }
    }

    pub fn as_str(self) -> &'static str {
        match self {
            Self::Auto => "auto",
            Self::YouTubeMusic => "youtube_music",
            Self::Deezer => "deezer",
        }
    }

    pub fn from_str(value: &str) -> Option<Self> {
        match value.trim() {
            "auto" => Some(Self::Auto),
            "youtube_music" | "youtube" => Some(Self::YouTubeMusic),
            "deezer" => Some(Self::Deezer),
            _ => None,
        }
    }

    /// Цепочка probing'а: Auto = Deezer → YouTube Music;
    /// ручные режимы — только выбранный источник.
    pub fn chain(self) -> Vec<Self> {
        match self {
            Self::Auto => vec![Self::Deezer, Self::YouTubeMusic],
            other => vec![other],
        }
    }

    /// Второй playback-каталог: для фолбэка, если первый не сработал.
    pub fn other(self) -> Self {
        match self {
            Self::YouTubeMusic => Self::Deezer,
            Self::Deezer => Self::YouTubeMusic,
            Self::Auto => Self::YouTubeMusic,
        }
    }
}

/// Кэш матчей: {провайдер}:{id} → список чужих TrackRef (лучший первым).
struct MatchCache {
    map: Mutex<HashMap<String, Vec<TrackRef>>>,
    /// Ограничение размеров: ротация через простую очистку
    last_cleanup: Instant,
}

const CACHE_CLEANUP_EVERY: Duration = Duration::from_secs(10 * 60);
const CACHE_MAX_ENTRIES: usize = 2000;

impl MatchCache {
    fn new() -> Self {
        Self {
            map: Mutex::new(HashMap::new()),
            last_cleanup: Instant::now(),
        }
    }

    fn get(&self, key: &str) -> Option<Vec<TrackRef>> {
        self.map.lock().ok()?.get(key).cloned()
    }

    fn put(&self, key: String, foreign: Vec<TrackRef>) {
        if let Ok(mut map) = self.map.lock() {
            // Ротация: раз в 10 минут при переполнении чистим всё
            // (матчи недорого восстановить поисковым запросом)
            if map.len() >= CACHE_MAX_ENTRIES
                && self.last_cleanup.elapsed() > CACHE_CLEANUP_EVERY
            {
                map.clear();
            }
            map.insert(key, foreign);
        }
    }

    /// Убрать матч из кэша (источник оказался непроигрываемым).
    fn drop_key(&self, key: &str) {
        if let Ok(mut map) = self.map.lock() {
            map.remove(key);
        }
    }
}

pub struct PlaybackResolver {
    registry: Arc<ProviderRegistry>,
    source: Mutex<PlaybackSourceKind>,
    cache: MatchCache,
}

impl PlaybackResolver {
    pub fn new(registry: Arc<ProviderRegistry>, source: PlaybackSourceKind) -> Self {
        Self {
            registry,
            source: Mutex::new(source),
            cache: MatchCache::new(),
        }
    }

    /// Текущий выбранный источник.
    pub fn source(&self) -> PlaybackSourceKind {
        *self.source.lock().unwrap_or_else(|p| p.into_inner())
    }

    /// Сменить источник (из настроек, без перезапуска).
    pub fn set_source(&self, source: PlaybackSourceKind) {
        *self.source.lock().unwrap_or_else(|p| p.into_inner()) = source;
    }

    /// Доступен ли источник: провайдер зарегистрирован.
    /// Auto доступен, если доступен хотя бы один из цепочки.
    pub fn source_available(&self, source: PlaybackSourceKind) -> bool {
        match source {
            PlaybackSourceKind::Auto => source
                .chain()
                .iter()
                .any(|s| self.registry.get(s.provider_kind()).is_some()),
            other => self.registry.get(other.provider_kind()).is_some(),
        }
    }

    /// Ключ кэша для трека и целевого каталога.
    fn cache_key(track: &TrackRef, kind: ProviderKind) -> String {
        format!("{:?}->{:?}:{}", track.provider, kind, track.id)
    }

    /// Главная точка: трек → TrackRef выбранного каталога (лучший кандидат).
    /// Auto перебирает цепочку Deezer → YouTube Music, берёт первую удачу.
    pub async fn resolve(&self, track: &TrackRef) -> Result<TrackRef> {
        for source in self.source().chain() {
            if !self.source_available(source) {
                continue;
            }
            match self.resolve_in(source, track).await {
                Ok(foreign) => return Ok(foreign),
                // матч/поиск не удались — следующий источник цепочки
                Err(_) => continue,
            }
        }
        bail!("трек не нашёлся ни в одном источнике цепочки «{}»", self.source().label())
    }

    /// Матчинг трека в конкретном каталоге (для фолбэка).
    /// Возвращает первого (лучшего) кандидата.
    pub async fn resolve_in(
        &self,
        source: PlaybackSourceKind,
        track: &TrackRef,
    ) -> Result<TrackRef> {
        let (candidates, stage) = self.resolve_candidates_in(source, track).await?;
        let Some(mut list) = candidates else {
            return Err(match stage {
                ResolveStage::MatchNotFound => anyhow::anyhow!(
                    "в {} не нашёлся этот трек",
                    source.as_str()
                ),
                ResolveStage::MatchNotConfident => anyhow::anyhow!(
                    "в {} нет уверенного совпадения (лучший кандидат слишком отличается)",
                    source.as_str()
                ),
                _ => anyhow::anyhow!("матч не найден"),
            });
        };
        let first = list.remove(0);
        let _ = list;
        Ok(first)
    }

    /// Матчинг со списком кандидатов: до MAX_CANDIDATES лучших, отсортированных
    /// по confidence. Ошибки дают (None, стадия) — для логов и фолбэка.
    pub async fn resolve_candidates_in(
        &self,
        source: PlaybackSourceKind,
        track: &TrackRef,
    ) -> Result<(Option<Vec<TrackRef>>, ResolveStage)> {
        let foreign_kind = source.provider_kind();
        let key = Self::cache_key(track, foreign_kind);

        // 1. Кэш матчей
        if let Some(cached) = self.cache.get(&key) {
            return Ok((Some(cached), ResolveStage::MatchFound));
        }

        // 2. Источник должен быть зарегистрирован
        let Some(foreign_provider) = self.registry.get(foreign_kind) else {
            bail!("источник воспроизведения {} не подключён", source.as_str());
        };

        // 3. Поиск в чужом каталоге (с таймаутом — сеть может висеть)
        let query = search_query(track);
        let search = tokio::time::timeout(
            SEARCH_TIMEOUT,
            foreign_provider.search(&query, None),
        )
        .await;
        let page = match search {
            Ok(Ok(page)) => page,
            Ok(Err(error)) => bail!("поиск в {} не удался: {error}", source.as_str()),
            Err(_) => bail!(
                "поиск в {} не ответил за {} с",
                source.as_str(),
                SEARCH_TIMEOUT.as_secs()
            ),
        };

        // 4. Матчинг кандидатов
        let candidates = best_candidates(track, &page.tracks, foreign_kind);
        if candidates.is_empty() {
            let had_any = !page.tracks.is_empty();
            let stage = if had_any {
                ResolveStage::MatchNotConfident
            } else {
                ResolveStage::MatchNotFound
            };
            crate::dlog!(
                "[resolver] {}: «{}» → {} (кандидатов в выдаче: {})",
                stage.describe(),
                track.title,
                source.as_str(),
                page.tracks.len()
            );
            return Ok((None, stage));
        }

        let matched: Vec<TrackRef> = candidates
            .into_iter()
            .take(MAX_CANDIDATES)
            .map(|candidate| candidate.track)
            .collect();
        self.cache.put(key, matched.clone());
        Ok((Some(matched), ResolveStage::MatchFound))
    }

    /// Источник оказался непроигрываемым — выкинуть матч из кэша,
    /// чтобы следующий replay попробовал других кандидатов/каталог.
    pub fn drop_cache(&self, track: &TrackRef, source: PlaybackSourceKind) {
        self.cache
            .drop_key(&Self::cache_key(track, source.provider_kind()));
    }

    /// Единственный разрешённый путь к аудио. Spotify — ТОЛЬКО чужие каталоги
    /// (Deezer/YouTube Music, плюс общий поиск клипов как при игре);
    /// native-источник Spotify не используется нигде и никогда. Возвращает трек
    /// кандидата (под ним и кэшируется файл) и его PlaybackSource.
    pub async fn playable_for(
        &self,
        track: &TrackRef,
    ) -> Result<(TrackRef, crate::model::PlaybackSource)> {
        use crate::model::ProviderKind;

        if track.provider != ProviderKind::Spotify {
            let provider = self
                .registry
                .get(track.provider)
                .ok_or_else(|| anyhow::anyhow!("провайдер {} недоступен", track.provider.label()))?;
            let source = provider.playback_source(track).await?;
            return Ok((track.clone(), source));
        }

        let requested = self.source();
        let chain: Vec<_> = requested
            .chain()
            .into_iter()
            .filter(|source| self.source_available(*source))
            .collect();
        if chain.is_empty() {
            bail!(
                "Spotify играет через Deezer/YouTube Music — включите хотя бы один \
                 источник в Настройках (источник аудио для Spotify)"
            );
        }

        let mut failures: Vec<String> = Vec::new();
        for source in &chain {
            let candidates = match self.resolve_candidates_in(*source, track).await {
                Ok((Some(candidates), _)) => candidates,
                Ok((None, stage)) => {
                    // клип-фолбэк так же, как в живом воспроизведении
                    if requested == PlaybackSourceKind::Auto
                        && *source == PlaybackSourceKind::YouTubeMusic
                    {
                        match self.resolve_candidates_general(track).await {
                            Ok((Some(video), _)) => video,
                            _ => {
                                failures.push(format!("{}: {}", source.label(), stage.describe()));
                                continue;
                            }
                        }
                    } else {
                        failures.push(format!("{}: {}", source.label(), stage.describe()));
                        continue;
                    }
                }
                Err(error) => {
                    failures.push(format!("{}: {error:#}", source.label()));
                    continue;
                }
            };
            for candidate in &candidates {
                let Some(provider) = self.registry.get(candidate.provider) else {
                    continue;
                };
                match provider.playback_source(candidate).await {
                    Ok(source_stream) => return Ok((candidate.clone(), source_stream)),
                    Err(error) => {
                        self.drop_cache(track, *source);
                        return Err(anyhow::anyhow!(
                            "аудио нашлось в {}, но не играется: {error:#}",
                            source.label()
                        ));
                    }
                }
            }
            failures.push(format!("{}: нет играбельных кандидатов", source.label()));
        }
        bail!(
            "Не удалось найти аудио для «{}» в Deezer/YouTube Music ({})",
            track.title,
            failures.join("; ")
        )
    }

    /// Последний шанс в Auto-цепочке: общий поиск в YouTube Music БЕЗ
    /// фильтра «Композиции». Там всплывают официальные клипы удалённых
    /// из каталога треков (пример: «Розовое вино» — трека нет, клип есть).
    /// Длительность смягчена (клипы короче полных треков), поэтому успех
    /// помечается стадией MatchFoundVideoOnly — Runtime предупредит юзера.
    pub async fn resolve_candidates_general(
        &self,
        track: &TrackRef,
    ) -> Result<(Option<Vec<TrackRef>>, ResolveStage)> {
        let Some(ytm) = self.registry.get(ProviderKind::YouTubeMusic) else {
            bail!("YouTube Music не подключён");
        };
        // Общий поиск идёт через общий Innertube-клиент YTM-провайдера
        let Some(ytm_provider) = ytm
            .as_any()
            .downcast_ref::<crate::provider::youtube::YouTubeMusicProvider>()
        else {
            bail!("общий поиск YouTube Music недоступен");
        };
        let client = ytm_provider.client();

        let query = search_query(track);
        let search = tokio::time::timeout(
            SEARCH_TIMEOUT,
            crate::provider::youtube::search::search_tracks_general(&client, &query),
        )
        .await;
        let tracks = match search {
            Ok(Ok(tracks)) => tracks,
            Ok(Err(error)) => bail!("общий поиск YouTube Music не удался: {error}"),
            Err(_) => bail!(
                "общий поиск YouTube Music не ответил за {} с",
                SEARCH_TIMEOUT.as_secs()
            ),
        };

        let candidates = best_candidates_video(track, &tracks);
        if candidates.is_empty() {
            crate::dlog!(
                "[resolver] MATCH_NOT_FOUND: «{}» → youtube_music general (в выдаче: {})",
                track.title,
                tracks.len()
            );
            return Ok((None, ResolveStage::MatchNotFound));
        }
        crate::dlog!(
            "[resolver] MATCH_FOUND_VIDEO_ONLY: «{}» → youtube_music general ({} канд., лучший «{}»)",
            track.title,
            candidates.len(),
            candidates[0].track.title
        );
        let matched: Vec<TrackRef> = candidates
            .into_iter()
            .take(MAX_CANDIDATES)
            .map(|candidate| candidate.track)
            .collect();
        // В кэш общего поиска не пишем: честный поиск мог бы потом
        // найти полноценный трек — не закрепляем клип-версию навсегда
        Ok((Some(matched), ResolveStage::MatchFoundVideoOnly))
    }
}

/// Запрос к чужому каталогу: главный артист + ЧИСТОЕ название. Без этого
/// Deezer отдаёт 0 на «TWIN TRIM (with Lil Uzi Vert)», хотя трек там есть
/// как «TWIN TRIM» — скобки/списки артистов через запятую только мешают.
pub fn search_query(track: &TrackRef) -> String {
    let title = normalize_title(&track.title);
    let artist = track
        .artists
        .first()
        .map(|a| normalize_title(a))
        .unwrap_or_default();
    match (artist.is_empty(), title.is_empty()) {
        (false, false) => format!("{artist} {title}"),
        (false, true) => artist,
        (true, false) => title,
        (true, true) => track.title.clone(),
    }
}

pub struct MatchCandidate {
    pub track: TrackRef,
    pub confidence: f32,
}

/// Выбор лучших кандидатов из выдачи чужого каталога (по убыванию confidence).
pub fn best_candidates(
    spotify: &TrackRef,
    candidates: &[TrackRef],
    foreign_kind: ProviderKind,
) -> Vec<MatchCandidate> {
    let mut matches: Vec<MatchCandidate> = Vec::new();
    for candidate in candidates.iter().take(SEARCH_LIMIT) {
        if candidate.provider != foreign_kind {
            continue;
        }
        if let Some(confidence) = match_confidence(spotify, candidate) {
            matches.push(MatchCandidate {
                track: candidate.clone(),
                confidence,
            });
        }
    }
    matches.sort_by(|a, b| b.confidence.partial_cmp(&a.confidence).unwrap_or(std::cmp::Ordering::Equal));
    matches
}

/// Совместимость со старым API: лучший кандидат.
pub fn best_match(
    spotify: &TrackRef,
    candidates: &[TrackRef],
    foreign_kind: ProviderKind,
) -> Option<MatchCandidate> {
    best_candidates(spotify, candidates, foreign_kind).into_iter().next()
}

/// Уверенность совпадения пары треков (None — не совпадает).
fn match_confidence(spotify: &TrackRef, candidate: &TrackRef) -> Option<f32> {
    // 0. ISRC — самый сильный сигнал: код записи уникален.
    if let (Some(a), Some(b)) = (&spotify.isrc, &candidate.isrc) {
        let a = a.trim().to_ascii_uppercase();
        let b = b.trim().to_ascii_uppercase();
        if !a.is_empty() && a == b {
            // Длительность всё равно проверяем: битый ISRC лучше отбраковать
            return duration_ok(spotify.duration_ms, candidate.duration_ms).then_some(1.0);
        }
    }

    let title_norm = normalize_title(&spotify.title);
    let artist_norm = spotify
        .artists
        .first()
        .map(|a| normalize_title(a))
        .unwrap_or_default();
    let cand_title = normalize_title(&candidate.title);
    let cand_artist = candidate
        .artists
        .first()
        .map(|a| normalize_title(a))
        .unwrap_or_default();

    // 1. Точное совпадение нормализованных title + artist.
    // Нормализация включает транслитерацию кириллицы, поэтому
    // «Eldzhey» (Spotify, латиница) и «Элджей» (Deezer/YT, кириллица)
    // дают один и тот же ключ «eldzhey» и матчуются.
    let mut confidence = if !artist_norm.is_empty()
        && artist_norm == cand_artist
        && title_norm == cand_title
    {
        0.95
    } else if !artist_norm.is_empty()
        && cand_artist.is_empty()
        && title_norm == cand_title
    {
        // У кандидата не распарсился артист — матч по названию,
        // длительность ниже всё равно проверяется
        0.85
    } else if title_norm == cand_title && cand_artist.contains(&artist_norm) {
        0.90
    } else if !title_norm.is_empty()
        && (cand_title.contains(&title_norm) || title_norm.contains(&cand_title))
        && !artist_norm.is_empty()
        && (cand_artist.contains(&artist_norm) || artist_norm.contains(&cand_artist))
    {
        0.85
    } else if !title_norm.is_empty()
        && title_norm == cand_title
        // 2. Ослабленная ступень: название точное, но артист не совпал
        // (разные алфавиты в каталогах — «Eldzhey» vs «Элджей», имена
        // с двойным написанием). Длительность обязательна и строго ±3с,
        // иначе матч ненадёжен. Ставим ниже всех совпавших по артисту.
        && duration_ok(spotify.duration_ms, candidate.duration_ms)
        && spotify.duration_ms.is_some()
        && candidate.duration_ms.is_some()
    {
        0.75
    } else {
        return None;
    };

    // 3. Длительность как подтверждение/штраф для остальных ступеней:
    // ±3с — подтверждение, ±10с — штраф, дальше — отбраковка
    if confidence >= 0.85 {
        if !duration_ok(spotify.duration_ms, candidate.duration_ms) {
            let diff_ok_soft = match (spotify.duration_ms, candidate.duration_ms) {
                (Some(target), Some(dur)) => {
                    (dur as i64 - target as i64).unsigned_abs() <= 10_000
                }
                _ => true,
            };
            if !diff_ok_soft {
                return None;
            }
            confidence -= 0.10;
        }
    }
    Some(confidence)
}

/// Длительность в пределах ±3с (уверенное подтверждение).
fn duration_ok(target: Option<u64>, candidate: Option<u64>) -> bool {
    match (target, candidate) {
        (Some(target), Some(dur)) => (dur as i64 - target as i64).unsigned_abs() <= 3000,
        _ => true,
    }
}

/// Известные двойные написания артистов в YTM/Spotify (Allj = Элджей,
/// Skryptonite = Скриптонит и т.п.). Транслитерация их не сводит —
/// это просто разные имена. Расширяется по мере обнаружения.
fn artist_alias_keys(norm: &str) -> Vec<String> {
    match norm {
        "eldzhey" => vec!["eldzhey".into(), "allj".into()],
        "allj" => vec!["allj".into(), "eldzhey".into()],
        "skriptonit" => vec!["skriptonit".into(), "skryptonite".into()],
        "skryptonite" => vec!["skryptonite".into(), "skriptonit".into()],
        other => vec![other.to_string()],
    }
}

/// Публичный доступ к уверенности матча — для диагностики и тестов.
pub fn match_confidence_public(a: &TrackRef, b: &TrackRef) -> Option<f32> {
    match_confidence(a, b)
}

/// Совпадение артиста для ОБЩЕГО поиска (клипы): ключ артиста (с алиасами)
/// должен встретиться в артистах кандидата ИЛИ в самом названии видео
/// (в клипах «Feduk & Элджей — Розовое вино» имя в названии).
fn video_artist_matches(artist_norm: &str, cand_artist: &str, cand_title: &str) -> bool {
    artist_alias_keys(artist_norm).iter().any(|key| {
        cand_artist.contains(key.as_str()) || cand_title.contains(key.as_str())
    })
}

/// Кандидат из ОБЩЕГО поиска YTM (клипы): названия/артисты совпадают жёстко,
/// длительность мягко — официальные клипы короче полных треков (интро/аутро
/// вырезаны, «Розовое вино»: трек 4:07, клип 3:23). Порог выше: до ±90с
/// принимаем, дальше — нет. Видео заметно короче 60% трека — отбраковка
/// (нарезки/трейлеры).
pub fn best_candidates_video(
    target_track: &TrackRef,
    candidates: &[TrackRef],
) -> Vec<MatchCandidate> {
    let title_norm = normalize_title(&target_track.title);
    let artist_norm = target_track
        .artists
        .first()
        .map(|a| normalize_title(a))
        .unwrap_or_default();

    let mut matches: Vec<MatchCandidate> = Vec::new();
    for candidate in candidates {
        let cand_title = normalize_title(&candidate.title);
        let cand_artist = candidate
            .artists
            .first()
            .map(|a| normalize_title(a))
            .unwrap_or_default();

        // Название обязательно точное (после нормализации) или включающее
        let title_match = !title_norm.is_empty()
            && (cand_title == title_norm
                || cand_title.contains(&title_norm)
                || title_norm.contains(&cand_title));
        // Артист: ключи с алиасами в артистах кандидата или в названии видео
        let artist_match = !artist_norm.is_empty()
            && video_artist_matches(&artist_norm, &cand_artist, &cand_title);

        if !title_match || !artist_match {
            continue;
        }

        // Мягкая длительность: базовая уверенность по точности названия
        let mut base = if cand_title == title_norm { 0.80 } else { 0.72 };
        // Официальные клипы бустим: «(Official Video)» в названии — сильный
        // признак настоящего источника, а не кавера/нарезки
        if candidate.title.to_lowercase().contains("official") {
            base += 0.05;
        }
        let confidence = match (target_track.duration_ms, candidate.duration_ms) {
            (Some(target), Some(dur)) => {
                let diff = (dur as i64 - target as i64).unsigned_abs();
                if diff > 90_000 || dur < target * 6 / 10 {
                    // видео слишком короткое — нарезка/трейлер
                    continue;
                }
                base - (diff as f32 / 90_000.0) * 0.08
            }
            // Без длительности: в общем поиске YTM у видео-строк её нет.
            // Берём с небольшим штрафом — ниже матчей с известной длительностью
            _ => base - 0.04,
        };
        // Порог честности: слабые кандидаты (каверы/текстовые видео)
        // отсекаются, точные клип-матчи проходят
        if confidence < MIN_CONFIDENCE {
            continue;
        }
        matches.push(MatchCandidate {
            track: candidate.clone(),
            confidence,
        });
    }
    matches.sort_by(|a, b| {
        b.confidence
            .partial_cmp(&a.confidence)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    matches
}

/// Нормализация названия: скобки с фичами/ремиксами, feat/ft-суффиксы,
/// пунктуация, регистр, ё→е, затем транслитерация кириллицы в фонетический
/// ключ. Каталоги пишут имена в разных алфавитах («Eldzhey» в Spotify,
/// «Элджей» в Deezer/YT) — сравнивать надо в одном алфавите.
pub fn normalize_title(raw: &str) -> String {
    // ё→е до lowercasing: normalize падежей кириллицы в каталогах разный
    let s: String = raw
        .chars()
        .map(|c| match c {
            'ё' | 'Ё' => 'е',
            other => other,
        })
        .collect();
    let mut s = s.to_lowercase();
    // убираем содержимое скобок с типовыми маркерами
    for marker in [
        "official", "audio", "video", "lyric", "remaster", "remix", "feat", "ft", "live",
        "with",
    ] {
        // (…marker…) и […]marker…]
        strip_parenthesized(&mut s, marker);
    }
    // " - topic" (авто-каналы YouTube/Spotify)
    if s.ends_with(" - topic") {
        s.truncate(s.len() - " - topic".len());
    }
    // feat/ft/featuring вне скобок: «баста feat. тима белорусских» → «баста».
    // Режем по первому самостоятельному токену-маркеру, но не в начале.
    s = strip_feat_suffix(&s);
    // пунктуация и лишние пробелы
    let cleaned: String = s
        .chars()
        .filter(|c| c.is_alphanumeric() || c.is_whitespace())
        .collect::<String>()
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ");
    // Кириллица → фонетический латинский ключ (только для сравнения,
    // не для поисковых запросов — те уходят в API в оригинале)
    transliterate(&cleaned)
}

/// Практическая транслитерация кириллицы (похоже на то, как каталоги
/// сами латинизируют имена: элджей→eldzhey, багз→baga, юра→yura).
fn transliterate(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let chars: Vec<char> = s.chars().collect();
    let mut i = 0;
    while i < chars.len() {
        let rest: String = chars[i..].iter().collect();
        // Многосимвольные правила — первыми (жадно)
        let multi: [(&str, &str); 26] = [
            ("дж", "dzh"),
            ("дз", "dz"),
            ("кс", "x"),
            ("ий", "y"),
            ("ый", "y"),
            ("ье", "ye"),
            ("ья", "ya"),
            ("ью", "yu"),
            ("ай", "ay"),
            ("ей", "ey"),
            ("ой", "oy"),
            ("ый", "y"),
            ("тс", "ts"),
            ("ть", "t"),
            ("ь", ""),
            ("ъ", ""),
            ("шч", "shch"),
            ("yo", "yo"),
            // одиночные на случай, если многосимвольные не сработали
            ("а", "a"),
            ("б", "b"),
            ("в", "v"),
            ("г", "g"),
            ("д", "d"),
            ("е", "e"),
            ("ж", "zh"),
            ("з", "z"),
        ];
        let mut matched = false;
        for (cy, lat) in multi {
            if rest.starts_with(cy) {
                out.push_str(lat);
                i += cy.chars().count();
                matched = true;
                break;
            }
        }
        if matched {
            continue;
        }
        let c = chars[i];
        let single = match c {
            'и' => "i",
            'й' => "y",
            'к' => "k",
            'л' => "l",
            'м' => "m",
            'н' => "n",
            'о' => "o",
            'п' => "p",
            'р' => "r",
            'с' => "s",
            'т' => "t",
            'у' => "u",
            'ф' => "f",
            'х' => "h",
            'ц' => "ts",
            'ч' => "ch",
            'ш' => "sh",
            'щ' => "shch",
            'ы' => "y",
            'э' => "e",
            'ю' => "yu",
            'я' => "ya",
            other => {
                out.push(other);
                i += 1;
                continue;
            }
        };
        out.push_str(single);
        i += 1;
    }
    out
}

/// «Баста feat. X», «Song ft X», «Track featuring Y» → часть до маркера.
fn strip_feat_suffix(s: &str) -> String {
    let words: Vec<&str> = s.split_whitespace().collect();
    for (index, word) in words.iter().enumerate().skip(1) {
        let bare = word.trim_end_matches(['.', ',', ';', '!', '?']);
        if matches!(bare, "feat" | "ft" | "featuring" | "ft." | "feat.") {
            return words[..index].join(" ");
        }
    }
    s.to_string()
}

fn strip_parenthesized(s: &mut String, marker: &str) {
    for (open, close) in [('(', ')'), ('[', ']')] {
        let mut search_from = 0;
        while let Some(rel_start) = s[search_from..].find(open) {
            let start = search_from + rel_start;
            let Some(rel_end) = s[start..].find(close) else { break };
            let end = start + rel_end + close.len_utf8();
            let inner = s[start..end].to_lowercase();
            if inner.contains(marker) {
                s.replace_range(start..end, " ");
                // не сдвигаемся: на этом месте теперь пробел
            } else {
                // скобка без маркера — ищем следующую после неё
                search_from = end;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn track(provider: ProviderKind, id: &str, title: &str, artist: &str, dur: u64) -> TrackRef {
        TrackRef {
            provider,
            id: id.into(),
            title: title.into(),
            artists: vec![artist.into()],
            duration_ms: Some(dur),
            artwork_url: None,
            web_url: url::Url::parse("https://example.com/track").unwrap(),
            capability: crate::model::PlaybackCapability::Full,
            genres: Vec::new(),
            explicit: false,
            drm: false,
            isrc: None,
        }
    }

    #[test]
    fn normalize_strips_feat_and_parens() {
        assert_eq!(
            normalize_title("Get Lucky (feat. Pharrell Williams)"),
            "get lucky"
        );
        assert_eq!(
            normalize_title("Harder, Better, Faster, Stronger [Official Audio]"),
            "harder better faster stronger"
        );
        assert_eq!(normalize_title("Around the World - Topic"), "around the world");
        assert_eq!(normalize_title("One More Time"), "one more time");
    }

    #[test]
    fn with_marker_and_clean_query_match_feat_variants() {
        // «(with X)» — спотовская запись фита: чистим и в normalize, и в query
        assert_eq!(normalize_title("CRUSH (with Travis Scott)"), "crush");
        assert_eq!(normalize_title("TWIN TRIM (with Lil Uzi Vert)"), "twin trim");
        let spot = track(
            ProviderKind::Spotify,
            "1",
            "TWIN TRIM (with Lil Uzi Vert)",
            "Playboi Carti",
            94_825,
        );
        assert_eq!(search_query(&spot), "playboi carti twin trim");
        let dz = track(ProviderKind::Deezer, "9", "TWIN TRIM", "Playboi Carti", 94_000);
        assert_eq!(match_confidence(&spot, &dz), Some(0.95));
    }

    #[test]
    fn normalize_cyrillic() {
        // ё/е должны сводиться к одному виду
        assert_eq!(normalize_title("Ёлка"), normalize_title("Елка"));
        assert_eq!(normalize_title("Три дня дождя"), "tri dnya dozhdya");
        // em dash, кавычки, двойные пробелы
        assert_eq!(
            normalize_title("Баста — «Сансара»"),
            normalize_title("Баста Сансара")
        );
        // feat вне скобок
        assert_eq!(
            normalize_title("Баста feat. Тима Белорусских"),
            normalize_title("Баста")
        );
        assert_eq!(normalize_title("Song ft X"), "song");
        assert_eq!(normalize_title("Song featuring Y"), "song");
        // но не в начале и не часть слова
        assert_eq!(normalize_title("Aftertaste"), "aftertaste");
    }

    #[test]
    fn translit_merges_cyrillic_and_latin_names() {
        // Главное: одно и то же имя в разных алфавитах даёт один ключ
        assert_eq!(normalize_title("Элджей"), normalize_title("Eldzhey"));
        assert_eq!(normalize_title("Баста"), normalize_title("Basta"));
        assert_eq!(normalize_title("Кино"), normalize_title("Kino"));
        // и русские названия треков тоже сводятся
        assert_eq!(
            normalize_title("Рваные джинсы"),
            normalize_title("Rvanyе dzhinsy".replace('е', "е").as_str())
        );
    }

    #[test]
    fn title_exact_artist_mismatch_still_matches_if_duration_exact() {
        // «Eldzhey» (латиница) vs «Другое Имя» — артист не совпал,
        // но название и длительность точные → ослабленный матч 0.75
        let spotify = track(ProviderKind::Spotify, "sp9", "Рваные джинсы", "Eldzhey", 180_000);
        let dz = track(ProviderKind::Deezer, "d9", "Рваные джинсы", "Совсем Другой", 180_000);
        let m = best_match(&spotify, &[dz], ProviderKind::Deezer).expect("ослабленный матч");
        assert!((m.confidence - 0.75).abs() < 0.001, "conf={}", m.confidence);
    }

    #[test]
    fn title_exact_wrong_duration_no_match() {
        // Название совпало, артист нет, длительность далеко — отбраковка
        let spotify = track(ProviderKind::Spotify, "sp10", "Song", "Artist A", 180_000);
        let other = track(ProviderKind::Deezer, "d10", "Song", "Artist B", 240_000);
        assert!(best_match(&spotify, &[other], ProviderKind::Deezer).is_none());
    }

    #[test]
    fn confidence_thresholds() {
        let spotify = track(
            ProviderKind::Spotify, "sp1",
            "Get Lucky (feat. Pharrell Williams)", "Daft Punk", 249_000,
        );
        let yt_exact = track(
            ProviderKind::YouTubeMusic, "yt1",
            "Get Lucky (Official Audio)", "Daft Punk", 248_000,
        );
        let m = best_match(&spotify, &[yt_exact], ProviderKind::YouTubeMusic).unwrap();
        assert!(m.confidence >= MIN_CONFIDENCE, "confidence={}", m.confidence);
        assert_eq!(m.track.id, "yt1");
    }

    #[test]
    fn duration_mismatch_rejected() {
        let spotify = track(
            ProviderKind::Spotify, "sp2", "One More Time", "Daft Punk", 320_000,
        );
        let wrong = track(
            ProviderKind::Deezer, "d1", "One More Time (Live 2000)", "Daft Punk", 600_000,
        );
        assert!(best_match(&spotify, &[wrong], ProviderKind::Deezer).is_none());
    }

    #[test]
    fn isrc_beats_title_similarity() {
        let spotify = track(
            ProviderKind::Spotify, "sp3", "Совершенно другое название", "Артист", 200_000,
        );
        let mut candidate = track(
            ProviderKind::Deezer, "d3", "Другое название", "Другой артист", 200_000,
        );
        candidate.isrc = Some("RUA1P2600001".into());
        let mut spotify = spotify;
        spotify.isrc = Some("rua1p2600001".into());
        let m = best_match(&spotify, &[candidate], ProviderKind::Deezer).unwrap();
        assert_eq!(m.confidence, 1.0);
    }

    #[test]
    fn best_candidates_sorted_by_confidence() {
        let spotify = track(ProviderKind::Spotify, "sp4", "Song", "Artist", 200_000);
        let weaker = track(ProviderKind::Deezer, "d4a", "Song (Album Version)", "Artist", 200_000);
        let stronger = track(ProviderKind::Deezer, "d4b", "Song", "Artist", 200_000);
        let list = best_candidates(&spotify, &[weaker, stronger], ProviderKind::Deezer);
        assert_eq!(list.len(), 2);
        assert_eq!(list[0].track.id, "d4b");
        assert!(list[0].confidence > list[1].confidence);
    }

    #[test]
    fn auto_chain_is_deezer_then_ytm_manual_is_single() {
        assert_eq!(
            PlaybackSourceKind::Auto.chain(),
            vec![PlaybackSourceKind::Deezer, PlaybackSourceKind::YouTubeMusic]
        );
        assert_eq!(
            PlaybackSourceKind::Deezer.chain(),
            vec![PlaybackSourceKind::Deezer]
        );
        assert_eq!(
            PlaybackSourceKind::YouTubeMusic.chain(),
            vec![PlaybackSourceKind::YouTubeMusic]
        );
    }

    #[test]
    fn video_match_finds_clip_with_alias_artist() {
        // «Розовое вино»: трек удалён из каталога, остался клип.
        // В YTM артист записан как Allj (не Eldzhey) — нужен алиас.
        let spotify = track(ProviderKind::Spotify, "spv1", "Розовое вино", "Eldzhey", 247_000);
        let mut clip = track(ProviderKind::YouTubeMusic, "ytv1", "Розовое вино", "Allj & FEDUK", 0);
        clip.duration_ms = None; // у видео-строк общего поиска длительности нет
        let list = best_candidates_video(&spotify, &[clip]);
        assert_eq!(list.len(), 1, "клип должен матчиться по алиасу Allj");
        assert!(list[0].confidence >= MIN_CONFIDENCE);
    }

    #[test]
    fn video_match_artist_name_in_title() {
        // «Feduk & Элджей — Розовое вино (Official Video)»: артист в названии
        let spotify = track(ProviderKind::Spotify, "spv2", "Розовое вино", "Eldzhey", 247_000);
        let mut clip = track(
            ProviderKind::YouTubeMusic, "ytv2",
            "Feduk & Элджей — Розовое вино (Official Video)", "FEDUK", 0,
        );
        clip.duration_ms = None;
        let list = best_candidates_video(&spotify, &[clip]);
        assert_eq!(list.len(), 1);
    }

    #[test]
    fn video_match_rejects_other_artists_and_junk() {
        let spotify = track(ProviderKind::Spotify, "spv3", "Розовое вино", "Eldzhey", 247_000);
        // Тот же title, но чужой артист и имя не в названии
        let mut foreign_cover = track(ProviderKind::YouTubeMusic, "ytv3", "Розовое Вино", "Гр.Одноклассники", 0);
        foreign_cover.duration_ms = None;
        // Текстовое видео: имя в названии есть, но названия нет
        let mut lyric = track(ProviderKind::YouTubeMusic, "ytv4", "Элджей & Feduk «Розовое Вино» (Текст)", "Play Muzic", 0);
        lyric.duration_ms = None;
        let list = best_candidates_video(&spotify, &[foreign_cover, lyric]);
        assert!(list.is_empty(), "чужие артисты не должны матчиться");
    }

    #[test]
    fn video_match_duration_soft_window() {
        // Клип короче трека на 44с (3:23 vs 4:07) — принимается со штрафом
        let spotify = track(ProviderKind::Spotify, "spv5", "Song", "Artist", 247_000);
        let clip = track(ProviderKind::YouTubeMusic, "ytv5", "Song", "Artist", 203_000);
        let list = best_candidates_video(&spotify, &[clip]);
        assert_eq!(list.len(), 1);
        // Нарезка 60%+ — отбраковка
        let cut = track(ProviderKind::YouTubeMusic, "ytv6", "Song", "Artist", 90_000);
        assert!(best_candidates_video(&spotify, &[cut]).is_empty());
    }

    #[test]
    fn source_kind_round_trip_and_aliases() {
        assert_eq!(
            PlaybackSourceKind::from_str("auto"),
            Some(PlaybackSourceKind::Auto)
        );
        assert_eq!(
            PlaybackSourceKind::from_str("deezer"),
            Some(PlaybackSourceKind::Deezer)
        );
        assert_eq!(
            PlaybackSourceKind::from_str("youtube_music"),
            Some(PlaybackSourceKind::YouTubeMusic)
        );
        // старый алиас «youtube» означает Music, а не отдельный провайдер
        assert_eq!(
            PlaybackSourceKind::from_str("youtube"),
            Some(PlaybackSourceKind::YouTubeMusic)
        );
        assert_eq!(PlaybackSourceKind::Auto.as_str(), "auto");
        assert_eq!(
            PlaybackSourceKind::from_str(PlaybackSourceKind::Auto.as_str()),
            Some(PlaybackSourceKind::Auto)
        );
    }

    #[test]
    fn different_artist_same_title_rejected() {
        // Кавер: другой артист, та же длительность — ослабленный матч,
        // но приоритет ниже прямого совпадения по артисту
        let spotify = track(ProviderKind::Spotify, "sp5", "Кино", "Виктор Цой", 200_000);
        let cover = track(ProviderKind::YouTubeMusic, "yt5", "Кино", "Другая Группа", 200_000);
        let m = best_match(&spotify, &[cover], ProviderKind::YouTubeMusic)
            .expect("точный title+duration даёт ослабленный матч");
        assert!((m.confidence - 0.75).abs() < 0.001);
        // А кавер с другой длительностью отбраковывается полностью
        let long_cover = track(ProviderKind::YouTubeMusic, "yt5b", "Кино", "Другая Группа", 260_000);
        assert!(best_match(&spotify, &[long_cover], ProviderKind::YouTubeMusic).is_none());
    }
}
