use std::time::Duration;

use crate::model::{ProviderKind, TrackRef};

/// Порог: матчи ниже не принимаются.
pub const MIN_CONFIDENCE: f32 = 0.70;
/// Сколько кандидат-результатов смотреть в выдаче чужого каталога.
pub const SEARCH_LIMIT: usize = 15;
/// Сколько лучших кандидатов хранить (если первый источник недоступен).
pub const MAX_CANDIDATES: usize = 3;
/// Таймаут поиска в чужом каталоге — LOADING не должен зависать навсегда.
pub const SEARCH_TIMEOUT: Duration = Duration::from_secs(5);

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
    /// Автоматически: YouTube Music → Deezer
    Auto,
    /// Аудио через каталог YouTube Music
    YouTubeMusic,
    /// Аудио через каталог Deezer
    Deezer,
}

impl PlaybackSourceKind {
    pub fn provider_kind(self) -> ProviderKind {
        match self {
            Self::Auto => ProviderKind::YouTubeMusic, // primary; реальная цепочка — chain()
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

    /// Цепочка probing'а: Auto = YouTube Music → Deezer;
    /// ручные режимы — только выбранный источник.
    pub fn chain(self) -> Vec<Self> {
        match self {
            Self::Auto => vec![Self::YouTubeMusic, Self::Deezer],
            other => vec![other],
        }
    }

    /// Второй playback-каталог: для фолбэка, если первый не сработал.
    pub fn other(self) -> Self {
        match self {
            Self::YouTubeMusic => Self::Deezer,
            Self::Deezer => Self::YouTubeMusic,
            Self::Auto => Self::Deezer,
        }
    }
}

pub struct MatchCandidate {
    pub track: TrackRef,
    pub confidence: f32,
}
