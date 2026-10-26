use std::collections::HashSet;

use crate::model::TrackRef;

use super::{WaveMode, WaveSettings, WaveTasteProfile, artist_id, track_key};

pub(crate) struct WaveSeeds {
    pub tracks: Vec<TrackRef>,
    pub artist_names: Vec<String>,
    pub strict_artist_ids: HashSet<String>,
}

pub(crate) fn build_seeds(
    profile: &WaveTasteProfile,
    liked: &[(TrackRef, i64)],
    playlist_tracks: &[TrackRef],
    manual: &[TrackRef],
    manual_only: bool,
    settings: &WaveSettings,
) -> WaveSeeds {
    // Собираем семена с гарантированным разнообразием артистов:
    // берём по 1 треку от каждого уникального артиста из топа библиотеки и истории
    let mut tracks = Vec::new();
    let mut seen_tracks = HashSet::new();
    let mut seen_artists = HashSet::new();

    // 1. Ручные семена (если переданы)
    for track in manual {
        if seen_tracks.insert(track_key(track)) {
            seen_artists.insert(artist_id(track));
            tracks.push(track.clone());
        }
    }

    // 2. Если не manual_only — собираем семена от разных артистов с рандомизированным охватом
    if !manual_only {
        // Берём треки из недавних уникальных артистов со случайной выборкой
        let mut recent_candidates = Vec::new();
        for track in &profile.recent_tracks {
            let aid = artist_id(track);
            if !aid.is_empty()
                && !seen_artists.contains(&aid)
                && !seen_tracks.contains(&track_key(track))
            {
                recent_candidates.push(track.clone());
            }
        }
        crate::app::shuffle_slice(&mut recent_candidates);
        for track in recent_candidates {
            let aid = artist_id(&track);
            if seen_artists.insert(aid) && seen_tracks.insert(track_key(&track)) {
                tracks.push(track);
                if tracks.len() >= 4 {
                    break;
                }
            }
        }

        // Подготавливаем когорты лайков: свежие лайки, средние и глубокие (старые любимые)
        let mut liked_candidates: Vec<TrackRef> = Vec::new();
        if !liked.is_empty() {
            let len = liked.len();
            let recent_slice = &liked[..len.min(25)];
            let older_slice = &liked[len.min(25)..];

            let mut recent_pool: Vec<TrackRef> =
                recent_slice.iter().map(|(t, _)| t.clone()).collect();
            let mut older_pool: Vec<TrackRef> =
                older_slice.iter().map(|(t, _)| t.clone()).collect();
            crate::app::shuffle_slice(&mut recent_pool);
            crate::app::shuffle_slice(&mut older_pool);

            // Чередуем свежие и старые любимые для богатого микса ностальгии и свежести
            let max_c = recent_pool.len().max(older_pool.len());
            for idx in 0..max_c {
                if idx < recent_pool.len() {
                    liked_candidates.push(recent_pool[idx].clone());
                }
                if idx < older_pool.len() {
                    liked_candidates.push(older_pool[idx].clone());
                }
            }
        }

        let mut playlist_candidates: Vec<TrackRef> = playlist_tracks.to_vec();
        crate::app::shuffle_slice(&mut playlist_candidates);

        // Добираем семена от уникальных артистов из лайков и плейлистов
        for pass_unique_artist in [true, false] {
            if tracks.len() >= 12 {
                break;
            }
            for track in &liked_candidates {
                let aid = artist_id(track);
                if pass_unique_artist && seen_artists.contains(&aid) {
                    continue;
                }
                if seen_tracks.insert(track_key(track)) {
                    seen_artists.insert(aid);
                    tracks.push(track.clone());
                    if tracks.len() >= 12 {
                        break;
                    }
                }
            }
            if tracks.len() >= 12 {
                break;
            }
            for track in &playlist_candidates {
                let aid = artist_id(track);
                if pass_unique_artist && seen_artists.contains(&aid) {
                    continue;
                }
                if seen_tracks.insert(track_key(track)) {
                    seen_artists.insert(aid);
                    tracks.push(track.clone());
                    if tracks.len() >= 12 {
                        break;
                    }
                }
            }
        }

        // Ротируем порядок семян, чтобы устранить монотонный порядок A->B->C->D
        crate::app::shuffle_slice(&mut tracks);
    }
    let mut artist_ids = manual.iter().map(artist_id).collect::<Vec<_>>();
    if !manual_only {
        if matches!(settings.mode, WaveMode::Balanced | WaveMode::Radio) {
            artist_ids.extend(profile.recent_artist_ids.iter().cloned());
            artist_ids.extend(profile.recent_top_artists.iter().map(|(id, _)| id.clone()));
            artist_ids.extend(
                profile
                    .liked_top_artists_recent
                    .iter()
                    .map(|(id, _)| id.clone()),
            );
            artist_ids.extend(
                profile
                    .liked_top_artists_alltime
                    .iter()
                    .take(12)
                    .map(|(id, _)| id.clone()),
            );
        } else {
            artist_ids.extend(profile.all_top_artists.iter().map(|(id, _)| id.clone()));
            artist_ids.extend(profile.recent_top_artists.iter().map(|(id, _)| id.clone()));
            artist_ids.extend(
                profile
                    .liked_top_artists_alltime
                    .iter()
                    .map(|(id, _)| id.clone()),
            );
        }
    }
    let artist_ids = unique(artist_ids, 16);
    let mut artist_names = unique_names(manual.iter().map(TrackRef::display_artist), 16);
    for id in &artist_ids {
        if let Some(name) = profile.artist_names.get(id)
            && !artist_names
                .iter()
                .any(|current| current.eq_ignore_ascii_case(name))
        {
            artist_names.push(name.clone());
        }
    }
    if profile.recent_tracks.is_empty() && manual.is_empty() {
        let mut sample_count = 0;
        for (track, _) in liked.iter() {
            let name = track.display_artist();
            if !name.trim().is_empty()
                && !artist_names
                    .iter()
                    .any(|current| current.eq_ignore_ascii_case(&name))
            {
                artist_names.push(name);
                sample_count += 1;
                if sample_count >= 5 {
                    break;
                }
            }
        }
        if sample_count < 5 {
            for track in playlist_tracks.iter() {
                let name = track.display_artist();
                if !name.trim().is_empty()
                    && !artist_names
                        .iter()
                        .any(|current| current.eq_ignore_ascii_case(&name))
                {
                    artist_names.push(name);
                    sample_count += 1;
                    if sample_count >= 8 {
                        break;
                    }
                }
            }
        }
    }
    if artist_names.is_empty() {
        artist_names.push("popular music".to_string());
    } else if manual.is_empty() {
        crate::app::shuffle_slice(&mut artist_names);
    }
    let strict_artist_ids = if settings.novelty <= 0.001 {
        let source = if manual.is_empty() {
            tracks.iter().take(8).collect::<Vec<_>>()
        } else {
            manual.iter().collect::<Vec<_>>()
        };
        source.into_iter().map(artist_id).collect()
    } else {
        HashSet::new()
    };
    WaveSeeds {
        tracks,
        artist_names,
        strict_artist_ids,
    }
}

fn unique(values: Vec<String>, limit: usize) -> Vec<String> {
    let mut seen = HashSet::new();
    values
        .into_iter()
        .filter(|value| !value.trim().is_empty() && seen.insert(value.clone()))
        .take(limit)
        .collect()
}

fn unique_names(values: impl Iterator<Item = String>, limit: usize) -> Vec<String> {
    let mut result = Vec::<String>::new();
    for value in values {
        if value.trim().is_empty()
            || result
                .iter()
                .any(|current| current.eq_ignore_ascii_case(&value))
        {
            continue;
        }
        result.push(value);
        if result.len() >= limit {
            break;
        }
    }
    result
}
