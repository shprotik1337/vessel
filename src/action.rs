use crate::{
    account::{
        error::AccountApiError,
        models::{AccountAction, AccountSession, BootstrapUpdate, CaptchaChallenge},
    },
    audio::AudioEvent,
    model::TrackRef,
    onboarding::{
        SoundCloudAccess,
        zapret::{ZapretApplyResult, ZapretPlan},
    },
};

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum Action {
    Quit,
    TogglePause,
    NextTrack,
    PreviousTrack,
    ChangeVolume(i8),
    Seek(i64),
    ToggleShuffle,
    CycleRepeat,
    ToggleLike,
    SearchFinished {
        query: String,
        tracks: Vec<TrackRef>,
        failures: Vec<String>,
    },
    ControlSearchFinished {
        tracks: Vec<TrackRef>,
        failures: Vec<String>,
    },
    WaveFinished {
        tracks: Vec<TrackRef>,
        failures: Vec<String>,
    },
    ControlWaveFinished {
        tracks: Vec<TrackRef>,
        failures: Vec<String>,
    },
    AudioProgress {
        position_ms: u64,
        buffered_ms: u64,
        /// Длительность от декодера (0 = не изменилась/неизвестна)
        duration_ms: u64,
    },
    Audio(AudioEvent),
    PlaybackFailed(String),
    /// Некритичное предупреждение playback-пайплайна (например «играю
    /// клип-версию, полный трек недоступен») — показываем в статусной строке.
    PlaybackNotice(String),
    OpenPlaylistImport,
    OpenAccount(AccountAction),
    ToggleAccountMode,
    AccountLogout,
    CloseModal,
    ModalSubmit,
    ModalPrevious,
    ModalNext,
    ModalToggle,
    ModalInput(char),
    ModalBackspace,
    CredentialSaved {
        kind: crate::credentials::CredentialKind,
        result: Result<(), String>,
    },
    PlaylistImported(Result<crate::model::Playlist, String>),
    LikeSaved {
        track: Box<TrackRef>,
        liked: bool,
        result: Result<(), String>,
    },
    AccountCaptchaLoaded {
        action: AccountAction,
        result: Result<CaptchaChallenge, AccountApiError>,
    },
    AccountAuthenticated(Result<AccountSession, AccountApiError>),
    AccountRestored(Result<Option<AccountSession>, AccountApiError>),
    BootstrapFinished(Result<BootstrapUpdate, AccountApiError>),
    AccountLoggedOut {
        result: Result<(), AccountApiError>,
        soundcloud_configured: bool,
    },
    SoundCloudChecked(SoundCloudAccess),
    ZapretPlanned(Result<Box<ZapretPlan>, String>),
    ZapretApplied(Result<ZapretApplyResult, String>),
    AudioOutputChanged(Result<String, String>),
}