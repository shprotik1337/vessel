import { invoke } from "@tauri-apps/api/core";
import type {
  ArtistProfile,
  CollectionItem,
  ExploreContent,
  GeniusArtistInfo,
  MixItem,
  QueueContext,
  SearchOutcome,
  SmartShuffleResult,
  TrackRef,
} from "../types";

export async function search(query: string, provider?: string): Promise<SearchOutcome> {
  return invoke<SearchOutcome>("search", { query, provider });
}

export async function searchCollections(
  query: string,
  kind: "playlists" | "albums" | "artists",
  provider?: string,
): Promise<CollectionItem[]> {
  return invoke<CollectionItem[]>("search_collections", { query, kind, provider });
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

export async function getArtistExtras(name: string): Promise<GeniusArtistInfo | null> {
  return invoke<GeniusArtistInfo | null>("get_artist_extras", { name });
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

export async function getIncludePlaylistsInRecommendations(): Promise<boolean> {
  return invoke<boolean>("get_include_playlists_in_recommendations");
}

export async function setIncludePlaylistsInRecommendations(enabled: boolean): Promise<void> {
  return invoke("set_include_playlists_in_recommendations", { enabled });
}

export async function getExcludedRecommendationPlaylists(): Promise<string[]> {
  return invoke<string[]>("get_excluded_recommendation_playlists");
}

export async function togglePlaylistTasteExclusion(playlistId: string): Promise<boolean> {
  return invoke<boolean>("toggle_playlist_taste_exclusion", { playlistId });
}

export async function getPersonalMixes(forceRefresh?: boolean, providers?: string): Promise<MixItem[]> {
  return invoke<MixItem[]>("get_personal_mixes", { forceRefresh, providers });
}

export async function getExploreContent(forceRefresh?: boolean, providers?: string): Promise<ExploreContent> {
  return invoke<ExploreContent>("get_explore_content", { forceRefresh, providers });
}

export async function getHomeRecommendations(
  size?: number,
  forceRefresh?: boolean,
  providers?: string,
): Promise<TrackRef[]> {
  return invoke<TrackRef[]>("get_home_recommendations", { size, forceRefresh, providers });
}

export async function getNextAutoplayChunk(
  context: QueueContext,
  size?: number,
  providers?: string,
): Promise<TrackRef[]> {
  return invoke<TrackRef[]>("get_next_autoplay_chunk", { context, size, providers });
}

export async function applySmartShuffle(
  currentQueue: TrackRef[],
  currentIndex: number,
  providers?: string,
): Promise<SmartShuffleResult> {
  return invoke<SmartShuffleResult>("apply_smart_shuffle", { currentQueue, currentIndex, providers });
}
