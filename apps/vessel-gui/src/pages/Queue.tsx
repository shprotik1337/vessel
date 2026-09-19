import { useRef, useState } from "react";

import { useApp } from "../store";
import { artistLabel, formatTime, trackKey, providerLabel } from "../lib/utils";
import { t } from "../i18n";
import { Artwork } from "../components/Artwork";
import type { TrackRef } from "../api/types";
import * as api from "../api/commands";

export function Queue() {
  const { state, playTracks, showToast, refresh, lang } = useApp();
  const drag = useRef<{ from: number; startY: number; moved: boolean } | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);

  if (!state) return null;

  const isLive =
    state.player.status === "playing" || state.player.status === "buffering";

  const playOne = (track: TrackRef) => {
    const idx = state.queue.findIndex((t) => trackKey(t) === trackKey(track));
    void playTracks(state.queue, idx < 0 ? 0 : idx);
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

  const onMouseDown = (e: React.MouseEvent, i: number) => {
    if (e.button !== 0) return;
    drag.current = { from: i, startY: e.clientY, moved: false };
    setHoverIdx(i);
  };

  const onMouseMove = (e: React.MouseEvent) => {
    if (!drag.current) return;
    if (!drag.current.moved && Math.abs(e.clientY - drag.current.startY) > 3) {
      drag.current.moved = true;
    }
    const el = document.elementFromPoint(e.clientX, e.clientY);
    const row = el?.closest?.("[data-qi]");
    const idx = row ? Number(row.getAttribute("data-qi")) : null;
    if (idx != null && hoverIdx !== idx) setHoverIdx(idx);
  };

  const onMouseUp = () => {
    const d = drag.current;
    drag.current = null;
    if (d && d.moved && hoverIdx != null && d.from !== hoverIdx) {
      const ordered = [...queue];
      const [moved] = ordered.splice(d.from, 1);
      ordered.splice(hoverIdx, 0, moved);
      void applyOrder(ordered);
    }
    setHoverIdx(null);
  };

  const queue = state.queue;
  const currentIndex = state.queue_index;
  const current = currentIndex != null && currentIndex < queue.length ? queue[currentIndex] : null;

  const qrowStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: "40px 1fr auto 50px 22px",
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
      onMouseDown={(e) => onMouseDown(e, realIndex)}
      style={{
        ...qrowStyle,
        cursor: "grab",
        userSelect: "none",
        ...(hoverIdx === realIndex && drag.current?.moved
          ? { boxShadow: "inset 0 2px 0 0 var(--text)" }
          : {}),
      }}
      className="qrow"
      onDoubleClick={() => playOne(track)}
    >
      <Artwork
        url={track.artwork_url}
        alt={track.title}
        size={40}
        seed={realIndex}
        className="t-art"
        onPlayClick={async () => {
          if (realIndex === currentIndex && isLive) {
            try { await api.togglePlayback(); } catch {}
          } else {
            playOne(track);
          }
        }}
        isPlaying={realIndex === currentIndex && isLive}
      />
      <div className="c-title" style={{ minWidth: 0 }}>
        <span className="ttl">{track.title}</span>
        <span className="sub">{artistLabel(track.artists)}</span>
      </div>
      <span className="pl-src">{providerLabel(track.provider)}</span>
      <span className="c-time">{formatTime(track.duration_ms)}</span>
      <span
        className="qx"
        onClick={() => removeAt(realIndex)}
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
          <div className="ico">☰</div>
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
                  gridTemplateColumns: "40px 1fr auto 50px",
                  background: "var(--elev)",
                  boxShadow: "inset 2px 0 0 0 var(--text)",
                  borderRadius: 6,
                }}
                className="qrow now"
                onDoubleClick={() => current && playOne(current)}
              >
                <Artwork
                  url={current.artwork_url}
                  alt={current.title}
                  size={40}
                  seed={currentIndex ?? 0}
                  className="t-art"
                  onPlayClick={async () => { try { await api.togglePlayback(); } catch {} }}
                  isPlaying={isLive}
                />
                <div className="c-title" style={{ minWidth: 0 }}>
                  <span className="ttl">{current.title}</span>
                  <span className="sub">{artistLabel(current.artists)}</span>
                </div>
                <span className="pl-src">{providerLabel(current.provider)}</span>
                <span className="c-time">{formatTime(current.duration_ms)}</span>
              </div>
            ) : (
              <div className="set-desc" style={{ padding: "8px 2px" }}>{t(lang, "queue.nothingPlaying")}</div>
            )}
          </div>

          <div className="queue-sec">
            <div className="qsec-hd">
              <span className="qsec-title">{t(lang, "queue.upNext")}</span>
              <span style={{ fontSize: 12, color: "var(--text3)" }}>
                {queue.length - (currentIndex != null ? 1 : 0)} {t(lang, "common.tracks")}
              </span>
            </div>
            <div
              style={{ display: "flex", flexDirection: "column", gap: 2 }}
              onMouseMove={onMouseMove}
              onMouseUp={onMouseUp}
              onMouseLeave={() => {
                if (drag.current) drag.current = null;
                setHoverIdx(null);
              }}
            >
              {queue.map((track, i) =>
                i === currentIndex ? null : renderRow(track, i),
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}