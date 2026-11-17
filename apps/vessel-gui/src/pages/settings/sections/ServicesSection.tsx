import { useEffect, useState } from "react";
import { useApp } from "../../../store";
import { useCustomization } from "../../../customization";
import { PlatformIcon } from "../../../components/PlatformIcon";
import {
  IconDevice,
  IconServer,
  IconKey,
  IconSearch,
  IconPlay,
  IconSparkles,
  IconUser,
  IconDisc,
  IconPlaylist,
} from "../../../components/Icons";
import {
  SERVICE_META,
  BROWSER_LOGIN,
  type BrowserLoginKind,
  type SettingsTab,
} from "../types";
import * as api from "../../../api/commands";

interface ServicesSectionProps {
  activeTab: SettingsTab;
}

const LYRICS_FEATURES = [
  { id: "vessel", label: "Автовыбор Vessel", icon: <IconSparkles size={16} /> },
  { id: "musixmatch", label: "Musixmatch Richsync", icon: <IconPlay size={16} /> },
  { id: "cadence", label: "Cadence Синхронизация", icon: <IconDisc size={16} /> },
  { id: "lrclib", label: "LRCLIB Синхронизация", icon: <IconSearch size={16} /> },
];

const SERVICE_FEATURES = [
  { id: "token", label: "Проверка токена", icon: <IconKey size={16} /> },
  { id: "search", label: "Поиск треков", icon: <IconSearch size={16} /> },
  { id: "playback", label: "Воспроизведение трека", icon: <IconPlay size={16} /> },
  { id: "similar", label: "Похожие треки", icon: <IconSparkles size={16} /> },
  { id: "artist_info", label: "Информация об исполнителе", icon: <IconUser size={16} /> },
  { id: "artist_tracks", label: "Треки исполнителя", icon: <IconDisc size={16} /> },
  { id: "playlists", label: "Поиск плейлистов", icon: <IconPlaylist size={16} /> },
];

const SPOTIFY_FEATURES = [
  { id: "token", label: "Проверка токена", icon: <IconKey size={16} /> },
  { id: "search", label: "Поиск треков (метаданные)", icon: <IconSearch size={16} /> },
  { id: "metadata", label: "Получение метаданных треков", icon: <IconDisc size={16} /> },
  { id: "playlists", label: "Перенос плейлистов и альбомов", icon: <IconPlaylist size={16} /> },
  { id: "likes", label: "Перенос лайков (Избранное)", icon: <IconSparkles size={16} /> },
];

export function ServicesSection({ activeTab }: ServicesSectionProps) {
  const { state, refresh, showToast, lang } = useApp();
  const { config, setDefaultLyricsProvider } = useCustomization();

  const [routes, setRoutes] = useState<Record<string, string>>({});
  const [tokenInputs, setTokenInputs] = useState<Record<string, string>>({});
  const [savingService, setSavingService] = useState<string | null>(null);

  useEffect(() => {
    api.vesselRoutes().then(setRoutes).catch(() => {});
  }, []);

  const serviceKey = activeTab.replace("service_", "");
  const meta = SERVICE_META[serviceKey] || {
    key: serviceKey,
    hint: "Токен авторизации сервиса",
    bg: "#3b82f6",
    brandColor: "#3b82f6",
  };
  const providerStatus = state?.providers.find((p) => p.kind === serviceKey);
  const isYt = serviceKey === "youtube_music";
  const isSpotify = serviceKey === "spotify";
  const isGuest = Boolean(providerStatus?.guest);
  const isPublicAccess = isYt || isGuest;
  const isConnected = isPublicAccess ? true : (providerStatus?.connected ?? false);
  const segment = api.PROVIDER_SEGMENT[serviceKey] ?? serviceKey;
  const route = routes[segment] ?? "local";

  const toggleRoute = async (sKey: string) => {
    const seg = api.PROVIDER_SEGMENT[sKey] ?? sKey;
    const currentRoute = routes[seg] ?? "local";
    const nextRoute = currentRoute === "local" ? "server:official" : "local";

    try {
      await api.vesselRouteSet(seg, nextRoute);
      setRoutes((prev) => ({ ...prev, [seg]: nextRoute }));
      await refresh();
      showToast(
        lang === "ru"
          ? `Маршрут ${sKey}: ${nextRoute === "local" ? "Локально" : "Сервер Vessel"}`
          : `Route ${sKey}: ${nextRoute === "local" ? "Local" : "Vessel Server"}`
      );
    } catch (e) {
      showToast(String(e), true);
    }
  };

  const saveServiceToken = async (sKey: string) => {
    const val = tokenInputs[sKey]?.trim() || "";
    setSavingService(sKey);
    try {
      const providerKey = sKey === "youtube_music" ? "you_tube_music" : sKey;
      if (val) {
        try {
          await api.probeCredential(providerKey, val);
          await api.saveCredential(providerKey, val);
          showToast(lang === "ru" ? "Токен сохранён и проверен" : "Token saved and verified");
        } catch (probeErr) {
          await api.saveCredential(providerKey, val);
          showToast(
            lang === "ru"
              ? `Токен сохранён (локальная проверка: ${probeErr})`
              : `Token saved (local probe: ${probeErr})`,
            true
          );
        }
      } else {
        await api.removeCredential(providerKey);
        showToast(lang === "ru" ? "Токен удалён" : "Token removed");
      }
      await refresh();
    } catch (e) {
      showToast(String(e), true);
    } finally {
      setSavingService(null);
    }
  };

  const disconnectService = async (sKey: string) => {
    try {
      const providerKey = sKey === "youtube_music" ? "you_tube_music" : sKey;
      await api.removeCredential(providerKey);
      await refresh();
      showToast(lang === "ru" ? "Сервис отключен" : "Service disconnected");
    } catch (e) {
      showToast(String(e), true);
    }
  };

  if (serviceKey === "lyrics") {
    const isServer = route !== "local";
    return (
      <div>
        <div className="sett-page-header">
          <h1 className="sett-page-title" style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <PlatformIcon kind="lyrics" size={28} />
            <span>{lang === "ru" ? "Тексты песен" : "Lyrics"}</span>
          </h1>
          <p className="sett-page-sub">
            {lang === "ru"
              ? "Синхронизированные и пословные тексты песен (караоке)"
              : "Synchronized and word-level karaoke lyrics"}
          </p>
        </div>

        <div className="sett-service-grid">
          {/* Left Column: Sources & Status */}
          <div className="sett-service-card">
            <div className="sett-service-status-banner">
              <div className="sett-status-icon-circle connected">
                ✓
              </div>
              <div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
                  {lang === "ru" ? "Подключено (3 источника)" : "Connected (3 sources)"}
                </div>
                <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 2 }}>
                  Musixmatch, Cadence, LRCLIB
                </div>
              </div>
            </div>

            <div style={{ fontSize: 13, color: "var(--text2)", lineHeight: 1.5, margin: "16px 0 12px" }}>
              {meta.hint}
            </div>

            <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
              <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text)", marginBottom: 4 }}>
                {lang === "ru" ? "Сервис по умолчанию" : "Default lyrics service"}
              </div>
              <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 12, lineHeight: 1.4 }}>
                {lang === "ru"
                  ? "Приоритетный источник при воспроизведении трека. Если текст не найден, Vessel автоматически переключится на доступные альтернативы."
                  : "Preferred source when playing tracks. If missing, Vessel falls back to available alternatives."}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {["Vessel", "Musixmatch", "Cadence", "LRCLIB"].map((p) => {
                  const currentDefault = config.player?.defaultLyricsProvider || "Vessel";
                  const isSelected = currentDefault === p;
                  return (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setDefaultLyricsProvider(p)}
                      style={{
                        padding: "8px 14px",
                        borderRadius: 8,
                        border: isSelected ? "1px solid var(--accent)" : "1px solid var(--border)",
                        background: isSelected ? "var(--accent)" : "var(--card-bg)",
                        color: isSelected ? "var(--accent-contrast-text, #fff)" : "var(--text)",
                        cursor: "pointer",
                        fontWeight: isSelected ? 700 : 500,
                        fontSize: 13,
                        transition: "all 0.15s ease",
                      }}
                    >
                      {p}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Right Column: Execution Mode & Capabilities */}
          <div className="sett-service-card">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <span className="sett-section-title" style={{ margin: 0 }}>
                {lang === "ru" ? "РЕЖИМ ВЫПОЛНЕНИЯ" : "EXECUTION MODE"}
              </span>
              <div
                className={`sett-route-pill ${isServer ? "server" : ""}`}
                onClick={() => toggleRoute("lyrics")}
                title={lang === "ru" ? "Нажмите для переключения Локально / Сервер" : "Click to toggle Local / Server"}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, cursor: "pointer" }}
              >
                {!isServer ? (
                  <>
                    <IconDevice size={14} />
                    <span>{lang === "ru" ? "Локально" : "Local"}</span>
                  </>
                ) : (
                  <>
                    <IconServer size={14} />
                    <span>{lang === "ru" ? "Сервер" : "Server"}</span>
                  </>
                )}
              </div>
            </div>

            <div className="sett-capabilities-list">
              {LYRICS_FEATURES.map((feat) => {
                const featServerOnly = feat.id === "vessel";
                const isItemServer = isServer || featServerOnly;
                return (
                  <div key={feat.id} className="sett-capability-row">
                    <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <span>{feat.icon}</span>
                      <span>
                        {feat.label}
                        {featServerOnly && !isServer && (
                          <span style={{ fontSize: 10, color: "var(--text3)", marginLeft: 6 }}>
                            ({lang === "ru" ? "только на сервере" : "server only"})
                          </span>
                        )}
                      </span>
                    </span>
                    <span
                      className={`sett-route-pill ${isItemServer ? "server" : ""}`}
                      onClick={() => toggleRoute("lyrics")}
                      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", cursor: "pointer" }}
                    >
                      {!isItemServer ? <IconDevice size={13} /> : <IconServer size={13} />}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (    <div>
      <div className="sett-page-header">
        <h1 className="sett-page-title" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <PlatformIcon kind={serviceKey as any} size={28} />
          <span>{providerStatus?.label || (isYt ? "YouTube Music" : serviceKey)}</span>
        </h1>
        <p className="sett-page-sub">
          {isSpotify
            ? (lang === "ru"
                ? "Spotify нужен только для переноса плейлистов, альбомов и лайков"
                : "Spotify is used only for transferring playlists, albums, and liked tracks")
            : (lang === "ru"
                ? "Настройка авторизации и роутинга сетевых запросов"
                : "Authorization and routing settings")}
        </p>
      </div>

      <div className="sett-service-grid">
        {/* Left Column: Authorization & Account */}
        <div className="sett-service-card">
          <div className="sett-service-status-banner">
            <div className={`sett-status-icon-circle ${isConnected ? "connected" : ""}`}>
              {isConnected ? "✓" : "!"}
            </div>
            <div>
              <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
                {isPublicAccess
                  ? (lang === "ru" ? "Сервис активен" : "Service active")
                  : isConnected
                  ? (lang === "ru" ? "Сервис настроен" : "Service configured")
                  : (lang === "ru" ? "Требуется авторизация" : "Authorization required")}
              </div>
              <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 2 }}>
                {isPublicAccess
                  ? (lang === "ru" ? "Авторизация не требуется — сервис работает публично" : "No authorization required — public access")
                  : isConnected
                  ? (lang === "ru" ? "Готов к использованию" : "Ready to use")
                  : (lang === "ru" ? "Введите токен или войдите через браузер" : "Enter token or login via browser")}
              </div>
            </div>
          </div>

          <div className="sett-user-badge-card">
            <div
              className="sett-user-avatar"
              style={{ backgroundColor: meta.brandColor, display: "flex", alignItems: "center", justifyContent: "center" }}
            >
              <PlatformIcon kind={serviceKey as any} size={22} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, color: "var(--text)" }}>
                {isPublicAccess
                  ? `${providerStatus?.label || (isYt ? "YouTube Music" : serviceKey)} (${lang === "ru" ? "Публичный доступ" : "Public access"})`
                  : isConnected
                  ? `${providerStatus?.label} ${lang === "ru" ? "Аккаунт" : "Account"}`
                  : (lang === "ru" ? "Не авторизован" : "Not authorized")}
              </div>
              <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
                {isConnected
                  ? (lang === "ru" ? "Статус: Активен" : "Status: Active")
                  : (lang === "ru" ? "Подключение отсутствует" : "Not connected")}
              </div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 8 }}>
              {meta.hint}
            </div>

            <div className="sett-token-input-row">
              <input
                type="password"
                className="sett-token-input"
                placeholder={isYt ? (lang === "ru" ? "Опционально: cookies браузера..." : "Optional: browser cookies...") : (lang === "ru" ? "Вставьте токен или cookie..." : "Paste token or cookie...")}
                value={tokenInputs[serviceKey] ?? ""}
                onChange={(e) =>
                  setTokenInputs((prev) => ({ ...prev, [serviceKey]: e.target.value }))
                }
              />
              <button
                type="button"
                className="sett-token-action-btn submit"
                disabled={savingService === serviceKey}
                onClick={() => saveServiceToken(serviceKey)}
              >
                {savingService === serviceKey ? "…" : "✓"}
              </button>
            </div>
          </div>

          {/* Browser login if available */}
          {serviceKey in BROWSER_LOGIN && (
            <button
              type="button"
              className="sett-token-action-btn"
              style={{ width: "100%", justifyContent: "center" }}
              onClick={async () => {
                try {
                  await BROWSER_LOGIN[serviceKey as BrowserLoginKind].login();
                  showToast(lang === "ru" ? "Окно авторизации открыто. Выполните вход в браузере." : "Login window opened. Sign in via browser.");
                } catch (e) {
                  showToast(String(e), true);
                }
              }}
            >
              {lang === "ru" ? "Войти через браузер" : "Sign In via Browser"}
            </button>
          )}

          {!isPublicAccess && isConnected && (
            <button
              type="button"
              className="sett-token-action-btn"
              style={{
                width: "100%",
                justifyContent: "center",
                color: "var(--danger, #ef4444)",
                borderColor: "rgba(239, 68, 68, 0.3)",
              }}
              onClick={() => disconnectService(serviceKey)}
            >
              {lang === "ru" ? "Отключить сервис" : "Disconnect Service"}
            </button>
          )}
        </div>

        {/* Right Column: Execution Mode & Capabilities */}
        <div className="sett-service-card">
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <span className="sett-section-title" style={{ margin: 0 }}>
              {lang === "ru" ? "РЕЖИМ ВЫПОЛНЕНИЯ" : "EXECUTION MODE"}
            </span>
            <div
              className={`sett-route-pill ${route !== "local" ? "server" : ""}`}
              onClick={() => toggleRoute(serviceKey)}
              title={lang === "ru" ? "Нажмите для переключения Локально / Сервер" : "Click to toggle Local / Server"}
              style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
            >
              {route === "local" ? (
                <>
                  <IconDevice size={14} />
                  <span>{lang === "ru" ? "Локально" : "Local"}</span>
                </>
              ) : (
                <>
                  <IconServer size={14} />
                  <span>{lang === "ru" ? "Сервер" : "Server"}</span>
                </>
              )}
            </div>
          </div>

          <div className="sett-capabilities-list">
            {(isSpotify ? SPOTIFY_FEATURES : SERVICE_FEATURES).map((feat) => (
              <div key={feat.id} className="sett-capability-row">
                <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span>{feat.icon}</span>
                  <span>{feat.label}</span>
                </span>
                <span
                  className={`sett-route-pill ${route !== "local" ? "server" : ""}`}
                  onClick={() => toggleRoute(serviceKey)}
                  style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
                >
                  {route === "local" ? <IconDevice size={13} /> : <IconServer size={13} />}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
