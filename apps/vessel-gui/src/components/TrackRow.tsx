import { useState, useRef, useEffect } from "react";

import { useApp } from "../store";
import {
  formatDuration,
  artistLabel,
  providerLabel,
  isFavorite,
  trackKey,
  canPlay,
  resolveArtworkUrl,
} from "../lib/utils";
import { t } from "../i18n";
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
  const { state, showToast, refresh, lang } = useApp();
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
      showToast(`${t(lang, "trackrow.addedToQueue")} ${track.title}`);
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const handlePlayNext = async () => {
    closeAll();
    try {
      await api.playNext(track);
      showToast(`${t(lang, "trackrow.playNextToast")} ${track.title}`);
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const handleDownload = async () => {
    closeAll();
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

  const addToPlaylist = async (playlistId: string) => {
    closeAll();
    try {
      await api.addToPlaylist(playlistId, track);
      showToast(t(lang, "trackrow.addedToPlaylist"));
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
            {track.artists.length > 0
              ? track.artists.map((artist, i) => (
                  <span key={`${artist}-${i}`}>
                    <span
                      style={{
                        cursor: onArtistClick ? "pointer" : undefined,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (onArtistClick) onArtistClick(artist, track.provider);
                      }}
                    >
                      {artist}
                    </span>
                    {i < track.artists.length - 1 ? ", " : ""}
                  </span>
                ))
              : artistLabel([])}
          </span>
        </div>
        {showAlbum ? <span className="c-album">—</span> : <span />}
        <span className="c-src">
          {!playable ? (
            <span className="badge-unav">{t(lang, "trackrow.unavailable")}</span>
          ) : (
            <span className="src">{providerLabel(track.provider)}</span>
          )}
          <span className="row-actions">
            <button
              type="button"
              className={`heart ${fav ? "active" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                void handleFav();
              }}
              title={t(lang, "trackrow.favorite")}
              aria-label="Like"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>
            </button>
            <button
              type="button"
              className="plus-btn"
              onClick={(e) => {
                e.stopPropagation();
                setPlPicker(true);
              }}
              title={t(lang, "trackrow.addToPlaylist")}
              aria-label="Add to playlist"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
            <i onClick={openMenu} title={t(lang, "trackrow.more")}>
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
          <div className="ctx-item" onClick={handlePlayNext}>{t(lang, "trackrow.playNext")}</div>
          <div className="ctx-item" onClick={handleAddQueue}>{t(lang, "trackrow.addToQueue")}</div>
          <div className="ctx-item" onClick={() => { setMenu(null); setPlPicker(true); }}>
            {t(lang, "trackrow.addToPlaylistCtx")}
          </div>
          <div className="ctx-item" onClick={handleDownload} style={downloading ? { opacity: 0.5 } : undefined}>
            {downloading ? t(lang, "trackrow.downloading") : t(lang, "trackrow.download")}
          </div>
          <div className="ctx-sep" />
          <div className="ctx-item" onClick={handleFav}>{fav ? t(lang, "trackrow.unlike") : t(lang, "trackrow.like")}</div>
          {onRemove && (
            <>
              <div className="ctx-sep" />
              <div className="ctx-item danger" onClick={() => { closeAll(); onRemove(track); }}>
                {t(lang, "trackrow.removeFromPlaylist")}
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
              <span className="ov-title">{t(lang, "trackrow.addToPlaylistCtx")}</span>
              <button className="ov-close" onClick={() => setPlPicker(false)}>
                ✕
              </button>
            </div>
            <div className="playlist-picker-list">
              {state?.playlists.length === 0 && (
                <div className="set-desc" style={{ padding: 12 }}>{t(lang, "trackrow.noPlaylists")}</div>
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
                        src={resolveArtworkUrl(p.cover_url ?? p.tracks[0]?.artwork_url) ?? ""}
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