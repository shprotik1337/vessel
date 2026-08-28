import { useApp } from "../store";
import { TrackRow } from "../components/TrackRow";
import { trackKey, relativeTime } from "../lib/utils";
import type { TrackRef } from "../api/types";
import * as api from "../api/commands";

export function Recent() {
  const { state, playTracks, showToast, refresh } = useApp();
  if (!state) return null;

  const nowKey = state.now_playing ? trackKey(state.now_playing) : null;
  const history = state.history;

  const playOne = (track: TrackRef) => {
    void playTracks([track], 0);
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
          <div className="view-sub">{history.length} tracks</div>
        </div>
        <div className="btns">
          {history.length > 0 && (
            <button className="btn btn-ghost" onClick={clearAll}>
              Clear
            </button>
          )}
        </div>
      </div>

      {history.length === 0 ? (
        <div className="empty">
          <div className="ico">⏱</div>
          <div className="t1">Nothing played yet</div>
          <div className="t2">Play some tracks to see them here.</div>
        </div>
      ) : (
        <div className="tracklist">
          {history.map((entry, i) => (
            <TrackRow
              key={trackKey(entry.track) + i}
              track={entry.track}
              index={i}
              nowKey={nowKey}
              onPlay={playOne}
              showAdded
              addedLabel={relativeTime(entry.played_at_ms)}
            />
          ))}
        </div>
      )}
    </div>
  );
}