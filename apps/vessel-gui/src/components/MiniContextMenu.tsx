import { useRef, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { TrackRef } from "../api/types";
import { t, type Lang } from "../i18n";
import { useApp } from "../store";
import { resolveArtworkUrl, trackKey } from "../lib/utils";
import * as api from "../api/commands";

export interface MiniContextMenuState {
  track: TrackRef;
  x: number;
  y: number;
  index?: number;
  placement?: "down" | "up";
}

interface MiniContextMenuProps {
  menu: MiniContextMenuState | null;
  onClose: () => void;
  onPlayNext?: (track: TrackRef) => void;
  onRemoveTrack?: (index: number) => void;
  onStation?: (track: TrackRef) => void;
  lang: Lang;
}

export function MiniContextMenu({
  menu,
  onClose,
  onPlayNext,
  onRemoveTrack,
  onStation,
  lang,
}: MiniContextMenuProps) {
  const { state, favoriteKeysSet, showToast, refresh, playTracks } = useApp();
  const menuRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [pickerTrack, setPickerTrack] = useState<TrackRef | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloaded, setDownloaded] = useState(false);

  const track = menu?.track;
  const key = track ? trackKey(track) : "";
  const isFav = favoriteKeysSet && key ? favoriteKeysSet.has(key) : false;
  const userPlaylists = (state?.playlists ?? []).filter((pl) => !pl.is_album);

  useEffect(() => {
    if (!menu) return;
    setDownloaded(false);
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menu, onClose]);

  useEffect(() => {
    if (!pickerTrack) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerTrack(null);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPickerTrack(null);
    };
    window.addEventListener("mousedown", handleMouseDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("mousedown", handleMouseDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [pickerTrack]);

  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const el = menuRef.current;
    const rect = el.getBoundingClientRect();
    if (rect.right > window.innerWidth - 14) {
      const overflow = rect.right - (window.innerWidth - 14);
      el.style.left = `${Math.max(12, rect.left - overflow)}px`;
    } else if (rect.left < 12) {
      el.style.left = "12px";
    }
    if (menu.placement === "up") {
      if (rect.top < 12) {
        const overflowTop = 12 - rect.top;
        const currentBottom = parseFloat(el.style.bottom || "0");
        el.style.bottom = `${Math.max(12, currentBottom - overflowTop)}px`;
      }
    } else if (rect.bottom > window.innerHeight - 14) {
      const overflow = rect.bottom - (window.innerHeight - 14);
      el.style.top = `${Math.max(12, rect.top - overflow)}px`;
    }
  }, [menu]);

  const handleToggleFav = async () => {
    if (!track) return;
    onClose();
    try {
      await api.toggleFavorite(track);
      await refresh();
      showToast(isFav ? t(lang, "trackrow.unlike") : t(lang, "trackrow.like"));
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const handleDownload = async () => {
    if (!track || downloading) return;
    setDownloading(true);
    showToast(lang === "ru" ? `Скачивание: ${track.title}…` : `Downloading: ${track.title}…`);
    try {
      await api.downloadTrackToCache(track);
      setDownloaded(true);
      showToast(lang === "ru" ? `Скачано в память: ${track.title}` : `Downloaded: ${track.title}`);
    } catch {
      try {
        await api.downloadTrack(track);
        setDownloaded(true);
        showToast(lang === "ru" ? `Сохранено на диск: ${track.title}` : `Saved to disk: ${track.title}`);
      } catch (err2) {
        showToast(String(err2), true);
      }
    } finally {
      setDownloading(false);
      onClose();
    }
  };

  const handleShare = async () => {
    if (!track) return;
    const shareText = `${track.title} — ${track.artists.join(", ")}`;
    try {
      await navigator.clipboard.writeText(shareText);
      showToast(lang === "ru" ? "Скопировано в буфер обмена" : "Copied to clipboard");
    } catch {
      showToast(shareText);
    }
    onClose();
  };

  const handleStartStation = async () => {
    if (!track) return;
    onClose();
    if (onStation) {
      onStation(track);
      return;
    }
    try {
      const recs = await api.getWaveRecommendations(track.title, 20);
      if (recs && recs.length > 0) {
        await playTracks([track, ...recs], 0);
        showToast(lang === "ru" ? `Моя волна по треку: ${track.title}` : `Radio started for: ${track.title}`);
      } else {
        await playTracks([track], 0);
      }
    } catch (e) {
      showToast(String(e), true);
    }
  };

  const handlePlayNextInternal = async () => {
    if (!track) return;
    onClose();
    if (onPlayNext) {
      onPlayNext(track);
      return;
    }
    try {
      await api.playNext(track);
      showToast(`${t(lang, "trackrow.playNextToast")} ${track.title}`);
    } catch (e) {
      showToast(String(e), true);
    }
  };

  const handleAddQueue = async () => {
    if (!track) return;
    onClose();
    try {
      await api.addToQueue(track);
      showToast(`${t(lang, "trackrow.addedToQueue")} ${track.title}`);
    } catch (e) {
      showToast(String(e), true);
    }
  };

  const handleAddToPlaylist = async (playlistId: string) => {
    if (!pickerTrack) return;
    const target = pickerTrack;
    setPickerTrack(null);
    try {
      await api.addToPlaylist(playlistId, target);
      showToast(t(lang, "trackrow.addedToPlaylist"));
      await refresh();
    } catch (e) {
      showToast(String(e), true);
    }
  };

  if (!menu && !pickerTrack) return null;

  return (
    <>
      {menu && track &&
        createPortal(
          <div
            ref={menuRef}
            className="mini-ctx-menu show"
            style={
              menu.placement === "up"
                ? {
                    position: "fixed",
                    left: menu.x,
                    bottom: Math.max(12, window.innerHeight - menu.y),
                    zIndex: 99999,
                  }
                : {
                    position: "fixed",
                    left: menu.x,
                    top: menu.y,
                    zIndex: 99999,
                  }
            }
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
          >
            {/* 1. Начать станцию */}
            <div className="mini-ctx-item" onClick={handleStartStation}>
              <span className="mini-ctx-item-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="2" fill="currentColor" />
                  <path d="M16.24 7.76a6 6 0 0 1 0 8.49m-8.48-.01a6 6 0 0 1 0-8.49m11.31-2.82a10 10 0 0 1 0 14.14m-14.14 0a10 10 0 0 1 0-14.14" />
                </svg>
              </span>
              <span>{lang === "ru" ? "Начать станцию" : "Start station"}</span>
            </div>

            {/* 2. Играть следующим */}
            <div className="mini-ctx-item" onClick={handlePlayNextInternal}>
              <span className="mini-ctx-item-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="5" y1="4" x2="5" y2="20" strokeWidth="2.4" />
                  <polygon points="9 5 19 12 9 19" fill="none" strokeWidth="2" strokeLinejoin="round" />
                </svg>
              </span>
              <span>{t(lang, "trackrow.playNext")}</span>
            </div>

            {/* 3. Добавить в очередь */}
            <div className="mini-ctx-item" onClick={handleAddQueue}>
              <span className="mini-ctx-item-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="3.5" y1="6" x2="15.5" y2="6" strokeWidth="2.2" />
                  <line x1="3.5" y1="12" x2="15.5" y2="12" strokeWidth="2.2" />
                  <line x1="3.5" y1="18" x2="9.5" y2="18" strokeWidth="2.2" />
                  <line x1="15" y1="18" x2="21" y2="18" strokeWidth="2.2" />
                  <line x1="18" y1="15" x2="18" y2="21" strokeWidth="2.2" />
                </svg>
              </span>
              <span>{t(lang, "trackrow.addToQueue")}</span>
            </div>

            {/* 4. Нравится */}
            <div className="mini-ctx-item" onClick={handleToggleFav}>
              <span className="mini-ctx-item-icon" style={isFav ? { color: "#ff4060" } : undefined}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill={isFav ? "#ff4060" : "none"} stroke={isFav ? "#ff4060" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                </svg>
              </span>
              <span>{isFav ? (lang === "ru" ? "В любимых" : "Favorited") : (lang === "ru" ? "Нравится" : "Like")}</span>
            </div>

            {/* 5. Добавить в плейлист */}
            <div
              className="mini-ctx-item"
              onClick={() => {
                const target = track;
                onClose();
                setPickerTrack(target);
              }}
            >
              <span className="mini-ctx-item-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
              </span>
              <span>{t(lang, "trackrow.addToPlaylistCtx")}</span>
            </div>

            {/* 6. Скачать */}
            <div className="mini-ctx-item" onClick={handleDownload}>
              <span className="mini-ctx-item-icon">
                {downloaded ? (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                    <polyline points="7 10 12 15 17 10" />
                    <line x1="12" y1="15" x2="12" y2="3" />
                  </svg>
                )}
              </span>
              <span>{downloaded ? (lang === "ru" ? "Скачано" : "Downloaded") : (lang === "ru" ? "Скачать" : "Download")}</span>
            </div>

            {/* 7. Поделиться */}
            <div className="mini-ctx-item" onClick={handleShare}>
              <span className="mini-ctx-item-icon">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
                  <polyline points="16 6 12 2 8 6" />
                  <line x1="12" y1="2" x2="12" y2="15" />
                </svg>
              </span>
              <span>{lang === "ru" ? "Поделиться" : "Share"}</span>
            </div>

            {onRemoveTrack && menu.index !== undefined && menu.index >= 0 && (
              <>
                <div className="mini-ctx-sep" />
                <div
                  className="mini-ctx-item danger"
                  onClick={() => {
                    onClose();
                    onRemoveTrack(menu.index!);
                  }}
                >
                  <span className="mini-ctx-item-icon">
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </span>
                  <span>{lang === "ru" ? "Удалить из очереди" : "Remove from queue"}</span>
                </div>
              </>
            )}
          </div>,
          document.body
        )}

      {pickerTrack &&
        createPortal(
          <div
            className="ov show"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setPickerTrack(null)}
          >
            <div
              ref={pickerRef}
              className="playlist-picker-card"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="playlist-picker-head">
                <span className="ov-title">{lang === "ru" ? "Выбрать плейлист" : "Select playlist"}</span>
                <button
                  type="button"
                  className="ov-close"
                  onClick={() => setPickerTrack(null)}
                >
                  ✕
                </button>
              </div>
              <div className="playlist-picker-list">
                {userPlaylists.length > 0 ? (
                  userPlaylists.map((pl) => {
                    const thumbUrl = resolveArtworkUrl(pl.cover_url ?? pl.tracks[0]?.artwork_url);
                    return (
                      <div
                        key={pl.id}
                        className="playlist-picker-item"
                        onClick={() => void handleAddToPlaylist(pl.id)}
                      >
                        {thumbUrl ? (
                          <div className="pl-mark" style={{ background: "var(--track)", overflow: "hidden", width: 22, height: 22, borderRadius: 3, flexShrink: 0 }}>
                            <img
                              src={thumbUrl}
                              alt=""
                              loading="lazy"
                              decoding="async"
                              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                            />
                          </div>
                        ) : (
                          <div className="pl-mark" style={{ background: "var(--elev)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, borderRadius: 3, width: 22, height: 22, flexShrink: 0 }}>
                            ♫
                          </div>
                        )}
                        <span>{pl.title}</span>
                      </div>
                    );
                  })
                ) : (
                  <div style={{ padding: "16px", color: "var(--text3)", textAlign: "center", fontSize: 13 }}>
                    {lang === "ru" ? "Нет созданных плейлистов" : "No playlists found"}
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
