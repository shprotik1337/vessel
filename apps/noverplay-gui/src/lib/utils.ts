import type { PlaybackCapability, TrackRef } from "../api/types";

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
      return "SoundCloud";
    case "yandex_music":
      return "Yandex";
    case "deezer":
      return "Deezer";
    default:
      return provider;
  }
}

export function artistLabel(artists: string[]): string {
  if (!artists || artists.length === 0) return "Unknown artist";
  return artists.join(", ");
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
