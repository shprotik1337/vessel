mod candidate;
mod config;
mod generator;
mod genre;
mod pool;
mod profile;
mod queries;
pub mod queue_context;
mod quota;
mod score;
mod seeds;
mod selector;
pub mod session;
pub mod text;

pub use candidate::{WaveBucket, WaveCandidate, WaveCandidateOrigin, is_tracklike};
pub use config::{WaveMode, WaveMood, WaveSettings, WaveSourceMode, WaveTimeOfDay};
pub use generator::{WaveGeneration, WaveGenerationRequest, generate_wave};
pub use genre::WaveGenreProfile;
pub use profile::WaveTasteProfile;
pub use queries::{explore_queries, recent_title_keywords};
pub use queue_context::{
    ArtistDiversityGuard, QueueContext, RepeatPenaltyDecay, SmartShuffleInterleaver,
    SmartShuffleResult,
};
pub use quota::WaveQueueQuotas;
pub use score::{RankedWaveTrack, WaveRankInput, WaveReason, rank_candidates};
pub use selector::select_ranked;
pub use session::{WaveSession, WaveSessionManager};
pub use text::{
    artist_id, clean_artist_name, clean_track_title, is_junk_artist, is_valid_artist_name,
    track_key, track_semantic_key,
};

#[cfg(test)]
mod tests;
