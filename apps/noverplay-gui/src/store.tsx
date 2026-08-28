import {
  createContext,
  useCallback,
  useContext,
  useEffect,
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
} from "./api/types";
import * as api from "./api/commands";

export interface AppStore {
  state: FullState | null;
  progress: ProgressPayload | null;
  toast: string | null;
  toastError: boolean;
  playlists: Playlist[];
  view: string;
  playlistId: string | null;
  setView: (view: string) => void;
  navigateTo: (view: string, params?: { playlistId?: string }) => void;
  showToast: (message: string, error?: boolean) => void;
  playTracks: (tracks: TrackRef[], start?: number) => Promise<void>;
  refresh: () => Promise<void>;
}

const AppContext = createContext<AppStore | null>(null);

let toastTimer: number | undefined;

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<FullState | null>(null);
  const [progress, setProgress] = useState<ProgressPayload | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const [toastError, setToastError] = useState(false);
  const [view, setView] = useState<string>("home");
  const [playlistId, setPlaylistId] = useState<string | null>(null);
  const initialized = useRef(false);

  const navigateTo = useCallback(
    (target: string, params?: { playlistId?: string }) => {
      if (target === "playlist" && params?.playlistId) {
        setPlaylistId(params.playlistId);
      }
      setView(target);
    },
    [],
  );

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
    if (initialized.current) return;
    initialized.current = true;
    void refresh();

    const unlistenState = listen<FullState>("state", (event) => {
      setState(event.payload);
      setPlaylists(event.payload.playlists);
    });
    const unlistenProgress = listen<ProgressPayload>("progress", (event) => {
      setProgress(event.payload);
    });

    return () => {
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
        setView,
        navigateTo,
        showToast,
        playTracks,
        refresh,
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
