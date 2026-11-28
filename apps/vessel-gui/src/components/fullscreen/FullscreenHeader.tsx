import type { Lang } from "../../i18n";
import { t } from "../../i18n";
import { LyricsProviderIsland } from "./LyricsProviderIsland";

export const CLOSE_SVG = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export interface FullscreenHeaderProps {
  onClose: () => void;
  lang: Lang;
  trackKey?: string;
  hasWordSync?: boolean;
  visualMode?: "full" | "balanced";
  onSetVisualMode?: (mode: "full" | "balanced") => void;
  blurEnabled?: boolean;
  onToggleBlur?: () => void;
}

export function FullscreenHeader({
  onClose,
  lang,
  trackKey = "",
  hasWordSync = true,
  visualMode = "full",
  onSetVisualMode,
  blurEnabled,
  onToggleBlur,
}: FullscreenHeaderProps) {
  const showLyricsSettings = Boolean(onSetVisualMode || onToggleBlur);

  return (
    <div className="fs-top-bar">
      <div className="fs-top-left">
        {showLyricsSettings && (
          <LyricsProviderIsland
            trackKey={trackKey}
            hasWordSync={hasWordSync}
            visualMode={visualMode}
            onSetVisualMode={onSetVisualMode}
            blurEnabled={blurEnabled}
            onToggleBlur={onToggleBlur}
            lang={lang}
          />
        )}
      </div>

      <div className="fs-top-right">
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
