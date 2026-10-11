import { Artwork } from "../../components/Artwork";
import { PlatformIcon } from "../../components/PlatformIcon";
import { filterValidArtists, trackKey } from "../../lib/utils";
import type { TrackRef } from "../../api/types";
import { formatDuration, getProviderLabel } from "./HomeHelpers";

export function LibraryBlockContent({
  library,
  nowKey,
  isLive,
  playOne,
  navigateTo,
  lang,
}: {
  library: TrackRef[];
  nowKey: string | null;
  isLive: boolean;
  playOne: (track: TrackRef) => void;
  navigateTo: (view: any, params?: any) => void;
  lang: any;
}) {
  const isMini = false;
  const visibleTracks = isMini ? library.slice(0, 5) : library.slice(0, 9);

  return (
    <div className="section">
      <div className="home-section-head">
        <div className="home-section-title-wrap">
          <span className="home-section-title">{lang === "ru" ? "Из вашей библиотеки" : "From your library"}</span>
        </div>
        <span className="home-section-link" onClick={() => navigateTo("favorites")}>
          {lang === "ru" ? "Показать все" : "Show all"}
        </span>
      </div>
      <div className="home-library-table">
        {visibleTracks.map((track, i) => {
          const isTrackPlaying = trackKey(track) === nowKey && isLive;
          return (
            <div
              key={trackKey(track) + i}
              className="home-lib-row"
              onClick={() => playOne(track)}
            >
              <div className="home-lib-num">{i + 1}</div>
              <div className="home-lib-art-wrap">
                <Artwork url={track.artwork_url} alt={track.title} seed={i} className="home-lib-art-img" />
                <div className={`home-lib-play-hover ${isTrackPlaying ? "playing" : ""}`}>
                  <span style={{ fontSize: 13, color: "#fff" }}>{isTrackPlaying ? "❚❚" : "▶"}</span>
                </div>
              </div>
              <div className="home-lib-info">
                <div className="home-lib-title">{track.title}</div>
                <div className="home-lib-artist">
                  {filterValidArtists(track.artists).map((artist, aIdx, arr) => (
                    <span key={`${artist}-${aIdx}`}>
                      <span
                        className="pl-artist-link"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigateTo("artist", { artist, provider: track.provider });
                        }}
                      >
                        {artist}
                      </span>
                      {aIdx < arr.length - 1 ? ", " : ""}
                    </span>
                  ))}
                </div>
              </div>
              <div className="home-lib-badge">
                <PlatformIcon kind={track.provider as any} size={14} />
                <span>{getProviderLabel(track.provider)}</span>
              </div>
              <div className="home-lib-duration">
                {formatDuration(track.duration_ms)}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
