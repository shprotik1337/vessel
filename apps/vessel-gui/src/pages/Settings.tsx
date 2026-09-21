import { useEffect, useState, useMemo } from "react";
import { useApp } from "../store";
import {
  useCustomization,
  BUILTIN_THEMES,
  PresetCard,
} from "../customization";
import { PlatformIcon } from "../components/PlatformIcon";
import { TextInputModal, ConfirmModal, PathModal } from "../components/Modal";
import { VpnTab } from "../components/VpnTab";
import { ServersTab } from "./Servers";
import type { UserProfile } from "../api/types";
import * as api from "../api/commands";

// Navigation tabs matching Dotify structure
type SettingsTab =
  | "users"
  | "general"
  | "audio"
  | "storage"
  | "player"
  | "interface"
  | "tabs"
  | "background"
  | "customization"
  | "service_youtube_music"
  | "service_soundcloud"
  | "service_spotify"
  | "service_vk"
  | "service_yandex"
  | "service_deezer"
  | "service_apple"
  | "proxy"
  | "servers"
  | "discord"
  | "vpn";

type ConfirmTarget = "settings" | "data" | null;
type DirTarget = "download" | "cache" | null;

const SERVICE_META: Record<string, { key: string; hint: string; bg: string; brandColor: string }> = {
  spotify: {
    key: "spotify",
    hint: "Вставьте значение cookie sp_dc из браузера (или воспользуйтесь входом через браузер).",
    bg: "#1DB954",
    brandColor: "#1DB954",
  },
  youtube_music: {
    key: "youtube_music",
    hint: "Вставьте cookies из браузера (SID, SSID, HSID, LOGIN_INFO) для полного доступа к библиотеке.",
    bg: "#FF0000",
    brandColor: "#FF0000",
  },
  soundcloud: {
    key: "soundcloud",
    hint: "client_id — ключ из сетевых запросов браузера SoundCloud.",
    bg: "#FF5500",
    brandColor: "#FF5500",
  },
  vk: {
    key: "vk",
    hint: "Токен доступа VK Музыка (Kate Mobile / VK Admin token).",
    bg: "#0077FF",
    brandColor: "#0077FF",
  },
  yandex: {
    key: "yandex",
    hint: "OAuth-токен из расширения yandex-music-token. Хранится только локально.",
    bg: "#FFCC00",
    brandColor: "#FFCC00",
  },
  deezer: {
    key: "deezer",
    hint: "Значение cookie arl из браузера Deezer (arl=...).",
    bg: "#A238FF",
    brandColor: "#A238FF",
  },
  apple: {
    key: "apple",
    hint: "Developer Token / MusicKit токен подписки Apple Music.",
    bg: "#FA233B",
    brandColor: "#FA233B",
  },
};

type BrowserLoginKind = "spotify" | "soundcloud" | "deezer";

const BROWSER_LOGIN: Record<
  BrowserLoginKind,
  { login: () => Promise<void>; open: () => Promise<boolean>; cancel: () => Promise<void> }
> = {
  spotify: {
    login: api.spotifyBrowserLogin,
    open: api.spotifyLoginWindowOpen,
    cancel: api.spotifyAuthCancel,
  },
  soundcloud: {
    login: api.soundcloudBrowserLogin,
    open: api.soundcloudLoginWindowOpen,
    cancel: api.soundcloudAuthCancel,
  },
  deezer: {
    login: api.deezerBrowserLogin,
    open: api.deezerLoginWindowOpen,
    cancel: api.deezerAuthCancel,
  },
};

const SERVICE_FEATURES = [
  { id: "token", label: "Проверка токена", icon: "🛡️" },
  { id: "search", label: "Поиск треков", icon: "🔍" },
  { id: "playback", label: "Воспроизведение трека", icon: "▶️" },
  { id: "similar", label: "Похожие треки", icon: "📡" },
  { id: "artist_info", label: "Информация об исполнителе", icon: "👤" },
  { id: "artist_tracks", label: "Треки исполнителя", icon: "👥" },
  { id: "playlists", label: "Поиск плейлистов", icon: "📋" },
];

export function Settings() {
  const { state, showToast, refresh, lang, navigateTo } = useApp();
  const {
    config,
    updateThemeDirectly,
    setBorderRadius,
    setSidebarPosition,
    setSidebarStyle,
    setPlayerOptions,
    setQueuePosition,
    setMiniPlayerPreset,
    setMiniPlayerBg,
    setMiniPlayerShape,
    applyPreset,
    userPresets,
    saveToUserSlot,
    deleteUserSlot,
    startPreview,
    enterEditMode,
  } = useCustomization();

  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [searchQuery, setSearchQuery] = useState("");

  // Modals
  const [confirm, setConfirm] = useState<ConfirmTarget>(null);
  const [dirModal, setDirModal] = useState<DirTarget>(null);

  // App settings state
  const [downloadDir, setDownloadDir] = useState("");
  const [cacheDir, setCacheDir] = useState("");
  const [discordRpc, setDiscordRpc] = useState(false);
  const [autostart, setAutostart] = useState(() => localStorage.getItem("vessel_autostart") === "true");
  const [minimizeToTray, setMinimizeToTray] = useState(() => localStorage.getItem("vessel_tray") !== "false");
  const [autoSimilar, setAutoSimilar] = useState(() => localStorage.getItem("vessel_auto_similar") !== "false");
  const [restoreQueue, setRestoreQueue] = useState(() => localStorage.getItem("vessel_restore_queue") !== "false");
  const [audioAgc, setAudioAgc] = useState(() => localStorage.getItem("vessel_audio_agc") === "true");
  const [autoplayLast, setAutoplayLast] = useState(() => localStorage.getItem("vessel_autoplay_last") === "true");
  const [gapless, setGapless] = useState(() => localStorage.getItem("vessel_gapless") !== "false");
  const [autoCache, setAutoCache] = useState(() => localStorage.getItem("vessel_auto_cache") !== "false");
  const [selectedFont, setSelectedFont] = useState(() => localStorage.getItem("vessel_font") || "Inter");
  const [uiScale, setUiScale] = useState(() => localStorage.getItem("vessel_scale") || "100");

  // Language handler
  const handleSetLanguage = async (newLang: string) => {
    try {
      await api.setLanguage(newLang);
      await refresh();
      showToast(newLang === "ru" ? "Язык переключен на русский" : "Language switched to English");
    } catch (e) {
      showToast(String(e), true);
    }
  };

  // Users state
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [activeUser, setActiveUser] = useState<UserProfile | null>(null);
  const [autoLogin, setAutoLogin] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // Service routing state
  const [servers, setServers] = useState<api.VesselServerView[]>([]);
  const [routes, setRoutes] = useState<Record<string, string>>({});
  const [tokenInputs, setTokenInputs] = useState<Record<string, string>>({});
  const [savingService, setSavingService] = useState<string | null>(null);

  // Proxy state
  const [spotifyProxy, setSpotifyProxy] = useState("");

  // Storage mock/calculated info
  const [storageTracksCount, setStorageTracksCount] = useState(48);
  const [storageTracksSize, setStorageTracksSize] = useState("320 MB");
  const [storageCoversSize, setStorageCoversSize] = useState("45 MB");
  const [storageLyricsSize, setStorageLyricsSize] = useState("2.4 MB");

  // Load initial settings
  useEffect(() => {
    void (async () => {
      try {
        const [dDir, cDir, rpc, sProxy, serverList, routeMap] = await Promise.all([
          api.getDownloadDir().catch(() => ""),
          api.getCacheDir().catch(() => ""),
          api.getDiscordRpc().catch(() => false),
          api.getSpotifyProxy().catch(() => ""),
          api.vesselServers().catch(() => []),
          api.vesselRoutes().catch(() => ({})),
        ]);
        setDownloadDir(dDir);
        setCacheDir(cDir);
        setDiscordRpc(rpc);
        setSpotifyProxy(sProxy);
        setServers(serverList);
        setRoutes(routeMap);
      } catch (e) {
        console.error("Failed to load settings:", e);
      }
    })();
  }, []);

  // Load users
  const loadUsers = async () => {
    try {
      const [known, profile, auto] = await Promise.all([
        api.getKnownUsers().catch(() => []),
        api.getUserProfile().catch(() => null),
        api.getAutoLogin().catch(() => null),
      ]);
      setUsers(known);
      setActiveUser(profile);
      setAutoLogin(auto);
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    void loadUsers();
  }, []);

  // Toggle handlers with localStorage persistence
  const toggleAutostart = (val: boolean) => {
    setAutostart(val);
    localStorage.setItem("vessel_autostart", String(val));
    showToast(val ? "Автозапуск включен" : "Автозапуск выключен");
  };

  const toggleMinimizeToTray = (val: boolean) => {
    setMinimizeToTray(val);
    localStorage.setItem("vessel_tray", String(val));
  };

  const toggleAutoSimilar = (val: boolean) => {
    setAutoSimilar(val);
    localStorage.setItem("vessel_auto_similar", String(val));
  };

  const toggleRestoreQueue = (val: boolean) => {
    setRestoreQueue(val);
    localStorage.setItem("vessel_restore_queue", String(val));
  };

  const toggleAudioAgc = (val: boolean) => {
    setAudioAgc(val);
    localStorage.setItem("vessel_audio_agc", String(val));
    showToast(val ? "Нормализация AGC активна" : "Нормализация отключена");
  };

  const toggleAutoplayLast = (val: boolean) => {
    setAutoplayLast(val);
    localStorage.setItem("vessel_autoplay_last", String(val));
  };

  const toggleGapless = (val: boolean) => {
    setGapless(val);
    localStorage.setItem("vessel_gapless", String(val));
  };

  const toggleAutoCache = (val: boolean) => {
    setAutoCache(val);
    localStorage.setItem("vessel_auto_cache", String(val));
  };

  const handleDiscordRpcToggle = async (val: boolean) => {
    setDiscordRpc(val);
    try {
      await api.setDiscordRpc(val);
      showToast(val ? "Discord RPC включен" : "Discord RPC отключен");
    } catch (e) {
      showToast(String(e), true);
    }
  };

  const handleFontSelect = (font: string) => {
    setSelectedFont(font);
    localStorage.setItem("vessel_font", font);
    document.body.style.fontFamily = font === "Default" ? "Inter, -apple-system, sans-serif" : `${font}, sans-serif`;
    showToast(`Шрифт: ${font}`);
  };

  const handleScaleSelect = (scale: string) => {
    setUiScale(scale);
    localStorage.setItem("vessel_scale", scale);
    const zoomVal = parseInt(scale, 10) / 100;
    (document.documentElement.style as any).zoom = zoomVal;
    showToast(`Масштаб: ${scale}%`);
  };

  // Directory handlers
  const changeDownloadDir = async (value: string) => {
    const next = value.trim();
    try {
      await api.setDownloadDir(next || null);
      setDownloadDir(next);
      setDirModal(null);
      showToast(next ? `Папка загрузок: ${next}` : "Сброшено по умолчанию");
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const changeCacheDir = async (value: string) => {
    const next = value.trim();
    try {
      await api.setCacheDir(next || null);
      setCacheDir(next);
      setDirModal(null);
      showToast(next ? `Папка кэша: ${next}` : "Сброшено по умолчанию");
    } catch (error) {
      showToast(String(error), true);
    }
  };

  // Service route change
  const toggleRoute = async (serviceKey: string) => {
    const segment = api.PROVIDER_SEGMENT[serviceKey] ?? serviceKey;
    const currentRoute = routes[segment] ?? "local";
    const nextRoute =
      currentRoute === "local"
        ? servers[0]
          ? `server:${servers[0].id}`
          : "local"
        : "local";

    try {
      await api.vesselRouteSet(segment, nextRoute);
      setRoutes((prev) => ({ ...prev, [segment]: nextRoute }));
      showToast(`Маршрут ${serviceKey}: ${nextRoute === "local" ? "Локально" : "Сервер"}`);
    } catch (e) {
      showToast(String(e), true);
    }
  };

  // Service save credential
  const saveServiceToken = async (serviceKey: string) => {
    const val = tokenInputs[serviceKey]?.trim() || "";
    setSavingService(serviceKey);
    try {
      const providerKey = serviceKey === "youtube_music" ? "you_tube_music" : serviceKey;
      if (val) {
        await api.probeCredential(providerKey, val);
        await api.saveCredential(providerKey, val);
        showToast("Токен сохранён и проверен");
      } else {
        await api.removeCredential(providerKey);
        showToast("Токен удалён");
      }
      await refresh();
    } catch (e) {
      showToast(String(e), true);
    } finally {
      setSavingService(null);
    }
  };

  const disconnectService = async (serviceKey: string) => {
    try {
      const providerKey = serviceKey === "youtube_music" ? "you_tube_music" : serviceKey;
      await api.removeCredential(providerKey);
      await refresh();
      showToast("Сервис отключен");
    } catch (e) {
      showToast(String(e), true);
    }
  };

  // Clear cache handler
  const handleClearCache = () => {
    setStorageTracksSize("0 MB");
    setStorageCoversSize("0 MB");
    setStorageLyricsSize("0 KB");
    setStorageTracksCount(0);
    showToast("Кэш приложения полностью очищен");
  };

  // Filter tabs for search
  const filteredServices = useMemo(() => {
    const list = [
      { id: "service_youtube_music", name: "YouTube", key: "youtube_music", brand: "#FF0000" },
      { id: "service_soundcloud", name: "SoundCloud", key: "soundcloud", brand: "#FF5500" },
      { id: "service_spotify", name: "Spotify", key: "spotify", brand: "#1DB954" },
      { id: "service_vk", name: "VK", key: "vk", brand: "#0077FF" },
      { id: "service_yandex", name: "Yandex", key: "yandex", brand: "#FFCC00" },
      { id: "service_deezer", name: "Deezer", key: "deezer", brand: "#A238FF" },
      { id: "service_apple", name: "Apple Music", key: "apple", brand: "#FA233B" },
    ];
    if (!searchQuery.trim()) return list;
    const q = searchQuery.toLowerCase();
    return list.filter((s) => s.name.toLowerCase().includes(q));
  }, [searchQuery]);

  return (
    <div className="view" style={{ padding: "20px 28px" }}>
      <div className="dotify-settings-wrapper">
        {/* ================================================================= */}
        {/* LEFT SIDEBAR NAVIGATION                                           */}
        {/* ================================================================= */}
        <aside className="dotify-sett-nav">
          {/* Section: Профиль / Пользователи */}
          <div className="dotify-nav-group">
            <span className="dotify-nav-category-title">Профиль</span>
            <button
              type="button"
              className={`dotify-nav-item ${activeTab === "users" ? "active" : ""}`}
              onClick={() => setActiveTab("users")}
            >
              <span className="dotify-nav-item-icon">👤</span>
              <span>Пользователи</span>
            </button>
          </div>

          {/* Section: Основные */}
          <div className="dotify-nav-group">
            <span className="dotify-nav-category-title">Основные</span>
            <button
              type="button"
              className={`dotify-nav-item ${activeTab === "general" ? "active" : ""}`}
              onClick={() => setActiveTab("general")}
            >
              <span className="dotify-nav-item-icon">⚙️</span>
              <span>Основные</span>
            </button>
            <button
              type="button"
              className={`dotify-nav-item ${activeTab === "audio" ? "active" : ""}`}
              onClick={() => setActiveTab("audio")}
            >
              <span className="dotify-nav-item-icon">🎧</span>
              <span>Аудио</span>
            </button>
            <button
              type="button"
              className={`dotify-nav-item ${activeTab === "storage" ? "active" : ""}`}
              onClick={() => setActiveTab("storage")}
            >
              <span className="dotify-nav-item-icon">💾</span>
              <span>Хранилище</span>
            </button>
          </div>

          {/* Section: Оформление */}
          <div className="dotify-nav-group">
            <span className="dotify-nav-category-title">Оформление</span>
            <button
              type="button"
              className={`dotify-nav-item ${activeTab === "player" ? "active" : ""}`}
              onClick={() => setActiveTab("player")}
            >
              <span className="dotify-nav-item-icon">🎵</span>
              <span>Плеер</span>
            </button>
            <button
              type="button"
              className={`dotify-nav-item ${activeTab === "interface" ? "active" : ""}`}
              onClick={() => setActiveTab("interface")}
            >
              <span className="dotify-nav-item-icon">🖥️</span>
              <span>Интерфейс</span>
            </button>
            <button
              type="button"
              className={`dotify-nav-item ${activeTab === "tabs" ? "active" : ""}`}
              onClick={() => setActiveTab("tabs")}
            >
              <span className="dotify-nav-item-icon">◧</span>
              <span>Вкладки</span>
            </button>
            <button
              type="button"
              className={`dotify-nav-item ${activeTab === "background" ? "active" : ""}`}
              onClick={() => setActiveTab("background")}
            >
              <span className="dotify-nav-item-icon">🖼️</span>
              <span>Фон</span>
            </button>
            <button
              type="button"
              className={`dotify-nav-item ${activeTab === "customization" ? "active" : ""}`}
              onClick={() => setActiveTab("customization")}
            >
              <span className="dotify-nav-item-icon">✨</span>
              <span>Кастомизация</span>
            </button>
          </div>

          {/* Section: Сервисы */}
          <div className="dotify-nav-group">
            <span className="dotify-nav-category-title">Сервисы</span>
            {filteredServices.map((srv) => {
              const providerStatus = state?.providers.find((p) => p.kind === srv.key);
              const isConnected = providerStatus?.connected ?? false;
              const isActive = activeTab === srv.id;

              return (
                <button
                  key={srv.id}
                  type="button"
                  className={`dotify-nav-item dotify-nav-service-item service-${srv.key} ${
                    isActive ? "active" : ""
                  } ${isConnected ? "is-connected" : ""}`}
                  onClick={() => setActiveTab(srv.id as SettingsTab)}
                >
                  <span className="service-brand-icon">
                    <PlatformIcon kind={srv.key as any} size={18} />
                  </span>
                  <span>{srv.name}</span>
                  {isConnected && <span className="service-nav-check">✓</span>}
                </button>
              );
            })}
          </div>

          {/* Section: Интеграции */}
          <div className="dotify-nav-group">
            <span className="dotify-nav-category-title">Интеграции</span>
            <button
              type="button"
              className={`dotify-nav-item ${activeTab === "proxy" ? "active" : ""}`}
              onClick={() => setActiveTab("proxy")}
            >
              <span className="dotify-nav-item-icon">🌐</span>
              <span>Прокси</span>
            </button>
            <button
              type="button"
              className={`dotify-nav-item ${activeTab === "servers" ? "active" : ""}`}
              onClick={() => setActiveTab("servers")}
            >
              <span className="dotify-nav-item-icon">🖧</span>
              <span>Локальный сервер</span>
            </button>
            <button
              type="button"
              className={`dotify-nav-item ${activeTab === "discord" ? "active" : ""}`}
              onClick={() => setActiveTab("discord")}
            >
              <span className="dotify-nav-item-icon">💬</span>
              <span>Discord RPC</span>
            </button>
            <button
              type="button"
              className={`dotify-nav-item ${activeTab === "vpn" ? "active" : ""}`}
              onClick={() => setActiveTab("vpn")}
            >
              <span className="dotify-nav-item-icon">🔒</span>
              <span>VPN</span>
            </button>
          </div>

          {/* Search Filter at Bottom of Nav */}
          <div className="dotify-nav-search-wrap">
            <input
              type="text"
              className="dotify-nav-search-input"
              placeholder="Поиск настроек…"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </aside>

        {/* ================================================================= */}
        {/* MAIN SETTINGS CONTENT                                             */}
        {/* ================================================================= */}
        <main className="dotify-sett-content">
          {/* TAB: USERS */}
          {activeTab === "users" && (
            <div>
              <div className="dotify-page-header">
                <h1 className="dotify-page-title">Пользователи</h1>
                <p className="dotify-page-sub">Управление локальными профилями и настройками аккаунта</p>
              </div>

              <div className="dotify-section-title">ТЕКУЩИЙ ПРОФИЛЬ</div>
              <div className="dotify-card">
                <div className="dotify-user-badge-card">
                  <div className="dotify-user-avatar">
                    {activeUser?.display_name ? activeUser.display_name.slice(0, 1).toUpperCase() : "U"}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
                      {activeUser?.display_name || "Пользователь по умолчанию"}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
                      Создан: {activeUser?.created_at_ms ? new Date(activeUser.created_at_ms).toLocaleDateString() : "—"}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="dotify-token-action-btn"
                    onClick={() => setCreateOpen(true)}
                  >
                    + Новый профиль
                  </button>
                </div>
              </div>

              <div className="dotify-section-title">СПИСОК ПРОФИЛЕЙ</div>
              {users.map((u) => (
                <div key={u.id} className="dotify-card">
                  <div className="dotify-card-row">
                    <div className="dotify-card-info">
                      <div className="dotify-card-title">{u.display_name}</div>
                      <div className="dotify-card-desc">
                        {u.display_name === activeUser?.display_name ? "✓ Активный профиль" : "Нажмите для переключения"}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {u.display_name !== activeUser?.display_name && (
                        <>
                          <button
                            type="button"
                            className="btn-apply-preset"
                            style={{ width: 120 }}
                            onClick={async () => {
                              await api.switchUser(u.display_name);
                              await loadUsers();
                              await refresh();
                              showToast(`Переключено на ${u.display_name}`);
                            }}
                          >
                            Переключить
                          </button>
                          <button
                            type="button"
                            className="btn-delete-slot"
                            onClick={() => setDeleteTarget(u.display_name)}
                            title="Удалить профиль"
                          >
                            ✕
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}

              <div className="dotify-section-title">АВТОМАТИЧЕСКИЙ ВХОД</div>
              <div className="dotify-card">
                <div className="dotify-card-row">
                  <div className="dotify-card-info">
                    <div className="dotify-card-title">Сохранённый профиль</div>
                    <div className="dotify-card-desc">
                      {autoLogin ? `Запомнен: ${autoLogin}` : "Автоматический вход не настроен"}
                    </div>
                  </div>
                  {autoLogin && (
                    <button
                      type="button"
                      className="dotify-token-action-btn"
                      onClick={async () => {
                        await api.clearAutoLogin();
                        setAutoLogin(null);
                        showToast("Автоматический вход сброшен");
                      }}
                    >
                      Сбросить
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB: GENERAL */}
          {activeTab === "general" && (
            <div>
              <div className="dotify-page-header">
                <h1 className="dotify-page-title">Основные настройки</h1>
                <p className="dotify-page-sub">Поведение приложения, язык и системные параметры</p>
              </div>

              <div className="dotify-section-title">ЯЗЫК ИНТЕРФЕЙСА</div>
              <div className="dotify-card">
                <div className="dotify-card-info">
                  <div className="dotify-card-title">Язык приложения</div>
                  <div className="dotify-card-desc">Выберите основной язык интерфейса</div>
                </div>
                <div className="dotify-segmented-group">
                  <button
                    type="button"
                    className={`dotify-segmented-btn ${lang === "ru" ? "active" : ""}`}
                    onClick={() => void handleSetLanguage("ru")}
                  >
                    <span className="dotify-segmented-btn-icon">🇷🇺</span>
                    <span className="dotify-segmented-btn-label">Русский</span>
                  </button>
                  <button
                    type="button"
                    className={`dotify-segmented-btn ${lang === "en" ? "active" : ""}`}
                    onClick={() => void handleSetLanguage("en")}
                  >
                    <span className="dotify-segmented-btn-icon">🇬🇧</span>
                    <span className="dotify-segmented-btn-label">English</span>
                  </button>
                </div>
              </div>

              <div className="dotify-section-title">ПОВЕДЕНИЕ ПРИЛОЖЕНИЯ</div>
              <div className="dotify-card">
                <div className="dotify-card-row">
                  <div className="dotify-card-info">
                    <div className="dotify-card-title">Автозапуск приложения</div>
                    <div className="dotify-card-desc">Автоматически запускать Vessel при входе в систему Windows</div>
                  </div>
                  <label className="dotify-switch">
                    <input
                      type="checkbox"
                      checked={autostart}
                      onChange={(e) => toggleAutostart(e.target.checked)}
                    />
                    <span className="dotify-slider" />
                  </label>
                </div>
              </div>

              <div className="dotify-card">
                <div className="dotify-card-row">
                  <div className="dotify-card-info">
                    <div className="dotify-card-title">Сворачивать в трей</div>
                    <div className="dotify-card-desc">При закрытии окна сворачивать приложение в системный трей вместо завершения работы</div>
                  </div>
                  <label className="dotify-switch">
                    <input
                      type="checkbox"
                      checked={minimizeToTray}
                      onChange={(e) => toggleMinimizeToTray(e.target.checked)}
                    />
                    <span className="dotify-slider" />
                  </label>
                </div>
              </div>

              <div className="dotify-card">
                <div className="dotify-card-row">
                  <div className="dotify-card-info">
                    <div className="dotify-card-title">Автопохожие треки</div>
                    <div className="dotify-card-desc">Автоматически продолжать воспроизведение похожей музыки после окончания текущей очереди</div>
                  </div>
                  <label className="dotify-switch">
                    <input
                      type="checkbox"
                      checked={autoSimilar}
                      onChange={(e) => toggleAutoSimilar(e.target.checked)}
                    />
                    <span className="dotify-slider" />
                  </label>
                </div>
              </div>

              <div className="dotify-card">
                <div className="dotify-card-row">
                  <div className="dotify-card-info">
                    <div className="dotify-card-title">Восстановление очереди при запуске</div>
                    <div className="dotify-card-desc">Запоминать список воспроизводимых треков и восстанавливать очередь при следующем запуске</div>
                  </div>
                  <label className="dotify-switch">
                    <input
                      type="checkbox"
                      checked={restoreQueue}
                      onChange={(e) => toggleRestoreQueue(e.target.checked)}
                    />
                    <span className="dotify-slider" />
                  </label>
                </div>
              </div>

              <div className="dotify-section-title">О ПРИЛОЖЕНИИ</div>
              <div className="dotify-card">
                <div className="dotify-card-row">
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>Vessel Music Desktop</div>
                    <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 4 }}>Версия 1.4.0 (Beta) · Высокопроизводительный Rust + Tauri плеер</div>
                  </div>
                  <span className="badge ok">Актуально</span>
                </div>
              </div>

              <div className="dotify-section-title">ОПАСНАЯ ЗОНА</div>
              <div className="dotify-card" style={{ borderColor: "rgba(239, 68, 68, 0.3)" }}>
                <div className="dotify-card-row">
                  <div>
                    <div className="dotify-card-title" style={{ color: "#ef4444" }}>Сброс приложения</div>
                    <div className="dotify-card-desc">Сбросить пользовательские настройки или очистить все базы данных</div>
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      type="button"
                      className="dotify-token-action-btn"
                      onClick={() => setConfirm("settings")}
                    >
                      Сброс настроек
                    </button>
                    <button
                      type="button"
                      className="dotify-token-action-btn"
                      style={{ color: "#ef4444" }}
                      onClick={() => setConfirm("data")}
                    >
                      Очистить данные
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: AUDIO */}
          {activeTab === "audio" && (
            <div>
              <div className="dotify-page-header">
                <h1 className="dotify-page-title">Настройки аудио</h1>
                <p className="dotify-page-sub">Параметры воспроизведения, нормализация и локальный аудиокэш</p>
              </div>

              <div className="dotify-section-title">ВЫВОД ЗВУКА</div>
              <div className="dotify-card">
                <div className="dotify-card-info">
                  <div className="dotify-card-title">Устройство вывода звука</div>
                  <div className="dotify-card-desc">Системное устройство воспроизведения по умолчанию</div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <select
                    className="dotify-token-input"
                    style={{ width: "100%", cursor: "pointer" }}
                    defaultValue="default"
                  >
                    <option value="default">По умолчанию (Системный динамик / Наушники)</option>
                    <option value="wasapi_exclusive">WASAPI (Эксклюзивный режим)</option>
                  </select>
                </div>
              </div>

              <div className="dotify-section-title">ОБРАБОТКА ЗВУКА</div>
              <div className="dotify-card">
                <div className="dotify-card-row">
                  <div className="dotify-card-info">
                    <div className="dotify-card-title">Нормализация громкости (AGC)</div>
                    <div className="dotify-card-desc">Автоматически выравнивать уровень громкости между тихими и громкими треками</div>
                  </div>
                  <label className="dotify-switch">
                    <input
                      type="checkbox"
                      checked={audioAgc}
                      onChange={(e) => toggleAudioAgc(e.target.checked)}
                    />
                    <span className="dotify-slider" />
                  </label>
                </div>
              </div>

              <div className="dotify-card">
                <div className="dotify-card-row">
                  <div className="dotify-card-info">
                    <div className="dotify-card-title">Автовоспроизведение последнего трека</div>
                    <div className="dotify-card-desc">Продолжать воспроизведение последней песни сразу после старта программы</div>
                  </div>
                  <label className="dotify-switch">
                    <input
                      type="checkbox"
                      checked={autoplayLast}
                      onChange={(e) => toggleAutoplayLast(e.target.checked)}
                    />
                    <span className="dotify-slider" />
                  </label>
                </div>
              </div>

              <div className="dotify-card">
                <div className="dotify-card-row">
                  <div className="dotify-card-info">
                    <div className="dotify-card-title">Бесшовное воспроизведение (Gapless)</div>
                    <div className="dotify-card-desc">Воспроизведение треков без пауз на стыках для концептуальных альбомов</div>
                  </div>
                  <label className="dotify-switch">
                    <input
                      type="checkbox"
                      checked={gapless}
                      onChange={(e) => toggleGapless(e.target.checked)}
                    />
                    <span className="dotify-slider" />
                  </label>
                </div>
              </div>

              <div className="dotify-card">
                <div className="dotify-card-row">
                  <div className="dotify-card-info">
                    <div className="dotify-card-title">Кэширование воспроизводимых треков</div>
                    <div className="dotify-card-desc">Автоматически сохранять поток на диск во время прослушивания для экономии трафика</div>
                  </div>
                  <label className="dotify-switch">
                    <input
                      type="checkbox"
                      checked={autoCache}
                      onChange={(e) => toggleAutoCache(e.target.checked)}
                    />
                    <span className="dotify-slider" />
                  </label>
                </div>
              </div>

              <div className="dotify-section-title">ДИРЕКТОРИИ ХРАНЕНИЯ</div>
              <div className="dotify-card">
                <div className="dotify-card-row">
                  <div className="dotify-card-info">
                    <div className="dotify-card-title">Папка для загрузок</div>
                    <div className="dotify-card-desc" style={{ wordBreak: "break-all" }}>
                      {downloadDir || "По умолчанию (~/Music/Vessel)"}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="dotify-token-action-btn"
                    onClick={() => setDirModal("download")}
                  >
                    Изменить
                  </button>
                </div>
              </div>

              <div className="dotify-card">
                <div className="dotify-card-row">
                  <div className="dotify-card-info">
                    <div className="dotify-card-title">Папка аудиокэша</div>
                    <div className="dotify-card-desc" style={{ wordBreak: "break-all" }}>
                      {cacheDir || "По умолчанию (~/AppData/Local/Vessel/cache)"}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="dotify-token-action-btn"
                    onClick={() => setDirModal("cache")}
                  >
                    Изменить
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB: STORAGE */}
          {activeTab === "storage" && (
            <div>
              <div className="dotify-page-header">
                <h1 className="dotify-page-title">Хранилище</h1>
                <p className="dotify-page-sub">Контроль занимаемого дискового пространства и очистка временных данных</p>
              </div>

              <div className="dotify-card">
                <div className="dotify-storage-gauge-wrap">
                  <div className="dotify-circular-gauge">
                    <svg width="120" height="120" viewBox="0 0 120 120">
                      <circle
                        cx="60"
                        cy="60"
                        r="50"
                        fill="none"
                        stroke="rgba(255,255,255,0.06)"
                        strokeWidth="10"
                      />
                      <circle
                        cx="60"
                        cy="60"
                        r="50"
                        fill="none"
                        stroke="var(--accent)"
                        strokeWidth="10"
                        strokeDasharray="314"
                        strokeDashoffset="240"
                        strokeLinecap="round"
                        transform="rotate(-90 60 60)"
                      />
                    </svg>
                    <div className="dotify-gauge-inner">
                      <span className="dotify-gauge-percent">367 MB</span>
                      <span className="dotify-gauge-sub">Занято</span>
                    </div>
                  </div>

                  <div className="dotify-storage-breakdown">
                    <div className="dotify-storage-item">
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text)" }}>🎵 Музыкальные треки</div>
                        <div style={{ fontSize: 12, color: "var(--text3)" }}>{storageTracksCount} аудиодорожек</div>
                      </div>
                      <div style={{ fontWeight: 700, color: "var(--text)" }}>{storageTracksSize}</div>
                    </div>

                    <div className="dotify-storage-item">
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text)" }}>🖼 Обложки альбомов</div>
                        <div style={{ fontSize: 12, color: "var(--text3)" }}>Изображения и миниатюры</div>
                      </div>
                      <div style={{ fontWeight: 700, color: "var(--text)" }}>{storageCoversSize}</div>
                    </div>

                    <div className="dotify-storage-item">
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text)" }}>📝 Тексты песен и метаданные</div>
                        <div style={{ fontSize: 12, color: "var(--text3)" }}>Кэш синхронизированных текстов</div>
                      </div>
                      <div style={{ fontWeight: 700, color: "var(--text)" }}>{storageLyricsSize}</div>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    className="dotify-token-action-btn submit"
                    onClick={handleClearCache}
                  >
                    Очистить всё хранилище
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB: PLAYER */}
          {activeTab === "player" && (
            <div>
              <div className="dotify-page-header">
                <h1 className="dotify-page-title">Настройки плеера</h1>
                <p className="dotify-page-sub">Поведение очереди воспроизведения и стиль мини-плеера</p>
              </div>

              <div className="dotify-section-title">ОЧЕРЕДЬ ВОСПРОИЗВЕДЕНИЯ</div>
              <div className="dotify-card">
                <div className="dotify-card-info">
                  <div className="dotify-card-title">Положение панели очереди</div>
                  <div className="dotify-card-desc">Выберите, с какой стороны экрана выдвигается панель следующих треков</div>
                </div>
                <div className="dotify-segmented-group">
                  <button
                    type="button"
                    className={`dotify-segmented-btn ${config.player?.queuePosition === "bottom" ? "active" : ""}`}
                    onClick={() => setQueuePosition("bottom")}
                  >
                    <span className="dotify-segmented-btn-icon">⬓</span>
                    <span className="dotify-segmented-btn-label">Снизу</span>
                  </button>
                  <button
                    type="button"
                    className={`dotify-segmented-btn ${config.player?.queuePosition === "left" ? "active" : ""}`}
                    onClick={() => setQueuePosition("left")}
                  >
                    <span className="dotify-segmented-btn-icon">◧</span>
                    <span className="dotify-segmented-btn-label">Слева</span>
                  </button>
                  <button
                    type="button"
                    className={`dotify-segmented-btn ${config.player?.queuePosition === "right" || !config.player?.queuePosition ? "active" : ""}`}
                    onClick={() => setQueuePosition("right")}
                  >
                    <span className="dotify-segmented-btn-icon">◨</span>
                    <span className="dotify-segmented-btn-label">Справа</span>
                  </button>
                </div>
              </div>

              <div className="dotify-section-title">МИНИ-ПЛЕЕР</div>
              <div className="dotify-card">
                <div className="dotify-card-info">
                  <div className="dotify-card-title">Пресеты мини-плеера</div>
                  <div className="dotify-card-desc">Быстро применить готовые стили компактного плеера</div>
                </div>
                <div className="dotify-segmented-group">
                  <button
                    type="button"
                    className={`dotify-segmented-btn ${config.player?.miniPlayerPreset === "full" ? "active" : ""}`}
                    onClick={() => setMiniPlayerPreset("full")}
                  >
                    <span className="dotify-segmented-btn-icon">🔲</span>
                    <span className="dotify-segmented-btn-label">Полный</span>
                  </button>
                  <button
                    type="button"
                    className={`dotify-segmented-btn ${config.player?.miniPlayerPreset === "rounded" ? "active" : ""}`}
                    onClick={() => setMiniPlayerPreset("rounded")}
                  >
                    <span className="dotify-segmented-btn-icon">⚪</span>
                    <span className="dotify-segmented-btn-label">Закругленный</span>
                  </button>
                  <button
                    type="button"
                    className={`dotify-segmented-btn ${config.player?.miniPlayerPreset === "hybrid" ? "active" : ""}`}
                    onClick={() => setMiniPlayerPreset("hybrid")}
                  >
                    <span className="dotify-segmented-btn-icon">🔘</span>
                    <span className="dotify-segmented-btn-label">Гибрид</span>
                  </button>
                  <button
                    type="button"
                    className={`dotify-segmented-btn ${config.player?.miniPlayerPreset === "deck" ? "active" : ""}`}
                    onClick={() => setMiniPlayerPreset("deck")}
                  >
                    <span className="dotify-segmented-btn-icon">📼</span>
                    <span className="dotify-segmented-btn-label">Дек</span>
                  </button>
                </div>
              </div>

              <div className="dotify-card">
                <div className="dotify-card-info">
                  <div className="dotify-card-title">Фон мини-плеера</div>
                  <div className="dotify-card-desc">Выберите источник цвета подложки мини-плеера</div>
                </div>
                <div className="dotify-segmented-group">
                  <button
                    type="button"
                    className={`dotify-segmented-btn ${config.player?.miniPlayerBg === "theme" ? "active" : ""}`}
                    onClick={() => setMiniPlayerBg("theme")}
                  >
                    <span className="dotify-segmented-btn-icon">🎨</span>
                    <span className="dotify-segmented-btn-label">Тема</span>
                  </button>
                  <button
                    type="button"
                    className={`dotify-segmented-btn ${config.player?.miniPlayerBg === "artwork" ? "active" : ""}`}
                    onClick={() => setMiniPlayerBg("artwork")}
                  >
                    <span className="dotify-segmented-btn-icon">🖼️</span>
                    <span className="dotify-segmented-btn-label">Обложка</span>
                  </button>
                  <button
                    type="button"
                    className={`dotify-segmented-btn ${config.player?.miniPlayerBg === "dominant" ? "active" : ""}`}
                    onClick={() => setMiniPlayerBg("dominant")}
                  >
                    <span className="dotify-segmented-btn-icon">🔘</span>
                    <span className="dotify-segmented-btn-label">Цвет обложки</span>
                  </button>
                </div>
              </div>

              <div className="dotify-card">
                <div className="dotify-card-info">
                  <div className="dotify-card-title">Форма границ</div>
                  <div className="dotify-card-desc">Форма капсулы или классические закругления</div>
                </div>
                <div className="dotify-segmented-group">
                  <button
                    type="button"
                    className={`dotify-segmented-btn ${config.player?.miniPlayerShape !== "capsule" ? "active" : ""}`}
                    onClick={() => setMiniPlayerShape("default")}
                  >
                    <span className="dotify-segmented-btn-icon">▫️</span>
                    <span className="dotify-segmented-btn-label">По умолчанию</span>
                  </button>
                  <button
                    type="button"
                    className={`dotify-segmented-btn ${config.player?.miniPlayerShape === "capsule" ? "active" : ""}`}
                    onClick={() => setMiniPlayerShape("capsule")}
                  >
                    <span className="dotify-segmented-btn-icon">💊</span>
                    <span className="dotify-segmented-btn-label">Капсула</span>
                  </button>
                </div>
              </div>

              <div className="dotify-card">
                <div className="dotify-card-row">
                  <div className="dotify-card-info">
                    <div className="dotify-card-title">Крупные значки управления</div>
                    <div className="dotify-card-desc">Увеличить размер кнопок Play, Next и Previous для удобного нажатия</div>
                  </div>
                  <label className="dotify-switch">
                    <input
                      type="checkbox"
                      checked={config.player?.largeIcons ?? false}
                      onChange={(e) => setPlayerOptions({ largeIcons: e.target.checked })}
                    />
                    <span className="dotify-slider" />
                  </label>
                </div>
              </div>
            </div>
          )}

          {/* TAB: INTERFACE */}
          {activeTab === "interface" && (
            <div>
              <div className="dotify-page-header">
                <h1 className="dotify-page-title">Интерфейс</h1>
                <p className="dotify-page-sub">Темы оформления, радиус скруглений, масштабирование и шрифт</p>
              </div>

              <div className="dotify-section-title">ВСТРОЕННЫЕ ТЕМЫ</div>
              <div className="dotify-presets-grid">
                {BUILTIN_THEMES.map((theme) => {
                  const isActive = config.theme?.accentColor === theme.accentColor;
                  return (
                    <div
                      key={theme.id}
                      className={`dotify-preset-card ${isActive ? "active" : ""}`}
                      onClick={() => applyPreset(theme)}
                      style={{ cursor: "pointer" }}
                    >
                      <div
                        className="preset-cover-gradient"
                        style={{
                          height: 90,
                          background: `linear-gradient(135deg, ${theme.appBgColor} 0%, ${theme.cardBgColor} 60%, ${theme.accentColor} 100%)`,
                        }}
                      >
                        <div
                          className="preset-swatch-pill"
                          style={{ backgroundColor: theme.accentColor }}
                        />
                      </div>
                      <div className="preset-card-body">
                        <div className="preset-card-title-row">
                          <span className="preset-card-name">{theme.name}</span>
                          {isActive && <span style={{ color: "var(--accent)", fontWeight: 700 }}>✓</span>}
                        </div>
                        <div className="preset-card-desc">{theme.desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="dotify-section-title">СКРУГЛЕНИЕ УГЛОВ</div>
              <div className="dotify-card">
                <div className="dotify-segmented-group">
                  <button
                    type="button"
                    className={`dotify-segmented-btn ${config.borderRadius === "sharp" ? "active" : ""}`}
                    onClick={() => setBorderRadius("sharp")}
                  >
                    <span className="dotify-segmented-btn-icon">⏹</span>
                    <span className="dotify-segmented-btn-label">Нет (0px)</span>
                  </button>
                  <button
                    type="button"
                    className={`dotify-segmented-btn ${config.borderRadius === "small" ? "active" : ""}`}
                    onClick={() => setBorderRadius("small")}
                  >
                    <span className="dotify-segmented-btn-icon">▫️</span>
                    <span className="dotify-segmented-btn-label">Маленькое</span>
                  </button>
                  <button
                    type="button"
                    className={`dotify-segmented-btn ${config.borderRadius === "medium" ? "active" : ""}`}
                    onClick={() => setBorderRadius("medium")}
                  >
                    <span className="dotify-segmented-btn-icon">◽</span>
                    <span className="dotify-segmented-btn-label">Среднее</span>
                  </button>
                  <button
                    type="button"
                    className={`dotify-segmented-btn ${config.borderRadius === "round" ? "active" : ""}`}
                    onClick={() => setBorderRadius("round")}
                  >
                    <span className="dotify-segmented-btn-icon">⚪</span>
                    <span className="dotify-segmented-btn-label">Большое</span>
                  </button>
                </div>
              </div>

              <div className="dotify-section-title">МАСШТАБИРОВАНИЕ ИНТЕРФЕЙСА</div>
              <div className="dotify-card">
                <div className="dotify-segmented-group">
                  {["75", "90", "100", "110", "125"].map((sc) => (
                    <button
                      key={sc}
                      type="button"
                      className={`dotify-segmented-btn ${uiScale === sc ? "active" : ""}`}
                      onClick={() => handleScaleSelect(sc)}
                    >
                      <span className="dotify-segmented-btn-icon">💻</span>
                      <span className="dotify-segmented-btn-label">{sc}%</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="dotify-section-title">ШРИФТ ИНТЕРФЕЙСА</div>
              <div className="dotify-presets-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
                {[
                  { id: "Inter", label: "Inter (Default)" },
                  { id: "Segoe UI", label: "Segoe UI" },
                  { id: "Roboto", label: "Roboto" },
                  { id: "Arial", label: "Arial" },
                  { id: "Helvetica Neue", label: "Helvetica" },
                  { id: "Calibri", label: "Calibri" },
                ].map((f) => {
                  const isSel = selectedFont === f.id;
                  return (
                    <div
                      key={f.id}
                      className={`dotify-preset-card ${isSel ? "active" : ""}`}
                      onClick={() => handleFontSelect(f.id)}
                      style={{ padding: 14, cursor: "pointer", alignItems: "center", textAlign: "center" }}
                    >
                      <div style={{ fontSize: 24, fontWeight: 700, fontFamily: f.id, marginBottom: 6 }}>
                        Aa
                      </div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{f.label}</div>
                      {isSel && <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 4 }}>✓ Выбран</div>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB: TABS */}
          {activeTab === "tabs" && (
            <div>
              <div className="dotify-page-header">
                <h1 className="dotify-page-title">Настройки вкладок</h1>
                <p className="dotify-page-sub">Положение и стиль панели навигации приложения</p>
              </div>

              <div className="dotify-section-title">ПОЗИЦИЯ ПАНЕЛИ НАВИГАЦИИ</div>
              <div className="dotify-card">
                <div className="dotify-segmented-group">
                  <button
                    type="button"
                    className={`dotify-segmented-btn ${config.sidebar?.position === "left" ? "active" : ""}`}
                    onClick={() => setSidebarPosition("left")}
                  >
                    <span className="dotify-segmented-btn-icon">◧</span>
                    <span className="dotify-segmented-btn-label">Слева</span>
                  </button>
                  <button
                    type="button"
                    className={`dotify-segmented-btn ${config.sidebar?.position === "right" ? "active" : ""}`}
                    onClick={() => setSidebarPosition("right")}
                  >
                    <span className="dotify-segmented-btn-icon">◨</span>
                    <span className="dotify-segmented-btn-label">Справа</span>
                  </button>
                  <button
                    type="button"
                    className={`dotify-segmented-btn ${config.sidebar?.position === "top" ? "active" : ""}`}
                    onClick={() => setSidebarPosition("top")}
                  >
                    <span className="dotify-segmented-btn-icon">⬒</span>
                    <span className="dotify-segmented-btn-label">Сверху</span>
                  </button>
                  <button
                    type="button"
                    className={`dotify-segmented-btn ${config.sidebar?.position === "bottom" ? "active" : ""}`}
                    onClick={() => setSidebarPosition("bottom")}
                  >
                    <span className="dotify-segmented-btn-icon">⬓</span>
                    <span className="dotify-segmented-btn-label">Снизу</span>
                  </button>
                </div>
              </div>

              <div className="dotify-section-title">СТИЛЬ ОТОБРАЖЕНИЯ</div>
              <div className="dotify-card">
                <div className="dotify-segmented-group">
                  <button
                    type="button"
                    className={`dotify-segmented-btn ${config.sidebar?.style === "dock" ? "active" : ""}`}
                    onClick={() => setSidebarStyle("dock")}
                  >
                    <span className="dotify-segmented-btn-icon">🗂</span>
                    <span className="dotify-segmented-btn-label">По умолчанию (Док)</span>
                  </button>
                  <button
                    type="button"
                    className={`dotify-segmented-btn ${config.sidebar?.style === "floating" ? "active" : ""}`}
                    onClick={() => setSidebarStyle("floating")}
                  >
                    <span className="dotify-segmented-btn-icon">🛸</span>
                    <span className="dotify-segmented-btn-label">Плавающий островок</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB: BACKGROUND */}
          {activeTab === "background" && (
            <div>
              <div className="dotify-page-header">
                <h1 className="dotify-page-title">Фон и эффекты</h1>
                <p className="dotify-page-sub">Кастомные обои (включая анимированные GIF), размытие и матовое стекло</p>
              </div>

              <div className="dotify-section-title">ОБОИ (ФОНОВОЕ ИЗОБРАЖЕНИЕ / GIF)</div>
              <div className="dotify-card">
                <div className="dotify-card-row">
                  <div className="dotify-card-info">
                    <div className="dotify-card-title">Пользовательские обои</div>
                    <div className="dotify-card-desc">Поддерживаются форматы JPG, PNG, WEBP и анимированные GIF</div>
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      type="button"
                      className="dotify-token-action-btn submit"
                      onClick={async () => {
                        try {
                          const file = await api.pickFile(["jpg", "jpeg", "png", "webp", "gif"]);
                          if (file) {
                            const dataUrl = await api.loadImageAsDataUrl(file);
                            updateThemeDirectly({ wallpaperData: dataUrl });
                            showToast("Обои успешно установлены!");
                          }
                        } catch (e) {
                          showToast(String(e), true);
                        }
                      }}
                    >
                      📁 Выбрать файл
                    </button>
                    {config.theme?.wallpaperData && (
                      <button
                        type="button"
                        className="dotify-token-action-btn"
                        onClick={() => {
                          updateThemeDirectly({ wallpaperData: null });
                          showToast("Обои удалены");
                        }}
                      >
                        Удалить
                      </button>
                    )}
                  </div>
                </div>

                {config.theme?.wallpaperData && (
                  <div style={{ marginTop: 16, height: 140, borderRadius: 10, overflow: "hidden", border: "1px solid var(--border)" }}>
                    <img
                      src={config.theme.wallpaperData}
                      alt="Wallpaper preview"
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                  </div>
                )}
              </div>

              <div className="dotify-section-title">ЗАТЕМНЕНИЕ И РАЗМЫТИЕ ОБОЕВ</div>
              <div className="dotify-card">
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span className="dotify-card-title">Затемнение подложки</span>
                      <span style={{ fontWeight: 700, color: "var(--accent)" }}>{config.theme?.wallpaperDim ?? 45}%</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="90"
                      value={config.theme?.wallpaperDim ?? 45}
                      onChange={(e) => updateThemeDirectly({ wallpaperDim: Number(e.target.value) })}
                      style={{ width: "100%", accentColor: "var(--accent)" }}
                    />
                  </div>

                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span className="dotify-card-title">Размытие фона (Blur)</span>
                      <span style={{ fontWeight: 700, color: "var(--accent)" }}>{config.theme?.wallpaperBlur ?? 14}px</span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="40"
                      value={config.theme?.wallpaperBlur ?? 14}
                      onChange={(e) => updateThemeDirectly({ wallpaperBlur: Number(e.target.value) })}
                      style={{ width: "100%", accentColor: "var(--accent)" }}
                    />
                  </div>
                </div>
              </div>

              <div className="dotify-section-title">МАТОВОЕ СТЕКЛО (GLASSMORPHISM)</div>
              <div className="dotify-card">
                <div className="dotify-card-row">
                  <div className="dotify-card-info">
                    <div className="dotify-card-title">Стеклянный режим (Frosted Glass)</div>
                    <div className="dotify-card-desc">Эффект матового полупрозрачного стекла для карточек, плеера и панелей</div>
                  </div>
                  <label className="dotify-switch">
                    <input
                      type="checkbox"
                      checked={config.theme?.glassMode ?? true}
                      onChange={(e) => updateThemeDirectly({ glassMode: e.target.checked })}
                    />
                    <span className="dotify-slider" />
                  </label>
                </div>

                {config.theme?.glassMode && (
                  <div style={{ marginTop: 20 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span className="dotify-card-title">Прозрачность стекла</span>
                      <span style={{ fontWeight: 700, color: "var(--accent)" }}>
                        {Math.round((config.theme?.glassOpacity ?? 0.72) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="10"
                      max="95"
                      value={Math.round((config.theme?.glassOpacity ?? 0.72) * 100)}
                      onChange={(e) => updateThemeDirectly({ glassOpacity: Number(e.target.value) / 100 })}
                      style={{ width: "100%", accentColor: "var(--accent)" }}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: CUSTOMIZATION & PRESETS */}
          {activeTab === "customization" && (
            <div>
              <div className="dotify-page-header">
                <h1 className="dotify-page-title">Кастомизация</h1>
                <p className="dotify-page-sub">Пресеты оформления и интерактивная настройка сетки Главной страницы</p>
              </div>

              {/* Big Drag-and-Drop Home Customization Banner */}
              <div
                className="dotify-dnd-banner"
                onClick={() => {
                  enterEditMode();
                  navigateTo("home");
                }}
              >
                <div className="dotify-dnd-banner-info">
                  <div className="dotify-dnd-banner-icon">✥</div>
                  <div>
                    <div className="dotify-dnd-banner-title">Кастомизация главной страницы</div>
                    <div className="dotify-dnd-banner-sub">
                      Свободное перемещение панелей, изменение ширины и расположение плеера ручками
                    </div>
                  </div>
                </div>
                <button type="button" className="dotify-dnd-banner-btn">
                  Настроить Главную →
                </button>
              </div>

              <div className="dotify-section-title">ПОЛЬЗОВАТЕЛЬСКИЕ ПРЕСЕТЫ</div>
              <div className="dotify-presets-grid">
                {userPresets.map((preset, slotIdx) => {
                  if (!preset) {
                    return (
                      <div
                        key={`empty-slot-${slotIdx}`}
                        className="dotify-preset-card"
                        style={{
                          height: 180,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          border: "1px dashed var(--border2)",
                          background: "transparent",
                          cursor: "pointer",
                        }}
                        onClick={() => {
                          saveToUserSlot(slotIdx);
                          showToast(`Слот ${slotIdx + 1} сохранён!`);
                        }}
                      >
                        <div style={{ textAlign: "center", color: "var(--text3)" }}>
                          <div style={{ fontSize: 24, marginBottom: 4 }}>+</div>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>Сохранить текущую тему</div>
                          <div style={{ fontSize: 11, marginTop: 2 }}>Слот {slotIdx + 1}</div>
                        </div>
                      </div>
                    );
                  }

                  return (
                    <PresetCard
                      key={preset.id}
                      preset={preset}
                      isActive={config.theme?.accentColor === preset.accentColor}
                      onApply={() => {
                        applyPreset(preset);
                        showToast(`Применен пресет ${preset.name}`);
                      }}
                      onPreview={() => {
                        startPreview(preset);
                        navigateTo("home");
                      }}
                      onDelete={() => {
                        deleteUserSlot(slotIdx);
                        showToast("Пресет удален");
                      }}
                    />
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB: SERVICES (YOUTUBE, SOUNDCLOUD, SPOTIFY, VK, YANDEX, DEEZER, APPLE) */}
          {activeTab.startsWith("service_") && (() => {
            const serviceKey = activeTab.replace("service_", "");
            const meta = SERVICE_META[serviceKey] || {
              key: serviceKey,
              hint: "Токен авторизации сервиса",
              bg: "#3b82f6",
              brandColor: "#3b82f6",
            };
            const providerStatus = state?.providers.find((p) => p.kind === serviceKey);
            const isConnected = providerStatus?.connected ?? false;
            const segment = api.PROVIDER_SEGMENT[serviceKey] ?? serviceKey;
            const route = routes[segment] ?? "local";

            return (
              <div>
                <div className="dotify-page-header">
                  <h1 className="dotify-page-title" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <PlatformIcon kind={serviceKey as any} size={28} />
                    <span>{providerStatus?.label || serviceKey}</span>
                  </h1>
                  <p className="dotify-page-sub">Двухколоночная настройка авторизации и роутинга запросов</p>
                </div>

                <div className="dotify-service-grid">
                  {/* Left Column: Authorization & Account */}
                  <div className="dotify-service-card">
                    <div className="dotify-service-status-banner">
                      <div className={`dotify-status-icon-circle ${isConnected ? "connected" : ""}`}>
                        {isConnected ? "✓" : "!"}
                      </div>
                      <div>
                        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
                          {isConnected ? "Сервис настроен" : "Требуется авторизация"}
                        </div>
                        <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 2 }}>
                          {isConnected ? "Готов к использованию" : "Введите токен или войдите через браузер"}
                        </div>
                      </div>
                    </div>

                    <div className="dotify-user-badge-card">
                      <div
                        className="dotify-user-avatar"
                        style={{ backgroundColor: meta.brandColor }}
                      >
                        {serviceKey.slice(0, 1).toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: "var(--text)" }}>
                          {isConnected ? `${providerStatus?.label} Аккаунт` : "Не авторизован"}
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
                          {isConnected ? "Статус: Активен" : "Подключение отсутствует"}
                        </div>
                      </div>
                    </div>

                    <div>
                      <div style={{ fontSize: 12, color: "var(--text2)", marginBottom: 8 }}>
                        {meta.hint}
                      </div>

                      <div className="dotify-token-input-row">
                        <input
                          type="password"
                          className="dotify-token-input"
                          placeholder="Вставьте токен или cookie..."
                          value={tokenInputs[serviceKey] ?? ""}
                          onChange={(e) =>
                            setTokenInputs((prev) => ({ ...prev, [serviceKey]: e.target.value }))
                          }
                        />
                        <button
                          type="button"
                          className="dotify-token-action-btn submit"
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
                        className="dotify-token-action-btn"
                        style={{ width: "100%", justifyContent: "center" }}
                        onClick={async () => {
                          try {
                            await BROWSER_LOGIN[serviceKey as BrowserLoginKind].login();
                            showToast("Окно авторизации открыто. Выполните вход в браузере.");
                          } catch (e) {
                            showToast(String(e), true);
                          }
                        }}
                      >
                        Войти через браузер
                      </button>
                    )}

                    {isConnected && (
                      <button
                        type="button"
                        className="dotify-token-action-btn"
                        style={{
                          width: "100%",
                          justifyContent: "center",
                          color: "var(--danger, #ef4444)",
                          borderColor: "rgba(239, 68, 68, 0.3)",
                        }}
                        onClick={() => disconnectService(serviceKey)}
                      >
                        Отключить сервис
                      </button>
                    )}
                  </div>

                  {/* Right Column: Execution Mode & Capabilities */}
                  <div className="dotify-service-card">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span className="dotify-section-title" style={{ margin: 0 }}>РЕЖИМ ВЫПОЛНЕНИЯ</span>
                      <div
                        className={`dotify-route-pill ${route !== "local" ? "server" : ""}`}
                        onClick={() => toggleRoute(serviceKey)}
                        title="Нажмите для переключения Локально / Сервер"
                      >
                        {route === "local" ? "💻 Локально" : "🖧 Сервер"}
                      </div>
                    </div>

                    <div className="dotify-capabilities-list">
                      {SERVICE_FEATURES.map((feat) => (
                        <div key={feat.id} className="dotify-capability-row">
                          <span style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span>{feat.icon}</span>
                            <span>{feat.label}</span>
                          </span>
                          <span
                            className={`dotify-route-pill ${route !== "local" ? "server" : ""}`}
                            onClick={() => toggleRoute(serviceKey)}
                          >
                            {route === "local" ? "💻" : "🖧"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}

          {/* TAB: PROXY */}
          {activeTab === "proxy" && (
            <div>
              <div className="dotify-page-header">
                <h1 className="dotify-page-title">Прокси-сервер</h1>
                <p className="dotify-page-sub">Настройка сетевого проксирования для обхода блокировок сервисов</p>
              </div>

              <div className="dotify-card">
                <div className="dotify-card-info">
                  <div className="dotify-card-title">HTTP / SOCKS5 Прокси</div>
                  <div className="dotify-card-desc">
                    Применяется для сетевых запросов Spotify, SoundCloud и других заблокированных платформ
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  <input
                    type="text"
                    className="dotify-token-input"
                    placeholder="http://user:pass@host:port или socks5://..."
                    value={spotifyProxy}
                    onChange={(e) => setSpotifyProxy(e.target.value)}
                    style={{ width: "100%", marginBottom: 12 }}
                  />
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                    <button
                      type="button"
                      className="dotify-token-action-btn submit"
                      onClick={async () => {
                        try {
                          await api.setSpotifyProxy(spotifyProxy.trim() || null);
                          showToast("Прокси успешно применён");
                        } catch (e) {
                          showToast(String(e), true);
                        }
                      }}
                    >
                      Сохранить прокси
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: SERVERS */}
          {activeTab === "servers" && <ServersTab />}

          {/* TAB: DISCORD RPC */}
          {activeTab === "discord" && (
            <div>
              <div className="dotify-page-header">
                <h1 className="dotify-page-title">Discord Rich Presence</h1>
                <p className="dotify-page-sub">Трансляция текущего трека в статус профиля Discord</p>
              </div>

              <div className="dotify-card">
                <div className="dotify-card-row">
                  <div className="dotify-card-info">
                    <div className="dotify-card-title">Включить Discord RPC</div>
                    <div className="dotify-card-desc">
                      Показывать обложку, название трека, исполнителя и таймлайн в Discord
                    </div>
                  </div>
                  <label className="dotify-switch">
                    <input
                      type="checkbox"
                      checked={discordRpc}
                      onChange={(e) => handleDiscordRpcToggle(e.target.checked)}
                    />
                    <span className="dotify-slider" />
                  </label>
                </div>
              </div>

              {discordRpc && (
                <div className="dotify-card">
                  <div className="dotify-section-title" style={{ marginTop: 0 }}>ПРЕДПРОСМОТР КАРТОЧКИ В DISCORD</div>
                  <div
                    style={{
                      background: "#111214",
                      borderRadius: 14,
                      padding: 16,
                      display: "flex",
                      gap: 14,
                      alignItems: "center",
                      maxWidth: 420,
                      border: "1px solid rgba(255,255,255,0.08)",
                      color: "#fff",
                    }}
                  >
                    <div style={{ width: 64, height: 64, borderRadius: 10, overflow: "hidden", background: "#222" }}>
                      <img
                        src={state?.now_playing?.artwork_url || "https://cdn.rcd.gg/PreMiD/websites/S/Spotify/assets/logo.png"}
                        alt="Discord RPC artwork"
                        style={{ width: "100%", height: "100%", objectFit: "cover" }}
                      />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#f2f3f5", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {state?.now_playing?.title || "Vessel Music Desktop"}
                      </div>
                      <div style={{ fontSize: 12, color: "#b5bac1", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {state?.now_playing?.artists.join(", ") || "Слушает музыку в Vessel"}
                      </div>
                      <div style={{ marginTop: 8, height: 4, background: "#4e5058", borderRadius: 2, overflow: "hidden" }}>
                        <div style={{ width: "35%", height: "100%", background: "#fff" }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB: VPN */}
          {activeTab === "vpn" && <VpnTab />}
        </main>
      </div>

      {/* MODALS */}
      {confirm && (
        <ConfirmModal
          lang={lang}
          title="Подтверждение"
          text={confirm === "settings" ? "Сбросить настройки к значениям по умолчанию?" : "Стереть все сохраненные данные приложения?"}
          confirmText="Подтвердить"
          onConfirm={async () => {
            if (confirm === "settings") {
              await api.resetSettings();
              showToast("Настройки сброшены");
            } else {
              await api.resetData();
              showToast("Данные очищены");
            }
            await refresh();
            setConfirm(null);
          }}
          onClose={() => setConfirm(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          lang={lang}
          title="Удаление профиля"
          text={`Удалить профиль «${deleteTarget}»? Все данные профиля будут стёрты.`}
          confirmText="Удалить"
          onConfirm={async () => {
            await api.deleteUser(deleteTarget);
            if (autoLogin === deleteTarget) setAutoLogin(null);
            await loadUsers();
            await refresh();
            showToast("Профиль удален");
            setDeleteTarget(null);
          }}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {dirModal && (
        <PathModal
          lang={lang}
          title={dirModal === "download" ? "Папка загрузок" : "Папка кэша"}
          initial={dirModal === "download" ? downloadDir : cacheDir}
          browseMode="folder"
          confirmText="Сохранить"
          onSubmit={(val: string) => {
            if (dirModal === "download") void changeDownloadDir(val);
            else void changeCacheDir(val);
            setDirModal(null);
          }}
          onClose={() => setDirModal(null)}
        />
      )}

      {createOpen && (
        <TextInputModal
          lang={lang}
          title="Создать профиль"
          placeholder="Имя профиля"
          confirmText="Создать"
          onSubmit={async (val: string) => {
            await api.createUser(val);
            await loadUsers();
            await refresh();
            setCreateOpen(false);
            showToast(`Профиль ${val} создан`);
          }}
          onClose={() => setCreateOpen(false)}
        />
      )}
    </div>
  );
}
