import React, { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { useApp, usePlaybackProgress } from "../store";
import { useCustomization } from "../customization/CustomizationContext";
import { formatTime, providerLabel, isFavorite, filterValidArtists } from "../lib/utils";
import type { TrackRef } from "../api/types";
import { t } from "../i18n";
import { Artwork } from "../components/Artwork";
import { PlatformIcon } from "../components/PlatformIcon";
import { IconSparkle } from "../components/Icons";
import * as api from "../api/commands";

const HEART_SVG = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
  </svg>
);

const SHUFFLE_SVG = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 3 21 3 21 8" />
    <line x1="4" y1="20" x2="21" y2="3" />
    <polyline points="21 16 21 21 16 21" />
    <line x1="15" y1="15" x2="21" y2="21" />
    <line x1="4" y1="4" x2="9" y2="9" />
  </svg>
);

const PREV_SVG = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 5h2v14H6zM20 5v14l-11-7z" />
  </svg>
);

const NEXT_SVG = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
    <path d="M16 5h2v14h-2zM4 5v14l11-7z" />
  </svg>
);

const PLAY_SVG = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M7 4l14 8-14 8V4z" />
  </svg>
);

const PAUSE_SVG = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </svg>
);

const REPEAT_SVG = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 1l4 4-4 4" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <path d="M7 23l-4-4 4-4" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);

const VOLUME_SVG = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
  </svg>
);

const MUTE_SVG = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <line x1="23" y1="9" x2="17" y2="15" />
    <line x1="17" y1="9" x2="23" y2="15" />
  </svg>
);

const TRASH_SVG = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

const EXPAND_SVG = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 3 21 3 21 9" />
    <polyline points="9 21 3 21 3 15" />
    <line x1="21" y1="3" x2="14" y2="10" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </svg>
);

function getPlatformColor(provider?: string): string {
  switch (provider?.toLowerCase()) {
    case "soundcloud":
      return "#ff5500";
    case "spotify":
      return "#1ed760";
    case "you_tube_music":
    case "youtube":
      return "#ff0000";
    case "deezer":
      return "#a238ff";
    case "yandex":
      return "#fc3f1d";
    case "vk":
      return "#0077ff";
    case "apple_music":
    case "apple":
      return "#fc3c44";
    default:
      return "var(--accent, #6366f1)";
  }
}

export function PlayerPage() {
  const {
    state,
    refresh,
    showToast,
    playTracks,
    navigateTo,
    lang,
    fullscreenOpen,
    setFullscreenOpen,
    smartShuffle,
    cycleShuffleMode,
    playNextTrack,
  } = useApp();
  const progress = usePlaybackProgress();
  const { config } = useCustomization();
  const track = state?.now_playing;
  const player = state?.player;
  const queue = state?.queue || [];
  const currentIndex = state?.queue_index ?? -1;
  const fav = track && state ? isFavorite(state.library, track) : false;
  const playing = player?.status === "playing" || player?.status === "buffering";
  const muted = player ? player.volume_percent === 0 : false;

  const [posMs, setPosMs] = useState(progress.position_ms || player?.position_ms || 0);
  const syncRef = useRef({ pos: progress.position_ms || player?.position_ms || 0, time: Date.now() });
  const [dragPercent, setDragPercent] = useState<number | null>(null);
  const lastVolumeRef = useRef<number | null>(null);
  const seekBarRef = useRef<HTMLDivElement | null>(null);
  const volBarRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const cur = progress.position_ms || player?.position_ms || 0;
    syncRef.current = { pos: cur, time: Date.now() };
    setPosMs(cur);
  }, [progress.position_ms, player?.status]);

  const durationMs = progress.duration_ms || track?.duration_ms || player?.duration_ms || 0;

  useEffect(() => {
    if (player?.status !== "playing") return;
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - syncRef.current.time;
      const cur = syncRef.current.pos + elapsed;
      const max = durationMs || Infinity;
      setPosMs(Math.min(max, cur));
    }, 100);
    return () => window.clearInterval(timer);
  }, [player?.status, durationMs]);

  const rawPercent = durationMs > 0 ? Math.min(100, Math.max(0, (posMs / durationMs) * 100)) : 0;
  const shownPercent = dragPercent ?? rawPercent;
  const shownMs = dragPercent != null && durationMs > 0 ? (dragPercent / 100) * durationMs : posMs;

  const handleToggle = async () => {
    try {
      await api.togglePlayback();
      await refresh();
    } catch (err) {
      showToast(String(err), true);
    }
  };

  const handlePrev = async () => {
    try {
      await api.previous();
      await refresh();
    } catch (err) {
      showToast(String(err), true);
    }
  };

  const handleNext = async () => {
    await playNextTrack();
  };

  const handleRepeat = async () => {
    if (!player) return;
    const nextMode = player.repeat === "off" ? "all" : player.repeat === "all" ? "one" : "off";
    try {
      await api.setRepeat(nextMode);
      await refresh();
    } catch (err) {
      showToast(String(err), true);
    }
  };

  const handleFav = async () => {
    if (!track) return;
    try {
      await api.toggleFavorite(track);
      await refresh();
      showToast(fav ? t(lang, "trackrow.unlike") : t(lang, "trackrow.like"));
    } catch (err) {
      showToast(String(err), true);
    }
  };

  const handleClearQueue = async () => {
    try {
      await api.clearQueue();
      await refresh();
      showToast(lang === "ru" ? "Очередь очищена" : "Queue cleared");
    } catch (err) {
      showToast(String(err), true);
    }
  };

  const handlePlayFromQueue = (index: number) => {
    if (queue.length === 0) return;
    void playTracks(queue, index);
  };

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropOverIndex, setDropOverIndex] = useState<number | null>(null);
  const dragStartRef = useRef<{ index: number; startY: number; isDragging: boolean } | null>(null);

  const handleQueuePointerDown = (e: React.PointerEvent, index: number) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("button, a, .queue-play-btn, .queue-track-remove-btn, .qx")) {
      return;
    }
    dragStartRef.current = { index, startY: e.clientY, isDragging: false };
  };

  const handleQueuePointerMove = (e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    if (!dragStartRef.current.isDragging) {
      if (Math.abs(e.clientY - dragStartRef.current.startY) > 6) {
        dragStartRef.current.isDragging = true;
        setDragIndex(dragStartRef.current.index);
      }
    }
    if (dragStartRef.current.isDragging) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const row = el?.closest("[data-player-queue-idx]");
      if (row) {
        const targetIdx = Number(row.getAttribute("data-player-queue-idx"));
        if (!isNaN(targetIdx) && targetIdx !== dropOverIndex) {
          setDropOverIndex(targetIdx);
        }
      }
    }
  };

  const handleQueuePointerUp = async () => {
    if (dragStartRef.current?.isDragging && dragIndex !== null && dropOverIndex !== null && dragIndex !== dropOverIndex) {
      const fromIdx = dragIndex;
      const toIdx = dropOverIndex;
      setDragIndex(null);
      setDropOverIndex(null);
      dragStartRef.current = null;
      try {
        const nextQueue = [...queue];
        const [moved] = nextQueue.splice(fromIdx, 1);
        nextQueue.splice(toIdx, 0, moved);
        await api.reorderQueue(nextQueue);
        await refresh();
      } catch (err) {
        showToast(String(err), true);
      }
      return;
    }
    setDragIndex(null);
    setDropOverIndex(null);
    dragStartRef.current = null;
  };

  // Seekbar pointer events
  const onSeekPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (durationMs <= 0) return;
    e.preventDefault();
    const bar = seekBarRef.current;
    if (!bar) return;
    bar.setPointerCapture(e.pointerId);

    const updateSeek = (clientX: number) => {
      const rect = bar.getBoundingClientRect();
      const pct = Math.min(100, Math.max(0, ((clientX - rect.left) / rect.width) * 100));
      setDragPercent(pct);
      return pct;
    };

    updateSeek(e.clientX);

    const onPointerMove = (ev: PointerEvent) => {
      updateSeek(ev.clientX);
    };

    const onPointerUp = async (ev: PointerEvent) => {
      const finalPct = updateSeek(ev.clientX);
      setDragPercent(null);
      try {
        bar.releasePointerCapture(ev.pointerId);
      } catch {}
      bar.removeEventListener("pointermove", onPointerMove);
      bar.removeEventListener("pointerup", onPointerUp);

      const targetMs = Math.round((finalPct / 100) * durationMs);
      try {
        await api.seek(targetMs);
        setPosMs(targetMs);
        await refresh();
      } catch (err) {
        showToast(String(err), true);
      }
    };

    bar.addEventListener("pointermove", onPointerMove);
    bar.addEventListener("pointerup", onPointerUp);
  };

  // Volume bar pointer events
  const onVolPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const bar = volBarRef.current;
    if (!bar) return;
    bar.setPointerCapture(e.pointerId);

    const updateVol = async (clientX: number) => {
      const rect = bar.getBoundingClientRect();
      const pct = Math.min(100, Math.max(0, Math.round(((clientX - rect.left) / rect.width) * 100)));
      try {
        await api.setVolume(pct);
        await refresh();
      } catch {}
    };

    void updateVol(e.clientX);

    const onPointerMove = (ev: PointerEvent) => {
      void updateVol(ev.clientX);
    };

    const onPointerUp = (ev: PointerEvent) => {
      try {
        bar.releasePointerCapture(ev.pointerId);
      } catch {}
      bar.removeEventListener("pointermove", onPointerMove);
      bar.removeEventListener("pointerup", onPointerUp);
    };

    bar.addEventListener("pointermove", onPointerMove);
    bar.addEventListener("pointerup", onPointerUp);
  };

  const handleMute = async () => {
    if (!player) return;
    if (muted) {
      const restore = lastVolumeRef.current || 80;
      await api.setVolume(restore);
    } else {
      lastVolumeRef.current = player.volume_percent;
      await api.setVolume(0);
    }
    await refresh();
  };

  const [menu, setMenu] = useState<{
    track: TrackRef;
    index: number;
    x: number;
    y: number;
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menu]);

  const handleContextMenu = (e: React.MouseEvent, track: TrackRef, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 220);
    const y = Math.min(e.clientY, window.innerHeight - 260);
    setMenu({ track, index, x: Math.max(10, x), y: Math.max(10, y) });
  };

  const handlePlayNext = async (track: TrackRef) => {
    setMenu(null);
    try {
      await api.playNext(track);
      await refresh();
      showToast(`${lang === "ru" ? "Будет играть следующим:" : "Play next:"} ${track.title}`);
    } catch (e) {
      showToast(String(e), true);
    }
  };

  const handleToggleFavTrack = async (track: TrackRef) => {
    setMenu(null);
    try {
      await api.toggleFavorite(track);
      await refresh();
    } catch (e) {
      showToast(String(e), true);
    }
  };

  const handleCacheTrack = async (track: TrackRef) => {
    setMenu(null);
    try {
      showToast(lang === "ru" ? "Сохранение в кэш…" : "Saving to cache…");
      await api.downloadTrackToCache(track);
      showToast(lang === "ru" ? "Сохранено в кэш" : "Saved to cache");
    } catch (e) {
      showToast(String(e), true);
    }
  };

  const handleRemoveTrack = async (index: number) => {
    setMenu(null);
    try {
      await api.removeFromQueue(index);
      await refresh();
    } catch (e) {
      showToast(String(e), true);
    }
  };

  return (
    <div className="view page-player-view" style={{ width: "100%", paddingBottom: 40, boxSizing: "border-box" }}>
      {/* Top Card: Now Playing Player */}
      <div className="player-main-card" style={{
        background: "transparent",
        backdropFilter: "none",
        WebkitBackdropFilter: "none",
        border: "none",
        borderRadius: 0,
        padding: "32px 8px 36px 8px",
        display: "flex",
        gap: 52,
        alignItems: "center",
        marginBottom: 32,
        boxShadow: "none",
        position: "relative",
      }}>
        {/* Left Artwork */}
        <div
          onClick={() => setFullscreenOpen(true)}
          title={lang === "ru" ? "Открыть полноэкранный плеер" : "Open fullscreen player"}
          style={{
            position: "relative",
            zIndex: 2,
            width: 360,
            height: 360,
            flexShrink: 0,
            borderRadius: 16,
            overflow: "hidden",
            boxShadow: "0 16px 48px rgba(0,0,0,0.65)",
            cursor: "pointer",
            transition: "transform 0.18s ease, box-shadow 0.18s ease",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.015)";
            e.currentTarget.style.boxShadow = "0 20px 54px rgba(0,0,0,0.75)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.boxShadow = "0 16px 48px rgba(0,0,0,0.65)";
          }}
        >
          {track ? (
            <Artwork
              url={config.theme?.customTrackArt || track.artwork_url}
              alt={track.title}
              seed={track.id.length}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
            />
          ) : (
            <div style={{ width: "100%", height: "100%", background: "#1a1a1e", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text3)", fontSize: 48 }}>♫</div>
          )}
        </div>

        {/* Right Info & Controls */}
        <div style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          position: "relative",
          zIndex: 2,
        }}>
          {track ? (
            <>
              {/* Platform badge */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
                <PlatformIcon kind={track.provider as any} size={16} />
                <span style={{
                  color: getPlatformColor(track.provider),
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}>
                  {providerLabel(track.provider)}
                </span>
              </div>

              {/* Title */}
              <div style={{
                fontSize: 38,
                fontWeight: 800,
                color: "#ffffff",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                marginBottom: 8,
                letterSpacing: "-0.02em",
                lineHeight: 1.15,
              }} title={track.title}>
                {track.title}
              </div>

              {/* Artists */}
              <div style={{
                fontSize: 17.5,
                color: "rgba(255, 255, 255, 0.85)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                marginBottom: 32,
              }}>
                {filterValidArtists(track.artists).map((artist, idx, arr) => (
                  <span key={`${artist}-${idx}`}>
                    <span
                      style={{ cursor: "pointer" }}
                      onClick={() => navigateTo("artist", { artist, provider: track.provider })}
                      onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                      onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                    >
                      {artist}
                    </span>
                    {idx < arr.length - 1 ? ", " : ""}
                  </span>
                ))}
              </div>

              {/* Progress seekbar */}
              <div style={{ marginBottom: 18 }}>
                <div
                  ref={seekBarRef}
                  onPointerDown={onSeekPointerDown}
                  style={{
                    width: "100%",
                    height: 5,
                    background: "rgba(255, 255, 255, 0.15)",
                    borderRadius: 3,
                    position: "relative",
                    cursor: "pointer",
                    marginBottom: 7,
                  }}
                >
                  <div style={{
                    width: `${shownPercent}%`,
                    height: "100%",
                    background: "#ffffff",
                    borderRadius: 3,
                    transition: dragPercent == null ? "width 0.1s linear" : "none",
                  }} />
                </div>
                <div style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12,
                  color: "var(--text3, rgba(255,255,255,0.45))",
                  fontVariantNumeric: "tabular-nums",
                }}>
                  <span>{formatTime(shownMs)}</span>
                  <span>{formatTime(durationMs)}</span>
                </div>
              </div>

              {/* Playback Controls & Volume Row */}
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                {/* Center controls */}
                <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                  <button
                    onClick={() => void cycleShuffleMode()}
                    style={{
                      background: "none",
                      border: "none",
                      color: smartShuffle ? "#1db954" : player?.shuffle ? "var(--accent, #3b82f6)" : "var(--text3, rgba(255,255,255,0.45))",
                      cursor: "pointer",
                      padding: 4,
                      display: "flex",
                      position: "relative",
                    }}
                    title={
                      smartShuffle
                        ? (lang === "ru" ? "Умное перемешивание (включено)" : "Smart Shuffle (On)")
                        : player?.shuffle
                        ? (lang === "ru" ? "Перемешивание (нажмите для Умного)" : "Shuffle (Click for Smart)")
                        : t(lang, "bottom.shuffle")
                    }
                  >
                    {SHUFFLE_SVG}
                    {smartShuffle && (
                      <span style={{ position: "absolute", top: -2, right: -2, color: "#1db954", display: "flex" }}>
                        <IconSparkle size={10} />
                      </span>
                    )}
                  </button>
                  <button
                    onClick={handlePrev}
                    style={{ background: "none", border: "none", color: "var(--text, #fff)", cursor: "pointer", padding: 4, display: "flex" }}
                    title={t(lang, "bottom.previous")}
                  >
                    {PREV_SVG}
                  </button>
                  <button
                    onClick={handleToggle}
                    style={{
                      width: 44,
                      height: 44,
                      borderRadius: 22,
                      background: "#ffffff",
                      color: "#0b0b0d",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
                      transition: "transform 0.12s ease",
                    }}
                    title={playing ? "Пауза" : "Воспроизвести"}
                  >
                    {playing ? PAUSE_SVG : PLAY_SVG}
                  </button>
                  <button
                    onClick={handleNext}
                    style={{ background: "none", border: "none", color: "var(--text, #fff)", cursor: "pointer", padding: 4, display: "flex" }}
                    title={t(lang, "bottom.next")}
                  >
                    {NEXT_SVG}
                  </button>
                  <button
                    onClick={handleRepeat}
                    style={{
                      background: "none",
                      border: "none",
                      color: player?.repeat !== "off" ? "var(--accent, #3b82f6)" : "var(--text3, rgba(255,255,255,0.45))",
                      cursor: "pointer",
                      padding: 4,
                      display: "flex",
                      position: "relative",
                    }}
                    title={t(lang, "bottom.repeat")}
                  >
                    {REPEAT_SVG}
                    {player?.repeat === "one" && (
                      <span style={{ position: "absolute", top: -3, right: -4, fontSize: 10, fontWeight: 700 }}>1</span>
                    )}
                  </button>
                </div>

                {/* Like, Expand & Volume slider */}
                <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                  {/* Like button */}
                  <button
                    onClick={handleFav}
                    style={{
                      background: "none",
                      border: "none",
                      color: fav ? "#ff4060" : "var(--text3, rgba(255,255,255,0.5))",
                      cursor: "pointer",
                      padding: 4,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "color 0.15s ease, transform 0.12s ease",
                    }}
                    title={t(lang, "bottom.favorite")}
                    aria-label="Favorite"
                  >
                    {fav ? (
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="#ff4060" stroke="#ff4060" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                      </svg>
                    ) : (
                      HEART_SVG
                    )}
                  </button>

                  {/* Expand button (mini player icon) */}
                  <button
                    onClick={() => setFullscreenOpen(!fullscreenOpen)}
                    style={{
                      background: "none",
                      border: "none",
                      color: fullscreenOpen ? "var(--accent, #3b82f6)" : "var(--text3, rgba(255,255,255,0.5))",
                      cursor: "pointer",
                      padding: 4,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      transition: "color 0.15s ease, transform 0.12s ease",
                    }}
                    title={t(lang, "bottom.fullscreen")}
                    aria-label="Fullscreen player"
                  >
                    {EXPAND_SVG}
                  </button>

                  {/* Volume slider */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, width: 130 }}>
                    <button
                      onClick={handleMute}
                      style={{ background: "none", border: "none", color: "var(--text3)", cursor: "pointer", padding: 2, display: "flex" }}
                      title={muted ? "Включить звук" : "Выключить звук"}
                    >
                      {muted ? MUTE_SVG : VOLUME_SVG}
                    </button>
                    <div
                      ref={volBarRef}
                      onPointerDown={onVolPointerDown}
                      style={{
                        flex: 1,
                        height: 4,
                        background: "rgba(255,255,255,0.15)",
                        borderRadius: 2,
                        position: "relative",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{
                        width: `${player?.volume_percent || 0}%`,
                        height: "100%",
                        background: "var(--text, #ffffff)",
                        borderRadius: 2,
                      }} />
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div style={{ color: "var(--text3)", textAlign: "center", padding: "40px 0", fontSize: 16 }}>
              {lang === "ru" ? "Сейчас ничего не играет" : "Nothing is currently playing"}
            </div>
          )}
        </div>
      </div>

      {/* Bottom Card: Playback Queue */}
      <div className="player-queue-card" style={{
        background: "transparent",
        backdropFilter: "none",
        border: "none",
        borderRadius: 0,
        padding: "10px 4px",
        boxShadow: "none",
        position: "relative",
        zIndex: 2,
      }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text, #fff)" }}>
              {lang === "ru" ? "Очередь воспроизведения" : "Playback Queue"}
            </div>
            <div style={{ fontSize: 12.5, color: "var(--text3, rgba(255,255,255,0.45))", marginTop: 2 }}>
              {queue.length > 0 ? `${currentIndex + 1 > 0 ? currentIndex + 1 : 1} из ${queue.length}` : (lang === "ru" ? "Пусто" : "Empty")}
            </div>
          </div>
          {queue.length > 0 && (
            <button
              onClick={handleClearQueue}
              style={{
                background: "none",
                border: "none",
                color: "var(--text3, rgba(255,255,255,0.5))",
                cursor: "pointer",
                padding: 6,
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                gap: 6,
                fontSize: 13,
                transition: "color 0.12s ease",
              }}
              onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text, #fff)")}
              onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text3, rgba(255,255,255,0.5))")}
              title={lang === "ru" ? "Очистить очередь" : "Clear queue"}
            >
              {TRASH_SVG}
            </button>
          )}
        </div>

        {/* Queue List */}
        <div
          style={{ display: "flex", flexDirection: "column", gap: 2 }}
          onPointerMove={handleQueuePointerMove}
          onPointerUp={handleQueuePointerUp}
        >
          {queue.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--text3)", padding: "30px 0", fontSize: 14 }}>
              {lang === "ru" ? "Очередь воспроизведения пуста" : "Queue is empty"}
            </div>
          ) : (
            queue.map((qTrack, idx) => {
              const isCur = idx === currentIndex;
              const isDragging = dragIndex === idx;
              const isOver = dropOverIndex === idx && !isDragging;
              const validArtists = filterValidArtists(qTrack.artists);
              return (
                <div
                  key={`${qTrack.id}-${idx}`}
                  data-player-queue-idx={idx}
                  className="player-qrow"
                  onPointerDown={(e) => handleQueuePointerDown(e, idx)}
                  onContextMenu={(e) => handleContextMenu(e, qTrack, idx)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 14,
                    height: 64,
                    padding: "0 16px",
                    borderRadius: 8,
                    cursor: dragIndex !== null ? "grabbing" : "grab",
                    userSelect: "none",
                    opacity: isDragging ? 0.35 : 1,
                    background: isCur ? "var(--trow-now-bg, rgba(255, 255, 255, 0.08))" : "transparent",
                    border: isCur ? "1px solid var(--trow-now-border, transparent)" : "1px solid transparent",
                    boxShadow: isOver ? "inset 0 2px 0 0 var(--accent, #6366f1)" : "none",
                    marginBottom: 2,
                    transition: isDragging ? "none" : "background 0.12s ease, opacity 0.12s ease",
                  }}
                  onMouseEnter={(e) => {
                    if (!isCur && dragIndex === null) {
                      e.currentTarget.style.background = "rgba(255, 255, 255, 0.06)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (!isCur) {
                      e.currentTarget.style.background = "transparent";
                    }
                  }}
                >
                  <span style={{
                    width: 24,
                    fontSize: 12.5,
                    color: isCur ? (config.theme?.trackRowActiveStyle === "accent" ? "var(--accent, #6366f1)" : "#ffffff") : "var(--text3, rgba(255,255,255,0.4))",
                    fontVariantNumeric: "tabular-nums",
                  }}>
                    {idx + 1}
                  </span>
                  <div className="queue-art-container" style={{ width: 48, height: 48, borderRadius: 8, overflow: "hidden", flexShrink: 0, position: "relative" }}>
                    <Artwork
                      url={qTrack.artwork_url}
                      alt={qTrack.title}
                      size={48}
                      seed={qTrack.id.length}
                      onPlayClick={() => {
                        if (isCur) {
                          void handleToggle();
                        } else {
                          handlePlayFromQueue(idx);
                        }
                      }}
                      isPlaying={isCur && playing}
                    />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: 13.5,
                      fontWeight: 600,
                      color: isCur ? (config.theme?.trackRowActiveStyle === "accent" ? "var(--accent, #3b82f6)" : "#ffffff") : "#ffffff",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}>
                      {qTrack.title}
                    </div>
                    <div style={{
                      fontSize: 12,
                      color: "rgba(255, 255, 255, 0.7)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}>
                      {validArtists.join(", ")}
                    </div>
                  </div>
                  <span
                    className="c-platform"
                    title={providerLabel(qTrack.provider)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      fontSize: 12,
                      color: "rgba(255, 255, 255, 0.55)",
                      userSelect: "none",
                      marginRight: 12,
                      flexShrink: 0,
                    }}
                  >
                    <span
                      className="platform-icon-wrap"
                      style={{
                        width: 16,
                        height: 16,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <PlatformIcon kind={qTrack.provider} size={15} />
                    </span>
                    <span
                      className="platform-name"
                      style={{
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {providerLabel(qTrack.provider)}
                    </span>
                  </span>
                  <span style={{
                    fontSize: 12,
                    color: "rgba(255, 255, 255, 0.6)",
                    fontVariantNumeric: "tabular-nums",
                    width: 42,
                    textAlign: "right",
                  }}>
                    {formatTime(qTrack.duration_ms)}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>

      {menu && createPortal(
        <div
          ref={menuRef}
          className="ctx show"
          style={{
            position: "fixed",
            left: menu.x,
            top: menu.y,
            zIndex: 99999,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="ctx-head">{menu.track.title}</div>
          <div className="ctx-item" onClick={() => void handlePlayNext(menu.track)}>
            {lang === "ru" ? "Сыграть следующим" : "Play next"}
          </div>
          <div
            className="ctx-item"
            onClick={() => void handleToggleFavTrack(menu.track)}
          >
            {state && isFavorite(state.library, menu.track)
              ? (lang === "ru" ? "Удалить из избранного" : "Remove from favorites")
              : (lang === "ru" ? "В избранное" : "Add to favorites")}
          </div>
          <div className="ctx-item" onClick={() => void handleCacheTrack(menu.track)}>
            {lang === "ru" ? "Сохранить в кэш" : "Save to cache"}
          </div>
          <div className="ctx-sep" />
          <div
            className="ctx-item danger"
            onClick={() => void handleRemoveTrack(menu.index)}
          >
            {lang === "ru" ? "Удалить из очереди" : "Remove from queue"}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
