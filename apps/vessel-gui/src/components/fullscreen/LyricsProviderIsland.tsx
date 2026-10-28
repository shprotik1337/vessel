import React, { useState, useRef, useEffect } from "react";
import type { LyricsCandidateOption } from "../../lib/lyrics";

export interface LyricsProviderIslandProps {
  availableProviders: LyricsCandidateOption[];
  activeProvider: string;
  onSelectProvider: (provider: string) => void;
  onNext: () => void;
  onPrev: () => void;
}

export function LyricsProviderIsland({
  availableProviders,
  activeProvider,
  onSelectProvider,
  onNext,
  onPrev,
}: LyricsProviderIslandProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [dropdownOpen]);

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

      {/* Clean compact dropdown: only existing candidates, no badges */}
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
                {isItemActive ? (
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
                ) : (
                  <span className="fs-island-item-num">{idx + 1}</span>
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
