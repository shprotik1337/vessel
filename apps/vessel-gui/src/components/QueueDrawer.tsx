import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useApp } from "../store";
import { useCustomization } from "../customization";
import { Artwork } from "./Artwork";
import { IconSparkle, IconInfinity, IconWaveStream } from "./Icons";
import { PlatformIcon } from "./PlatformIcon";
import { formatDuration, filterValidArtists, isFavorite, trackKey, providerLabel } from "../lib/utils";
import type { TrackRef } from "../api/types";
import * as api from "../api/commands";

export function QueueDrawer() {
  const { state, refresh, showToast, lang, smartShuffle, cycleShuffleMode, smartTrackKeys } = useApp();
  const { isQueueOpen, toggleQueue, config } = useCustomization();
  const drawerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState<{
    track: TrackRef;
    index: number;
    x: number;
    y: number;
  } | null>(null);

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

  // Close context menu on click outside
  useEffect(() => {
    if (!menu) return;
    const close = () => setMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [menu]);

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
    if (target?.closest("button, a, .art, .queue-play-btn, .queue-track-remove-btn, .qx, .queue-art-container")) {
      return;
    }
    dragStartRef.current = { index: absoluteIndex, startY: e.clientY, isDragging: false };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragStartRef.current) return;
    if (!dragStartRef.current.isDragging) {
      if (Math.abs(e.clientY - dragStartRef.current.startY) > 6) {
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

      // Transition to flying phase on next frame
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

      // Finish animation smoothly
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
      {/* Backdrop overlay */}
      <div className={`queue-drawer-backdrop ${isClosing ? "is-closing" : ""}`} onClick={toggleQueue} />

      <aside
        ref={drawerRef}
        className={`queue-drawer queue-drawer-${position} ${isClosing ? "is-closing" : ""}`}
        onAnimationEnd={handleAnimationEnd}
        aria-label="Queue"
      >
        {/* Header */}
        <div className="queue-drawer-header">
          <div className="queue-drawer-title-row">
            <svg
              width="18"
              height="18"
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
            <span className="queue-drawer-title">
              {lang === "ru" ? "Очередь" : "Queue"}
            </span>
            <span className="queue-drawer-count">{queue.length}</span>
          </div>

          <div className="queue-drawer-header-actions">
            <button
              type="button"
              className={`ctrl-btn smart-shuffle ${smartShuffle ? "active" : state?.player?.shuffle ? "active" : "muted"}`}
              style={{ width: 30, height: 30, borderRadius: "50%", display: "inline-flex", alignItems: "center", justifyContent: "center", position: "relative", ...(smartShuffle ? { color: "#1db954" } : {}) }}
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
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/>
              </svg>
              {smartShuffle && <span className="smart-sparkle-badge"><IconSparkle size={10} /></span>}
            </button>
            {queue.length > 0 && (
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
              aria-label="Close queue"
              title={lang === "ru" ? "Закрыть (Esc)" : "Close (Esc)"}
            >
              ✕
            </button>
          </div>
        </div>

        {/* Content */}
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
                  size={44}
                  className="queue-track-art"
                  onPlayClick={async () => {
                    try { void api.togglePlayback(); } catch {}
                  }}
                  isPlaying={isLive}
                />
                <div className="queue-track-meta">
                  <div className="queue-track-title" title={currentTrack.title}>
                    {currentTrack.title}
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
                        if (target?.closest("button, a, .qx, .queue-track-remove-btn, .art")) return;
                        if (dragStartRef.current?.isDragging) return;
                        void handlePlayFromQueue(absoluteIndex, e.currentTarget, track);
                      }}
                      style={{
                        cursor: dragIndex !== null ? "grabbing" : "pointer",
                        userSelect: "none",
                        opacity: isDragging ? 0.35 : (promotingIndex === absoluteIndex ? 0 : 1),
                        boxShadow: isOver ? "inset 0 2px 0 0 var(--accent, #6366f1)" : undefined,
                        transition: isDragging ? "none" : "background 0.12s ease, opacity 0.12s ease",
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
            onClick={() => void handleToggleFav(menu.track)}
          >
            {state && isFavorite(state.library, menu.track)
              ? (lang === "ru" ? "Удалить из избранного" : "Remove from favorites")
              : (lang === "ru" ? "В избранное" : "Add to favorites")}
          </div>
          <div className="ctx-item" onClick={() => void handleCache(menu.track)}>
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
    </>
  );
}
