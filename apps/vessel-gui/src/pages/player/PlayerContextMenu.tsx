import { useRef, useEffect, useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { TrackRef } from "../../api/types";
import { t, type Lang } from "../../i18n";
import { useApp } from "../../store";
import { resolveArtworkUrl } from "../../lib/utils";
import * as api from "../../api/commands";

export interface ContextMenuState {
  track: TrackRef;
  index: number;
  x: number;
  y: number;
  placement?: "down" | "up";
}

interface PlayerContextMenuProps {
  menu: ContextMenuState | null;
  onClose: () => void;
  onPlayNext: (track: TrackRef) => void;
  onToggleFavorite: (track: TrackRef) => void;
  onCacheTrack: (track: TrackRef) => void;
  onRemoveTrack?: (index: number) => void;
  isFav: boolean;
  lang: Lang;
}

export function PlayerContextMenu({
  menu,
  onClose,
  onPlayNext,
  onToggleFavorite,
  onCacheTrack,
  onRemoveTrack,
  isFav,
  lang,
}: PlayerContextMenuProps) {
  const { state, showToast, refresh } = useApp();
  const menuRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const [pickerTrack, setPickerTrack] = useState<TrackRef | null>(null);
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    if (!menu) return;
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
    if (rect.right > window.innerWidth - 16) {
      const overflow = rect.right - (window.innerWidth - 16);
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
    } else if (rect.bottom > window.innerHeight - 16) {
      const overflow = rect.bottom - (window.innerHeight - 16);
      el.style.top = `${Math.max(12, rect.top - overflow)}px`;
    }
  }, [menu]);

  const handleAddQueue = async (track: TrackRef) => {
    onClose();
    try {
      await api.addToQueue(track);
      showToast(`${t(lang, "trackrow.addedToQueue")} ${track.title}`);
      await refresh();
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const handleDownload = async (track: TrackRef) => {
    onClose();
    setDownloading(true);
    showToast(`${t(lang, "trackrow.downloadingTrack")} ${track.title}…`);
    try {
      const path = await api.downloadTrack(track);
      showToast(`${t(lang, "trackrow.downloaded")} ${path}`);
    } catch (error) {
      showToast(String(error), true);
    } finally {
      setDownloading(false);
    }
  };

  const handleAddToPlaylist = async (playlistId: string) => {
    if (!pickerTrack) return;
    const targetTrack = pickerTrack;
    setPickerTrack(null);
    try {
      await api.addToPlaylist(playlistId, targetTrack);
      showToast(t(lang, "trackrow.addedToPlaylist"));
      await refresh();
    } catch (error) {
      showToast(String(error), true);
    }
  };

  if (!menu && !pickerTrack) return null;

  return (
    <>
      {menu &&
        createPortal(
          <div
            ref={menuRef}
            className="ctx show"
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
            onClick={(e) => e.stopPropagation()}
          >
            <div className="ctx-head">{menu.track.title}</div>
            <div className="ctx-item" onClick={() => onPlayNext(menu.track)}>
              {t(lang, "trackrow.playNext")}
            </div>
            <div className="ctx-item" onClick={() => void handleAddQueue(menu.track)}>
              {t(lang, "trackrow.addToQueue")}
            </div>
            <div
              className="ctx-item"
              onClick={() => {
                const target = menu.track;
                onClose();
                setPickerTrack(target);
              }}
            >
              {t(lang, "trackrow.addToPlaylistCtx")}
            </div>
            <div className="ctx-item" onClick={() => onCacheTrack(menu.track)}>
              {lang === "ru" ? "Сохранить в кэш" : "Save to cache"}
            </div>
            <div
              className="ctx-item"
              onClick={() => void handleDownload(menu.track)}
              style={downloading ? { opacity: 0.5 } : undefined}
            >
              {downloading ? t(lang, "trackrow.downloading") : t(lang, "trackrow.download")}
            </div>
            <div className="ctx-sep" />
            <div className="ctx-item" onClick={() => onToggleFavorite(menu.track)}>
              {isFav ? t(lang, "trackrow.unlike") : t(lang, "trackrow.like")}
            </div>
            {onRemoveTrack && menu.index >= 0 && (
              <>
                <div className="ctx-sep" />
                <div className="ctx-item danger" onClick={() => onRemoveTrack(menu.index)}>
                  {lang === "ru" ? "Удалить из очереди" : "Remove from queue"}
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
            style={{ zIndex: 100000 }}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div
              ref={pickerRef}
              className="playlist-picker-card"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="playlist-picker-head">
                <span className="ov-title">{t(lang, "trackrow.addToPlaylistCtx")}</span>
                <button className="ov-close" onClick={() => setPickerTrack(null)}>
                  ✕
                </button>
              </div>
              <div className="playlist-picker-list">
                {state?.playlists.length === 0 && (
                  <div className="set-desc" style={{ padding: 12 }}>
                    {t(lang, "trackrow.noPlaylists")}
                  </div>
                )}
                {state?.playlists.map((p) => (
                  <div
                    key={p.id}
                    className="playlist-picker-item"
                    onClick={() => void handleAddToPlaylist(p.id)}
                  >
                    {p.cover_url || p.tracks[0]?.artwork_url ? (
                      <div
                        className="pl-mark"
                        style={{ background: "var(--track)", overflow: "hidden" }}
                      >
                        <img
                          src={resolveArtworkUrl(p.cover_url ?? p.tracks[0]?.artwork_url) ?? ""}
                          alt=""
                          loading="lazy"
                          decoding="async"
                          style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                        />
                      </div>
                    ) : (
                      <div
                        className="pl-mark"
                        style={{ background: `var(--track${((p.tracks.length % 4) + 1)})` }}
                      />
                    )}
                    {p.title}
                  </div>
                ))}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
