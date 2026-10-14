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

pub mod cache;
pub mod matching;
pub mod normalize;
pub mod types;

#[cfg(test)]
mod tests;

use std::sync::{Arc, Mutex};

use anyhow::{Result, bail};

use crate::{
    model::{PlaybackSource, ProviderKind, TrackRef},
    provider::ProviderRegistry,
};

pub use cache::MatchCache;
pub use matching::{
    best_candidates, best_candidates_video, best_match, match_confidence_public,
};
pub use normalize::{clean_search_query, normalize_title, search_query};
pub use types::{
    MatchCandidate, PlaybackSourceKind, ResolveStage, MAX_CANDIDATES, MIN_CONFIDENCE,
    SEARCH_LIMIT, SEARCH_TIMEOUT,
};

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
        let mut candidates = best_candidates(track, &page.tracks, foreign_kind);
        if candidates.is_empty() {
            // Фолбэк: пробуем очищенный запрос без feat/скобок (актуально для Deezer)
            let clean_q = clean_search_query(track);
            if clean_q != query {
                if let Ok(Ok(clean_page)) = tokio::time::timeout(
                    SEARCH_TIMEOUT,
                    foreign_provider.search(&clean_q, None),
                ).await {
                    let clean_candidates = best_candidates(track, &clean_page.tracks, foreign_kind);
                    if !clean_candidates.is_empty() {
                        candidates = clean_candidates;
                    }
                }
            }
        }

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
    ) -> Result<(TrackRef, PlaybackSource)> {
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
                    // клип-фолбэк для YouTube Music (и в Auto, и при прямом выборе источника)
                    if *source == PlaybackSourceKind::YouTubeMusic {
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
        // Общий поиск идёт через общий Innertube-клиент YTM-провайдера (если локальный)
        // либо через штатный поиск провайдера (если удалённый ServerProvider)
        let tracks = if let Some(ytm_provider) = ytm
            .as_any()
            .downcast_ref::<crate::provider::youtube::YouTubeMusicProvider>()
        {
            let client = ytm_provider.client();
            let query = search_query(track);
            let search = tokio::time::timeout(
                SEARCH_TIMEOUT,
                crate::provider::youtube::search::search_tracks_general(&client, &query),
            )
            .await;
            match search {
                Ok(Ok(tracks)) => tracks,
                Ok(Err(error)) => bail!("общий поиск YouTube Music не удался: {error}"),
                Err(_) => bail!(
                    "общий поиск YouTube Music не ответил за {} с",
                    SEARCH_TIMEOUT.as_secs()
                ),
            }
        } else {
            let query = search_query(track);
            let search = tokio::time::timeout(SEARCH_TIMEOUT, ytm.search(&query, None)).await;
            match search {
                Ok(Ok(page)) => page.tracks,
                Ok(Err(error)) => bail!("поиск на сервере не удался: {error}"),
                Err(_) => bail!(
                    "поиск на сервере не ответил за {} с",
                    SEARCH_TIMEOUT.as_secs()
                ),
            }
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
