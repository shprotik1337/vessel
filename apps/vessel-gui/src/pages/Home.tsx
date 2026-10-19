import { useState } from "react";
import { useApp } from "../store";
import { WaveSection } from "../components/WaveSection";
import { QuickAccessSection } from "../components/QuickAccessSection";
import { trackKey } from "../lib/utils";
import type { MixItem } from "../api/types";
import {
  RecommendationsBlockContent,
  MixesBlockContent,
  ExploreBlockContent,
  HomeMixPageView,
} from "./home_sections";

export function Home() {
  const { state, navigateTo, lang } = useApp();
  const [selectedMix, setSelectedMix] = useState<MixItem | null>(null);

  if (!state) return null;

  const nowKey = state.now_playing ? trackKey(state.now_playing) : null;
  const isLive =
    state?.player.status === "playing" || state?.player.status === "buffering";

  if (selectedMix) {
    return (
      <HomeMixPageView
        mix={selectedMix}
        onBack={() => setSelectedMix(null)}
        lang={lang}
        nowKey={nowKey}
        isLive={isLive}
      />
    );
  }

  return (
    <div className="view home-view-container">
      <div className="home-rows-container">
        {/* 1. Wave Section */}
        <div className="home-row-line">
          <div className="home-block-wrapper" data-block-id="wave" data-width="full">
            <WaveSection />
          </div>
        </div>

        {/* 2. Quick Access Section */}
        <div className="home-row-line">
          <div className="home-block-wrapper" data-block-id="quick-access" data-width="full">
            <QuickAccessSection />
          </div>
        </div>

        {/* 3. Recommendations Section */}
        <div className="home-row-line">
          <div className="home-block-wrapper" data-block-id="recommendations" data-width="full">
            <RecommendationsBlockContent
              nowKey={nowKey}
              isLive={isLive}
              lang={lang}
            />
          </div>
        </div>

        {((state?.library?.length ?? 0) > 0 || (state?.playlists?.length ?? 0) > 0) && (
          <>
            {/* 3. Personal Mixes Section */}
            <div className="home-row-line">
              <div className="home-block-wrapper" data-block-id="mixes" data-width="full">
                <MixesBlockContent
                  lang={lang}
                  onOpenMix={(mix: MixItem) => setSelectedMix(mix)}
                />
              </div>
            </div>

            {/* 4. Explore Section ("You might like") */}
            <div className="home-row-line">
              <div className="home-block-wrapper" data-block-id="explore" data-width="full">
                <ExploreBlockContent
                  nowKey={nowKey}
                  isLive={isLive}
                  navigateTo={navigateTo}
                  lang={lang}
                />
              </div>
            </div>
          </>
        )}
        <div className="content-safe-bottom-spacer" />
      </div>
    </div>
  );
}
