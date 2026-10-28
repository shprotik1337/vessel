import type { Lang } from "../../i18n";
import { t } from "../../i18n";
import type { LyricsCandidateOption } from "../../lib/lyrics";
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
  availableProviders?: LyricsCandidateOption[];
  activeProvider?: string;
  onSelectProvider?: (provider: string) => void;
  onNextProvider?: () => void;
  onPrevProvider?: () => void;
}

export function FullscreenHeader({
  onClose,
  lang,
  availableProviders,
  activeProvider,
  onSelectProvider,
  onNextProvider,
  onPrevProvider,
}: FullscreenHeaderProps) {
  const showIsland =
    availableProviders &&
    availableProviders.length > 0 &&
    activeProvider &&
    onSelectProvider &&
    onNextProvider &&
    onPrevProvider;

  return (
    <div className="fs-top-bar">
      <div className="fs-top-left">
        {showIsland && (
          <LyricsProviderIsland
            availableProviders={availableProviders}
            activeProvider={activeProvider}
            onSelectProvider={onSelectProvider}
            onNext={onNextProvider}
            onPrev={onPrevProvider}
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
