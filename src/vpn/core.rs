//! CoreManager: запуск/остановка процесса amnezia-box, проверка живости и
//! health-check. Процесс — единственный внешний процесс Vessel, живёт ровно
//! столько, сколько подключен VPN, и гарантированно убирается за собой.

use std::{
    io::{BufRead, BufReader},
    net::TcpStream,
    path::{Path, PathBuf},
    process::{Child, Command, Stdio},
    sync::{
        atomic::{AtomicBool, Ordering},
        Arc, Mutex,
    },
    time::Duration,
};

use anyhow::{anyhow, bail, Context, Result};
use serde_json::Value;

use super::{config_builder, set_active_proxy, VpnConnectRequest, VpnInner, VpnManager, VpnStatus};

const CREATE_NO_WINDOW: u32 = 0x0800_0000;
/// Задержки автопереподключения: 5с → 10с → 30с → 60с, потом Error.
const BACKOFF_SECS: [u64; 4] = [5, 10, 30, 60];
const PORT_WAIT: Duration = Duration::from_secs(15);
const HEALTH_TIMEOUT: Duration = Duration::from_secs(8);
const HEALTH_TRIES: usize = 3;

/// Живая сессия core: процесс + поток чтения логов.
struct CoreSession {
    child: Arc<Mutex<Child>>,
}

impl Drop for CoreSession {
    fn drop(&mut self) {
        if let Ok(mut child) = self.child.lock() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

/// Главный цикл сессии: запускает core, дожидается health-check, следит за
/// живостью, перезапускает с backoff. Живёт в отдельном потоке; завершается
/// при смене поколения или выставленном stop-флаге.
pub(crate) fn monitor_session(
    inner: Arc<VpnInner>,
    stop: Arc<AtomicBool>,
    generation: u64,
    request: VpnConnectRequest,
) {
    let mut backoff_index: usize = 0;
    loop {
        if should_stop(&inner, &stop, generation) {
            finish_disconnect(&inner);
            return;
        }

        let outcome = bring_up_and_supervise(&inner, &stop, generation, &request);
        match outcome {
            SessionOutcome::Stopped => {
                finish_disconnect(&inner);
                return;
            }
            SessionOutcome::CoreDied => {
                set_status(&inner, VpnStatus::Reconnecting, None);
                push_log(&inner, "[VPN] Соединение потеряно — переподключение".to_string());
            }
            SessionOutcome::Failed(error) => {
                set_status(&inner, VpnStatus::Reconnecting, None);
                push_log(&inner, format!("[VPN] Попытка не удалась: {error}"));
            }
        }

        if backoff_index >= BACKOFF_SECS.len() {
            set_active_proxy(None);
            set_status(
                &inner,
                VpnStatus::Error,
                Some(
                    "Не удалось подключиться к VPN — сервер недоступен или конфигурация неверна"
                        .to_string(),
                ),
            );
            push_log(&inner, "[VPN] Лимит переподключений — останавливаюсь".to_string());
            return;
        }
        let delay = BACKOFF_SECS[backoff_index];
        backoff_index += 1;
        push_log(&inner, format!("[VPN] Повтор через {delay}с"));
        for _ in 0..delay * 2 {
            if should_stop(&inner, &stop, generation) {
                finish_disconnect(&inner);
                return;
            }
            std::thread::sleep(Duration::from_millis(500));
        }
    }
}

enum SessionOutcome {
    CoreDied,
    Failed(String),
    Stopped,
}

/// Одна попытка: поднять core, дождаться health-check и следить, пока живо.
fn bring_up_and_supervise(
    inner: &Arc<VpnInner>,
    stop: &Arc<AtomicBool>,
    generation: u64,
    request: &VpnConnectRequest,
) -> SessionOutcome {
    let Some(listen_port) = free_port() else {
        return SessionOutcome::Failed("не удалось найти свободный локальный порт".into());
    };

    let config = match build_config(request, listen_port) {
        Ok(config) => config,
        Err(error) => return SessionOutcome::Failed(error.to_string()),
    };
    let config_path: PathBuf = inner
        .work_dir
        .join(format!("profile-{}.json", request.profile_id));
    if let Err(error) = std::fs::write(&config_path, serde_json::to_vec(&config).unwrap_or_default())
    {
        return SessionOutcome::Failed(format!("не удалось сохранить конфиг ядра: {error}"));
    }

    let core_binary = inner
        .core_binary
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
        .clone();
    let session = match spawn_core(&core_binary, &config_path, &inner.work_dir, inner) {
        Ok(session) => session,
        Err(error) => return SessionOutcome::Failed(format!("не удалось запустить ядро VPN: {error}")),
    };
    push_log(inner, format!("[VPN] Core запущен (локальный порт {listen_port})"));

    // Ждём открытия локального inbound-порта
    let deadline = std::time::Instant::now() + PORT_WAIT;
    loop {
        if should_stop(inner, stop, generation) {
            return SessionOutcome::Stopped;
        }
        if port_open(listen_port) {
            break;
        }
        if !child_alive(&session) {
            return SessionOutcome::Failed(
                "ядро VPN завершилось сразу после запуска — скорее всего конфигурация не принята"
                    .into(),
            );
        }
        if std::time::Instant::now() >= deadline {
            return SessionOutcome::Failed("локальный порт ядра так и не открылся".into());
        }
        std::thread::sleep(Duration::from_millis(300));
    }

    // Health-check: настоящий сетевой запрос через прокси — «процесс запущен»
    // не считается «VPN работает».
    let proxy = format!("socks5h://127.0.0.1:{listen_port}");
    let mut healthy = false;
    for _ in 0..HEALTH_TRIES {
        if should_stop(inner, stop, generation) {
            return SessionOutcome::Stopped;
        }
        match health_check(&proxy) {
            Ok(()) => {
                healthy = true;
                break;
            }
            Err(error) => push_log(inner, format!("[VPN] Health check: {error}")),
        }
        std::thread::sleep(Duration::from_millis(800));
    }
    if !healthy {
        return SessionOutcome::Failed("проверка соединения не прошла — сервер не отвечает".into());
    }

    set_active_proxy(Some(proxy.clone()));
    {
        let mut state = lock_state(inner);
        state.status = VpnStatus::Connected;
        state.proxy = Some(proxy);
        state.error = None;
    }
    push_log(inner, "[VPN] Health check passed — Connected".to_string());

    // Супервизия: процесс жив? локальный порт отвечает?
    let mut tick: u32 = 0;
    loop {
        if should_stop(inner, stop, generation) {
            return SessionOutcome::Stopped;
        }
        if !child_alive(&session) {
            return SessionOutcome::CoreDied;
        }
        tick += 1;
        if tick % 5 == 0 && !port_open(listen_port) {
            return SessionOutcome::CoreDied;
        }
        std::thread::sleep(Duration::from_millis(2000));
    }
}

fn child_alive(session: &CoreSession) -> bool {
    match session.child.lock() {
        Ok(mut child) => child.try_wait().ok().flatten().is_none(),
        Err(_) => true,
    }
}

fn spawn_core(
    binary: &Path,
    config_path: &Path,
    work_dir: &Path,
    inner: &Arc<VpnInner>,
) -> Result<CoreSession> {
    let mut command = Command::new(binary);
    command
        .arg("run")
        .arg("-c")
        .arg(config_path)
        .arg("-D")
        .arg(work_dir)
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW);
    }
    let mut child = command.spawn().context("amnezia-box не удалось запустить")?;
    let stdout = child.stdout.take().context("нет stdout у ядра")?;
    let stderr = child.stderr.take();
    let child = Arc::new(Mutex::new(child));

    // Логи ядра — в буфер диагностики VpnInner. На warn-уровне секретов там нет.
    let log_inner = Arc::clone(inner);
    let log_child = Arc::clone(&child);
    let _ = std::thread::Builder::new()
        .name("vpn-core-logs".into())
        .spawn(move || {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                let trimmed = line.trim_end();
                if !trimmed.is_empty() {
                    VpnManager::push_log_inner(&log_inner, trimmed.to_string());
                }
            }
            if let Some(stderr) = stderr {
                for line in BufReader::new(stderr).lines().map_while(Result::ok) {
                    let trimmed = line.trim_end();
                    if !trimmed.is_empty() {
                        VpnManager::push_log_inner(&log_inner, trimmed.to_string());
                    }
                }
            }
            let _ = log_child;
        });

    Ok(CoreSession { child })
}

fn build_config(request: &VpnConnectRequest, listen_port: u16) -> Result<Value> {
    let secret: serde_json::Map<String, Value> =
        serde_json::from_str(&request.secret_json).context("секретные данные профиля повреждены")?;
    let get = |key: &str| -> Option<String> {
        secret.get(key).and_then(Value::as_str).map(str::to_string)
    };
    let get_list = |key: &str| -> Vec<String> {
        secret
            .get(key)
            .and_then(Value::as_array)
            .map(|items| {
                items
                    .iter()
                    .filter_map(Value::as_str)
                    .map(str::to_string)
                    .collect()
            })
            .unwrap_or_default()
    };
    match request.kind.as_str() {
        "vless" => {
            let uri_json = secret
                .get("uri")
                .and_then(Value::as_str)
                .context("в профиле нет VLESS-ссылки")?;
            let uri = super::vless::parse_vless_uri(uri_json)?;
            config_builder::build_vless_config(&uri, listen_port)
        }
        "amnezia" => {
            let conf = super::amnezia::AwgConfig {
                private_key: get("private_key").context("в профиле нет приватного ключа")?,
                address: get_list("address"),
                peer_public_key: get("peer_public_key").context("в профиле нет ключа пира")?,
                preshared_key: get("preshared_key"),
                endpoint_host: get("endpoint_host").context("в профиле нет адреса сервера")?,
                endpoint_port: secret
                    .get("endpoint_port")
                    .and_then(Value::as_u64)
                    .context("в профиле нет порта сервера")? as u16,
                allowed_ips: get_list("allowed_ips"),
                keepalive: secret.get("keepalive").and_then(Value::as_u64).map(|v| v as u16),
                mtu: secret.get("mtu").and_then(Value::as_u64).map(|v| v as u16),
                obfuscation: serde_json::from_value(
                    secret.get("obfuscation").cloned().unwrap_or(Value::Null),
                )
                .unwrap_or_default(),
            };
            if conf.allowed_ips.is_empty() {
                bail!("в профиле нет AllowedIPs");
            }
            config_builder::build_awg_config(&conf, listen_port)
        }
        other => bail!("неизвестный тип VPN-профиля: {other}"),
    }
}

fn free_port() -> Option<u16> {
    std::net::TcpListener::bind("127.0.0.1:0")
        .ok()?
        .local_addr()
        .ok()
        .map(|addr| addr.port())
}

fn port_open(port: u16) -> bool {
    let addr = format!("127.0.0.1:{port}");
    match addr.parse() {
        Ok(addr) => TcpStream::connect_timeout(&addr, Duration::from_millis(400)).is_ok(),
        Err(_) => false,
    }
}

fn health_check(proxy: &str) -> Result<()> {
    let client = reqwest::blocking::Client::builder()
        .timeout(HEALTH_TIMEOUT)
        .proxy(reqwest::Proxy::all(proxy).context("некорректный адрес прокси")?)
        .build()
        .context("не удалось создать health-check клиент")?;
    let response = client
        .get("https://www.gstatic.com/generate_204")
        .send()
        .map_err(|error| anyhow!("сеть через VPN не отвечает: {error}"))?;
    if response.status().is_success() || response.status().as_u16() == 204 {
        Ok(())
    } else {
        bail!("health-check вернул статус {}", response.status())
    }
}

pub fn fetch_external_ip(proxy: &str) -> Result<String> {
    let client = reqwest::blocking::Client::builder()
        .timeout(HEALTH_TIMEOUT)
        .proxy(reqwest::Proxy::all(proxy).context("некорректный адрес прокси")?)
        .build()
        .context("не удалось создать клиент проверки IP")?;
    let response = client
        .get("https://api.ipify.org")
        .send()
        .map_err(|error| anyhow!("не удалось получить внешний IP: {error}"))?;
    let ip = response.text().unwrap_or_default().trim().to_string();
    if ip.is_empty() || ip.len() > 45 {
        bail!("проверка IP вернула странный ответ")
    }
    Ok(ip)
}

fn should_stop(inner: &Arc<VpnInner>, stop: &Arc<AtomicBool>, generation: u64) -> bool {
    if stop.load(Ordering::SeqCst) {
        return true;
    }
    inner.generation.load(Ordering::SeqCst) != generation
}

fn finish_disconnect(inner: &Arc<VpnInner>) {
    set_active_proxy(None);
    let mut state = lock_state(inner);
    if state.status != VpnStatus::Error {
        state.status = VpnStatus::Disconnected;
    }
    state.proxy = None;
    state.profile_id = None;
    state.profile_name = None;
}

fn set_status(inner: &Arc<VpnInner>, status: VpnStatus, error: Option<String>) {
    let mut state = lock_state(inner);
    state.status = status;
    state.error = error;
}

fn lock_state(inner: &Arc<VpnInner>) -> std::sync::MutexGuard<'_, super::VpnState> {
    inner
        .state
        .lock()
        .unwrap_or_else(|poisoned| poisoned.into_inner())
}

fn push_log(inner: &Arc<VpnInner>, line: String) {
    VpnManager::push_log_inner(inner, line);
}
