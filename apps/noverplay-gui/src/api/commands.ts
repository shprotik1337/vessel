import { invoke } from "@tauri-apps/api/core";

import type {
  FullState,
  HistoryEntry,
  Playlist,
  ProviderStatus,
  RepeatMode,
  SearchOutcome,
  TrackRef,
} from "./types";

export async function getState(): Promise<FullState> {
  return invoke<FullState>("get_state");
}

export async function search(query: string): Promise<SearchOutcome> {
  return invoke<SearchOutcome>("search", { query });
}

export async function play(track: TrackRef): Promise<void> {
  return invoke("play", { track });
}

export async function playTracks(tracks: TrackRef[], start: number): Promise<void> {
  return invoke("play_tracks", { tracks, start });
}

export async function togglePlayback(): Promise<void> {
  return invoke("toggle_playback");
}

export async function next(): Promise<void> {
  return invoke("next");
}

export async function previous(): Promise<void> {
  return invoke("previous");
}

export async function seek(positionMs: number): Promise<void> {
  return invoke("seek", { positionMs });
}

export async function setVolume(volumePercent: number): Promise<void> {
  return invoke("set_volume", { volumePercent });
}

export async function stopPlayback(): Promise<void> {
  return invoke("stop");
}

export async function setShuffle(on: boolean): Promise<void> {
  return invoke("set_shuffle", { on });
}

export async function setRepeat(mode: RepeatMode): Promise<void> {
  return invoke("set_repeat", { mode });
}

export async function addToQueue(track: TrackRef): Promise<void> {
  return invoke("add_to_queue", { track });
}

export async function playNext(track: TrackRef): Promise<void> {
  return invoke("play_next", { track });
}

export async function removeFromQueue(index: number): Promise<void> {
  return invoke("remove_from_queue", { index });
}

export async function moveQueueItem(from: number, to: number): Promise<void> {
  return invoke("move_queue_item", { from, to });
}

export async function clearQueue(): Promise<void> {
  return invoke("clear_queue");
}

export async function toggleFavorite(track: TrackRef): Promise<boolean> {
  return invoke<boolean>("toggle_favorite", { track });
}

export async function getPlaylists(): Promise<Playlist[]> {
  return invoke<Playlist[]>("get_playlists");
}

export async function createPlaylist(title: string): Promise<Playlist> {
  return invoke<Playlist>("create_playlist", { title });
}

export async function renamePlaylist(id: string, title: string): Promise<void> {
  return invoke("rename_playlist", { id, title });
}

export async function deletePlaylist(id: string): Promise<void> {
  return invoke("delete_playlist", { id });
}

export async function addToPlaylist(id: string, track: TrackRef): Promise<boolean> {
  return invoke<boolean>("add_to_playlist", { id, track });
}

export async function removeFromPlaylist(id: string, index: number): Promise<void> {
  return invoke("remove_from_playlist", { id, index });
}

export async function reorderPlaylist(
  id: string,
  from: number,
  to: number,
): Promise<void> {
  return invoke("reorder_playlist", { id, from, to });
}

export async function playPlaylist(id: string): Promise<void> {
  return invoke("play_playlist", { id });
}

export async function getHistory(): Promise<HistoryEntry[]> {
  return invoke<HistoryEntry[]>("get_history");
}

export async function clearHistory(): Promise<void> {
  return invoke("clear_history");
}

export async function getProviderStatus(): Promise<ProviderStatus[]> {
  return invoke<ProviderStatus[]>("get_provider_status");
}

export async function saveCredential(provider: string, value: string): Promise<void> {
  return invoke("save_credential", { provider, value });
}

export async function probeCredential(provider: string, value: string): Promise<boolean> {
  return invoke<boolean>("probe_credential", { provider, value });
}

export async function removeCredential(provider: string): Promise<void> {
  return invoke("remove_credential", { provider });
}

export async function getRelated(
  track: TrackRef,
  limit?: number,
): Promise<TrackRef[]> {
  return invoke<TrackRef[]>("get_related", { track, limit });
}

export async function resetSettings(): Promise<void> {
  return invoke("reset_settings");
}

export async function resetData(): Promise<void> {
  return invoke("reset_data");
}
