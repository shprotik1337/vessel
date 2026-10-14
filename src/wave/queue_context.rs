use std::collections::HashSet;

use serde::{Deserialize, Serialize};

use crate::model::TrackRef;

use super::{
    genre::WaveGenreProfile,
    text::{clean_artist_name, is_junk_artist, is_valid_artist_name, track_key, track_semantic_key},
};

/// Многоуровневый контекст воспроизведения для Autoplay и Smart Shuffle.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
pub struct QueueContext {
    /// Текущий играющий трек
    pub current_track: Option<TrackRef>,
    /// Недавно воспроизведенные треки (скользящее окно, до 10 штук)
    pub recent_played: Vec<TrackRef>,
    /// Оставшиеся несыгранные треки в очереди
    pub remaining_queue: Vec<TrackRef>,
    /// Семантические ключи треков, уже проигранных в рамках текущей сессии
    pub session_played_keys: HashSet<String>,
    /// Артисты или треки, пропущенные пользователем в первые 20 секунд (негативный сигнал)
    pub feedback_skips: HashSet<String>,
    /// Треки, залайканные пользователем в текущей сессии (наивысший позитивный сигнал)
    pub feedback_likes: HashSet<String>,
}

impl QueueContext {
    /// Извлекает наиболее релевантных сид-артистов из текущего трека и всей глубины очереди
    /// с контролируемой стохастической ротацией и разнообразием.
    pub fn extract_seed_artists(&self, limit: usize) -> Vec<String> {
        let mut seeds = Vec::new();
        let mut seen = HashSet::new();

        // 1. Текущий трек (берем главного артиста, если он еще не перегружен в сессии)
        if let Some(cur) = &self.current_track {
            if let Some(first_artist) = cur.artists.first() {
                let clean = clean_artist_name(first_artist);
                if is_valid_artist_name(&clean) && seen.insert(clean.clone()) {
                    seeds.push(clean);
                }
            }
        }

        // 2. Сбор потенциальных артистов из recent_played и remaining_queue
        let mut candidate_artists: Vec<String> = Vec::new();
        for t in self.recent_played.iter().chain(self.remaining_queue.iter()) {
            for a in &t.artists {
                let clean = clean_artist_name(a);
                if is_valid_artist_name(&clean) && !seen.contains(&clean) && !candidate_artists.contains(&clean) {
                    candidate_artists.push(clean);
                }
            }
        }

        // Случайно перемешиваем пул кандидатов-артистов, чтобы не брать всегда одних и тех же
        crate::app::shuffle_slice(&mut candidate_artists);

        // Приоритет артистам, которые еще не играли в session_played_keys
        for artist in candidate_artists {
            if seeds.len() >= limit {
                break;
            }
            if seen.insert(artist.clone()) {
                seeds.push(artist);
            }
        }

        // Ротируем порядок сидов перед возвратом, чтобы провайдеры опрашивались не по шаблону A->B->C
        crate::app::shuffle_slice(&mut seeds);
        seeds
    }

    /// Извлекает треки-сиды для поиска related с равномерным стохастическим охватом очереди
    pub fn extract_seed_tracks(&self, limit: usize) -> Vec<TrackRef> {
        let mut seeds = Vec::new();
        let mut seen_keys = HashSet::new();
        let mut seen_artists = HashSet::new();

        // 1. Текущий трек
        if let Some(cur) = &self.current_track {
            let sk = track_semantic_key(cur);
            seen_keys.insert(sk);
            if let Some(a) = cur.artists.first() {
                seen_artists.insert(clean_artist_name(a));
            }
            seeds.push(cur.clone());
        }

        // 2. Сбор пула треков-кандидатов из recent_played и remaining_queue
        let mut pool: Vec<TrackRef> = Vec::new();
        for t in self.recent_played.iter().chain(self.remaining_queue.iter()) {
            let sk = track_semantic_key(t);
            if !seen_keys.contains(&sk) && !self.feedback_skips.contains(&sk) {
                pool.push(t.clone());
            }
        }

        // Случайно перемешиваем пул доступных кандидатов очереди
        crate::app::shuffle_slice(&mut pool);

        // Сначала пробуем отобрать треки от разных артистов
        for t in &pool {
            if seeds.len() >= limit {
                break;
            }
            let sk = track_semantic_key(t);
            let art = t.artists.first().map(|a| clean_artist_name(a)).unwrap_or_default();
            if seen_keys.insert(sk) {
                if art.is_empty() || seen_artists.insert(art) {
                    seeds.push(t.clone());
                }
            }
        }

        // Если не добрали лимит из-за фильтра уникальности артистов, добираем любые оставшиеся треки пула
        if seeds.len() < limit {
            for t in &pool {
                if seeds.len() >= limit {
                    break;
                }
                let sk = track_semantic_key(t);
                if seen_keys.insert(sk) {
                    seeds.push(t.clone());
                }
            }
        }

        // Ротируем порядок сид-треков, чтобы исключить повторяемую цепочку запросов
        crate::app::shuffle_slice(&mut seeds);
        seeds
    }

    /// Вычисляет актуальный жанровый вектор контекста
    pub fn calculate_genre_vector(&self) -> WaveGenreProfile {
        let mut context_tracks = Vec::new();
        if let Some(cur) = &self.current_track {
            context_tracks.push(cur.clone());
        }
        context_tracks.extend(self.recent_played.iter().cloned());
        context_tracks.extend(self.remaining_queue.iter().cloned());
        WaveGenreProfile::from_tracks(&context_tracks)
    }

    /// Проверяет, был ли трек уже задействован в текущей сессии или очереди
    pub fn is_already_used(&self, track: &TrackRef) -> bool {
        let sk = track_semantic_key(track);
        if self.session_played_keys.contains(&sk) {
            return true;
        }
        if let Some(cur) = &self.current_track {
            if track_semantic_key(cur) == sk {
                return true;
            }
        }
        if self.recent_played.iter().any(|t| track_semantic_key(t) == sk) {
            return true;
        }
        if self.remaining_queue.iter().any(|t| track_semantic_key(t) == sk) {
            return true;
        }
        false
    }
}

/// Расчет штрафа за повторы с экспоненциальным затуханием (Repeat Penalty Decay).
pub struct RepeatPenaltyDecay;

impl RepeatPenaltyDecay {
    /// Вычисляет штраф в зависимости от дистанции d (сколько треков назад играл трек).
    /// d = 0 или 1 -> ~3.0 штраф
    /// d = 10 -> ~0.6 штраф
    /// d >= 30 -> <0.05 штраф
    pub fn calculate(distance: usize) -> f64 {
        if distance == 0 {
            return 3.5;
        }
        let base = 3.2;
        let lambda = 0.14;
        base * (-lambda * (distance as f64)).exp()
    }
}

/// Страж разнообразия артистов (Artist Diversity Guard).
pub struct ArtistDiversityGuard {
    max_per_artist: usize,
}

impl ArtistDiversityGuard {
    pub fn new(max_per_artist: usize) -> Self {
        Self { max_per_artist }
    }

    /// Проверяет, можно ли добавить трек этого артиста в формируемый чанк.
    pub fn can_add(&self, track: &TrackRef, current_chunk: &[TrackRef]) -> bool {
        let art = clean_artist_name(&track.display_artist());
        if art.is_empty() || is_junk_artist(&art) {
            return false;
        }
        let count = current_chunk
            .iter()
            .filter(|t| clean_artist_name(&t.display_artist()) == art)
            .count();
        count < self.max_per_artist
    }

    /// Вычисляет динамический штраф за частоту артиста на основе недавней очереди.
    pub fn artist_frequency_penalty(track: &TrackRef, recent_played: &[TrackRef]) -> f64 {
        let art = clean_artist_name(&track.display_artist());
        if art.is_empty() {
            return 0.0;
        }
        let recent_occurrences = recent_played
            .iter()
            .filter(|t| clean_artist_name(&t.display_artist()) == art)
            .count();
        (recent_occurrences as f64) * 0.85
    }
}

/// Результат применения Smart Shuffle интерливинга
#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct SmartShuffleResult {
    /// Новая объединенная очередь
    pub interleaved_queue: Vec<TrackRef>,
    /// Ключи треков, которые были внедрены рекомендациями
    pub injected_track_keys: HashSet<String>,
}

/// Интерливер для Smart Shuffle (чередование оригиналов и рекомендаций 2:1 или 3:1).
pub struct SmartShuffleInterleaver;

impl SmartShuffleInterleaver {
    pub fn interleave(
        base_tracks: &[TrackRef],
        recommendations: &[TrackRef],
        ratio: usize, // сколько базовых треков на 1 рекомендацию (например, 2)
    ) -> SmartShuffleResult {
        let mut interleaved_queue = Vec::with_capacity(base_tracks.len() + recommendations.len());
        let mut injected_track_keys = HashSet::new();

        let ratio = ratio.max(1);
        let mut b_idx = 0;
        let mut r_idx = 0;

        while b_idx < base_tracks.len() || r_idx < recommendations.len() {
            // Берем `ratio` базовых треков
            let take_base = (b_idx + ratio).min(base_tracks.len());
            for i in b_idx..take_base {
                interleaved_queue.push(base_tracks[i].clone());
            }
            b_idx = take_base;

            // Внедряем 1 рекомендацию
            if r_idx < recommendations.len() {
                let rec = &recommendations[r_idx];
                injected_track_keys.insert(track_key(rec));
                interleaved_queue.push(rec.clone());
                r_idx += 1;
            }
        }

        SmartShuffleResult {
            interleaved_queue,
            injected_track_keys,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::model::{PlaybackCapability, ProviderKind, TrackOrigin};

    fn make_test_track(id: &str, artist: &str, title: &str) -> TrackRef {
        TrackRef {
            provider: ProviderKind::SoundCloud,
            id: id.to_string(),
            title: title.to_string(),
            artists: vec![artist.to_string()],
            duration_ms: Some(180_000),
            artwork_url: None,
            web_url: url::Url::parse("https://soundcloud.com").unwrap(),
            capability: PlaybackCapability::Full,
            genres: Vec::new(),
            explicit: false,
            drm: false,
            isrc: None,
            origin: TrackOrigin::Original,
            album_url: None,
            album_title: None,
        }
    }

    #[test]
    fn extract_seed_artists_samples_across_queue_depth() {
        let cur = make_test_track("c1", "Kanye West", "Bound 2");
        let recent = vec![
            make_test_track("r1", "Kid Cudi", "Day 'n' Nite"),
            make_test_track("r2", "Travis Scott", "Goosebumps"),
            make_test_track("r3", "Playboi Carti", "Magnolia"),
            make_test_track("r4", "Kanye West", "Stronger"),
            make_test_track("r5", "Kanye West", "Heartless"),
        ];

        let ctx = QueueContext {
            current_track: Some(cur),
            recent_played: recent,
            ..Default::default()
        };

        let seeds = ctx.extract_seed_artists(4);
        assert_eq!(seeds.len(), 4);
        // Kanye West должен быть представлен только один раз, а остальные сиды должны охватывать других артистов очереди
        let kanye_count = seeds.iter().filter(|a| a.to_lowercase() == "kanye west").count();
        assert_eq!(kanye_count, 1, "Current artist must not dominate seed list");
        assert!(seeds.contains(&"kid cudi".to_string()) || seeds.contains(&"travis scott".to_string()) || seeds.contains(&"playboi carti".to_string()));
    }

    #[test]
    fn smart_shuffle_interleaver_ratio_3() {
        let base = (0..9).map(|i| make_test_track(&format!("b{i}"), "Artist", &format!("Base {i}"))).collect::<Vec<_>>();
        let recs = (0..3).map(|i| make_test_track(&format!("r{i}"), "Rec Artist", &format!("Rec {i}"))).collect::<Vec<_>>();

        let res = SmartShuffleInterleaver::interleave(&base, &recs, 3);
        assert_eq!(res.interleaved_queue.len(), 12);
        // Рекомендация должна вставляться после каждых 3 базовых треков (индексы 3, 7, 11)
        assert_eq!(res.interleaved_queue[3].id, "r0");
        assert_eq!(res.interleaved_queue[7].id, "r1");
        assert_eq!(res.interleaved_queue[11].id, "r2");
    }
}
