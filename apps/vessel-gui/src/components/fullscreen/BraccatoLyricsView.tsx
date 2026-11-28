import React, { useEffect, useRef, useCallback, useMemo } from "react";
import type { Lyric } from "@braccato/parsers";
import { braccatoVesselThemeCss } from "../../lib/lyricsEngine";
import type {
  LyricsAnimation,
  LyricsSyncMode,
  LyricsTextStyle,
} from "./lyricsTypography";

import "@braccato/core/element";
import "@braccato/core/styles/variables.css";
import "@braccato/core/styles/lyrics.css";
import "@braccato/core/styles/instrumental.css";

const BRACCATO_TAG = "braccato-lyrics";

export interface BraccatoLyricsViewProps {
  lyrics: Lyric[];
  curSeconds: number;
  isPlaying: boolean;
  playbackRate?: number;
  syncMode?: LyricsSyncMode;
  textStyle?: LyricsTextStyle;
  animation?: LyricsAnimation;
  onSeek: (seconds: number) => void;
  onUserScrollInteraction: () => void;
  onContainerScroll: (e: React.UIEvent<any>) => void;
  scrolledTop: boolean;
}

export const BraccatoLyricsView: React.FC<BraccatoLyricsViewProps> = ({
  lyrics,
  curSeconds,
  isPlaying,
  playbackRate = 1,
  syncMode = "word",
  textStyle = "default",
  animation = "wave",
  onSeek,
  onUserScrollInteraction,
  onContainerScroll,
  scrolledTop,
}) => {
  const effectiveLyrics = useMemo(() => {
    if (syncMode === "word") return lyrics;
    return lyrics.map((line) => (line.parts?.length ? { ...line, parts: undefined } : line));
  }, [lyrics, syncMode]);

  const elementRef = useRef<any>(null);
  const curSecondsRef = useRef(curSeconds);
  curSecondsRef.current = curSeconds;

  const isPlayingRef = useRef(isPlaying);
  isPlayingRef.current = isPlaying;

  const playbackRateRef = useRef(playbackRate);
  playbackRateRef.current = playbackRate;

  const onSeekRef = useRef(onSeek);
  onSeekRef.current = onSeek;

  const onUserScrollInteractionRef = useRef(onUserScrollInteraction);
  onUserScrollInteractionRef.current = onUserScrollInteraction;

  const freeScrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const returnToFollowingMode = useCallback(() => {
    if (freeScrollTimerRef.current) {
      clearTimeout(freeScrollTimerRef.current);
      freeScrollTimerRef.current = null;
    }
    const el = elementRef.current;
    if (el?.renderer) {
      el.renderer.resumeAutoscroll?.();
      const engine = (el.renderer as any)?.engine;
      if (engine) {
        engine.scrollResumeTime = 0;
        engine.nextScrollAllowedTime = 0;
        engine.queuedScroll = true;
      }
    }
  }, []);

  const handleUserScroll = useCallback(() => {
    onUserScrollInteractionRef.current();

    const el = elementRef.current;
    if (el?.renderer) {
      el.renderer.noteUserScroll?.();
      el.renderer.noteUserScroll?.();
    }

    if (freeScrollTimerRef.current) {
      clearTimeout(freeScrollTimerRef.current);
      freeScrollTimerRef.current = null;
    }

    freeScrollTimerRef.current = setTimeout(() => {
      returnToFollowingMode();
    }, 6000);
  }, [returnToFollowingMode]);

  const setElement = useCallback(
    (el: any) => {
      elementRef.current = el;
      if (!el) return;

      el.theme = braccatoVesselThemeCss;
      el.lyrics = effectiveLyrics;
      el.tickOptions = { playbackRate: playbackRateRef.current, lyricOffset: 0 };
      el.currentTime = curSecondsRef.current;
      el.playing = isPlayingRef.current;

      const handleBraccatoLineClick = (e: Event) => {
        returnToFollowingMode();

        const detail = (e as CustomEvent).detail as
          | { timeS?: number; time?: number }
          | undefined;
        const timeS =
          detail?.timeS !== undefined
            ? detail.timeS
            : detail?.time !== undefined
            ? detail.time > 1000
              ? detail.time / 1000
              : detail.time
            : null;

        if (timeS !== null && timeS !== undefined) {
          onSeekRef.current(timeS);
        }
      };

      const onWheel = () => {
        handleUserScroll();
      };

      const onTouchMove = () => {
        handleUserScroll();
      };

      el.addEventListener("braccato:line-click", handleBraccatoLineClick);
      el.addEventListener("wheel", onWheel, { passive: true, capture: true });
      el.addEventListener("touchmove", onTouchMove, { passive: true, capture: true });

      return () => {
        el.removeEventListener("braccato:line-click", handleBraccatoLineClick);
        el.removeEventListener("wheel", onWheel, { capture: true });
        el.removeEventListener("touchmove", onTouchMove, { capture: true });
        if (freeScrollTimerRef.current) {
          clearTimeout(freeScrollTimerRef.current);
          freeScrollTimerRef.current = null;
        }
        elementRef.current = null;
      };
    },
    [effectiveLyrics, handleUserScroll, returnToFollowingMode]
  );

  // Update clock position & speed rate on the Braccato element
  useEffect(() => {
    const el = elementRef.current;
    if (el) {
      el.tickOptions = { playbackRate, lyricOffset: 0 };
      el.currentTime = curSeconds;
      el.playing = isPlaying;
    }
  }, [curSeconds, isPlaying, playbackRate]);

  // Update lyrics if lyrics or syncMode change
  useEffect(() => {
    const el = elementRef.current;
    if (el) {
      el.lyrics = effectiveLyrics;
    }
  }, [effectiveLyrics]);

  return React.createElement(BRACCATO_TAG, {
    ref: setElement,
    "data-lyrics-sync": syncMode,
    "data-lyrics-style": textStyle,
    "data-lyrics-anim": animation,
    className: `fs-lyrics-container ${scrolledTop ? "scrolled-top" : ""}`,
    onScroll: onContainerScroll,
    style: {
      width: "100%",
      height: "100%",
      display: "block",
      overflowY: "auto",
      background: "transparent",
    },
  });
};
