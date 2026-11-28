import { useState, useRef, useEffect, memo } from "react";
import { createPortal } from "react-dom";

import { useApp } from "../store";
import {
  formatDuration,
  artistLabel,
  filterValidArtists,
  isFavorite,
  trackKey,
  canPlay,
  resolveArtworkUrl,
} from "../lib/utils";
import { t } from "../i18n";
import type { TrackRef } from "../api/types";
import { Artwork } from "./Artwork";
import { MiniContextMenu } from "./MiniContextMenu";
import * as api from "../api/commands";

interface TrackRowProps {
  track: TrackRef;
  index: number;
  nowKey?: string | null;
  onPlay: (track: TrackRef) => void;
  onArtistClick?: (name: string, provider: string) => void;
  onRemove?: (track: TrackRef) => void;
  removeLabel?: string;
  showAlbum?: boolean;
  showAdded?: boolean;
  addedLabel?: string;
}

function TrackRowComponent({
  track,
  index,
  nowKey,
  onPlay,
  onArtistClick,
  onRemove,
  removeLabel,
  showAlbum,
  showAdded,
  addedLabel,
}: TrackRowProps) {
  const { state, favoriteKeysSet, showToast, refresh, lang } = useApp();
  const key = trackKey(track);
  const isCurrent = nowKey != null && nowKey === key;
  const isLive =
    isCurrent &&
    (state?.player.status === "playing" || state?.player.status === "buffering");
  const playing = isLive;
  const fav = favoriteKeysSet ? favoriteKeysSet.has(key) : (state ? isFavorite(state.library, track) : false);
  const playable = canPlay(track.capability);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [plPicker, setPlPicker] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

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

  const handlePlayNext = async () => {
    closeAll();
    try {
      await api.playNext(track);
      showToast(`${t(lang, "trackrow.playNextToast")} ${track.title}`);
    } catch (error) {
      showToast(String(error), true);
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
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.min(rect.right + 4, window.innerWidth - 220);
    const y = Math.min(rect.top, window.innerHeight - 260);
    setMenu({ x: Math.max(10, x), y: Math.max(10, y) });
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 220);
    const y = Math.min(e.clientY, window.innerHeight - 260);
    setMenu({ x: Math.max(10, x), y: Math.max(10, y) });
  };

  return (
    <>
      <div
        className={`trow ${playing ? "now" : ""} ${!playable ? "dim" : ""}`}
        onClick={() => {
          if (!playable) return;
          if (isCurrent) {
            void api.togglePlayback();
          } else {
            onPlay(track);
          }
        }}
        onContextMenu={handleContextMenu}
        style={playable ? { cursor: "pointer" } : undefined}
      >
        <span className="c-idx">
          <span className="t-num">{index + 1}</span>
        </span>
        <div className="t-art-wrap">
          <Artwork
            url={track.artwork_url}
            alt={track.title}
            size={48}
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
        </div>
        <div className="c-title">
          <span className="ttl">{track.title}</span>
          <span
            className="sub"
            style={{ display: "flex" }}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const validArtists = filterValidArtists(track.artists);
              return validArtists.length > 0
                ? validArtists.map((artist, i) => (
                    <span key={`${artist}-${i}`}>
                      <span
                        style={{
                          cursor: onArtistClick && track.provider !== "local" ? "pointer" : undefined,
                        }}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onArtistClick && track.provider !== "local") {
                            const targetProv = track.provider === "spotify" ? "deezer" : track.provider;
                            onArtistClick(artist, targetProv);
                          }
                        }}
                      >
                        {artist}
                      </span>
                      {i < validArtists.length - 1 ? ", " : ""}
                    </span>
                  ))
                : artistLabel([]);
            })()}
          </span>
        </div>
        {showAlbum && <span className="c-album">—</span>}
        <span className="c-src">
          <span className="row-actions">
            <button
              type="button"
              className={`row-act-btn heart ${fav ? "active" : ""}`}
              onClick={(e) => {
                e.stopPropagation();
                void handleFav();
              }}
              title={t(lang, "trackrow.favorite")}
              aria-label="Like"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill={fav ? "#ff4060" : "none"} stroke={fav ? "#ff4060" : "currentColor"} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>
            </button>
            <button
              type="button"
              className="row-act-btn plus-btn"
              onClick={(e) => {
                e.stopPropagation();
                setPlPicker(true);
              }}
              title={t(lang, "trackrow.addToPlaylist")}
              aria-label="Add to playlist"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
            </button>
            <button
              type="button"
              className="row-act-btn more-btn"
              onClick={openMenu}
              title={t(lang, "trackrow.more")}
              aria-label="More options"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="2" />
                <circle cx="12" cy="12" r="2" />
                <circle cx="19" cy="12" r="2" />
              </svg>
            </button>
          </span>
        </span>
        {showAdded && <span className="c-added">{addedLabel ?? ""}</span>}
        <span className="c-time">{formatDuration(track.duration_ms)}</span>
      </div>

      <MiniContextMenu
        menu={menu ? { track, x: menu.x, y: menu.y, index } : null}
        onClose={() => setMenu(null)}
        onPlayNext={handlePlayNext}
        onRemoveTrack={onRemove ? () => onRemove(track) : undefined}
        removeLabel={removeLabel}
        lang={lang}
      />

      {plPicker && createPortal(
        <div className="ov show" onMouseDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()}>
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
              {(() => {
                const userPlaylists = (state?.playlists ?? []).filter((p) => !p.is_album);
                if (userPlaylists.length === 0) {
                  return <div className="set-desc" style={{ padding: 12 }}>{t(lang, "trackrow.noPlaylists")}</div>;
                }
                return userPlaylists.map((p) => (
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
                ));
              })()}
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}

export const TrackRow = memo(TrackRowComponent);