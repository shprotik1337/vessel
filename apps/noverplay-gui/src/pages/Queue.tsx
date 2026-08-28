import { useApp } from "../store";
import { artistLabel, formatTime, trackKey } from "../lib/utils";
import type { TrackRef } from "../api/types";
import * as api from "../api/commands";

export function Queue() {
  const { state, playTracks, showToast, refresh } = useApp();
  if (!state) return null;

  const playOne = (track: TrackRef) => {
    void playTracks([track], 0);
  };

  const removeAt = async (index: number) => {
    try {
      await api.removeFromQueue(index);
      await refresh();
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const clearAll = async () => {
    try {
      await api.clearQueue();
      await refresh();
      showToast("Queue cleared");
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const queue = state.queue;
  const currentIndex = state.queue_index;

  return (
    <div className="view">
      <div className="view-hd">
        <div>
          <div className="view-title">Queue</div>
          <div className="view-sub">{queue.length} tracks</div>
        </div>
        <div className="btns">
          {queue.length > 0 && (
            <button className="btn btn-ghost" onClick={clearAll}>
              Clear
            </button>
          )}
        </div>
      </div>

      {queue.length === 0 ? (
        <div className="empty">
          <div className="ico">☰</div>
          <div className="t1">Queue is empty</div>
          <div className="t2">Play a track or add one from search results.</div>
        </div>
      ) : (
        <>
          {currentIndex != null && currentIndex < queue.length && (
            <div className="queue-sec">
              <div className="qsec-hd">
                <span className="qsec-title">Now Playing</span>
              </div>
              <div className="qrow now">
                <span className="eq" style={{ display: "flex", alignItems: "flex-end", gap: 1.5, height: 11 }}>
                  <i style={{ width: 2, background: "var(--text)", height: 8 }} />
                  <i style={{ width: 2, background: "var(--text)", height: 11 }} />
                  <i style={{ width: 2, background: "var(--text)", height: 6 }} />
                </span>
                <div className="t-art" style={{ background: "var(--elev)", width: 32, height: 32, borderRadius: 2 }} />
                <div className="c-title">
                  <span className="ttl">{queue[currentIndex].title}</span>
                  <span className="sub">{artistLabel(queue[currentIndex].artists)}</span>
                </div>
                <span className="c-src" style={{ width: "auto", fontSize: 10, textTransform: "uppercase" }}>
                  {queue[currentIndex].provider}
                </span>
                <span className="c-time">{formatTime(queue[currentIndex].duration_ms)}</span>
              </div>
            </div>
          )}

          <div className="queue-sec">
            <div className="qsec-hd">
              <span className="qsec-title">Up Next</span>
              <span className="qsec-title" style={{ fontSize: 12, color: "var(--text3)" }}>
                {queue.length - (currentIndex ?? -1) - 1} tracks
              </span>
            </div>
            {queue
              .map((track, i) => ({ track, i }))
              .filter(({ i }) => i !== currentIndex)
              .map(({ track, i }) => (
                <div
                  key={trackKey(track) + i}
                  className="qrow"
                  onDoubleClick={() => playOne(track)}
                >
                  <span className="qx" onClick={() => removeAt(i)} title="Remove">
                    ✕
                  </span>
                  <div className="t-art" style={{ background: "var(--elev)", width: 32, height: 32, borderRadius: 2 }} />
                  <div className="c-title">
                    <span className="ttl">{track.title}</span>
                    <span className="sub">{artistLabel(track.artists)}</span>
                  </div>
                  <span className="c-src" style={{ width: "auto", fontSize: 10, textTransform: "uppercase" }}>
                    {track.provider}
                  </span>
                  <span className="c-time">{formatTime(track.duration_ms)}</span>
                </div>
              ))}
          </div>
        </>
      )}
    </div>
  );
}