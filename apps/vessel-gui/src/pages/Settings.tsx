import { useEffect, useRef, useState } from "react";
import { useApp } from "../store";
import { t } from "../i18n";
import {
  useCustomization,
  BUILTIN_THEMES,
  PresetCard,
  hexToRgba,
  type ThemeColors,
} from "../customization";
import { PlatformIcon } from "../components/PlatformIcon";
import { clearExploreCache } from "./home_sections/ExploreSection";
import { clearPersonalMixesCache } from "./home_sections/PersonalMixesSection";
import {
  IconUser,
  IconGeneral,
  IconAudio,
  IconPlayer,
  IconInterface,
  IconBackground,
  IconCustomization,
  IconProxy,
  IconServer,
  IconDiscord,
  IconVpn,
  IconKey,
  IconSearch,
  IconPlay,
  IconSparkles,
  IconDisc,
  IconPlaylist,
  IconFileText,
  IconLayoutBottom,
  IconLayoutTop,
  IconLayoutLeft,
  IconLayoutRight,
  IconCornerNone,
  IconCornerSmall,
  IconCornerMedium,
  IconCornerRound,
  IconShapeCapsule,
  IconShapeRect,
  IconSolid,
  IconDevice,
  IconStorage,
  IconTabs,
} from "../components/Icons";
import { ConfirmModal, PathModal } from "../components/Modal";
import { VpnTab } from "../components/VpnTab";
import * as api from "../api/commands";

type SettingsTab =
  | "users"
  | "migration"
  | "general"
  | "recommendations"
  | "audio"
  | "storage"
  | "workshop"
  | "player"
  | "interface"
  | "tabs"
  | "background"
  | "customization"
  | "service_youtube_music"
  | "service_soundcloud"
  | "service_spotify"
  | "service_yandex"
  | "service_deezer"
  | "proxy"
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
    hint: "YouTube Music работает публично. Для доступа к личным плейлистам можно вставить cookies браузера.",
    bg: "#FF0000",
    brandColor: "#FF0000",
  },
  soundcloud: {
    key: "soundcloud",
    hint: "client_id — ключ из сетевых запросов браузера SoundCloud.",
    bg: "#FF5500",
    brandColor: "#FF5500",
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



const UNIFIED_PLATFORMS = [
  { key: "youtube_music", label: "YouTube Music", color: "#FF0000" },
  { key: "soundcloud", label: "SoundCloud", color: "#FF5500" },
  { key: "spotify", label: "Spotify", color: "#1ED760" },
  { key: "yandex", label: "Yandex Music", color: "#FFCC00" },
  { key: "deezer", label: "Deezer", color: "#A238FF" },
];


export function Settings({ onClose }: { onClose?: () => void } = {}) {
  const { state, showToast, refresh, lang, navigateTo, openAuthModal, logoutAccount } = useApp();
  const {
    config,
    updateThemeDirectly,
    setBorderRadius,
    setSidebarPosition,
    setSidebarStyle,
    setSidebarAutoHide,
    setPlayerPosition,
    setPlayerStyle,
    setPlayerOptions,
    setQueuePosition,
    setShowMiniPlayer,
    setFullscreenLyricsPosition,
    setMiniPlayerBg,
    setMiniPlayerShape,
    applyPreset,
    userPresets,
    saveToUserSlot,
    deleteUserSlot,
    startPreview,
    resetToDefaults,
    customTrackArt,
    setCustomTrackArt,
    imageLibrary,
    addToImageLibrary,
    removeFromImageLibrary,
    setWallpaperData,
  } = useCustomization();

  const [libraryUrlInput, setLibraryUrlInput] = useState("");
  const [pickerTarget, setPickerTarget] = useState<"trackArt" | "wallpaper" | null>(null);
  const [activeImageMenuId, setActiveImageMenuId] = useState<string | null>(null);

  const [isClosing, setIsClosing] = useState(false);

  const triggerClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      onClose?.();
    }, 180);
  };

  const [category, setCategory] = useState<"profile" | "general" | "interface" | "services" | "integrations">("general");
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");
  const [fullscreenScale, setFullscreenScale] = useState(() => Number(localStorage.getItem("vessel_scale_fullscreen") || 100));
  const [windowedScale, setWindowedScale] = useState(() => Number(localStorage.getItem("vessel_scale_windowed") || 100));

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        triggerClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const [selectedRecProviders, setSelectedRecProviders] = useState<string[]>(() => UNIFIED_PLATFORMS.map((p) => p.key));
  const [allSelectedRec, setAllSelectedRec] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const provVal = await api.getRecommendationProviders().catch(() => "all");
        if (cancelled) return;
        if (provVal === "all" || !provVal) {
          setAllSelectedRec(true);
          setSelectedRecProviders(UNIFIED_PLATFORMS.map((p) => p.key));
        } else {
          const list = provVal.split(",").filter((k) => UNIFIED_PLATFORMS.some((p) => p.key === k));
          setAllSelectedRec(list.length === UNIFIED_PLATFORMS.length);
          setSelectedRecProviders(list);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  const handleToggleAllRec = async () => {
    const nextAll = !allSelectedRec;
    setAllSelectedRec(nextAll);
    const nextList = nextAll ? UNIFIED_PLATFORMS.map((p) => p.key) : [UNIFIED_PLATFORMS[0].key];
    setSelectedRecProviders(nextList);
    try {
      const val = nextAll ? "all" : nextList.join(",");
      await api.setRecommendationProviders(val);
      clearExploreCache();
      clearPersonalMixesCache();
      window.dispatchEvent(new CustomEvent("vessel:providers-changed", { detail: val }));
      showToast(lang === "ru" ? "Платформы рекомендаций обновлены" : "Recommendation platforms updated");
    } catch (e) {
      showToast(String(e), true);
    }
  };

  const handleToggleRecPlatform = async (key: string) => {
    const allKeys = UNIFIED_PLATFORMS.map((p) => p.key);
    const current = allSelectedRec ? allKeys : [...selectedRecProviders];
    let next: string[];

    if (!current.includes(key)) {
      next = [...current, key];
    } else {
      if (current.length > 1) {
        next = current.filter((k) => k !== key);
      } else {
        showToast(
          lang === "ru"
            ? "Должна быть выбрана хотя бы одна платформа"
            : "At least one platform must be selected",
          true,
        );
        return;
      }
    }

    const isAll = next.length === allKeys.length;
    setAllSelectedRec(isAll);
    setSelectedRecProviders(next);
    try {
      const val = isAll ? "all" : next.join(",");
      await api.setRecommendationProviders(val);
      clearExploreCache();
      clearPersonalMixesCache();
      window.dispatchEvent(new CustomEvent("vessel:providers-changed", { detail: val }));
      showToast(lang === "ru" ? "Платформы рекомендаций обновлены" : "Recommendation platforms updated");
    } catch (e) {
      showToast(String(e), true);
    }
  };

  const [customThemeOpen, setCustomThemeOpen] = useState(false);
  const [customThemeName, setCustomThemeName] = useState("Моя тема");
  const [customColors, setCustomColors] = useState<ThemeColors>(() => ({
    accentColor: config.theme?.accentColor || "#ffffff",
    appBgColor: config.theme?.appBgColor || "#000000",
    sidebarBgColor: config.theme?.sidebarBgColor || "#000000",
    playerBgColor: config.theme?.playerBgColor || "#000000",
    cardBgColor: config.theme?.cardBgColor || "#000000",
    textColor: config.theme?.textColor || "#ffffff",
    wallpaperData: null,
    wallpaperBlur: 14,
    wallpaperDim: 45,
    glassMode: true,
    glassOpacity: 0.72,
  }));

  const randomizeCustomColors = () => {
    const ACCENTS = ["#6366f1", "#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4", "#f43f5e", "#14b8a6", "#e11d48", "#a855f7"];
    const DARK_BGS = ["#09090b", "#0b0c10", "#090d16", "#070c0e", "#100914", "#050505", "#0e0e12"];
    const randAccent = ACCENTS[Math.floor(Math.random() * ACCENTS.length)];
    const randBg = DARK_BGS[Math.floor(Math.random() * DARK_BGS.length)];
    setCustomColors((prev: ThemeColors) => ({
      ...prev,
      accentColor: randAccent,
      appBgColor: randBg,
      sidebarBgColor: randBg,
      playerBgColor: randBg,
      cardBgColor: "#18181b",
      textColor: "#f4f4f5",
    }));
  };

  const handleSaveCustomTheme = () => {
    updateThemeDirectly({
      accentColor: customColors.accentColor,
      appBgColor: customColors.appBgColor,
      sidebarBgColor: customColors.sidebarBgColor,
      playerBgColor: customColors.playerBgColor,
      cardBgColor: customColors.cardBgColor,
      textColor: customColors.textColor,
    });
    saveToUserSlot(0, customThemeName.trim() || "Своя тема");
    setCustomThemeOpen(false);
    showToast(lang === "ru" ? `Тема «${customThemeName}» сохранена и применена` : `Theme "${customThemeName}" saved & applied`);
  };

  const applyUiScale = (val: number) => {
    const zoomVal = val / 100;
    document.documentElement.style.setProperty("--ui-scale", String(zoomVal));
    document.documentElement.style.fontSize = `${14 * zoomVal}px`;
    (document.documentElement.style as any).zoom = String(zoomVal);
  };

  const handleFullscreenScale = (val: number) => {
    setFullscreenScale(val);
    localStorage.setItem("vessel_scale_fullscreen", String(val));
    const isFs = Boolean(document.fullscreenElement || window.innerHeight === screen.height);
    if (isFs) applyUiScale(val);
  };

  const handleWindowedScale = (val: number) => {
    setWindowedScale(val);
    localStorage.setItem("vessel_scale_windowed", String(val));
    const isFs = Boolean(document.fullscreenElement || window.innerHeight === screen.height);
    if (!isFs) applyUiScale(val);
  };


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
  const [autoCache, setAutoCache] = useState(() => localStorage.getItem("vessel_auto_cache") !== "false");
  const [crossfadeEnabled, setCrossfadeEnabled] = useState(() => localStorage.getItem("vessel_crossfade_enabled") === "true");
  const [crossfadeSec, setCrossfadeSec] = useState(() => Number(localStorage.getItem("vessel_crossfade_sec") || 5));
  const [selectedFont, setSelectedFont] = useState(() => localStorage.getItem("vessel_font") || "Inter");

  const toggleCrossfade = (val: boolean) => {
    setCrossfadeEnabled(val);
    localStorage.setItem("vessel_crossfade_enabled", String(val));
    void api.setCrossfade(val ? crossfadeSec * 1000 : 0);
    showToast(val ? (lang === "ru" ? `Кроссфейд включен (${crossfadeSec} сек)` : `Crossfade enabled (${crossfadeSec}s)`) : (lang === "ru" ? "Кроссфейд отключен" : "Crossfade disabled"));
  };

  const changeCrossfadeSec = (sec: number) => {
    setCrossfadeSec(sec);
    localStorage.setItem("vessel_crossfade_sec", String(sec));
    if (crossfadeEnabled) {
      void api.setCrossfade(sec * 1000);
    }
  };

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

  // Service routing state
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

  // Profile state
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileAvatarUrl, setProfileAvatarUrl] = useState("");
  const [profileBannerUrl, setProfileBannerUrl] = useState("");
  const [profileDisplayName, setProfileDisplayName] = useState("");
  const [profileStatus, setProfileStatus] = useState("");
  const [profileBio, setProfileBio] = useState("");
  const [profileLoaded, setProfileLoaded] = useState(false);

  const avatarFileInputRef = useRef<HTMLInputElement | null>(null);
  const bannerFileInputRef = useRef<HTMLInputElement | null>(null);
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);

  const [exportingBackup, setExportingBackup] = useState(false);
  const [importingBackup, setImportingBackup] = useState(false);
  const [cloudMigrating, setCloudMigrating] = useState(false);
  const [cloudDownloading, setCloudDownloading] = useState(false);

  const [dataDir, setDataDir] = useState<string>("");
  const [databasePath, setDatabasePath] = useState<string>("");
  const [lastExportPath, setLastExportPath] = useState<string>("");

  useEffect(() => {
    api.getDataDir().then(setDataDir).catch(() => {});
    api.getDatabasePath().then(setDatabasePath).catch(() => {});
  }, []);

  const handleImageFileSelect = async (
    file: File,
    maxWidth: number,
    maxHeight: number,
    setter: (val: string) => void,
  ) => {
    if (!file || !file.type.startsWith("image/")) {
      showToast(lang === "ru" ? "Пожалуйста, выберите файл изображения" : "Please select an image file", true);
      return;
    }
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const img = new Image();
          img.onload = () => {
            let { width, height } = img;
            if (width > maxWidth || height > maxHeight) {
              const ratio = Math.min(maxWidth / width, maxHeight / height);
              width = Math.round(width * ratio);
              height = Math.round(height * ratio);
            }
            const canvas = document.createElement("canvas");
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext("2d");
            if (!ctx) {
              reject(new Error("Не удалось создать контекст canvas"));
              return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            try {
              const webp = canvas.toDataURL("image/webp", 0.85);
              if (webp.startsWith("data:image/webp")) {
                resolve(webp);
                return;
              }
            } catch {}
            resolve(canvas.toDataURL("image/jpeg", 0.85));
          };
          img.onerror = () => reject(new Error(lang === "ru" ? "Ошибка декодирования изображения" : "Failed to decode image"));
          img.src = reader.result as string;
        };
        reader.onerror = () => reject(new Error(lang === "ru" ? "Ошибка чтения файла" : "Failed to read file"));
        reader.readAsDataURL(file);
      });
      setter(dataUrl);
      showToast(lang === "ru" ? "Изображение успешно выбрано" : "Image selected");
    } catch (err: any) {
      showToast(err?.message || (lang === "ru" ? "Ошибка обработки изображения" : "Error processing image"), true);
    }
  };

  const handleExportBackup = async () => {
    if (exportingBackup) return;
    setExportingBackup(true);
    try {
      let history: any[] = [];
      try {
        history = await api.getHistory();
      } catch {}
      const backupData = {
        version: 1,
        vessel_version: "1.3.17",
        exported_at: new Date().toISOString(),
        username: (state?.account_state && state.account_state.kind === "authenticated") ? state.account_state.username : "guest",
        tracks: state?.library || [],
        playlists: state?.playlists || [],
        history,
      };
      const jsonStr = JSON.stringify(backupData, null, 2);
      const dateStr = new Date().toISOString().slice(0, 10);
      const defaultName = `vessel-backup-${dateStr}.json`;

      let targetPath: string | null = null;
      try {
        targetPath = await api.saveFileAs(defaultName, ["json"]);
      } catch {}

      if (targetPath) {
        await api.writeTextFile(targetPath, jsonStr);
        setLastExportPath(targetPath);
        showToast(
          lang === "ru"
            ? `Файл сохранён в: ${targetPath} (${backupData.tracks.length} треков, ${backupData.playlists.length} плейлистов)`
            : `File saved to: ${targetPath} (${backupData.tracks.length} tracks, ${backupData.playlists.length} playlists)`
        );
      } else {
        const blob = new Blob([jsonStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = defaultName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showToast(
          lang === "ru"
            ? `Экспортировано ${backupData.tracks.length} треков и ${backupData.playlists.length} плейлистов`
            : `Exported ${backupData.tracks.length} tracks and ${backupData.playlists.length} playlists`
        );
      }
    } catch (e: any) {
      showToast(e?.message || (lang === "ru" ? "Ошибка экспорта" : "Export failed"), true);
    } finally {
      setExportingBackup(false);
    }
  };

  const processBackupData = async (text: string, sourceLabel: string) => {
    const data = JSON.parse(text);
    if (!data || typeof data !== "object") {
      throw new Error(lang === "ru" ? "Неверная структура файла" : "Invalid file structure");
    }
    const rawTracks = Array.isArray(data.tracks) ? data.tracks : [];
    let importedTracks = 0;
    if (rawTracks.length > 0) {
      importedTracks = await api.importTracksBatch(rawTracks);
    }
    const rawPlaylists = Array.isArray(data.playlists) ? data.playlists : [];
    let importedPlaylists = 0;
    for (const pl of rawPlaylists) {
      if (pl && pl.title && Array.isArray(pl.tracks)) {
        try {
          const created = await api.createPlaylist(pl.title);
          for (const t of pl.tracks) {
            await api.addToPlaylist(created.id, t).catch(() => {});
          }
          importedPlaylists++;
        } catch {}
      }
    }
    await refresh();
    showToast(
      lang === "ru"
        ? `Импортировано ${importedTracks} треков и ${importedPlaylists} плейлистов из «${sourceLabel}» в локальную медиатеку`
        : `Imported ${importedTracks} tracks and ${importedPlaylists} playlists from "${sourceLabel}" into local library`
    );
  };

  const handlePickAndImportBackup = async () => {
    if (importingBackup) return;
    try {
      const selectedPath = await api.pickFile(["json"]);
      if (!selectedPath) return;
      setImportingBackup(true);
      const text = await api.readTextFile(selectedPath);
      const fileName = selectedPath.split(/[/\\]/).pop() || selectedPath;
      await processBackupData(text, fileName);
    } catch {
      backupFileInputRef.current?.click();
    } finally {
      setImportingBackup(false);
    }
  };

  const handleImportBackup = async (file: File) => {
    if (importingBackup) return;
    if (!file.name.endsWith(".json")) {
      showToast(lang === "ru" ? "Файл должен быть в формате .json" : "File must be in .json format", true);
      return;
    }
    if (file.size > 25 * 1024 * 1024) {
      showToast(lang === "ru" ? "Файл резервной копии слишком велик (>25МБ)" : "Backup file too large (>25MB)", true);
      return;
    }
    setImportingBackup(true);
    try {
      const text = await file.text();
      await processBackupData(text, file.name);
    } catch (e: any) {
      showToast(e?.message || (lang === "ru" ? "Ошибка импорта файла" : "Import failed"), true);
    } finally {
      setImportingBackup(false);
    }
  };

  const handleCloudUpload = async () => {
    if (cloudMigrating) return;
    setCloudMigrating(true);
    try {
      await api.authMigrateData();
      await refresh();
      showToast(
        lang === "ru"
          ? "Локальные треки и плейлисты успешно выгружены в облачный аккаунт Vessel"
          : "Local library successfully uploaded to Vessel cloud"
      );
    } catch (e: any) {
      showToast(typeof e === "string" ? e : e?.message || "Ошибка облачной выгрузки", true);
    } finally {
      setCloudMigrating(false);
    }
  };

  const handleCloudDownload = async () => {
    if (cloudDownloading) return;
    setCloudDownloading(true);
    try {
      const res = await api.authDownloadCloudData();
      await refresh();
      const targetDb = databasePath.split(/[/\\]/).pop() || "library.sqlite3";
      showToast(
        lang === "ru"
          ? `Скачано из облака: ${res.tracks_count} треков и ${res.playlists_count} плейлистов в локальную базу (${targetDb})`
          : `Downloaded from cloud: ${res.tracks_count} tracks and ${res.playlists_count} playlists to local database (${targetDb})`
      );
    } catch (e: any) {
      showToast(typeof e === "string" ? e : e?.message || "Ошибка скачивания из облака", true);
    } finally {
      setCloudDownloading(false);
    }
  };

  useEffect(() => {
    if (state?.account_state?.kind !== "authenticated") return;
    if (profileLoaded) return;
    let mounted = true;
    setProfileLoading(true);
    api
      .authGetProfile()
      .then((p) => {
        if (!mounted) return;
        setProfileAvatarUrl(p.avatar_url || "");
        setProfileBannerUrl(p.banner_url || "");
        setProfileDisplayName(p.display_name || p.username || "");
        setProfileStatus(p.status || "");
        setProfileBio(p.bio || "");
        setProfileLoaded(true);
      })
      .catch((e) => {
        console.error("Failed to load profile:", e);
        if (!mounted) return;
        if (state.account_state?.kind === "authenticated") {
          setProfileDisplayName(state.account_state.username);
        }
      })
      .finally(() => {
        if (mounted) setProfileLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [state?.account_state, profileLoaded]);

  const handleSaveProfile = async () => {
    if (profileSaving) return;
    setProfileSaving(true);
    try {
      const updated = await api.authUpdateProfile({
        display_name: profileDisplayName.trim() || null,
        avatar_url: profileAvatarUrl.trim() || null,
        banner_url: profileBannerUrl.trim() || null,
        status: profileStatus.trim() || null,
        bio: profileBio.trim() || null,
      });
      setProfileAvatarUrl(updated.avatar_url || "");
      setProfileBannerUrl(updated.banner_url || "");
      setProfileDisplayName(updated.display_name || updated.username);
      setProfileStatus(updated.status || "");
      setProfileBio(updated.bio || "");
      showToast(lang === "ru" ? "Профиль успешно сохранён" : "Profile saved");
    } catch (e) {
      showToast(String(e), true);
    } finally {
      setProfileSaving(false);
    }
  };

  // Load initial settings
  useEffect(() => {
    void (async () => {
      try {
        const [dDir, cDir, rpc, sProxy, routeMap] = await Promise.all([
          api.getDownloadDir().catch(() => ""),
          api.getCacheDir().catch(() => ""),
          api.getDiscordRpc().catch(() => false),
          api.getSpotifyProxy().catch(() => ""),
          api.vesselRoutes().catch(() => ({})),
        ]);
        setDownloadDir(dDir);
        setCacheDir(cDir);
        setDiscordRpc(rpc);
        setSpotifyProxy(sProxy);
        setRoutes(routeMap);
      } catch (e) {
        console.error("Failed to load settings:", e);
      }
    })();
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
    void api.setAudioAgc(val);
    showToast(val ? "Нормализация AGC активна" : "Нормализация отключена");
  };

  const toggleAutoplayLast = (val: boolean) => {
    setAutoplayLast(val);
    localStorage.setItem("vessel_autoplay_last", String(val));
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
    const nextRoute = currentRoute === "local" ? "server:official" : "local";

    try {
      await api.vesselRouteSet(segment, nextRoute);
      setRoutes((prev) => ({ ...prev, [segment]: nextRoute }));
      await refresh();
      showToast(
        lang === "ru"
          ? `Маршрут ${serviceKey}: ${nextRoute === "local" ? "Локально" : "Сервер Vessel"}`
          : `Route ${serviceKey}: ${nextRoute === "local" ? "Local" : "Vessel Server"}`
      );
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



  return (
    <div
      className={`settings-modal-backdrop ${isClosing ? "closing" : ""}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          triggerClose();
        }
      }}
    >
      <div className={`settings-modal-window ${isClosing ? "closing" : ""}`} role="dialog" aria-modal="true">
        {/* MODAL HEADER */}
        <div className="settings-modal-header">
          <div className="settings-modal-title">Настройки</div>
          <button
            type="button"
            className="settings-modal-close"
            onClick={triggerClose}
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>

        {/* 2-TIER TOP NAVIGATION */}
        <div className="sett-modal-nav-container">
          {/* TIER 1: CATEGORIES */}
          <div className="sett-modal-categories">
            <button
              type="button"
              className={`sett-cat-btn ${category === "profile" ? "active" : ""}`}
              onClick={() => {
                setCategory("profile");
                setActiveTab("users");
              }}
            >
              Профиль
            </button>
            <button
              type="button"
              className={`sett-cat-btn ${category === "general" ? "active" : ""}`}
              onClick={() => {
                setCategory("general");
                setActiveTab("general");
              }}
            >
              Общие
            </button>
            <button
              type="button"
              className={`sett-cat-btn ${category === "interface" ? "active" : ""}`}
              onClick={() => {
                setCategory("interface");
                setActiveTab("interface");
              }}
            >
              Интерфейс
            </button>
            <button
              type="button"
              className={`sett-cat-btn ${category === "services" ? "active" : ""}`}
              onClick={() => {
                setCategory("services");
                setActiveTab("service_spotify");
              }}
            >
              Сервисы
            </button>
            <button
              type="button"
              className={`sett-cat-btn ${category === "integrations" ? "active" : ""}`}
              onClick={() => {
                setCategory("integrations");
                setActiveTab("proxy");
              }}
            >
              Интеграции
            </button>
          </div>

          {/* TIER 2: SUB-TABS (Pill bar) */}
          <div className="sett-modal-subtabs-wrap">
            <div className="sett-modal-subtabs">
              {category === "profile" && (
                <>
                  <button
                    type="button"
                    className={`sett-subtab-pill ${activeTab === "users" ? "active" : ""}`}
                    onClick={() => setActiveTab("users")}
                  >
                    <IconUser size={15} />
                    <span>{lang === "ru" ? "Профиль" : "Profile"}</span>
                  </button>
                  <button
                    type="button"
                    className={`sett-subtab-pill ${activeTab === "migration" ? "active" : ""}`}
                    onClick={() => setActiveTab("migration")}
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M17 3L21 7L17 11" />
                      <path d="M3 7H21" />
                      <path d="M7 21L3 17L7 13" />
                      <path d="M21 17H3" />
                    </svg>
                    <span>{lang === "ru" ? "Перенос треков" : "Transfer Tracks"}</span>
                  </button>
                </>
              )}

              {category === "general" && (
                <>
                  <button
                    type="button"
                    className={`sett-subtab-pill ${activeTab === "general" ? "active" : ""}`}
                    onClick={() => setActiveTab("general")}
                  >
                    <IconGeneral size={15} />
                    <span>Основные</span>
                  </button>
                  <button
                    type="button"
                    className={`sett-subtab-pill ${activeTab === "audio" ? "active" : ""}`}
                    onClick={() => setActiveTab("audio")}
                  >
                    <IconAudio size={15} />
                    <span>Аудио</span>
                  </button>
                  <button
                    type="button"
                    className={`sett-subtab-pill ${activeTab === "storage" ? "active" : ""}`}
                    onClick={() => setActiveTab("storage")}
                  >
                    <IconStorage size={15} />
                    <span>Кеш</span>
                  </button>
                </>
              )}

              {category === "interface" && (
                <>
                  <button
                    type="button"
                    className={`sett-subtab-pill ${activeTab === "interface" ? "active" : ""}`}
                    onClick={() => setActiveTab("interface")}
                  >
                    <IconInterface size={15} />
                    <span>Вид</span>
                  </button>
                  <button
                    type="button"
                    className={`sett-subtab-pill ${activeTab === "background" ? "active" : ""}`}
                    onClick={() => setActiveTab("background")}
                  >
                    <IconBackground size={15} />
                    <span>Фон</span>
                  </button>
                  <button
                    type="button"
                    className={`sett-subtab-pill ${activeTab === "player" ? "active" : ""}`}
                    onClick={() => setActiveTab("player")}
                  >
                    <IconPlayer size={15} />
                    <span>Плеер</span>
                  </button>
                  <button
                    type="button"
                    className={`sett-subtab-pill ${activeTab === "tabs" ? "active" : ""}`}
                    onClick={() => setActiveTab("tabs")}
                  >
                    <IconTabs size={15} />
                    <span>Вкладки</span>
                  </button>
                  <button
                    type="button"
                    className={`sett-subtab-pill ${activeTab === "customization" ? "active" : ""}`}
                    onClick={() => setActiveTab("customization")}
                  >
                    <IconCustomization size={15} />
                    <span>Кастом</span>
                  </button>
                  <button
                    type="button"
                    className={`sett-subtab-pill ${activeTab === "workshop" ? "active" : ""}`}
                    onClick={() => setActiveTab("workshop")}
                  >
                    <IconSparkles size={15} />
                    <span>Мастерская</span>
                  </button>
                </>
              )}

              {category === "services" && (
                <>
                  {[
                    { id: "service_spotify", name: "Spotify", kind: "spotify", brandColor: "#1ED760" },
                    { id: "service_yandex", name: "Yandex", kind: "yandex", brandColor: "#FFCC00" },
                    { id: "service_youtube_music", name: "YouTube", kind: "youtube_music", brandColor: "#FF0000" },
                    { id: "service_soundcloud", name: "SoundCloud", kind: "soundcloud", brandColor: "#FF5500" },
                    { id: "service_deezer", name: "Deezer", kind: "deezer", brandColor: "#A238FF" },
                  ].map((srv) => {
                    const isTabActive = activeTab === srv.id;
                    return (
                      <button
                        key={srv.id}
                        type="button"
                        className={`sett-subtab-pill ${isTabActive ? "active" : ""}`}
                        onClick={() => setActiveTab(srv.id as any)}
                      >
                        <PlatformIcon
                          kind={srv.kind as any}
                          size={15}
                          color={isTabActive ? srv.brandColor : "var(--text3)"}
                          style={{
                            filter: isTabActive ? "none" : "grayscale(100%)",
                            opacity: isTabActive ? 1 : 0.55,
                            transition: "all 0.15s ease",
                          }}
                        />
                        <span>{srv.name}</span>
                      </button>
                    );
                  })}
                </>
              )}

              {category === "integrations" && (
                <>
                  <button
                    type="button"
                    className={`sett-subtab-pill ${activeTab === "proxy" ? "active" : ""}`}
                    onClick={() => setActiveTab("proxy")}
                  >
                    <IconProxy size={15} />
                    <span>Прокси</span>
                  </button>
                  <button
                    type="button"
                    className={`sett-subtab-pill ${activeTab === "discord" ? "active" : ""}`}
                    onClick={() => setActiveTab("discord")}
                  >
                    <IconDiscord size={15} />
                    <span>Discord RPC</span>
                  </button>
                  <button
                    type="button"
                    className={`sett-subtab-pill ${activeTab === "vpn" ? "active" : ""}`}
                    onClick={() => setActiveTab("vpn")}
                  >
                    <IconVpn size={15} />
                    <span>VPN</span>
                  </button>
                </>
              )}
            </div>
          </div>
        </div>

        {/* MAIN SETTINGS CONTENT */}
        <div className="sett-modal-body sett-sett-content">
          <div key={activeTab} className="sett-tab-page">

          {/* TAB: USERS / VESSEL ACCOUNT */}
          {activeTab === "users" && (
            <div>
              <div className="sett-page-header">
                <h1 className="sett-page-title">
                  {lang === "ru" ? "Vessel аккаунт" : "Vessel Account"}
                </h1>
                <p className="sett-page-sub">
                  {lang === "ru"
                    ? "Синхронизация медиатеки и управление аккаунтом Vessel"
                    : "Library synchronization and Vessel account management"}
                </p>
              </div>

              {/* VESSEL PROFILE SECTION */}
              <div className="sett-section-title">
                {lang === "ru" ? "ПРОФИЛЬ VESSEL" : "VESSEL PROFILE"}
              </div>

              {state?.account_state?.kind === "restoring" && (
                <div className="sett-card" style={{ padding: "20px 24px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: "50%",
                        background: "var(--elev)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        color: "var(--accent)",
                      }}
                    >
                      <IconUser size={22} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
                        {lang === "ru" ? "Восстановление сессии..." : "Restoring session..."}
                      </div>
                      <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
                        Vessel
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {state?.account_state?.kind === "authenticated" && (
                <>
                  {/* Profile Live Preview Card */}
                  <div
                    className="sett-card"
                    style={{
                      padding: 0,
                      overflow: "hidden",
                      borderRadius: "16px",
                      border: "1px solid var(--border)",
                      background: "var(--card-bg, #000000)",
                      boxShadow: "0 8px 30px rgba(0, 0, 0, 0.35)",
                    }}
                  >
                    {/* Banner Area */}
                    <div
                      style={{
                        width: "100%",
                        height: "130px",
                        position: "relative",
                        overflow: "hidden",
                        background: profileBannerUrl.trim()
                          ? "#000000"
                          : "linear-gradient(135deg, rgba(255, 255, 255, 0.06) 0%, rgba(20, 20, 26, 0.98) 100%)",
                      }}
                    >
                      {profileBannerUrl.trim() ? (
                        <img
                          src={profileBannerUrl.trim()}
                          alt="Banner"
                          style={{
                            width: "100%",
                            height: "100%",
                            objectFit: "cover",
                            display: "block",
                          }}
                          onError={(e) => {
                            e.currentTarget.style.display = "none";
                          }}
                        />
                      ) : null}
                      <div
                        style={{
                          position: "absolute",
                          inset: 0,
                          background: "linear-gradient(to bottom, rgba(0,0,0,0.1) 0%, rgba(0,0,0,0.7) 100%)",
                          pointerEvents: "none",
                        }}
                      />
                    </div>

                    {/* Profile Header Area */}
                    <div style={{ padding: "0 22px 20px 22px", position: "relative" }}>
                      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
                        {/* Overlapping Round Avatar */}
                        <div
                          style={{
                            width: 72,
                            height: 72,
                            borderRadius: "50%",
                            border: "3px solid var(--card-bg, #000000)",
                            marginTop: -36,
                            position: "relative",
                            zIndex: 2,
                            background: "var(--accent)",
                            color: "var(--accent-contrast-text)",
                            overflow: "hidden",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            boxShadow: "0 6px 20px rgba(0, 0, 0, 0.6)",
                            flexShrink: 0,
                          }}
                        >
                          {profileAvatarUrl.trim() ? (
                            <img
                              src={profileAvatarUrl.trim()}
                              alt="Avatar"
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                                display: "block",
                              }}
                              onError={(e) => {
                                e.currentTarget.style.display = "none";
                              }}
                            />
                          ) : null}
                          <span
                            style={{
                              fontSize: 26,
                              fontWeight: 800,
                              display: profileAvatarUrl.trim() ? "none" : "block",
                            }}
                          >
                            {(profileDisplayName || state.account_state.username || "U").slice(0, 1).toUpperCase()}
                          </span>
                        </div>
                      </div>

                      {/* User Names & Identifiers */}
                      <div style={{ marginTop: 10 }}>
                        <div style={{ fontSize: 20, fontWeight: 800, color: "var(--text)", letterSpacing: "-0.01em" }}>
                          {profileDisplayName || state.account_state.username}
                        </div>
                        <div style={{ fontSize: 12.5, color: "var(--text3)", marginTop: 2 }}>
                          @{state.account_state.username.replace(/^@+/, "")} • ID: {state.account_state.user_id.slice(0, 8)}
                        </div>

                        {/* Status if filled */}
                        {profileStatus.trim() ? (
                          <div
                            style={{
                              fontSize: 13,
                              color: "var(--text2)",
                              marginTop: 8,
                              fontStyle: "italic",
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                            }}
                          >
                            <span>💬</span>
                            <span>{profileStatus}</span>
                          </div>
                        ) : null}

                        {/* Bio if filled */}
                        {profileBio.trim() ? (
                          <div
                            style={{
                              fontSize: 13,
                              color: "var(--text2)",
                              lineHeight: 1.45,
                              marginTop: 10,
                              padding: "8px 12px",
                              background: "var(--elev, rgba(255, 255, 255, 0.03))",
                              borderRadius: 8,
                              border: "1px solid var(--border)",
                            }}
                          >
                            {profileBio}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </div>

                  {/* Profile Edit Form */}
                  <div className="sett-section-title" style={{ marginTop: 24 }}>
                    {lang === "ru" ? "НАСТРОЙКИ ПРОФИЛЯ" : "PROFILE SETTINGS"}
                  </div>

                  <div
                    className="sett-card"
                    style={{
                      padding: "22px 24px",
                      display: "flex",
                      flexDirection: "column",
                      gap: 16,
                      borderRadius: "16px",
                      border: "1px solid var(--border)",
                      background: "var(--card-bg, #000000)",
                    }}
                  >
                    {/* Аватар */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
                        {lang === "ru" ? "Аватар" : "Avatar"}
                      </label>
                      <input
                        ref={avatarFileInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handleImageFileSelect(f, 256, 256, setProfileAvatarUrl);
                          e.target.value = "";
                        }}
                      />
                      <div style={{ position: "relative", width: "100%", display: "flex", alignItems: "center" }}>
                        {profileAvatarUrl.startsWith("data:") ? (
                          <div
                            style={{
                              width: "100%",
                              height: 38,
                              boxSizing: "border-box",
                              background: "var(--elev, rgba(255, 255, 255, 0.04))",
                              border: "1px solid var(--border)",
                              borderRadius: 8,
                              padding: "0 68px 0 14px",
                              fontSize: 13,
                              color: "var(--text2)",
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <span>{lang === "ru" ? "Локальный файл" : "Local file"}</span>
                          </div>
                        ) : (
                          <input
                            type="text"
                            value={profileAvatarUrl}
                            onChange={(e) => setProfileAvatarUrl(e.target.value)}
                            placeholder={lang === "ru" ? "Ссылка на аватарку или выбор файла" : "Avatar image URL or local file"}
                            style={{
                              width: "100%",
                              height: 38,
                              boxSizing: "border-box",
                              background: "var(--elev, rgba(255, 255, 255, 0.04))",
                              border: "1px solid var(--border)",
                              borderRadius: 8,
                              padding: "0 68px 0 14px",
                              fontSize: 13,
                              color: "var(--text)",
                              outline: "none",
                              fontFamily: "inherit",
                            }}
                          />
                        )}

                        <div style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", gap: 2 }}>
                          {profileAvatarUrl ? (
                            <button
                              type="button"
                              onClick={() => setProfileAvatarUrl("")}
                              title={lang === "ru" ? "Удалить аватар" : "Remove avatar"}
                              style={{
                                color: "var(--text3)",
                                background: "transparent",
                                border: "none",
                                cursor: "pointer",
                                padding: 5,
                                borderRadius: 6,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 13,
                              }}
                            >
                              ✕
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => avatarFileInputRef.current?.click()}
                            title={lang === "ru" ? "Выбрать аватар с компьютера" : "Choose avatar from computer"}
                            style={{
                              color: "var(--text)",
                              background: "transparent",
                              border: "none",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              padding: 6,
                              borderRadius: 6,
                              transition: "background 0.15s ease",
                            }}
                          >
                            <IconBackground size={16} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Баннер */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
                        {lang === "ru" ? "Баннер" : "Banner"}
                      </label>
                      <input
                        ref={bannerFileInputRef}
                        type="file"
                        accept="image/*"
                        style={{ display: "none" }}
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void handleImageFileSelect(f, 1200, 400, setProfileBannerUrl);
                          e.target.value = "";
                        }}
                      />
                      <div style={{ position: "relative", width: "100%", display: "flex", alignItems: "center" }}>
                        {profileBannerUrl.startsWith("data:") ? (
                          <div
                            style={{
                              width: "100%",
                              height: 38,
                              boxSizing: "border-box",
                              background: "var(--elev, rgba(255, 255, 255, 0.04))",
                              border: "1px solid var(--border)",
                              borderRadius: 8,
                              padding: "0 68px 0 14px",
                              fontSize: 13,
                              color: "var(--text2)",
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                            }}
                          >
                            <span>{lang === "ru" ? "Локальный файл" : "Local file"}</span>
                          </div>
                        ) : (
                          <input
                            type="text"
                            value={profileBannerUrl}
                            onChange={(e) => setProfileBannerUrl(e.target.value)}
                            placeholder={lang === "ru" ? "Ссылка на баннер или выбор файла" : "Banner image URL or local file"}
                            style={{
                              width: "100%",
                              height: 38,
                              boxSizing: "border-box",
                              background: "var(--elev, rgba(255, 255, 255, 0.04))",
                              border: "1px solid var(--border)",
                              borderRadius: 8,
                              padding: "0 68px 0 14px",
                              fontSize: 13,
                              color: "var(--text)",
                              outline: "none",
                              fontFamily: "inherit",
                            }}
                          />
                        )}

                        <div style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", display: "flex", alignItems: "center", gap: 2 }}>
                          {profileBannerUrl ? (
                            <button
                              type="button"
                              onClick={() => setProfileBannerUrl("")}
                              title={lang === "ru" ? "Удалить баннер" : "Remove banner"}
                              style={{
                                color: "var(--text3)",
                                background: "transparent",
                                border: "none",
                                cursor: "pointer",
                                padding: 5,
                                borderRadius: 6,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 13,
                              }}
                            >
                              ✕
                            </button>
                          ) : null}
                          <button
                            type="button"
                            onClick={() => bannerFileInputRef.current?.click()}
                            title={lang === "ru" ? "Выбрать баннер с компьютера" : "Choose banner from computer"}
                            style={{
                              color: "var(--text)",
                              background: "transparent",
                              border: "none",
                              cursor: "pointer",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              padding: 6,
                              borderRadius: 6,
                              transition: "background 0.15s ease",
                            }}
                          >
                            <IconBackground size={16} />
                          </button>
                        </div>
                      </div>
                    </div>

                    {/* Никнейм */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
                          {lang === "ru" ? "Никнейм" : "Nickname"}
                        </label>
                        <span style={{ fontSize: 11, color: "var(--text3)" }}>
                          {profileDisplayName.length}/32
                        </span>
                      </div>
                      <input
                        type="text"
                        maxLength={32}
                        value={profileDisplayName}
                        onChange={(e) => setProfileDisplayName(e.target.value.slice(0, 32))}
                        placeholder={lang === "ru" ? "Отображаемое имя" : "Display name"}
                        style={{
                          width: "100%",
                          height: 38,
                          boxSizing: "border-box",
                          background: "var(--elev, rgba(255, 255, 255, 0.04))",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          padding: "0 14px",
                          fontSize: 13,
                          color: "var(--text)",
                          outline: "none",
                          fontFamily: "inherit",
                        }}
                      />
                    </div>

                    {/* Имя пользователя (Readonly login) */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
                          {lang === "ru" ? "Имя пользователя" : "Username"}
                        </label>
                        <span style={{ fontSize: 11, color: "var(--text3)" }}>
                          {state.account_state.username.length}/20
                        </span>
                      </div>
                      <input
                        type="text"
                        value={state.account_state.username ? (state.account_state.username.startsWith("@") ? state.account_state.username : `@${state.account_state.username}`) : "@"}
                        readOnly
                        title={lang === "ru" ? "Имя пользователя является уникальным идентификатором аккаунта" : "Username is your unique account identifier"}
                        style={{
                          width: "100%",
                          height: 38,
                          boxSizing: "border-box",
                          background: "var(--elev, rgba(255, 255, 255, 0.02))",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          padding: "0 14px",
                          fontSize: 13,
                          color: "var(--text3)",
                          outline: "none",
                          fontFamily: "inherit",
                          cursor: "not-allowed",
                        }}
                      />
                    </div>

                    {/* Статус */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
                          {lang === "ru" ? "Статус" : "Status"}
                        </label>
                        <span style={{ fontSize: 11, color: "var(--text3)" }}>
                          {profileStatus.length}/64
                        </span>
                      </div>
                      <input
                        type="text"
                        maxLength={64}
                        value={profileStatus}
                        onChange={(e) => setProfileStatus(e.target.value.slice(0, 64))}
                        placeholder={lang === "ru" ? "Что у вас нового?" : "What's new?"}
                        style={{
                          width: "100%",
                          height: 38,
                          boxSizing: "border-box",
                          background: "var(--elev, rgba(255, 255, 255, 0.04))",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          padding: "0 14px",
                          fontSize: 13,
                          color: "var(--text)",
                          outline: "none",
                          fontFamily: "inherit",
                        }}
                      />
                    </div>

                    {/* О себе */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                        <label style={{ fontSize: 12, fontWeight: 700, color: "var(--text)" }}>
                          {lang === "ru" ? "О себе" : "About"}
                        </label>
                        <span style={{ fontSize: 11, color: "var(--text3)" }}>
                          {profileBio.length}/150
                        </span>
                      </div>
                      <textarea
                        rows={3}
                        maxLength={150}
                        value={profileBio}
                        onChange={(e) => setProfileBio(e.target.value.slice(0, 150))}
                        placeholder={lang === "ru" ? "Расскажите о себе" : "Tell about yourself"}
                        style={{
                          width: "100%",
                          boxSizing: "border-box",
                          background: "var(--elev, rgba(255, 255, 255, 0.04))",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          padding: "10px 14px",
                          fontSize: 13,
                          color: "var(--text)",
                          outline: "none",
                          fontFamily: "inherit",
                          resize: "vertical",
                        }}
                      />
                    </div>

                    {/* Buttons row */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginTop: 8,
                        flexWrap: "wrap",
                        gap: 12,
                      }}
                    >
                      <button
                        type="button"
                        disabled={profileSaving || profileLoading}
                        onClick={handleSaveProfile}
                        style={{
                          padding: "10px 22px",
                          borderRadius: 10,
                          background: "var(--accent)",
                          color: "var(--accent-contrast-text)",
                          border: "none",
                          fontSize: 13.5,
                          fontWeight: 700,
                          cursor: (profileSaving || profileLoading) ? "not-allowed" : "pointer",
                          opacity: (profileSaving || profileLoading) ? 0.7 : 1,
                          transition: "all 0.15s ease",
                        }}
                      >
                        {profileSaving
                          ? (lang === "ru" ? "Сохранение..." : "Saving...")
                          : profileLoading
                          ? (lang === "ru" ? "Загрузка..." : "Loading...")
                          : (lang === "ru" ? "Сохранить изменения" : "Save Changes")}
                      </button>

                      <button
                        type="button"
                        onClick={async () => {
                          await logoutAccount();
                          onClose?.();
                          showToast(lang === "ru" ? "Вы вышли из аккаунта Vessel" : "Logged out from Vessel");
                        }}
                        style={{
                          padding: "9px 18px",
                          borderRadius: 10,
                          background: "rgba(239, 68, 68, 0.1)",
                          border: "1px solid rgba(239, 68, 68, 0.25)",
                          color: "#f87171",
                          fontSize: 13,
                          fontWeight: 600,
                          cursor: "pointer",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {lang === "ru" ? "Выйти из аккаунта" : "Log out"}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {(!state?.account_state || state.account_state.kind === "guest") && (
                <div className="sett-card" style={{ padding: "20px 24px" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div
                        style={{
                          width: 48,
                          height: 48,
                          borderRadius: "50%",
                          background: "var(--elev)",
                          border: "1px solid var(--border)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "var(--text2)",
                        }}
                      >
                        <IconUser size={22} />
                      </div>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <span style={{ fontSize: 16, fontWeight: 700, color: "var(--text)" }}>
                            {lang === "ru" ? "Гостевой режим" : "Guest Mode"}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              fontWeight: 600,
                              padding: "2px 8px",
                              borderRadius: 12,
                              background: "var(--elev)",
                              color: "var(--text3)",
                              border: "1px solid var(--border)",
                            }}
                          >
                            {lang === "ru" ? "Только локально" : "Local only"}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 3 }}>
                          {lang === "ru"
                            ? "Войдите в Vessel аккаунт для облачной синхронизации треков и плейлистов"
                            : "Log into Vessel account to sync your tracks and playlists across devices"}
                        </div>
                      </div>
                    </div>

                    <button
                      type="button"
                      className="btn-apply-preset"
                      style={{
                        padding: "10px 20px",
                        height: "auto",
                        background: "var(--accent)",
                        color: "var(--accent-contrast-text)",
                        fontWeight: 700,
                      }}
                      onClick={() => {
                        onClose?.();
                        openAuthModal();
                      }}
                    >
                      {lang === "ru" ? "Войти / Регистрация" : "Sign In / Register"}
                    </button>
                  </div>
                </div>
              )}

            </div>
          )}

          {/* TAB: MIGRATION (Перенос треков и данных) */}
          {activeTab === "migration" && (
            <div>
              <input
                ref={backupFileInputRef}
                type="file"
                accept=".json"
                style={{ display: "none" }}
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) void handleImportBackup(f);
                  e.target.value = "";
                }}
              />

              <div className="sett-page-header">
                <h1 className="sett-page-title">
                  {lang === "ru" ? "Перенос треков и данных" : "Track Migration & Backup"}
                </h1>
                <p className="sett-page-sub">
                  {lang === "ru"
                    ? "Резервное копирование в переносимый JSON-файл, синхронизация с облаком Vessel и информация о путях хранения"
                    : "Backup your library to portable JSON, sync with Vessel Cloud and view storage paths"}
                </p>
              </div>

              {/* CARD 1: Local Storage Info */}
              <div className="sett-section-title">
                {lang === "ru" ? "ЛОКАЛЬНОЕ ХРАНИЛИЩЕ И БАЗА ДАННЫХ" : "LOCAL STORAGE & DATABASE"}
              </div>

              <div
                className="sett-card"
                style={{
                  padding: "20px 24px",
                  borderRadius: "16px",
                  border: "1px solid var(--border)",
                  background: "var(--card-bg, #000000)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      {lang === "ru" ? "Файл базы данных SQLite" : "SQLite Database File"}
                    </div>
                    <div
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        background: "var(--elev, rgba(255, 255, 255, 0.03))",
                        border: "1px solid var(--border)",
                        fontFamily: "monospace",
                        fontSize: 12.5,
                        color: "var(--text)",
                        wordBreak: "break-all",
                        userSelect: "all",
                      }}
                    >
                      {databasePath || (lang === "ru" ? "Определение пути..." : "Resolving path...")}
                    </div>
                  </div>

                  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                      {lang === "ru" ? "Каталог данных Vessel" : "Vessel Data Directory"}
                    </div>
                    <div
                      style={{
                        padding: "8px 12px",
                        borderRadius: 8,
                        background: "var(--elev, rgba(255, 255, 255, 0.03))",
                        border: "1px solid var(--border)",
                        fontFamily: "monospace",
                        fontSize: 12.5,
                        color: "var(--text)",
                        wordBreak: "break-all",
                        userSelect: "all",
                      }}
                    >
                      {dataDir || (lang === "ru" ? "Определение каталога..." : "Resolving directory...")}
                    </div>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={() => {
                      if (dataDir) {
                        void api.openPath(dataDir);
                      }
                    }}
                    style={{
                      padding: "9px 18px",
                      borderRadius: 9,
                      background: "var(--elev2, rgba(255, 255, 255, 0.08))",
                      border: "1px solid var(--border)",
                      color: "var(--text)",
                      fontSize: 13,
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      transition: "all 0.15s ease",
                    }}
                  >
                    <IconStorage size={15} />
                    <span>{lang === "ru" ? "Открыть папку данных" : "Open Data Folder"}</span>
                  </button>
                </div>
              </div>

              {/* CARD 2: File Backup (JSON Export / Import) */}
              <div className="sett-section-title" style={{ marginTop: 24 }}>
                {lang === "ru" ? "РЕЗЕРВНОЕ КОПИРОВАНИЕ В ФАЙЛ JSON" : "FILE BACKUP (JSON)"}
              </div>

              <div
                className="sett-card"
                style={{
                  padding: "20px 24px",
                  borderRadius: "16px",
                  border: "1px solid var(--border)",
                  background: "var(--card-bg, #000000)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                }}
              >
                <div style={{ fontSize: 13, color: "var(--text3)", lineHeight: 1.5 }}>
                  {lang === "ru"
                    ? "Сохраняйте все ваши треки, плейлисты и историю прослушивания в один файл .json для переноса на другой компьютер или восстановления медиатеки."
                    : "Save all your tracks, playlists and history into a single .json file to migrate to another PC or restore library."}
                </div>

                <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    disabled={exportingBackup}
                    onClick={handleExportBackup}
                    style={{
                      padding: "10px 20px",
                      borderRadius: 10,
                      background: "var(--accent)",
                      color: "var(--accent-contrast-text)",
                      border: "none",
                      fontSize: 13.5,
                      fontWeight: 700,
                      cursor: exportingBackup ? "not-allowed" : "pointer",
                      opacity: exportingBackup ? 0.6 : 1,
                      transition: "all 0.15s ease",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="7 10 12 15 17 10" />
                      <line x1="12" y1="15" x2="12" y2="3" />
                    </svg>
                    <span>
                      {exportingBackup
                        ? (lang === "ru" ? "Экспорт в файл..." : "Exporting...")
                        : (lang === "ru" ? "Экспортировать в файл (JSON)" : "Export to File (JSON)")}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={importingBackup}
                    onClick={handlePickAndImportBackup}
                    style={{
                      padding: "10px 20px",
                      borderRadius: 10,
                      background: "var(--elev2, rgba(255, 255, 255, 0.08))",
                      border: "1px solid var(--border)",
                      color: "var(--text)",
                      fontSize: 13.5,
                      fontWeight: 600,
                      cursor: importingBackup ? "not-allowed" : "pointer",
                      opacity: importingBackup ? 0.6 : 1,
                      transition: "all 0.15s ease",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                    }}
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                      <polyline points="17 8 12 3 7 8" />
                      <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    <span>
                      {importingBackup
                        ? (lang === "ru" ? "Импорт из файла..." : "Importing...")
                        : (lang === "ru" ? "Импортировать из файла" : "Import from File")}
                    </span>
                  </button>
                </div>

                {lastExportPath ? (
                  <div
                    style={{
                      padding: "12px 14px",
                      borderRadius: 10,
                      background: "var(--elev, rgba(255, 255, 255, 0.03))",
                      border: "1px solid var(--border)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 12,
                      flexWrap: "wrap",
                      marginTop: 4,
                    }}
                  >
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 11, color: "var(--text3)", textTransform: "uppercase", fontWeight: 700 }}>
                        {lang === "ru" ? "Последний сохранённый файл:" : "Last exported file:"}
                      </div>
                      <div style={{ fontSize: 12.5, fontFamily: "monospace", color: "var(--text)", wordBreak: "break-all", marginTop: 2 }}>
                        {lastExportPath}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const dir = lastExportPath.replace(/[/\\][^/\\]+$/, "");
                        if (dir) void api.openPath(dir);
                      }}
                      style={{
                        padding: "6px 14px",
                        borderRadius: 8,
                        background: "var(--elev2, rgba(255, 255, 255, 0.08))",
                        border: "1px solid var(--border)",
                        color: "var(--text)",
                        fontSize: 12,
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
                    >
                      {lang === "ru" ? "Открыть папку с файлом" : "Open Folder"}
                    </button>
                  </div>
                ) : null}
              </div>

              {/* CARD 3: Cloud Sync */}
              <div className="sett-section-title" style={{ marginTop: 24 }}>
                {lang === "ru" ? "ОБЛАЧНАЯ СИНХРОНИЗАЦИЯ VESSEL" : "VESSEL CLOUD SYNC"}
              </div>

              <div
                className="sett-card"
                style={{
                  padding: "20px 24px",
                  borderRadius: "16px",
                  border: "1px solid var(--border)",
                  background: "var(--card-bg, #000000)",
                  display: "flex",
                  flexDirection: "column",
                  gap: 16,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: "var(--text)" }}>
                      {lang === "ru" ? "Облачный аккаунт Vessel" : "Vessel Cloud Account"}
                    </div>
                    <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
                      {state?.account_state?.kind === "authenticated"
                        ? (lang === "ru"
                            ? `Подключено как @${state.account_state.username.replace(/^@+/, "")}`
                            : `Connected as @${state.account_state.username.replace(/^@+/, "")}`)
                        : (lang === "ru"
                            ? "Войдите в аккаунт Vessel для автоматической синхронизации треков между всеми вашими ПК"
                            : "Log into Vessel account to sync tracks across all your devices")}
                    </div>
                  </div>
                </div>

                {state?.account_state?.kind === "authenticated" ? (
                  <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 4 }}>
                    <button
                      type="button"
                      disabled={cloudMigrating}
                      onClick={handleCloudUpload}
                      style={{
                        padding: "10px 20px",
                        borderRadius: 10,
                        background: "var(--accent)",
                        color: "var(--accent-contrast-text)",
                        border: "none",
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: cloudMigrating ? "not-allowed" : "pointer",
                        opacity: cloudMigrating ? 0.6 : 1,
                        transition: "all 0.15s ease",
                      }}
                    >
                      {cloudMigrating
                        ? (lang === "ru" ? "Выгрузка в облако..." : "Uploading...")
                        : (lang === "ru" ? "Выгрузить медиатеку в облако" : "Upload Library to Cloud")}
                    </button>

                    <button
                      type="button"
                      disabled={cloudDownloading}
                      onClick={handleCloudDownload}
                      style={{
                        padding: "10px 20px",
                        borderRadius: 10,
                        background: "var(--elev2, rgba(255, 255, 255, 0.08))",
                        border: "1px solid var(--border)",
                        color: "var(--text)",
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: cloudDownloading ? "not-allowed" : "pointer",
                        opacity: cloudDownloading ? 0.6 : 1,
                        transition: "all 0.15s ease",
                      }}
                    >
                      {cloudDownloading
                        ? (lang === "ru" ? "Скачивание..." : "Downloading...")
                        : (lang === "ru" ? "Скачать треки из облака в SQLite" : "Download Tracks from Cloud")}
                    </button>
                  </div>
                ) : (
                  <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap", marginTop: 4 }}>
                    <button
                      type="button"
                      onClick={() => {
                        onClose?.();
                        openAuthModal();
                      }}
                      style={{
                        padding: "9px 20px",
                        borderRadius: 9,
                        background: "var(--accent)",
                        color: "var(--accent-contrast-text)",
                        border: "none",
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: "pointer",
                      }}
                    >
                      {lang === "ru" ? "Войти / Регистрация в облаке" : "Sign In / Register"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: GENERAL */}
          {activeTab === "general" && (
            <div>
              <div className="sett-page-header">
                <h1 className="sett-page-title">Основные настройки</h1>
                <p className="sett-page-sub">Поведение приложения, язык и системные параметры</p>
              </div>

              <div className="sett-section-title">ЯЗЫК ИНТЕРФЕЙСА</div>
              <div className="sett-card">
                <div className="sett-card-info">
                  <div className="sett-card-title">Язык приложения</div>
                  <div className="sett-card-desc">Выберите основной язык интерфейса</div>
                </div>
                <div className="sett-segmented-group">
                  <button
                    type="button"
                    className={`sett-segmented-btn ${lang === "ru" ? "active" : ""}`}
                    onClick={() => void handleSetLanguage("ru")}
                  >
                    <span className="sett-segmented-btn-label" style={{ fontWeight: 600 }}>RU · Русский</span>
                  </button>
                  <button
                    type="button"
                    className={`sett-segmented-btn ${lang === "en" ? "active" : ""}`}
                    onClick={() => void handleSetLanguage("en")}
                  >
                    <span className="sett-segmented-btn-label" style={{ fontWeight: 600 }}>EN · English</span>
                  </button>
                </div>
              </div>

              <div className="sett-section-title">ПЛАТФОРМА</div>
              <div className="sett-card">
                <div className="sett-card-row" style={{ alignItems: "center" }}>
                  <div className="sett-card-info">
                    <div className="sett-card-title">Платформа</div>
                    <div className="sett-card-desc">Используется на главной странице для волны и рекомендаций</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <button
                      type="button"
                      onClick={handleToggleAllRec}
                      title="Все платформы"
                      style={{
                        background: "transparent",
                        border: "none",
                        color: allSelectedRec ? "#ffffff" : "rgba(255, 255, 255, 0.35)",
                        fontWeight: 800,
                        fontSize: 14,
                        padding: "0 8px",
                        cursor: "pointer",
                        transition: "color 0.15s ease",
                      }}
                    >
                      A
                    </button>
                    {UNIFIED_PLATFORMS.map((p) => {
                      const isSel = allSelectedRec || selectedRecProviders.includes(p.key);
                      return (
                        <button
                          key={p.key}
                          type="button"
                          onClick={() => handleToggleRecPlatform(p.key)}
                          title={p.label}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: "50%",
                            background: isSel ? "rgba(255, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.04)",
                            border: "none",
                            boxShadow: "none",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                        >
                          <PlatformIcon
                            kind={p.key as any}
                            size={18}
                            color={isSel ? p.color : "rgba(255, 255, 255, 0.25)"}
                            style={{ filter: isSel ? "none" : "grayscale(100%)", opacity: isSel ? 1 : 0.35 }}
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>



              <div className="sett-section-title">ПОВЕДЕНИЕ ПРИЛОЖЕНИЯ</div>
              <div className="sett-card">
                <div className="sett-card-row">
                  <div className="sett-card-info">
                    <div className="sett-card-title">Автозапуск приложения</div>
                    <div className="sett-card-desc">Автоматически запускать Vessel при входе в систему Windows</div>
                  </div>
                  <label className="sett-switch">
                    <input
                      type="checkbox"
                      checked={autostart}
                      onChange={(e) => toggleAutostart(e.target.checked)}
                    />
                    <span className="sett-slider" />
                  </label>
                </div>
              </div>

              <div className="sett-card">
                <div className="sett-card-row">
                  <div className="sett-card-info">
                    <div className="sett-card-title">Сворачивать в трей</div>
                    <div className="sett-card-desc">При закрытии окна сворачивать приложение в системный трей вместо завершения работы</div>
                  </div>
                  <label className="sett-switch">
                    <input
                      type="checkbox"
                      checked={minimizeToTray}
                      onChange={(e) => toggleMinimizeToTray(e.target.checked)}
                    />
                    <span className="sett-slider" />
                  </label>
                </div>
              </div>

              

              <div className="sett-card">
                <div className="sett-card-row">
                  <div className="sett-card-info">
                    <div className="sett-card-title">Восстановление очереди при запуске</div>
                    <div className="sett-card-desc">Запоминать список воспроизводимых треков и восстанавливать очередь при следующем запуске</div>
                  </div>
                  <label className="sett-switch">
                    <input
                      type="checkbox"
                      checked={restoreQueue}
                      onChange={(e) => toggleRestoreQueue(e.target.checked)}
                    />
                    <span className="sett-slider" />
                  </label>
                </div>
              </div>


              <div className="sett-section-title">ОПАСНАЯ ЗОНА</div>
              <div className="sett-card" style={{ borderColor: "rgba(239, 68, 68, 0.3)" }}>
                <div className="sett-card-row">
                  <div>
                    <div className="sett-card-title" style={{ color: "#ef4444" }}>Сброс приложения</div>
                    <div className="sett-card-desc">Сбросить пользовательские настройки или очистить все базы данных</div>
                  </div>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      type="button"
                      className="sett-token-action-btn"
                      onClick={() => setConfirm("settings")}
                    >
                      Сброс настроек
                    </button>
                    <button
                      type="button"
                      className="sett-token-action-btn"
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
              <div className="sett-page-header">
                <h1 className="sett-page-title">Настройки аудио</h1>
                <p className="sett-page-sub">Параметры воспроизведения, нормализация и локальный аудиокэш</p>
              </div>

              <div className="sett-section-title">ВЫВОД ЗВУКА</div>
              <div className="sett-card">
                <div className="sett-card-info">
                  <div className="sett-card-title">Устройство вывода звука</div>
                  <div className="sett-card-desc">Системное устройство воспроизведения по умолчанию</div>
                </div>
                <div style={{ marginTop: 12 }}>
                  <select
                    className="sett-token-input"
                    style={{ width: "100%", cursor: "pointer" }}
                    defaultValue="default"
                  >
                    <option value="default">По умолчанию (Системный динамик / Наушники)</option>
                    <option value="wasapi_exclusive">WASAPI (Эксклюзивный режим)</option>
                  </select>
                </div>
              </div>

              <div className="sett-section-title">ОБРАБОТКА ЗВУКА</div>
              <div className="sett-card">
                <div className="sett-card-row">
                  <div className="sett-card-info">
                    <div className="sett-card-title">Автопохожие треки (Бесконечное радио)</div>
                    <div className="sett-card-desc">Автоматически подбирать и проигрывать похожие треки, когда очередь воспроизведения подходит к концу</div>
                  </div>
                  <label className="sett-switch">
                    <input
                      type="checkbox"
                      checked={autoSimilar}
                      onChange={(e) => toggleAutoSimilar(e.target.checked)}
                    />
                    <span className="sett-slider" />
                  </label>
                </div>
              </div>

              <div className="sett-card">
                <div className="sett-card-row">
                  <div className="sett-card-info">
                    <div className="sett-card-title">Нормализация громкости (AGC)</div>
                    <div className="sett-card-desc">Автоматически выравнивать уровень громкости между тихими и громкими треками</div>
                  </div>
                  <label className="sett-switch">
                    <input
                      type="checkbox"
                      checked={audioAgc}
                      onChange={(e) => toggleAudioAgc(e.target.checked)}
                    />
                    <span className="sett-slider" />
                  </label>
                </div>
              </div>

              <div className="sett-card">
                <div className="sett-card-row">
                  <div className="sett-card-info">
                    <div className="sett-card-title">Автовоспроизведение последнего трека</div>
                    <div className="sett-card-desc">Продолжать воспроизведение последней песни сразу после старта программы</div>
                  </div>
                  <label className="sett-switch">
                    <input
                      type="checkbox"
                      checked={autoplayLast}
                      onChange={(e) => toggleAutoplayLast(e.target.checked)}
                    />
                    <span className="sett-slider" />
                  </label>
                </div>
              </div>

              <div className="sett-card">
                <div className="sett-card-row">
                  <div className="sett-card-info">
                    <div className="sett-card-title">Плавный переход между треками (Crossfade)</div>
                    <div className="sett-card-desc">Постепенно затухает текущий трек и плавно нарастает следующий</div>
                  </div>
                  <label className="sett-switch">
                    <input
                      type="checkbox"
                      checked={crossfadeEnabled}
                      onChange={(e) => toggleCrossfade(e.target.checked)}
                    />
                    <span className="sett-slider" />
                  </label>
                </div>
                {crossfadeEnabled && (
                  <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255, 255, 255, 0.05)" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <span className="sett-card-title">Длительность плавного перехода</span>
                      <span style={{ fontWeight: 700, color: "var(--accent)" }}>{crossfadeSec} сек</span>
                    </div>
                    <input
                      type="range"
                      min="1"
                      max="12"
                      step="1"
                      value={crossfadeSec}
                      onChange={(e) => changeCrossfadeSec(Number(e.target.value))}
                      style={{ width: "100%", accentColor: "var(--accent)" }}
                    />
                  </div>
                )}
              </div>

              <div className="sett-card">
                <div className="sett-card-row">
                  <div className="sett-card-info">
                    <div className="sett-card-title">Кэширование воспроизводимых треков</div>
                    <div className="sett-card-desc">Автоматически сохранять поток на диск во время прослушивания для экономии трафика</div>
                  </div>
                  <label className="sett-switch">
                    <input
                      type="checkbox"
                      checked={autoCache}
                      onChange={(e) => toggleAutoCache(e.target.checked)}
                    />
                    <span className="sett-slider" />
                  </label>
                </div>
              </div>

              <div className="sett-section-title">ДИРЕКТОРИИ ХРАНЕНИЯ</div>
              <div className="sett-card">
                <div className="sett-card-row">
                  <div className="sett-card-info">
                    <div className="sett-card-title">Папка для загрузок</div>
                    <div className="sett-card-desc" style={{ wordBreak: "break-all" }}>
                      {downloadDir || "По умолчанию (~/Music/Vessel)"}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="sett-token-action-btn"
                    onClick={() => setDirModal("download")}
                  >
                    Изменить
                  </button>
                </div>
              </div>

              <div className="sett-card">
                <div className="sett-card-row">
                  <div className="sett-card-info">
                    <div className="sett-card-title">Папка аудиокэша</div>
                    <div className="sett-card-desc" style={{ wordBreak: "break-all" }}>
                      {cacheDir || "По умолчанию (~/AppData/Local/Vessel/cache)"}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="sett-token-action-btn"
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
              <div className="sett-page-header">
                <h1 className="sett-page-title">Хранилище</h1>
                <p className="sett-page-sub">Контроль занимаемого дискового пространства и очистка временных данных</p>
              </div>

              <div className="sett-card">
                <div className="sett-storage-gauge-wrap">
                  <div className="sett-circular-gauge">
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
                    <div className="sett-gauge-inner">
                      <span className="sett-gauge-percent">367 MB</span>
                      <span className="sett-gauge-sub">Занято</span>
                    </div>
                  </div>

                  <div className="sett-storage-breakdown">
                    <div className="sett-storage-item">
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, color: "var(--text)" }}>
                          <IconAudio size={16} />
                          <span>Музыкальные треки</span>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>{storageTracksCount} аудиодорожек</div>
                      </div>
                      <div style={{ fontWeight: 700, color: "var(--text)" }}>{storageTracksSize}</div>
                    </div>

                    <div className="sett-storage-item">
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, color: "var(--text)" }}>
                          <IconBackground size={16} />
                          <span>Обложки альбомов</span>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>Изображения и миниатюры</div>
                      </div>
                      <div style={{ fontWeight: 700, color: "var(--text)" }}>{storageCoversSize}</div>
                    </div>

                    <div className="sett-storage-item">
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, color: "var(--text)" }}>
                          <IconFileText size={16} />
                          <span>Тексты песен и метаданные</span>
                        </div>
                        <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>Кэш синхронизированных текстов</div>
                      </div>
                      <div style={{ fontWeight: 700, color: "var(--text)" }}>{storageLyricsSize}</div>
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
                  <button
                    type="button"
                    className="sett-token-action-btn submit"
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
              <div className="sett-page-header">
                <h1 className="sett-page-title">Настройки плеера</h1>
                <p className="sett-page-sub">Расположение, стиль, оформление мини-плеера и очередь треков</p>
              </div>

              <div className="sett-section-title">ПОЛОЖЕНИЕ ПЛЕЕРА</div>
              <div className="sett-card">
                <div className="sett-card-row" style={{ alignItems: "center" }}>
                  <div className="sett-card-info">
                    <div className="sett-card-title">Положение панели плеера</div>
                    <div className="sett-card-desc">Выберите позицию плеера на экране</div>
                  </div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    {[
                      { id: "bottom", icon: <IconLayoutBottom size={16} />, label: "Снизу" },
                      { id: "top", icon: <IconLayoutTop size={16} />, label: "Сверху" },
                      { id: "left", icon: <IconLayoutLeft size={16} />, label: "Слева" },
                      { id: "right", icon: <IconLayoutRight size={16} />, label: "Справа" },
                    ].map((pos) => {
                      const isSel = (config.player?.position || "bottom") === pos.id;
                      return (
                        <button
                          key={pos.id}
                          type="button"
                          onClick={() => setPlayerPosition(pos.id as any)}
                          title={pos.label}
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: "50%",
                            border: isSel ? "none" : "1px solid var(--border2)",
                            background: isSel ? "var(--accent, #e11d48)" : "var(--elev, rgba(255,255,255,0.04))",
                            color: isSel ? "var(--accent-contrast-text, #fff)" : "var(--text3)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            cursor: "pointer",
                            transition: "all 0.15s ease",
                          }}
                        >
                          {pos.icon}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="sett-section-title">СТИЛЬ ПЛЕЕРА</div>
              <div className="sett-card">
                <div className="sett-card-info">
                  <div className="sett-card-title">Тип отображения</div>
                  <div className="sett-card-desc">Прикрепленная к краю панель или плавающий островок</div>
                </div>
                <div className="sett-segmented-group">
                  <button
                    type="button"
                    className={`sett-segmented-btn ${config.player?.style === "floating" || !config.player?.style ? "active" : ""}`}
                    onClick={() => setPlayerStyle("floating")}
                  >
                    <span className="sett-segmented-btn-icon"><IconSparkles size={15} /></span>
                    <span className="sett-segmented-btn-label">Плавающий остров</span>
                  </button>
                  <button
                    type="button"
                    className={`sett-segmented-btn ${config.player?.style === "dock" ? "active" : ""}`}
                    onClick={() => setPlayerStyle("dock")}
                  >
                    <span className="sett-segmented-btn-icon"><IconPlayer size={15} /></span>
                    <span className="sett-segmented-btn-label">Прикрепленный (Док)</span>
                  </button>
                </div>
              </div>

              <div className="sett-section-title">ОЧЕРЕДЬ ВОСПРОИЗВЕДЕНИЯ</div>
              <div className="sett-card">
                <div className="sett-card-info">
                  <div className="sett-card-title">Положение панели очереди</div>
                  <div className="sett-card-desc">Выберите, с какой стороны экрана выдвигается панель следующих треков</div>
                </div>
                <div className="sett-segmented-group">
                  <button
                    type="button"
                    className={`sett-segmented-btn ${config.player?.queuePosition === "bottom" ? "active" : ""}`}
                    onClick={() => setQueuePosition("bottom")}
                  >
                    <span className="sett-segmented-btn-icon"><IconLayoutBottom size={15} /></span>
                    <span className="sett-segmented-btn-label">Снизу</span>
                  </button>
                  <button
                    type="button"
                    className={`sett-segmented-btn ${config.player?.queuePosition === "left" ? "active" : ""}`}
                    onClick={() => setQueuePosition("left")}
                  >
                    <span className="sett-segmented-btn-icon"><IconLayoutLeft size={15} /></span>
                    <span className="sett-segmented-btn-label">Слева</span>
                  </button>
                  <button
                    type="button"
                    className={`sett-segmented-btn ${config.player?.queuePosition === "right" || !config.player?.queuePosition ? "active" : ""}`}
                    onClick={() => setQueuePosition("right")}
                  >
                    <span className="sett-segmented-btn-icon"><IconLayoutRight size={15} /></span>
                    <span className="sett-segmented-btn-label">Справа</span>
                  </button>
                </div>
              </div>

              <div className="sett-section-title">МИНИ-ПЛЕЕР</div>
              <div className="sett-card">
                <div className="sett-card-row">
                  <div className="sett-card-info">
                    <div className="sett-card-title">Отображать мини-плеер</div>
                    <div className="sett-card-desc">Показывать компактный виджет мини-плеера при сворачивании главного окна</div>
                  </div>
                  <label className="sett-switch">
                    <input
                      type="checkbox"
                      checked={config.player?.showMiniPlayer ?? true}
                      onChange={(e) => setShowMiniPlayer(e.target.checked)}
                    />
                    <span className="sett-slider" />
                  </label>
                </div>
              </div>

              <div className="sett-card">
                <div className="sett-card-info" style={{ marginBottom: 12 }}>
                  <div className="sett-card-title">Фон мини-плеера</div>
                  <div className="sett-card-desc">Выберите источник фона мини-плеера</div>
                </div>
                <div className="sett-segmented-group">
                  <button
                    type="button"
                    className={`sett-segmented-btn ${config.player?.miniPlayerBg === "theme" || !config.player?.miniPlayerBg ? "active" : ""}`}
                    onClick={() => setMiniPlayerBg("theme")}
                  >
                    <span className="sett-segmented-btn-icon"><IconInterface size={14} /></span>
                    <span className="sett-segmented-btn-label">Тема</span>
                  </button>
                  <button
                    type="button"
                    className={`sett-segmented-btn ${config.player?.miniPlayerBg === "artwork" ? "active" : ""}`}
                    onClick={() => setMiniPlayerBg("artwork")}
                  >
                    <span className="sett-segmented-btn-icon"><IconBackground size={14} /></span>
                    <span className="sett-segmented-btn-label">Обложка</span>
                  </button>
                  <button
                    type="button"
                    className={`sett-segmented-btn ${config.player?.miniPlayerBg === "dominant" ? "active" : ""}`}
                    onClick={() => setMiniPlayerBg("dominant")}
                  >
                    <span className="sett-segmented-btn-icon"><IconDisc size={14} /></span>
                    <span className="sett-segmented-btn-label">Цвет обложки</span>
                  </button>
                </div>
              </div>

              <div className="sett-card">
                <div className="sett-card-info" style={{ marginBottom: 12 }}>
                  <div className="sett-card-title">Форма мини-плеера</div>
                  <div className="sett-card-desc">Капсульная закруглённая форма или стандартный прямоугольник</div>
                </div>
                <div className="sett-segmented-group">
                  <button
                    type="button"
                    className={`sett-segmented-btn ${(config.player?.miniPlayerShape || "capsule") === "capsule" ? "active" : ""}`}
                    onClick={() => setMiniPlayerShape("capsule")}
                  >
                    <span className="sett-segmented-btn-icon"><IconShapeCapsule size={15} /></span>
                    <span className="sett-segmented-btn-label">Капсула</span>
                  </button>
                  <button
                    type="button"
                    className={`sett-segmented-btn ${(config.player?.miniPlayerShape || "capsule") === "default" ? "active" : ""}`}
                    onClick={() => setMiniPlayerShape("default")}
                  >
                    <span className="sett-segmented-btn-icon"><IconShapeRect size={15} /></span>
                    <span className="sett-segmented-btn-label">Стандартный</span>
                  </button>
                </div>
              </div>

              <div className="sett-card">
                <div className="sett-card-row">
                  <div className="sett-card-info">
                    <div className="sett-card-title">Крупные значки управления</div>
                    <div className="sett-card-desc">Увеличить размер кнопок Play, Next и Previous для удобного нажатия</div>
                  </div>
                  <label className="sett-switch">
                    <input
                      type="checkbox"
                      checked={config.player?.largeIcons ?? false}
                      onChange={(e) => setPlayerOptions({ largeIcons: e.target.checked })}
                    />
                    <span className="sett-slider" />
                  </label>
                </div>
              </div>

              <div className="sett-section-title">НАСТРОЙКИ БОЛЬШОГО (ПОЛНОЭКРАННОГО) ПЛЕЕРА</div>

              <div className="sett-card">
                <div className="sett-card-info">
                  <div className="sett-card-title">Положение текста песни (Lyrics)</div>
                  <div className="sett-card-desc">Расположение колонки караоке-текста в полноэкранном плеере</div>
                </div>
                <div className="sett-segmented-group">
                  <button
                    type="button"
                    className={`sett-segmented-btn ${config.player?.fullscreenLyricsPosition === "right" || !config.player?.fullscreenLyricsPosition ? "active" : ""}`}
                    onClick={() => setFullscreenLyricsPosition("right")}
                  >
                    <span className="sett-segmented-btn-icon"><IconLayoutRight size={14} /></span>
                    <span className="sett-segmented-btn-label">Справа</span>
                  </button>
                  <button
                    type="button"
                    className={`sett-segmented-btn ${config.player?.fullscreenLyricsPosition === "left" ? "active" : ""}`}
                    onClick={() => setFullscreenLyricsPosition("left")}
                  >
                    <span className="sett-segmented-btn-icon"><IconLayoutLeft size={14} /></span>
                    <span className="sett-segmented-btn-label">Слева</span>
                  </button>
                </div>
              </div>
            </div>
          )}
          {/* TAB: INTERFACE */}
          {activeTab === "interface" && (
            <div>
              <div className="sett-page-header">
                <h1 className="sett-page-title">Интерфейс</h1>
                <p className="sett-page-sub">Темы оформления, собственная палитра цветов, скругления, масштабирование и шрифт</p>
              </div>

              <div className="sett-section-title">ТЕМА</div>
              <div className="sett-card" style={{ marginBottom: 20, position: "relative", zIndex: customThemeOpen ? 1000 : 1 }}>
                <div style={{ marginBottom: 18 }}>
                  <div className="sett-card-title">Тема</div>
                  <div className="sett-card-desc">Выберите общее оформление приложения</div>
                </div>

                <div style={{ position: "relative" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10 }}>
                    {BUILTIN_THEMES.map((theme) => {
                      const isActive = config.theme?.accentColor === theme.accentColor && config.theme?.appBgColor === theme.appBgColor;
                      return (
                        <button
                          key={theme.id}
                          type="button"
                          onClick={() => applyPreset(theme)}
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: 10,
                            padding: "16px 8px 12px 8px",
                            borderRadius: 12,
                            background: isActive ? "var(--elev2, rgba(255, 255, 255, 0.08))" : "var(--elev, rgba(255, 255, 255, 0.03))",
                            border: isActive ? "1.5px solid var(--accent, #ffffff)" : "1px solid var(--border)",
                            cursor: "pointer",
                            position: "relative",
                            transition: "all 0.15s ease",
                          }}
                        >
                          {isActive && (
                            <span
                              style={{
                                position: "absolute",
                                top: 6,
                                right: 6,
                                width: 16,
                                height: 16,
                                borderRadius: "50%",
                                background: "#ffffff",
                                color: "#000000",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 10,
                                fontWeight: 900,
                              }}
                            >
                              ✓
                            </span>
                          )}
                          {/* Two overlapping circles */}
                          <div style={{ position: "relative", width: 34, height: 22, display: "flex", alignItems: "center" }}>
                            <div
                              style={{
                                width: 20,
                                height: 20,
                                borderRadius: "50%",
                                backgroundColor: theme.accentColor,
                                border: theme.accentColor === "#ffffff" ? "1px solid rgba(0,0,0,0.2)" : "none",
                                zIndex: 1,
                              }}
                            />
                            <div
                              style={{
                                width: 20,
                                height: 20,
                                borderRadius: "50%",
                                backgroundColor: theme.secondaryColor || theme.cardBgColor,
                                marginLeft: -6,
                                border: (theme.secondaryColor === "#000000" || theme.secondaryColor === "#ffffff") ? "1px solid rgba(255,255,255,0.2)" : "none",
                                zIndex: 2,
                              }}
                            />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: isActive ? 700 : 500, color: "var(--text)" }}>
                            {theme.name}
                          </span>
                        </button>
                      );
                    })}

                    {/* '+' button for custom theme popover */}
                    <button
                      type="button"
                      onClick={() => {
                        setCustomColors({
                          accentColor: config.theme?.accentColor || "#ffffff",
                          appBgColor: config.theme?.appBgColor || "#000000",
                          sidebarBgColor: config.theme?.sidebarBgColor || "#000000",
                          playerBgColor: config.theme?.playerBgColor || "#000000",
                          cardBgColor: config.theme?.cardBgColor || "#000000",
                          textColor: config.theme?.textColor || "#ffffff",
                          wallpaperData: null,
                          wallpaperBlur: 14,
                          wallpaperDim: 45,
                          glassMode: true,
                          glassOpacity: 0.72,
                        });
                        setCustomThemeOpen((prev) => !prev);
                      }}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 10,
                        padding: "16px 8px 12px 8px",
                        borderRadius: 12,
                        background: customThemeOpen ? "var(--elev2, rgba(255, 255, 255, 0.08))" : "var(--elev, rgba(255, 255, 255, 0.03))",
                        border: customThemeOpen ? "1.5px solid var(--accent)" : "1px dashed var(--border2)",
                        cursor: "pointer",
                        transition: "all 0.15s ease",
                      }}
                      title="Создать свой пресет"
                    >
                      <div style={{ width: 34, height: 22, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: customThemeOpen ? "var(--accent)" : "var(--text3)" }}>
                        +
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 500, color: customThemeOpen ? "var(--accent)" : "var(--text3)" }}>
                        Свой
                      </span>
                    </button>
                  </div>

                  {/* CUSTOM THEME POPOVER (MATCHING SCREENSHOT 5) */}
                  {customThemeOpen && (
                    <>
                      <div
                        style={{ position: "fixed", inset: 0, zIndex: 1001 }}
                        onClick={() => setCustomThemeOpen(false)}
                      />
                      <div
                        style={{
                          position: "absolute",
                          right: 0,
                          top: "calc(100% + 10px)",
                          width: 320,
                          background: "var(--card-bg, #000000)",
                          backdropFilter: "blur(28px) saturate(180%)",
                          WebkitBackdropFilter: "blur(28px) saturate(180%)",
                          border: "1px solid var(--border)",
                          borderRadius: 16,
                          boxShadow: "0 18px 48px rgba(0, 0, 0, 0.8), 0 0 1px rgba(255, 255, 255, 0.15)",
                          padding: "16px",
                          zIndex: 1002,
                          display: "flex",
                          flexDirection: "column",
                          gap: 12,
                        }}
                      >
                        {/* Top: Name Input + Wand Icon */}
                        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input
                            type="text"
                            value={customThemeName}
                            onChange={(e) => setCustomThemeName(e.target.value)}
                            placeholder="Название темы"
                            style={{
                              flex: 1,
                              height: 38,
                              borderRadius: 9999,
                              background: "var(--elev, rgba(255, 255, 255, 0.05))",
                              border: "1px solid var(--border)",
                              padding: "0 16px",
                              color: "var(--text, #ffffff)",
                              fontSize: 13.5,
                              outline: "none",
                            }}
                          />
                          <button
                            type="button"
                            onClick={randomizeCustomColors}
                            title="Случайная палитра"
                            style={{
                              width: 38,
                              height: 38,
                              borderRadius: "50%",
                              background: "var(--elev, rgba(255, 255, 255, 0.06))",
                              border: "1px solid var(--border)",
                              color: "var(--accent)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              cursor: "pointer",
                              transition: "all 0.15s ease",
                            }}
                          >
                            <IconSparkles size={16} />
                          </button>
                        </div>

                        {/* 6 Color Pickers in 2 Columns */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          {[
                            { key: "accentColor" as const, label: "Основной" },
                            { key: "textColor" as const, label: "Текст" },
                            { key: "appBgColor" as const, label: "Фон" },
                            { key: "sidebarBgColor" as const, label: "Панель" },
                            { key: "cardBgColor" as const, label: "Карточка" },
                            { key: "playerBgColor" as const, label: "Плеер" },
                          ].map((item) => {
                            const val = customColors[item.key] || "#ffffff";
                            return (
                              <label
                                key={item.key}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  padding: "7px 10px",
                                  borderRadius: 10,
                                  background: "var(--elev, rgba(255, 255, 255, 0.03))",
                                  border: "1px solid var(--border)",
                                  cursor: "pointer",
                                }}
                              >
                                <div
                                  style={{
                                    width: 22,
                                    height: 22,
                                    borderRadius: "50%",
                                    backgroundColor: val,
                                    border: "2px solid rgba(255, 255, 255, 0.3)",
                                    boxShadow: `0 0 6px ${val}40`,
                                    position: "relative",
                                    overflow: "hidden",
                                    flexShrink: 0,
                                  }}
                                >
                                  <input
                                    type="color"
                                    value={val}
                                    onChange={(e) => setCustomColors((prev: ThemeColors) => ({ ...prev, [item.key]: e.target.value }))}
                                    style={{
                                      position: "absolute",
                                      top: -10,
                                      left: -10,
                                      width: 44,
                                      height: 44,
                                      opacity: 0,
                                      cursor: "pointer",
                                    }}
                                  />
                                </div>
                                <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>
                                  {item.label}
                                </span>
                              </label>
                            );
                          })}
                        </div>

                        {/* Action buttons: Сохранить & Отмена */}
                        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                          <button
                            type="button"
                            onClick={handleSaveCustomTheme}
                            style={{
                              height: 38,
                              borderRadius: 9999,
                              background: "var(--accent, #ffffff)",
                              color: "var(--accent-contrast-text, #000000)",
                              border: "none",
                              fontSize: 13.5,
                              fontWeight: 700,
                              cursor: "pointer",
                              boxShadow: "0 2px 10px rgba(0, 0, 0, 0.25)",
                              transition: "opacity 0.15s ease",
                            }}
                          >
                            Сохранить
                          </button>
                          <button
                            type="button"
                            onClick={() => setCustomThemeOpen(false)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "var(--text3)",
                              fontSize: 12.5,
                              cursor: "pointer",
                              padding: "4px",
                            }}
                          >
                            Отмена
                          </button>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="sett-section-title">ПРОЗРАЧНОСТЬ</div>
              <div className="sett-card" style={{ marginBottom: 20 }}>
                {/* Row 1: Switch Прозрачность */}
                <div className="sett-card-row" style={{ paddingBottom: 14, borderBottom: "1px solid var(--border)" }}>
                  <div className="sett-card-info">
                    <div className="sett-card-title">Прозрачность</div>
                    <div className="sett-card-desc">Эффекты прозрачности и размытия окна</div>
                  </div>
                  <label className="sett-switch">
                    <input
                      type="checkbox"
                      checked={config.theme?.glassMode ?? true}
                      onChange={(e) => updateThemeDirectly({ glassMode: e.target.checked })}
                    />
                    <span className="sett-slider" />
                  </label>
                </div>

                {/* Row 2: Slider Прозрачность */}
                <div className="sett-slider-row" style={{ marginTop: 14 }}>
                  <div className="sett-card-info">
                    <div className="sett-card-title">Прозрачность</div>
                    <div className="sett-card-desc">Прозрачность фона окна</div>
                  </div>
                  <div className="sett-slider-control-wrap">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={config.theme?.windowOpacity ?? 66}
                      onChange={(e) => updateThemeDirectly({ windowOpacity: Number(e.target.value) })}
                      className="sett-range-input"
                    />
                    <span className="sett-slider-value">{config.theme?.windowOpacity ?? 66}%</span>
                  </div>
                </div>

                {/* Row 3: Slider Сила стекла */}
                <div className="sett-slider-row" style={{ marginTop: 14 }}>
                  <div className="sett-card-info">
                    <div className="sett-card-title">Сила стекла</div>
                    <div className="sett-card-desc">Интенсивность и выраженность акрилового слоя</div>
                  </div>
                  <div className="sett-slider-control-wrap">
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={config.theme?.glassForce ?? 5}
                      onChange={(e) => updateThemeDirectly({ glassForce: Number(e.target.value) })}
                      className="sett-range-input"
                    />
                    <span className="sett-slider-value">{config.theme?.glassForce ?? 5}%</span>
                  </div>
                </div>

                {/* Row 4: Slider Размытие стекла */}
                <div className="sett-slider-row" style={{ marginTop: 14 }}>
                  <div className="sett-card-info">
                    <div className="sett-card-title">Размытие стекла</div>
                    <div className="sett-card-desc">Радиус размытия заднего плана под окном</div>
                  </div>
                  <div className="sett-slider-control-wrap">
                    <input
                      type="range"
                      min="0"
                      max="40"
                      value={config.theme?.backdropBlur ?? 6}
                      onChange={(e) => updateThemeDirectly({ backdropBlur: Number(e.target.value) })}
                      className="sett-range-input"
                    />
                    <span className="sett-slider-value">{config.theme?.backdropBlur ?? 6}px</span>
                  </div>
                </div>
              </div>

              <div className="sett-section-title">СКРУГЛЕНИЕ УГЛОВ</div>
              <div className="sett-card">
                <div className="sett-segmented-group">
                  <button
                    type="button"
                    className={`sett-segmented-btn ${config.borderRadius === "sharp" ? "active" : ""}`}
                    onClick={() => setBorderRadius("sharp")}
                  >
                    <span className="sett-segmented-btn-icon"><IconCornerNone size={15} /></span>
                    <span className="sett-segmented-btn-label">Нет (0px)</span>
                  </button>
                  <button
                    type="button"
                    className={`sett-segmented-btn ${config.borderRadius === "small" ? "active" : ""}`}
                    onClick={() => setBorderRadius("small")}
                  >
                    <span className="sett-segmented-btn-icon"><IconCornerSmall size={15} /></span>
                    <span className="sett-segmented-btn-label">Маленькое</span>
                  </button>
                  <button
                    type="button"
                    className={`sett-segmented-btn ${config.borderRadius === "medium" ? "active" : ""}`}
                    onClick={() => setBorderRadius("medium")}
                  >
                    <span className="sett-segmented-btn-icon"><IconCornerMedium size={15} /></span>
                    <span className="sett-segmented-btn-label">Среднее</span>
                  </button>
                  <button
                    type="button"
                    className={`sett-segmented-btn ${config.borderRadius === "round" ? "active" : ""}`}
                    onClick={() => setBorderRadius("round")}
                  >
                    <span className="sett-segmented-btn-icon"><IconCornerRound size={15} /></span>
                    <span className="sett-segmented-btn-label">Большое</span>
                  </button>
                </div>
              </div>

              <div className="sett-section-title">МАСШТАБИРОВАНИЕ</div>

              {/* CARD 1: FULLSCREEN SCALE */}
              <div className="sett-card" style={{ marginBottom: 14 }}>
                <div className="sett-card-title" style={{ marginBottom: 12 }}>Полноэкранный</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 16 }}>
                  {["75", "90", "100", "110", "125"].map((sc) => {
                    const isSel = fullscreenScale === Number(sc);
                    return (
                      <button
                        key={sc}
                        type="button"
                        onClick={() => handleFullscreenScale(Number(sc))}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                          padding: "12px 6px",
                          borderRadius: 10,
                          border: isSel ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                          background: isSel ? "var(--elev2, rgba(255, 255, 255, 0.08))" : "var(--elev, rgba(255, 255, 255, 0.03))",
                          cursor: "pointer",
                        }}
                      >
                        <span style={{ color: isSel ? "var(--accent)" : "var(--text3)" }}><IconDevice size={16} /></span>
                        <span style={{ fontSize: 13, fontWeight: isSel ? 700 : 500, color: "var(--text)" }}>{sc}%</span>
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <input
                    type="range"
                    min="75"
                    max="150"
                    step="1"
                    value={fullscreenScale}
                    onChange={(e) => handleFullscreenScale(Number(e.target.value))}
                    style={{ flex: 1, accentColor: "var(--accent)" }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", minWidth: 40, textAlign: "right" }}>
                    {fullscreenScale}%
                  </span>
                </div>
              </div>

              {/* CARD 2: WINDOWED SCALE */}
              <div className="sett-card">
                <div className="sett-card-title" style={{ marginBottom: 12 }}>Оконный</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 16 }}>
                  {["75", "90", "100", "110", "125"].map((sc) => {
                    const isSel = windowedScale === Number(sc);
                    return (
                      <button
                        key={sc}
                        type="button"
                        onClick={() => handleWindowedScale(Number(sc))}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: 6,
                          padding: "12px 6px",
                          borderRadius: 10,
                          border: isSel ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                          background: isSel ? "var(--elev2, rgba(255, 255, 255, 0.08))" : "var(--elev, rgba(255, 255, 255, 0.03))",
                          cursor: "pointer",
                        }}
                      >
                        <span style={{ color: isSel ? "var(--accent)" : "var(--text3)" }}><IconDevice size={16} /></span>
                        <span style={{ fontSize: 13, fontWeight: isSel ? 700 : 500, color: "var(--text)" }}>{sc}%</span>
                      </button>
                    );
                  })}
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <input
                    type="range"
                    min="75"
                    max="150"
                    step="1"
                    value={windowedScale}
                    onChange={(e) => handleWindowedScale(Number(e.target.value))}
                    style={{ flex: 1, accentColor: "var(--accent)" }}
                  />
                  <span style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", minWidth: 40, textAlign: "right" }}>
                    {windowedScale}%
                  </span>
                </div>
              </div>

              <div className="sett-section-title">ШРИФТ ИНТЕРФЕЙСА</div>
              <div className="sett-presets-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
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
                      className={`sett-preset-card ${isSel ? "active" : ""}`}
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
              <div className="sett-page-header">
                <h1 className="sett-page-title">Настройки вкладок</h1>
                <p className="sett-page-sub">Положение, стиль и поведение навигационной панели приложения</p>
              </div>

              <div className="sett-section-title">ПОЗИЦИЯ ВКЛАДОК</div>
              <div className="sett-card">
                <div className="sett-card-row" style={{ alignItems: "center" }}>
                  <div className="sett-card-info">
                    <div className="sett-card-title">Позиция вкладок</div>
                    <div className="sett-card-desc">Выберите расположение панели вкладок</div>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    {[
                      { id: "top", icon: <IconLayoutTop size={16} />, label: "Сверху" },
                      { id: "bottom", icon: <IconLayoutBottom size={16} />, label: "Снизу" },
                      { id: "left", icon: <IconLayoutLeft size={16} />, label: "Слева" },
                      { id: "right", icon: <IconLayoutRight size={16} />, label: "Справа" },
                    ].map((pos) => {
                      const isSel = (config.sidebar?.position || "left") === pos.id;
                      return (
                        <button
                          key={pos.id}
                          type="button"
                          onClick={() => setSidebarPosition(pos.id as any)}
                          title={pos.label}
                          className={`sett-platform-pill ${isSel ? "active" : ""}`}
                        >
                          {pos.icon}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="sett-section-title">СТИЛЬ ВКЛАДОК</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 18 }}>
                {[
                  { id: "dock", title: "По умолчанию", desc: "Классическая панель", icon: <IconLayoutTop size={18} /> },
                  { id: "compact", title: "Компактный", desc: "Минимум места", icon: <IconDevice size={18} /> },
                  { id: "round", title: "Круглый", desc: "Круглые иконки", icon: <IconDisc size={18} /> },
                  { id: "island", title: "Плавающий", desc: "Парящий островок", icon: <IconShapeCapsule size={18} /> },
                ].map((st) => {
                  const isSel = (config.sidebar?.style || "dock") === st.id || (st.id === "island" && config.sidebar?.style === "floating");
                  return (
                    <div
                      key={st.id}
                      className={`sett-style-card ${isSel ? "active" : ""}`}
                      onClick={() => setSidebarStyle(st.id as any)}
                    >
                      <div className="sett-style-card-icon">{st.icon}</div>
                      <div style={{ flex: 1 }}>
                        <div className="sett-style-card-title">{st.title}</div>
                        <div className="sett-style-card-desc">{st.desc}</div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="sett-section-title">СКРЫТИЕ ЭЛЕМЕНТОВ</div>
              <div className="sett-card">
                <div className="sett-card-info" style={{ marginBottom: 12 }}>
                  <div className="sett-card-title">Скрытие элементов</div>
                  <div className="sett-card-desc">Автоскрытие неактивных панелей</div>
                </div>
                <div className="sett-segmented-group" style={{ marginTop: 0 }}>
                  <button
                    type="button"
                    className={`sett-segmented-btn ${!config.sidebar?.autoHide ? "active" : ""}`}
                    onClick={() => setSidebarAutoHide(false)}
                  >
                    <span className="sett-segmented-btn-icon">⃠</span>
                    <span className="sett-segmented-btn-label">Ничего</span>
                  </button>
                  <button
                    type="button"
                    className={`sett-segmented-btn ${config.sidebar?.autoHide ? "active" : ""}`}
                    onClick={() => setSidebarAutoHide(true)}
                  >
                    <span className="sett-segmented-btn-icon"><IconTabs size={14} /></span>
                    <span className="sett-segmented-btn-label">Вкладки</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB: BACKGROUND */}
          {activeTab === "background" && (
            <div>
              <div className="sett-page-header">
                <h1 className="sett-page-title">Фон и эффекты</h1>
                <p className="sett-page-sub">Кастомные обои (включая анимированные GIF), размытие и матовое стекло</p>
              </div>

              <div className="sett-section-title">ОКРУЖЕНИЕ ИНТЕРФЕЙСА (ЭМБИЕНТ-СВЕЧЕНИЕ)</div>
              <div className="sett-card">
                <div className="sett-card-info" style={{ marginBottom: 12 }}>
                  <div className="sett-card-title">Режим фонового рассеянного свечения</div>
                  <div className="sett-card-desc">
                    Выберите источник цветного эмбиент-свечения позади интерфейса
                  </div>
                </div>
                <div className="sett-segmented-group">
                  <button
                    type="button"
                    className={`sett-segmented-btn ${(config.theme?.ambientMode || "dynamic") === "dynamic" ? "active" : ""}`}
                    onClick={() => updateThemeDirectly({ ambientMode: "dynamic" })}
                  >
                    <span className="sett-segmented-btn-icon"><IconSparkles size={15} /></span>
                    <span className="sett-segmented-btn-label">Динамический (под обложку трека)</span>
                  </button>
                  <button
                    type="button"
                    className={`sett-segmented-btn ${config.theme?.ambientMode === "theme" ? "active" : ""}`}
                    onClick={() => updateThemeDirectly({ ambientMode: "theme" })}
                  >
                    <span className="sett-segmented-btn-icon"><IconCustomization size={15} /></span>
                    <span className="sett-segmented-btn-label">Статичный (акцент темы)</span>
                  </button>
                  <button
                    type="button"
                    className={`sett-segmented-btn ${config.theme?.ambientMode === "off" ? "active" : ""}`}
                    onClick={() => updateThemeDirectly({ ambientMode: "off" })}
                  >
                    <span className="sett-segmented-btn-icon"><IconSolid size={15} /></span>
                    <span className="sett-segmented-btn-label">Отключено (чистый фон)</span>
                  </button>
                </div>
              </div>

              <div className="sett-section-title">КАСТОМИЗАЦИЯ</div>
              <div style={{ fontSize: 13, color: "var(--text3)", marginTop: -8, marginBottom: 16 }}>
                Своя обложка, фон приложения и постоянная библиотека изображений.
              </div>

              {/* 2 Карточки: Обложка трека и Фон приложения */}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginBottom: 16 }}>
                {/* Карточка 1. Обложка трека */}
                <div className="sett-card" style={{ display: "flex", gap: 14, alignItems: "center" }}>
                  <div style={{ width: 72, height: 72, minWidth: 72, minHeight: 72, borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)", background: "var(--elev)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {customTrackArt ? (
                      <img
                        src={customTrackArt}
                        alt="Обложка трека"
                        style={{ width: 72, height: 72, objectFit: "cover" }}
                      />
                    ) : (
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="10" r="10" />
                        <circle cx="12" cy="12" r="3" />
                      </svg>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text)", marginBottom: 2 }}>Обложка трека</div>
                    <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 8 }}>Только для текущего трека в плеере.</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="sett-token-action-btn submit"
                        style={{ padding: "5px 10px", fontSize: 12 }}
                        onClick={() => setPickerTarget("trackArt")}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                            <circle cx="8.5" cy="8.5" r="1.5"/>
                            <polyline points="21 15 16 10 5 21"/>
                          </svg>
                          <span>Выбрать из библиотеки</span>
                        </span>
                      </button>
                      {customTrackArt && (
                        <button
                          type="button"
                          className="sett-token-action-btn"
                          style={{ padding: "5px 10px", fontSize: 12 }}
                          onClick={() => {
                            setCustomTrackArt(null);
                            showToast("Обложка сброшена к оригиналу");
                          }}
                        >
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                            <span>Сброс</span>
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Карточка 2. Фон приложения */}
                <div className="sett-card" style={{ display: "flex", gap: 14, alignItems: "center" }}>
                  <div style={{ width: 72, height: 72, minWidth: 72, minHeight: 72, borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)", background: "var(--elev)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    {config.theme?.wallpaperData ? (
                      <img
                        src={config.theme.wallpaperData}
                        alt="Фон приложения"
                        style={{ width: 72, height: 72, objectFit: "cover" }}
                      />
                    ) : (
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <rect x="3" y="3" width="18" height="18" rx="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                    )}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text)", marginBottom: 2 }}>Фон приложения</div>
                    <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 8 }}>Картинка под интерфейсными слоями.</div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="sett-token-action-btn submit"
                        style={{ padding: "5px 10px", fontSize: 12 }}
                        onClick={() => setPickerTarget("wallpaper")}
                      >
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                            <circle cx="8.5" cy="8.5" r="1.5"/>
                            <polyline points="21 15 16 10 5 21"/>
                          </svg>
                          <span>Выбрать из библиотеки</span>
                        </span>
                      </button>
                      {config.theme?.wallpaperData && (
                        <button
                          type="button"
                          className="sett-token-action-btn"
                          style={{ padding: "5px 10px", fontSize: 12 }}
                          onClick={() => {
                            setWallpaperData(null);
                            showToast("Фон сброшен");
                          }}
                        >
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <polyline points="3 6 5 6 21 6"/>
                              <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                            </svg>
                            <span>Сброс</span>
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Карточка на всю ширину: Библиотека изображений */}
              <div className="sett-card" style={{ marginBottom: 20 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div className="sett-card-title" style={{ fontSize: 15, fontWeight: 700 }}>Библиотека изображений</div>
                    <span style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "2px 8px",
                      borderRadius: 12,
                      background: "var(--elev)",
                      color: "var(--accent)",
                      border: "1px solid var(--border)",
                    }}>
                      {imageLibrary.length}
                    </span>
                  </div>
                </div>
                <div className="sett-card-desc" style={{ marginBottom: 16 }}>
                  URL, картинки и GIF с ПК остаются здесь для быстрого выбора.
                </div>

                {/* Панель добавления URL и Загрузки */}
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 16 }}>
                  <input
                    type="text"
                    value={libraryUrlInput}
                    onChange={(e) => setLibraryUrlInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        const trimmed = libraryUrlInput.trim();
                        if (!trimmed) {
                          showToast("Введите URL картинки или GIF", true);
                          return;
                        }
                        if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://") && !trimmed.startsWith("data:")) {
                          showToast("URL должен начинаться с http://, https:// или data:", true);
                          return;
                        }
                        let name = "Изображение";
                        try {
                          const urlObj = new URL(trimmed);
                          const pathPart = urlObj.pathname.split("/").pop();
                          if (pathPart) name = decodeURIComponent(pathPart);
                        } catch {
                          name = trimmed.substring(0, 24);
                        }
                        addToImageLibrary({ url: trimmed, name });
                        setLibraryUrlInput("");
                        showToast("Изображение добавлено в библиотеку");
                      }
                    }}
                    placeholder="URL картинки или GIF"
                    className="sett-token-input"
                    style={{ flex: 1, minWidth: 200 }}
                  />
                  <button
                    type="button"
                    className="sett-token-action-btn submit"
                    onClick={() => {
                      const trimmed = libraryUrlInput.trim();
                      if (!trimmed) {
                        showToast("Введите URL картинки или GIF", true);
                        return;
                      }
                      if (!trimmed.startsWith("http://") && !trimmed.startsWith("https://") && !trimmed.startsWith("data:")) {
                        showToast("URL должен начинаться с http://, https:// или data:", true);
                        return;
                      }
                      let name = "Изображение";
                      try {
                        const urlObj = new URL(trimmed);
                        const pathPart = urlObj.pathname.split("/").pop();
                        if (pathPart) name = decodeURIComponent(pathPart);
                      } catch {
                        name = trimmed.substring(0, 24);
                      }
                      addToImageLibrary({ url: trimmed, name });
                      setLibraryUrlInput("");
                      showToast("Изображение добавлено в библиотеку");
                    }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                      </svg>
                      <span>Добавить URL</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="sett-token-action-btn"
                    onClick={async () => {
                      try {
                        const file = await api.pickFile(["jpg", "jpeg", "png", "webp", "gif"]);
                        if (file) {
                          const dataUrl = await api.loadImageAsDataUrl(file);
                          const name = file.split(/[\/\\]/).pop() || "Картинка";
                          addToImageLibrary({ url: dataUrl, name });
                          showToast("Изображение сохранено в библиотеку!");
                        }
                      } catch (e) {
                        showToast(String(e), true);
                      }
                    }}
                  >
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="17 8 12 3 7 8"/>
                        <line x1="12" y1="3" x2="12" y2="15"/>
                      </svg>
                      <span>Загрузить</span>
                    </span>
                  </button>
                </div>

                {/* Сетка элементов библиотеки */}
                {imageLibrary.length === 0 ? (
                  <div style={{
                    padding: "32px 16px",
                    textAlign: "center",
                    borderRadius: 10,
                    border: "1px dashed var(--border)",
                    color: "var(--text3)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 10,
                  }}>
                    <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                      <circle cx="8.5" cy="8.5" r="1.5"/>
                      <polyline points="21 15 16 10 5 21"/>
                    </svg>
                    <div style={{ fontSize: 13 }}>В библиотеке пока нет изображений. Вставьте ссылку или загрузите файл с компьютера.</div>
                  </div>
                ) : (
                  <div style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                    gap: 12,
                  }}>
                    {imageLibrary.map((item) => {
                      const isMenuOpen = activeImageMenuId === item.id;
                      return (
                        <div
                          key={item.id}
                          style={{
                            borderRadius: 10,
                            overflow: "hidden",
                            border: isMenuOpen ? "1px solid var(--accent)" : "1px solid var(--border)",
                            background: "var(--elev)",
                            position: "relative",
                            display: "flex",
                            flexDirection: "column",
                            transition: "border-color 0.15s ease",
                          }}
                        >
                          <div
                            style={{ height: 96, position: "relative", cursor: "pointer", overflow: "hidden" }}
                            onClick={() => setActiveImageMenuId(isMenuOpen ? null : item.id)}
                            title="Нажмите для действий"
                          >
                            <img
                              src={item.url}
                              alt={item.name}
                              style={{ width: "100%", height: "100%", objectFit: "cover" }}
                            />
                            {/* Кнопка удаления */}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                removeFromImageLibrary(item.id);
                                showToast("Изображение удалено из библиотеки");
                              }}
                              style={{
                                position: "absolute",
                                top: 6,
                                right: 6,
                                width: 24,
                                height: 24,
                                borderRadius: 6,
                                background: "rgba(0, 0, 0, 0.7)",
                                color: "#ffffff",
                                border: "none",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                cursor: "pointer",
                                transition: "background 0.15s ease",
                              }}
                              title="Удалить из библиотеки"
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                              </svg>
                            </button>
                          </div>

                          <div style={{ padding: "6px 8px", fontSize: 11, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={item.name}>
                            {item.name}
                          </div>

                          {/* Аккуратное выпадающее меню действий */}
                          {isMenuOpen && (
                            <div style={{
                              padding: "6px 8px 8px",
                              display: "flex",
                              flexDirection: "column",
                              gap: 6,
                              borderTop: "1px solid var(--border)",
                              background: "var(--card-bg)",
                            }}>
                              <button
                                type="button"
                                className="sett-token-action-btn submit"
                                style={{ width: "100%", padding: "4px 6px", fontSize: 11, textAlign: "center" }}
                                onClick={() => {
                                  setCustomTrackArt(item.url);
                                  setActiveImageMenuId(null);
                                  showToast("Обложка трека обновлена!");
                                }}
                              >
                                Как обложку
                              </button>
                              <button
                                type="button"
                                className="sett-token-action-btn"
                                style={{ width: "100%", padding: "4px 6px", fontSize: 11, textAlign: "center" }}
                                onClick={() => {
                                  setWallpaperData(item.url);
                                  setActiveImageMenuId(null);
                                  showToast("Фон приложения обновлен!");
                                }}
                              >
                                Как фон
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="sett-section-title">ЗАТЕМНЕНИЕ И РАЗМЫТИЕ ОБОЕВ</div>
              <div className="sett-card">
                <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span className="sett-card-title">Затемнение подложки</span>
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
                      <span className="sett-card-title">Размытие фона (Blur)</span>
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



                            <div className="sett-section-title">СТИЛЬ И ПЛОТНОСТЬ СТРОК ТРЕКОВ</div>

              {/* CARD 1: Normal Inactive Track Row */}
              <div className="sett-card">
                <div className="sett-card-info" style={{ marginBottom: 12 }}>
                  <div className="sett-card-title">Подложка обычной (неактивной) строки</div>
                  <div className="sett-card-desc">
                    Регулировка фона под всеми строками треков для идеальной читаемости на ярких или детальных обоях (0% — полностью прозрачно)
                  </div>
                </div>

                {/* Normal Track Row Preview */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    height: 52,
                    padding: "0 16px",
                    borderRadius: 8,
                    background: (config.theme?.trackRowOpacity ?? 0) > 0
                      ? hexToRgba(config.theme?.cardBgColor || "#000000", (config.theme?.trackRowOpacity ?? 0) * 0.95)
                      : "transparent",
                    border: (config.theme?.trackRowOpacity ?? 0) > 0
                      ? `1px solid rgba(255, 255, 255, ${(config.theme?.trackRowOpacity ?? 0) * 0.08})`
                      : "1px solid transparent",
                    backdropFilter: (config.theme?.trackRowOpacity ?? 0) > 0 ? "blur(12px)" : "none",
                    WebkitBackdropFilter: (config.theme?.trackRowOpacity ?? 0) > 0 ? "blur(12px)" : "none",
                    boxShadow: (config.theme?.trackRowOpacity ?? 0) > 0.1 ? "0 4px 16px rgba(0,0,0,0.2)" : "none",
                    transition: "all 0.15s ease",
                    marginBottom: 16,
                  }}
                >
                  <span style={{ width: 20, fontSize: 13, color: "var(--text3)", fontVariantNumeric: "tabular-nums" }}>
                    1
                  </span>
                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: 6,
                    background: "rgba(255, 255, 255, 0.06)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    color: "var(--text3)",
                    flexShrink: 0,
                  }}>
                    <IconDisc size={18} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      FE!N (feat. Playboi Carti)
                    </div>
                    <div style={{ fontSize: 11.5, color: "var(--text3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                      Travis Scott — Обычная строка трека
                    </div>
                  </div>
                  <span style={{ fontSize: 11.5, color: "var(--text3)", fontVariantNumeric: "tabular-nums" }}>
                    3:11
                  </span>
                </div>

                {/* Slider directly below normal preview */}
                <div style={{ paddingTop: 10, borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                    <span className="sett-card-title">Плотность фона обычной строки</span>
                    <span style={{ fontWeight: 700, color: "var(--accent)", minWidth: 36, textAlign: "right" }}>
                        {Math.round((config.theme?.trackRowOpacity ?? 0) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    value={Math.round((config.theme?.trackRowOpacity ?? 0) * 100)}
                    onChange={(e) => updateThemeDirectly({ trackRowOpacity: Number(e.target.value) / 100 })}
                    className="sett-range-input sett-slider-input"
                    style={{ width: "100%", accentColor: "var(--accent)" }}
                  />
                </div>
              </div>

              {/* CARD 2: Active Playing Track Row */}
              <div className="sett-card">
                <div className="sett-card-info" style={{ marginBottom: 12 }}>
                  <div className="sett-card-title">Подложка активного (играющего) трека</div>
                  <div className="sett-card-desc">
                    Настройка стиля и плотности выделения текущего играющего трека во всех списках и плеере
                  </div>
                </div>

                {/* Active Playing Track Row Preview */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    height: 52,
                    padding: "0 16px",
                    borderRadius: 8,
                    background: "var(--trow-now-bg, rgba(255, 255, 255, 0.08))",
                    border: "1px solid var(--trow-now-border, transparent)",
                    transition: "all 0.15s ease",
                    marginBottom: 16,
                  }}
                >
                  <span style={{
                    width: 20,
                    fontSize: 12,
                    color: (config.theme?.trackRowActiveStyle || "glass") === "accent" ? "var(--accent)" : "#ffffff",
                  }}>
                    ▶
                  </span>
                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: 6,
                    background: "rgba(255, 255, 255, 0.12)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    color: "#fff",
                    flexShrink: 0,
                    fontWeight: 700,
                  }}>
                    <IconPlay size={18} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13,
                      fontWeight: 600,
                      color: (config.theme?.trackRowActiveStyle || "glass") === "accent" ? "var(--accent)" : "#ffffff",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}>
                      POP OUT
                    </div>
                    <div style={{
                      fontSize: 11.5,
                      color: "rgba(255, 255, 255, 0.65)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}>
                      Playboi Carti — Активная играющая строка
                    </div>
                  </div>
                  <span style={{
                    fontSize: 11.5,
                    color: "rgba(255, 255, 255, 0.6)",
                    fontVariantNumeric: "tabular-nums",
                  }}>
                    2:42
                  </span>
                </div>

                {/* Style selector & density directly below active preview */}
                <div style={{ paddingTop: 10, borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}>
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
                      Стиль подложки
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                      {[
                        {
                          id: "glass",
                          label: "Прозрачное стекло",
                          desc: "Мягкое полупрозрачное дымчатое стекло без рамки",
                        },
                        {
                          id: "accent",
                          label: "Цвет темы",
                          desc: "Тонирование цветом выбранного акцента темы",
                        },
                        {
                          id: "dark",
                          label: "Тёмный контраст",
                          desc: "Глубокая тёмная плашка под текст без рамки",
                        },
                      ].map((opt) => {
                        const isSelected = (config.theme?.trackRowActiveStyle || "glass") === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => updateThemeDirectly({ trackRowActiveStyle: opt.id as any })}
                            style={{
                              display: "flex",
                              flexDirection: "column",
                              alignItems: "flex-start",
                              gap: 4,
                              padding: "10px 12px",
                              borderRadius: 8,
                              border: isSelected
                                ? "1.5px solid var(--accent, #6366f1)"
                                : "1px solid rgba(255, 255, 255, 0.08)",
                              background: isSelected
                                ? "rgba(255, 255, 255, 0.08)"
                                : "rgba(255, 255, 255, 0.025)",
                              cursor: "pointer",
                              textAlign: "left",
                              transition: "all 0.15s ease",
                              position: "relative",
                            }}
                          >
                            <span style={{ fontSize: 13, fontWeight: isSelected ? 700 : 500, color: isSelected ? "var(--accent)" : "var(--text)" }}>
                              {opt.label}
                            </span>
                            <span style={{ fontSize: 11, color: "var(--text3)", lineHeight: 1.25 }}>
                              {opt.desc}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                      <span className="sett-card-title">Плотность активной плашки</span>
                      <span style={{ fontWeight: 700, color: "var(--accent)", minWidth: 36, textAlign: "right" }}>
                          {Math.round((config.theme?.trackRowActiveOpacity ?? 0.08) * 100)}%
                      </span>
                    </div>
                    <input
                      type="range"
                      min="0"
                      max="100"
                      value={Math.round((config.theme?.trackRowActiveOpacity ?? 0.08) * 100)}
                      onChange={(e) => updateThemeDirectly({ trackRowActiveOpacity: Number(e.target.value) / 100 })}
                      className="sett-range-input sett-slider-input"
                      style={{ width: "100%", accentColor: "var(--accent)" }}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: CUSTOMIZATION & PRESETS */}
          {activeTab === "customization" && (
            <div>
              <div className="sett-page-header">
                <h1 className="sett-page-title">Кастомизация</h1>
                <p className="sett-page-sub">Пресеты оформления и внешний вид приложения</p>
              </div>

              <div className="sett-section-title">ПОЛЬЗОВАТЕЛЬСКИЕ ПРЕСЕТЫ</div>
              <div className="sett-presets-grid">
                {userPresets.map((preset, slotIdx) => {
                  if (!preset) {
                    return (
                      <div
                        key={`empty-slot-${slotIdx}`}
                        className="sett-preset-card"
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

          {/* TAB: WORKSHOP */}
          {activeTab === "workshop" && (
            <div>
              <div className="sett-page-header">
                <h1 className="sett-page-title">Мастерская тем и плагинов</h1>
                <p className="sett-page-sub">Каталог стилей оформления, кастомных шейдеров и расширений от сообщества</p>
              </div>

              <div className="sett-card" style={{ textAlign: "center", padding: "40px 20px" }}>
                <div style={{
                  width: 54,
                  height: 54,
                  borderRadius: "50%",
                  background: "rgba(255, 255, 255, 0.05)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  color: "var(--accent)",
                  marginBottom: 16
                }}>
                  <IconSparkles size={28} />
                </div>
                <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>
                  Каталог Мастерской скоро появится
                </div>
                <div style={{ fontSize: 13, color: "var(--text3)", maxWidth: 440, margin: "0 auto", lineHeight: 1.5 }}>
                  Здесь можно будет в один клик устанавливать темы оформления, анимации для обложек и кастомные расширения пользователей Vessel.
                </div>
              </div>
            </div>
          )}

          {activeTab.startsWith("service_") && (() => {
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

            return (
              <div>
                <div className="sett-page-header">
                  <h1 className="sett-page-title" style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <PlatformIcon kind={serviceKey as any} size={28} />
                    <span>{providerStatus?.label || (isYt ? "YouTube Music" : serviceKey)}</span>
                  </h1>
                  <p className="sett-page-sub">Настройка авторизации и роутинга сетевых запросов</p>
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
                          {isYt ? "Сервис активен" : isConnected ? "Сервис настроен" : "Требуется авторизация"}
                        </div>
                        <div style={{ fontSize: 13, color: "var(--text2)", marginTop: 2 }}>
                          {isYt
                            ? "Авторизация не требуется — сервис работает публично"
                            : isConnected
                            ? "Готов к использованию"
                            : "Введите токен или войдите через браузер"}
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
                          {isYt ? "YouTube Music (Публичный доступ)" : isConnected ? `${providerStatus?.label} Аккаунт` : "Не авторизован"}
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

                      <div className="sett-token-input-row">
                        <input
                          type="password"
                          className="sett-token-input"
                          placeholder={isYt ? "Опционально: cookies браузера..." : "Вставьте токен или cookie..."}
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
                            showToast("Окно авторизации открыто. Выполните вход в браузере.");
                          } catch (e) {
                            showToast(String(e), true);
                          }
                        }}
                      >
                        Войти через браузер
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
                        Отключить сервис
                      </button>
                    )}

                    {serviceKey === "spotify" && (
                      <SpotifyPlaybackSourceSection />
                    )}
                  </div>

                  {/* Right Column: Execution Mode & Capabilities */}
                  <div className="sett-service-card">
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <span className="sett-section-title" style={{ margin: 0 }}>РЕЖИМ ВЫПОЛНЕНИЯ</span>
                      <div
                        className={`sett-route-pill ${route !== "local" ? "server" : ""}`}
                        onClick={() => toggleRoute(serviceKey)}
                        title="Нажмите для переключения Локально / Сервер"
                        style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                      >
                        {route === "local" ? (
                          <>
                            <IconDevice size={14} />
                            <span>Локально</span>
                          </>
                        ) : (
                          <>
                            <IconServer size={14} />
                            <span>Сервер</span>
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
          })()}

          
          {/* TAB: PROXY */}
          {activeTab === "proxy" && (
            <div>
              <div className="sett-page-header">
                <h1 className="sett-page-title">Прокси-сервер</h1>
                <p className="sett-page-sub">Настройка сетевого проксирования для обхода блокировок сервисов</p>
              </div>

              <div className="sett-card">
                <div className="sett-card-info">
                  <div className="sett-card-title">HTTP / SOCKS5 Прокси</div>
                  <div className="sett-card-desc">
                    Применяется для сетевых запросов Spotify, SoundCloud и других заблокированных платформ
                  </div>
                </div>

                <div style={{ marginTop: 16 }}>
                  <input
                    type="text"
                    className="sett-token-input"
                    placeholder="http://user:pass@host:port или socks5://..."
                    value={spotifyProxy}
                    onChange={(e) => setSpotifyProxy(e.target.value)}
                    style={{ width: "100%", marginBottom: 12 }}
                  />
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
                    <button
                      type="button"
                      className="sett-token-action-btn submit"
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

          {/* TAB: DISCORD RPC */}
          {activeTab === "discord" && (
            <div>
              <div className="sett-page-header">
                <h1 className="sett-page-title">Discord Rich Presence</h1>
                <p className="sett-page-sub">Трансляция текущего трека в статус профиля Discord</p>
              </div>

              <div className="sett-card">
                <div className="sett-card-row">
                  <div className="sett-card-info">
                    <div className="sett-card-title">Включить Discord RPC</div>
                    <div className="sett-card-desc">
                      Показывать обложку, название трека, исполнителя и таймлайн в Discord
                    </div>
                  </div>
                  <label className="sett-switch">
                    <input
                      type="checkbox"
                      checked={discordRpc}
                      onChange={(e) => handleDiscordRpcToggle(e.target.checked)}
                    />
                    <span className="sett-slider" />
                  </label>
                </div>
              </div>

              {discordRpc && (
                <div className="sett-card">
                  <div className="sett-section-title" style={{ marginTop: 0 }}>ПРЕДПРОСМОТР КАРТОЧКИ В DISCORD</div>
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
          </div>
        </div>
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
              resetToDefaults();
              localStorage.removeItem("vessel_scale_fullscreen");
              localStorage.removeItem("vessel_scale_windowed");
              setFullscreenScale(100);
              setWindowedScale(100);
              document.documentElement.style.setProperty("--ui-scale", "1");
              localStorage.removeItem("vessel_font");
              setSelectedFont("Inter");
              document.documentElement.style.setProperty("--custom-font", "Inter");
              showToast("Настройки и интерфейс сброшены к значениям по умолчанию");
            } else {
              await api.resetData();
              resetToDefaults();
              localStorage.removeItem("vessel_scale_fullscreen");
              localStorage.removeItem("vessel_scale_windowed");
              setFullscreenScale(100);
              setWindowedScale(100);
              document.documentElement.style.setProperty("--ui-scale", "1");
              localStorage.removeItem("vessel_font");
              setSelectedFont("Inter");
              document.documentElement.style.setProperty("--custom-font", "Inter");
              showToast("Все данные и настройки очищены");
            }
            await refresh();
            setConfirm(null);
          }}
          onClose={() => setConfirm(null)}
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

      {/* Модальное окно выбора из библиотеки */}
      {pickerTarget !== null && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0, 0, 0, 0.75)",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 20,
          }}
          onClick={() => setPickerTarget(null)}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 520,
              maxHeight: "80vh",
              background: "var(--card-bg)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              padding: 20,
              display: "flex",
              flexDirection: "column",
              boxShadow: "0 24px 64px rgba(0, 0, 0, 0.8)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)" }}>
                {pickerTarget === "trackArt" ? "Выбрать обложку трека" : "Выбрать фон приложения"}
              </div>
              <button
                type="button"
                onClick={() => setPickerTarget(null)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text3)",
                  cursor: "pointer",
                  padding: 4,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", minHeight: 180, marginBottom: 16 }}>
              {imageLibrary.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--text3)", padding: "40px 10px", fontSize: 13 }}>
                  В библиотеке пока нет сохранённых картинок. Сначала добавьте их в блоке «Библиотека изображений».
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10 }}>
                  {imageLibrary.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => {
                        if (pickerTarget === "trackArt") {
                          setCustomTrackArt(item.url);
                          showToast("Обложка трека установлена!");
                        } else {
                          setWallpaperData(item.url);
                          showToast("Фон приложения установлен!");
                        }
                        setPickerTarget(null);
                      }}
                      style={{
                        borderRadius: 8,
                        overflow: "hidden",
                        border: "1px solid var(--border)",
                        background: "var(--elev)",
                        cursor: "pointer",
                        transition: "transform 0.15s ease, border-color 0.15s ease",
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.borderColor = "var(--accent)";
                        e.currentTarget.style.transform = "scale(1.02)";
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.borderColor = "var(--border)";
                        e.currentTarget.style.transform = "scale(1)";
                      }}
                    >
                      <div style={{ height: 80, overflow: "hidden" }}>
                        <img src={item.url} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                      </div>
                      <div style={{ padding: "4px 6px", fontSize: 11, color: "var(--text)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                        {item.name}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                className="sett-token-action-btn"
                onClick={() => setPickerTarget(null)}
              >
                Закрыть
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
