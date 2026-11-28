import { useState, useRef, useEffect } from "react";
import {
  LYRICS_SETTINGS_EVENT,
  loadLyricsTypography,
  saveLyricsTypography,
  applyLyricsTypography,
  loadTrackLyricOffset,
  saveTrackLyricOffset,
  formatLyricOffset,
  LYRICS_OFFSET_MIN_MS,
  LYRICS_OFFSET_MAX_MS,
  LYRICS_OFFSET_STEP_MS,
  DEFAULT_LYRICS_TYPOGRAPHY,
  type LyricsTypography,
  type LyricsSyncMode,
  type LyricsTextStyle,
  type LyricsAnimation,
} from "./lyricsTypography";

export type VisualMode = "full" | "balanced";

export interface LyricsProviderIslandProps {
  trackKey?: string;
  hasWordSync?: boolean;
  visualMode?: VisualMode;
  onSetVisualMode?: (mode: VisualMode) => void;
  blurEnabled?: boolean;
  onToggleBlur?: () => void;
  lang?: string;
}

const SYNC_OPTIONS: { id: LyricsSyncMode; ru: string; en: string }[] = [
  { id: "word", ru: "По словам", en: "By word" },
  { id: "line", ru: "По строкам", en: "By line" },
];

const TEXT_STYLE_OPTIONS: { id: LyricsTextStyle; ru: string; en: string }[] = [
  { id: "default", ru: "Обычный", en: "Default" },
  { id: "cinema", ru: "Кино", en: "Cinema" },
  { id: "shift", ru: "Сдвиг", en: "Shift" },
  { id: "blur", ru: "Размытие", en: "Blur" },
];

const ANIMATION_OPTIONS: { id: LyricsAnimation; ru: string; en: string }[] = [
  { id: "wave", ru: "Волна", en: "Wave" },
  { id: "blur", ru: "Размытие", en: "Blur" },
  { id: "flip3d", ru: "3D Переворот", en: "3D Flip" },
  { id: "bounce", ru: "Отскок", en: "Bounce" },
  { id: "drift", ru: "Дрифт", en: "Drift" },
  { id: "off", ru: "Выкл", en: "Off" },
];

function cycleOption<T extends string>(options: readonly { id: T }[], current: T): T {
  const idx = options.findIndex((o) => o.id === current);
  return options[(idx + 1) % options.length].id;
}

const VISUAL_MODES = [
  {
    key: "full" as const,
    titleRu: "Все эффекты",
    titleEn: "All effects",
    hintRu: "Живой фон и мягкое размытие уходящих строк",
    hintEn: "Live background and soft lyrics edge blur",
  },
  {
    key: "balanced" as const,
    titleRu: "Сбалансированный",
    titleEn: "Balanced",
    hintRu: "Живой фон с четкими краями текста",
    hintEn: "Live background with crisp lyrics edges",
  },
];

export function LyricsProviderIsland({
  trackKey = "",
  hasWordSync = true,
  visualMode = "full",
  onSetVisualMode,
  blurEnabled = true,
  onToggleBlur,
  lang = "ru",
}: LyricsProviderIslandProps) {
  const [visualQualityOpen, setVisualQualityOpen] = useState(false);
  const [typo, setTypo] = useState<LyricsTypography>(() => loadLyricsTypography());
  const [offsetMs, setOffsetMs] = useState<number>(() => loadTrackLyricOffset(trackKey));
  const containerRef = useRef<HTMLDivElement | null>(null);
  const typoRafRef = useRef<number | null>(null);

  useEffect(() => {
    setOffsetMs(loadTrackLyricOffset(trackKey));
  }, [trackKey]);

  useEffect(() => {
    const onSettings = () => {
      setTypo(loadLyricsTypography());
    };
    window.addEventListener(LYRICS_SETTINGS_EVENT, onSettings);
    return () => window.removeEventListener(LYRICS_SETTINGS_EVENT, onSettings);
  }, []);

  const updateOffset = (nextMs: number) => {
    setOffsetMs(nextMs);
    saveTrackLyricOffset(trackKey, nextMs);
  };

  useEffect(() => {
    if (typoRafRef.current !== null) {
      cancelAnimationFrame(typoRafRef.current);
    }
    typoRafRef.current = requestAnimationFrame(() => {
      typoRafRef.current = null;
      applyLyricsTypography(typo);
    });
    return () => {
      if (typoRafRef.current !== null) {
        cancelAnimationFrame(typoRafRef.current);
        typoRafRef.current = null;
      }
    };
  }, [typo]);

  const updateTypo = (patch: Partial<LyricsTypography>) => {
    setTypo((prev) => {
      const next = { ...prev, ...patch };
      saveLyricsTypography(next);
      return next;
    });
  };

  const resetTypo = () => {
    setTypo(DEFAULT_LYRICS_TYPOGRAPHY);
    saveLyricsTypography(DEFAULT_LYRICS_TYPOGRAPHY);
    if (trackKey) {
      updateOffset(0);
    }
  };

  useEffect(() => {
    if (!visualQualityOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setVisualQualityOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setVisualQualityOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [visualQualityOpen]);

  if (!onSetVisualMode && !onToggleBlur) {
    return null;
  }

  return (
    <div ref={containerRef} className="fs-lyrics-island">
      <button
        type="button"
        className={`fs-island-blur-btn ${visualMode === "full" || blurEnabled ? "active" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          if (onSetVisualMode) {
            setVisualQualityOpen((prev) => !prev);
          } else if (onToggleBlur) {
            onToggleBlur();
          }
        }}
        title={lang === "ru" ? "Настройка текста и визуалов" : "Lyrics & visual settings"}
        aria-label="Lyrics and visual settings"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M12 2L14.4 8.6L21 11L14.4 13.4L12 20L9.6 13.4L3 11L9.6 8.6L12 2Z" />
        </svg>
      </button>

      {/* Visual Quality Popover */}
      {visualQualityOpen && onSetVisualMode && (
        <div className="fs-visual-quality-popover" onClick={(e) => e.stopPropagation()} role="dialog">
          <div className="fs-vq-header">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="fs-vq-icon">
              <path d="M12 2L14.4 8.6L21 11L14.4 13.4L12 20L9.6 13.4L3 11L9.6 8.6L12 2Z" />
            </svg>
            <span className="fs-vq-title">{lang === "ru" ? "Визуальные эффекты" : "Visual effects"}</span>
          </div>
          <p className="fs-vq-desc">
            {lang === "ru"
              ? "Настройка отображения текста песни и градиентного размытия краев."
              : "Adjust lyrics presentation and edge blur effects."}
          </p>
          <div className="fs-vq-options">
            {VISUAL_MODES.map((opt) => {
              const active = visualMode === opt.key;
              return (
                <button
                  key={opt.key}
                  type="button"
                  className={`fs-vq-option ${active ? "active" : ""}`}
                  onClick={() => {
                    onSetVisualMode(opt.key);
                  }}
                >
                  <div className="fs-vq-opt-text">
                    <span className="fs-vq-opt-title">{lang === "ru" ? opt.titleRu : opt.titleEn}</span>
                    <span className="fs-vq-opt-hint">{lang === "ru" ? opt.hintRu : opt.hintEn}</span>
                  </div>
                  {active && (
                    <svg className="fs-vq-check" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  )}
                </button>
              );
            })}
          </div>

          {/* Divider */}
          <div className="fs-vq-divider" />

          {/* Typography Settings Section */}
          <div className="fs-vq-header fs-vq-typo-header">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="fs-vq-icon">
              <polyline points="4 7 4 4 20 4 20 7" />
              <line x1="9" y1="20" x2="15" y2="20" />
              <line x1="12" y1="4" x2="12" y2="20" />
            </svg>
            <span className="fs-vq-title">{lang === "ru" ? "Настройка текста" : "Lyrics typography"}</span>
          </div>

          <div className="fs-vq-typo-section">
            {/* Sync Mode / Text Style / Animation */}
            <div className="fs-vq-meta-rows">
              {(() => {
                const effectiveSync: LyricsSyncMode = hasWordSync ? typo.syncMode : "line";
                const found = SYNC_OPTIONS.find((o) => o.id === effectiveSync) ?? SYNC_OPTIONS[0];
                return (
                  <button
                    type="button"
                    disabled={!hasWordSync}
                    className={`fs-vq-meta-row ${!hasWordSync ? "is-locked" : ""}`}
                    onClick={() =>
                      hasWordSync && updateTypo({ syncMode: cycleOption(SYNC_OPTIONS, typo.syncMode) })
                    }
                    title={
                      !hasWordSync
                        ? lang === "ru"
                          ? "Для этого трека доступны только построчные тайминги"
                          : "Only line-level timings available for this track"
                        : undefined
                    }
                  >
                    <span className="fs-vq-meta-label">{lang === "ru" ? "Синхронизация" : "Sync"}</span>
                    <span className="fs-vq-meta-value">
                      {lang === "ru" ? found.ru : found.en}
                    </span>
                  </button>
                );
              })()}

              <button
                type="button"
                className="fs-vq-meta-row"
                onClick={() => updateTypo({ textStyle: cycleOption(TEXT_STYLE_OPTIONS, typo.textStyle) })}
              >
                <span className="fs-vq-meta-label">{lang === "ru" ? "Стиль текста" : "Text style"}</span>
                <span className="fs-vq-meta-value">
                  {(() => {
                    const found = TEXT_STYLE_OPTIONS.find((o) => o.id === typo.textStyle) ?? TEXT_STYLE_OPTIONS[0];
                    return lang === "ru" ? found.ru : found.en;
                  })()}
                </span>
              </button>

              <button
                type="button"
                className="fs-vq-meta-row"
                onClick={() => updateTypo({ animation: cycleOption(ANIMATION_OPTIONS, typo.animation) })}
              >
                <span className="fs-vq-meta-label">{lang === "ru" ? "Анимация" : "Animation"}</span>
                <span className="fs-vq-meta-value">
                  {(() => {
                    const found = ANIMATION_OPTIONS.find((o) => o.id === typo.animation) ?? ANIMATION_OPTIONS[0];
                    return lang === "ru" ? found.ru : found.en;
                  })()}
                </span>
              </button>
            </div>

            {/* Per-Track Timing Offset */}
            {trackKey && (
              <div className="fs-vq-slider-group">
                <div className="fs-vq-slider-label-row">
                  <span>{lang === "ru" ? "Смещение" : "Offset"}</span>
                  <div className="fs-vq-offset-actions">
                    {offsetMs !== 0 && (
                      <button
                        type="button"
                        className="fs-vq-offset-reset"
                        onClick={() => updateOffset(0)}
                        title={lang === "ru" ? "Сбросить смещение для этого трека" : "Reset offset for this track"}
                      >
                        ↺
                      </button>
                    )}
                    <span className={`fs-vq-slider-val ${offsetMs !== 0 ? "is-active" : ""}`}>
                      {formatLyricOffset(offsetMs, lang)}
                    </span>
                  </div>
                </div>
                <div className="fs-vq-offset-slider-wrap">
                  <span className="fs-vq-offset-zero" aria-hidden="true" />
                  <input
                    type="range"
                    min={LYRICS_OFFSET_MIN_MS}
                    max={LYRICS_OFFSET_MAX_MS}
                    step={LYRICS_OFFSET_STEP_MS}
                    value={offsetMs}
                    onChange={(e) => updateOffset(Number(e.target.value))}
                    onDoubleClick={() => updateOffset(0)}
                    className="fs-vq-slider fs-vq-offset-slider"
                  />
                </div>
              </div>
            )}

            <div className="fs-vq-divider fs-vq-divider-compact" />

            {/* Font Size */}
            <div className="fs-vq-slider-group">
              <div className="fs-vq-slider-label-row">
                <span>{lang === "ru" ? "Размер текста" : "Text size"}</span>
                <span className="fs-vq-slider-val">{typo.fontSize}px</span>
              </div>
              <input
                type="range"
                min="18"
                max="56"
                step="1"
                value={typo.fontSize}
                onChange={(e) => updateTypo({ fontSize: Number(e.target.value) })}
                className="fs-vq-slider"
              />
            </div>

            {/* Font Weight */}
            <div className="fs-vq-slider-group">
              <div className="fs-vq-slider-label-row">
                <span>{lang === "ru" ? "Толщина" : "Weight"}</span>
                <span className="fs-vq-slider-val">{typo.fontWeight}</span>
              </div>
              <input
                type="range"
                min="300"
                max="900"
                step="100"
                value={typo.fontWeight}
                onChange={(e) => updateTypo({ fontWeight: Number(e.target.value) })}
                className="fs-vq-slider"
              />
            </div>

            {/* Line Spacing / Margin */}
            <div className="fs-vq-slider-group">
              <div className="fs-vq-slider-label-row">
                <span>{lang === "ru" ? "Межстрочный интервал" : "Line spacing"}</span>
                <span className="fs-vq-slider-val">{typo.lineSpacing}px</span>
              </div>
              <input
                type="range"
                min="4"
                max="48"
                step="2"
                value={typo.lineSpacing}
                onChange={(e) => updateTypo({ lineSpacing: Number(e.target.value) })}
                className="fs-vq-slider"
              />
            </div>

            {/* Alignment */}
            <div className="fs-vq-slider-group">
              <div className="fs-vq-slider-label-row">
                <span>{lang === "ru" ? "Выравнивание текста" : "Alignment"}</span>
              </div>
              <div className="fs-vq-align-wrap">
                <button
                  type="button"
                  className={`fs-vq-align-btn ${typo.alignment === "left" ? "active" : ""}`}
                  onClick={() => updateTypo({ alignment: "left" })}
                >
                  {lang === "ru" ? "Слева" : "Left"}
                </button>
                <button
                  type="button"
                  className={`fs-vq-align-btn ${typo.alignment === "center" ? "active" : ""}`}
                  onClick={() => updateTypo({ alignment: "center" })}
                >
                  {lang === "ru" ? "По центру" : "Center"}
                </button>
              </div>
            </div>

            {/* Reset to Default */}
            <button
              type="button"
              className="fs-vq-reset-btn"
              onClick={resetTypo}
              title={lang === "ru" ? "Сбросить к исходным настройкам" : "Reset to defaults"}
            >
              {lang === "ru" ? "Сбросить" : "Reset"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
