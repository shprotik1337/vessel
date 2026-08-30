import { useApp } from "../store";
import { TrackRow } from "../components/TrackRow";
import { trackKey, relativeTime } from "../lib/utils";
import type { TrackRef } from "../api/types";
import * as api from "../api/commands";

export function Recent() {
  const { state, playTracks, showToast, refresh, navigateTo } = useApp();
  if (!state) return null;

  const nowKey = state.now_playing ? trackKey(state.now_playing) : null;
  const history = state.history;

  // unique by track key, keep most recent occurrence, ordered by most recent
  const uniqueHistory = (() => {
    const seen = new Map<string, (typeof history)[number]>();
    for (const entry of history) {
      const key = trackKey(entry.track);
      seen.set(key, entry);
    }
    return Array.from(seen.values());
  })();

  const playOne = (track: TrackRef) => {
    const idx = uniqueHistory.findIndex((h) => trackKey(h.track) === trackKey(track));
    void playTracks(uniqueHistory.map((h) => h.track), idx < 0 ? 0 : idx);
  };

  const clearAll = async () => {
    try {
      await api.clearHistory();
      await refresh();
      showToast("History cleared");
    } catch (error) {
      showToast(String(error), true);
    }
  };

  return (
    <div className="view">
      <div className="view-hd">
        <div>
          <div className="view-title">Recently Played</div>
          <div className="view-sub">{uniqueHistory.length} tracks</div>
        </div>
        <div className="btns">
          {uniqueHistory.length > 0 && (
            <button className="btn btn-ghost" onClick={clearAll}>
              Clear
            </button>
          )}
        </div>
      </div>

      {uniqueHistory.length === 0 ? (
        <div className="empty">
          <div className="ico">⏱</div>
          <div className="t1">Nothing played yet</div>
          <div className="t2">Play some tracks to see them here.</div>
        </div>
      ) : (
        <div className="tracklist">
          {uniqueHistory.map((entry, i) => (
            <TrackRow
              key={trackKey(entry.track) + i}
              track={entry.track}
              index={i}
              nowKey={nowKey}
              onPlay={playOne}
              onArtistClick={(name, provider) => navigateTo("artist", { artist: name, provider })}
              showAdded
              addedLabel={relativeTime(entry.played_at_ms)}
            />
          ))}
        </div>
      )}
    </div>
  );
}