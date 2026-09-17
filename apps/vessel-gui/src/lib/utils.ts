import type { ImageProxyConfig, PlaybackCapability, TrackRef } from "../api/types";

let activeImageProxy: ImageProxyConfig | null = null;

export function setActiveImageProxy(proxy: ImageProxyConfig | null | undefined) {
  activeImageProxy = proxy ?? null;
}

export function getActiveImageProxy(): ImageProxyConfig | null {
  return activeImageProxy;
}

function inferProviderFromUrl(url: string): string | null {
  const lower = url.toLowerCase();
  if (lower.includes(".scdn.co") || lower.includes("spotifycdn.com")) {
    return "spotify";
  }
  if (lower.includes(".sndcdn.com")) {
    return "soundcloud";
  }
  if (lower.includes(".dzcdn.net") || lower.includes("deezer.com")) {
    return "deezer";
  }
  if (
    lower.includes(".googleusercontent.com") ||
    lower.includes("ytimg.com") ||
    lower.includes("ggpht.com") ||
    lower.includes("youtube.com")
  ) {
    return "youtube_music";
  }
  if (
    lower.includes("avatars.yandex.net") ||
    lower.includes("yandex.ru") ||
    lower.includes("yandex.net")
  ) {
    return "yandex_music";
  }
  return null;
}

export function resolveArtworkUrl(url: string | null | undefined): string | undefined {
  if (!url || typeof url !== "string") return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;

  // Прямая загрузка для российских сервисов (Яндекс Музыка не блокируется в РФ)
  if (
    trimmed.includes("avatars.yandex.net") ||
    trimmed.includes("yandex.ru") ||
    trimmed.includes("yandex.net")
  ) {
    return trimmed;
  }

  // Локальные ассеты, data URI, blob
  if (
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("asset://") ||
    trimmed.startsWith("http://localhost") ||
    trimmed.startsWith("http://127.0.0.1")
  ) {
    return trimmed;
  }

  // Защита от повторного проксирования
  if (trimmed.includes("/api/v1/image?")) {
    return trimmed;
  }

  // VPS используется ТОЛЬКО если активен сервер и данный провайдер переключен на «Сервер».
  // В локальном режиме всё обрабатывается строго локально, VPS никак не взаимодействует.
  if (activeImageProxy?.server_url && activeImageProxy.routed_providers?.length > 0) {
    const prov = inferProviderFromUrl(trimmed);
    if (prov && !activeImageProxy.routed_providers.includes(prov)) {
      // Провайдер стоит на «Локально» — грузим напрямую
      return trimmed;
    }

    const base = activeImageProxy.server_url.replace(/\/+$/, "");
    const params = new URLSearchParams();
    params.set("url", trimmed);
    if (activeImageProxy.token) {
      params.set("token", activeImageProxy.token);
    }
    return `${base}/api/v1/image?${params.toString()}`;
  }

  // Чисто локальный режим — напрямую, без обращения к серверу
  return trimmed;
}

export function formatTime(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return "0:00";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatDuration(ms: number | null | undefined): string {
  return formatTime(ms);
}

export function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function providerLabel(provider: string): string {
  switch (provider) {
    case "soundcloud":
    case "sound_cloud":
      return "SoundCloud";
    case "yandex":
    case "yandex_music":
      return "Yandex Music";
    case "deezer":
      return "Deezer";
    case "spotify":
      return "Spotify";
    case "youtube_music":
    case "you_tube_music":
      return "YouTube Music";
    default:
      return provider;
  }
}

export function isPlayCountString(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text.trim();
  if (!t) return false;

  // Чистые счётчики вида "1.6M", "295K", "100"
  if (/^[\d.,]+\s*[KMBkmb]?$/i.test(t)) {
    return true;
  }

  // Счётчики обязательно содержат цифры
  if (!/\d/.test(t)) {
    return false;
  }

  // И слово прослушиваний/просмотров как отдельное слово/корень
  return (
    /\b(plays?|views?|streams?|played|listens?)\b/i.test(t) ||
    /прослушиван|просмотр|воспроизведен|reproducci|reproduç|écoute|ecoute|lecture|wiedergabe|aufruf|odtworze/i.test(t) ||
    /\b(thousand|million|billion|тыс|млн|млрд)\b/i.test(t)
  );
}

export function filterValidArtists(artists: string[] | null | undefined): string[] {
  if (!artists || !Array.isArray(artists)) return [];
  return artists
    .map((a) => a.trim())
    .filter((a) => a.length > 0 && !isPlayCountString(a));
}

export function artistLabel(artists: string[]): string {
  const valid = filterValidArtists(artists);
  if (valid.length === 0) return "Unknown artist";
  return valid.join(", ");
}

export function canPlay(capability: PlaybackCapability | undefined): boolean {
  if (!capability) return true;
  return capability.kind !== "unavailable";
}

export function isFavorite(library: TrackRef[], track: TrackRef): boolean {
  return library.some((t) => t.provider === track.provider && t.id === track.id);
}

export function trackKey(track: TrackRef): string {
  return `${track.provider}:${track.id}`;
}

export function providerKey(track: TrackRef): string {
  return `${track.provider}:${track.id}`;
}

export function dedupe(tracks: TrackRef[]): TrackRef[] {
  const seen = new Set<string>();
  const out: TrackRef[] = [];
  for (const t of tracks) {
    const key = trackKey(t);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(t);
    }
  }
  return out;
}
