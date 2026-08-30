import { useState, useRef, useEffect } from "react";

import { useApp } from "../store";
import {
  formatDuration,
  artistLabel,
  providerLabel,
  isFavorite,
  trackKey,
  canPlay,
} from "../lib/utils";
import type { TrackRef } from "../api/types";
import { Artwork } from "./Artwork";
import * as api from "../api/commands";

interface TrackRowProps {
  track: TrackRef;
  index: number;
  nowKey?: string | null;
  onPlay: (track: TrackRef) => void;
  onArtistClick?: (name: string, provider: string) => void;
  onRemove?: (track: TrackRef) => void;
  showAlbum?: boolean;
  showAdded?: boolean;
  addedLabel?: string;
}

export function TrackRow({
  track,
  index,
  nowKey,
  onPlay,
  onArtistClick,
  onRemove,
  showAlbum,
  showAdded,
  addedLabel,
}: TrackRowProps) {
  const { state, showToast, refresh } = useApp();
  const key = trackKey(track);
  const isCurrent = nowKey != null && nowKey === key;
  const isLive =
    isCurrent &&
    (state?.player.status === "playing" || state?.player.status === "buffering");
  const playing = isLive;
  const fav = state ? isFavorite(state.library, track) : false;
  const playable = canPlay(track.capability);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [plPicker, setPlPicker] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenu(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenu(null);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [menu]);

  useEffect(() => {
    if (!plPicker) return;
    const close = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPlPicker(false);
      }
    };
    window.addEventListener("mousedown", close);
    return () => window.removeEventListener("mousedown", close);
  }, [plPicker]);

  const closeAll = () => {
    setMenu(null);
    setPlPicker(false);
  };

  const handleFav = async () => {
    closeAll();
    try {
      await api.toggleFavorite(track);
      await refresh();
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const handleAddQueue = async () => {
    closeAll();
    try {
      await api.addToQueue(track);
      showToast(`Added to queue: ${track.title}`);
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const handlePlayNext = async () => {
    closeAll();
    try {
      await api.playNext(track);
      showToast(`Play next: ${track.title}`);
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const handleDownload = async () => {
    closeAll();
    setDownloading(true);
    showToast(`Скачиваю: ${track.title}…`);
    try {
      const path = await api.downloadTrack(track);
      showToast(`Скачано: ${path}`);
    } catch (error) {
      showToast(String(error), true);
    } finally {
      setDownloading(false);
    }
  };

  const addToPlaylist = async (playlistId: string) => {
    closeAll();
    try {
      await api.addToPlaylist(playlistId, track);
      showToast(`Added to playlist`);
      await refresh();
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const openMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setMenu({ x: rect.right + 4, y: rect.top });
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setMenu({ x: e.clientX, y: e.clientY });
  };

  const menuStyle: React.CSSProperties = {
    position: "fixed",
    left: menu ? Math.min(menu.x, window.innerWidth - 220) : 0,
    top: menu ? Math.min(menu.y, window.innerHeight - 200) : 0,
    zIndex: 120,
  };

  return (
    <>
      <div
        className={`trow ${playing ? "now" : ""} ${!playable ? "dim" : ""}`}
        onClick={() => playable && onPlay(track)}
        onContextMenu={handleContextMenu}
        style={playable ? { cursor: "pointer" } : undefined}
      >
        <span className="c-idx">
          {playing ? (
            <span className="eq">
              <i />
              <i />
              <i />
            </span>
          ) : (
            <span className="t-num">{index + 1}</span>
          )}
        </span>
        <Artwork
            url={track.artwork_url}
            alt={track.title}
            size={40}
            seed={track.id.length}
            className="t-art"
            onPlayClick={async () => {
              if (isCurrent) {
                try { await api.togglePlayback(); } catch {}
              } else {
                onPlay(track);
              }
            }}
            isPlaying={playing}
          />
        <div className="c-title">
          <span className="ttl">{track.title}</span>
          <span
            className="sub"
            style={{ display: "flex" }}
            onClick={(e) => e.stopPropagation()}
          >
            <span
              style={{ cursor: onArtistClick && track.artists[0] ? "pointer" : undefined }}
              onClick={(e) => {
                e.stopPropagation();
                if (onArtistClick && track.artists[0])
                  onArtistClick(track.artists[0], track.provider);
              }}
            >
              {artistLabel(track.artists)}
            </span>
          </span>
        </div>
        {showAlbum ? <span className="c-album">—</span> : <span />}
        <span className="c-src">
          {!playable ? (
            <span className="badge-unav">Unavailable</span>
          ) : (
            <span className="src">{providerLabel(track.provider)}</span>
          )}
          <span className="row-actions">
            <i
              className={fav ? "fav" : ""}
              onClick={(e) => {
                e.stopPropagation();
                void handleFav();
              }}
              title="Favorite"
            >
              {fav ? "♥" : "♡"}
            </i>
            <i
              onClick={(e) => {
                e.stopPropagation();
                setPlPicker(true);
              }}
              title="Add to playlist"
            >
              ＋
            </i>
            <i onClick={openMenu} title="More">
              ⋯
            </i>
          </span>
        </span>
        {showAdded ? <span className="c-added">{addedLabel ?? ""}</span> : <span />}
        <span className="c-time">{formatDuration(track.duration_ms)}</span>
      </div>

      {menu && (
        <div ref={menuRef} className="ctx show" style={menuStyle}>
          <div className="ctx-head">{track.title}</div>
          <div className="ctx-item" onClick={handlePlayNext}>Play next</div>
          <div className="ctx-item" onClick={handleAddQueue}>Add to queue</div>
          <div className="ctx-item" onClick={() => { setMenu(null); setPlPicker(true); }}>
            Add to playlist
          </div>
          <div className="ctx-item" onClick={handleDownload} style={downloading ? { opacity: 0.5 } : undefined}>
            {downloading ? "Скачивается…" : "Скачать"}
          </div>
          <div className="ctx-sep" />
          <div className="ctx-item" onClick={handleFav}>{fav ? "Unlike" : "Like"}</div>
          {onRemove && (
            <>
              <div className="ctx-sep" />
              <div className="ctx-item danger" onClick={() => { closeAll(); onRemove(track); }}>
                Remove from playlist
              </div>
            </>
          )}
        </div>
      )}

      {plPicker && (
        <div className="ov show" onMouseDown={(e) => e.stopPropagation()}>
          <div
            ref={pickerRef}
            className="playlist-picker-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="playlist-picker-head">
              <span className="ov-title">Add to playlist</span>
              <button className="ov-close" onClick={() => setPlPicker(false)}>
                ✕
              </button>
            </div>
            <div className="playlist-picker-list">
              {state?.playlists.length === 0 && (
                <div className="set-desc" style={{ padding: 12 }}>No playlists yet</div>
              )}
              {state?.playlists.map((p) => (
                <div
                  key={p.id}
                  className="playlist-picker-item"
                  onClick={() => addToPlaylist(p.id)}
                >
                  {p.cover_url || p.tracks[0]?.artwork_url ? (
                    <div
                      className="pl-mark"
                      style={{ background: "var(--track)", overflow: "hidden" }}
                    >
                      <img
                        src={p.cover_url ?? p.tracks[0]?.artwork_url ?? ""}
                        alt=""
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
        </div>
      )}
    </>
  );
}