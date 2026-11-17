import { useEffect, useRef, useState, useCallback, useMemo } from "react";
import { useApp } from "../store";
import { artistLabel, resolveArtworkUrl, trackKey } from "../lib/utils";
import type { TrackRef } from "../api/types";
import * as api from "../api/commands";

type RGB = [number, number, number];
type Palette = [RGB, RGB];

// Зафиксированный режим «Спокойная» из референса (waveEnergy = 0.6)
const WAVE_ENERGY = 0.6;

// Запасные палитры (из референса) на случай, если у трека нет обложки
const FALLBACK_PALETTES: Palette[] = [
  [
    [225, 140, 65],
    [140, 70, 20],
  ],
  [
    [190, 205, 225],
    [95, 110, 135],
  ],
  [
    [45, 200, 150],
    [20, 90, 110],
  ],
  [
    [220, 55, 120],
    [90, 30, 180],
  ],
  [
    [65, 140, 255],
    [150, 50, 235],
  ],
  [
    [245, 85, 50],
    [150, 25, 20],
  ],
  [
    [250, 180, 40],
    [200, 50, 90],
  ],
];

const RIBBONS = [
  { freq1: 3.5, freq2: 2.0, speed1: 1.0, speed2: -0.7, amp: 52, thick: 48, primary: true, alpha: 0.75 },
  { freq1: 2.8, freq2: 4.2, speed1: -0.8, speed2: 1.1, amp: 64, thick: 55, primary: false, alpha: 0.65 },
  { freq1: 4.5, freq2: 1.5, speed1: 1.3, speed2: 0.5, amp: 40, thick: 36, primary: true, alpha: 0.5 },
  { freq1: 2.2, freq2: 3.1, speed1: -1.1, speed2: -0.9, amp: 70, thick: 42, primary: false, alpha: 0.45 },
];

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hashString(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = (hash * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function fallbackPaletteForKey(key: string): Palette {
  const idx = hashString(key) % FALLBACK_PALETTES.length;
  return FALLBACK_PALETTES[idx];
}

/**
 * Для чтения пикселей на скрытом canvas прогоняем любые внешние http(s) URL
 * (включая avatars.yandex.net) через локальный прокси vessel-img.localhost,
 * у которого гарантированно выставлен Access-Control-Allow-Origin: *.
 */
function corsSafeArtworkUrl(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  if (!trimmed) return null;
  if (
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("http://vessel-img.localhost") ||
    trimmed.startsWith("http://localhost") ||
    trimmed.startsWith("http://127.0.0.1")
  ) {
    return trimmed;
  }
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return `http://vessel-img.localhost/?url=${encodeURIComponent(trimmed)}`;
  }
  return resolveArtworkUrl(trimmed) ?? null;
}

function extractPaletteFromImage(
  img: HTMLImageElement,
  colorCtx: CanvasRenderingContext2D,
): Palette | null {
  try {
    colorCtx.clearRect(0, 0, 16, 16);
    colorCtx.drawImage(img, 0, 0, 16, 16);
    const data = colorCtx.getImageData(0, 0, 16, 16).data;
    let r1 = 0,
      g1 = 0,
      b1 = 0,
      count1 = 0;
    let r2 = 0,
      g2 = 0,
      b2 = 0,
      count2 = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const brightness = (r + g + b) / 3;
      if (brightness > 30 && brightness < 235) {
        if (i < data.length / 2) {
          r1 += r;
          g1 += g;
          b1 += b;
          count1++;
        } else {
          r2 += r;
          g2 += g;
          b2 += b;
          count2++;
        }
      }
    }

    if (count1 > 5 && count2 > 5) {
      return [
        [
          Math.min(255, (r1 / count1) * 1.25),
          Math.min(255, (g1 / count1) * 1.25),
          Math.min(255, (b1 / count1) * 1.25),
        ],
        [
          Math.min(255, (r2 / count2) * 1.25),
          Math.min(255, (g2 / count2) * 1.25),
          Math.min(255, (b2 / count2) * 1.25),
        ],
      ];
    }
  } catch {
    // CORS или декодирование — используем запасную палитру
  }
  return null;
}

export function WaveSection() {
  const {
    state,
    lang,
    playTracks,
    waveTracks,
    isWaveActive,
    setIsWaveActive,
    waveLoading,
    regenerateWave,
  } = useApp();

  const [currentIndex, setCurrentIndex] = useState(0);
  const [switchingKey, setSwitchingKey] = useState<string | null>(null);

  const widgetRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const paletteCacheRef = useRef<Map<string, Palette>>(new Map());
  const colorCanvasRef = useRef<CanvasRenderingContext2D | null>(null);
  const switchTimerRef = useRef<number | null>(null);
  const wheelLockRef = useRef<boolean>(false);

  // Рефы состояния для 60fps цикла шёлковой волны без перезапуска useEffect
  const isPlayingRef = useRef<boolean>(false);
  const targetColor1Ref = useRef<RGB>([...FALLBACK_PALETTES[0][0]]);
  const targetColor2Ref = useRef<RGB>([...FALLBACK_PALETTES[0][1]]);

  const nowKey = state?.now_playing ? trackKey(state.now_playing) : null;
  const nowIndexInWave = useMemo(() => {
    if (!nowKey || waveTracks.length === 0) return -1;
    return waveTracks.findIndex((t) => trackKey(t) === nowKey);
  }, [nowKey, waveTracks]);

  const isWaveTrackCurrent = isWaveActive && nowIndexInWave >= 0;
  const isPlayerPlaying = state?.player?.status === "playing";
  const isPlayerBuffering = state?.player?.status === "buffering";
  const isWavePlaying = isWaveTrackCurrent && (isPlayerPlaying || isPlayerBuffering);

  useEffect(() => {
    isPlayingRef.current = isWavePlaying;
  }, [isWavePlaying]);

  // Синхронизируем индекс дуги, если трек переключили в Очереди / мини-плеере / автопереходом
  useEffect(() => {
    if (isWaveActive && nowIndexInWave >= 0) {
      setCurrentIndex(nowIndexInWave);
    }
  }, [isWaveActive, nowIndexInWave]);

  // Защита индекса при перегенерации списка треков
  useEffect(() => {
    if (waveTracks.length === 0) {
      setCurrentIndex(0);
    } else if (currentIndex >= waveTracks.length) {
      setCurrentIndex(0);
    }
  }, [waveTracks.length, currentIndex]);

  const safeIndex = waveTracks.length > 0 ? Math.min(currentIndex, waveTracks.length - 1) : 0;
  const activeTrack: TrackRef | null = waveTracks[safeIndex] ?? null;
  const activeTrackKey = activeTrack ? trackKey(activeTrack) : null;

  // Применяем палитру активного трека и извлекаем цвета из его обложки
  useEffect(() => {
    if (!activeTrack || !activeTrackKey) {
      targetColor1Ref.current = [...FALLBACK_PALETTES[0][0]];
      targetColor2Ref.current = [...FALLBACK_PALETTES[0][1]];
      return;
    }

    const cached = paletteCacheRef.current.get(activeTrackKey);
    if (cached) {
      targetColor1Ref.current = [...cached[0]];
      targetColor2Ref.current = [...cached[1]];
      return;
    }

    const fallback = fallbackPaletteForKey(activeTrackKey);
    targetColor1Ref.current = [...fallback[0]];
    targetColor2Ref.current = [...fallback[1]];

    const corsUrl = corsSafeArtworkUrl(activeTrack.artwork_url);
    if (!corsUrl) return;

    if (!colorCanvasRef.current) {
      const c = document.createElement("canvas");
      c.width = 16;
      c.height = 16;
      colorCanvasRef.current = c.getContext("2d", { willReadFrequently: true });
    }
    const colorCtx = colorCanvasRef.current;
    if (!colorCtx) return;

    let cancelled = false;
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      if (cancelled) return;
      const extracted = extractPaletteFromImage(img, colorCtx);
      if (extracted) {
        paletteCacheRef.current.set(activeTrackKey, extracted);
        targetColor1Ref.current = [...extracted[0]];
        targetColor2Ref.current = [...extracted[1]];
      }
    };
    img.src = corsUrl;

    return () => {
      cancelled = true;
    };
  }, [activeTrack, activeTrackKey]);

  // Заранее извлекаем цвета соседних обложек в дуге, чтобы при переключении фон реагировал мгновенно
  useEffect(() => {
    if (waveTracks.length === 0) return;
    if (!colorCanvasRef.current) {
      const c = document.createElement("canvas");
      c.width = 16;
      c.height = 16;
      colorCanvasRef.current = c.getContext("2d", { willReadFrequently: true });
    }
    const colorCtx = colorCanvasRef.current;
    if (!colorCtx) return;

    const total = waveTracks.length;
    const offsets = [-2, -1, 1, 2];
    let cancelled = false;

    for (const off of offsets) {
      const idx = ((safeIndex + off) % total + total) % total;
      const tr = waveTracks[idx];
      if (!tr) continue;
      const key = trackKey(tr);
      if (paletteCacheRef.current.has(key)) continue;
      const corsUrl = corsSafeArtworkUrl(tr.artwork_url);
      if (!corsUrl) continue;

      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        if (cancelled) return;
        const extracted = extractPaletteFromImage(img, colorCtx);
        if (extracted) {
          paletteCacheRef.current.set(key, extracted);
        }
      };
      img.src = corsUrl;
    }

    return () => {
      cancelled = true;
    };
  }, [waveTracks, safeIndex]);

  // Движок многослойной шёлковой волны (Canvas Silk Ribbons, 1-в-1 с референсом, энергия «Спокойная» 0.6)
  useEffect(() => {
    const canvas = canvasRef.current;
    const widget = widgetRef.current;
    if (!canvas || !widget) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const resizeCanvas = () => {
      canvas.width = Math.max(1, Math.floor(canvas.offsetWidth / 2));
      canvas.height = Math.max(1, Math.floor(canvas.offsetHeight / 2));
    };
    resizeCanvas();

    const resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(widget);

    let inView = true;
    const intersectionObserver = new IntersectionObserver(
      (entries) => {
        inView = entries[0]?.isIntersecting ?? true;
      },
      { threshold: 0.02 },
    );
    intersectionObserver.observe(widget);

    const currentColor1: RGB = [...targetColor1Ref.current];
    const currentColor2: RGB = [...targetColor2Ref.current];
    let time = 0;
    let currentAmp = 0.65 * WAVE_ENERGY;
    let animId = 0;

    const renderWaves = () => {
      animId = requestAnimationFrame(renderWaves);
      if (document.hidden || !inView) return;

      const target1 = targetColor1Ref.current;
      const target2 = targetColor2Ref.current;
      for (let i = 0; i < 3; i++) {
        currentColor1[i] = lerp(currentColor1[i], target1[i], 0.035);
        currentColor2[i] = lerp(currentColor2[i], target2[i], 0.035);
      }

      const playing = isPlayingRef.current;
      const targetAmp = (playing ? 1.0 : 0.45) * WAVE_ENERGY;
      currentAmp = lerp(currentAmp, targetAmp, 0.04);

      const speed = (playing ? 0.028 : 0.009) * WAVE_ENERGY;
      time += speed;

      const w = canvas.width;
      const h = canvas.height;
      ctx.clearRect(0, 0, w, h);

      ctx.globalCompositeOperation = "screen";

      const rgb1 = currentColor1.map(Math.round).join(",");
      const rgb2 = currentColor2.map(Math.round).join(",");

      // 1. Центральное мягкое свечение позади главной обложки
      const centerGlow = ctx.createRadialGradient(
        w * 0.5,
        h * 0.55,
        5,
        w * 0.5,
        h * 0.55,
        w * 0.35,
      );
      centerGlow.addColorStop(0, `rgba(${rgb1}, 0.55)`);
      centerGlow.addColorStop(0.5, `rgba(${rgb2}, 0.25)`);
      centerGlow.addColorStop(1, "transparent");
      ctx.fillStyle = centerGlow;
      ctx.fillRect(0, 0, w, h);

      // 2. 4 переплетающиеся энергетические ленты (волны)
      for (let idx = 0; idx < RIBBONS.length; idx++) {
        const r = RIBBONS[idx];
        const color = r.primary ? rgb1 : rgb2;
        ctx.beginPath();

        const step = 10;
        const topPoints: { x: number; y: number }[] = [];
        const bottomPoints: { x: number; y: number }[] = [];

        for (let x = 0; x <= w; x += step) {
          const nx = x / w;
          const envelope = Math.pow(Math.sin(nx * Math.PI), 1.6);
          const diagonalTilt = (0.5 - nx) * 35;
          const waveY =
            Math.sin(nx * r.freq1 + time * r.speed1 + idx) * r.amp * currentAmp +
            Math.cos(nx * r.freq2 + time * r.speed2) * (r.amp * 0.6) * currentAmp;

          const centerY = h * 0.52 + diagonalTilt * envelope + waveY * envelope;
          const halfThickness =
            r.thick * currentAmp * envelope * (0.7 + 0.3 * Math.sin(time * 2 + nx * 6));

          topPoints.push({ x, y: centerY - halfThickness });
          bottomPoints.push({ x, y: centerY + halfThickness });
        }

        if (topPoints.length === 0) continue;
        ctx.moveTo(topPoints[0].x, topPoints[0].y);
        for (let i = 1; i < topPoints.length; i++) {
          ctx.lineTo(topPoints[i].x, topPoints[i].y);
        }
        for (let i = bottomPoints.length - 1; i >= 0; i--) {
          ctx.lineTo(bottomPoints[i].x, bottomPoints[i].y);
        }
        ctx.closePath();

        const grad = ctx.createLinearGradient(w * 0.1, 0, w * 0.9, 0);
        grad.addColorStop(0, "transparent");
        grad.addColorStop(0.25, `rgba(${color}, ${r.alpha * 0.6})`);
        grad.addColorStop(0.5, `rgba(${color}, ${r.alpha})`);
        grad.addColorStop(0.75, `rgba(${color}, ${r.alpha * 0.6})`);
        grad.addColorStop(1, "transparent");

        ctx.fillStyle = grad;
        ctx.fill();
      }
    };

    animId = requestAnimationFrame(renderWaves);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
      intersectionObserver.disconnect();
    };
  }, []);

  // Очистка таймера спиннера переключения
  useEffect(() => {
    return () => {
      if (switchTimerRef.current) window.clearTimeout(switchTimerRef.current);
    };
  }, []);

  const triggerSwitchSpinner = useCallback((key: string) => {
    setSwitchingKey(key);
    if (switchTimerRef.current) window.clearTimeout(switchTimerRef.current);
    switchTimerRef.current = window.setTimeout(() => {
      setSwitchingKey(null);
    }, 480);
  }, []);

  // Выбор и запуск трека из дуги
  const selectTrack = useCallback(
    (index: number) => {
      if (waveTracks.length === 0) return;
      const normalized = ((index % waveTracks.length) + waveTracks.length) % waveTracks.length;
      const chosen = waveTracks[normalized];
      if (!chosen) return;
      const chosenKey = trackKey(chosen);

      // Повторный клик по уже играющей центральной обложке — пауза / продолжить
      if (normalized === safeIndex && isWaveTrackCurrent) {
        void api.togglePlayback();
        return;
      }

      setCurrentIndex(normalized);
      triggerSwitchSpinner(chosenKey);
      setIsWaveActive(true);
      void playTracks(waveTracks, normalized);
    },
    [waveTracks, safeIndex, isWaveTrackCurrent, triggerSwitchSpinner, setIsWaveActive, playTracks],
  );

  // Центральная кнопка Play / Pause
  const handlePlayButtonClick = useCallback(() => {
    if (waveTracks.length === 0) {
      void regenerateWave({ force: true, autoplay: true });
      return;
    }
    if (isWaveTrackCurrent) {
      void api.togglePlayback();
      return;
    }
    const chosen = waveTracks[safeIndex];
    if (chosen) {
      triggerSwitchSpinner(trackKey(chosen));
    }
    setIsWaveActive(true);
    void playTracks(waveTracks, safeIndex);
  }, [
    waveTracks,
    safeIndex,
    isWaveTrackCurrent,
    regenerateWave,
    triggerSwitchSpinner,
    setIsWaveActive,
    playTracks,
  ]);

  // Горизонтальное пролистывание дуги (Shift+wheel или горизонтальный трекпад/колесо),
  // не перехватывая вертикальный скролл Главной страницы
  const handleWheel = useCallback(
    (e: React.WheelEvent<HTMLDivElement>) => {
      if (waveTracks.length < 2) return;
      const isHorizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY) || e.shiftKey;
      if (!isHorizontal) return;
      e.preventDefault();
      if (wheelLockRef.current) return;
      wheelLockRef.current = true;
      const delta = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
      if (delta > 0) selectTrack(safeIndex + 1);
      else selectTrack(safeIndex - 1);
      window.setTimeout(() => {
        wheelLockRef.current = false;
      }, 280);
    },
    [waveTracks.length, safeIndex, selectTrack],
  );

  // Видимое окно обложек вокруг активного индекса (-4..+4), чтобы не рендерить все 50 сразу
  const visibleCovers = useMemo(() => {
    const total = waveTracks.length;
    if (total === 0) return [];
    const half = Math.floor(total / 2);
    const items: { track: TrackRef; index: number; offset: number; key: string }[] = [];

    for (let i = 0; i < total; i++) {
      let offset = i - safeIndex;
      if (offset > half) offset -= total;
      if (offset < -half) offset += total;
      if (Math.abs(offset) <= 4) {
        items.push({
          track: waveTracks[i],
          index: i,
          offset,
          key: trackKey(waveTracks[i]),
        });
      }
    }
    return items;
  }, [waveTracks, safeIndex]);

  const isActiveBuffering =
    (waveLoading && waveTracks.length === 0) ||
    (activeTrackKey !== null && switchingKey === activeTrackKey) ||
    (isWaveTrackCurrent && isPlayerBuffering);

  const subtitleText = useMemo(() => {
    if (waveLoading && waveTracks.length === 0) {
      return lang === "ru" ? "Настраиваем под вас…" : "Tuning for you…";
    }
    if (isWavePlaying && activeTrack) {
      const artists = artistLabel(activeTrack.artists);
      return artists ? `${artists} — ${activeTrack.title}` : activeTrack.title;
    }
    return lang === "ru" ? "Настроена под вас" : "Tuned for you";
  }, [waveLoading, waveTracks.length, isWavePlaying, activeTrack, lang]);

  return (
    <div
      className="wave-stream-widget"
      ref={widgetRef}
      onWheel={handleWheel}
    >
      <canvas ref={canvasRef} className="wave-stream-canvas" />
      <div className="wave-stream-vignette" />

      <div className="wave-stream-header">
        <h1>{lang === "ru" ? "Моя волна" : "My Wave"}</h1>
        <p className="wave-stream-subtitle" title={subtitleText}>
          {subtitleText}
        </p>
      </div>

      {/* Параболическая дуга обложек */}
      <div className="wave-covers-track">
        {visibleCovers.length > 0
          ? visibleCovers.map(({ track, index, offset, key }) => {
              const absOff = Math.abs(offset);
              const isCenter = offset === 0;
              const x = offset * 128;
              const y = -Math.pow(absOff, 1.42) * 29 + (isCenter ? 24 : 0);
              const scale = isCenter ? 1.18 : Math.max(0.5, 0.86 - absOff * 0.12);
              const opacity = absOff > 3 ? 0 : Math.max(0.18, 1 - absOff * 0.22);
              const zIndex = 20 - absOff;
              const filter = isCenter ? "brightness(1.03)" : "brightness(0.6)";
              const coverSrc = resolveArtworkUrl(track.artwork_url);
              const itemLoading = isCenter && isActiveBuffering;

              return (
                <div
                  key={key}
                  className={`wave-cover-item${isCenter ? " active" : ""}${itemLoading ? " loading" : ""}`}
                  style={{
                    transform: `translate3d(${x}px, ${y}px, 0) scale(${scale})`,
                    zIndex,
                    opacity,
                    pointerEvents: absOff > 3 ? "none" : "auto",
                    filter,
                  }}
                  onClick={() => selectTrack(index)}
                  title={`${artistLabel(track.artists)} — ${track.title}`}
                >
                  {coverSrc ? (
                    <img src={coverSrc} alt={track.title} decoding="async" draggable={false} />
                  ) : (
                    <div className="wave-cover-fallback">
                      {track.title.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="wave-cover-loader">
                    <div className="wave-cover-spinner" />
                  </div>
                </div>
              );
            })
          : // Плейсхолдер-дуга на время первичной фоновой генерации при запуске
            [-3, -2, -1, 0, 1, 2, 3].map((offset) => {
              const absOff = Math.abs(offset);
              const isCenter = offset === 0;
              const x = offset * 128;
              const y = -Math.pow(absOff, 1.42) * 29 + (isCenter ? 24 : 0);
              const scale = isCenter ? 1.18 : Math.max(0.5, 0.86 - absOff * 0.12);
              const opacity = Math.max(0.14, 0.55 - absOff * 0.13);
              const zIndex = 20 - absOff;
              return (
                <div
                  key={offset}
                  className={`wave-cover-item wave-cover-placeholder${isCenter ? " active" : ""}${isCenter && waveLoading ? " loading" : ""}`}
                  style={{
                    transform: `translate3d(${x}px, ${y}px, 0) scale(${scale})`,
                    zIndex,
                    opacity,
                    pointerEvents: "none",
                  }}
                >
                  <div className="wave-cover-loader">
                    <div className="wave-cover-spinner" />
                  </div>
                </div>
              );
            })}
      </div>

      {/* Центральная кнопка Play / Pause */}
      <div className="wave-stream-controls">
        <button
          type="button"
          className={`wave-stream-play-btn${isActiveBuffering ? " loading" : ""}`}
          onClick={handlePlayButtonClick}
          title={
            isWavePlaying
              ? lang === "ru"
                ? "Пауза"
                : "Pause"
              : lang === "ru"
                ? "Запустить Мою волну"
                : "Launch My Wave"
          }
        >
          <div className="wave-btn-spinner" />
          <svg viewBox="0 0 24 24">
            {isWavePlaying ? (
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            ) : (
              <path d="M8 5v14l11-7z" />
            )}
          </svg>
        </button>
      </div>
    </div>
  );
}
