import { useApp } from "../store";
import { TrackRow } from "../components/TrackRow";
import { WaveSection } from "../components/WaveSection";
import { trackKey, dedupe, filterValidArtists } from "../lib/utils";
import { t } from "../i18n";
import type { TrackRef } from "../api/types";
import { Artwork } from "../components/Artwork";
import { PlaylistCover } from "../components/PlaylistCover";
import * as api from "../api/commands";

export function Home() {
  const { state, playTracks, navigateTo, showToast, lang } = useApp();
  if (!state) return null;

  const recent = dedupe(state.history.map((h) => h.track)).slice(0, 8);
  const playlists = state.playlists.slice(0, 9);
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

  return (
    <div className="view">
      <div className="view-hd">
        <div>
          <div className="view-title">{t(lang, "home.title")}</div>
          <div className="view-sub">{t(lang, "home.sub")}</div>
        </div>
      </div>

      <WaveSection />

      {recent.length > 0 && (
        <div className="section">
          <div className="sec-head">
            <span className="sec-title">{t(lang, "home.continue")}</span>
            <span className="sec-link" onClick={() => navigateTo("recent")}>
              {t(lang, "home.seeAll")}
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
                <div className="card-s">
                  {filterValidArtists(track.artists).map((artist, i, arr) => (
                    <span
                      key={`${artist}-${i}`}
                      style={{ cursor: "pointer" }}
                      onClick={(e) => {
                        e.stopPropagation();
                        navigateTo("artist", { artist, provider: track.provider });
                      }}
                    >
                      {artist}
                      {i < arr.length - 1 ? ", " : ""}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {playlists.length > 0 && (
        <div className="section">
          <div className="sec-head">
            <span className="sec-title">{t(lang, "home.yourPlaylists")}</span>
            <span className="sec-link" onClick={() => navigateTo("playlists")}>
              {t(lang, "home.seeAll")}
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
                    title={t(lang, "common.play")}
                    onClick={(e) => {
                      e.stopPropagation();
                      void playPlaylist(p.id);
                    }}
                  >
                    {isPlayingPlaylist(p.tracks) ? "❚❚" : "▶"}
                  </button>
                </div>
                <div className="card-t">{p.title}</div>
                <div className="card-s">{p.tracks.length} {t(lang, "common.tracks")}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {library.length > 0 && (
        <div className="section">
          <div className="sec-head">
            <span className="sec-title">{t(lang, "home.fromLibrary")}</span>
            <span className="sec-link" onClick={() => navigateTo("favorites")}>
              {t(lang, "home.seeAll")}
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
          <div className="t1">{t(lang, "home.empty1")}</div>
          <div className="t2">{t(lang, "home.empty2")}</div>
        </div>
      )}
    </div>
  );
}