import { useState, useRef, useEffect } from "react";
import * as api from "../../api/commands";

interface UsePlayerProgressOptions {
  positionMs: number;
  durationMs: number;
  playerStatus?: string;
  refresh: () => Promise<void>;
  showToast: (msg: string, isError?: boolean) => void;
}

export function usePlayerProgress({
  positionMs,
  durationMs,
  playerStatus,
  refresh,
  showToast,
}: UsePlayerProgressOptions) {
  const [posMs, setPosMs] = useState(positionMs);
  const syncRef = useRef({ pos: positionMs, time: Date.now() });
  const [dragPercent, setDragPercent] = useState<number | null>(null);
  const seekBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    syncRef.current = { pos: positionMs, time: Date.now() };
    setPosMs(positionMs);
  }, [positionMs, playerStatus]);

  useEffect(() => {
    if (playerStatus !== "playing") return;
    const timer = window.setInterval(() => {
      const elapsed = Date.now() - syncRef.current.time;
      const cur = syncRef.current.pos + elapsed;
      const max = durationMs || Infinity;
      setPosMs(Math.min(max, cur));
    }, 100);
    return () => window.clearInterval(timer);
  }, [playerStatus, durationMs]);

  const rawPercent = durationMs > 0 ? Math.min(100, Math.max(0, (posMs / durationMs) * 100)) : 0;
  const shownPercent = dragPercent ?? rawPercent;
  const shownMs = dragPercent != null && durationMs > 0 ? (dragPercent / 100) * durationMs : posMs;

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

  return {
    posMs,
    dragPercent,
    shownPercent,
    shownMs,
    seekBarRef,
    onSeekPointerDown,
  };
}
