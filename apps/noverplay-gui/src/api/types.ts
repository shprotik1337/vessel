export type ProviderKind = "soundcloud" | "yandex_music" | "deezer";

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
export type PlaybackStatus = "playing" | "paused" | "buffering" | "stopped";

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
  server_url: string;
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
  | "settings";
