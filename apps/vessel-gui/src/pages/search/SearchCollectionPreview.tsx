import { TrackRow } from "../../components/TrackRow";
import { VirtualTrackList } from "../../components/VirtualTrackList";
import { trackKey } from "../../lib/utils";
import { t, type Lang } from "../../i18n";
import type { TrackRef } from "../../api/types";
import type { PreviewState } from "./searchTypes";

interface SearchCollectionPreviewProps {
  preview: PreviewState;
  onClose: () => void;
  nowKey: string | null;
  lang: Lang;
  adding: string | null;
  onPlayTracks: (tracks: TrackRef[], startIndex: number) => void;
  onPlayTrack: (track: TrackRef, tracks: TrackRef[]) => void;
  onAddToLibrary: (url: string) => void;
  onArtistClick: (name: string, provider?: string) => void;
}

export function SearchCollectionPreview({
  preview,
  onClose,
  nowKey,
  lang,
  adding,
  onPlayTracks,
  onPlayTrack,
  onAddToLibrary,
  onArtistClick,
}: SearchCollectionPreviewProps) {
  const pl = preview.playlist;

  return (
    <div className="view">
      <div style={{ marginBottom: 18 }}>
        <button className="btn btn-outline btn-sm" onClick={onClose}>
          {t(lang, "common.back")}
        </button>
      </div>
      {preview.loading || !pl ? (
        <div className="tracklist">
          <div className="skel" />
          <div className="skel" />
          <div className="skel" />
          <div className="skel" />
        </div>
      ) : (
        <div className="page-panel">
          <div
            className="page-panel-header"
            style={{ display: "flex", gap: 20, alignItems: "center", marginBottom: 18 }}
          >
            {pl.cover_url && (
              <img
                src={pl.cover_url}
                alt={pl.title}
                style={{ width: 120, height: 120, borderRadius: 12, objectFit: "cover" }}
              />
            )}
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>{pl.title}</h2>
              <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 6 }}>
                {pl.tracks.length} {t(lang, "common.tracks")}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                <button
                  className="btn btn-primary btn-sm"
                  onClick={() => {
                    if (pl.tracks.length > 0) void onPlayTracks(pl.tracks, 0);
                  }}
                >
                  ▶ {t(lang, "common.play")}
                </button>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => void onAddToLibrary(pl.source_url || "")}
                  disabled={adding === pl.source_url}
                >
                  + {t(lang, "search.add")}
                </button>
              </div>
            </div>
          </div>
          <div className="page-panel-body">
            <VirtualTrackList
              items={pl.tracks}
              renderItem={(track, i) => (
                <TrackRow
                  key={trackKey(track) + i}
                  track={track}
                  index={i}
                  nowKey={nowKey}
                  onPlay={(t) => onPlayTrack(t, pl.tracks)}
                  onArtistClick={onArtistClick}
                />
              )}
            />
          </div>
        </div>
      )}
    </div>
  );
}
