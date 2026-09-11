pub mod account;
pub mod action;
pub mod app;
pub mod audio;
pub mod config;
pub mod credentials;
pub mod effect;
pub mod importer;
pub mod model;
pub mod onboarding;
pub mod provider;
pub mod recommendation;
pub mod runtime;
pub mod secrets;
pub mod storage;
pub mod user;
pub mod vpn;
pub mod wave;

pub const APP_NAME: &str = "vessel";
pub const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

/// Диагностический вывод включается переменной окружения VESSEL_DEBUG=1.
/// По умолчанию приложение полностью тихое: GUI-логам не место в консоли.
#[macro_export]
macro_rules! dlog {
    ($($arg:tt)*) => {
        if $crate::debug_logging_enabled() {
            eprintln!($($arg)*);
        }
    };
}

/// Включён ли диагностический вывод (проверяется один раз за запуск).
pub fn debug_logging_enabled() -> bool {
    static ENABLED: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
    *ENABLED.get_or_init(|| {
        matches!(
            std::env::var("VESSEL_DEBUG").ok().as_deref(),
            Some("1") | Some("true") | Some("on")
        )
    })
}
