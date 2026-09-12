export type ProviderKind = "soundcloud" | "yandex_music" | "deezer" | "spotify" | "you_tube_music";

export interface TrackRef {
  provider: ProviderKind;
  id: string;
  title: string;
  artists: string[];
  duration_ms: number | null;
  artwork_url: string | null;
  web_url: string;
  capability: PlaybackCapability;
  genres: string[];
  explicit: boolean;
  drm: boolean;
}

export type PlaybackCapability =
  | { kind: "full" }
  | { kind: "preview"; seconds: number }
  | { kind: "unavailable"; reason: string };

export type RepeatMode = "off" | "all" | "one";
export type PlaybackStatus = "playing" | "paused" | "buffering" | "stopped" | "error";

export interface PlayerState {
  status: PlaybackStatus;
  position_ms: number;
  buffered_ms: number;
  duration_ms: number;
  volume_percent: number;
  shuffle: boolean;
  repeat: RepeatMode;
}

export interface Playlist {
  id: string;
  title: string;
  description: string;
  source_url: string | null;
  cover_url: string | null;
  tracks: TrackRef[];
  created_at_ms: number;
  updated_at_ms: number;
}

export interface HistoryEntry {
  track: TrackRef;
  played_at_ms: number;
  completed: boolean;
  skipped: boolean;
}

export interface ProviderStatus {
  kind: string;
  label: string;
  connected: boolean;
  has_credentials: boolean;
  enabled: boolean;
  origin: string;
}

export interface FullState {
  player: PlayerState;
  queue: TrackRef[];
  queue_index: number | null;
  now_playing: TrackRef | null;
  library: TrackRef[];
  playlists: Playlist[];
  history: HistoryEntry[];
  providers: ProviderStatus[];
  volume_percent: number;
  soundcloud_enabled: boolean;
  yandex_enabled: boolean;
  deezer_enabled: boolean;
  spotify_enabled: boolean;
  youtube_music_enabled: boolean;
  server_url: string;
  status_message: string;
  user_profile: UserProfile | null;
  needs_user_selection: boolean;
  language: string;
  wave_source: string;
}

export interface UserProfile {
  id: string;
  display_name: string;
  created_at_ms: number;
  updated_at_ms: number;
  format_version: number;
}

export interface SearchOutcome {
  tracks: TrackRef[];
  failures: string[];
}

export interface ProgressPayload {
  status: PlaybackStatus;
  position_ms: number;
  buffered_ms: number;
  duration_ms: number;
}

export interface Toast {
  id: number;
  message: string;
  kind: "info" | "error" | "success";
}

export type View =
  | "home"
  | "search"
  | "library"
  | "playlists"
  | "favorites"
  | "recent"
  | "queue"
  | "settings"
  | "wave";

export type CollectionKind = "playlist" | "album" | "artist";

export interface CollectionItem {
  kind: CollectionKind;
  provider: ProviderKind;
  id: string;
  title: string;
  subtitle: string;
  artwork_url: string | null;
  web_url: string;
  track_count: number;
}

export interface ArtistProfile {
  name: string;
  avatar_url: string | null;
  popular_tracks: TrackRef[];
  releases: CollectionItem[];
}
