import { useApp } from "../store";
import { TrackRow } from "../components/TrackRow";
import { artistLabel, trackKey, dedupe } from "../lib/utils";
import type { TrackRef } from "../api/types";
import { Artwork } from "../components/Artwork";
import { PlaylistCover } from "../components/PlaylistCover";
import * as api from "../api/commands";

export function Home() {
  const { state, playTracks, navigateTo, showToast } = useApp();
  if (!state) return null;

  const recent = dedupe(state.history.map((h) => h.track)).slice(0, 5);
  const playlists = state.playlists.slice(0, 5);
  const library = state.library.slice(0, 10);

  const playOne = (track: TrackRef) => {
    const ctx = dedupe(library);
    const idx = ctx.findIndex((t) => trackKey(t) === trackKey(track));
    void playTracks(ctx, idx < 0 ? 0 : idx);
  };

  const playRecent = (track: TrackRef) => {
    const ctx = dedupe(state.history.map((h) => h.track));
    const idx = ctx.findIndex((t) => trackKey(t) === trackKey(track));
    void playTracks(ctx, idx < 0 ? 0 : idx);
  };

  const nowKey = state.now_playing ? trackKey(state.now_playing) : null;
  const isLive =
    state?.player.status === "playing" || state?.player.status === "buffering";

  const isPlayingPlaylist = (tracks: TrackRef[]) => {
    if (!state.now_playing || !isLive) return false;
    return tracks.some((t) => trackKey(t) === trackKey(state.now_playing!));
  };

  const playPlaylist = async (playlistId: string) => {
    const p = state.playlists.find((x) => x.id === playlistId);
    if (!p || p.tracks.length === 0) return;
    try {
      await playTracks(p.tracks, 0);
    } catch (error) {
      showToast(String(error), true);
    }
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
          <div className="view-sub">Music from SoundCloud, Yandex, Deezer and Spotify, together.</div>
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
            {recent.map((track, i) => (
              <div
                key={trackKey(track) + i}
                className="card"
                style={{ width: 190 }}
                onClick={() => playRecent(track)}
              >
                                <Artwork
                  url={track.artwork_url}
                  alt={track.title}
                  seed={i}
                  className="card-art"
                  onPlayClick={async () => {
                    if (trackKey(track) === nowKey && isLive) {
                      try { await api.togglePlayback(); } catch {}
                    } else {
                      playRecent(track);
                    }
                  }}
                  isPlaying={trackKey(track) === nowKey && isLive}
                />
                <div className="card-t">{track.title}</div>
                <div
                  className="card-s"
                  style={{ cursor: track.artists[0] ? "pointer" : undefined }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (track.artists[0]) navigateTo("artist", { artist: track.artists[0], provider: track.provider });
                  }}
                >
                  {artistLabel(track.artists)}
                </div>
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
            {playlists.map((p) => (
              <div
                key={p.id}
                className="card"
                onClick={() => navigateTo("playlist", { playlistId: p.id })}
              >
                <div className="card-art">
                  <PlaylistCover
                    tracks={p.tracks}
                    coverUrl={p.cover_url}
                    border={false}
                  />
                  <button
                    className="card-play"
                    title="Играть"
                    onClick={(e) => {
                      e.stopPropagation();
                      void playPlaylist(p.id);
                    }}
                  >
                    {isPlayingPlaylist(p.tracks) ? "❚❚" : "▶"}
                  </button>
                </div>
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
                key={trackKey(track) + i}
                track={track}
                index={i}
                nowKey={nowKey}
                onPlay={playOne}
                onArtistClick={(name, provider) => navigateTo("artist", { artist: name, provider })}
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