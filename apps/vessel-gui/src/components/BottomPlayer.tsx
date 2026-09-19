import { useRef, useState } from "react";

import { useApp } from "../store";
import { useCustomization } from "../customization";
import { formatTime, providerLabel, isFavorite, filterValidArtists } from "../lib/utils";
import { t } from "../i18n";
import { Artwork } from "./Artwork";
import * as api from "../api/commands";

const HEART_SVG = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>
);

const SHUFFLE_SVG = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
);

const PREV_SVG = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M6 5h2v14H6zM20 5v14l-11-7z"/></svg>
);

const NEXT_SVG = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M16 5h2v14h-2zM4 5v14l11-7z"/></svg>
);

const REPEAT_SVG = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
);

const PLAY_SVG = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><path d="M7 4l14 8-14 8V4z"/></svg>
);

const PAUSE_SVG = (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1"/><rect x="14" y="5" width="4" height="14" rx="1"/></svg>
);

const VOLUME_SVG = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>
);

const MUTE_SVG = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/></svg>
);

const FULLSCREEN_SVG = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 3 21 3 21 9" />
    <polyline points="9 21 3 21 3 15" />
    <line x1="21" y1="3" x2="14" y2="10" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </svg>
);

export function BottomPlayer() {
  const { state, showToast, refresh, navigateTo, lang, fullscreenOpen, setFullscreenOpen } = useApp();
  const {
    isEditMode,
    config,
    setPlayerPosition,
    setPlayerHeight,
    setPlayerWidthPercent,
    setActiveDragTarget,
    setActiveDropZone,
  } = useCustomization();
  const seekBarRef = useRef<HTMLDivElement>(null);
  const volBarRef = useRef<HTMLDivElement>(null);
  const [dragPercent, setDragPercent] = useState<number | null>(null);
  // Мут: запоминаем последнюю громкость, чтобы вернуть её при размуте
  const lastVolumeRef = useRef<number | null>(null);

  const isVertical = config.player?.position === "left" || config.player?.position === "right";

  const onDragPlayerPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const handleEl = e.currentTarget as HTMLElement;
    handleEl.setPointerCapture(e.pointerId);
    setActiveDragTarget("player");

    const onPointerMove = (ev: PointerEvent) => {
      const x = ev.clientX;
      const y = ev.clientY;
      const w = window.innerWidth;
      const h = window.innerHeight;

      const distLeft = x;
      const distRight = w - x;
      const distTop = y;
      const distBottom = h - y;

      const minDist = Math.min(distLeft, distRight, distTop, distBottom);
      let targetZone: "left" | "right" | "top" | "bottom" = "bottom";
      if (minDist === distLeft) targetZone = "left";
      else if (minDist === distRight) targetZone = "right";
      else if (minDist === distTop) targetZone = "top";
      else targetZone = "bottom";

      setActiveDropZone(targetZone);
    };

    const onPointerUp = (ev: PointerEvent) => {
      try {
        handleEl.releasePointerCapture(ev.pointerId);
      } catch {}
      handleEl.removeEventListener("pointermove", onPointerMove);
      handleEl.removeEventListener("pointerup", onPointerUp);

      const x = ev.clientX;
      const y = ev.clientY;
      const w = window.innerWidth;
      const h = window.innerHeight;
      const distLeft = x;
      const distRight = w - x;
      const distTop = y;
      const distBottom = h - y;
      const minDist = Math.min(distLeft, distRight, distTop, distBottom);
      let targetZone: "left" | "right" | "top" | "bottom" = "bottom";
      if (minDist === distLeft) targetZone = "left";
      else if (minDist === distRight) targetZone = "right";
      else if (minDist === distTop) targetZone = "top";
      else targetZone = "bottom";

      setPlayerPosition(targetZone);
      setActiveDragTarget(null);
      setActiveDropZone(null);
    };

    handleEl.addEventListener("pointermove", onPointerMove);
    handleEl.addEventListener("pointerup", onPointerUp);
  };

  const onResizeHeightPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const handleEl = e.currentTarget as HTMLElement;
    handleEl.setPointerCapture(e.pointerId);
    const startY = e.clientY;
    const startH = config.player?.height || 82;
    const isTop = config.player?.position === "top";

    const onPointerMove = (ev: PointerEvent) => {
      const delta = isTop ? ev.clientY - startY : startY - ev.clientY;
      setPlayerHeight(startH + delta);
    };

    const onPointerUp = (ev: PointerEvent) => {
      try {
        handleEl.releasePointerCapture(ev.pointerId);
      } catch {}
      handleEl.removeEventListener("pointermove", onPointerMove);
      handleEl.removeEventListener("pointerup", onPointerUp);
    };

    handleEl.addEventListener("pointermove", onPointerMove);
    handleEl.addEventListener("pointerup", onPointerUp);
  };

  const onResizeWidthPointerDown = (e: React.PointerEvent, side: "left" | "right") => {
    e.preventDefault();
    const handleEl = e.currentTarget as HTMLElement;
    handleEl.setPointerCapture(e.pointerId);
    const startX = e.clientX;
    const startW = config.player?.widthPercent || 100;

    const onPointerMove = (ev: PointerEvent) => {
      const deltaPx = side === "left" ? startX - ev.clientX : ev.clientX - startX;
      const deltaPct = (deltaPx / window.innerWidth) * 160;
      setPlayerWidthPercent(startW + deltaPct);
    };

    const onPointerUp = (ev: PointerEvent) => {
      try {
        handleEl.releasePointerCapture(ev.pointerId);
      } catch {}
      handleEl.removeEventListener("pointermove", onPointerMove);
      handleEl.removeEventListener("pointerup", onPointerUp);
    };

    handleEl.addEventListener("pointermove", onPointerMove);
    handleEl.addEventListener("pointerup", onPointerUp);
  };

  if (!state) return null;

  const track = state.now_playing;
  const player = state.player;
  const fav = track ? isFavorite(state.library, track) : false;

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

  const muted = player.volume_percent === 0;

  const handleMute = async () => {
    try {
      if (!muted) {
        lastVolumeRef.current = player.volume_percent;
        await api.setVolume(0);
      } else {
        await api.setVolume(lastVolumeRef.current ?? 50);
      }
      await refresh();
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const playing = player.status === "playing" || player.status === "buffering";
  const failed = player.status === "error";
  // Текст ошибки: сначала failed-статус плеера, затем последнее уведомление
  // (Action::PlaybackNotice/PlaybackFailed), если оно относится к треку.
  const errText = failed
    ? `${track?.title ?? ""} — не удалось воспроизвести`
    : null;
  return (
    <footer
      className={`player ${failed ? "playback-error" : ""} ${
        config.player?.position === "top"
          ? "dock-top"
          : config.player?.position === "left"
          ? "dock-left player-vertical"
          : config.player?.position === "right"
          ? "dock-right player-vertical"
          : "dock-bottom"
      } ${
        config.player?.style === "floating" ? "floating-island" : "full-dock"
      } ${
        config.player?.largeIcons ? "large-icons" : ""
      } ${config.player?.hideDetails ? "hide-details" : ""}`}
      style={
        isVertical
          ? {
              width: `${config.player?.height ? config.player.height * 2.8 : 240}px`,
              minWidth: `${config.player?.height ? config.player.height * 2.8 : 240}px`,
            }
          : {
              height: `${config.player?.height || 82}px`,
              minHeight: `${config.player?.height || 82}px`,
              maxHeight: `${config.player?.height || 82}px`,
              width: config.player?.widthPercent && config.player.widthPercent < 100
                ? `${config.player.widthPercent}%`
                : undefined,
            }
      }
    >
      {isEditMode && !isVertical && (
        <>
          <div
            className={`player-resize-handle ${config.player?.position === "top" ? "resize-bottom" : "resize-top"}`}
            onPointerDown={onResizeHeightPointerDown}
            title="Потяните мышкой для изменения высоты плеера"
          />
          <div
            className="player-resize-handle-width resize-left"
            onPointerDown={(e) => onResizeWidthPointerDown(e, "left")}
            title="Потяните мышкой для изменения ширины плеера"
          />
          <div
            className="player-resize-handle-width resize-right"
            onPointerDown={(e) => onResizeWidthPointerDown(e, "right")}
            title="Потяните мышкой для изменения ширины плеера"
          />
        </>
      )}

      {isEditMode && isVertical && (
        <div
          className={`player-resize-handle-vert ${config.player?.position === "left" ? "resize-right" : "resize-left"}`}
          onPointerDown={onResizeHeightPointerDown}
          title="Потяните мышкой для изменения ширины вертикального плеера"
        />
      )}

      {isEditMode && (
        <div
          className="player-drag-grip"
          onPointerDown={onDragPlayerPointerDown}
          title="Зажмите мышкой и перетащите плеер к любому краю экрана"
        >
          <span className="grip-icon">⠿</span>
          <span className="grip-label">Перетащить плеер</span>
        </div>
      )}

      {errText && (
        <div className="err-banner">
          <span style={{ color: "var(--red)", fontWeight: 700 }}>!</span>
          <span>{errText} — нажми ▶, чтобы повторить</span>
        </div>
      )}
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
          <span className="ttl" title={track?.title ?? ""}>
            {track?.title ?? t(lang, "bottom.noTrack")}
          </span>
          <div className="pl-sub" title={filterValidArtists(track?.artists).join(", ")}>
            {track && (() => {
              const valid = filterValidArtists(track.artists);
              return valid.length > 0 ? (
                valid.map((artist, i) => (
                  <span key={`${artist}-${i}`}>
                    <span
                      className="pl-artist-link"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigateTo("artist", { artist, provider: track.provider });
                      }}
                    >
                      {artist}
                    </span>
                    {i < valid.length - 1 ? ", " : ""}
                  </span>
                ))
              ) : null;
            })()}
          </div>
        </div>
        <button
          className={`heart ${fav ? "active" : ""}`}
          onClick={handleFav}
          title={t(lang, "bottom.favorite")}
          aria-label="Like"
          disabled={!track}
        >
          {HEART_SVG}
        </button>
        {track && (
          <span className="pl-src-badge" title={track.provider}>
            {providerLabel(track.provider)}
          </span>
        )}
      </div>
      <div className="pl-center">
        <div className="pl-controls">
          <button
            className={`ctrl-btn ${player.shuffle ? "active" : "muted"}`}
            onClick={handleShuffle}
            title={t(lang, "bottom.shuffle")}
            aria-label="Shuffle"
          >
            {SHUFFLE_SVG}
          </button>
          <button className="ctrl-btn" onClick={handlePrev} title={t(lang, "bottom.previous")} aria-label="Previous">
            {PREV_SVG}
          </button>
          <button className="p-play" onClick={handleToggle} title={t(lang, "bottom.playPause")} type="button" aria-label={playing ? "Pause" : "Play"}>
            {playing ? PAUSE_SVG : PLAY_SVG}
          </button>
          <button className="ctrl-btn" onClick={handleNext} title={t(lang, "bottom.next")} aria-label="Next">
            {NEXT_SVG}
          </button>
          <button
            className={`ctrl-btn ${player.repeat === "off" ? "muted" : "active"}`}
            onClick={handleRepeat}
            title={t(lang, "bottom.repeat")}
            aria-label="Repeat"
          >
            {REPEAT_SVG}
            {player.repeat === "one" && <span className="rep-one">1</span>}
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
        <button
          className={`pl-fullscreen-btn ${fullscreenOpen ? "active" : ""}`}
          onClick={() => setFullscreenOpen(!fullscreenOpen)}
          title={t(lang, "bottom.fullscreen")}
          aria-label="Fullscreen player"
          disabled={!track}
        >
          {FULLSCREEN_SVG}
        </button>
        <div className="divider" />
        <div className="vol">
          <button
            className="vol-btn"
            onClick={handleMute}
            title={muted ? "Включить звук" : "Выключить звук"}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? MUTE_SVG : VOLUME_SVG}
          </button>
          <div ref={volBarRef} className="vol-bar" onPointerDown={onVolPointerDown}>
            <div className="fill" style={{ width: `${player.volume_percent}%` }} />
            <div className="knob" style={{ left: `${player.volume_percent}%` }} />
          </div>
        </div>
      </div>
    </footer>
  );
}
