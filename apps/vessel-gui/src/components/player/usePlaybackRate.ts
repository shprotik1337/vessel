import { useEffect, useState } from "react";
import { PLAYBACK_RATE_EVENT, getStoredPlaybackRate } from "./equalizerData";

export function usePlaybackRate(): number {
  const [rate, setRate] = useState<number>(() => getStoredPlaybackRate());

  useEffect(() => {
    const sync = () => setRate(getStoredPlaybackRate());
    const onRateEvent = (e: Event) => {
      const next = (e as CustomEvent<{ rate?: number }>).detail?.rate;
      if (typeof next === "number" && Number.isFinite(next)) {
        setRate(next);
      } else {
        sync();
      }
    };
    window.addEventListener(PLAYBACK_RATE_EVENT, onRateEvent);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(PLAYBACK_RATE_EVENT, onRateEvent);
      window.removeEventListener("storage", sync);
    };
  }, []);

  return rate;
}
