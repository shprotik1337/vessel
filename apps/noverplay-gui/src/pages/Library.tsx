import { useApp } from "../store";
import { TrackRow } from "../components/TrackRow";
import { trackKey } from "../lib/utils";
import type { TrackRef } from "../api/types";
import * as api from "../api/commands";

export function Library() {
  const { state, playTracks, showToast } = useApp();
  if (!state) return null;

  const nowKey = state.now_playing ? trackKey(state.now_playing) : null;

  const playOne = (track: TrackRef) => {
    void playTracks([track], 0);
  };

  const playAll = async () => {
    try {
      await api.playTracks(state.library, 0);
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const shufflePlay = async () => {
    const tracks = [...state.library].sort(() => Math.random() - 0.5);
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
          <div className="view-title">Library</div>
          <div className="view-sub">{state.library.length} tracks</div>
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

      {state.library.length === 0 ? (
        <div className="empty">
          <div className="ico">♡</div>
          <div className="t1">Your library is empty</div>
          <div className="t2">Favorite tracks to add them here.</div>
        </div>
      ) : (
        <div className="tracklist">
          <div className="thead">
            <span style={{ width: 16 }} className="th">
              #
            </span>
            <span style={{ width: 32 }} />
            <span className="th">Title</span>
            <span className="th" />
            <span style={{ width: 96 }} className="th">
              Source
            </span>
            <span className="th" />
            <span style={{ width: 44, textAlign: "right" }} className="th">
              Time
            </span>
          </div>
          {state.library.map((track, i) => (
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