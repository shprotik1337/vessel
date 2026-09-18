pub mod action;
pub mod app;
pub mod audio;
pub mod config;
pub mod credentials;
pub mod effect;
pub mod importer;
pub mod model;
pub mod onboarding;
pub mod protocol;
pub mod provider;
pub mod recommendation;
pub mod runtime;
pub mod secrets;
pub mod storage;
pub mod user;
pub mod wave;

pub const APP_NAME: &str = "vessel";
pub const APP_VERSION: &str = env!("CARGO_PKG_VERSION");

#[macro_export]
macro_rules! dlog {
    ($($arg:tt)*) => {{
        $crate::log_message(&format!($($arg)*));
    }};
}

pub fn log_message(msg: &str) {
    if debug_logging_enabled() {
        eprintln!("{msg}");
    }
    use std::io::Write;
    static LOG_FILE: std::sync::OnceLock<std::sync::Mutex<Option<std::fs::File>>> = std::sync::OnceLock::new();
    let file_lock = LOG_FILE.get_or_init(|| {
        let path = crate::config::AppPaths::discover()
            .map(|p| p.data_dir.join("vessel.log"))
            .unwrap_or_else(|_| std::env::temp_dir().join("vessel.log"));
        if let Some(parent) = path.parent() {
            let _ = std::fs::create_dir_all(parent);
        }
        let file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .ok();
        std::sync::Mutex::new(file)
    });

    if let Ok(mut guard) = file_lock.lock() {
        if let Some(file) = guard.as_mut() {
            let now = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
            let _ = writeln!(file, "[{now}] {msg}");
        }
    }
}

/// Включён ли диагностический вывод в stderr (VESSEL_DEBUG=1).
pub fn debug_logging_enabled() -> bool {
    static ENABLED: std::sync::OnceLock<bool> = std::sync::OnceLock::new();
    *ENABLED.get_or_init(|| {
        matches!(
            std::env::var("VESSEL_DEBUG").ok().as_deref(),
            Some("1") | Some("true") | Some("on")
        )
    })
}
