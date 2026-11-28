import { useRef, useState, useEffect } from "react";

import { useApp, usePlaybackProgress } from "../store";
import { useCustomization } from "../customization";
import { formatTime, isFavorite, filterValidArtists } from "../lib/utils";
import { t } from "../i18n";
import { Artwork } from "./Artwork";
import { IconSparkle } from "./Icons";
import { MorphPlayIcon } from "./MorphPlayIcon";
import { EqualizerPopover } from "./player/EqualizerPopover";
import { loadStoredEqualizer, isAudioEffectsActive } from "./player/equalizerData";
import { usePlaybackRate } from "./player/usePlaybackRate";
import { PlayerContextMenu, type ContextMenuState } from "../pages/player";
import type { TrackRef } from "../api/types";
import * as api from "../api/commands";


const HEART_SVG = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>
);

const SHUFFLE_SVG = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
);

const PREV_SVG = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="4.5" y="5.5" width="2.4" height="13" rx="1.2" />
    <path d="M17.75 6.1C18.58 5.58 19.65 6.18 19.65 7.15V16.85C19.65 17.82 18.58 18.42 17.75 17.9L9.65 13.05C8.85 12.57 8.85 11.43 9.65 10.95L17.75 6.1Z" />
  </svg>
);

const NEXT_SVG = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6.25 6.1C5.42 5.58 4.35 6.18 4.35 7.15V16.85C4.35 17.82 5.42 18.42 6.25 17.9L14.35 13.05C15.15 12.57 15.15 11.43 14.35 10.95L6.25 6.1Z" />
    <rect x="17.1" y="5.5" width="2.4" height="13" rx="1.2" />
  </svg>
);

const REPEAT_SVG = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 1l4 4-4 4"/><path d="M3 11V9a4 4 0 0 1 4-4h14"/><path d="M7 23l-4-4 4-4"/><path d="M21 13v2a4 4 0 0 1-4 4H3"/></svg>
);

const VOLUME_LOW_SVG = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
  </svg>
);

const VOLUME_HIGH_SVG = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  </svg>
);

const MUTE_SVG = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <line x1="23" y1="9" x2="17" y2="15" />
    <line x1="17" y1="9" x2="23" y2="15" />
  </svg>
);

const EQUALIZER_SVG = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="21" x2="4" y2="14" />
    <line x1="4" y1="10" x2="4" y2="3" />
    <line x1="12" y1="21" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12" y2="3" />
    <line x1="20" y1="21" x2="20" y2="16" />
    <line x1="20" y1="12" x2="20" y2="3" />
    <line x1="1" y1="14" x2="7" y2="14" />
    <line x1="9" y1="8" x2="15" y2="8" />
    <line x1="17" y1="16" x2="23" y2="16" />
  </svg>
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
  const {
    state,
    showToast,
    refresh,
    navigateTo,
    setExternalPlaylist,
    lang,
    fullscreenOpen,
    setFullscreenOpen,
    smartShuffle,
    cycleShuffleMode,
    playNextTrack,
  } = useApp();
  const progress = usePlaybackProgress();
  const {
    config,
    isQueueOpen,
    toggleQueue,
  } = useCustomization();
  const seekBarRef = useRef<HTMLDivElement>(null);
  const volBarRef = useRef<HTMLDivElement>(null);
  const [dragPercent, setDragPercent] = useState<number | null>(null);
  // Мут: запоминаем последнюю громкость, чтобы вернуть её при размуте
  const lastVolumeRef = useRef<number | null>(null);
  const [isEqOpen, setIsEqOpen] = useState(false);
  const eqBtnRef = useRef<HTMLButtonElement>(null);
  const footerRef = useRef<HTMLElement>(null);
  const [ctxMenu, setCtxMenu] = useState<ContextMenuState | null>(null);

  const isVertical = config.player?.position === "left" || config.player?.position === "right";
  const isProgressFill = config.player?.style === "progress_fill";
  const effectiveHeight = isProgressFill ? 66 : 68;
  const playbackRate = usePlaybackRate();
  const eqState = loadStoredEqualizer();
  const eqActive = isAudioEffectsActive(eqState);

  // Восстанавливаем глобальные настройки эквалайзера, усиления и скорости на старте приложения
  useEffect(() => {
    const initial = loadStoredEqualizer();
    void api.setEqualizer(initial.enabled, initial.gains).catch(() => {});
    void api.setAudioPreamp(initial.preampDb).catch(() => {});
    void api.setPlaybackSpeed(initial.playbackRate).catch(() => {});
  }, []);

  const track = state?.now_playing ?? null;
  const player = state?.player;
  const fav = track && state ? isFavorite(state.library, track) : false;

  const durationMs = progress.duration_ms || player?.duration_ms || track?.duration_ms || 0;
  const currentPosMs = progress.position_ms ?? player?.position_ms ?? 0;

  const [interpolatedPos, setInterpolatedPos] = useState(currentPosMs);
  const syncRef = useRef({ pos: currentPosMs, time: Date.now(), rate: playbackRate });

  useEffect(() => {
    syncRef.current = { pos: currentPosMs, time: Date.now(), rate: playbackRate };
    setInterpolatedPos(currentPosMs);
  }, [currentPosMs, player?.status]);

  useEffect(() => {
    const now = Date.now();
    const prevElapsed = (now - syncRef.current.time) * syncRef.current.rate;
    syncRef.current = {
      pos: syncRef.current.pos + (player?.status === "playing" ? prevElapsed : 0),
      time: now,
      rate: playbackRate,
    };
  }, [playbackRate, player?.status]);

  useEffect(() => {
    if (player?.status !== "playing") return;
    const interval = window.setInterval(() => {
      const elapsed = (Date.now() - syncRef.current.time) * syncRef.current.rate;
      const cur = syncRef.current.pos + elapsed;
      const max = durationMs || Infinity;
      setInterpolatedPos(Math.min(max, cur));
    }, 60);
    return () => window.clearInterval(interval);
  }, [player?.status, durationMs, playbackRate]);

  if (!state || !player) return null;

  const activePosMs = player.status === "playing" ? interpolatedPos : currentPosMs;
  const percent =
    durationMs > 0
      ? Math.min(100, Math.max(0, (activePosMs / durationMs) * 100))
      : 0;
  const shownPercent = dragPercent ?? percent;
  const shownMs = dragPercent != null && durationMs > 0
    ? (dragPercent / 100) * durationMs
    : activePosMs;

  const onPlayerBarPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (!isProgressFill || e.button !== 0) return;
    const target = e.target as HTMLElement;
    if (
      target.closest(
        "button, a, input, .vol, .vol-bar, .pl-title-link, .pl-artist-link, .pl-art, .heart, .ctrl-btn, .p-play, .pl-actions-row, .mini-ctx-menu, .ov, .playlist-picker-card, .eq-popover, .err-banner"
      )
    ) {
      return;
    }
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const calcRatio = (clientX: number) => Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const initRatio = calcRatio(e.clientX);
    setDragPercent(initRatio * 100);

    const move = (ev: PointerEvent) => {
      ev.preventDefault();
      setDragPercent(calcRatio(ev.clientX) * 100);
    };
    const up = async (ev: PointerEvent) => {
      const finalRatio = calcRatio(ev.clientX);
      if (durationMs > 0) {
        const ms = Math.round(finalRatio * durationMs);
        try {
          await api.seek(ms);
          await refresh();
        } catch (err) {
          showToast(String(err), true);
        }
      }
      setDragPercent(null);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const seekFromEvent = async (clientX: number, commit: boolean) => {
    if (!seekBarRef.current) return;
    const rect = seekBarRef.current.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const pct = ratio * 100;
    if (!commit) {
      setDragPercent(pct);
      return;
    }
    if (!durationMs) {
      setDragPercent(null);
      return;
    }
    const ms = Math.round(ratio * durationMs);
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
    e.currentTarget.setPointerCapture(e.pointerId);
    volFromEvent(e.clientX);
  };

  const onVolPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      volFromEvent(e.clientX);
    }
  };

  const onVolPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
  };

  const onVolWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const delta = e.deltaY < 0 ? 4 : -4;
    const next = Math.min(100, Math.max(0, player.volume_percent + delta));
    void api.setVolume(next).catch(() => {});
  };

  const onVolKeyDown = (e: React.KeyboardEvent) => {
    let delta = 0;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") delta = 5;
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") delta = -5;
    if (delta !== 0) {
      e.preventDefault();
      const next = Math.min(100, Math.max(0, player.volume_percent + delta));
      void api.setVolume(next).catch(() => {});
    }
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
    await playNextTrack();
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

  const handleTitleClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!track) return;

    // 1. Прямой переход к альбому/релизу, если ссылка уже известна у трека
    if (track.album_url) {
      try {
        const pl = await api.previewPlaylistUrl(track.album_url);
        if (pl && pl.tracks && pl.tracks.length > 0) {
          setExternalPlaylist(pl);
          navigateTo("playlist", { playlistId: "external" });
          return;
        }
      } catch (err) {
        console.warn("Direct album preview failed:", err);
      }
    }

    const primaryArtist = track.artists?.[0] || "";
    const cleanTitle = track.title.replace(/\s*\([^)]*\)|\s*\[[^\]]*\]/g, "").trim();
    const query = `${cleanTitle} ${primaryArtist}`.trim();

    // 2. Поиск релиза в каталоге со строгим сопоставлением названия
    try {
      const albums = await api.searchCollections(query, "albums");
      const normTitle = cleanTitle.toLowerCase();
      const matched = albums.find(
        (a) => a.provider === track.provider && a.web_url && a.title.toLowerCase().includes(normTitle)
      ) || albums.find(
        (a) => a.web_url && a.title.toLowerCase().includes(normTitle)
      );

      if (matched && matched.web_url) {
        const pl = await api.previewPlaylistUrl(matched.web_url);
        if (pl && pl.tracks && pl.tracks.length > 0) {
          setExternalPlaylist(pl);
          navigateTo("playlist", { playlistId: "external" });
          return;
        }
      }
    } catch (err) {
      console.warn("Release search failed:", err);
    }

    // 3. Сингл-релиз по собственной ссылке трека (работает для SoundCloud и других)
    if (track.web_url) {
      try {
        const pl = await api.previewPlaylistUrl(track.web_url);
        if (pl && pl.tracks && pl.tracks.length > 0) {
          setExternalPlaylist(pl);
          navigateTo("playlist", { playlistId: "external" });
          return;
        }
      } catch {}
    }

    // 4. Fallback на профиль артиста
    if (primaryArtist) {
      navigateTo("artist", { artist: primaryArtist, provider: track.provider === "spotify" ? "deezer" : track.provider });
    }
  };

  const handleTrackContextMenu = (e: React.MouseEvent) => {
    if (!track) return;
    e.preventDefault();
    e.stopPropagation();
    const isTopDock = config.player?.position === "top";
    const footerRect = footerRef.current?.getBoundingClientRect();
    if (isTopDock) {
      setCtxMenu({
        track,
        index: -1,
        x: e.clientX,
        y: footerRect ? footerRect.bottom + 10 : e.clientY + 10,
        placement: "down",
      });
    } else {
      setCtxMenu({
        track,
        index: -1,
        x: e.clientX,
        y: footerRect ? footerRect.top - 10 : e.clientY - 10,
        placement: "up",
      });
    }
  };

  const handleCtxPlayNext = async (targetTrack: TrackRef) => {
    setCtxMenu(null);
    try {
      await api.playNext(targetTrack);
      showToast(`${t(lang, "trackrow.playNextToast")} ${targetTrack.title}`);
      await refresh();
    } catch (e) {
      showToast(String(e), true);
    }
  };

  const handleCtxToggleFav = async (targetTrack: TrackRef) => {
    setCtxMenu(null);
    try {
      await api.toggleFavorite(targetTrack);
      await refresh();
    } catch (e) {
      showToast(String(e), true);
    }
  };

  const handleCtxCache = async (targetTrack: TrackRef) => {
    setCtxMenu(null);
    try {
      showToast(lang === "ru" ? "Сохранение в кэш…" : "Saving to cache…");
      await api.downloadTrackToCache(targetTrack);
      showToast(lang === "ru" ? "Сохранено в кэш" : "Saved to cache");
    } catch (e) {
      showToast(String(e), true);
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
    <>
      <footer
        ref={footerRef}
        onPointerDown={onPlayerBarPointerDown}
      className={`player ${failed ? "playback-error" : ""} ${
        config.player?.position === "top"
          ? "dock-top"
          : config.player?.position === "left"
          ? "dock-left player-vertical"
          : config.player?.position === "right"
          ? "dock-right player-vertical"
          : "dock-bottom"
      } ${
        config.player?.style === "floating"
          ? "floating-island"
          : isProgressFill
          ? "style-progress-fill floating-island"
          : "full-dock"
      } ${config.player?.hideDetails ? "hide-details" : ""} ${
        config.player?.miniPlayerShape === "capsule" ? "shape-capsule" : ""
      } ${
        config.player?.miniPlayerPreset ? `preset-${config.player.miniPlayerPreset}` : ""
      } bg-theme`}
      style={
        isVertical
          ? {
              width: `${config.player?.height ? config.player.height * 2.8 : 240}px`,
              minWidth: `${config.player?.height ? config.player.height * 2.8 : 240}px`,
            }
          : {
              height: `${effectiveHeight}px`,
              minHeight: `${effectiveHeight}px`,
              maxHeight: `${effectiveHeight}px`,
              width: config.player?.widthPercent && config.player.widthPercent < 100
                ? `${config.player.widthPercent}%`
                : undefined,
            }
      }
    >
      {config.player?.style === "progress_fill" && (
        <div
          className="pl-progress-fill-bg"
          style={{
            width: `${shownPercent}%`,
            transition: dragPercent != null ? "none" : undefined,
          }}
        />
      )}


      {errText && (
        <div className="err-banner">
          <span style={{ color: "var(--red)", fontWeight: 700 }}>!</span>
          <span>{errText} — нажми ▶, чтобы повторить</span>
        </div>
      )}
      <div className="pl-left">
        {track ? (
          <div
            onClick={() => navigateTo("player")}
            onContextMenu={handleTrackContextMenu}
            style={{ cursor: "pointer", flexShrink: 0 }}
            title={lang === "ru" ? "Открыть плеер" : "Open player"}
          >
            <Artwork
              url={config.theme?.customTrackArt || track.artwork_url}
              alt={track.title}
              className="pl-art"
              seed={track.id.length}
            />
          </div>
        ) : (
          <div className="pl-art" style={{ background: "var(--elev)" }} />
        )}
        <div className="pl-meta" onContextMenu={handleTrackContextMenu}>
          <span
            className="ttl pl-title-link"
            title={track?.title ?? ""}
            onClick={handleTitleClick}
            style={{ cursor: track ? "pointer" : "default" }}
          >
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
                        navigateTo("artist", { artist, provider: track.provider === "spotify" ? "deezer" : track.provider });
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
        <div className="pl-actions-row">
          <button
            className={`heart ${fav ? "active" : ""}`}
            onClick={handleFav}
            title={t(lang, "bottom.favorite")}
            aria-label="Like"
            disabled={!track}
          >
            {fav ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="#ff4060" stroke="#ff4060" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            ) : (
              HEART_SVG
            )}
          </button>
        </div>
      </div>
      <div className="pl-center">
        <div className="pl-controls">
          {!isProgressFill && (
            <button
              className={`ctrl-btn smart-shuffle ${smartShuffle ? "active" : player?.shuffle ? "active" : "muted"}`}
              style={smartShuffle ? { color: "#1db954" } : undefined}
              onClick={() => void cycleShuffleMode()}
              title={
                smartShuffle
                  ? (lang === "ru" ? "Умное перемешивание (включено)" : "Smart Shuffle (On)")
                  : player?.shuffle
                  ? (lang === "ru" ? "Перемешивание (нажмите для Умного)" : "Shuffle (Click for Smart)")
                  : t(lang, "bottom.shuffle")
              }
              aria-label="Shuffle"
            >
              {SHUFFLE_SVG}
              {smartShuffle && <span className="smart-sparkle-badge"><IconSparkle size={10} /></span>}
            </button>
          )}
          <button className="ctrl-btn skip-btn" onClick={handlePrev} title={t(lang, "bottom.previous")} aria-label="Previous">
            {PREV_SVG}
          </button>
          <button className="p-play" onClick={handleToggle} title={t(lang, "bottom.playPause")} type="button" aria-label={playing ? "Pause" : "Play"}>
            <MorphPlayIcon playing={playing} size={20} />
          </button>
          <button className="ctrl-btn skip-btn" onClick={handleNext} title={t(lang, "bottom.next")} aria-label="Next">
            {NEXT_SVG}
          </button>
          {!isProgressFill && (
            <button
              className={`ctrl-btn ${player?.repeat === "off" ? "muted" : "active"}`}
              onClick={handleRepeat}
              title={t(lang, "bottom.repeat")}
              aria-label="Repeat"
            >
              {REPEAT_SVG}
              {player?.repeat === "one" && <span className="rep-one">1</span>}
            </button>
          )}
        </div>
        {!isProgressFill && (
          <div className="pl-progress">
            <span className="pl-time">{formatTime(shownMs)}</span>
            <div ref={seekBarRef} className="pl-bar" onPointerDown={onSeekPointerDown}>
              <div className="fill" style={{ width: `${shownPercent}%` }} />
              <div className="knob" style={{ left: `${shownPercent}%` }} />
            </div>
            <span className="pl-time">{formatTime(durationMs)}</span>
          </div>
        )}
      </div>
      <div className="pl-right">
        {isProgressFill && (
          <>
            <button
              className={`ctrl-btn smart-shuffle ${smartShuffle ? "active" : player?.shuffle ? "active" : "muted"}`}
              style={smartShuffle ? { color: "#1db954" } : undefined}
              onClick={() => void cycleShuffleMode()}
              title={
                smartShuffle
                  ? (lang === "ru" ? "Умное перемешивание (включено)" : "Smart Shuffle (On)")
                  : player?.shuffle
                  ? (lang === "ru" ? "Перемешивание (нажмите для Умного)" : "Shuffle (Click for Smart)")
                  : t(lang, "bottom.shuffle")
              }
              aria-label="Shuffle"
            >
              {SHUFFLE_SVG}
              {smartShuffle && <span className="smart-sparkle-badge"><IconSparkle size={10} /></span>}
            </button>
            <button
              className={`ctrl-btn ${player?.repeat === "off" ? "muted" : "active"}`}
              onClick={handleRepeat}
              title={t(lang, "bottom.repeat")}
              aria-label="Repeat"
            >
              {REPEAT_SVG}
              {player?.repeat === "one" && <span className="rep-one">1</span>}
            </button>
          </>
        )}
        <div className="vol" onWheel={onVolWheel} onKeyDown={onVolKeyDown} tabIndex={0}>
          <button
            className="vol-btn"
            onClick={handleMute}
            title={muted ? (lang === "ru" ? "Включить звук" : "Unmute") : (lang === "ru" ? "Выключить звук" : "Mute")}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? MUTE_SVG : player.volume_percent < 50 ? VOLUME_LOW_SVG : VOLUME_HIGH_SVG}
          </button>
          <div
            ref={volBarRef}
            className="vol-bar"
            onPointerDown={onVolPointerDown}
            onPointerMove={onVolPointerMove}
            onPointerUp={onVolPointerUp}
          >
            <div className="fill" style={{ width: `${player.volume_percent}%` }} />
            <div className="knob" style={{ left: `${player.volume_percent}%` }} />
          </div>
        </div>
        <button
          ref={eqBtnRef}
          className={`ctrl-btn eq-btn ${eqActive ? "active" : "muted"}`}
          style={eqActive ? { color: "var(--accent)" } : undefined}
          onClick={() => setIsEqOpen((prev) => !prev)}
          title={lang === "ru" ? "Эквалайзер" : "Equalizer"}
          aria-label="Equalizer"
        >
          {EQUALIZER_SVG}
        </button>
        <button
          className={`pl-fullscreen-btn ${fullscreenOpen ? "active" : ""}`}
          onClick={() => setFullscreenOpen(!fullscreenOpen)}
          title={t(lang, "bottom.fullscreen")}
          aria-label="Fullscreen player"
          disabled={!track}
        >
          {FULLSCREEN_SVG}
        </button>
        <button
          className={`ctrl-btn pl-queue-btn ${isQueueOpen ? "active" : ""}`}
          onClick={toggleQueue}
          title={lang === "ru" ? "Очередь воспроизведения" : "Queue"}
          aria-label="Play queue"
        >
          <div style={{ position: "relative", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          </div>
        </button>
      </div>
    </footer>

    {isEqOpen && (
      <EqualizerPopover
        lang={lang}
        onClose={() => setIsEqOpen(false)}
        anchorRef={eqBtnRef}
      />
    )}

    <PlayerContextMenu
      menu={ctxMenu}
      onClose={() => setCtxMenu(null)}
      onPlayNext={(t) => void handleCtxPlayNext(t)}
      onToggleFavorite={(t) => void handleCtxToggleFav(t)}
      onCacheTrack={(t) => void handleCtxCache(t)}
      isFav={Boolean(ctxMenu && state && isFavorite(state.library, ctxMenu.track))}
      lang={lang}
    />
    </>
  );
}
