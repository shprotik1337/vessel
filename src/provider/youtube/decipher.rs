//! Нативный YouTube signature / `n` decipher (метод Kopuz, EUPL-1.2).
//!
//! WEB_REMIX (единственный клиент, отдающий Premium 256к аудио залогиненному
//! аккаунту) возвращает форматы в `signatureCipher`: у `url` нет параметра
//! `sig`, а throttle-параметр `n` нужно трансформировать. Обе трансформации —
//! обфусцированный JS внутри player `base.js` (~2.5 MB, ротация каждые
//! несколько часов). Надёжный путь — запускать JS самого YouTube, а не
//! пере-реализовывать его.
//!
//! ## Solver-скрипты
//! `solver-lib.min.js` + `solver-core.min.js` — вендоренные из yt-dlp
//! `yt_dlp_ejs` (Unlicense / public domain). Бандлят JS-парсер (meriyah +
//! astring, ISC/MIT) и оркестратор `jsc()`.
//!
//! ## Движок
//! JS исполняется через системный runtime (node/deno/bun/qjs) —
//! [`SubprocessEngine`]. Программа самодостаточна: solver + base.js + челленджи
//! инлайном, stdout — ровно одна строка JSON.

use std::sync::Mutex;
use std::time::{Duration, Instant};

use anyhow::{Context, Result, bail};
use serde_json::{Value, json};


const LIB: &str = include_str!("solver-lib.min.js");
const CORE: &str = include_str!("solver-core.min.js");
const WEB_UA: &str =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:140.0) Gecko/20100101 Firefox/140.0";

// ---- base.js (player JS) fetch + signatureTimestamp cache -----------------

type CachedPlayerJs = (String, u64);

static PLAYER_JS: Mutex<Option<(Instant, CachedPlayerJs)>> = Mutex::new(None);
const PLAYER_JS_TTL: Duration = Duration::from_secs(60 * 60);

/// Качает YouTube player `base.js` и его `signatureTimestamp` (кэш 1 час,
/// base.js ротируется каждые несколько часов).
/// `cookie` — cookies YouTube (обходят CAPTCHA watch-страницы у юзера).
pub async fn player_js(
    http: &reqwest::Client,
    video_id: &str,
    cookie: Option<&str>,
) -> Result<CachedPlayerJs> {
    if let Ok(g) = PLAYER_JS.lock()
        && let Some((at, data)) = g.as_ref()
        && at.elapsed() < PLAYER_JS_TTL
    {
        return Ok(data.clone());
    }
    let data = fetch_player_js(http, video_id, cookie).await?;
    if let Ok(mut g) = PLAYER_JS.lock() {
        *g = Some((Instant::now(), data.clone()));
    }
    Ok(data.clone())
}

async fn fetch_player_js(
    http: &reqwest::Client,
    _video_id: &str,
    cookie: Option<&str>,
) -> Result<CachedPlayerJs> {
    // Watch-страница youtube.com часто закрыта CAPTCHA для серверных IP —
    // берём jsUrl из music.youtube.com (отдаёт всегда, даже анонимно).
    let mut req = http
        .get(super::clients::ORIGIN_YOUTUBE_MUSIC)
        .header("User-Agent", WEB_UA)
        .header("Accept-Language", "en-US,en;q=0.9");
    if let Some(c) = cookie.filter(|c| !c.is_empty()) {
        req = req.header("Cookie", c);
    }
    let music_home = req
        .send()
        .await
        .context("music.youtube.com fetch")?
        .text()
        .await
        .context("music.youtube.com body")?;
    let raw = str_between(&music_home, "\"jsUrl\":\"", "\"")
        .context("no jsUrl in music home")?
        .replace("\\/", "/");
    let js_url = if raw.starts_with("http") {
        raw
    } else {
        format!("https://www.youtube.com{raw}")
    };
    let base_js = http
        .get(&js_url)
        .header("User-Agent", WEB_UA)
        .send()
        .await
        .context("base.js fetch")?
        .text()
        .await
        .context("base.js body")?;
    let sts = base_js
        .split("signatureTimestamp:")
        .nth(1)
        .and_then(|s| {
            s.split(|c: char| !c.is_ascii_digit())
                .find(|x| !x.is_empty())
        })
        .and_then(|s| s.parse::<u64>().ok())
        .context("no signatureTimestamp in base.js")?;
    Ok((base_js, sts))
}

fn str_between<'a>(haystack: &'a str, start: &str, end: &str) -> Option<&'a str> {
    let i = haystack.find(start)? + start.len();
    let rest = &haystack[i..];
    let j = rest.find(end)?;
    Some(&rest[..j])
}

// ---- decipher --------------------------------------------------------------

/// Строит проигрываемый URL одного `adaptiveFormats[]` элемента.
/// Обрабатывает и `signatureCipher` (решить `sig` + `n`), и plain `url`
/// с `n`-throttle (решить только `n`).
pub async fn deciphered_url(http: &reqwest::Client, base_js: &str, format: &Value) -> Result<String> {
    let (mut url, sig, sp) = extract_cipher(format)?;
    let n = query_param(&url, "n");

    let mut requests = Vec::new();
    if let Some(n) = &n {
        requests.push(json!({ "type": "n", "challenges": [n] }));
    }
    if let Some(s) = &sig {
        requests.push(json!({ "type": "sig", "challenges": [s] }));
    }
    if requests.is_empty() {
        return Ok(url);
    }

    let responses = solve(http, base_js, &requests).await?;

    // Отладка: видно, решился ли n-челлендж (должен отличаться от входа).
    if let Some(n) = &n {
        let solved = lookup(&responses, n);
        crate::dlog!(
            "[decipher] n: in={} out={:?}",
            &n[..n.len().min(24)],
            solved.as_ref().map(|s| &s[..s.len().min(24)])
        );
    }

    if let (Some(old), Some(new)) = (&n, n.as_ref().and_then(|n| lookup(&responses, n))) {
        url = replace_query_value(&url, "n", old, &new);
    }
    if let Some(s) = &sig {
        let solved = lookup(&responses, s).context("signature solve produced no result")?;
        url.push_str(&format!("&{sp}={}", pct_encode(&solved)));
    }
    Ok(url)
}

/// yt_dlp_ejs ставит `globalThis.location = new URL(...)`. В WebView
/// globalThis === window, поэтому в qjs/node/deno это безвредно, но переименуем
/// на всякий случай — extraction передаёт URL явно.
fn patched_core() -> String {
    CORE.replace("globalThis.location =", "globalThis.__vessel_loc =")
}

fn solver_bootstrap() -> String {
    format!("{LIB}\nObject.assign(globalThis, lib);\n{}", patched_core())
}

/// One-shot программа: solver + player + requests инлайном.
/// Работает в любом нон-персистентном движке (subprocess).
///
/// `window`-заглушка обязательна: base.js читает `window.location.hostname`
/// в топ-уровневом коде, которого нет в node/deno.
fn standalone_program(base_js: &str, requests: &[Value]) -> Result<String> {
    let data = json!({ "type": "player", "player": base_js, "requests": requests });
    let data_json =
        serde_json::to_string(&data).context("encode solver data")?;
    Ok(format!(
        "{}\n(function(){{\
         var __p=(typeof print==='function')?print:function(s){{console.log(s);}};\
         if(typeof window==='undefined'){{\
         globalThis.window=globalThis;globalThis.document=globalThis.document||{{}};\
         try{{globalThis.location=new URL('https://music.youtube.com/');}}catch(e){{}}\
         globalThis.navigator=globalThis.navigator||{{userAgent:'Mozilla/5.0'}};\
         }}\
         var o=jsc({data_json});__p(JSON.stringify(o.responses));}})();",
        solver_bootstrap()
    ))
}

fn parse_responses(stdout: &str) -> Result<Value> {
    let line = stdout
        .lines()
        .rev()
        .find(|l| l.trim_start().starts_with('['))
        .unwrap_or_else(|| stdout.trim());
    serde_json::from_str(line)
        .with_context(|| format!("solver output parse; got: {}", &stdout[..stdout.len().min(160)]))
}

/// Решает `requests` против `base_js`, возвращает parsed `responses`.
async fn solve(_http: &reqwest::Client, base_js: &str, requests: &[Value]) -> Result<Value> {
    let stdout = SubprocessEngine::run(standalone_program(base_js, requests)?).await?;
    parse_responses(&stdout)
}

/// Достаёт решённое значение из `responses` по входному ключу.
/// Каждый ответ — `{type:"result", data:{ "<input>": "<output>" }}`.
fn lookup(responses: &Value, key: &str) -> Option<String> {
    responses.as_array()?.iter().find_map(|r| {
        r.pointer("/data")?
            .as_object()?
            .get(key)
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
    })
}

fn extract_cipher(format: &Value) -> Result<(String, Option<String>, String)> {
    if let Some(sc) = format.get("signatureCipher").and_then(|v| v.as_str()) {
        let (mut s, mut url, mut sp) = (String::new(), String::new(), String::from("sig"));
        for kv in sc.split('&') {
            if let Some((k, v)) = kv.split_once('=') {
                let v = pct_decode(v);
                match k {
                    "s" => s = v,
                    "url" => url = v,
                    "sp" => sp = v,
                    _ => {}
                }
            }
        }
        if url.is_empty() {
            bail!("signatureCipher missing url");
        }
        Ok((url, Some(s), sp))
    } else if let Some(u) = format.get("url").and_then(|v| v.as_str()) {
        Ok((u.to_string(), None, "sig".into()))
    } else {
        bail!("format has neither signatureCipher nor url");
    }
}

fn query_param(url: &str, key: &str) -> Option<String> {
    url.split(['?', '&']).find_map(|kv| {
        let (k, v) = kv.split_once('=')?;
        (k == key).then(|| pct_decode(v))
    })
}

fn replace_query_value(url: &str, key: &str, old: &str, new: &str) -> String {
    url.replacen(&format!("{key}={old}"), &format!("{key}={new}"), 1)
}

fn pct_decode(s: &str) -> String {
    let b = s.as_bytes();
    let mut out = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        match b[i] {
            b'%' if i + 2 < b.len() => match u8::from_str_radix(&s[i + 1..i + 3], 16) {
                Ok(h) => {
                    out.push(h);
                    i += 3;
                }
                Err(_) => {
                    out.push(b'%');
                    i += 1;
                }
            },
            b'+' => {
                out.push(b' ');
                i += 1;
            }
            c => {
                out.push(c);
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).into_owned()
}

fn pct_encode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for &b in s.as_bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

// ---- системный JS runtime (node/deno/bun/qjs) -------------------------------

#[derive(Clone, Copy)]
struct Runtime {
    bin: &'static str,
    args: &'static [&'static str],
}

fn detect_runtime() -> Option<Runtime> {
    use std::sync::OnceLock;
    static RT: OnceLock<Option<Runtime>> = OnceLock::new();
    *RT.get_or_init(|| {
        const CANDIDATES: &[Runtime] = &[
            Runtime { bin: "deno", args: &["run", "--quiet", "--no-prompt"] },
            Runtime { bin: "node", args: &[] },
            Runtime { bin: "bun", args: &["run"] },
            Runtime { bin: "qjs", args: &[] },
        ];
        CANDIDATES.iter().copied().find(|c| {
            let mut cmd = std::process::Command::new(c.bin);
            cmd.arg("--version")
                .stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null());
            #[cfg(target_os = "windows")]
            {
                use std::os::windows::process::CommandExt;
                cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
            }
            cmd.status().map(|s| s.success()).unwrap_or(false)
        })
    })
}

/// Одноразовый прогон solver'а в системном JS runtime.
pub struct SubprocessEngine;

impl SubprocessEngine {
    pub async fn run(program: String) -> Result<String> {
        use std::sync::atomic::{AtomicU64, Ordering};
        static SEQ: AtomicU64 = AtomicU64::new(0);

        let rt = detect_runtime().context(
            "нет JS runtime (node/deno/bun/qjs) для нативного decipher YouTube",
        )?;
        let path = std::env::temp_dir().join(format!(
            "vessel-yt-solve-{}-{}.js",
            std::process::id(),
            SEQ.fetch_add(1, Ordering::Relaxed)
        ));
        std::fs::write(&path, program.as_bytes()).context("write solver temp")?;
        let mut cmd = tokio::process::Command::new(rt.bin);
        cmd.args(rt.args)
            .arg(&path)
            .stdout(std::process::Stdio::piped())
            .stderr(std::process::Stdio::piped())
            .kill_on_drop(true);
        #[cfg(target_os = "windows")]
        {
            cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
        }
        let child = match cmd.spawn() {
            Ok(c) => c,
            Err(e) => {
                let _ = tokio::fs::remove_file(&path).await;
                bail!("spawn {}: {e}", rt.bin);
            }
        };
        // Ограничение времени: зависший runtime не должен блокировать decipher.
        let out =
            tokio::time::timeout(Duration::from_secs(30), child.wait_with_output()).await;
        let _ = tokio::fs::remove_file(&path).await;
        let out = match out {
            Ok(Ok(o)) => o,
            Ok(Err(e)) => bail!("{}: {e}", rt.bin),
            Err(_) => bail!("{} solver timed out (30s)", rt.bin),
        };
        if !out.status.success() {
            let err = String::from_utf8_lossy(&out.stderr);
            let head: String = err.chars().take(200).collect();
            bail!("{} exit {}: {head}", rt.bin, out.status);
        }
        Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
    }
}

// ---- тесты ----------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn pct_roundtrip_and_url() {
        assert_eq!(pct_decode("a%3Db%2Fc"), "a=b/c");
        assert_eq!(pct_encode("a=b/c+d"), "a%3Db%2Fc%2Bd");
        let _ = url::Url::parse("https://music.youtube.com/").unwrap();
        let _ = super::super::clients::clients_http();
    }

    #[test]
    fn extract_signature_cipher() {
        let f = json!({
            "signatureCipher": "s=SCRAMBLED&sp=sig&url=https%3A%2F%2Fr1.googlevideo.com%2Fvideoplayback%3Fn%3DTOKEN"
        });
        let (url, sig, sp) = extract_cipher(&f).unwrap();
        assert_eq!(sig.as_deref(), Some("SCRAMBLED"));
        assert_eq!(sp, "sig");
        assert_eq!(url, "https://r1.googlevideo.com/videoplayback?n=TOKEN");
        assert_eq!(query_param(&url, "n").as_deref(), Some("TOKEN"));
    }

    #[test]
    fn replace_n_and_lookup() {
        let url = "https://r1.googlevideo.com/videoplayback?n=OLD&mime=audio";
        assert_eq!(
            replace_query_value(url, "n", "OLD", "NEW"),
            "https://r1.googlevideo.com/videoplayback?n=NEW&mime=audio"
        );
        let responses = json!([
            { "type": "result", "data": { "OLD": "NEW" } },
            { "type": "result", "data": { "SCRAMBLED": "UNSCRAMBLED" } }
        ]);
        assert_eq!(lookup(&responses, "OLD").as_deref(), Some("NEW"));
        assert_eq!(lookup(&responses, "MISSING"), None);
    }
}
