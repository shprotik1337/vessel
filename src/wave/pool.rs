use std::collections::HashMap;

use crate::model::{ProviderKind, TrackRef};

use super::{WaveCandidate, WaveCandidateOrigin, track_key};

#[derive(Default)]
pub(crate) struct CandidatePool {
    candidates: HashMap<String, WaveCandidate>,
    provider_counts: HashMap<ProviderKind, usize>,
}

impl CandidatePool {
    pub fn len(&self) -> usize {
        self.candidates.len()
    }

    pub fn insert(&mut self, track: TrackRef, origin: WaveCandidateOrigin) {
        let key = track_key(&track);
        if key.is_empty() {
            return;
        }
        if !self.candidates.contains_key(&key) {
            *self.provider_counts.entry(track.provider).or_default() += 1;
        }
        self.candidates
            .entry(key)
            .and_modify(|candidate| candidate.add_origin(origin))
            .or_insert_with(|| WaveCandidate::new(track, origin));
    }

    pub fn provider_count(&self, kind: ProviderKind) -> usize {
        self.provider_counts.get(&kind).copied().unwrap_or(0)
    }

    /// Расширяет пул, не давая ни одному провайдеру превысить `provider_cap`.
    /// `provider_cap: None` = без ограничения.
    pub fn extend_balanced(
        &mut self,
        tracks: impl IntoIterator<Item = TrackRef>,
        origin: WaveCandidateOrigin,
        target: usize,
        provider_cap: Option<usize>,
    ) {
        for track in tracks {
            if let Some(cap) = provider_cap
                && self.provider_count(track.provider) >= cap
            {
                continue;
            }
            self.insert(track, origin);
            if self.len() >= target {
                break;
            }
        }
    }

    pub fn extend(
        &mut self,
        tracks: impl IntoIterator<Item = TrackRef>,
        origin: WaveCandidateOrigin,
        target: usize,
    ) {
        for track in tracks {
            self.insert(track, origin);
            if self.len() >= target {
                break;
            }
        }
    }

    pub fn into_candidates(self) -> Vec<WaveCandidate> {
        self.candidates.into_values().collect()
    }
}
