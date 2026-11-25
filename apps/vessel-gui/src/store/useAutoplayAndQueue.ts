import { useCallback, useEffect, useRef, useState } from "react";
import type { FullState, Playlist, QueueContext, TrackRef } from "../api/types";
import type { Lang } from "../i18n";
import { trackKey, dedupe } from "../lib/utils";
import * as api from "../api/commands";
import type { MixContext, PlayTracksOptions } from "./storeTypes";
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
  const [isWaveActive, setIsWaveActiveState] = useState<boolean>(false);
  const [waveLoading, setWaveLoading] = useState<boolean>(false);
  const waveActivatedAtRef = useRef<number>(0);
  const waveInitializedRef = useRef<boolean>(false);
  const waveBuildingRef = useRef<boolean>(false);
  const waveDirtyRef = useRef<boolean>(false);
  const lastLibrarySigRef = useRef<string | null>(null);
  const waveRegenTimerRef = useRef<number | null>(null);
  const waveRequestIdRef = useRef<number>(0);

  const setIsWaveActive = useCallback((active: boolean) => {
    if (active) {
      waveActivatedAtRef.current = Date.now();
    }
    setIsWaveActiveState(active);
  }, []);
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
  const queueGenerationRef = useRef<number>(0);
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
      const startGeneration = queueGenerationRef.current;
      expandingQueueRef.current = true;
      lastExpandedTimeRef.current = Date.now();
      try {
        const rawProviders = await api
          .getRecommendationProviders()
          .catch(() => api.getWaveProviders().catch(() => "all"));
        if (queueGenerationRef.current !== startGeneration) return [];

        const fresh = await api.getState().catch(() => state);
        if (queueGenerationRef.current !== startGeneration) return [];

        const currentQueue = fresh?.queue ?? state?.queue ?? [];
        const currentIndex = fresh?.queue_index ?? state?.queue_index ?? 0;

        if (isWaveActive) {
          // Волна (My Wave): непрерывный поток
          const waveSource = (await api.getWaveSource().catch(() => "favorites")) as "favorites" | "playlists";
          const more = await api.getWaveRecommendations(waveSource, count * 2, null, rawProviders).catch(() => []);
          if (queueGenerationRef.current !== startGeneration) return [];

          const existingKeys = new Set(currentQueue.map(trackKey));
          const existingSemantics = new Set(currentQueue.map(semanticTrackKey));
          const chunk = more
            .filter((t) => !existingKeys.has(trackKey(t)) && !existingSemantics.has(semanticTrackKey(t)))
            .slice(0, count);
          if (chunk.length > 0) {
            setWaveTracks((prev) => dedupe([...prev, ...chunk]));
            for (const t of chunk) {
              if (queueGenerationRef.current !== startGeneration) return [];
              await api.addToQueue(t);
            }
            if (queueGenerationRef.current !== startGeneration) return [];
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
        if (queueGenerationRef.current !== startGeneration) return [];

        if (chunk.length > 0) {
          for (const track of chunk) {
            if (queueGenerationRef.current !== startGeneration) return [];
            await api.addToQueue(track);
          }
          if (queueGenerationRef.current !== startGeneration) return [];
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
    const isInfiniteStream = isWaveActive || !!activeMixContext;
    // Для Волны и миксов держим буфер на 2 трека вперёд;
    // для обычных альбомов/плейлистов (включая короткие EP/синглы) подбираем похожие только на последнем треке (при длине > 1)
    const isNearEnd = isInfiniteStream
      ? remaining <= 2
      : remaining === 0 && state.queue.length > 1;
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
    async (
      tracks: TrackRef[],
      start = 0,
      forceNewQueue = false,
      opts?: PlayTracksOptions,
    ) => {
      setHasEverPlayed(true);

      const targetTrack = tracks[start];

      // Если кликнутый трек уже в текущей очереди того же контекста (не Волны/микса, если не запрошено явно),
      // плавно переключаемся без пересоздания очереди.
      if (
        !forceNewQueue &&
        targetTrack &&
        state?.queue &&
        state.queue.length > 0 &&
        (opts?.preserveWave || !isWaveActive) &&
        (opts?.preserveMix || !activeMixContext) &&
        (tracks.length > 1 || state.queue.length === 1) &&
        tracks.every((orig) => state.queue.some((q) => trackKey(q) === trackKey(orig)))
      ) {
        const existingIdx = state.queue.findIndex((t) => trackKey(t) === trackKey(targetTrack));
        if (existingIdx >= 0) {
          try {
            await api.playQueueIndex(existingIdx);
            await refresh();
            return;
          } catch (e) {
            console.warn("playQueueIndex error, falling back to full playTracks:", e);
          }
        }
      }

      const gen = ++queueGenerationRef.current;
      lastExpandedIndexRef.current = null;
      lastEndedHandledKeyRef.current = null;
      if (!opts?.preserveWave) {
        setIsWaveActiveState(false);
      }
      if (!opts?.preserveMix) {
        setActiveMixContext(null);
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
          if (queueGenerationRef.current !== gen) return;

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
          if (queueGenerationRef.current !== gen) return;
          await api.playTracks(finalQueue, 0);
          await refresh();
          return;
        } catch (error) {
          console.warn("Smart shuffle playTracks error:", error);
        }
      }

      // Обычный запуск (без Smart Shuffle)
      try {
        if (!opts?.preserveShuffle) {
          await api.setShuffle(false).catch(() => {});
        }
        if (queueGenerationRef.current !== gen) return;
        await api.playTracks(tracks, start);
        await refresh();
      } catch (error) {
        showToast(String(error), true);
      }
    },
    [
      activeMixContext,
      isWaveActive,
      refresh,
      showToast,
      smartShuffle,
      state?.player?.shuffle,
      state?.queue,
      setHasEverPlayed,
    ],
  );

  const regenerateWave = useCallback(
    async (opts?: { force?: boolean; autoplay?: boolean }): Promise<TrackRef[]> => {
      const force = opts?.force ?? false;
      const autoplay = opts?.autoplay ?? false;
      if (waveBuildingRef.current && !force) return [];

      const reqId = ++waveRequestIdRef.current;
      waveBuildingRef.current = true;
      setWaveLoading(true);
      try {
        const rawProviders = await api
          .getRecommendationProviders()
          .catch(() => api.getWaveProviders().catch(() => "all"));
        const filter = rawProviders && rawProviders.trim().length > 0 ? rawProviders : "all";
        const tracks = await api
          .getWaveRecommendations("favorites", 50, null, filter)
          .catch(() => [] as TrackRef[]);

        // Игнорируем устаревший ответ, если за это время стартовала более новая генерация
        if (reqId !== waveRequestIdRef.current) {
          return tracks;
        }

        const unique = dedupe(tracks);
        setWaveTracks(unique);
        waveInitializedRef.current = true;
        waveDirtyRef.current = false;

        if (autoplay) {
          if (unique.length > 0) {
            setIsWaveActive(true);
            await playTracks(unique, 0, true, { preserveWave: true });
          } else {
            showToast(
              lang === "ru"
                ? "В выбранных сервисах нет треков для Моей волны"
                : "No tracks found for My Wave in selected services",
              true,
            );
          }
        }
        return unique;
      } catch (err) {
        if (autoplay) {
          showToast(String(err), true);
        }
        return [];
      } finally {
        if (reqId === waveRequestIdRef.current) {
          waveBuildingRef.current = false;
          setWaveLoading(false);
        }
      }
    },
    [lang, playTracks, setIsWaveActive, showToast],
  );

  // Сигнатура подключённых провайдеров (чтобы дождаться авторизации / гостевого доступа при старте)
  const connectedProvidersSig = state?.providers
    ? state.providers
        .filter((p) => p.connected)
        .map((p) => p.kind)
        .sort()
        .join(",")
    : "";
  const lastConnectedSigRef = useRef<string>("");

  // 1. Автоматическая предгенерация Моей волны при запуске приложения (без автозапуска воспроизведения)
  useEffect(() => {
    if (!state || !connectedProvidersSig) return;
    if (!waveInitializedRef.current && !waveBuildingRef.current) {
      lastConnectedSigRef.current = connectedProvidersSig;
      void regenerateWave({ force: false, autoplay: false });
      return;
    }
    // Если после старта подтянулись новые провайдеры (например, гостевой доступ или вход в аккаунт)
    // и волна ещё не играет — мягко перегенерируем её с учётом всех доступных сервисов
    if (
      lastConnectedSigRef.current &&
      lastConnectedSigRef.current !== connectedProvidersSig &&
      !isWaveActive
    ) {
      lastConnectedSigRef.current = connectedProvidersSig;
      if (waveRegenTimerRef.current) window.clearTimeout(waveRegenTimerRef.current);
      waveRegenTimerRef.current = window.setTimeout(() => {
        void regenerateWave({ force: true, autoplay: false });
      }, 600);
    }
  }, [state, connectedProvidersSig, isWaveActive, regenerateWave]);

  // 2. Автоперегенерация при лайке / снятии лайка / изменении плейлистов
  const librarySig = state
    ? `${state.library.length}|${state.library
        .slice(0, 6)
        .map(trackKey)
        .join(",")}|${state.library
        .slice(-4)
        .map(trackKey)
        .join(",")}|${state.playlists.map((p) => `${p.id}:${p.tracks.length}`).join(",")}`
    : null;

  useEffect(() => {
    if (!librarySig) return;
    if (lastLibrarySigRef.current === null) {
      lastLibrarySigRef.current = librarySig;
      return;
    }
    if (lastLibrarySigRef.current === librarySig) return;
    lastLibrarySigRef.current = librarySig;

    const isWavePlayingNow =
      isWaveActive &&
      (state?.player?.status === "playing" || state?.player?.status === "buffering");

    if (isWavePlayingNow) {
      // Не обрываем текущий играющий трек волны — пересоберём, как только волна перестанет играть
      waveDirtyRef.current = true;
      return;
    }

    if (waveRegenTimerRef.current) window.clearTimeout(waveRegenTimerRef.current);
    waveRegenTimerRef.current = window.setTimeout(() => {
      void regenerateWave({ force: true, autoplay: false });
    }, 1500);
  }, [librarySig, isWaveActive, state?.player?.status, regenerateWave]);

  // 3. Отложенная перегенерация, если лайк был поставлен во время активного воспроизведения волны
  useEffect(() => {
    if (!waveDirtyRef.current) return;
    const isWavePlayingNow =
      isWaveActive &&
      (state?.player?.status === "playing" || state?.player?.status === "buffering");
    if (isWavePlayingNow) return;

    waveDirtyRef.current = false;
    if (waveRegenTimerRef.current) window.clearTimeout(waveRegenTimerRef.current);
    waveRegenTimerRef.current = window.setTimeout(() => {
      void regenerateWave({ force: true, autoplay: false });
    }, 800);
  }, [isWaveActive, state?.player?.status, regenerateWave]);

  // 4. Перегенерация при изменении платформ в Настройках → Общие → Платформа
  useEffect(() => {
    const onProvidersChanged = () => {
      if (waveRegenTimerRef.current) window.clearTimeout(waveRegenTimerRef.current);
      waveRegenTimerRef.current = window.setTimeout(() => {
        void regenerateWave({ force: true, autoplay: false });
      }, 450);
    };
    window.addEventListener("vessel:providers-changed", onProvidersChanged);
    window.addEventListener("vessel:wave-providers-changed", onProvidersChanged);
    return () => {
      window.removeEventListener("vessel:providers-changed", onProvidersChanged);
      window.removeEventListener("vessel:wave-providers-changed", onProvidersChanged);
    };
  }, [regenerateWave]);

  // 5. Автосброс флага isWaveActive, если пользователь переключился на трек вне Моей волны
  useEffect(() => {
    if (!isWaveActive || !state?.now_playing || waveTracks.length === 0) return;
    if (Date.now() - waveActivatedAtRef.current < 2500) return;
    const nowKey = trackKey(state.now_playing);
    const inWave = waveTracks.some((t) => trackKey(t) === nowKey);
    if (!inWave) {
      setIsWaveActiveState(false);
    }
  }, [isWaveActive, state?.now_playing, waveTracks]);

  // Очистка таймера при размонтировании
  useEffect(() => {
    return () => {
      if (waveRegenTimerRef.current) {
        window.clearTimeout(waveRegenTimerRef.current);
      }
    };
  }, []);

  return {
    waveTracks,
    setWaveTracks,
    isWaveActive,
    setIsWaveActive,
    waveLoading,
    regenerateWave,
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
