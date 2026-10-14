import { useState, useRef, useEffect } from "react";
import { t, type Lang } from "../../i18n";

export const CLOSE_SVG = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export interface FullscreenHeaderProps {
  fullscreenMode: "both" | "lyrics" | "cover";
  followTrack: boolean;
  onSetFullscreenMode: (mode: "both" | "lyrics" | "cover") => void;
  onSetFullscreenFollowTrack: (follow: boolean) => void;
  onClose: () => void;
  lang: Lang;
}

export function FullscreenHeader({
  fullscreenMode,
  followTrack,
  onSetFullscreenMode,
  onSetFullscreenFollowTrack,
  onClose,
  lang,
}: FullscreenHeaderProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", onMouseDown);
    return () => window.removeEventListener("mousedown", onMouseDown);
  }, [menuOpen]);

  return (
    <div className="fs-top-bar">
      <div style={{ flex: 1 }} />
      <div className="fs-top-actions">
        <div className="fs-options-wrap" ref={menuRef} style={{ position: "relative" }}>
          <button
            className={`fs-btn-dots ${menuOpen ? "active" : ""}`}
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((prev) => !prev);
            }}
            title="Настройки показа"
            aria-label="Options"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="2.2" />
              <circle cx="12" cy="12" r="2.2" />
              <circle cx="19" cy="12" r="2.2" />
            </svg>
          </button>

          {menuOpen && (
            <div
              className="fs-options-popover"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="fs-popover-row">
                <span>Следовать за треком</span>
                <span
                  className={`fs-follow-tag ${followTrack ? "on" : "off"}`}
                  onClick={() => onSetFullscreenFollowTrack(!followTrack)}
                >
                  {followTrack ? "Вкл" : "Выкл"}
                </span>
              </div>
              <div className="fs-popover-divider" />
              <div className="fs-popover-title">Режим показа</div>
              <div className="fs-popover-modes">
                <button
                  className={`fs-mode-pill ${fullscreenMode === "both" ? "active" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSetFullscreenMode("both");
                    setMenuOpen(false);
                  }}
                >
                  Текст и обложка
                </button>
                <button
                  className={`fs-mode-pill ${fullscreenMode === "lyrics" ? "active" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSetFullscreenMode("lyrics");
                    setMenuOpen(false);
                  }}
                >
                  Только текст
                </button>
                <button
                  className={`fs-mode-pill ${fullscreenMode === "cover" ? "active" : ""}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onSetFullscreenMode("cover");
                    setMenuOpen(false);
                  }}
                >
                  Только обложка
                </button>
              </div>
            </div>
          )}
        </div>

        <button
          className="fs-close-btn"
          onClick={onClose}
          title={t(lang, "fullscreen.close")}
          aria-label="Close fullscreen"
        >
          {CLOSE_SVG}
        </button>
      </div>
    </div>
  );
}
