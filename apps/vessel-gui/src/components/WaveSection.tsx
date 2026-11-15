import { useEffect, useRef, useState, useCallback } from "react";
import { useApp } from "../store";
import { PlatformIcon } from "./PlatformIcon";
import * as api from "../api/commands";

interface ProviderOption {
  key: string;
  label: string;
  color: string;
}

const PROVIDER_OPTIONS: ProviderOption[] = [
  { key: "youtube_music", label: "YouTube Music", color: "#FF0000" },
  { key: "soundcloud", label: "SoundCloud", color: "#FF5500" },
  { key: "spotify", label: "Spotify", color: "#1DB954" },
  { key: "yandex", label: "Yandex Music", color: "#FFCC00" },
  { key: "deezer", label: "Deezer", color: "#A238FF" },
];

export function WaveSection() {
  const { lang, showToast, playTracks, setWaveTracks, setIsWaveActive } = useApp();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [selectedProviders, setSelectedProviders] = useState<string[] | null>(null);
  const [allProviders, setAllProviders] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const buildingRef = useRef(false);

  // 1. Загрузка сохранённых провайдеров волны
  useEffect(() => {
    let cancelled = false;
    const applyVal = (val: string) => {
      if (val === "all") {
        setAllProviders(true);
        setSelectedProviders(PROVIDER_OPTIONS.map((o) => o.key));
      } else if (!val) {
        setAllProviders(false);
        setSelectedProviders([]);
      } else {
        const list = val.split(",").filter((k) => PROVIDER_OPTIONS.some((o) => o.key === k));
        setAllProviders(list.length === PROVIDER_OPTIONS.length);
        setSelectedProviders(list);
      }
    };

    void (async () => {
      try {
        const val = await api.getWaveProviders();
        if (cancelled) return;
        applyVal(val);
      } catch {
        if (!cancelled) setAllProviders(true);
      }
    })();

    const onWaveChanged = (e: any) => {
      applyVal(e.detail || "all");
    };
    window.addEventListener("vessel:wave-providers-changed", onWaveChanged);
    return () => {
      cancelled = true;
      window.removeEventListener("vessel:wave-providers-changed", onWaveChanged);
    };
  }, []);

  // 2. Закрытие поповера настроек при клике снаружи или Escape
  useEffect(() => {
    if (!settingsOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setSettingsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSettingsOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [settingsOpen]);

  // 3. HTML5 Canvas: 3 плавные синусоидальные волны с наложением (opacity: 0.12, 0.22, 0.35)
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let step = 0;
    let width = 0;
    let height = 0;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    updateSize();

    const resizeObserver = new ResizeObserver(() => {
      updateSize();
    });
    resizeObserver.observe(container);

    const drawWave = (
      y0: number,
      amp: number,
      freq: number,
      phase: number,
      color: string
    ) => {
      ctx.beginPath();
      ctx.moveTo(0, height);
      for (let x = 0; x <= width; x += 4) {
        const y = y0 + amp * Math.sin(x * freq + phase);
        ctx.lineTo(x, y);
      }
      ctx.lineTo(width, height);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    };

    const render = () => {
      step += 0.005;
      ctx.clearRect(0, 0, width, height);

      // Слой 1: дальний (opacity: 0.12)
      drawWave(
        height * 0.55,
        28 + 7 * Math.sin(step * 0.28),
        0.0036,
        step * 0.4,
        "rgba(255, 255, 255, 0.12)"
      );

      // Слой 2: средний (opacity: 0.22)
      drawWave(
        height * 0.67,
        32 + 8 * Math.sin(step * 0.38 + 1.2),
        0.0048,
        step * 0.65 + 2.1,
        "rgba(255, 255, 255, 0.22)"
      );

      // Слой 3: передний (opacity: 0.35)
      drawWave(
        height * 0.79,
        26 + 6 * Math.sin(step * 0.32 + 2.8),
        0.0062,
        step * 0.9 + 4.3,
        "rgba(255, 255, 255, 0.35)"
      );

      animId = requestAnimationFrame(render);
    };

    animId = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(animId);
      resizeObserver.disconnect();
    };
  }, []);

  const providerFilter = useCallback(() => {
    if (allProviders) return "all";
    if (!selectedProviders || selectedProviders.length === 0) return "";
    return selectedProviders.join(",");
  }, [allProviders, selectedProviders]);

  const activeProviders = (allProviders || !selectedProviders)
    ? PROVIDER_OPTIONS.map((o) => o.key)
    : selectedProviders;

  // 4. Сборка волны (каждый клик собирает свежую очередь заново)
  const buildWave = async () => {
    if (buildingRef.current) return;
    buildingRef.current = true;
    try {
      const filter = providerFilter();
      const tracks = await api.getWaveRecommendations("favorites", 50, null, filter);
      setWaveTracks(tracks);
      if (tracks.length > 0) {
        setIsWaveActive(true);
        playTracks(tracks, 0);
      } else {
        showToast(
          lang === "ru" ? "В выбранных сервисах нет треков" : "No tracks found in selected services",
          true
        );
      }
    } catch (error) {
      showToast(String(error), true);
    } finally {
      buildingRef.current = false;
    }
  };

  const handlePlayWave = () => {
    if (activeProviders.length === 0) {
      showToast(
        lang === "ru" ? "Выберите хотя бы один сервис для Моей волны" : "Please select at least one service",
        true
      );
      return;
    }
    // Каждый клик (первый или повторный) собирает волну заново
    void buildWave();
  };

  // 5. Переключение платформы по круглой иконке
  const handleTogglePlatform = async (key: string) => {
    const allKeys = PROVIDER_OPTIONS.map((o) => o.key);
    const current = selectedProviders ?? (allProviders ? allKeys : []);
    let next: string[];

    if (current.includes(key)) {
      next = current.filter((k) => k !== key);
    } else {
      next = [...current, key];
    }

    const isAll = next.length === allKeys.length;
    setAllProviders(isAll);
    setSelectedProviders(next);

    const filter = isAll ? "all" : next.join(",");
    try {
      await api.setWaveProviders(filter);
    } catch {}

    window.dispatchEvent(new CustomEvent("vessel:wave-providers-changed", { detail: filter }));
  };

  return (
    <div className="amoled-wave-banner" ref={containerRef}>
      {/* 3 синусоидальные волны на Canvas */}
      <canvas ref={canvasRef} className="amoled-wave-canvas" />

      {/* Центральный блок: Заголовок "▷ Моя волна" + кнопка "Настроить" */}
      <div className="amoled-wave-center">
        <button
          type="button"
          className="amoled-wave-title-btn"
          onClick={handlePlayWave}
          title={lang === "ru" ? "Запустить Мою волну" : "Launch My Wave"}
        >
          <span className="amoled-wave-play-icon">
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polygon points="5 3 19 12 5 21 5 3" />
            </svg>
          </span>
          <span className="amoled-wave-title-text">{lang === "ru" ? "Моя волна" : "My Wave"}</span>
        </button>

        <div className="amoled-wave-tune-container" ref={popoverRef}>
          <button
            type="button"
            className={`amoled-wave-tune-btn ${settingsOpen ? "active" : ""}`}
            onClick={() => setSettingsOpen((prev) => !prev)}
            title={lang === "ru" ? "Настроить платформы" : "Configure platforms"}
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="4" y1="21" x2="4" y2="14" />
              <line x1="4" y1="10" x2="4" y2="3" />
              <line x1="12" y1="21" x2="12" y2="12" />
              <line x1="12" y1="8" x2="12" y2="3" />
              <line x1="20" y1="21" x2="20" y2="16" />
              <line x1="20" y1="12" x2="20" y2="3" />
              <line x1="1" y1="14" x2="7" y2="14" />
              <line x1="9" y1="8" x2="15" y2="8" />
              <line x1="17" y1="16" x2="23" y2="16" />
            </svg>
            <span>{lang === "ru" ? "Настроить" : "Tune"}</span>
          </button>

          {/* Всплывающий ряд круглых иконок платформ (в точности как на референсе) */}
          {settingsOpen && (
            <div className="amoled-wave-popover">
              {PROVIDER_OPTIONS.map((p) => {
                const isSelected = activeProviders.includes(p.key);
                return (
                  <button
                    key={p.key}
                    type="button"
                    className={`amoled-wave-platform-circle ${isSelected ? "active" : "inactive"}`}
                    onClick={() => void handleTogglePlatform(p.key)}
                    title={`${p.label} (${
                      isSelected
                        ? lang === "ru"
                          ? "Включено"
                          : "Enabled"
                        : lang === "ru"
                        ? "Выключено"
                        : "Disabled"
                    })`}
                    style={isSelected ? { boxShadow: `0 0 12px ${p.color}35` } : undefined}
                  >
                    <PlatformIcon
                      kind={p.key as any}
                      size={18}
                      color={isSelected ? p.color : "rgba(255, 255, 255, 0.3)"}
                      style={
                        p.key === "yandex"
                          ? {
                              filter: isSelected ? "none" : "grayscale(100%)",
                              opacity: isSelected ? 1 : 0.32,
                            }
                          : undefined
                      }
                    />
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
