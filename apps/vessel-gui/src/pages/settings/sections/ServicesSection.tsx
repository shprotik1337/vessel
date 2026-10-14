import { useEffect, useState } from "react";
import { useApp } from "../../../store";
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
import { t } from "../../../i18n";
import * as api from "../../../api/commands";

interface ServicesSectionProps {
  activeTab: SettingsTab;
}

const SERVICE_FEATURES = [
  { id: "token", label: "Проверка токена", icon: <IconKey size={16} /> },
  { id: "search", label: "Поиск треков", icon: <IconSearch size={16} /> },
  { id: "playback", label: "Воспроизведение трека", icon: <IconPlay size={16} /> },
  { id: "similar", label: "Похожие треки", icon: <IconSparkles size={16} /> },
  { id: "artist_info", label: "Информация об исполнителе", icon: <IconUser size={16} /> },
  { id: "artist_tracks", label: "Треки исполнителя", icon: <IconDisc size={16} /> },
  { id: "playlists", label: "Поиск плейлистов", icon: <IconPlaylist size={16} /> },
];

function SpotifyPlaybackSourceSection() {
  const { showToast, lang, state } = useApp();
  const [source, setSource] = useState<string>("youtube_music");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api.getSpotifyPlaybackSource().then(setSource).catch(() => {});
  }, []);

  const isSpotifyConnected = state?.providers.some(
    (p) => p.kind === "spotify" && p.connected,
  );
  const ytAvailable = state?.providers.some((p) => p.kind === "youtube_music" && p.connected) ?? true;
  const deezerAvailable = state?.providers.some((p) => p.kind === "deezer" && p.connected) ?? false;
  const autoAvailable = deezerAvailable || ytAvailable;

  const choose = async (key: string) => {
    setSaving(true);
    try {
      await api.setSpotifyPlaybackSource(key);
      setSource(key);
      showToast(t(lang, "settings.playbackSource.saved"));
    } catch (error) {
      showToast(String(error), true);
    } finally {
      setSaving(false);
    }
  };

  const options = [
    {
      key: "auto",
      label: t(lang, "settings.playbackSource.auto"),
      desc: "YouTube Music → Deezer",
      available: autoAvailable,
    },
    {
      key: "youtube_music",
      label: t(lang, "settings.playbackSource.yt"),
      desc: "YouTube Music",
      available: ytAvailable,
    },
    {
      key: "deezer",
      label: t(lang, "settings.playbackSource.deezer"),
      desc: "Deezer",
      available: deezerAvailable,
    },
  ];

  return (
    <div style={{ marginTop: 20, paddingTop: 16, borderTop: "1px solid rgba(255, 255, 255, 0.08)" }}>
      <div style={{ fontSize: 13, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", color: "var(--text)", marginBottom: 4 }}>
        {t(lang, "settings.playbackSource")}
      </div>
      <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 12, lineHeight: 1.4 }}>
        {isSpotifyConnected
          ? t(lang, "settings.playbackSource.sub")
          : `${t(lang, "settings.notConnected")} — Spotify`}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {options.map((opt) => {
          const isSelected = source === opt.key;
          return (
            <button
              key={opt.key}
              type="button"
              className="sett-token-action-btn"
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                borderRadius: 10,
                border: isSelected ? "1.5px solid var(--accent)" : "1px solid rgba(255, 255, 255, 0.08)",
                background: isSelected ? "var(--elev2, rgba(255, 255, 255, 0.08))" : "rgba(255, 255, 255, 0.03)",
                color: isSelected ? "#ffffff" : "var(--text2)",
                opacity: opt.available ? 1 : 0.45,
                cursor: opt.available && !saving ? "pointer" : "not-allowed",
                transition: "all 0.15s ease",
              }}
              disabled={saving || !opt.available}
              onClick={() => void choose(opt.key)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  border: isSelected ? "4px solid var(--accent)" : "2px solid rgba(255, 255, 255, 0.3)",
                  background: isSelected ? "#fff" : "transparent",
                  boxSizing: "border-box",
                  flexShrink: 0,
                  transition: "all 0.15s ease",
                }} />
                <span style={{ fontSize: 13, fontWeight: isSelected ? 600 : 400 }}>
                  {opt.label}
                </span>
              </div>
              <span style={{ fontSize: 11, color: isSelected ? "var(--accent)" : "var(--text3)" }}>
                {opt.available ? opt.desc : t(lang, "settings.playbackSource.unavailable")}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ServicesSection({ activeTab }: ServicesSectionProps) {
  const { state, refresh, showToast, lang } = useApp();

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
  const isConnected = isYt ? true : (providerStatus?.connected ?? false);
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

  return (
    <div>
      <div className="sett-page-header">
        <h1 className="sett-page-title" style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <PlatformIcon kind={serviceKey as any} size={28} />
          <span>{providerStatus?.label || (isYt ? "YouTube Music" : serviceKey)}</span>
        </h1>
        <p className="sett-page-sub">
          {lang === "ru"
            ? "Настройка авторизации и роутинга сетевых запросов"
            : "Authorization and routing settings"}
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
                {isYt
                  ? (lang === "ru" ? "Сервис активен" : "Service active")
                  : isConnected
                  ? (lang === "ru" ? "Сервис настроен" : "Service configured")
                  : (lang === "ru" ? "Требуется авторизация" : "Authorization required")}
              </div>
              <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 2 }}>
                {isYt
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
                {isYt
                  ? (lang === "ru" ? "YouTube Music (Публичный доступ)" : "YouTube Music (Public access)")
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

          {!isYt && isConnected && (
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

          {serviceKey === "spotify" && (
            <SpotifyPlaybackSourceSection />
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
            {SERVICE_FEATURES.map((feat) => (
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
