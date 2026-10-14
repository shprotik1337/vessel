import { useState, useRef } from "react";
import type { TrackRef } from "../../api/types";
import * as api from "../../api/commands";

interface UseQueueReorderOptions {
  queue: TrackRef[];
  refresh: () => Promise<void>;
  showToast: (msg: string, isError?: boolean) => void;
}

export function useQueueReorder({ queue, refresh, showToast }: UseQueueReorderOptions) {
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

  return {
    dragIndex,
    dropOverIndex,
    handleQueuePointerDown,
    handleQueuePointerMove,
    handleQueuePointerUp,
  };
}
