import { useState, useRef } from "react";

import { useApp } from "../store";
import { artistLabel, formatTime, trackKey, providerLabel } from "../lib/utils";
import { t } from "../i18n";
import { Artwork } from "../components/Artwork";
import { PlatformIcon } from "../components/PlatformIcon";
import { VirtualTrackList } from "../components/VirtualTrackList";
import { IconSparkle, IconInfinity, IconWaveStream } from "../components/Icons";
import type { TrackRef } from "../api/types";
import * as api from "../api/commands";

export function Queue() {
  const { state, showToast, refresh, lang, smartTrackKeys } = useApp();
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const dragStartRef = useRef<{ index: number; startY: number; isDragging: boolean } | null>(null);

  const renderOriginBadge = (t: TrackRef) => {
    const isSmart = t.origin === "smart_shuffle" || smartTrackKeys?.has(trackKey(t));
    if (isSmart) {
      return (
        <span
          className="queue-origin-icon queue-origin-smart"
          title={lang === "ru" ? "Умное перемешивание" : "Smart Shuffle"}
        >
          <IconSparkle size={12} />
        </span>
      );
    }
    if (t.origin === "autoplay") {
      return (
        <span
          className="queue-origin-icon queue-origin-autoplay"
          title={lang === "ru" ? "Автопохожие треки" : "Autoplay"}
        >
          <IconInfinity size={13} />
        </span>
      );
    }
    if (t.origin === "my_wave") {
      return (
        <span
          className="queue-origin-icon queue-origin-wave"
          title={lang === "ru" ? "Моя волна" : "My Wave"}
        >
          <IconWaveStream size={12} />
        </span>
      );
    }
    return null;
  };

  if (!state) return null;

  const isLive =
    state.player.status === "playing" || state.player.status === "buffering";

  const playOne = (track: TrackRef) => {
    const idx = state.queue.findIndex((t) => trackKey(t) === trackKey(track));
    const targetIdx = idx < 0 ? 0 : idx;
    void api.playQueueIndex(targetIdx).then(refresh).catch((error) => showToast(String(error), true));
  };

  const removeAt = async (index: number) => {
    try {
      await api.removeFromQueue(index);
      await refresh();
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const clearAll = async () => {
    try {
      await api.clearQueue();
      await refresh();
      showToast(t(lang, "queue.cleared"));
    } catch (error) {
      showToast(String(error), true);
    }
  };

  // Отправляем ПОЛНЫЙ новый порядок очереди, как его видит фронт.
  // Так бэкенд воспроизводит ровно тот порядок, который показан в UI.
  const applyOrder = async (ordered: TrackRef[]) => {
    try {
      await api.reorderQueue(ordered);
      await refresh();
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const handlePointerDown = (e: React.PointerEvent, index: number) => {
    if (e.button !== 0) return;
    const target = e.target as HTMLElement | null;
    if (target?.closest("button, a, .art, .queue-play-btn, .qx")) {
      return;
    }
    dragStartRef.current = { index, startY: e.clientY, isDragging: false };
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
      const row = el?.closest("[data-qi]");
      if (row) {
        const targetIdx = Number(row.getAttribute("data-qi"));
        if (!isNaN(targetIdx) && targetIdx !== dragOverIndex) {
          setDragOverIndex(targetIdx);
        }
      }
    }
  };

  const handlePointerUp = () => {
    if (dragStartRef.current?.isDragging && dragIndex !== null && dragOverIndex !== null && dragIndex !== dragOverIndex) {
      const ordered = [...queue];
      const [moved] = ordered.splice(dragIndex, 1);
      ordered.splice(dragOverIndex, 0, moved);
      setDragIndex(null);
      setDragOverIndex(null);
      dragStartRef.current = null;
      void applyOrder(ordered);
      return;
    }
    setDragIndex(null);
    setDragOverIndex(null);
    dragStartRef.current = null;
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", String(index));
    setDragIndex(index);
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverIndex !== index) {
      setDragOverIndex(index);
    }
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (dragIndex === null || dragIndex === dropIndex) {
      setDragIndex(null);
      setDragOverIndex(null);
      return;
    }
    const ordered = [...queue];
    const [moved] = ordered.splice(dragIndex, 1);
    ordered.splice(dropIndex, 0, moved);
    setDragIndex(null);
    setDragOverIndex(null);
    void applyOrder(ordered);
  };

  const handleDragEnd = () => {
    setDragIndex(null);
    setDragOverIndex(null);
  };

  const queue = state.queue;
  const currentIndex = state.queue_index;
  const current = currentIndex != null && currentIndex < queue.length ? queue[currentIndex] : null;

  const qrowStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "40px 1fr 140px 50px 22px",
    gap: 12,
    alignItems: "center",
    height: 48,
    padding: "0 12px",
    borderRadius: 5,
    cursor: "default",
    border: "1px solid transparent",
  };

  const renderRow = (track: TrackRef, realIndex: number) => (
    <div
      key={trackKey(track) + realIndex}
      data-qi={realIndex}
      draggable={true}
      onDragStart={(e) => handleDragStart(e, realIndex)}
      onDragOver={(e) => handleDragOver(e, realIndex)}
      onDrop={(e) => handleDrop(e, realIndex)}
      onDragEnd={handleDragEnd}
      onPointerDown={(e) => handlePointerDown(e, realIndex)}
      style={{
        ...qrowStyle,
        cursor: dragIndex !== null ? "grabbing" : "grab",
        userSelect: "none",
        opacity: dragIndex === realIndex ? 0.4 : 1,
        ...(dragOverIndex === realIndex && dragIndex !== realIndex
          ? { boxShadow: "inset 0 2px 0 0 var(--accent, #6366f1)" }
          : {}),
      }}
      className="qrow"
    >
        <Artwork
          url={track.artwork_url}
          alt={track.title}
          size={40}
          seed={realIndex}
          className="t-art"
          onPlayClick={async () => {
            if (realIndex === currentIndex && isLive) {
              try { void api.togglePlayback(); } catch {}
            } else {
              playOne(track);
            }
          }}
          isPlaying={realIndex === currentIndex && isLive}
        />
      <div className="c-title" style={{ minWidth: 0 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
          <span className="ttl" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{track.title}</span>
          {renderOriginBadge(track)}
        </div>
        <span className="sub">{artistLabel(track.artists)}</span>
      </div>
      <span className="c-platform" title={providerLabel(track.provider)}>
        <span className="platform-icon-wrap">
          <PlatformIcon kind={track.provider} size={15} />
        </span>
        <span className="platform-name">{providerLabel(track.provider)}</span>
      </span>
      <span className="c-time">{formatTime(track.duration_ms)}</span>
      <span
        className="qx"
        onClick={(e) => {
          e.stopPropagation();
          void removeAt(realIndex);
        }}
        title={t(lang, "queue.remove")}
        style={{ cursor: "pointer", color: "var(--text3)", fontSize: 15, textAlign: "center" }}
      >
        ✕
      </span>
    </div>
  );

  return (
    <div className="view">
      <div className="view-hd">
        <div>
          <div className="view-title">{t(lang, "queue.title")}</div>
          <div className="view-sub">{queue.length} {t(lang, "common.tracks")}</div>
        </div>
        <div className="btns">
          {queue.length > 0 && (
            <button className="btn btn-ghost" onClick={clearAll}>
              {t(lang, "queue.clear")}
            </button>
          )}
        </div>
      </div>

      {queue.length === 0 ? (
        <div className="empty">
          <div className="t1">{t(lang, "queue.empty1")}</div>
          <div className="t2">{t(lang, "queue.empty2")}</div>
        </div>
      ) : (
        <>
          <div className="queue-sec">
            <div className="qsec-hd">
              <span className="qsec-title">{t(lang, "queue.nowPlaying")}</span>
            </div>
            {current ? (
              <div
                style={{
                  ...qrowStyle,
                  gridTemplateColumns: "40px 1fr 140px 50px",
                  background: "var(--elev)",
                  boxShadow: "inset 2px 0 0 0 var(--text)",
                  borderRadius: 6,
                }}
                className="qrow now"
              >
                <Artwork
                  url={current.artwork_url}
                  alt={current.title}
                  size={40}
                  seed={currentIndex ?? 0}
                  className="t-art"
                  onPlayClick={async () => {
                    try { void api.togglePlayback(); } catch {}
                  }}
                  isPlaying={isLive}
                />
                <div className="c-title" style={{ minWidth: 0 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
                    <span className="ttl" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{current.title}</span>
                    {renderOriginBadge(current)}
                  </div>
                  <span className="sub">{artistLabel(current.artists)}</span>
                </div>
                <span className="c-platform" title={providerLabel(current.provider)}>
                  <span className="platform-icon-wrap">
                    <PlatformIcon kind={current.provider} size={15} />
                  </span>
                  <span className="platform-name">{providerLabel(current.provider)}</span>
                </span>
                <span className="c-time">{formatTime(current.duration_ms)}</span>
              </div>
            ) : (
              <div className="set-desc" style={{ padding: "8px 2px" }}>{t(lang, "queue.nothingPlaying")}</div>
            )}
          </div>

          <div
            className="queue-sec"
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <div className="qsec-hd">
              <span className="qsec-title">{t(lang, "queue.upNext")}</span>
              <span style={{ fontSize: 12, color: "var(--text3)" }}>
                {queue.length - (currentIndex != null ? 1 : 0)} {t(lang, "common.tracks")}
              </span>
            </div>
            <VirtualTrackList
              items={queue}
              itemHeight={50}
              className="queue-tracklist"
              style={{ display: "flex", flexDirection: "column", gap: 2 }}
              renderItem={(track, i) => (i === currentIndex ? null : renderRow(track, i))}
            />
          </div>
        </>
      )}
    </div>
  );
}