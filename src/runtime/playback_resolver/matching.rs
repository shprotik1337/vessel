use crate::model::{ProviderKind, TrackRef};

use super::{
    normalize::{artist_alias_keys, is_unknown_artist, normalize_title, strip_all_brackets},
    types::{MIN_CONFIDENCE, MatchCandidate, SEARCH_LIMIT},
};

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
    matches.sort_by(|a, b| {
        b.confidence
            .partial_cmp(&a.confidence)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    matches
}

/// Совместимость со старым API: лучший кандидат.
pub fn best_match(
    spotify: &TrackRef,
    candidates: &[TrackRef],
    foreign_kind: ProviderKind,
) -> Option<MatchCandidate> {
    best_candidates(spotify, candidates, foreign_kind)
        .into_iter()
        .next()
}

/// Проверка совпадения артистов: точное, алиасы (Eldzhey/Allj) или подстрока.
pub(crate) fn artist_matches(spotify: &TrackRef, candidate: &TrackRef) -> Option<f32> {
    let sp_artists: Vec<String> = spotify
        .artists
        .iter()
        .map(|a| normalize_title(a))
        .filter(|s| !s.is_empty() && !is_unknown_artist(s))
        .collect();
    let ca_artists: Vec<String> = candidate
        .artists
        .iter()
        .map(|a| normalize_title(a))
        .filter(|s| !s.is_empty() && !is_unknown_artist(s))
        .collect();

    if sp_artists.is_empty() || ca_artists.is_empty() {
        return None;
    }

    // 1. Точное совпадение любого артиста
    for sa in &sp_artists {
        for ca in &ca_artists {
            if sa == ca {
                return Some(0.95);
            }
        }
    }

    // 2. Алиасы (Allj <-> Eldzhey и т.д.)
    for sa in &sp_artists {
        let aliases = artist_alias_keys(sa);
        for ca in &ca_artists {
            if aliases.iter().any(|k| ca == k) {
                return Some(0.95);
            }
        }
    }

    // 3. Подстрока (например, один каталог пишет артистов через запятую в одной строке)
    for sa in &sp_artists {
        for ca in &ca_artists {
            if ca.contains(sa) || sa.contains(ca) {
                return Some(0.90);
            }
        }
    }

    None
}

/// Уверенность совпадения пары треков (None — не совпадает).
pub(crate) fn match_confidence(spotify: &TrackRef, candidate: &TrackRef) -> Option<f32> {
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
    let cand_title = normalize_title(&candidate.title);

    let title_base = normalize_title(&strip_all_brackets(&spotify.title));
    let cand_base = normalize_title(&strip_all_brackets(&candidate.title));

    let artist_score = artist_matches(spotify, candidate);

    let is_exact = !title_norm.is_empty() && title_norm == cand_title;
    let is_base_exact = !title_base.is_empty() && title_base == cand_base;
    let is_contains = !title_norm.is_empty()
        && (cand_title.contains(&title_norm) || title_norm.contains(&cand_title));
    let is_base_contains = !title_base.is_empty()
        && (cand_base.contains(&title_base) || title_base.contains(&cand_base));

    let mut confidence = if let Some(score) = artist_score {
        if is_exact {
            score
        } else if is_base_exact {
            (score - 0.05).max(0.80)
        } else if is_contains || is_base_contains {
            (score - 0.10).max(0.75)
        } else {
            return None;
        }
    } else if is_exact || is_base_exact {
        // У кандидата не распарсился артист или другой алфавит
        // Проверяем: может имя артиста содержится в названии трека кандидата?
        let artist_in_title = spotify.artists.iter().any(|a| {
            let a_norm = normalize_title(a);
            !a_norm.is_empty() && !is_unknown_artist(&a_norm) && cand_title.contains(&a_norm)
        });
        let has_known_artist = spotify.artists.iter().any(|a| {
            let a_norm = normalize_title(a);
            !a_norm.is_empty() && !is_unknown_artist(&a_norm)
        });
        if artist_in_title {
            0.85
        } else if !has_known_artist || candidate.artists.is_empty() {
            // У целевого трека нет известного артиста или у кандидата вообще нет артистов
            0.80
        } else if duration_ok(spotify.duration_ms, candidate.duration_ms)
            && spotify.duration_ms.is_some()
            && candidate.duration_ms.is_some()
        {
            // Ослабленная ступень: название точное, но артист не совпал
            // (разные алфавиты/имена). Длительность обязательна и строго ±3с.
            0.75
        } else {
            return None;
        }
    } else if is_contains || is_base_contains {
        // Кандидат SoundCloud/YouTube формата «Artist - Title» или «Title (feat. Artist)»:
        // название содержит и имя артиста, и название трека
        let artist_in_title = spotify.artists.iter().any(|a| {
            let a_norm = normalize_title(a);
            !a_norm.is_empty() && !is_unknown_artist(&a_norm) && cand_title.contains(&a_norm)
        });
        let has_known_artist = spotify.artists.iter().any(|a| {
            let a_norm = normalize_title(a);
            !a_norm.is_empty() && !is_unknown_artist(&a_norm)
        });
        if artist_in_title {
            0.82
        } else if !has_known_artist {
            // Целевой трек без артиста (локальный файл), но название точно есть внутри кандидата
            0.80
        } else {
            return None;
        }
    } else {
        return None;
    };

    // Длительность как подтверждение/штраф
    if confidence >= 0.70 {
        if !duration_ok(spotify.duration_ms, candidate.duration_ms) {
            let diff_ms = match (spotify.duration_ms, candidate.duration_ms) {
                (Some(target), Some(dur)) => (dur as i64 - target as i64).unsigned_abs(),
                _ => 0,
            };
            let is_exact_title = is_exact || is_base_exact;
            let is_strong_artist = artist_score.is_some_and(|s| s >= 0.90)
                || spotify.artists.iter().any(|a| {
                    let a_norm = normalize_title(a);
                    !a_norm.is_empty() && cand_title.contains(&a_norm)
                });

            if is_exact_title && is_strong_artist {
                // Точное название и подтверждённый артист:
                // допускаем радио-версии, сингл vs альбом и клиповые версии (не выкидываем!)
                if diff_ms > 240_000 {
                    return None;
                } else if diff_ms > 90_000 {
                    confidence = (confidence - 0.20).max(MIN_CONFIDENCE);
                } else if diff_ms > 20_000 {
                    confidence = (confidence - 0.15).max(MIN_CONFIDENCE);
                } else if diff_ms > 8_000 {
                    confidence = (confidence - 0.10).max(MIN_CONFIDENCE);
                } else if diff_ms > 3_000 {
                    confidence = (confidence - 0.05).max(MIN_CONFIDENCE);
                }
            } else if is_strong_artist {
                // Артист подтверждён (в поле артиста или в названии): заголовок частично совпадает
                if diff_ms > 180_000 {
                    return None;
                } else if diff_ms > 20_000 {
                    confidence = (confidence - 0.15).max(MIN_CONFIDENCE);
                } else if diff_ms > 8_000 {
                    confidence = (confidence - 0.10).max(MIN_CONFIDENCE);
                } else if diff_ms > 3_000 {
                    confidence = (confidence - 0.05).max(MIN_CONFIDENCE);
                }
            } else {
                let max_allowed_diff = if is_exact_title { 30_000 } else { 15_000 };
                if diff_ms > max_allowed_diff {
                    return None;
                } else if diff_ms > 8_000 {
                    confidence -= 0.15;
                } else if diff_ms > 3_000 {
                    confidence -= 0.05;
                }
            }
        }
    }

    if confidence >= MIN_CONFIDENCE {
        Some(confidence)
    } else {
        None
    }
}

/// Длительность в пределах ±3с (уверенное подтверждение).
pub(crate) fn duration_ok(target: Option<u64>, candidate: Option<u64>) -> bool {
    match (target, candidate) {
        (Some(target), Some(dur)) => (dur as i64 - target as i64).unsigned_abs() <= 3000,
        _ => true,
    }
}

/// Публичный доступ к уверенности матча — для диагностики и тестов.
pub fn match_confidence_public(a: &TrackRef, b: &TrackRef) -> Option<f32> {
    match_confidence(a, b)
}

/// Совпадение артиста для ОБЩЕГО поиска (клипы): ключ артиста (с алиасами)
/// должен встретиться в артистах кандидата ИЛИ в самом названии видео
/// (в клипах «Feduk & Элджей — Розовое вино» имя в названии).
pub(crate) fn video_artist_matches(artist_norm: &str, cand_artist: &str, cand_title: &str) -> bool {
    artist_alias_keys(artist_norm)
        .iter()
        .any(|key| cand_artist.contains(key.as_str()) || cand_title.contains(key.as_str()))
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
        // Артист: проверяем всех артистов целевого трека (в артистах кандидата или названии видео)
        let artist_match = target_track.artists.iter().any(|a| {
            let a_norm = normalize_title(a);
            if a_norm.is_empty() {
                return false;
            }
            video_artist_matches(&a_norm, &cand_artist, &cand_title)
                || candidate.artists.iter().any(|ca| {
                    let ca_norm = normalize_title(ca);
                    video_artist_matches(&a_norm, &ca_norm, &cand_title)
                })
        });

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
                if diff > 180_000 || (target > 30_000 && dur < target * 4 / 10) {
                    // видео слишком короткое — нарезка/трейлер
                    continue;
                }
                base - (diff as f32 / 180_000.0) * 0.08
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
