import * as api from "../../api/commands";

export type SettingsGroup = "player" | "interface" | "integrations" | "app";

export type SettingsTab =
  | "playback"
  | "appearance"
  | "player"
  | "tabs"
  | "service_youtube_music"
  | "service_soundcloud"
  | "service_deezer"
  | "service_yandex"
  | "service_spotify"
  | "discord"
  | "storage"
  | "about"
  | "account";

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
    hint: "YouTube Music работает публично (гостевой доступ). Для доступа к личным плейлистам и полному стриму можно вставить cookies браузера.",
    bg: "#FF0000",
    brandColor: "#FF0000",
  },
  soundcloud: {
    key: "soundcloud",
    hint: "Вставьте client_id / OAuth токен из браузера или выполните вход через браузер.",
    bg: "#FF5500",
    brandColor: "#FF5500",
  },
  yandex: {
    key: "yandex",
    hint: "OAuth-токен Яндекс Музыки. Хранится только локально.",
    bg: "#FFCC00",
    brandColor: "#FFCC00",
  },
  deezer: {
    key: "deezer",
    hint: "Значение cookie arl из браузера Deezer или вход через браузер.",
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
  // Временно скрыто из выбора до доработки провайдера:
  // { key: "yandex", label: "Yandex Music", color: "#FFCC00" },
  { key: "deezer", label: "Deezer", color: "#A238FF" },
];

export interface SettingsNavItemMeta {
  id: SettingsTab;
  group: SettingsGroup;
  labelRu: string;
  labelEn: string;
  keywords: string[];
}

export const SETTINGS_NAV_ITEMS: SettingsNavItemMeta[] = [
  {
    id: "playback",
    group: "player",
    labelRu: "Воспроизведение",
    labelEn: "Playback",
    keywords: [
      "воспроизведение", "playback", "очередь", "queue", "автовоспроизведение", "autoplay",
      "похожие", "similar", "agc", "нормализация", "громкость", "кроссфейд", "crossfade",
      "кэширование", "платформы", "волна", "рекомендации", "автозапуск", "трей", "tray",
      "восстанавливать очередь", "вывод звука", "аудио", "audio",
    ],
  },
  {
    id: "appearance",
    group: "interface",
    labelRu: "Внешний вид",
    labelEn: "Appearance",
    keywords: [
      "внешний вид", "appearance", "язык", "language", "русский", "english",
      "тема", "theme", "системная", "светлая", "тёмная", "темная", "кастомная", "своя тема",
      "прозрачность", "transparency", "стекло", "размытие", "blur", "glass",
      "фон", "обои", "wallpaper", "картинка", "масштаб", "scale", "шрифт", "font",
    ],
  },
  {
    id: "player",
    group: "interface",
    labelRu: "Плеер",
    labelEn: "Player",
    keywords: [
      "плеер", "player", "положение", "позиция", "снизу", "сверху",
      "стиль плеера", "плавающий остров", "док", "заполнение прогрессом",
    ],
  },
  {
    id: "tabs",
    group: "interface",
    labelRu: "Вкладки",
    labelEn: "Tabs",
    keywords: [
      "вкладки", "tabs", "сайдбар", "sidebar", "навигация", "позиция вкладок",
      "стиль вкладок", "компактный", "круглый", "плавающий", "скрытие", "автоскрытие",
    ],
  },
  {
    id: "service_youtube_music",
    group: "integrations",
    labelRu: "YouTube",
    labelEn: "YouTube",
    keywords: ["youtube", "ютуб", "music", "музыка", "cookies", "гостевой доступ"],
  },
  {
    id: "service_soundcloud",
    group: "integrations",
    labelRu: "SoundCloud",
    labelEn: "SoundCloud",
    keywords: ["soundcloud", "саундклауд", "oauth", "client_id", "вход", "браузер"],
  },
  {
    id: "service_deezer",
    group: "integrations",
    labelRu: "Deezer",
    labelEn: "Deezer",
    keywords: ["deezer", "дизер", "arl", "cookie", "вход", "браузер"],
  },
  // Временно скрыто из интеграций до доработки провайдера:
  // {
  //   id: "service_yandex",
  //   group: "integrations",
  //   labelRu: "Yandex Music",
  //   labelEn: "Yandex Music",
  //   keywords: ["yandex", "яндекс", "яндекс музыка", "токен", "oauth"],
  // },
  {
    id: "service_spotify",
    group: "integrations",
    labelRu: "Spotify",
    labelEn: "Spotify",
    keywords: ["spotify", "спотифай", "sp_dc", "перенос", "плейлисты"],
  },
  {
    id: "discord",
    group: "integrations",
    labelRu: "Discord RPC",
    labelEn: "Discord RPC",
    keywords: ["discord", "rpc", "дискорд", "статус", "rich presence", "трансляция"],
  },
  {
    id: "storage",
    group: "app",
    labelRu: "Память и кеш",
    labelEn: "Storage & Cache",
    keywords: [
      "память", "кеш", "кэш", "storage", "cache", "хранилище", "диск", "очистить",
      "папка", "директория", "загрузки", "downloads", "проводник", "база данных",
    ],
  },
  {
    id: "about",
    group: "app",
    labelRu: "О приложении",
    labelEn: "About",
    keywords: [
      "о приложении", "about", "версия", "version", "обновления", "обновить", "update",
      "github", "сброс", "reset", "очистить данные",
    ],
  },
];
