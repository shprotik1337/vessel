import React, { useEffect, useRef, useState, useCallback } from "react";
import { useApp } from "../store";
import { formatTime, providerLabel, isFavorite } from "../lib/utils";
import { t } from "../i18n";
import { Artwork } from "./Artwork";
import * as api from "../api/commands";
import { fetchLyrics, type LyricsData } from "../lib/lyrics";

const CLOSE_SVG = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const HEART_SVG = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
  </svg>
);

const SHUFFLE_SVG = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 3 21 3 21 8" />
    <line x1="4" y1="20" x2="21" y2="3" />
    <polyline points="21 16 21 21 16 21" />
    <line x1="15" y1="15" x2="21" y2="21" />
    <line x1="4" y1="4" x2="9" y2="9" />
  </svg>
);

const PREV_SVG = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 5h2v14H6zM20 5v14l-11-7z" />
  </svg>
);

const NEXT_SVG = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M16 5h2v14h-2zM4 5v14l11-7z" />
  </svg>
);

const PLAY_SVG = (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
    <path d="M7 4l14 8-14 8V4z" />
  </svg>
);

const PAUSE_SVG = (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </svg>
);

const REPEAT_SVG = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 1l4 4-4 4" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <path d="M7 23l-4-4 4-4" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);

const VOLUME_SVG = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
  </svg>
);

const MUTE_SVG = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <line x1="23" y1="9" x2="17" y2="15" />
    <line x1="17" y1="9" x2="23" y2="15" />
  </svg>
);

export function FullscreenPlayer() {
  const { state, refresh, showToast, navigateTo, lang, fullscreenOpen, setFullscreenOpen } = useApp();

  const [lyricsData, setLyricsData] = useState<LyricsData | null>(null);
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  const [userScrolled, setUserScrolled] = useState(false);
  const [scrolledTop, setScrolledTop] = useState(false);
  const userScrollTimeoutRef = useRef<number | null>(null);

  const activeLineRef = useRef<HTMLDivElement | null>(null);
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);
  const seekBarRef = useRef<HTMLDivElement | null>(null);
  const volBarRef = useRef<HTMLDivElement | null>(null);
  const [dragPercent, setDragPercent] = useState<number | null>(null);
  const lastVolumeRef = useRef<number | null>(null);

  const track = state?.now_playing;
  const player = state?.player;
  const fav = track && state ? isFavorite(state.library, track) : false;
  const playing = player?.status === "playing" || player?.status === "buffering";
  const muted = player ? player.volume_percent === 0 : false;

  const currentTrackKey = track ? `${track.provider}:${track.id}` : "";
  const loadedTrackKeyRef = useRef<string>("");

  // Real-time interpolated position for super-smooth lyric highlights
  const [posMs, setPosMs] = useState(player?.position_ms ?? 0);
  const syncRef = useRef({ pos: player?.position_ms ?? 0, time: Date.now() });

  useEffect(() => {
    if (!player) return;
    syncRef.current = { pos: player.position_ms, time: Date.now() };
    setPosMs(player.position_ms);
  }, [player?.position_ms, player?.status]);

  // Only interpolate time when ACTUALLY playing (prevents 2-second ghost playback during buffering)
  useEffect(() => {
    if (player?.status !== "playing") return;
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - syncRef.current.time;
      const cur = syncRef.current.pos + elapsed;
      const max = player?.duration_ms || Infinity;
      setPosMs(Math.min(max, cur));
    }, 80);
    return () => window.clearInterval(timer);
  }, [player?.status, player?.duration_ms]);

  // Fetch lyrics only when track actually changes (not on poll or seek)
  useEffect(() => {
    if (!track) {
      setLyricsData(null);
      setLoadingLyrics(false);
      loadedTrackKeyRef.current = "";
      return;
    }

    // If lyrics for this exact track are already loaded or in progress, don't re-trigger
    if (loadedTrackKeyRef.current === currentTrackKey) {
      return;
    }

    loadedTrackKeyRef.current = currentTrackKey;
    let cancelled = false;
    setLoadingLyrics(true);
    setUserScrolled(false);
    setScrolledTop(false);

    const primaryArtist = track.artists.length > 0 ? track.artists.join(", ") : "";
    const durSecs = track.duration_ms
      ? track.duration_ms / 1000
      : player?.duration_ms
      ? player.duration_ms / 1000
      : undefined;

    fetchLyrics(track.title, primaryArtist, durSecs)
      .then((data) => {
        if (!cancelled) {
          setLyricsData(data);
          setLoadingLyrics(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLyricsData(null);
          setLoadingLyrics(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [currentTrackKey]);

  // Determine current active lyric line index
  const curSeconds = posMs / 1000;
  let activeIndex = -1;
  if (lyricsData?.synced && lyricsData.lines.length > 0) {
    for (let i = lyricsData.lines.length - 1; i >= 0; i--) {
      if (curSeconds >= lyricsData.lines[i].time) {
        activeIndex = i;
        break;
      }
    }
  }

  // Smooth auto-scroll ONLY within lyrics container, precisely centered with the artwork
  const scrollToActive = useCallback(() => {
    const container = lyricsContainerRef.current;
    const line = activeLineRef.current;
    if (container && line) {
      const lineRect = line.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const relativeTop = lineRect.top - containerRect.top + container.scrollTop;
      // Center active line at 40% of container height so it visually centers directly across from album art
      const targetScroll = relativeTop - container.clientHeight * 0.4 + lineRect.height / 2;
      container.scrollTo({
        top: Math.max(0, targetScroll),
        behavior: "smooth",
      });
    }
  }, []);

  useEffect(() => {
    if (userScrolled) return;
    scrollToActive();
  }, [activeIndex, userScrolled, scrollToActive]);

  // Detect user manual scroll in lyrics box (wheel, touch, or drag — avoids false triggers from programmatic scrollTo)
  const handleUserScrollInteraction = () => {
    setUserScrolled(true);
    if (userScrollTimeoutRef.current) {
      window.clearTimeout(userScrollTimeoutRef.current);
    }
    userScrollTimeoutRef.current = window.setTimeout(() => {
      setUserScrolled(false);
    }, 4500);
  };

  const handleContainerScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrolledTop(e.currentTarget.scrollTop > 8);
  };

  // Keyboard shortcut listener (Esc to close, Space to toggle, etc.)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setFullscreenOpen(false);
      } else if (e.key === " " && (e.target as HTMLElement)?.tagName !== "INPUT") {
        e.preventDefault();
        void handleToggle();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [playing]);

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
    try {
      await api.next();
      await refresh();
    } catch (err) {
      showToast(String(err), true);
    }
  };

  const handleShuffle = async () => {
    if (!player) return;
    try {
      await api.setShuffle(!player.shuffle);
      await refresh();
    } catch (err) {
      showToast(String(err), true);
    }
  };

  const handleRepeat = async () => {
    if (!player) return;
    const next = player.repeat === "off" ? "all" : player.repeat === "all" ? "one" : "off";
    try {
      await api.setRepeat(next);
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
    } catch (err) {
      showToast(String(err), true);
    }
  };

  const handleMute = async () => {
    if (!player) return;
    try {
      if (!muted) {
        lastVolumeRef.current = player.volume_percent;
        await api.setVolume(0);
      } else {
        await api.setVolume(lastVolumeRef.current ?? 50);
      }
      await refresh();
    } catch (err) {
      showToast(String(err), true);
    }
  };

  const seekFromEvent = async (clientX: number, commit: boolean) => {
    if (!seekBarRef.current || !player) return;
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
    const targetMs = Math.round(ratio * player.duration_ms);
    try {
      await api.seek(targetMs);
      setPosMs(targetMs);
      syncRef.current = { pos: targetMs, time: Date.now() };
      await refresh();
    } catch (err) {
      showToast(String(err), true);
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

  const volFromEvent = async (clientX: number) => {
    if (!volBarRef.current) return;
    const rect = volBarRef.current.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    const val = Math.round(ratio * 100);
    try {
      await api.setVolume(val);
      await refresh();
    } catch (err) {
      showToast(String(err), true);
    }
  };

  const onVolPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    void volFromEvent(e.clientX);
    const move = (ev: PointerEvent) => {
      ev.preventDefault();
      void volFromEvent(ev.clientX);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const handleSeekToLyric = async (timeSecs: number) => {
    try {
      const ms = Math.floor(timeSecs * 1000);
      await api.seek(ms);
      setPosMs(ms);
      syncRef.current = { pos: ms, time: Date.now() };
      setUserScrolled(false);
      await refresh();
    } catch (err) {
      showToast(String(err), true);
    }
  };

  if (!fullscreenOpen || !track || !player) return null;

  const durationMs = player.duration_ms || track.duration_ms || 0;
  const rawPercent = durationMs > 0 ? Math.min(100, Math.max(0, (posMs / durationMs) * 100)) : 0;
  const shownPercent = dragPercent ?? rawPercent;
  const shownMs = dragPercent != null && durationMs > 0 ? (dragPercent / 100) * durationMs : posMs;

  return (
    <div className="fs-overlay">
      {/* Dynamic blurred ambient background from artwork */}
      <div
        className="fs-backdrop"
        style={{
          backgroundImage: track.artwork_url ? `url("${track.artwork_url}")` : "none",
        }}
      />
      <div className="fs-backdrop-scrim" />

      {/* Top Header Bar */}
      <div className="fs-top-bar">
        <div className="fs-top-badge">
          <span>{providerLabel(track.provider)}</span>
        </div>
        <button
          className="fs-close-btn"
          onClick={() => setFullscreenOpen(false)}
          title={t(lang, "fullscreen.close")}
          aria-label="Close fullscreen"
        >
          {CLOSE_SVG}
        </button>
      </div>

      {/* Main Content Layout */}
      <div className="fs-container">
        {/* Left Column: Artwork, Metadata, Controls */}
        <div className="fs-left">
          <div className="fs-artwork-wrap">
            <Artwork
              url={track.artwork_url}
              alt={track.title}
              className="fs-art"
              seed={track.id.length}
            />
          </div>

          <div className="fs-track-info">
            <div className="fs-track-title-row">
              <div className="fs-track-title" title={track.title}>
                {track.title}
              </div>
              <button
                className={`fs-heart-btn ${fav ? "active" : ""}`}
                onClick={handleFav}
                title={t(lang, "bottom.favorite")}
                aria-label="Favorite"
              >
                {HEART_SVG}
              </button>
            </div>
            <div className="fs-track-artists">
              {track.artists.map((artist, idx) => (
                <span key={`${artist}-${idx}`}>
                  <span
                    className="fs-artist-link"
                    onClick={() => {
                      setFullscreenOpen(false);
                      navigateTo("artist", { artist, provider: track.provider });
                    }}
                  >
                    {artist}
                  </span>
                  {idx < track.artists.length - 1 ? ", " : ""}
                </span>
              ))}
            </div>
          </div>

          {/* Progress Seek Bar */}
          <div className="fs-progress-wrap">
            <div
              ref={seekBarRef}
              className="fs-seek-bar"
              onPointerDown={onSeekPointerDown}
            >
              <div className="fill" style={{ width: `${shownPercent}%` }} />
              <div className="knob" style={{ left: `${shownPercent}%` }} />
            </div>
            <div className="fs-time-row">
              <span>{formatTime(shownMs)}</span>
              <span>{formatTime(durationMs)}</span>
            </div>
          </div>

          {/* Playback Controls */}
          <div className="fs-controls">
            <button
              className={`fs-ctrl-btn ${player.shuffle ? "active" : "muted"}`}
              onClick={handleShuffle}
              title={t(lang, "bottom.shuffle")}
              aria-label="Shuffle"
            >
              {SHUFFLE_SVG}
            </button>
            <button
              className="fs-ctrl-btn"
              onClick={handlePrev}
              title={t(lang, "bottom.previous")}
              aria-label="Previous"
            >
              {PREV_SVG}
            </button>
            <button
              className="fs-play-btn"
              onClick={handleToggle}
              title={t(lang, "bottom.playPause")}
              aria-label={playing ? "Pause" : "Play"}
            >
              {playing ? PAUSE_SVG : PLAY_SVG}
            </button>
            <button
              className="fs-ctrl-btn"
              onClick={handleNext}
              title={t(lang, "bottom.next")}
              aria-label="Next"
            >
              {NEXT_SVG}
            </button>
            <button
              className={`fs-ctrl-btn ${player.repeat === "off" ? "muted" : "active"}`}
              onClick={handleRepeat}
              title={t(lang, "bottom.repeat")}
              aria-label="Repeat"
            >
              {REPEAT_SVG}
              {player.repeat === "one" && <span className="fs-rep-one">1</span>}
            </button>
          </div>

          {/* Volume Control */}
          <div className="fs-vol-wrap">
            <button
              className="fs-vol-btn"
              onClick={handleMute}
              title={muted ? "Включить звук" : "Выключить звук"}
              aria-label={muted ? "Unmute" : "Mute"}
            >
              {muted ? MUTE_SVG : VOLUME_SVG}
            </button>
            <div
              ref={volBarRef}
              className="fs-vol-bar"
              onPointerDown={onVolPointerDown}
            >
              <div className="fill" style={{ width: `${player.volume_percent}%` }} />
              <div className="knob" style={{ left: `${player.volume_percent}%` }} />
            </div>
          </div>
        </div>

        {/* Right Column: Synchronized Karaoke Lyrics */}
        <div className="fs-right">
          <div className="fs-lyrics-header">
            <span className="fs-lyrics-title">{t(lang, "fullscreen.lyrics")}</span>
            {userScrolled && lyricsData?.synced && (
              <button
                className="fs-resume-scroll-btn"
                onClick={() => {
                  setUserScrolled(false);
                  scrollToActive();
                }}
              >
                К текущей строке
              </button>
            )}
          </div>

          <div
            ref={lyricsContainerRef}
            className={`fs-lyrics-container ${scrolledTop ? "scrolled-top" : ""}`}
            onScroll={handleContainerScroll}
            onWheel={handleUserScrollInteraction}
            onTouchMove={handleUserScrollInteraction}
            onPointerDown={handleUserScrollInteraction}
          >
            {loadingLyrics ? (
              <div className="fs-lyrics-status">
                <div className="fs-lyrics-spinner" />
                <p>{t(lang, "fullscreen.searchingLyrics")}</p>
              </div>
            ) : lyricsData?.instrumental ? (
              <div className="fs-lyrics-status">
                <div className="fs-lyrics-icon">♪</div>
                <p className="fs-status-main">{t(lang, "fullscreen.instrumental")}</p>
                <p className="fs-status-sub">{lyricsData.plain}</p>
              </div>
            ) : lyricsData?.lines && lyricsData.lines.length > 0 ? (
              <div className="fs-lyrics-list">
                {lyricsData.lines.map((line, idx) => {
                  const isActive = lyricsData.synced && idx === activeIndex;
                  const isPast = lyricsData.synced && idx < activeIndex;
                  return (
                    <div
                      key={`${line.time}-${idx}`}
                      ref={isActive ? activeLineRef : null}
                      className={`fs-lyric-line ${isActive ? "active" : ""} ${isPast ? "past" : ""}`}
                      onClick={() => {
                        if (lyricsData.synced) {
                          void handleSeekToLyric(line.time);
                        }
                      }}
                      title={lyricsData.synced ? `Перейти к ${formatTime(line.time * 1000)}` : undefined}
                    >
                      {line.text}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="fs-lyrics-status">
                <div className="fs-lyrics-icon">♪</div>
                <p className="fs-status-main">{t(lang, "fullscreen.noLyrics")}</p>
                <p className="fs-status-sub">
                  Для трека «{track.title}» текст пока отсутствует в базе LRCLIB
                </p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
