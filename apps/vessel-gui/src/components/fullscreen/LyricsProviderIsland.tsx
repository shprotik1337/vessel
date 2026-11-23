import React, { useState, useRef, useEffect } from "react";
import type { LyricsCandidateOption } from "../../lib/lyrics";
import {
  loadLyricsTypography,
  saveLyricsTypography,
  applyLyricsTypography,
  DEFAULT_LYRICS_TYPOGRAPHY,
  type LyricsTypography,
} from "./lyricsTypography";

export type VisualMode = "full" | "balanced";

export interface LyricsProviderIslandProps {
  availableProviders: LyricsCandidateOption[];
  activeProvider: string;
  onSelectProvider: (provider: string) => void;
  onNext: () => void;
  onPrev: () => void;
  visualMode?: VisualMode;
  onSetVisualMode?: (mode: VisualMode) => void;
  blurEnabled?: boolean;
  onToggleBlur?: () => void;
  lang?: string;
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
  availableProviders,
  activeProvider,
  onSelectProvider,
  onNext,
  onPrev,
  visualMode = "full",
  onSetVisualMode,
  blurEnabled = true,
  onToggleBlur,
  lang = "ru",
}: LyricsProviderIslandProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [visualQualityOpen, setVisualQualityOpen] = useState(false);
  const [typo, setTypo] = useState<LyricsTypography>(() => loadLyricsTypography());
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    applyLyricsTypography(typo);
  }, [typo]);

  const updateTypo = (patch: Partial<LyricsTypography>) => {
    setTypo((prev) => {
      const next = { ...prev, ...patch };
      saveLyricsTypography(next);
      applyLyricsTypography(next);
      return next;
    });
  };

  const resetTypo = () => {
    setTypo(DEFAULT_LYRICS_TYPOGRAPHY);
    saveLyricsTypography(DEFAULT_LYRICS_TYPOGRAPHY);
    applyLyricsTypography(DEFAULT_LYRICS_TYPOGRAPHY);
  };

  useEffect(() => {
    if (!dropdownOpen && !visualQualityOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
        setVisualQualityOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDropdownOpen(false);
        setVisualQualityOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [dropdownOpen, visualQualityOpen]);

  // Filter out any stale Polaris Mono entries if any remain in cache
  const cleanProviders = (availableProviders || []).filter(
    (p) => p.provider !== "Polaris Mono" && p.provider !== "Polaris"
  );

  if (cleanProviders.length === 0) {
    return null;
  }

  // Find candidate for activeProvider
  const currentOption =
    cleanProviders.find((p) => p.provider === activeProvider) ||
    cleanProviders.find((p) => p.isMeta) ||
    cleanProviders[0];

  const hasMultiple = cleanProviders.length > 1;
  const currentIndex = Math.max(
    0,
    cleanProviders.findIndex((p) => p.provider === currentOption?.provider)
  );

  const handlePrev = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (hasMultiple) onPrev();
  };

  const handleNext = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (hasMultiple) onNext();
  };

  // Display label: strictly "Vessel" for meta-candidate (no parentheses!), or provider name
  const displayLabel =
    currentOption?.isMeta || currentOption?.provider === "Vessel"
      ? "Vessel"
      : currentOption?.provider || "Lyrics";

  return (
    <div ref={containerRef} className="fs-lyrics-island">
      {(onSetVisualMode || onToggleBlur) && (
        <>
          <button
            type="button"
            className={`fs-island-blur-btn ${visualMode === "full" || blurEnabled ? "active" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              if (onSetVisualMode) {
                setVisualQualityOpen((prev) => !prev);
                setDropdownOpen(false);
              } else if (onToggleBlur) {
                onToggleBlur();
              }
            }}
            title={lang === "ru" ? "Качество визуалов" : "Visual quality"}
            aria-label="Visual quality"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2L14.4 8.6L21 11L14.4 13.4L12 20L9.6 13.4L3 11L9.6 8.6L12 2Z" />
            </svg>
          </button>
          <span className="fs-island-divider" />
        </>
      )}

      {hasMultiple && (
        <button
          type="button"
          className="fs-island-nav-btn"
          onClick={handlePrev}
          title="Предыдущий источник"
          aria-label="Previous provider"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}

      <button
        type="button"
        className={`fs-island-main-btn ${hasMultiple ? "interactive" : ""}`}
        onClick={(e) => {
          e.stopPropagation();
          if (hasMultiple) {
            setDropdownOpen((prev) => !prev);
            setVisualQualityOpen(false);
          }
        }}
        title="Выбрать источник текста"
      >
        <span className="fs-island-provider-name">{displayLabel}</span>
        {hasMultiple && (
          <span className="fs-island-count-badge">
            {currentIndex + 1}/{cleanProviders.length}
          </span>
        )}
        {hasMultiple && (
          <svg
            className={`fs-island-chevron ${dropdownOpen ? "open" : ""}`}
            width="10"
            height="10"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 12 15 18 9" />
          </svg>
        )}
      </button>

      {hasMultiple && (
        <button
          type="button"
          className="fs-island-nav-btn"
          onClick={handleNext}
          title="Следующий источник"
          aria-label="Next provider"
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}

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

      {/* Clean compact provider dropdown */}
      {dropdownOpen && hasMultiple && (
        <div className="fs-island-dropdown" onClick={(e) => e.stopPropagation()}>
          {cleanProviders.map((item, idx) => {
            const isItemActive =
              currentOption?.provider === item.provider ||
              (item.isMeta && currentOption?.isMeta);
            const label = item.isMeta ? "Vessel" : item.provider;

            return (
              <button
                key={`${item.provider}-${idx}`}
                type="button"
                className={`fs-island-item ${isItemActive ? "active" : ""}`}
                onClick={() => {
                  onSelectProvider(item.provider);
                  setDropdownOpen(false);
                }}
              >
                <span className="fs-island-item-name">{label}</span>
                {isItemActive && (
                  <svg
                    width="13"
                    height="13"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="fs-island-item-check"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
