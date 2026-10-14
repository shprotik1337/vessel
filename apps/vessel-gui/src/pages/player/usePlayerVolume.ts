import { useRef } from "react";
import * as api from "../../api/commands";

interface UsePlayerVolumeOptions {
  volumePercent: number;
  refresh: () => Promise<void>;
}

export function usePlayerVolume({ volumePercent, refresh }: UsePlayerVolumeOptions) {
  const lastVolumeRef = useRef<number | null>(null);
  const volBarRef = useRef<HTMLDivElement>(null);
  const muted = volumePercent === 0;

  const onVolPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const bar = volBarRef.current;
    if (!bar) return;
    bar.setPointerCapture(e.pointerId);

    const updateVol = async (clientX: number) => {
      const rect = bar.getBoundingClientRect();
      const pct = Math.min(100, Math.max(0, Math.round(((clientX - rect.left) / rect.width) * 100)));
      try {
        await api.setVolume(pct);
        await refresh();
      } catch {}
    };

    void updateVol(e.clientX);

    const onPointerMove = (ev: PointerEvent) => {
      void updateVol(ev.clientX);
    };

    const onPointerUp = (ev: PointerEvent) => {
      try {
        bar.releasePointerCapture(ev.pointerId);
      } catch {}
      bar.removeEventListener("pointermove", onPointerMove);
      bar.removeEventListener("pointerup", onPointerUp);
    };

    bar.addEventListener("pointermove", onPointerMove);
    bar.addEventListener("pointerup", onPointerUp);
  };

  const handleMute = async () => {
    if (muted) {
      const restore = lastVolumeRef.current || 80;
      await api.setVolume(restore);
    } else {
      lastVolumeRef.current = volumePercent;
      await api.setVolume(0);
    }
    await refresh();
  };

  return {
    muted,
    volBarRef,
    onVolPointerDown,
    handleMute,
  };
}
