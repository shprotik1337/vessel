use std::sync::{Arc, Mutex};
use tauri::State;
use vessel_core::{
    credentials::CredentialKind,
    model::{ProviderKind, RepeatMode},
};

use crate::GuiCore;

pub type CoreState<'a> = State<'a, Arc<Mutex<GuiCore>>>;

pub fn lock<'a>(core: &'a CoreState<'a>) -> std::sync::MutexGuard<'a, GuiCore> {
    core.lock().unwrap_or_else(|poisoned| poisoned.into_inner())
}

pub fn provider_kind_from_str(value: &str) -> Result<ProviderKind, String> {
    match value {
        "soundcloud" | "sound_cloud" => Ok(ProviderKind::SoundCloud),
        "yandex" | "yandex_music" => Ok(ProviderKind::YandexMusic),
        "deezer" => Ok(ProviderKind::Deezer),
        "spotify" => Ok(ProviderKind::Spotify),
        "youtube_music" | "you_tube_music" | "youtube" => Ok(ProviderKind::YouTubeMusic),
        _ => Err(format!("неизвестный провайдер: {value}")),
    }
}

pub fn credential_kind_from_str(value: &str) -> Result<CredentialKind, String> {
    match value {
        "soundcloud" => Ok(CredentialKind::SoundCloudClientId),
        "soundcloud_oauth" => Ok(CredentialKind::SoundCloudOAuthToken),
        "yandex" => Ok(CredentialKind::YandexToken),
        "deezer" => Ok(CredentialKind::DeezerArl),
        "spotify" => Ok(CredentialKind::SpotifySpDc),
        "youtube" | "youtube_music" => Ok(CredentialKind::YouTubeCookie),
        _ => Err(format!("неизвестный провайдер: {value}")),
    }
}

pub fn repeat_from_str(value: &str) -> Result<RepeatMode, String> {
    match value {
        "off" => Ok(RepeatMode::Off),
        "all" => Ok(RepeatMode::All),
        "one" => Ok(RepeatMode::One),
        _ => Err(format!("неизвестный repeat: {value}")),
    }
}

pub fn file_path_to_string(path: tauri_plugin_dialog::FilePath) -> String {
    match path {
        tauri_plugin_dialog::FilePath::Url(url) => url.to_string(),
        tauri_plugin_dialog::FilePath::Path(p) => p.to_string_lossy().into_owned(),
    }
}

pub fn now_ms() -> i64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or_default()
}

/// Общий JS-хук входа: Google OAuth и прочие «продолжить через…» открываются
/// всплывающими окнами, которые WebView блокирует — перенаправляем их в то же
/// окно, чтобы вход через аккаунт Google работал.
pub const POPUP_HOOK_JS: &str = r#"(function(){
  if (window.__vesselPopupHook) return;
  window.__vesselPopupHook = true;
  window.open = function(url){
    try { if (url) { window.location.href = url; } } catch (e) {}
    return null;
  };
  document.addEventListener('click', function(e){
    try {
      var a = e.target && e.target.closest ? e.target.closest('a[target="_blank"]') : null;
      if (a && a.href) { e.preventDefault(); window.location.href = a.href; }
    } catch (err) {}
  }, true);
})();"#;

/// JS-хук SoundCloud: перехватывает client_id и oauth_token (токен авторизованного аккаунта).
/// Токен появляется в заголовке Authorization: OAuth ... либо в cookie oauth_token
/// после реального входа пользователя в свой аккаунт на soundcloud.com.
pub const SOUNDCLOUD_HOOK_JS: &str = r#"(function(){
  if (window.__vesselScHook) return;
  window.__vesselScHook = true;

  var applyClientId = function(id){
    if (id && /^[a-zA-Z0-9_-]{24,40}$/.test(id)) {
      document.cookie = 'vessel_sc_client_id=' + id + '; path=/; max-age=86400';
    }
  };

  var applyOAuthToken = function(token){
    if (!token) return;
    var clean = token.replace(/^OAuth\s+/i, '').replace(/^Bearer\s+/i, '').trim();
    if (clean && clean.length > 10) {
      document.cookie = 'vessel_sc_oauth_token=' + encodeURIComponent(clean) + '; path=/; max-age=86400';
      document.title = 'SC_AUTH_OK';
    }
  };

  var extract = function(u){
    try {
      if (typeof u === 'string') {
        if (u.indexOf('client_id=') !== -1) {
          applyClientId(u.split('client_id=')[1].split('&')[0]);
        }
        if (u.indexOf('oauth_token=') !== -1) {
          applyOAuthToken(decodeURIComponent(u.split('oauth_token=')[1].split('&')[0]));
        }
      }
    } catch (e) {}
  };

  var checkHeaders = function(headers){
    try {
      if (!headers) return;
      if (typeof headers.get === 'function') {
        var a = headers.get('authorization') || headers.get('Authorization');
        if (a) applyOAuthToken(a);
      } else if (typeof headers === 'object') {
        var a = headers['Authorization'] || headers['authorization'];
        if (a) applyOAuthToken(a);
      }
    } catch (e) {}
  };

  var origFetch = window.fetch;
  window.fetch = function(){
    try {
      var input = arguments[0];
      var init = arguments[1];
      extract((input && input.url) ? input.url : input);
      if (init && init.headers) checkHeaders(init.headers);
    } catch (e) {}
    return origFetch.apply(this, arguments);
  };

  var origOpen = XMLHttpRequest.prototype.open;
  XMLHttpRequest.prototype.open = function(m, u){
    extract(u);
    return origOpen.apply(this, arguments);
  };

  var origSetHeader = XMLHttpRequest.prototype.setRequestHeader;
  XMLHttpRequest.prototype.setRequestHeader = function(header, value) {
    if (header && header.toLowerCase() === 'authorization' && value) {
      applyOAuthToken(value);
    }
    return origSetHeader.apply(this, arguments);
  };

  var checkCookies = function() {
    try {
      var m = document.cookie.match(/(?:^|;\s*)oauth_token=([^;]+)/);
      if (m && m[1]) applyOAuthToken(decodeURIComponent(m[1]));
    } catch (e) {}
  };

  setInterval(checkCookies, 500);
})();"#;
