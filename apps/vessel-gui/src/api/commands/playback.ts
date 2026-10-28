import { invoke } from "@tauri-apps/api/core";
import type { RepeatMode, TrackRef } from "../types";

export async function play(track: TrackRef): Promise<void> {
  return invoke("play", { track });
}

export async function playTracks(tracks: TrackRef[], start: number): Promise<void> {
  return invoke("play_tracks", { tracks, start });
}

export async function playQueueIndex(index: number): Promise<void> {
  return invoke("play_queue_index", { index });
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
  return invoke("seek", { positionMs: Math.max(0, Math.round(positionMs)) });
}

export async function setVolume(volumePercent: number): Promise<void> {
  return invoke("set_volume", { volumePercent });
}

export async function setCrossfade(durationMs: number): Promise<void> {
  return invoke("set_crossfade", { durationMs: Math.max(0, Math.round(durationMs)) });
}

export async function setAudioAgc(enabled: boolean): Promise<void> {
  return invoke("set_audio_agc", { enabled });
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

export async function reorderQueue(tracks: TrackRef[]): Promise<void> {
  return invoke("reorder_queue", { tracks });
}

export async function clearQueue(): Promise<void> {
  return invoke("clear_queue");
}

export async function fetchServerLyrics(params: {
  trackName?: string;
  artistName?: string;
  albumName?: string;
  duration?: number;
  q?: string;
  search?: boolean;
}): Promise<any> {
  return invoke<any>("fetch_server_lyrics", {
    trackName: params.trackName ?? null,
    artistName: params.artistName ?? null,
    albumName: params.albumName ?? null,
    duration: params.duration ?? null,
    q: params.q ?? null,
    search: params.search ?? null,
  });
}
