use crate::{
    model::{PlaybackSource, Playlist, TrackRef},
    onboarding::{
        SoundCloudAccess,
        zapret::{ZapretApplyResult, ZapretPlan},
    },
};

pub(super) enum RuntimeMessage {
    SearchFinished {
        generation: u64,
        query: String,
        tracks: Vec<TrackRef>,
        failures: Vec<String>,
    },
    ControlSearchFinished {
        generation: u64,
        tracks: Vec<TrackRef>,
        failures: Vec<String>,
    },
    WaveFinished {
        generation: u64,
        tracks: Vec<TrackRef>,
        failures: Vec<String>,
    },
    ControlWaveFinished {
        generation: u64,
        tracks: Vec<TrackRef>,
        failures: Vec<String>,
    },
    PlaylistImported {
        generation: u64,
        result: Result<Playlist, String>,
    },
    PlaybackReady {
        generation: u64,
        source: PlaybackSource,
        /// Предупреждение для юзера: матч из общего поиска YTM — играем
        /// клип-версию, а не полный трек (видео-only fallback).
        video_only_notice: Option<String>,
    },
    PlaybackFailed {
        generation: u64,
        error: String,
    },
    SoundCloudChecked {
        generation: u64,
        access: SoundCloudAccess,
    },
    ZapretPlanned {
        generation: u64,
        result: Result<Box<ZapretPlan>, String>,
    },
    ZapretApplied {
        generation: u64,
        result: Result<ZapretApplyResult, String>,
    },
}
