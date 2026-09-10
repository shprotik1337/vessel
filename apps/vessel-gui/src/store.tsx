import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { listen } from "@tauri-apps/api/event";

import type {
  FullState,
  Playlist,
  ProgressPayload,
  TrackRef,
} from "./api/types";
import { normalizeLang, type Lang } from "./i18n";
import * as api from "./api/commands";

export interface AppStore {
  state: FullState | null;
  progress: ProgressPayload | null;
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
  goBack: () => void;
  showToast: (message: string, error?: boolean) => void;
  playTracks: (tracks: TrackRef[], start?: number) => Promise<void>;
  refresh: () => Promise<void>;
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

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FullState | null>(null);
  const [progress, setProgress] = useState<ProgressPayload | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [toastError, setToastError] = useState(false);
  const [view, setView] = useState<string>("home");
  const [playlistId, setPlaylistId] = useState<string | null>(null);
  const [artist, setArtist] = useState<string | null>(null);
  const [artistProvider, setArtistProvider] = useState<string | null>(null);
  const [artistId, setArtistId] = useState<string | null>(null);
  const [, setHistory] = useState<NavEntry[]>([]);
  const [waveTracks, setWaveTracks] = useState<TrackRef[]>([]);

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

  const showToast = useCallback((message: string, error = false) => {
    setToast(message);
    setToastError(error);
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => setToast(null), 3500);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const fresh = await api.getState();
      setState(fresh);
      setPlaylists(fresh.playlists);
    } catch (error) {
      console.error("get_state failed", error);
      showToast("Не удалось получить состояние", true);
    }
  }, [showToast]);

  const playTracks = useCallback(
    async (tracks: TrackRef[], start = 0) => {
      try {
        await api.playTracks(tracks, start);
        await refresh();
      } catch (error) {
        showToast(String(error), true);
      }
    },
    [refresh, showToast],
  );

  useEffect(() => {
    void refresh();

    const unlistenState = listen<FullState>("state", (event) => {
      setState(event.payload);
      setPlaylists(event.payload.playlists);
    });
    const unlistenProgress = listen<ProgressPayload>("progress", (event) => {
      setProgress(event.payload);
    });

    const poll = window.setInterval(() => {
      void (async () => {
        try {
          const fresh = await api.getState();
          setState(fresh);
          setPlaylists(fresh.playlists);
        } catch {
          // ignore transient poll failures
        }
      })();
    }, 400);

    return () => {
      window.clearInterval(poll);
      void unlistenState.then((fn) => fn());
      void unlistenProgress.then((fn) => fn());
    };
  }, [refresh]);

  return (
    <AppContext.Provider
      value={{
        state,
        progress,
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
        goBack,
        showToast,
        playTracks,
        refresh,
        lang,
        waveTracks,
        setWaveTracks,
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
