import { useCallback, useEffect, useRef, useState } from "react";
import type { FullState, Playlist, QueueContext, TrackRef } from "../api/types";
import type { Lang } from "../i18n";
import { trackKey, dedupe } from "../lib/utils";
import * as api from "../api/commands";
import type { MixContext } from "./storeTypes";
import { semanticTrackKey } from "./storeUtils";

interface UseAutoplayAndQueueProps {
  state: FullState | null;
  lang: Lang;
  refresh: () => Promise<void>;
  showToast: (message: string, error?: boolean, durationMs?: number) => void;
  setHasEverPlayed: React.Dispatch<React.SetStateAction<boolean>>;
}

export function useAutoplayAndQueue({
  state,
  lang,
  refresh,
  showToast,
  setHasEverPlayed,
}: UseAutoplayAndQueueProps) {
  const [waveTracks, setWaveTracks] = useState<TrackRef[]>([]);
  const [isWaveActive, setIsWaveActive] = useState<boolean>(false);
  const [activeMixContext, setActiveMixContext] = useState<MixContext | null>(null);
  const [externalPlaylist, setExternalPlaylist] = useState<Playlist | null>(null);
  const [smartTrackKeys, setSmartTrackKeys] = useState<Set<string>>(() => new Set());
  const [smartShuffle, setSmartShuffleState] = useState<boolean>(() => {
    try {
      return localStorage.getItem("vessel_smart_shuffle") === "true";
    } catch {
      return false;
    }
  });

  const setSmartShuffle = useCallback((val: boolean) => {
    setSmartShuffleState(val);
    try {
      if (val) {
        localStorage.setItem("vessel_smart_shuffle", "true");
      } else {
        localStorage.removeItem("vessel_smart_shuffle");
      }
    } catch {
      // ignore
    }
  }, []);

  const expandingQueueRef = useRef(false);
  const lastExpandedIndexRef = useRef<number | null>(null);
  const lastExpandedTimeRef = useRef<number>(0);
  const sessionPlayedKeysRef = useRef<Set<string>>(new Set());
  const sessionSkipsRef = useRef<Set<string>>(new Set());
  const sessionLikesRef = useRef<Set<string>>(new Set());
  const lastTrackStartTimeRef = useRef<number>(Date.now());
  const lastTrackKeyRef = useRef<string | null>(null);
  const lastEndedHandledKeyRef = useRef<string | null>(null);

  useEffect(() => {
    lastExpandedIndexRef.current = null;
    lastEndedHandledKeyRef.current = null;
  }, [activeMixContext, isWaveActive]);

  useEffect(() => {
    if (!state || state.queue_index === null) return;
    const curTrack = state.queue[state.queue_index];
    if (!curTrack) return;
    const curKey = semanticTrackKey(curTrack);

    if (lastTrackKeyRef.current && lastTrackKeyRef.current !== curKey) {
      lastEndedHandledKeyRef.current = null;
      const timeSpentMs = Date.now() - lastTrackStartTimeRef.current;
      // Если предыдущий трек играл меньше 15 секунд при не остановленном плеере — это явный skip
      if (timeSpentMs < 15000 && state.player?.status !== "stopped") {
        sessionSkipsRef.current.add(lastTrackKeyRef.current);
      } else {
        sessionPlayedKeysRef.current.add(lastTrackKeyRef.current);
      }
    }

    lastTrackKeyRef.current = curKey;
    lastTrackStartTimeRef.current = Date.now();
  }, [state?.queue_index, state?.player?.status]);

  const expandQueueTracks = useCallback(
    async (count = 8, force = false): Promise<TrackRef[]> => {
      if (!force && (expandingQueueRef.current || Date.now() - lastExpandedTimeRef.current < 3000)) return [];
      expandingQueueRef.current = true;
      lastExpandedTimeRef.current = Date.now();
      try {
        const rawProviders = await api.getWaveProviders().catch(() => "all");
        const fresh = await api.getState().catch(() => state);
        const currentQueue = fresh?.queue ?? state?.queue ?? [];
        const currentIndex = fresh?.queue_index ?? state?.queue_index ?? 0;

        if (isWaveActive) {
          // Волна (My Wave): непрерывный поток
          const waveSource = (await api.getWaveSource().catch(() => "favorites")) as "favorites" | "playlists";
          const more = await api.getWaveRecommendations(waveSource, count * 2, null, rawProviders).catch(() => []);
          const existingKeys = new Set(currentQueue.map(trackKey));
          const existingSemantics = new Set(currentQueue.map(semanticTrackKey));
          const chunk = more
            .filter((t) => !existingKeys.has(trackKey(t)) && !existingSemantics.has(semanticTrackKey(t)))
            .slice(0, count);
          if (chunk.length > 0) {
            setWaveTracks((prev) => dedupe([...prev, ...chunk]));
            for (const t of chunk) {
              await api.addToQueue(t);
            }
            await refresh();
          }
          return chunk;
        }

        // Единый бэкенд Autoplay / Infinite Queue / Smart Shuffle:
        const currentTrack = currentQueue[currentIndex] ?? null;
        const recentPlayed = currentQueue.slice(Math.max(0, currentIndex - 15), currentIndex);
        const remainingQueue = currentQueue.slice(currentIndex + 1);

        const context: QueueContext = {
          current_track: currentTrack,
          recent_played: recentPlayed,
          remaining_queue: remainingQueue,
          session_played_keys: Array.from(sessionPlayedKeysRef.current),
          feedback_skips: Array.from(sessionSkipsRef.current),
          feedback_likes: Array.from(sessionLikesRef.current),
        };

        const chunk = await api.getNextAutoplayChunk(context, count, rawProviders).catch((err) => {
          console.warn("Autoplay chunk error:", err);
          return [];
        });

        if (chunk.length > 0) {
          for (const track of chunk) {
            await api.addToQueue(track);
          }
          await refresh();
        }
        return chunk;
      } catch (e) {
        console.warn("expandQueueTracks error:", e);
        return [];
      } finally {
        expandingQueueRef.current = false;
      }
    },
    [activeMixContext, isWaveActive, state, refresh],
  );

  const playNextTrack = useCallback(async () => {
    if (!state) return;
    const qIndex = state.queue_index ?? 0;
    const qLen = state.queue.length;

    const isAutoSimilarEnabled = localStorage.getItem("vessel_auto_similar") !== "false";
    const isInfiniteMode = isWaveActive || !!activeMixContext || isAutoSimilarEnabled;

    if (qIndex >= qLen - 1) {
      if (isInfiniteMode || smartShuffle) {
        showToast(
          isWaveActive
            ? (lang === "ru" ? "Генерация волны..." : "Generating wave...")
            : activeMixContext
              ? (lang === "ru" ? "Продолжение микса..." : "Continuing mix...")
              : smartShuffle
                ? (lang === "ru" ? "Подбор треков (Smart Shuffle)..." : "Generating Smart Shuffle tracks...")
                : (lang === "ru" ? "Автопродолжение очереди..." : "Autoplaying next tracks..."),
          false,
          2000
        );
        const added = await expandQueueTracks(8, true);
        if (added.length > 0) {
          await api.next();
          await refresh();
          return;
        }
      }
    }

    try {
      await api.next();
      await refresh();
    } catch (err) {
      showToast(String(err), true);
    }
  }, [state, isWaveActive, activeMixContext, smartShuffle, expandQueueTracks, refresh, lang, showToast]);

  useEffect(() => {
    if (!state || state.queue.length === 0 || state.queue_index === null) return;
    const isAutoSimilarEnabled = localStorage.getItem("vessel_auto_similar") !== "false";
    const shouldAutoplay = isWaveActive || !!activeMixContext || isAutoSimilarEnabled;
    if (!shouldAutoplay) return;

    const remaining = state.queue.length - 1 - state.queue_index;
    const isNearEnd = remaining <= 2;
    const isPlayingOrBuffering =
      state.player?.status === "playing" || state.player?.status === "buffering";

    // 1. Упреждающий префетч автопродолжения: когда до конца очереди остаётся <= 2 треков
    if (
      isPlayingOrBuffering &&
      isNearEnd &&
      !expandingQueueRef.current &&
      lastExpandedIndexRef.current !== state.queue_index
    ) {
      lastExpandedIndexRef.current = state.queue_index;
      void expandQueueTracks(8).then((added) => {
        // Если запрос не смог добавить треки (пустой ответ или сетевой сбой),
        // сбрасываем блокировку, чтобы после throttling backoff (через 3 с)
        // была возможность повторить попытку до того, как трек закончится
        if (!added || added.length === 0) {
          lastExpandedIndexRef.current = null;
        }
      });
      return;
    }

    // 2. Естественное окончание очереди: если плеер перешёл в stopped на последнем треке,
    // а префетч не успел добавить треки заранее — автоматически расширяем очередь и продолжаем
    if (
      state.player?.status === "stopped" &&
      remaining === 0 &&
      lastTrackKeyRef.current &&
      lastEndedHandledKeyRef.current !== lastTrackKeyRef.current &&
      !expandingQueueRef.current
    ) {
      lastEndedHandledKeyRef.current = lastTrackKeyRef.current;
      void (async () => {
        try {
          const added = await expandQueueTracks(8, true);
          if (added.length > 0) {
            await api.next();
            await refresh();
          }
        } catch (e) {
          console.warn("Autoplay natural end recovery error:", e);
        }
      })();
    }
  }, [
    state?.queue_index,
    state?.queue.length,
    state?.player?.status,
    activeMixContext,
    isWaveActive,
    expandQueueTracks,
    refresh,
  ]);

  const toggleShuffle = useCallback(async () => {
    if (!state) return;
    const nextVal = !state.player.shuffle;
    try {
      await api.setShuffle(nextVal);
      await refresh();
      showToast(
        lang === "ru"
          ? (nextVal ? "Случайный порядок включён" : "Случайный порядок выключен")
          : (nextVal ? "Shuffle on" : "Shuffle off")
      );
    } catch (e) {
      showToast(String(e), true);
    }
  }, [state, lang, refresh, showToast]);

  const toggleSmartShuffle = useCallback(async () => {
    if (!state) return;
    if (smartShuffle) {
      // Выключаем умное перемешивание для текущей очереди
      setSmartShuffle(false);
      try {
        const fresh = await api.getState().catch(() => state);
        if (fresh && fresh.queue_index !== null) {
          const curIdx = fresh.queue_index;
          const played = fresh.queue.slice(0, curIdx + 1);
          const unplayedClean = fresh.queue.slice(curIdx + 1).filter(
            (t) => t.origin !== "smart_shuffle" && !smartTrackKeys.has(trackKey(t))
          );
          const newQueue = [...played, ...unplayedClean];
          if (newQueue.length !== fresh.queue.length) {
            await api.reorderQueue(newQueue);
          }
        }
        setSmartTrackKeys(new Set());
        await refresh();
      } catch (e) {
        showToast(String(e), true);
      }
    } else {
      // Включаем умное перемешивание для текущей очереди
      try {
        if (!state.player.shuffle) {
          await api.setShuffle(true);
        }
        const fresh = await api.getState().catch(() => state);
        const currentQueue = fresh?.queue ?? state.queue ?? [];
        const currentIndex = fresh?.queue_index ?? state.queue_index ?? 0;
        if (currentQueue.length === 0) {
          showToast(lang === "ru" ? "Очередь пуста" : "Queue is empty");
          return;
        }
        showToast(lang === "ru" ? "Умное перемешивание очереди…" : "Applying Smart Shuffle…", false, 1500);
        const rawProviders = await api.getRecommendationProviders().catch(() => "all");
        const res = await api.applySmartShuffle(currentQueue, currentIndex, rawProviders);
        if (res && res.interleaved_queue.length > 0) {
          setSmartTrackKeys(new Set(res.injected_track_keys));
          setSmartShuffle(true);
          await refresh();
        }
      } catch (e) {
        showToast(String(e), true);
      }
    }
  }, [state, smartShuffle, smartTrackKeys, lang, refresh, showToast, setSmartShuffle]);

  const cycleShuffleMode = useCallback(async () => {
    if (!state) return;
    const isStandardShuffle = !!state.player.shuffle && !smartShuffle;
    const isSmartShuffle = smartShuffle;

    if (!isStandardShuffle && !isSmartShuffle) {
      // 1. Off -> Standard Shuffle
      setSmartShuffle(false);
      try {
        await api.setShuffle(true);
        await refresh();
        showToast(lang === "ru" ? "Случайный порядок" : "Shuffle on");
      } catch (e) {
        showToast(String(e), true);
      }
    } else if (isStandardShuffle) {
      // 2. Standard Shuffle -> Smart Shuffle (очередь остаётся перемешанной + добавляются рекомендации)
      try {
        if (!state.player.shuffle) {
          await api.setShuffle(true);
        }
        const fresh = await api.getState().catch(() => state);
        const currentQueue = fresh?.queue ?? state.queue ?? [];
        const currentIndex = fresh?.queue_index ?? state.queue_index ?? 0;
        if (currentQueue.length === 0) {
          showToast(lang === "ru" ? "Очередь пуста" : "Queue is empty");
          return;
        }
        showToast(lang === "ru" ? "Умное перемешивание…" : "Applying Smart Shuffle…", false, 1500);
        const rawProviders = await api.getRecommendationProviders().catch(() => "all");
        const res = await api.applySmartShuffle(currentQueue, currentIndex, rawProviders);
        if (res && res.interleaved_queue.length > 0) {
          setSmartTrackKeys(new Set(res.injected_track_keys));
          setSmartShuffle(true);
          await refresh();
        }
      } catch (e) {
        showToast(String(e), true);
      }
    } else {
      // 3. Smart Shuffle -> Off
      setSmartShuffle(false);
      try {
        await api.setShuffle(false);
        const fresh = await api.getState().catch(() => state);
        if (fresh && fresh.queue_index !== null) {
          const curIdx = fresh.queue_index;
          const played = fresh.queue.slice(0, curIdx + 1);
          const unplayedClean = fresh.queue.slice(curIdx + 1).filter(
            (t) => t.origin !== "smart_shuffle" && !smartTrackKeys.has(trackKey(t))
          );
          const newQueue = [...played, ...unplayedClean];
          if (newQueue.length !== fresh.queue.length) {
            await api.reorderQueue(newQueue);
          }
        }
        setSmartTrackKeys(new Set());
        await refresh();
        showToast(lang === "ru" ? "Случайный порядок выключен" : "Shuffle off");
      } catch (e) {
        showToast(String(e), true);
      }
    }
  }, [state, smartShuffle, smartTrackKeys, lang, refresh, showToast, setSmartShuffle]);

  const playTracks = useCallback(
    async (tracks: TrackRef[], start = 0, forceNewQueue = false) => {
      setHasEverPlayed(true);

      const targetTrack = tracks[start];

      // If the clicked track is already present in the active queue and matches current playlist context,
      // smoothly jump directly to that index without re-shuffling or re-generating recommendations!
      if (!forceNewQueue && targetTrack && state?.queue && state.queue.length > 0) {
        const existingIdx = state.queue.findIndex((t) => trackKey(t) === trackKey(targetTrack));
        const isCurrentQueueFromList = state.queue.some((t) =>
          tracks.some((orig) => trackKey(orig) === trackKey(t))
        );
        if (existingIdx >= 0 && isCurrentQueueFromList) {
          try {
            await api.playQueueIndex(existingIdx);
            await refresh();
            return;
          } catch (e) {
            console.warn("playQueueIndex error, falling back to full playTracks:", e);
          }
        }
      }

      if (smartShuffle) {
        // Умное перемешивание остаётся включённым!
        try {
          // 1. Формируем перемешанный базовый плейлист с выбранным стартовым треком на первой позиции
          const pool = [...tracks];
          const selected = pool.splice(start, 1)[0] || tracks[0];
          // Честный Fisher-Yates shuffle для оставшихся треков
          for (let i = pool.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [pool[i], pool[j]] = [pool[j], pool[i]];
          }
          const baseShuffledQueue = [selected, ...pool];

          // 2. ДО старта воспроизведения запрашиваем рекомендации и интерливим очередь
          const rawProviders = await api.getRecommendationProviders().catch(() => "all");
          const res = await api.applySmartShuffle(baseShuffledQueue, 0, rawProviders).catch(() => null);

          const finalQueue = res && res.interleaved_queue && res.interleaved_queue.length > 0
            ? res.interleaved_queue
            : baseShuffledQueue;

          if (res && res.injected_track_keys) {
            setSmartTrackKeys(new Set(res.injected_track_keys));
          }

          // 3. Запускаем уже готовую собранную очередь сразу с рекомендациями
          if (state?.player?.shuffle) {
            await api.setShuffle(false);
          }
          await api.playTracks(finalQueue, 0);
          await refresh();
          return;
        } catch (error) {
          console.warn("Smart shuffle playTracks error:", error);
        }
      }

      // Обычный запуск (без Smart Shuffle)
      try {
        await api.playTracks(tracks, start);
        await refresh();
      } catch (error) {
        showToast(String(error), true);
      }
    },
    [refresh, showToast, smartShuffle, state?.player?.shuffle, state?.queue, setHasEverPlayed],
  );

  return {
    waveTracks,
    setWaveTracks,
    isWaveActive,
    setIsWaveActive,
    activeMixContext,
    setActiveMixContext,
    externalPlaylist,
    setExternalPlaylist,
    smartTrackKeys,
    smartShuffle,
    setSmartShuffle,
    expandQueueTracks,
    playNextTrack,
    toggleShuffle,
    toggleSmartShuffle,
    cycleShuffleMode,
    playTracks,
  };
}
