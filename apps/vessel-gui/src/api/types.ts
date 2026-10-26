export type ProviderKind = "soundcloud" | "yandex_music" | "deezer" | "spotify" | "youtube_music" | "you_tube_music";

export type TrackOrigin = "original" | "smart_shuffle" | "autoplay" | "my_wave";

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
  origin?: TrackOrigin;
  album_url?: string | null;
  album_title?: string | null;
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
  is_album?: boolean;
  artist_name?: string | null;
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

export interface ImageProxyConfig {
  server_url: string;
  token: string;
  routed_providers: string[];
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
  status_message: string;
  user_profile: UserProfile | null;
  account_state: AccountState;
  needs_user_selection: boolean;
  language: string;
  wave_source: string;
  image_proxy?: ImageProxyConfig | null;
  discord_rpc: boolean;
}

export type AccountState =
  | { kind: "guest" }
  | { kind: "restoring" }
  | { kind: "authenticated"; username: string; user_id: string };

export interface CaptchaItem {
  id: number;
  symbol: string;
  x: number;
  y: number;
}

export interface CaptchaChallenge {
  id: string;
  targets: string[];
  items: CaptchaItem[];
  expires_in_secs: number;
}

export interface UserInfo {
  id: string;
  username: string;
  created_at_ms: number;
  display_name?: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  status?: string | null;
  bio?: string | null;
}

export interface UpdateProfileRequest {
  display_name?: string | null;
  avatar_url?: string | null;
  banner_url?: string | null;
  status?: string | null;
  bio?: string | null;
}

export interface AuthResult {
  user: UserInfo;
  has_local_data: boolean;
}

export interface RegisterRequest {
  username: string;
  password: string;
  captcha_id: string;
  captcha_clicks: number[];
  installation_id?: string;
}

export interface LoginRequest {
  username: string;
  password: string;
  captcha_id?: string;
  captcha_clicks?: number[];
  installation_id?: string;
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

export interface ExternalLink {
  name: string;
  url: string;
}

export interface FollowedArtist {
  id: string;
  provider: ProviderKind;
  name: string;
  avatar_url: string | null;
  header_image_url?: string | null;
  monthly_listeners?: number | null;
  verified: boolean;
  added_at_ms: number;
}

export interface ArtistProfile {
  name: string;
  avatar_url: string | null;
  popular_tracks: TrackRef[];
  releases: CollectionItem[];
  header_image_url?: string | null;
  monthly_listeners?: number | null;
  verified?: boolean;
  biography?: string | null;
  external_links?: ExternalLink[];
}

export interface GeniusArtistInfo {
  name: string;
  header_image_url?: string | null;
  headerImageUrl?: string | null;
  avatar_url?: string | null;
  avatarUrl?: string | null;
  biography?: string | null;
  biography_dom?: any | null;
  biographyDom?: any | null;
  social_links?: Array<{ name: string; url: string }>;
  socialLinks?: Array<{ name: string; url: string }>;
}

export interface MixItem {
  id: number;
  pillColor: string;
  pillTextColor: string;
  title: string;
  artist: string;
  relatedArtists: string[];
  coverUrl: string | null;
  tracks: TrackRef[];
}

export interface ExploreContent {
  artists: CollectionItem[];
  albums: CollectionItem[];
}

export interface QueueContext {
  current_track: TrackRef | null;
  recent_played: TrackRef[];
  remaining_queue: TrackRef[];
  session_played_keys: string[];
  feedback_skips: string[];
  feedback_likes: string[];
}

export interface SmartShuffleResult {
  interleaved_queue: TrackRef[];
  injected_track_keys: string[];
}

export interface DownloadBatchResult {
  downloaded: number;
  skipped: number;
  failed: number;
  total: number;
}

export interface TrackTime {
  key: string;
  timestamp_ms: number;
}

export interface VesselServerView {
  id: string;
  name: string;
  url: string;
  has_token: boolean;
  providers: string[];
}

export interface VesselServerProbe {
  name: string;
  version: string;
  api_version: string;
  providers: string[];
  capabilities: { processing: boolean; user_storage: boolean; playback_relay: boolean };
}

export interface CloudSyncResult {
  tracks_count: number;
  playlists_count: number;
}

export interface StorageStats {
  tracks_bytes: number;
  tracks_count: number;
  covers_bytes: number;
  lyrics_bytes: number;
  total_bytes: number;
}

export interface SyncedUserSettings {
  schema_version?: number;
  language?: string;
  theme?: string;
  customization?: any;
  user_presets?: any;
  font?: string;
  recommendation_providers?: string;
  include_playlists_in_recommendations?: boolean;
  excluded_recommendation_playlist_ids?: string[];
  auto_similar?: boolean;
  audio_agc?: boolean;
  autoplay_last?: boolean;
  crossfade_enabled?: boolean;
  crossfade_sec?: number;
  history_limit?: number;
}

export interface UserSettingsResponse {
  settings: SyncedUserSettings | null;
  version: number;
  updated_at_ms: number;
}

export interface SaveUserSettingsRequest {
  settings: SyncedUserSettings;
  expected_version: number;
}

export interface SaveUserSettingsResponse {
  version: number;
  updated_at_ms: number;
}
