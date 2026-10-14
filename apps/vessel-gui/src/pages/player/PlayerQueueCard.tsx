import React from "react";
import type { TrackRef } from "../../api/types";
import { formatTime, providerLabel, filterValidArtists } from "../../lib/utils";
import { Artwork } from "../../components/Artwork";
import { PlatformIcon } from "../../components/PlatformIcon";
import { TRASH_SVG } from "./playerIcons";

interface PlayerQueueCardProps {
  queue: TrackRef[];
  currentIndex: number;
  playing: boolean;
  dragIndex: number | null;
  dropOverIndex: number | null;
  trackRowActiveStyle?: string;
  lang: string;
  onClearQueue: () => void;
  onPlayTrack: (index: number) => void;
  onTogglePlayCurrent: () => void;
  onPointerDownRow: (e: React.PointerEvent, index: number) => void;
  onPointerMoveContainer: (e: React.PointerEvent) => void;
  onPointerUpContainer: () => void;
  onContextMenuRow: (e: React.MouseEvent, track: TrackRef, index: number) => void;
}

export function PlayerQueueCard({
  queue,
  currentIndex,
  playing,
  dragIndex,
  dropOverIndex,
  trackRowActiveStyle,
  lang,
  onClearQueue,
  onPlayTrack,
  onTogglePlayCurrent,
  onPointerDownRow,
  onPointerMoveContainer,
  onPointerUpContainer,
  onContextMenuRow,
}: PlayerQueueCardProps) {
  return (
    <div
      className="player-queue-card"
      style={{
        background: "transparent",
        backdropFilter: "none",
        border: "none",
        borderRadius: 0,
        padding: "10px 4px",
        boxShadow: "none",
        position: "relative",
        zIndex: 2,
      }}
    >
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
            onClick={onClearQueue}
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
        onPointerMove={onPointerMoveContainer}
        onPointerUp={onPointerUpContainer}
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
                onPointerDown={(e) => onPointerDownRow(e, idx)}
                onContextMenu={(e) => onContextMenuRow(e, qTrack, idx)}
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
                <span
                  style={{
                    width: 24,
                    fontSize: 12.5,
                    color: isCur
                      ? (trackRowActiveStyle === "accent" ? "var(--accent, #6366f1)" : "#ffffff")
                      : "var(--text3, rgba(255,255,255,0.4))",
                    fontVariantNumeric: "tabular-nums",
                  }}
                >
                  {idx + 1}
                </span>
                <div
                  className="queue-art-container"
                  style={{ width: 48, height: 48, borderRadius: 8, overflow: "hidden", flexShrink: 0, position: "relative" }}
                >
                  <Artwork
                    url={qTrack.artwork_url}
                    alt={qTrack.title}
                    size={48}
                    seed={qTrack.id.length}
                    onPlayClick={() => {
                      if (isCur) {
                        onTogglePlayCurrent();
                      } else {
                        onPlayTrack(idx);
                      }
                    }}
                    isPlaying={isCur && playing}
                  />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13.5,
                      fontWeight: 600,
                      color: isCur
                        ? (trackRowActiveStyle === "accent" ? "var(--accent, #3b82f6)" : "#ffffff")
                        : "#ffffff",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {qTrack.title}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "rgba(255, 255, 255, 0.7)",
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
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
                <span
                  style={{
                    fontSize: 12,
                    color: "rgba(255, 255, 255, 0.6)",
                    fontVariantNumeric: "tabular-nums",
                    width: 42,
                    textAlign: "right",
                  }}
                >
                  {formatTime(qTrack.duration_ms)}
                </span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
