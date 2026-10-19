import { useState, useRef, useEffect, useCallback } from "react";
import type { TrackRef } from "../../api/types";
import { filterValidArtists } from "../../lib/utils";
import { fetchLyrics, type LyricsData } from "../../lib/lyrics";
import * as api from "../../api/commands";

export interface UseFullscreenLyricsOptions {
  track: TrackRef | null | undefined;
  playerStatus: string | undefined;
  playerPositionMs: number | undefined;
  playerDurationMs: number | undefined;
  progressPositionMs: number | undefined;
  progressDurationMs: number | undefined;
  followTrack: boolean;
  lyricsSource?: string;
  refresh: () => Promise<void>;
  showToast: (msg: string, isError?: boolean) => void;
}

export function useFullscreenLyrics({
  track,
  playerStatus,
  playerPositionMs,
  playerDurationMs,
  progressPositionMs,
  progressDurationMs,
  followTrack,
  lyricsSource = "cadence",
  refresh,
  showToast,
}: UseFullscreenLyricsOptions) {
  const [lyricsData, setLyricsData] = useState<LyricsData | null>(null);
  const [loadingLyrics, setLoadingLyrics] = useState(false);
  const [userScrolled, setUserScrolled] = useState(false);
  const [scrolledTop, setScrolledTop] = useState(false);
  const userScrollTimeoutRef = useRef<number | null>(null);

  const activeLineRef = useRef<HTMLDivElement | null>(null);
  const lyricsContainerRef = useRef<HTMLDivElement | null>(null);

  const currentTrackKey = track ? `${track.provider}:${track.id}` : "";
  const loadedTrackKeyRef = useRef<string>("");

  const effectiveDuration = progressDurationMs || playerDurationMs || track?.duration_ms || 0;
  const initialPos = progressPositionMs || playerPositionMs || 0;
  const [posMs, setPosMs] = useState(initialPos);
  const syncRef = useRef({ pos: initialPos, time: Date.now() });

  useEffect(() => {
    const cur = progressPositionMs || playerPositionMs || 0;
    syncRef.current = { pos: cur, time: Date.now() };
    setPosMs(cur);
  }, [progressPositionMs, playerStatus]);

  useEffect(() => {
    if (playerStatus !== "playing") return;
    let animId: number;
    const update = () => {
      const elapsed = Date.now() - syncRef.current.time;
      const cur = syncRef.current.pos + elapsed;
      const max = effectiveDuration || Infinity;
      setPosMs(Math.min(max, cur));
      animId = requestAnimationFrame(update);
    };
    animId = requestAnimationFrame(update);
    return () => cancelAnimationFrame(animId);
  }, [playerStatus, effectiveDuration]);

  // Track the actively requested fetch key to prevent race conditions and cancellation stalls
  const activeReqRef = useRef<string>("");

  // Fetch lyrics when track or source changes
  useEffect(() => {
    if (!track) {
      setLyricsData(null);
      setLoadingLyrics(false);
      loadedTrackKeyRef.current = "";
      activeReqRef.current = "";
      return;
    }

    const currentSource = lyricsSource || "cadence";
    const cacheFetchKey = `${currentTrackKey}:${currentSource}`;

    if (loadedTrackKeyRef.current === cacheFetchKey) {
      return;
    }

    loadedTrackKeyRef.current = cacheFetchKey;
    activeReqRef.current = cacheFetchKey;
    setLoadingLyrics(true);
    setUserScrolled(false);
    setScrolledTop(false);

    const validArtists = filterValidArtists(track.artists);
    const primaryArtist = validArtists.join(", ");
    const durSecs = track.duration_ms
      ? track.duration_ms / 1000
      : playerDurationMs
      ? playerDurationMs / 1000
      : undefined;

    fetchLyrics(track.title, primaryArtist, durSecs, undefined, currentSource)
      .then((data) => {
        if (activeReqRef.current === cacheFetchKey) {
          setLyricsData(data);
          setLoadingLyrics(false);
        }
      })
      .catch(() => {
        if (activeReqRef.current === cacheFetchKey) {
          setLyricsData(null);
          setLoadingLyrics(false);
        }
      });
  }, [currentTrackKey, track?.id, track?.title, lyricsSource]);

  // Determine current effective time and active lyric line index
  const curSeconds = posMs / 1000;
  let activeIndex = -1;
  if (lyricsData?.synced && lyricsData.lines.length > 0) {
    for (let i = lyricsData.lines.length - 1; i >= 0; i--) {
      if (curSeconds >= lyricsData.lines[i].time) {
        activeIndex = i;
        break;
      }
    }
  }

  // Active line duration and progress for letter fill
  const activeLine = activeIndex >= 0 && lyricsData?.lines ? lyricsData.lines[activeIndex] : null;
  const nextLine = activeIndex >= 0 && lyricsData?.lines ? lyricsData.lines[activeIndex + 1] : null;
  const lineDuration = activeLine ? Math.max(0.5, (nextLine?.time ?? (activeLine.time + 3.8)) - activeLine.time) : 1;
  const lineElapsed = activeLine ? Math.max(0, curSeconds - activeLine.time) : 0;
  const lineProgress = activeLine ? Math.min(1, Math.max(0, lineElapsed / lineDuration)) : 0;

  // Smooth auto-scroll within lyrics container
  const scrollToActive = useCallback(() => {
    const container = lyricsContainerRef.current;
    const line = activeLineRef.current;
    if (container && line) {
      const lineRect = line.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      const relativeTop = lineRect.top - containerRect.top + container.scrollTop;
      const targetScroll = relativeTop - container.clientHeight * 0.42 + lineRect.height / 2;
      container.scrollTo({
        top: Math.max(0, targetScroll),
        behavior: "smooth",
      });
    }
  }, []);

  useEffect(() => {
    if (!followTrack || userScrolled || activeIndex < 0) return;
    const raf = requestAnimationFrame(() => {
      scrollToActive();
    });
    return () => cancelAnimationFrame(raf);
  }, [activeIndex, userScrolled, followTrack, scrollToActive, lyricsData]);

  const handleUserScrollInteraction = (e?: React.SyntheticEvent) => {
    if (e && "deltaY" in e && Math.abs((e as React.WheelEvent).deltaY) < 2) {
      return;
    }
    setUserScrolled(true);
    if (userScrollTimeoutRef.current) {
      window.clearTimeout(userScrollTimeoutRef.current);
    }
    userScrollTimeoutRef.current = window.setTimeout(() => {
      setUserScrolled(false);
    }, 4500);
  };

  const handleContainerScroll = (e: React.UIEvent<HTMLDivElement>) => {
    setScrolledTop(e.currentTarget.scrollTop > 8);
  };

  const handleSeekToLyric = async (timeSecs: number) => {
    try {
      const ms = Math.floor(Math.max(0, timeSecs) * 1000);
      await api.seek(ms);
      setPosMs(ms);
      syncRef.current = { pos: ms, time: Date.now() };
      setUserScrolled(false);
      await refresh();
    } catch (err) {
      showToast(String(err), true);
    }
  };

  useEffect(() => {
    return () => {
      if (userScrollTimeoutRef.current) {
        window.clearTimeout(userScrollTimeoutRef.current);
      }
    };
  }, []);

  return {
    lyricsData,
    loadingLyrics,
    userScrolled,
    scrolledTop,
    activeIndex,
    activeLineRef,
    lyricsContainerRef,
    scrollToActive,
    setUserScrolled,
    handleUserScrollInteraction,
    handleContainerScroll,
    handleSeekToLyric,
    lineProgress,
    curSeconds,
  };
}
