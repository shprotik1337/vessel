import { invoke } from "@tauri-apps/api/core";
import type { HistoryEntry, Playlist, TrackRef, TrackTime } from "../types";

export type { TrackTime };

export async function toggleFavorite(track: TrackRef): Promise<boolean> {
  return invoke<boolean>("toggle_favorite", { track });
}

export async function getPlaylists(): Promise<Playlist[]> {
  return invoke<Playlist[]>("get_playlists");
}

export async function importPlaylistUrl(url: string): Promise<Playlist> {
  return invoke<Playlist>("import_playlist_url", { url });
}

export async function previewPlaylistUrl(url: string): Promise<Playlist> {
  return invoke<Playlist>("preview_playlist_url", { url });
}

export async function saveImportedPlaylist(playlist: Playlist): Promise<void> {
  return invoke("save_imported_playlist", { playlist });
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

export async function reorderLibrary(from: number, to: number): Promise<void> {
  return invoke("reorder_library", { from, to });
}

export async function reorderPlaylists(order: string[]): Promise<void> {
  return invoke("reorder_playlists", { order });
}

export async function getLibraryTimes(): Promise<TrackTime[]> {
  return invoke<TrackTime[]>("get_library_times");
}

export async function getPlaylistTrackTimes(id: string): Promise<TrackTime[]> {
  return invoke<TrackTime[]>("get_playlist_track_times", { id });
}

export async function playPlaylist(id: string): Promise<void> {
  return invoke("play_playlist", { id });
}

export async function setPlaylistCover(
  id: string,
  coverUrl: string | null,
): Promise<void> {
  return invoke("set_playlist_cover", { id, coverUrl });
}

export async function getHistory(): Promise<HistoryEntry[]> {
  return invoke<HistoryEntry[]>("get_history");
}

export async function clearHistory(): Promise<void> {
  return invoke("clear_history");
}

export async function importLikes(
  provider: string,
  target: string,
  profileUrl?: string | null,
  playlistTitle?: string | null,
): Promise<number> {
  return invoke<number>("import_likes", { provider, target, profileUrl, playlistTitle });
}

export async function importTracksBatch(tracks: TrackRef[]): Promise<number> {
  return invoke<number>("import_tracks_batch", { tracks });
}
