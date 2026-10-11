import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { listen } from "@tauri-apps/api/event";

import type {
  FullState,
  Playlist,
  ProgressPayload,
  TrackRef,
  QueueContext,
} from "./api/types";
import { normalizeLang, type Lang } from "./i18n";
import { setActiveImageProxy, trackKey, dedupe } from "./lib/utils";
import * as api from "./api/commands";

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

export function semanticTrackKey(t: TrackRef): string {
  const artist = (t.artists && t.artists.length > 0 ? t.artists[0] : "").toLowerCase().trim();
  const title = (t.title || "").toLowerCase().trim();
  return `${artist}:::${title}`;
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

const AppContext = createContext<AppStore | null>(null);

let toastTimer: number | undefined;

interface NavEntry {
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

const PlaybackProgressContext = createContext<PlaybackProgress>({
  status: "stopped",
  position_ms: 0,
  buffered_ms: 0,
  duration_ms: 0,
});

export function usePlaybackProgress(): PlaybackProgress {
  return useContext(PlaybackProgressContext);
}

export function PlaybackProgressProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<PlaybackProgress>({
    status: "stopped",
    position_ms: 0,
    buffered_ms: 0,
    duration_ms: 0,
  });

  useEffect(() => {
    let unlistenFn: (() => void) | null = null;
    void listen<ProgressPayload>("progress", (event) => {
      setProgress(event.payload);
    }).then((unlisten) => {
      unlistenFn = unlisten;
    });

    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, []);

  return (
    <PlaybackProgressContext.Provider value={progress}>
      {children}
    </PlaybackProgressContext.Provider>
  );
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FullState | null>(null);
  const [hasEverPlayed, setHasEverPlayed] = useState<boolean>(false);
  const [cacheProgress, setCacheProgress] = useState<CacheProgressPayload | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [toastError, setToastError] = useState(false);
  const [view, setView] = useState<string>("home");
  const [playlistId, setPlaylistId] = useState<string | null>(null);
  const [artist, setArtist] = useState<string | null>(null);
  const [artistProvider, setArtistProvider] = useState<string | null>(null);
  const [artistId, setArtistId] = useState<string | null>(null);
  const [history, setHistory] = useState<NavEntry[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem("vessel_sidebar_collapsed") === "true";
    } catch {
      return false;
    }
  });

  const toggleSidebarCollapsed = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("vessel_sidebar_collapsed", String(next));
      } catch {}
      return next;
    });
  }, []);

  const canGoBack = history.length > 0;
  const [waveTracks, setWaveTracks] = useState<TrackRef[]>([]);
  const [isWaveActive, setIsWaveActive] = useState<boolean>(false);
  const [activeMixContext, setActiveMixContext] = useState<MixContext | null>(null);
  const [externalPlaylist, setExternalPlaylist] = useState<Playlist | null>(null);
  const [smartTrackKeys, setSmartTrackKeys] = useState<Set<string>>(() => new Set());
  const favoriteKeysSet = useMemo(() => {
    const set = new Set<string>();
    if (state?.library) {
      for (const t of state.library) {
        set.add(`${t.provider}:${t.id}`);
      }
    }
    return set;
  }, [state?.library]);

  const [smartShuffle, setSmartShuffle] = useState<boolean>(false);
  const [fullscreenOpen, setFullscreenOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchProvider, setSearchProvider] = useState<string>("soundcloud");
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const openSettings = useCallback(() => setIsSettingsOpen(true), []);
  const closeSettings = useCallback(() => setIsSettingsOpen(false), []);
  const hasCheckedAuthOnStartupRef = useRef(false);
  const hasTriggeredAutoplayRef = useRef(false);
  const lastAutoCachedTrackKeyRef = useRef<string | null>(null);
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isMigrationModalOpen, setIsMigrationModalOpen] = useState(false);
  const openAuthModal = useCallback(() => {
    setIsSettingsOpen(false);
    setView("auth");
  }, []);
  const closeAuthModal = useCallback(() => setIsAuthModalOpen(false), []);

  const navigateTo = useCallback(
    (
      target: string,
      params?: {
        playlistId?: string;
        artist?: string;
        provider?: string;
        artistId?: string;
      },
    ) => {
      if (target === "settings") {
        setIsSettingsOpen(true);
        return;
      }
      setHistory((h) => [
        ...h,
        { view, playlistId, artist, artistProvider, artistId },
      ]);
      if (target === "playlist" && params?.playlistId) {
        setPlaylistId(params.playlistId);
      }
      if (target === "artist") {
        setArtist(params?.artist ?? null);
        setArtistProvider(params?.provider ?? null);
        setArtistId(params?.artistId ?? null);
      }
      setView(target);
    },
    [view, playlistId, artist, artistProvider, artistId],
  );

  const lang = normalizeLang(state?.language);

  const goBack = useCallback(() => {
    setHistory((h) => {
      const prev = h[h.length - 1];
      if (!prev) {
        setView("home");
        return h;
      }
      setView(prev.view);
      setPlaylistId(prev.playlistId);
      setArtist(prev.artist);
      setArtistProvider(prev.artistProvider);
      setArtistId(prev.artistId);
      return h.slice(0, -1);
    });
  }, []);

  const showToast = useCallback((message: string, error = false, durationMs = 3500) => {
    setToast(message);
    setToastError(error);
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => setToast(null), durationMs);
  }, []);

  const triggerAutoplayLast = useCallback((fresh: FullState) => {
    if (hasTriggeredAutoplayRef.current) return;
    const autoplay = localStorage.getItem("vessel_autoplay_last") === "true";
    if (
      autoplay &&
      fresh.now_playing &&
      fresh.player?.status !== "playing" &&
      fresh.player?.status !== "buffering"
    ) {
      hasTriggeredAutoplayRef.current = true;
      const idx = fresh.queue_index ?? 0;
      if (fresh.queue && fresh.queue.length > 0) {
        void api.playTracks(fresh.queue, idx);
      } else {
        void api.play(fresh.now_playing);
      }
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const fresh = await api.getState();
      setActiveImageProxy(fresh.image_proxy);
      setState(fresh);
      setPlaylists(fresh.playlists);
      if (
        fresh.player?.status === "playing" ||
        fresh.player?.status === "buffering"
      ) {
        setHasEverPlayed(true);
      }
      if (!hasCheckedAuthOnStartupRef.current) {
        hasCheckedAuthOnStartupRef.current = true;
        if (!fresh.account_state || fresh.account_state.kind === "guest") {
          setView("auth");
        } else {
          triggerAutoplayLast(fresh);
        }
      }
    } catch (error) {
      console.error("get_state failed", error);
      showToast("Не удалось получить состояние", true);
    }
  }, [showToast, triggerAutoplayLast]);

  const logoutAccount = useCallback(async () => {
    try {
      await api.authLogout();
      await refresh();
      setView("auth");
      showToast("Вы вышли из аккаунта");
    } catch (e: any) {
      showToast(String(e), true);
    }
  }, [refresh, showToast]);

  const continueGuest = useCallback(async () => {
    try {
      await api.authContinueGuest();
      setView("home");
      const fresh = await api.getState();
      setState(fresh);
      triggerAutoplayLast(fresh);
      showToast("Продолжен гостевой режим");
    } catch (e: any) {
      showToast(String(e), true);
    }
  }, [showToast, triggerAutoplayLast]);

  // Синхронизация Crossfade и AGC аудиодвижка при старте
  useEffect(() => {
    const cfEnabled = localStorage.getItem("vessel_crossfade_enabled") === "true";
    const cfSec = Number(localStorage.getItem("vessel_crossfade_sec") || 5);
    void api.setCrossfade(cfEnabled ? cfSec * 1000 : 0);
    void api.setAudioAgc(localStorage.getItem("vessel_audio_agc") === "true");
  }, []);

  // Кэширование воспроизводимого трека
  useEffect(() => {
    const track = state?.now_playing;
    if (!track) return;
    const autoCacheEnabled = localStorage.getItem("vessel_auto_cache") !== "false";
    if (!autoCacheEnabled) return;
    const key = `${track.provider}:${track.id}`;
    if (lastAutoCachedTrackKeyRef.current === key) return;
    lastAutoCachedTrackKeyRef.current = key;
    void api.downloadTrackToCache(track).catch(() => {});
  }, [state?.now_playing]);

  useEffect(() => {
    setActiveImageProxy(state?.image_proxy);
  }, [state?.image_proxy]);

  const playTracks = useCallback(
    async (tracks: TrackRef[], start = 0) => {
      setHasEverPlayed(true);
      if (smartShuffle) {
        setSmartShuffle(false);
        setSmartTrackKeys(new Set());
      }
      try {
        await api.playTracks(tracks, start);
        await refresh();
      } catch (error) {
        showToast(String(error), true);
      }
    },
    [refresh, showToast, smartShuffle],
  );

  useEffect(() => {
    void refresh();

    const unlistenState = listen<FullState>("state", (event) => {
      setState(event.payload);
      setPlaylists(event.payload.playlists);
      if (
        event.payload.player?.status === "playing" ||
        event.payload.player?.status === "buffering"
      ) {
        setHasEverPlayed(true);
      }
    });
    const unlistenProgress = listen<ProgressPayload>("progress", (event) => {
      if (
        event.payload.status === "playing" ||
        event.payload.status === "buffering"
      ) {
        setHasEverPlayed(true);
      }
    });
    const unlistenCacheProgress = listen<CacheProgressPayload>("cache-progress", (event) => {
      setCacheProgress(event.payload);
    });
    const unlistenCacheComplete = listen<CacheCompletePayload>("cache-complete", (event) => {
      setCacheProgress(null);
      void refresh();
      const res = event.payload;
      if (res.downloaded === 0 && res.failed === 0) {
        showToast(
          lang === "ru"
            ? `Все треки уже в кэше (${res.skipped})`
            : `All tracks are already cached (${res.skipped})`,
          false,
          5000,
        );
      } else {
        const parts: string[] = [];
        if (res.downloaded > 0) {
          parts.push(lang === "ru" ? `Скачано в кэш: ${res.downloaded}` : `Downloaded: ${res.downloaded}`);
        }
        if (res.skipped > 0) {
          parts.push(lang === "ru" ? `уже в кэше: ${res.skipped}` : `already cached: ${res.skipped}`);
        }
        if (res.failed > 0) {
          parts.push(lang === "ru" ? `сбоев: ${res.failed}` : `failed: ${res.failed}`);
        }
        showToast(parts.join(" · "), res.failed > 0 && res.downloaded === 0, 5500);
      }
    });

    const poll = window.setInterval(() => {
      void (async () => {
        try {
          const fresh = await api.getState();
          setState(fresh);
          setPlaylists(fresh.playlists);
          if (
            fresh.player?.status === "playing" ||
            fresh.player?.status === "buffering"
          ) {
            setHasEverPlayed(true);
          }
        } catch {
          // ignore transient poll failures
        }
      })();
    }, 4000);

    return () => {
      window.clearInterval(poll);
      void unlistenState.then((fn) => fn());
      void unlistenProgress.then((fn) => fn());
      void unlistenCacheProgress.then((fn) => fn());
      void unlistenCacheComplete.then((fn) => fn());
    };
  }, [refresh, lang, showToast]);

  const lastErrorRef = useRef<string | null>(null);
  useEffect(() => {
    if (state?.player.status === "error" && state?.status_message) {
      if (lastErrorRef.current !== state.status_message) {
        lastErrorRef.current = state.status_message;
        showToast(state.status_message, true);
      }
    } else if (state?.player.status !== "error") {
      lastErrorRef.current = null;
    }
  }, [state?.player.status, state?.status_message, showToast]);

  const expandingQueueRef = useRef(false);
  const lastExpandedIndexRef = useRef<number | null>(null);
  const lastExpandedTimeRef = useRef<number>(0);
  const sessionPlayedKeysRef = useRef<Set<string>>(new Set());
  const sessionSkipsRef = useRef<Set<string>>(new Set());
  const sessionLikesRef = useRef<Set<string>>(new Set());
  const lastTrackStartTimeRef = useRef<number>(Date.now());
  const lastTrackKeyRef = useRef<string | null>(null);

  useEffect(() => {
    lastExpandedIndexRef.current = null;
  }, [activeMixContext, isWaveActive]);

  useEffect(() => {
    if (!state || state.queue_index === null) return;
    const curTrack = state.queue[state.queue_index];
    if (!curTrack) return;
    const curKey = semanticTrackKey(curTrack);

    if (lastTrackKeyRef.current && lastTrackKeyRef.current !== curKey) {
      const timeSpentMs = Date.now() - lastTrackStartTimeRef.current;
      // Если предыдущий трек играл меньше 15 секунд при не остановленном плеере — это явный skip
      if (timeSpentMs < 15000 && state.player?.status !== "stopped") {
        sessionSkipsRef.current.add(lastTrackKeyRef.current);
      } else {
        sessionPlayedKeysRef.current.add(lastTrackKeyRef.current);
      }
    }

    lastTrackKeyRef.current = curKey;
    lastTrackStartTimeRef.current = Date.now();
  }, [state?.queue_index, state?.player?.status]);

  const expandQueueTracks = useCallback(
    async (count = 8, force = false): Promise<TrackRef[]> => {
      if (!force && (expandingQueueRef.current || Date.now() - lastExpandedTimeRef.current < 3000)) return [];
      expandingQueueRef.current = true;
      lastExpandedTimeRef.current = Date.now();
      try {
        const rawProviders = await api.getWaveProviders().catch(() => "all");
        const fresh = await api.getState().catch(() => state);
        const currentQueue = fresh?.queue ?? state?.queue ?? [];
        const currentIndex = fresh?.queue_index ?? state?.queue_index ?? 0;

        if (isWaveActive) {
          // Волна (My Wave): непрерывный поток
          const waveSource = (await api.getWaveSource().catch(() => "favorites")) as "favorites" | "playlists";
          const more = await api.getWaveRecommendations(waveSource, count * 2, null, rawProviders).catch(() => []);
          const existingKeys = new Set(currentQueue.map(trackKey));
          const existingSemantics = new Set(currentQueue.map(semanticTrackKey));
          const chunk = more
            .filter((t) => !existingKeys.has(trackKey(t)) && !existingSemantics.has(semanticTrackKey(t)))
            .slice(0, count);
          if (chunk.length > 0) {
            setWaveTracks((prev) => dedupe([...prev, ...chunk]));
            for (const t of chunk) {
              await api.addToQueue(t);
            }
            await refresh();
          }
          return chunk;
        }

        // Единый бэкенд Autoplay / Infinite Queue / Smart Shuffle:
        const currentTrack = currentQueue[currentIndex] ?? null;
        const recentPlayed = currentQueue.slice(Math.max(0, currentIndex - 15), currentIndex);
        const remainingQueue = currentQueue.slice(currentIndex + 1);

        const context: QueueContext = {
          current_track: currentTrack,
          recent_played: recentPlayed,
          remaining_queue: remainingQueue,
          session_played_keys: Array.from(sessionPlayedKeysRef.current),
          feedback_skips: Array.from(sessionSkipsRef.current),
          feedback_likes: Array.from(sessionLikesRef.current),
        };

        const chunk = await api.getNextAutoplayChunk(context, count, rawProviders).catch((err) => {
          console.warn("Autoplay chunk error:", err);
          return [];
        });

        if (chunk.length > 0) {
          for (const track of chunk) {
            await api.addToQueue(track);
          }
          await refresh();
        }
        return chunk;
      } catch (e) {
        console.warn("expandQueueTracks error:", e);
        return [];
      } finally {
        expandingQueueRef.current = false;
      }
    },
    [activeMixContext, isWaveActive, state, refresh],
  );

  const playNextTrack = useCallback(async () => {
    if (!state) return;
    const qIndex = state.queue_index ?? 0;
    const qLen = state.queue.length;

    const isAutoSimilarEnabled = localStorage.getItem("vessel_auto_similar") !== "false";
    const isInfiniteMode = isWaveActive || !!activeMixContext || isAutoSimilarEnabled;

    if (qIndex >= qLen - 1) {
      // Очередь закончилась: умное перемешивание завершает работу внутри этой очереди
      if (smartShuffle) {
        setSmartShuffle(false);
        setSmartTrackKeys(new Set());
      }

      if (isInfiniteMode) {
        showToast(
          isWaveActive
            ? (lang === "ru" ? "Генерация волны..." : "Generating wave...")
            : activeMixContext
              ? (lang === "ru" ? "Продолжение микса..." : "Continuing mix...")
              : (lang === "ru" ? "Автопродолжение очереди..." : "Autoplaying next tracks..."),
          false,
          2000
        );
        const added = await expandQueueTracks(8, true);
        if (added.length > 0) {
          await api.next();
          await refresh();
          return;
        }
      }
    }

    try {
      await api.next();
      await refresh();
    } catch (err) {
      showToast(String(err), true);
    }
  }, [state, isWaveActive, activeMixContext, smartShuffle, expandQueueTracks, refresh, lang, showToast]);

  useEffect(() => {
    if (!state || state.queue.length === 0 || state.queue_index === null) return;
    const isAutoSimilarEnabled = localStorage.getItem("vessel_auto_similar") !== "false";
    const shouldAutoplay = isWaveActive || !!activeMixContext || isAutoSimilarEnabled;
    if (!shouldAutoplay) return;

    // Упреждающий префетч автопродолжения: когда до конца очереди остаётся <= 2 треков
    const remaining = state.queue.length - 1 - state.queue_index;
    const isNearEnd = remaining <= 2;
    const isPlayingOrBuffering =
      state.player?.status === "playing" || state.player?.status === "buffering";

    if (
      isPlayingOrBuffering &&
      isNearEnd &&
      !expandingQueueRef.current &&
      lastExpandedIndexRef.current !== state.queue_index
    ) {
      lastExpandedIndexRef.current = state.queue_index;
      void expandQueueTracks(8);
    }
  }, [
    state?.queue_index,
    state?.queue.length,
    state?.player?.status,
    activeMixContext,
    isWaveActive,
    expandQueueTracks,
  ]);

  const toggleShuffle = useCallback(async () => {
    if (!state) return;
    const nextVal = !state.player.shuffle;
    try {
      await api.setShuffle(nextVal);
      await refresh();
      showToast(
        lang === "ru"
          ? (nextVal ? "Случайный порядок включён" : "Случайный порядок выключен")
          : (nextVal ? "Shuffle on" : "Shuffle off")
      );
    } catch (e) {
      showToast(String(e), true);
    }
  }, [state, lang, refresh, showToast]);

  const toggleSmartShuffle = useCallback(async () => {
    if (!state) return;
    if (smartShuffle) {
      // Выключаем умное перемешивание для текущей очереди
      setSmartShuffle(false);
      try {
        const fresh = await api.getState().catch(() => state);
        if (fresh && fresh.queue_index !== null) {
          const curIdx = fresh.queue_index;
          const played = fresh.queue.slice(0, curIdx + 1);
          const unplayedClean = fresh.queue.slice(curIdx + 1).filter(
            (t) => t.origin !== "smart_shuffle" && !smartTrackKeys.has(trackKey(t))
          );
          const newQueue = [...played, ...unplayedClean];
          if (newQueue.length !== fresh.queue.length) {
            await api.reorderQueue(newQueue);
          }
        }
        setSmartTrackKeys(new Set());
        await refresh();
        showToast(lang === "ru" ? "Умное перемешивание выключено" : "Smart Shuffle off");
      } catch (e) {
        showToast(String(e), true);
      }
    } else {
      // Включаем умное перемешивание для текущей очереди
      const fresh = await api.getState().catch(() => state);
      const currentQueue = fresh?.queue ?? state.queue ?? [];
      const currentIndex = fresh?.queue_index ?? state.queue_index ?? 0;
      if (currentQueue.length === 0) {
        showToast(lang === "ru" ? "Очередь пуста" : "Queue is empty");
        return;
      }
      try {
        showToast(lang === "ru" ? "Умное перемешивание очереди…" : "Applying Smart Shuffle…", false, 1500);
        const rawProviders = await api.getRecommendationProviders().catch(() => "all");
        const res = await api.applySmartShuffle(currentQueue, currentIndex, rawProviders);
        if (res && res.interleaved_queue.length > 0) {
          setSmartTrackKeys(new Set(res.injected_track_keys));
          setSmartShuffle(true);
          await refresh();
          showToast(lang === "ru" ? "Умное перемешивание включено" : "Smart Shuffle on");
        }
      } catch (e) {
        showToast(String(e), true);
      }
    }
  }, [state, smartShuffle, smartTrackKeys, lang, refresh, showToast]);

  const cycleShuffleMode = useCallback(async () => {
    if (!state) return;
    const isStandardShuffle = !!state.player.shuffle && !smartShuffle;
    const isSmartShuffle = smartShuffle;

    if (!isStandardShuffle && !isSmartShuffle) {
      // 1. Off -> Standard Shuffle
      setSmartShuffle(false);
      try {
        await api.setShuffle(true);
        await refresh();
        showToast(lang === "ru" ? "Случайный порядок" : "Shuffle");
      } catch (e) {
        showToast(String(e), true);
      }
    } else if (isStandardShuffle) {
      // 2. Standard Shuffle -> Smart Shuffle (организует только текущую очередь)
      try {
        await api.setShuffle(false);
        const fresh = await api.getState().catch(() => state);
        const currentQueue = fresh?.queue ?? state.queue ?? [];
        const currentIndex = fresh?.queue_index ?? state.queue_index ?? 0;
        if (currentQueue.length === 0) {
          showToast(lang === "ru" ? "Очередь пуста" : "Queue is empty");
          return;
        }
        showToast(lang === "ru" ? "Умное перемешивание очереди…" : "Applying Smart Shuffle…", false, 1500);
        const rawProviders = await api.getRecommendationProviders().catch(() => "all");
        const res = await api.applySmartShuffle(currentQueue, currentIndex, rawProviders);
        if (res && res.interleaved_queue.length > 0) {
          setSmartTrackKeys(new Set(res.injected_track_keys));
          setSmartShuffle(true);
          await refresh();
          showToast(lang === "ru" ? "Умное перемешивание" : "Smart Shuffle");
        }
      } catch (e) {
        showToast(String(e), true);
      }
    } else {
      // 3. Smart Shuffle -> Off
      setSmartShuffle(false);
      try {
        await api.setShuffle(false);
        const fresh = await api.getState().catch(() => state);
        if (fresh && fresh.queue_index !== null) {
          const curIdx = fresh.queue_index;
          const played = fresh.queue.slice(0, curIdx + 1);
          const unplayedClean = fresh.queue.slice(curIdx + 1).filter(
            (t) => t.origin !== "smart_shuffle" && !smartTrackKeys.has(trackKey(t))
          );
          const newQueue = [...played, ...unplayedClean];
          if (newQueue.length !== fresh.queue.length) {
            await api.reorderQueue(newQueue);
          }
        }
        setSmartTrackKeys(new Set());
        await refresh();
        showToast(lang === "ru" ? "Перемешивание выключено" : "Shuffle off");
      } catch (e) {
        showToast(String(e), true);
      }
    }
  }, [state, smartShuffle, smartTrackKeys, lang, refresh, showToast]);

  return (
    <AppContext.Provider
      value={{
        state,
        favoriteKeysSet,
        cacheProgress,
        toast,
        toastError,
        playlists,
        view,
        playlistId,
        artist,
        artistProvider,
        artistId,
        setView,
        navigateTo,
        canGoBack,
        goBack,
        sidebarCollapsed,
        setSidebarCollapsed,
        toggleSidebarCollapsed,
        showToast,
        isSettingsOpen,
        setIsSettingsOpen,
        openSettings,
        closeSettings,
        playTracks,
        refresh,
        lang,
        waveTracks,
        setWaveTracks,
        isWaveActive,
        setIsWaveActive,
        activeMixContext,
        setActiveMixContext,
        externalPlaylist,
        setExternalPlaylist,
        expandQueueTracks,
        playNextTrack,
        smartShuffle,
        setSmartShuffle,
        smartTrackKeys,
        toggleShuffle,
        toggleSmartShuffle,
        cycleShuffleMode,
        fullscreenOpen,
        setFullscreenOpen,
        searchQuery,
        setSearchQuery,
        searchProvider,
        setSearchProvider,
        hasEverPlayed,
        setHasEverPlayed,
        isAuthModalOpen,
        setIsAuthModalOpen,
        openAuthModal,
        closeAuthModal,
        isMigrationModalOpen,
        setIsMigrationModalOpen,
        logoutAccount,
        continueGuest,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp(): AppStore {
  const store = useContext(AppContext);
  if (!store) throw new Error("useApp must be used within AppProvider");
  return store;
}
