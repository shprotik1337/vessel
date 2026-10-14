import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { listen } from "@tauri-apps/api/event";

import type { ProgressPayload } from "../api/types";
import type { PlaybackProgress } from "./storeTypes";

const PlaybackProgressContext = createContext<PlaybackProgress>({
  status: "stopped",
  position_ms: 0,
  buffered_ms: 0,
  duration_ms: 0,
});

export function usePlaybackProgress(): PlaybackProgress {
  return useContext(PlaybackProgressContext);
}

export function PlaybackProgressProvider({ children }: { children: ReactNode }) {
  const [progress, setProgress] = useState<PlaybackProgress>({
    status: "stopped",
    position_ms: 0,
    buffered_ms: 0,
    duration_ms: 0,
  });

  useEffect(() => {
    let unlistenFn: (() => void) | null = null;
    void listen<ProgressPayload>("progress", (event) => {
      setProgress(event.payload);
    }).then((unlisten) => {
      unlistenFn = unlisten;
    });

    return () => {
      if (unlistenFn) unlistenFn();
    };
  }, []);

  return (
    <PlaybackProgressContext.Provider value={progress}>
      {children}
    </PlaybackProgressContext.Provider>
  );
}
