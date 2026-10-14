import * as api from "../../api/commands";

export type SettingsCategory = "profile" | "general" | "interface" | "services" | "integrations";

export type SettingsTab =
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

export type ConfirmTarget = "settings" | "data" | null;
export type DirTarget = "download" | "cache" | null;

export const SERVICE_META: Record<string, { key: string; hint: string; bg: string; brandColor: string }> = {
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

export type BrowserLoginKind = "spotify" | "soundcloud" | "deezer";

export const BROWSER_LOGIN: Record<
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

export const UNIFIED_PLATFORMS = [
  { key: "youtube_music", label: "YouTube Music", color: "#FF0000" },
  { key: "soundcloud", label: "SoundCloud", color: "#FF5500" },
  { key: "spotify", label: "Spotify", color: "#1ED760" },
  { key: "yandex", label: "Yandex Music", color: "#FFCC00" },
  { key: "deezer", label: "Deezer", color: "#A238FF" },
];
