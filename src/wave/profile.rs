use std::collections::{HashMap, HashSet};

use crate::{model::TrackRef, storage::{HistoryEntry, Storage}};

use super::{
    artist_id, track_key,
    text::{is_junk_artist, track_semantic_key},
    WaveGenreProfile,
};

const DAY_MS: i64 = 86_400_000;

#[derive(Clone, Debug, Default)]
pub struct WaveTasteProfile {
    pub recent_tracks: Vec<TrackRef>,
    pub recent_track_keys: Vec<String>,
    pub recent_artist_ids: Vec<String>,
    pub recent_top_artists: Vec<(String, i64)>,
    pub all_top_artists: Vec<(String, i64)>,
    pub liked_top_artists_recent: Vec<(String, i64)>,
    pub liked_top_artists_alltime: Vec<(String, i64)>,
    pub recent_artist_map: HashMap<String, i64>,
    pub all_artist_map: HashMap<String, i64>,
    pub liked_track_keys: HashSet<String>,
    pub liked_artist_ids: HashSet<String>,
    pub artist_names: HashMap<String, String>,
    pub top_artists: Vec<(String, usize)>,
    pub artist_tracks: HashMap<String, Vec<TrackRef>>,
    pub collaborator_map: HashMap<String, HashSet<String>>,
    pub genre_profile: WaveGenreProfile,
    pub known_track_ids: HashSet<String>,
    pub known_semantic_keys: HashSet<String>,
    play_events: Vec<(String, i64)>,
}

impl WaveTasteProfile {
    pub fn build(
        history: &[HistoryEntry],
        liked: &[(TrackRef, i64)],
        playlist_tracks: &[TrackRef],
        now_ms: i64,
    ) -> Self {
        let mut history = history.to_vec();
        history.sort_by(|left, right| right.played_at_ms.cmp(&left.played_at_ms));
        let recent_tracks = recent_unique_tracks(&history, 20);
        let recent_track_keys = recent_tracks.iter().map(track_key).collect::<Vec<_>>();
        let recent_artist_ids = recent_unique_artists(&history, 20);
        let recent_top_artists = rank_history_artists(&history, now_ms - 14 * DAY_MS, 24);
        let all_history_artists = rank_history_artists(&history, 0, 40);
        let liked_top_artists_recent = rank_liked_artists(liked, now_ms - 30 * DAY_MS, 24);
        let liked_top_artists_alltime = rank_taste_artists(liked, playlist_tracks, 0, 40);
        let all_top_artists = combine_top_artists(&all_history_artists, &liked_top_artists_alltime, 40);
        let recent_artist_map = recent_top_artists.iter().cloned().collect();
        let all_artist_map = all_top_artists.iter().cloned().collect();
        let mut liked_track_keys: HashSet<String> = liked.iter().map(|(track, _)| track_key(track)).collect();
        for track in playlist_tracks {
            liked_track_keys.insert(track_key(track));
        }
        let mut liked_artist_ids: HashSet<String> = liked.iter().map(|(track, _)| artist_id(track)).collect();
        for track in playlist_tracks {
            let aid = artist_id(track);
            if !aid.is_empty() {
                liked_artist_ids.insert(aid);
            }
        }
        let mut artist_names = HashMap::new();
        for track in history
            .iter()
            .map(|entry| &entry.track)
            .chain(liked.iter().map(|(track, _)| track))
            .chain(playlist_tracks.iter())
        {
            artist_names
                .entry(artist_id(track))
                .or_insert_with(|| track.display_artist());
        }

        // Unified extraction: tracks, collaborators, artist weights, genres
        let mut known_track_ids = HashSet::new();
        let mut known_semantic_keys = HashSet::new();
        let mut collaborator_map: HashMap<String, HashSet<String>> = HashMap::new();
        let mut artist_weights: HashMap<String, usize> = HashMap::new();
        let mut artist_tracks: HashMap<String, Vec<TrackRef>> = HashMap::new();
        let mut all_user_tracks = Vec::new();

        // 1. Избранное (liked) - вес 3
        for (track, _) in liked {
            known_track_ids.insert(track.id.clone());
            known_semantic_keys.insert(track_semantic_key(track));
            all_user_tracks.push(track.clone());

            let valid_artists: Vec<String> = track
                .artists
                .iter()
                .map(|a| a.trim().to_string())
                .filter(|a| a.len() >= 2 && !is_junk_artist(a))
                .collect();

            for artist in &valid_artists {
                *artist_weights.entry(artist.clone()).or_insert(0) += 3;
                let list = artist_tracks.entry(artist.clone()).or_default();
                if !list.iter().any(|t| t.id == track.id) {
                    list.push(track.clone());
                }
            }

            for i in 0..valid_artists.len() {
                for j in (i + 1)..valid_artists.len() {
                    collaborator_map
                        .entry(valid_artists[i].clone())
                        .or_default()
                        .insert(valid_artists[j].clone());
                    collaborator_map
                        .entry(valid_artists[j].clone())
                        .or_default()
                        .insert(valid_artists[i].clone());
                }
            }
        }

        // 2. Треки плейлистов - вес 2
        for track in playlist_tracks {
            known_track_ids.insert(track.id.clone());
            known_semantic_keys.insert(track_semantic_key(track));
            all_user_tracks.push(track.clone());

            let valid_artists: Vec<String> = track
                .artists
                .iter()
                .map(|a| a.trim().to_string())
                .filter(|a| a.len() >= 2 && !is_junk_artist(a))
                .collect();

            for artist in &valid_artists {
                *artist_weights.entry(artist.clone()).or_insert(0) += 2;
                let list = artist_tracks.entry(artist.clone()).or_default();
                if !list.iter().any(|t| t.id == track.id) {
                    list.push(track.clone());
                }
            }

            for i in 0..valid_artists.len() {
                for j in (i + 1)..valid_artists.len() {
                    collaborator_map
                        .entry(valid_artists[i].clone())
                        .or_default()
                        .insert(valid_artists[j].clone());
                    collaborator_map
                        .entry(valid_artists[j].clone())
                        .or_default()
                        .insert(valid_artists[i].clone());
                }
            }
        }

        // 3. История прослушиваний - вес 1
        for entry in &history {
            known_track_ids.insert(entry.track.id.clone());
            known_semantic_keys.insert(track_semantic_key(&entry.track));
            all_user_tracks.push(entry.track.clone());

            for a in &entry.track.artists {
                let clean = a.trim();
                if clean.len() >= 2 && !is_junk_artist(clean) {
                    *artist_weights.entry(clean.to_string()).or_insert(0) += 1;
                    let list = artist_tracks.entry(clean.to_string()).or_default();
                    if !list.iter().any(|t| t.id == entry.track.id) {
                        list.push(entry.track.clone());
                    }
                }
            }
        }

        let mut top_artists: Vec<(String, usize)> = artist_weights.into_iter().collect();
        top_artists.sort_by(|a, b| b.1.cmp(&a.1));

        let genre_profile = WaveGenreProfile::from_tracks(&all_user_tracks);

        let play_events = history
            .iter()
            .map(|entry| (track_key(&entry.track), entry.played_at_ms))
            .collect();

        Self {
            recent_tracks,
            recent_track_keys,
            recent_artist_ids,
            recent_top_artists,
            all_top_artists,
            liked_top_artists_recent,
            liked_top_artists_alltime,
            recent_artist_map,
            all_artist_map,
            liked_track_keys,
            liked_artist_ids,
            artist_names,
            top_artists,
            artist_tracks,
            collaborator_map,
            genre_profile,
            known_track_ids,
            known_semantic_keys,
            play_events,
        }
    }

    pub fn build_from_storage(
        storage: &Storage,
        library: &[TrackRef],
        include_playlists: bool,
        excluded_playlist_ids: &[String],
        now_ms: i64,
    ) -> Self {
        let history = storage.recent_history(500).unwrap_or_default();
        let liked: Vec<(TrackRef, i64)> = library.iter().map(|t| (t.clone(), now_ms)).collect();
        let mut playlist_tracks = Vec::new();
        if include_playlists {
            if let Ok(playlists) = storage.list_playlists() {
                for pl in playlists {
                    let pid_str = pl.id.to_string();
                    if !excluded_playlist_ids.iter().any(|id| id == &pid_str) {
                        playlist_tracks.extend(pl.tracks);
                    }
                }
            }
        }
        Self::build(&history, &liked, &playlist_tracks, now_ms)
    }

    pub fn play_counts_since(&self, since_ms: i64) -> HashMap<String, i64> {
        let mut result = HashMap::new();
        for (key, played_at_ms) in &self.play_events {
            if since_ms > 0 && *played_at_ms < since_ms {
                continue;
            }
            result
                .entry(key.clone())
                .and_modify(|count| *count += 1)
                .or_insert(1);
        }
        result
    }

    pub fn cooldown_keys(&self, now_ms: i64, cooldown_hours: i64) -> HashSet<String> {
        let threshold = now_ms - cooldown_hours.max(1) * 3_600_000;
        self.play_events
            .iter()
            .filter(|(_, played_at_ms)| *played_at_ms >= threshold)
            .map(|(key, _)| key.clone())
            .collect()
    }
}

fn recent_unique_tracks(history: &[HistoryEntry], limit: usize) -> Vec<TrackRef> {
    let mut seen = HashSet::new();
    history
        .iter()
        .filter_map(|entry| {
            if seen.insert(track_key(&entry.track)) {
                Some(entry.track.clone())
            } else {
                None
            }
        })
        .take(limit)
        .collect()
}

fn recent_unique_artists(history: &[HistoryEntry], limit: usize) -> Vec<String> {
    let mut seen = HashSet::new();
    history
        .iter()
        .filter_map(|entry| {
            let id = artist_id(&entry.track);
            if !id.is_empty() && seen.insert(id.clone()) {
                Some(id)
            } else {
                None
            }
        })
        .take(limit)
        .collect()
}

fn rank_history_artists(
    history: &[HistoryEntry],
    since_ms: i64,
    limit: usize,
) -> Vec<(String, i64)> {
    rank_artists(
        history
            .iter()
            .filter(|entry| since_ms <= 0 || entry.played_at_ms >= since_ms)
            .map(|entry| (artist_id(&entry.track), entry.played_at_ms)),
        limit,
    )
}

fn rank_liked_artists(
    liked: &[(TrackRef, i64)],
    since_ms: i64,
    limit: usize,
) -> Vec<(String, i64)> {
    rank_artists(
        liked
            .iter()
            .filter(|(_, liked_at_ms)| since_ms <= 0 || *liked_at_ms >= since_ms)
            .map(|(track, liked_at_ms)| (artist_id(track), *liked_at_ms)),
        limit,
    )
}

fn rank_taste_artists(
    liked: &[(TrackRef, i64)],
    playlist_tracks: &[TrackRef],
    since_ms: i64,
    limit: usize,
) -> Vec<(String, i64)> {
    let liked_events = liked
        .iter()
        .filter(|(_, liked_at_ms)| since_ms <= 0 || *liked_at_ms >= since_ms)
        .map(|(track, liked_at_ms)| (artist_id(track), *liked_at_ms));

    let mut pl_counts = HashMap::<String, usize>::new();
    for track in playlist_tracks {
        let aid = artist_id(track);
        if !aid.is_empty() {
            *pl_counts.entry(aid).or_insert(0) += 1;
        }
    }
    let pl_time = since_ms.max(1);
    let mut damped_playlist_events = Vec::new();
    for (aid, count) in pl_counts {
        let damped_count = if count <= 1 {
            count
        } else {
            (1.0 + (count as f64).log2()).round() as usize
        };
        for _ in 0..damped_count {
            damped_playlist_events.push((aid.clone(), pl_time));
        }
    }

    rank_artists(liked_events.chain(damped_playlist_events), limit)
}

fn combine_top_artists(
    history: &[(String, i64)],
    taste: &[(String, i64)],
    limit: usize,
) -> Vec<(String, i64)> {
    let mut map = HashMap::<String, i64>::new();
    for (art, count) in history {
        *map.entry(art.clone()).or_insert(0) += *count;
    }
    for (art, count) in taste {
        *map.entry(art.clone()).or_insert(0) += *count;
    }
    let mut combined: Vec<(String, i64)> = map.into_iter().collect();
    combined.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    combined.truncate(limit);
    combined
}

fn rank_artists(events: impl Iterator<Item = (String, i64)>, limit: usize) -> Vec<(String, i64)> {
    let mut counted = HashMap::<String, (i64, i64)>::new();
    for (artist, timestamp) in events {
        if artist.is_empty() {
            continue;
        }
        counted
            .entry(artist)
            .and_modify(|entry| {
                entry.0 += 1;
                entry.1 = entry.1.max(timestamp);
            })
            .or_insert((1, timestamp));
    }
    let mut ranked = counted.into_iter().collect::<Vec<_>>();
    ranked.sort_by(|left, right| {
        right
            .1
            .0
            .cmp(&left.1.0)
            .then_with(|| right.1.1.cmp(&left.1.1))
            .then_with(|| left.0.cmp(&right.0))
    });
    ranked
        .into_iter()
        .take(limit)
        .map(|(artist, (count, _))| (artist, count))
        .collect()
}
