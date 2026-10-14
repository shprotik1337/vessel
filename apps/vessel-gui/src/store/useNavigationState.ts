import { useCallback, useState } from "react";
import type { NavEntry } from "./storeTypes";

export function useNavigationState() {
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

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const openSettings = useCallback(() => setIsSettingsOpen(true), []);
  const closeSettings = useCallback(() => setIsSettingsOpen(false), []);

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

  return {
    view,
    setView,
    playlistId,
    setPlaylistId,
    artist,
    setArtist,
    artistProvider,
    setArtistProvider,
    artistId,
    setArtistId,
    history,
    canGoBack,
    sidebarCollapsed,
    setSidebarCollapsed,
    toggleSidebarCollapsed,
    isSettingsOpen,
    setIsSettingsOpen,
    openSettings,
    closeSettings,
    navigateTo,
    goBack,
  };
}
