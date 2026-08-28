import { useApp } from "../store";
import { TrackRow } from "../components/TrackRow";
import { artistLabel, trackKey } from "../lib/utils";
import type { TrackRef } from "../api/types";
import { Artwork, tone } from "../components/Artwork";
import * as api from "../api/commands";

export function Home() {
  const { state, playTracks, navigateTo, showToast } = useApp();
  if (!state) return null;

  const recent = state.history.slice(0, 5);
  const playlists = state.playlists.slice(0, 5);
  const library = state.library.slice(0, 10);

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

  return (
    <div className="view">
      <div className="view-hd">
        <div>
          <div className="view-title">Good evening</div>
          <div className="view-sub">Music from SoundCloud, Yandex and Deezer, together.</div>
        </div>
        <div className="btns">
          <button className="btn btn-primary" onClick={playAll}>
            ▶ Play all
          </button>
        </div>
      </div>

      {recent.length > 0 && (
        <div className="section">
          <div className="sec-head">
            <span className="sec-title">Continue Listening</span>
            <span className="sec-link" onClick={() => navigateTo("recent")}>
              See all
            </span>
          </div>
          <div className="row-scroll">
            {recent.map((entry, i) => (
              <div
                key={trackKey(entry.track) + i}
                className="card"
                style={{ width: 190 }}
                onClick={() => playOne(entry.track)}
              >
                <Artwork url={entry.track.artwork_url} alt={entry.track.title} seed={i} className="card-art" />
                <div className="card-t">{entry.track.title}</div>
                <div className="card-s">{artistLabel(entry.track.artists)}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {playlists.length > 0 && (
        <div className="section">
          <div className="sec-head">
            <span className="sec-title">Your Playlists</span>
            <span className="sec-link" onClick={() => navigateTo("playlists")}>
              See all
            </span>
          </div>
          <div className="row-scroll">
            {playlists.map((p, i) => (
              <div
                key={p.id}
                className="card"
                onClick={() => navigateTo("playlist", { playlistId: p.id })}
              >
                <div className="card-art" style={{ background: tone(i) }} />
                <div className="card-t">{p.title}</div>
                <div className="card-s">{p.tracks.length} tracks</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {library.length > 0 && (
        <div className="section">
          <div className="sec-head">
            <span className="sec-title">From your Library</span>
            <span className="sec-link" onClick={() => navigateTo("library")}>
              See all
            </span>
          </div>
          <div className="panel" style={{ padding: "12px 8px" }}>
            <div className="tracklist">
              {library.map((track, i) => (
                <TrackRow
                  key={trackKey(track)}
                  track={track}
                  index={i}
                  nowKey={state.now_playing ? trackKey(state.now_playing) : null}
                  onPlay={playOne}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {library.length === 0 && recent.length === 0 && (
        <div className="empty">
          <div className="ico">♫</div>
          <div className="t1">Nothing here yet</div>
          <div className="t2">
            Search for music to play, connect a source in Settings, or add tracks to your
            library.
          </div>
        </div>
      )}
    </div>
  );
}