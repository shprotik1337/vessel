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
} from "../api/types";
import { normalizeLang } from "../i18n";
import { setActiveImageProxy } from "../lib/utils";
import * as api from "../api/commands";
import type {
  AppStore,
  CacheCompletePayload,
  CacheProgressPayload,
} from "./storeTypes";
import { useToastState } from "./useToastState";
import { useNavigationState } from "./useNavigationState";
import { useAccountState } from "./useAccountState";
import { useAutoplayAndQueue } from "./useAutoplayAndQueue";

const AppContext = createContext<AppStore | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FullState | null>(null);
  const [hasEverPlayed, setHasEverPlayed] = useState<boolean>(false);
  const [cacheProgress, setCacheProgress] = useState<CacheProgressPayload | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [fullscreenOpen, setFullscreenOpen] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [searchProvider, setSearchProvider] = useState<string>("soundcloud");

  const hasCheckedAuthOnStartupRef = useRef(false);
  const hasTriggeredAutoplayRef = useRef(false);
  const lastAutoCachedTrackKeyRef = useRef<string | null>(null);
  const lastErrorRef = useRef<string | null>(null);

  const { toast, toastError, showToast } = useToastState();

  const {
    view,
    setView,
    playlistId,
    artist,
    artistProvider,
    artistId,
    canGoBack,
    canGoForward,
    sidebarCollapsed,
    setSidebarCollapsed,
    toggleSidebarCollapsed,
    isSettingsOpen,
    setIsSettingsOpen,
    openSettings,
    closeSettings,
    navigateTo,
    goBack,
    goForward,
  } = useNavigationState();

  const favoriteKeysSet = useMemo(() => {
    const set = new Set<string>();
    if (state?.library) {
      for (const t of state.library) {
        set.add(`${t.provider}:${t.id}`);
      }
    }
    return set;
  }, [state?.library]);

  const lang = normalizeLang(state?.language);

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
  }, [showToast, triggerAutoplayLast, setView]);

  const {
    isAuthModalOpen,
    setIsAuthModalOpen,
    isMigrationModalOpen,
    setIsMigrationModalOpen,
    openAuthModal,
    closeAuthModal,
    logoutAccount,
    continueGuest,
  } = useAccountState({
    setView,
    setIsSettingsOpen,
    refresh,
    setState,
    triggerAutoplayLast,
    showToast,
  });

  const {
    waveTracks,
    setWaveTracks,
    isWaveActive,
    setIsWaveActive,
    activeMixContext,
    setActiveMixContext,
    externalPlaylist,
    setExternalPlaylist,
    smartTrackKeys,
    smartShuffle,
    setSmartShuffle,
    expandQueueTracks,
    playNextTrack,
    toggleShuffle,
    toggleSmartShuffle,
    cycleShuffleMode,
    playTracks,
  } = useAutoplayAndQueue({
    state,
    lang,
    refresh,
    showToast,
    setHasEverPlayed,
  });

  // Синхронизация Crossfade и AGC аудиодвижка при старте
  useEffect(() => {
    const cfEnabled = localStorage.getItem("vessel_crossfade_enabled") === "true";
    const cfSec = Number(localStorage.getItem("vessel_crossfade_sec") || 5);
    void api.setCrossfade(cfEnabled ? cfSec * 1000 : 0);
    void api.setAudioAgc(localStorage.getItem("vessel_audio_agc") === "true");
    const autoCacheEnabled = localStorage.getItem("vessel_auto_cache") !== "false";
    void api.setAutoCache(autoCacheEnabled);
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

  useEffect(() => {
    if (state?.player.status === "error" && state?.status_message) {
      if (lastErrorRef.current !== state.status_message) {
        lastErrorRef.current = state.status_message;
        const msg = state.status_message.toLowerCase();
        const isFileCacheErr =
          msg.includes("os error 2") ||
          msg.includes("не удается найти указанный файл") ||
          msg.includes("no such file or directory") ||
          msg.includes("кэш-файл") ||
          msg.includes("локальный кэш");
        if (!isFileCacheErr) {
          showToast(state.status_message, true);
        }
      }
    } else if (state?.player.status !== "error") {
      lastErrorRef.current = null;
    }
  }, [state?.player.status, state?.status_message, showToast]);

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
        canGoForward,
        goForward,
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
