import { useEffect, useRef } from "react";
import { useApp } from "../store";
import { useCustomization } from "../customization";
import { Artwork } from "./Artwork";
import { formatDuration, filterValidArtists } from "../lib/utils";
import * as api from "../api/commands";

export function QueueDrawer() {
  const { state, refresh, showToast, lang } = useApp();
  const { isQueueOpen, toggleQueue, config } = useCustomization();
  const drawerRef = useRef<HTMLDivElement>(null);

  const position = config.player?.queuePosition || "right";

  // Close on Escape key
  useEffect(() => {
    if (!isQueueOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        toggleQueue();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isQueueOpen, toggleQueue]);

  if (!isQueueOpen) return null;

  const queue = state?.queue || [];
  const currentIndex = state?.queue_index ?? -1;
  const currentTrack = state?.now_playing;

  const handlePlayFromQueue = async (index: number) => {
    try {
      await api.playTracks(queue, index);
      await refresh();
    } catch (e) {
      showToast(String(e), true);
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

  const upcomingTracks = queue.slice(currentIndex >= 0 ? currentIndex + 1 : 0);

  return (
    <>
      {/* Backdrop overlay */}
      <div className="queue-drawer-backdrop" onClick={toggleQueue} />

      <aside
        ref={drawerRef}
        className={`queue-drawer queue-drawer-${position}`}
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
            <div className="queue-section">
              <div className="queue-section-label">
                {lang === "ru" ? "Сейчас играет" : "Now Playing"}
              </div>
              <div className="queue-track-item current-track">
                <Artwork
                  url={currentTrack.artwork_url}
                  alt={currentTrack.title}
                  size={42}
                  className="queue-track-art"
                />
                <div className="queue-track-meta">
                  <div className="queue-track-title" title={currentTrack.title}>
                    {currentTrack.title}
                  </div>
                  <div className="queue-track-artist">
                    {filterValidArtists(currentTrack.artists).join(", ") || "—"}
                  </div>
                </div>
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
              <div className="queue-track-list">
                {upcomingTracks.map((track, idx) => {
                  const absoluteIndex =
                    (currentIndex >= 0 ? currentIndex + 1 : 0) + idx;
                  return (
                    <div
                      key={`${track.id}-${absoluteIndex}`}
                      className="queue-track-item"
                      onClick={() => handlePlayFromQueue(absoluteIndex)}
                    >
                      <Artwork
                        url={track.artwork_url}
                        alt={track.title}
                        size={38}
                        className="queue-track-art"
                      />
                      <div className="queue-track-meta">
                        <div className="queue-track-title" title={track.title}>
                          {track.title}
                        </div>
                        <div className="queue-track-artist">
                          {filterValidArtists(track.artists).join(", ") || "—"}
                        </div>
                      </div>

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
    </>
  );
}
