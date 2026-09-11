import { invoke } from "@tauri-apps/api/core";

import type {
  ArtistProfile,
  CollectionItem,
  FullState,
  HistoryEntry,
  Playlist,
  ProviderStatus,
  RepeatMode,
  SearchOutcome,
  TrackRef,
  UserProfile,
} from "./types";

export async function getState(): Promise<FullState> {
  return invoke<FullState>("get_state");
}

export async function search(query: string, provider?: string): Promise<SearchOutcome> {
  return invoke<SearchOutcome>("search", { query, provider });
}

export async function searchCollections(
  query: string,
  kind: "playlists" | "albums" | "artists",
): Promise<CollectionItem[]> {
  return invoke<CollectionItem[]>("search_collections", { query, kind });
}

export async function artistProfile(
  provider: string,
  artistId: string,
): Promise<ArtistProfile> {
  return invoke<ArtistProfile>("artist_profile", { provider, artistId });
}

export async function artistAllTracks(
  provider: string,
  artistId: string,
): Promise<TrackRef[]> {
  return invoke<TrackRef[]>("artist_all_tracks", { provider, artistId });
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

export async function downloadTrack(track: TrackRef): Promise<string> {
  return invoke<string>("download_track", { track });
}

export async function downloadTrackToCache(track: TrackRef): Promise<string> {
  return invoke<string>("download_track_to_cache", { track });
}

export interface DownloadBatchResult {
  downloaded: number;
  skipped: number;
  failed: number;
  total: number;
}

export async function downloadAllToCache(
  tracks: TrackRef[],
): Promise<DownloadBatchResult> {
  return invoke<DownloadBatchResult>("download_all_to_cache", { tracks });
}

export async function getDownloadDir(): Promise<string> {
  return invoke<string>("get_download_dir");
}

export async function setDownloadDir(path: string | null): Promise<void> {
  return invoke("set_download_dir", { path });
}

export async function getCacheDir(): Promise<string> {
  return invoke<string>("get_cache_dir");
}

export async function setCacheDir(path: string | null): Promise<void> {
  return invoke("set_cache_dir", { path });
}

export async function getSpotifyProxy(): Promise<string> {
  return invoke<string>("get_spotify_proxy");
}

export async function setSpotifyProxy(path: string | null): Promise<void> {
  return invoke("set_spotify_proxy", { path });
}

export async function getSpotifyPlaybackSource(): Promise<string> {
  return invoke<string>("get_spotify_playback_source");
}

export async function setSpotifyPlaybackSource(source: string): Promise<void> {
  return invoke("set_spotify_playback_source", { source });
}



export async function spotifyBrowserLogin(): Promise<void> {
  return invoke("spotify_browser_login");
}

export async function spotifyCaptureCookies(): Promise<string> {
  return invoke<string>("spotify_capture_cookies");
}

export async function spotifyLoginWindowOpen(): Promise<boolean> {
  return invoke<boolean>("spotify_login_window_open");
}

export async function spotifyAuthCancel(): Promise<void> {
  return invoke("spotify_auth_cancel");
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

export async function reorderQueue(tracks: TrackRef[]): Promise<void> {
  return invoke("reorder_queue", { tracks });
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

export interface TrackTime {
  key: string;
  timestamp_ms: number;
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

export async function setProviderEnabled(provider: string, enabled: boolean): Promise<void> {
  return invoke("set_provider_enabled", { provider, enabled });
}

export async function getRelated(
  track: TrackRef,
  limit?: number,
): Promise<TrackRef[]> {
  return invoke<TrackRef[]>("get_related", { track, limit });
}

export async function getWaveRecommendations(
  source: string,
  size?: number,
  playlistId?: string | null,
  providers?: string | null,
): Promise<TrackRef[]> {
  return invoke<TrackRef[]>("get_wave_recommendations", { source, size, playlistId, providers });
}

export async function getWaveSource(): Promise<string> {
  return invoke<string>("get_wave_source");
}

export async function setWaveSource(source: string): Promise<void> {
  return invoke("set_wave_source", { source });
}

export async function getWaveProviders(): Promise<string> {
  return invoke<string>("get_wave_providers");
}

export async function setWaveProviders(providers: string): Promise<void> {
  return invoke("set_wave_providers", { providers });
}

export async function getRecommendationProviders(): Promise<string> {
  return invoke<string>("get_recommendation_providers");
}

export async function setRecommendationProviders(providers: string): Promise<void> {
  return invoke("set_recommendation_providers", { providers });
}

export async function resetSettings(): Promise<void> {
  return invoke("reset_settings");
}

export async function resetData(): Promise<void> {
  return invoke("reset_data");
}

export async function getUserProfile(): Promise<UserProfile | null> {
  return invoke<UserProfile | null>("get_user_profile");
}

export async function getKnownUsers(): Promise<UserProfile[]> {
  return invoke<UserProfile[]>("get_known_users");
}

export async function switchUser(name: string): Promise<void> {
  return invoke("switch_user", { name });
}

export async function createUser(name: string): Promise<UserProfile> {
  return invoke<UserProfile>("create_user", { name });
}

export async function exportUser(destination: string): Promise<string> {
  return invoke<string>("export_user", { destination });
}

export async function importUser(source: string): Promise<UserProfile> {
  return invoke<UserProfile>("import_user", { source });
}

export async function backupUser(): Promise<string> {
  return invoke<string>("backup_user");
}

export async function selectUser(name: string, remember: boolean): Promise<void> {
  return invoke("select_user", { name, remember });
}

export async function clearAutoLogin(): Promise<void> {
  return invoke("clear_auto_login");
}

export async function getAutoLogin(): Promise<string | null> {
  return invoke<string | null>("get_auto_login");
}

export async function deleteUser(name: string): Promise<void> {
  return invoke("delete_user", { name });
}

export async function getLanguage(): Promise<string> {
  return invoke<string>("get_language");
}

export async function setLanguage(language: string): Promise<void> {
  return invoke("set_language", { language });
}

export async function pickFolder(): Promise<string | null> {
  return invoke<string | null>("pick_folder");
}

export async function pickFile(extensions?: string[]): Promise<string | null> {
  return invoke<string | null>("pick_file", { extensions: extensions ?? null });
}

export async function openPath(path: string): Promise<void> {
  return invoke("open_path", { path });
}

export async function getUsersDir(): Promise<string> {
  return invoke<string>("get_users_dir");
}
