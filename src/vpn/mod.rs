//! VPN-слой Vessel: инфраструктура под провайдерами, а не часть их.
//!
//! VpnManager управляет профилями и состоянием, CoreManager — процессом
//! amnezia-box (форк sing-box). Трафик Vessel идёт через локальный
//! mixed-inbound core (socks5h://127.0.0.1:PORT) — без TUN, без прав
//! администратора, без вмешательства в системные маршруты.

use std::{
    collections::VecDeque,
    fs,
    path::PathBuf,
    sync::{
        atomic::{AtomicBool, AtomicU64, Ordering},
        Arc, Mutex, RwLock,
    },
    time::Duration,
};

use anyhow::{bail, Context, Result};
use serde::{Deserialize, Serialize};

pub mod amnezia;
pub mod config_builder;
pub mod core;
pub mod vless;

/// Активный прокси VPN (socks5h://127.0.0.1:PORT) — глобальная точка,
/// которую читают все HTTP-клиенты Vessel при создании (и стримы при
/// открытии). None = обычная сеть.
static ACTIVE_PROXY: RwLock<Option<String>> = RwLock::new(None);

pub fn set_active_proxy(proxy: Option<String>) {
    *ACTIVE_PROXY.write().unwrap() = proxy;
}

pub fn current_proxy() -> Option<String> {
    ACTIVE_PROXY.read().unwrap().clone()
}

/// Расширение для reqwest-билдеров: подставить активный VPN-прокси, если он есть.
pub trait ApplyVpnProxy {
    fn apply_vpn_proxy(self) -> Self;
}

impl ApplyVpnProxy for reqwest::ClientBuilder {
    fn apply_vpn_proxy(self) -> Self {
        match current_proxy().as_deref() {
            Some(proxy) => match reqwest::Proxy::all(proxy) {
                Ok(built) => self.proxy(built),
                Err(_) => self,
            },
            None => self,
        }
    }
}

impl ApplyVpnProxy for reqwest::blocking::ClientBuilder {
    fn apply_vpn_proxy(self) -> Self {
        match current_proxy().as_deref() {
            Some(proxy) => match reqwest::Proxy::all(proxy) {
                Ok(built) => self.proxy(built),
                Err(_) => self,
            },
            None => self,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum VpnStatus {
    Disconnected,
    Connecting,
    Connected,
    Disconnecting,
    Reconnecting,
    Error,
}

/// Данные для подключения: метаданные профиля + секретный JSON из SecretStore.
#[derive(Clone, Debug)]
pub struct VpnConnectRequest {
    pub profile_id: String,
    pub profile_name: String,
    pub kind: String,
    /// Адрес и порт из метаданных профиля — fallback, если в секретном JSON
    /// их нет (профили, созданные до появления этих полей).
    pub server: String,
    pub port: u16,
    /// Секретный JSON: {"uuid","pbk","sid"} для vless,
    /// {"private_key","peer_public_key","preshared_key"} для amnezia.
    pub secret_json: String,
}

#[derive(Clone, Serialize)]
pub struct VpnStatusView {
    pub status: VpnStatus,
    pub profile_id: Option<String>,
    pub profile_name: Option<String>,
    pub error: Option<String>,
    pub proxy_port: Option<u16>,
}

struct VpnState {
    status: VpnStatus,
    error: Option<String>,
    profile_id: Option<String>,
    profile_name: Option<String>,
    proxy: Option<String>,
    logs: VecDeque<String>,
}

struct VpnInner {
    state: Mutex<VpnState>,
    core_binary: Mutex<PathBuf>,
    work_dir: PathBuf,
    /// Счётчик поколений сессий: увеличивается при каждом connect/disconnect,
    /// старые потоки-мониторы видят несовпадение и завершаются.
    generation: AtomicU64,
    stop_flags: Mutex<Vec<Arc<AtomicBool>>>,
}

/// Менеджер VPN: профили, состояние, запуск/остановка core, health-check,
/// автопереподключение с backoff. Потокобезопасен, не блокирует UI.
pub struct VpnManager {
    inner: Arc<VpnInner>,
}

impl VpnManager {
    pub fn new(core_binary: PathBuf, work_dir: PathBuf) -> Self {
        let _ = fs::create_dir_all(&work_dir);
        Self {
            inner: Arc::new(VpnInner {
                state: Mutex::new(VpnState {
                    status: VpnStatus::Disconnected,
                    error: None,
                    profile_id: None,
                    profile_name: None,
                    proxy: None,
                    logs: VecDeque::new(),
                }),
                core_binary: Mutex::new(core_binary),
                work_dir,
                generation: AtomicU64::new(0),
                stop_flags: Mutex::new(Vec::new()),
            }),
        }
    }

    /// Путь к ядру может быть известен позже (resource_dir доступен только
    /// внутри tauri setup) — перезадаётся.
    pub fn set_core_binary(&self, path: PathBuf) {
        *self
            .inner
            .core_binary
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner()) = path;
    }

    fn core_binary(&self) -> PathBuf {
        self.inner
            .core_binary
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
            .clone()
    }

    pub fn core_present(&self) -> bool {
        self.core_binary().is_file()
    }

    /// Текущий путь к ядру — для диагностики в UI.
    pub fn core_binary_path(&self) -> String {
        self.core_binary().to_string_lossy().into_owned()
    }

    pub(crate) fn work_dir(&self) -> &std::path::Path {
        &self.inner.work_dir
    }

    pub(crate) fn core_binary_for_connect(&self) -> PathBuf {
        self.core_binary()
    }

    pub fn status(&self) -> VpnStatusView {
        let state = self.lock();
        VpnStatusView {
            status: state.status,
            profile_id: state.profile_id.clone(),
            profile_name: state.profile_name.clone(),
            error: state.error.clone(),
            proxy_port: state.proxy.as_deref().and_then(proxy_port),
        }
    }

    pub fn status_kind(&self) -> VpnStatus {
        self.lock().status
    }

    /// Строка активного прокси (для внешних проверок без удержания lock).
    pub fn active_proxy_string(&self) -> Option<String> {
        self.lock().proxy.clone()
    }

    /// Диагностические логи (уже без секретов). Хвост из последних `tail` строк.
    pub fn logs(&self, tail: usize) -> Vec<String> {
        let state = self.lock();
        state.logs.iter().rev().take(tail).rev().cloned().collect()
    }

    /// Подключиться к профилю. Асинхронность внутри: поток-монитор.
    pub fn connect(&self, request: VpnConnectRequest) -> Result<()> {
        if !self.core_present() {
            bail!("ядро VPN не установлено — переустанови Vessel или обнови приложение")
        }
        // Останавливаем предыдущую сессию (если была)
        self.stop_current();

        let generation = self.inner.generation.fetch_add(1, Ordering::SeqCst) + 1;
        {
            let mut state = self.lock();
            state.status = VpnStatus::Connecting;
            state.error = None;
            state.profile_id = Some(request.profile_id.clone());
            state.profile_name = Some(request.profile_name.clone());
        }
        self.push_log(format!("[VPN] Connecting: profile {}", request.profile_id));

        let inner = Arc::clone(&self.inner);
        let stop = Arc::new(AtomicBool::new(false));
        self.inner.stop_flags.lock().unwrap().push(Arc::clone(&stop));
        let request = request;
        std::thread::Builder::new()
            .name("vpn-monitor".into())
            .spawn(move || {
                core::monitor_session(inner, stop, generation, request);
            })
            .context("не удалось запустить поток VPN-монитора")?;
        Ok(())
    }

    /// Отключиться: останавливает core, сбрасывает прокси.
    pub fn disconnect(&self) {
        {
            let mut state = self.lock();
            if state.status == VpnStatus::Disconnected {
                return;
            }
            state.status = VpnStatus::Disconnecting;
        }
        self.push_log("[VPN] Disconnecting".to_string());
        self.stop_current();
        set_active_proxy(None);
        let mut state = self.lock();
        state.status = VpnStatus::Disconnected;
        state.proxy = None;
        state.profile_id = None;
        state.profile_name = None;
        state.error = None;
    }

    /// Проверить соединение: внешний IP через активный прокси.
    /// None, если VPN не подключен.
    pub fn check_external_ip(&self) -> Result<Option<String>> {
        let proxy = self.lock().proxy.clone();
        let Some(proxy) = proxy else {
            return Ok(None);
        };
        let ip = core::fetch_external_ip(&proxy)?;
        Ok(Some(ip))
    }

    fn stop_current(&self) {
        self.inner.generation.fetch_add(1, Ordering::SeqCst);
        let flags: Vec<Arc<AtomicBool>> = {
            let mut flags = self.inner.stop_flags.lock().unwrap();
            std::mem::take(&mut *flags)
        };
        for flag in flags {
            flag.store(true, Ordering::SeqCst);
        }
        // Потоки-мониторы сами убивают core, увидев флаг/поколение.
        // Даём им секунду на зачистку, чтобы порт освободился.
        std::thread::sleep(Duration::from_millis(300));
    }

    fn lock(&self) -> std::sync::MutexGuard<'_, VpnState> {
        self.inner
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner())
    }

    pub(crate) fn push_log_inner(inner: &VpnInner, line: String) {
        let mut state = inner
            .state
            .lock()
            .unwrap_or_else(|poisoned| poisoned.into_inner());
        if state.logs.len() >= 500 {
            state.logs.pop_front();
        }
        state.logs.push_back(line);
    }

    fn push_log(&self, line: String) {
        Self::push_log_inner(&self.inner, line);
    }
}

fn proxy_port(proxy: &str) -> Option<u16> {
    proxy.rsplit(':').next()?.parse().ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn proxy_port_extracted() {
        assert_eq!(proxy_port("socks5h://127.0.0.1:45633"), Some(45633));
        assert_eq!(proxy_port("socks5h://127.0.0.1:abc"), None);
    }

    #[test]
    fn active_proxy_roundtrip() {
        set_active_proxy(Some("socks5h://127.0.0.1:1".into()));
        assert_eq!(current_proxy().as_deref(), Some("socks5h://127.0.0.1:1"));
        set_active_proxy(None);
        assert_eq!(current_proxy(), None);
    }
}
