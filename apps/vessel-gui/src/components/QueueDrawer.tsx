import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApp, usePlaybackProgress } from "../store";
import { useCustomization } from "../customization";
import { Artwork } from "./Artwork";
import { IconSparkle, IconInfinity, IconWaveStream } from "./Icons";
import { PlatformIcon } from "./PlatformIcon";
import { formatDuration, filterValidArtists, isFavorite, trackKey, providerLabel } from "../lib/utils";
import type { TrackRef } from "../api/types";
import { fetchLyrics, type LyricsData } from "../lib/lyrics";
import * as api from "../api/commands";
import { PlayerContextMenu, type ContextMenuState } from "../pages/player";

interface CompactLyricsProps {
  track: TrackRef | null | undefined;
  isPlaying: boolean;
  lang: string;
}

function CompactDrawerLyrics({ track, isPlaying, lang }: CompactLyricsProps) {
  const progress = usePlaybackProgress();
  const [lyrics, setLyrics] = useState<LyricsData | null>(null);
  const [loading, setLoading] = useState(false);
  const [userScrolled, setUserScrolled] = useState(false);
  const scrollTimeoutRef = useRef<number | null>(null);
  const activeLineRef = useRef<HTMLDivElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const [posMs, setPosMs] = useState(progress.position_ms);
  const syncRef = useRef({ pos: progress.position_ms, time: Date.now() });

  useEffect(() => {
    syncRef.current = { pos: progress.position_ms, time: Date.now() };
    setPosMs(progress.position_ms);
  }, [progress.position_ms, isPlaying]);

  useEffect(() => {
    if (!isPlaying) return;
    let animId: number;
    const update = () => {
      const elapsed = Date.now() - syncRef.current.time;
      setPosMs(syncRef.current.pos + elapsed);
      animId = requestAnimationFrame(update);
    };
    animId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animId);
  }, [isPlaying]);

  useEffect(() => {
    if (!track) {
      setLyrics(null);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setUserScrolled(false);
    const artists = filterValidArtists(track.artists).join(", ");
    const durSecs = track.duration_ms ? track.duration_ms / 1000 : undefined;
    fetchLyrics(track.title, artists, durSecs)
      .then((data) => {
        if (!cancelled) {
          setLyrics(data);
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLyrics(null);
          setLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [track?.id, track?.title]);

  const curSeconds = posMs / 1000;
  let activeIndex = -1;
  if (lyrics?.synced && lyrics.lines.length > 0) {
    for (let i = lyrics.lines.length - 1; i >= 0; i--) {
      if (curSeconds >= lyrics.lines[i].time) {
        activeIndex = i;
        break;
      }
    }
  }

  // Auto-scroll to active line
  useEffect(() => {
    if (userScrolled || activeIndex < 0) return;
    const raf = requestAnimationFrame(() => {
      const container = containerRef.current;
      const line = activeLineRef.current;
      if (container && line) {
        const lineRect = line.getBoundingClientRect();
        const contRect = container.getBoundingClientRect();
        const relativeTop = lineRect.top - contRect.top + container.scrollTop;
        const targetScroll = relativeTop - contRect.height * 0.42 + lineRect.height / 2;
        container.scrollTo({ top: Math.max(0, targetScroll), behavior: "smooth" });
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [activeIndex, userScrolled, lyrics]);

  const onUserScroll = (e?: React.SyntheticEvent) => {
    if (e && "deltaY" in e && Math.abs((e as React.WheelEvent).deltaY) < 2) {
      return;
    }
    setUserScrolled(true);
    if (scrollTimeoutRef.current) window.clearTimeout(scrollTimeoutRef.current);
    scrollTimeoutRef.current = window.setTimeout(() => setUserScrolled(false), 4000);
  };

  const seekToLine = async (timeSecs: number) => {
    try {
      await api.seek(Math.round(timeSecs * 1000));
    } catch {}
  };

  if (!track) {
    return (
      <div className="queue-drawer-lyrics-empty">
        <div className="queue-empty-icon">♫</div>
        <div>{lang === "ru" ? "Сейчас ничего не играет" : "Nothing playing"}</div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="queue-drawer-lyrics-loading">
        <div className="queue-lyrics-spinner" />
        <div>{lang === "ru" ? "Загрузка текста…" : "Loading lyrics…"}</div>
      </div>
    );
  }

  if (lyrics?.instrumental) {
    return (
      <div className="queue-drawer-lyrics-empty">
        <div className="queue-empty-icon">♪</div>
        <div style={{ fontWeight: 600 }}>{lang === "ru" ? "Инструментальный трек" : "Instrumental Track"}</div>
        <div style={{ fontSize: 13, color: "var(--text3)" }}>{lang === "ru" ? "Текст отсутствует" : "No lyrics for this track"}</div>
      </div>
    );
  }

  if (!lyrics || (!lyrics.lines.length && !lyrics.plain)) {
    return (
      <div className="queue-drawer-lyrics-empty">
        <div className="queue-empty-icon">♪</div>
        <div>{lang === "ru" ? "Текст песни пока не найден" : "Lyrics not found"}</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="queue-drawer-lyrics-container"
      onWheel={onUserScroll}
      onTouchMove={onUserScroll}
    >
      {userScrolled && lyrics.synced && (
        <button
          type="button"
          className="queue-lyrics-resume-pill"
          onClick={() => {
            setUserScrolled(false);
          }}
        >
          {lang === "ru" ? "К текущей строке" : "To current line"}
        </button>
      )}
      <div className="queue-drawer-lyrics-list">
        {lyrics.lines.map((line, idx) => {
          const isActive = lyrics.synced && idx === activeIndex;
          const nextTime = lyrics.lines[idx + 1]?.time ?? (line.time + 4);
          const duration = Math.max(0.5, nextTime - line.time);
          const elapsed = Math.max(0, curSeconds - line.time);
          const lineProgress = isActive ? Math.min(1, Math.max(0, elapsed / duration)) : 0;

          return (
            <div
              key={`${line.time}-${idx}`}
              ref={isActive ? activeLineRef : null}
              className={`queue-drawer-lyric-line ${isActive ? "active" : ""}`}
              onClick={() => lyrics.synced && void seekToLine(line.time)}
            >
              {isActive && line.words && line.words.length > 0 ? (
                <span className="queue-lyric-words-wrap">
                  {line.words.map((w, wIdx) => {
                    const wEnd =
                      w.duration != null && w.duration > 0
                        ? w.time + w.duration
                        : (line.words![wIdx + 1]?.time ?? (w.time + 0.6));
                    const wDur = Math.max(0.1, wEnd - w.time);
                    const isWordDone = curSeconds >= wEnd;
                    const isWordFuture = curSeconds < w.time;
                    const wRatio = isWordDone
                      ? 1
                      : isWordFuture
                      ? 0
                      : Math.min(1, Math.max(0, (curSeconds - w.time) / wDur));
                    return (
                      <span key={wIdx}>
                        <span
                          className={`fs-lyric-word ${isWordDone ? "done" : isWordFuture ? "future" : "current"}`}
                          style={
                            {
                              "--word-progress": `${wRatio * 100}%`,
                            } as React.CSSProperties
                          }
                        >
                          {w.text}
                        </span>
                        {wIdx < line.words!.length - 1 && <span className="fs-lyric-space"> </span>}
                      </span>
                    );
                  })}
                </span>
              ) : isActive ? (
                <span
                  className="fs-lyric-line-fill"
                  style={
                    {
                      "--line-progress": `${(lineProgress * 100).toFixed(1)}%`,
                    } as React.CSSProperties
                  }
                >
                  {line.text}
                </span>
              ) : (
                <span className="queue-lyric-text">{line.text}</span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function QueueDrawer() {
  const { state, refresh, showToast, lang, smartShuffle, cycleShuffleMode, smartTrackKeys } = useApp();
  const { isQueueOpen, toggleQueue, config } = useCustomization();
  const drawerRef = useRef<HTMLDivElement>(null);
  const [activeTab, setActiveTab] = useState<"queue" | "lyrics">("queue");
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dropOverIndex, setDropOverIndex] = useState<number | null>(null);
  const dragStartRef = useRef<{ index: number; startY: number; isDragging: boolean } | null>(null);

  // FLIP Flight state for transitioning track into Now Playing
  const [flying, setFlying] = useState<{
    track: TrackRef;
    startX: number;
    startY: number;
    startWidth: number;
    startHeight: number;
    deltaX: number;
    deltaY: number;
    targetWidth: number;
    targetHeight: number;
    phase: "initial" | "flying";
  } | null>(null);
  const [promotingIndex, setPromotingIndex] = useState<number | null>(null);
  const [isExiting, setIsExiting] = useState(false);
  const nowPlayingRef = useRef<HTMLDivElement>(null);
  const nowPlayingSectionRef = useRef<HTMLDivElement>(null);

  const position = config.player?.queuePosition || "right";

  // Close on Escape key
  useEffect(() => {
    if (!isQueueOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (menu) {
          setMenu(null);
        } else {
          toggleQueue();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isQueueOpen, toggleQueue, menu]);

  const [isRendered, setIsRendered] = useState(isQueueOpen);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    if (isQueueOpen) {
      setIsRendered(true);
      setIsClosing(false);
    } else if (isRendered && !isClosing) {
      setIsClosing(true);
    }
  }, [isQueueOpen, isRendered, isClosing]);

  const handleAnimationEnd = (e: React.AnimationEvent) => {
    if (e.target === drawerRef.current && isClosing) {
      setIsRendered(false);
      setIsClosing(false);
    }
  };

  if (!isRendered) return null;

  const queue = state?.queue || [];
  const currentIndex = state?.queue_index ?? -1;
  const currentTrack = state?.now_playing;
  const isLive = state?.player?.status === "playing" || state?.player?.status === "buffering";

  const handlePointerDown = (e: React.PointerEvent, absoluteIndex: number) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("button, a, .art, .queue-play-btn, .queue-track-remove-btn, .queue-track-more-btn, .qx, .queue-art-container")) {
      return;
    }
    dragStartRef.current = { index: absoluteIndex, startY: e.clientY, isDragging: false };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    if (!dragStartRef.current.isDragging) {
      if (Math.abs(e.clientY - dragStartRef.current.startY) > 5) {
        dragStartRef.current.isDragging = true;
        setDragIndex(dragStartRef.current.index);
      }
    }
    if (dragStartRef.current.isDragging) {
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const row = el?.closest("[data-queue-abs-index]");
      if (row) {
        const targetIdx = Number(row.getAttribute("data-queue-abs-index"));
        if (!isNaN(targetIdx) && targetIdx !== dropOverIndex) {
          setDropOverIndex(targetIdx);
        }
      }
    }
  };

  const handlePointerUp = async () => {
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

  const triggerFlightPlay = async (index: number, el: HTMLElement | null, track: TrackRef) => {
    if (flying) return;

    if (el) {
      const sourceRect = el.getBoundingClientRect();
      const targetEl = nowPlayingRef.current || nowPlayingSectionRef.current;
      const targetRect = targetEl ? targetEl.getBoundingClientRect() : {
        left: sourceRect.left,
        top: Math.max(10, sourceRect.top - 200),
        width: sourceRect.width,
        height: sourceRect.height,
      };

      const deltaX = targetRect.left - sourceRect.left;
      const deltaY = targetRect.top - sourceRect.top;

      setFlying({
        track,
        startX: sourceRect.left,
        startY: sourceRect.top,
        startWidth: sourceRect.width,
        startHeight: sourceRect.height,
        deltaX,
        deltaY,
        targetWidth: targetRect.width,
        targetHeight: targetRect.height,
        phase: "initial",
      });
      setPromotingIndex(index);
      setIsExiting(true);

      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          setFlying((prev) => (prev ? { ...prev, phase: "flying" } : null));
        });
      });

      try {
        await api.playTracks(queue, index);
      } catch (e) {
        showToast(String(e), true);
      }

      setTimeout(async () => {
        setFlying(null);
        setPromotingIndex(null);
        setIsExiting(false);
        await refresh();
      }, 320);
    } else {
      try {
        await api.playTracks(queue, index);
        await refresh();
      } catch (e) {
        showToast(String(e), true);
      }
    }
  };

  const handlePlayFromQueue = async (index: number, el?: HTMLElement | null, track?: TrackRef) => {
    const targetTrack = track || queue[index];
    if (targetTrack) {
      const targetEl = el || (document.querySelector(`[data-queue-abs-index="${index}"]`) as HTMLElement | null);
      void triggerFlightPlay(index, targetEl, targetTrack);
    } else {
      try {
        await api.playTracks(queue, index);
        await refresh();
      } catch (e) {
        showToast(String(e), true);
      }
    }
  };

  const handleRemove = async (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    try {
      await api.removeFromQueue(index);
      await refresh();
    } catch (e) {
      showToast(String(e), true);
    }
  };

  const handleClearQueue = async () => {
    try {
      await api.clearQueue();
      await refresh();
      showToast(lang === "ru" ? "Очередь очищена" : "Queue cleared");
    } catch (e) {
      showToast(String(e), true);
    }
  };

  const handleContextMenu = (e: React.MouseEvent, track: TrackRef, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    const btn = (e.currentTarget as HTMLElement).closest(".queue-track-more-btn") || (e.target as HTMLElement).closest(".queue-track-more-btn");
    let x = e.clientX;
    let y = e.clientY;
    if (btn) {
      const r = btn.getBoundingClientRect();
      x = r.left - 215;
      y = r.top;
    } else {
      x = e.clientX > 250 ? e.clientX - 215 : e.clientX;
    }
    x = Math.max(16, Math.min(x, window.innerWidth - 235));
    y = Math.max(16, Math.min(y, window.innerHeight - 250));
    setMenu({ track, index, x, y });
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

  const handleToggleFav = async (track: TrackRef) => {
    setMenu(null);
    try {
      await api.toggleFavorite(track);
      await refresh();
    } catch (e) {
      showToast(String(e), true);
    }
  };

  const handleCache = async (track: TrackRef) => {
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

  const upcomingTracks = queue.slice(currentIndex >= 0 ? currentIndex + 1 : 0);

  return (
    <>
      <aside
        ref={drawerRef}
        className={`queue-drawer queue-drawer-${position} ${isClosing ? "is-closing" : ""}`}
        onAnimationEnd={handleAnimationEnd}
        aria-label="Queue & Lyrics"
      >
        {/* Header */}
        <div className="queue-drawer-header">
          <div className="queue-drawer-nav-row">
            <button
              type="button"
              className="queue-drawer-back-btn"
              onClick={toggleQueue}
              title={lang === "ru" ? "Закрыть панель (Esc)" : "Close panel (Esc)"}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M19 12H5M12 19l-7-7 7-7"/>
              </svg>
              <span>{lang === "ru" ? "Назад" : "Back"}</span>
            </button>

            <div className="queue-drawer-nav-actions">
              {activeTab === "queue" && (
                <button
                  type="button"
                  className={`ctrl-btn smart-shuffle ${smartShuffle ? "active" : state?.player?.shuffle ? "active" : "muted"}`}
                  style={{ width: 28, height: 28, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", position: "relative", ...(smartShuffle ? { color: "#1db954" } : {}) }}
                  onClick={() => void cycleShuffleMode()}
                  title={
                    smartShuffle
                      ? (lang === "ru" ? "Умное перемешивание (включено)" : "Smart Shuffle (On)")
                      : state?.player?.shuffle
                      ? (lang === "ru" ? "Перемешивание (нажмите для Умного)" : "Shuffle (Click for Smart)")
                      : (lang === "ru" ? "Перемешать" : "Shuffle")
                  }
                  aria-label="Shuffle"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>
                  </svg>
                  {smartShuffle && <span className="smart-sparkle-badge"><IconSparkle size={9} /></span>}
                </button>
              )}
              {activeTab === "queue" && queue.length > 0 && (
                <button
                  type="button"
                  className="queue-drawer-clear-btn"
                  onClick={handleClearQueue}
                  title={lang === "ru" ? "Очистить очередь" : "Clear queue"}
                >
                  {lang === "ru" ? "Очистить" : "Clear"}
                </button>
              )}
              <button
                type="button"
                className="queue-drawer-close-btn"
                onClick={toggleQueue}
                aria-label="Close"
                title={lang === "ru" ? "Закрыть (Esc)" : "Close (Esc)"}
              >
                ✕
              </button>
            </div>
          </div>

          {/* Segmented Switch: Очередь / Текст */}
          <div className="queue-drawer-tabs">
            <span
              className="queue-drawer-tabs-pill"
              style={{
                transform: `translateX(${activeTab === "queue" ? "0%" : "100%"})`,
              }}
            />
            <button
              type="button"
              className={`queue-drawer-tab ${activeTab === "queue" ? "active" : ""}`}
              onClick={() => setActiveTab("queue")}
            >
              <span>{lang === "ru" ? "Очередь" : "Queue"}</span>
              {queue.length > 0 && <span className="queue-drawer-count">{queue.length}</span>}
            </button>
            <button
              type="button"
              className={`queue-drawer-tab ${activeTab === "lyrics" ? "active" : ""}`}
              onClick={() => setActiveTab("lyrics")}
            >
              <span>{lang === "ru" ? "Текст" : "Lyrics"}</span>
            </button>
          </div>
        </div>

        {/* Content body */}
        {activeTab === "lyrics" ? (
          <CompactDrawerLyrics
            track={currentTrack}
            isPlaying={isLive}
            lang={lang}
          />
        ) : (
          <div className="queue-drawer-content">
            {/* Now playing */}
            {currentTrack && (
              <div className="queue-section" ref={nowPlayingSectionRef}>
                <div className="queue-section-label">
                  {lang === "ru" ? "Сейчас играет" : "Now Playing"}
                </div>
                <div
                  ref={nowPlayingRef}
                  className={`queue-track-item current-track ${isExiting ? "is-exiting" : ""}`}
                  onContextMenu={(e) => handleContextMenu(e, currentTrack, currentIndex)}
                  style={{ cursor: "default" }}
                >
                  <Artwork
                    url={currentTrack.artwork_url}
                    alt={currentTrack.title}
                    size={42}
                    className="queue-track-art"
                    onPlayClick={async () => {
                      try { void api.togglePlayback(); } catch {}
                    }}
                    isPlaying={isLive}
                  />
                  <div className="queue-track-meta">
                    <div className="queue-track-title" title={currentTrack.title}>
                      <span className="queue-track-title-text">{currentTrack.title}</span>
                    </div>
                    <div className="queue-track-artist">
                      {filterValidArtists(currentTrack.artists).join(", ") || "—"}
                    </div>
                  </div>
                  <span
                    className="queue-platform-badge"
                    title={providerLabel(currentTrack.provider)}
                  >
                    <span className="platform-icon-wrap">
                      <PlatformIcon kind={currentTrack.provider} size={15} />
                    </span>
                  </span>
                  <div className="queue-playing-indicator">
                    <span className="queue-eq-bar" />
                    <span className="queue-eq-bar" />
                    <span className="queue-eq-bar" />
                  </div>
                </div>
              </div>
            )}

            {/* Next in Queue */}
            <div className="queue-section">
              <div className="queue-section-label">
                <span>{lang === "ru" ? "Далее" : "Next up"}</span>
                {upcomingTracks.length > 0 && (
                  <span className="queue-upcoming-count">
                    {upcomingTracks.length}{" "}
                    {lang === "ru" ? "треков" : "tracks"}
                  </span>
                )}
              </div>

              {upcomingTracks.length === 0 ? (
                <div className="queue-empty-state">
                  <div className="queue-empty-icon">♫</div>
                  <div className="queue-empty-text">
                    {lang === "ru"
                      ? "Очередь воспроизведения пуста"
                      : "No more tracks in queue"}
                  </div>
                  <div className="queue-empty-sub">
                    {lang === "ru"
                      ? "Треки из плейлиста или Моей волны появятся здесь"
                      : "Tracks will appear here during playback"}
                  </div>
                </div>
              ) : (
                <div
                  className="queue-track-list"
                  onPointerMove={handlePointerMove}
                  onPointerUp={handlePointerUp}
                >
                  {upcomingTracks.map((track, idx) => {
                    const absoluteIndex =
                      (currentIndex >= 0 ? currentIndex + 1 : 0) + idx;
                    const isDragging = dragIndex === absoluteIndex;
                    const isOver = dropOverIndex === absoluteIndex && !isDragging;
                    return (
                      <div
                        key={`${track.id}-${absoluteIndex}`}
                        data-queue-abs-index={absoluteIndex}
                        className={`queue-track-item ${promotingIndex === absoluteIndex ? "is-promoting" : ""}`}
                        onPointerDown={(e) => handlePointerDown(e, absoluteIndex)}
                        onContextMenu={(e) => handleContextMenu(e, track, absoluteIndex)}
                        onClick={(e) => {
                          const target = e.target as HTMLElement | null;
                          if (target?.closest("button, a, .qx, .queue-track-remove-btn, .queue-track-more-btn, .art")) return;
                          if (dragStartRef.current?.isDragging) return;
                          void handlePlayFromQueue(absoluteIndex, e.currentTarget, track);
                        }}
                        style={{
                          cursor: dragIndex !== null ? "grabbing" : "grab",
                          userSelect: "none",
                          opacity: isDragging ? 0.35 : (promotingIndex === absoluteIndex ? 0 : 1),
                          transform: isDragging ? "scale(1.02)" : "none",
                          boxShadow: isOver
                            ? "inset 0 2px 0 0 var(--accent, #e11d48)"
                            : isDragging
                            ? "0 8px 24px rgba(0,0,0,0.5)"
                            : undefined,
                          transition: isDragging ? "none" : "background 0.12s ease, opacity 0.12s ease, transform 0.15s ease",
                        }}
                      >
                        <Artwork
                          url={track.artwork_url}
                          alt={track.title}
                          size={40}
                          className="queue-track-art"
                          onPlayClick={async () => {
                            if (absoluteIndex === currentIndex && isLive) {
                              try { void api.togglePlayback(); } catch {}
                            } else {
                              const rowEl = document.querySelector(`[data-queue-abs-index="${absoluteIndex}"]`) as HTMLElement | null;
                              void handlePlayFromQueue(absoluteIndex, rowEl, track);
                            }
                          }}
                          isPlaying={absoluteIndex === currentIndex && isLive}
                        />
                        <div className="queue-track-meta">
                          <div className="queue-track-title" title={track.title}>
                            <span className="queue-track-title-text">{track.title}</span>
                            {(track.origin === "smart_shuffle" || smartTrackKeys.has(trackKey(track))) && (
                              <span className="queue-origin-icon queue-origin-smart" title={lang === "ru" ? "Умное перемешивание" : "Smart Shuffle"}>
                                <IconSparkle size={12} />
                              </span>
                            )}
                            {track.origin === "autoplay" && (
                              <span className="queue-origin-icon queue-origin-autoplay" title={lang === "ru" ? "Автопохожие треки" : "Autoplay"}>
                                <IconInfinity size={13} />
                              </span>
                            )}
                            {track.origin === "my_wave" && (
                              <span className="queue-origin-icon queue-origin-wave" title={lang === "ru" ? "Моя волна" : "My Wave"}>
                                <IconWaveStream size={12} />
                              </span>
                            )}
                          </div>
                          <div className="queue-track-artist">
                            {filterValidArtists(track.artists).join(", ") || "—"}
                          </div>
                        </div>

                        <span
                          className="queue-platform-badge"
                          title={providerLabel(track.provider)}
                        >
                          <span className="platform-icon-wrap">
                            <PlatformIcon kind={track.provider} size={15} />
                          </span>
                        </span>

                        <div className="queue-track-duration">
                          {track.duration_ms ? formatDuration(track.duration_ms) : ""}
                        </div>

                        <button
                          type="button"
                          className="queue-track-more-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleContextMenu(e, track, absoluteIndex);
                          }}
                          title={lang === "ru" ? "Действия" : "Actions"}
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                            <circle cx="12" cy="5" r="1.5" />
                            <circle cx="12" cy="12" r="1.5" />
                            <circle cx="12" cy="19" r="1.5" />
                          </svg>
                        </button>

                        <button
                          type="button"
                          className="queue-track-remove-btn"
                          onClick={(e) => handleRemove(e, absoluteIndex)}
                          title={lang === "ru" ? "Удалить из очереди" : "Remove from queue"}
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}
      </aside>

      {flying && createPortal(
        <div
          className="queue-flying-card"
          style={{
            position: "fixed",
            left: flying.startX,
            top: flying.startY,
            width: flying.startWidth,
            height: flying.startHeight,
            transform: flying.phase === "flying"
              ? `translate3d(${flying.deltaX}px, ${flying.deltaY}px, 0)`
              : "translate3d(0, 0, 0)",
            zIndex: 99999,
            pointerEvents: "none",
          }}
        >
          <Artwork
            url={flying.track.artwork_url}
            alt={flying.track.title}
            size={flying.phase === "flying" ? 44 : 40}
            className="queue-track-art"
          />
          <div className="queue-track-meta">
            <div className="queue-track-title" title={flying.track.title}>
              <span className="queue-track-title-text">{flying.track.title}</span>
            </div>
            <div className="queue-track-artist">
              {filterValidArtists(flying.track.artists).join(", ") || "—"}
            </div>
          </div>
          <span className="queue-platform-badge" title={providerLabel(flying.track.provider)}>
            <span className="platform-icon-wrap">
              <PlatformIcon kind={flying.track.provider} size={15} />
            </span>
          </span>
          <div className="queue-track-duration">
            {flying.track.duration_ms ? formatDuration(flying.track.duration_ms) : ""}
          </div>
        </div>,
        document.body
      )}

      <PlayerContextMenu
        menu={menu}
        onClose={() => setMenu(null)}
        onPlayNext={(t) => void handlePlayNext(t)}
        onToggleFavorite={(t) => void handleToggleFav(t)}
        onCacheTrack={(t) => void handleCache(t)}
        onRemoveTrack={(idx) => void handleRemoveTrack(idx)}
        isFav={menu && state ? isFavorite(state.library, menu.track) : false}
        lang={lang}
      />
    </>
  );
}
