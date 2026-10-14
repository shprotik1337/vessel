import type {
  FullState,
  Playlist,
  TrackRef,
} from "../api/types";
import type { Lang } from "../i18n";

export interface CacheProgressPayload {
  completed: number;
  total: number;
  title: string;
  downloaded: number;
  skipped: number;
  failed: number;
}

export interface CacheCompletePayload {
  total: number;
  downloaded: number;
  skipped: number;
  failed: number;
}

export interface MixContext {
  title: string;
  artists: string[];
  tracks: TrackRef[];
}

export interface NavEntry {
  view: string;
  playlistId: string | null;
  artist: string | null;
  artistProvider: string | null;
  artistId: string | null;
}

export interface PlaybackProgress {
  status: string;
  position_ms: number;
  buffered_ms: number;
  duration_ms: number;
}

export interface AppStore {
  state: FullState | null;
  favoriteKeysSet: Set<string>;
  cacheProgress: CacheProgressPayload | null;
  toast: string | null;
  toastError: boolean;
  playlists: Playlist[];
  view: string;
  playlistId: string | null;
  artist: string | null;
  artistProvider: string | null;
  artistId: string | null;
  lang: Lang;
  waveTracks: TrackRef[];
  setWaveTracks: (tracks: TrackRef[]) => void;
  isWaveActive: boolean;
  setIsWaveActive: (active: boolean) => void;
  activeMixContext: MixContext | null;
  setActiveMixContext: (ctx: MixContext | null) => void;
  externalPlaylist: Playlist | null;
  setExternalPlaylist: (pl: Playlist | null) => void;
  expandQueueTracks: (count?: number, force?: boolean) => Promise<TrackRef[]>;
  playNextTrack: () => Promise<void>;
  smartShuffle: boolean;
  setSmartShuffle: (val: boolean) => void;
  smartTrackKeys: Set<string>;
  toggleShuffle: () => Promise<void>;
  toggleSmartShuffle: () => Promise<void>;
  cycleShuffleMode: () => Promise<void>;
  fullscreenOpen: boolean;
  setFullscreenOpen: (open: boolean) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchProvider: string;
  setSearchProvider: (provider: string) => void;
  setView: (view: string) => void;
  navigateTo: (
    view: string,
    params?: {
      playlistId?: string;
      artist?: string;
      provider?: string;
      artistId?: string;
    },
  ) => void;
  canGoBack: boolean;
  goBack: () => void;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: React.Dispatch<React.SetStateAction<boolean>>;
  toggleSidebarCollapsed: () => void;
  showToast: (message: string, error?: boolean, durationMs?: number) => void;
  isSettingsOpen: boolean;
  setIsSettingsOpen: (open: boolean) => void;
  openSettings: () => void;
  closeSettings: () => void;
  playTracks: (tracks: TrackRef[], start?: number) => Promise<void>;
  refresh: () => Promise<void>;
  hasEverPlayed: boolean;
  setHasEverPlayed: React.Dispatch<React.SetStateAction<boolean>>;
  isAuthModalOpen: boolean;
  setIsAuthModalOpen: (open: boolean) => void;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  isMigrationModalOpen: boolean;
  setIsMigrationModalOpen: (open: boolean) => void;
  logoutAccount: () => Promise<void>;
  continueGuest: () => Promise<void>;
}
