import { useApp } from "../store";
import { TrackRow } from "../components/TrackRow";
import { trackKey } from "../lib/utils";
import type { TrackRef } from "../api/types";
import * as api from "../api/commands";

export function Favorites() {
  const { state, playTracks, showToast } = useApp();
  if (!state) return null;

  const nowKey = state.now_playing ? trackKey(state.now_playing) : null;
  const favTracks = state.library;

  const playOne = (track: TrackRef) => {
    void playTracks([track], 0);
  };

  const playAll = async () => {
    if (favTracks.length === 0) return;
    try {
      await api.playTracks(favTracks, 0);
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const shufflePlay = async () => {
    const tracks = [...favTracks].sort(() => Math.random() - 0.5);
    if (tracks.length === 0) return;
    try {
      await api.playTracks(tracks, 0);
    } catch (error) {
      showToast(String(error), true);
    }
  };

  return (
    <div className="view">
      <div className="view-hd">
        <div>
          <div className="view-title">Favorites</div>
          <div className="view-sub">{favTracks.length} tracks</div>
        </div>
        <div className="btns">
          <button className="btn btn-primary" onClick={playAll}>
            ▶ Play all
          </button>
          <button className="btn btn-ghost" onClick={shufflePlay}>
            Shuffle
          </button>
        </div>
      </div>

      {favTracks.length === 0 ? (
        <div className="empty">
          <div className="ico">♡</div>
          <div className="t1">No favorites yet</div>
          <div className="t2">Click the heart on any track to add it.</div>
        </div>
      ) : (
        <div className="tracklist">
          {favTracks.map((track, i) => (
            <TrackRow
              key={trackKey(track) + i}
              track={track}
              index={i}
              nowKey={nowKey}
              onPlay={playOne}
            />
          ))}
        </div>
      )}
    </div>
  );
}