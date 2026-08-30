import { useRef, useState } from "react";

import { useApp } from "../store";
import { formatTime, artistLabel, providerLabel, isFavorite } from "../lib/utils";
import { Artwork } from "./Artwork";
import * as api from "../api/commands";

export function BottomPlayer() {
  const { state, showToast, refresh, navigateTo } = useApp();
  if (!state) return null;

  const track = state.now_playing;
  const player = state.player;
  const fav = track ? isFavorite(state.library, track) : false;
  const seekBarRef = useRef<HTMLDivElement>(null);
  const volBarRef = useRef<HTMLDivElement>(null);
  const [dragPercent, setDragPercent] = useState<number | null>(null);

  const percent =
    player.duration_ms > 0
      ? Math.min(100, Math.max(0, (player.position_ms / player.duration_ms) * 100))
      : 0;
  const shownPercent = dragPercent ?? percent;
  const shownMs = dragPercent != null && player.duration_ms > 0
    ? (dragPercent / 100) * player.duration_ms
    : player.position_ms;

  const seekFromEvent = async (clientX: number, commit: boolean) => {
    if (!seekBarRef.current) return;
    const rect = seekBarRef.current.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const pct = ratio * 100;
    if (!commit) {
      setDragPercent(pct);
      return;
    }
    if (!player.duration_ms) {
      setDragPercent(null);
      return;
    }
    const ms = Math.round(ratio * player.duration_ms);
    try {
      await api.seek(ms);
      await refresh();
    } catch (error) {
      showToast(String(error), true);
    } finally {
      setDragPercent(null);
    }
  };

  const onSeekPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    seekFromEvent(e.clientX, false);
    const move = (ev: PointerEvent) => {
      ev.preventDefault();
      seekFromEvent(ev.clientX, false);
    };
    const up = async (ev: PointerEvent) => {
      await seekFromEvent(ev.clientX, true);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const volFromEvent = (clientX: number) => {
    if (!volBarRef.current) return;
    const rect = volBarRef.current.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    void api
      .setVolume(Math.round(ratio * 100))
      .catch((error) => showToast(String(error), true));
  };

  const onVolPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    volFromEvent(e.clientX);
    const move = (ev: PointerEvent) => {
      ev.preventDefault();
      volFromEvent(ev.clientX);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const handleToggle = async () => {
    try {
      await api.togglePlayback();
      await refresh();
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const handleNext = async () => {
    try {
      await api.next();
      await refresh();
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const handlePrev = async () => {
    try {
      await api.previous();
      await refresh();
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const handleFav = async () => {
    if (!track) return;
    try {
      await api.toggleFavorite(track);
      await refresh();
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const handleShuffle = async () => {
    try {
      await api.setShuffle(!player.shuffle);
      await refresh();
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const handleRepeat = async () => {
    const next = player.repeat === "off" ? "all" : player.repeat === "all" ? "one" : "off";
    try {
      await api.setRepeat(next);
      await refresh();
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const playing = player.status === "playing" || player.status === "buffering";

  return (
    <footer className="player">
      <div className="pl-left">
        {track ? (
          <Artwork
            url={track.artwork_url}
            alt={track.title}
            className="pl-art"
            seed={track.id.length}
          />
        ) : (
          <div className="pl-art" style={{ background: "var(--elev)" }} />
        )}
        <div className="pl-meta">
          <span className="ttl">{track?.title ?? "No track"}</span>
          <div className="pl-sub">
            <span
              style={{ cursor: track && track.artists[0] ? "pointer" : undefined }}
              onClick={(e) => {
                e.stopPropagation();
                if (track?.artists[0]) navigateTo("artist", { artist: track.artists[0], provider: track.provider });
              }}
            >
              {track ? artistLabel(track.artists) : ""}
            </span>
            {track && <span className="dot" />}
            <span className="pl-src">{track ? providerLabel(track.provider) : ""}</span>
          </div>
        </div>
        <button className={`pl-fav ${fav ? "on" : ""}`} onClick={handleFav} title="Favorite">
          {fav ? "♥" : "♡"}
        </button>
      </div>
      <div className="pl-center">
        <div className="pl-controls">
          <button
            className={`p-btn ${player.shuffle ? "" : "muted"}`}
            onClick={handleShuffle}
            title="Shuffle"
          >
            🔀
          </button>
          <button className="p-btn" onClick={handlePrev} title="Previous">
            ⏮
          </button>
          <button className="p-play" onClick={handleToggle} title="Play / Pause" type="button">
            {playing ? "⏸" : "▶"}
          </button>
          <button className="p-btn" onClick={handleNext} title="Next">
            ⏭
          </button>
          <button
            className={`p-btn ${player.repeat === "off" ? "muted" : ""}`}
            onClick={handleRepeat}
            title="Repeat"
          >
            {player.repeat === "one" ? "🔂" : "🔁"}
          </button>
        </div>
        <div className="pl-progress">
          <span className="pl-time">{formatTime(shownMs)}</span>
          <div ref={seekBarRef} className="pl-bar" onPointerDown={onSeekPointerDown}>
            <div className="fill" style={{ width: `${shownPercent}%` }} />
            <div className="knob" style={{ left: `${shownPercent}%` }} />
          </div>
          <span className="pl-time">{formatTime(player.duration_ms)}</span>
        </div>
      </div>
      <div className="pl-right">
        <button className="p-btn muted" title="Volume">
          {player.volume_percent === 0 ? "🔇" : "🔊"}
        </button>
        <div ref={volBarRef} className="vol-bar" onPointerDown={onVolPointerDown}>
          <div className="fill" style={{ width: `${player.volume_percent}%` }} />
          <div className="knob" style={{ left: `${player.volume_percent}%` }} />
        </div>
      </div>
    </footer>
  );
}
