import { Artwork } from "../../components/Artwork";
import { PlatformIcon } from "../../components/PlatformIcon";
import { providerLabel } from "../../lib/utils";
import type { TrackRef } from "../../api/types";

interface SearchHeroRecsProps {
  recs: TrackRef[];
  recsLoading: boolean;
  onPlayRec: (track: TrackRef, list: TrackRef[]) => void;
}

export function SearchHeroRecs({
  recs,
  recsLoading,
  onPlayRec,
}: SearchHeroRecsProps) {
  if (recsLoading) {
    return (
      <div className="search-hero-recs-wrap">
        <div className="search-hero-recs-row">
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((num) => (
            <div key={num} className="search-hero-rec-card skel-card">
              <div className="skel search-hero-rec-skel-art" />
              <div className="skel search-hero-rec-skel-line" style={{ width: "80%" }} />
              <div className="skel search-hero-rec-skel-line" style={{ width: "50%" }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (recs.length === 0) {
    return null;
  }

  return (
    <div className="search-hero-recs-wrap">
      <div className="search-hero-recs-row">
        {recs.map((track) => {
          const artistStr = track.artists?.join(", ") || "";
          return (
            <div
              key={`${track.provider}:${track.id}`}
              className="search-hero-rec-card"
              onClick={() => onPlayRec(track, recs)}
              title={`${track.title} - ${artistStr}`}
            >
              <div className="search-hero-rec-art-wrap">
                <Artwork
                  url={track.artwork_url}
                  alt={track.title}
                  seed={track.id.length}
                  square={true}
                  className="search-hero-rec-art"
                />
                {track.provider && (
                  <span className="search-hero-rec-badge" title={providerLabel(track.provider)}>
                    <PlatformIcon kind={track.provider} size={12} />
                  </span>
                )}
              </div>
              <div className="search-hero-rec-title">{track.title}</div>
              <div className="search-hero-rec-artist">{artistStr}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
