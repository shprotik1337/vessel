import { useApp } from "../store";
import { useCustomization, EditableBlock } from "../customization";
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
  const { config, isEditMode } = useCustomization();
  if (!state) return null;

  const recent = dedupe(state.history.map((h) => h.track)).slice(0, 8);
  const playlists = state.playlists.slice(0, 9);
  const library = state.library.slice(0, 10);

  const playOne = (track: TrackRef) => {
    if (isEditMode) return;
    const ctx = dedupe(library);
    const idx = ctx.findIndex((t) => trackKey(t) === trackKey(track));
    void playTracks(ctx, idx < 0 ? 0 : idx);
  };

  const playRecent = (track: TrackRef) => {
    if (isEditMode) return;
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
    if (isEditMode) return;
    const p = state.playlists.find((x) => x.id === playlistId);
    if (!p || p.tracks.length === 0) return;
    try {
      await playTracks(p.tracks, 0);
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const recentCols = config.home.gridColumns["recent"] || 4;
  const recentCardWidth = Math.max(130, Math.min(260, Math.round(760 / recentCols)));

  const plCols = config.home.gridColumns["playlists"] || 3;
  const plCardWidth = Math.max(140, Math.min(280, Math.round(760 / plCols)));

  const renderSection = (blockId: string) => {
    switch (blockId) {
      case "wave":
        return (
          <EditableBlock key="wave" id="wave" title="??? ?????" allowMove={true}>
            <WaveSection />
          </EditableBlock>
        );

      case "recent":
        if (recent.length === 0 && !isEditMode) return null;
        return (
          <EditableBlock
            key="recent"
            id="recent"
            title={t(lang, "home.continue")}
            allowGridResize={true}
            allowMove={true}
          >
            <div className="section">
              <div className="sec-head">
                <span className="sec-title">{t(lang, "home.continue")}</span>
                <span className="sec-link" onClick={() => !isEditMode && navigateTo("recent")}>
                  {t(lang, "home.seeAll")}
                </span>
              </div>
              <div className="row-scroll">
                {recent.map((track, i) => (
                  <div
                    key={trackKey(track) + i}
                    className="card"
                    style={{ width: recentCardWidth, position: "relative" }}
                    onClick={() => playRecent(track)}
                  >
                    {isEditMode && (
                      <div className="card-edit-badge" title="????????? ????????">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                      </div>
                    )}
                    <Artwork
                      url={track.artwork_url}
                      alt={track.title}
                      seed={i}
                      className="card-art"
                      onPlayClick={async () => {
                        if (isEditMode) return;
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
                            if (isEditMode) return;
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
          </EditableBlock>
        );

      case "playlists":
        if (playlists.length === 0 && !isEditMode) return null;
        return (
          <EditableBlock
            key="playlists"
            id="playlists"
            title={t(lang, "home.yourPlaylists")}
            allowGridResize={true}
            allowMove={true}
          >
            <div className="section">
              <div className="sec-head">
                <span className="sec-title">{t(lang, "home.yourPlaylists")}</span>
                <span className="sec-link" onClick={() => !isEditMode && navigateTo("playlists")}>
                  {t(lang, "home.seeAll")}
                </span>
              </div>
              <div className="row-scroll">
                {playlists.map((p) => (
                  <div
                    key={p.id}
                    className="card"
                    style={{ width: plCardWidth, position: "relative" }}
                    onClick={() => !isEditMode && navigateTo("playlist", { playlistId: p.id })}
                  >
                    {isEditMode && (
                      <div className="card-edit-badge" title="????????? ????????">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M12 20h9" />
                          <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                        </svg>
                      </div>
                    )}
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
                          if (isEditMode) return;
                          e.stopPropagation();
                          void playPlaylist(p.id);
                        }}
                      >
                        {isPlayingPlaylist(p.tracks) ? "??" : "?"}
                      </button>
                    </div>
                    <div className="card-t">{p.title}</div>
                    <div className="card-s">{p.tracks.length} {t(lang, "common.tracks")}</div>
                  </div>
                ))}
              </div>
            </div>
          </EditableBlock>
        );

      case "library":
        if (library.length === 0 && !isEditMode) return null;
        return (
          <EditableBlock
            key="library"
            id="library"
            title={t(lang, "home.fromLibrary")}
            allowGridResize={false}
            allowMove={true}
          >
            <div className="section">
              <div className="sec-head">
                <span className="sec-title">{t(lang, "home.fromLibrary")}</span>
                <span className="sec-link" onClick={() => !isEditMode && navigateTo("favorites")}>
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
                      onArtistClick={(name, provider) => !isEditMode && navigateTo("artist", { artist: name, provider })}
                    />
                  ))}
                </div>
              </div>
            </div>
          </EditableBlock>
        );

      default:
        return null;
    }
  };

  return (
    <div className="view">
      <EditableBlock id="header" title="????? ????????" allowMove={false}>
        <div className="view-hd">
          <div>
            <div className="view-title">{t(lang, "home.title")}</div>
            <div className="view-sub">{t(lang, "home.sub")}</div>
          </div>
        </div>
      </EditableBlock>

      {config.home.blockOrder.map((blockId) => renderSection(blockId))}

      {library.length === 0 && recent.length === 0 && (
        <div className="empty">
          <div className="ico">?</div>
          <div className="t1">{t(lang, "home.empty1")}</div>
          <div className="t2">{t(lang, "home.empty2")}</div>
        </div>
      )}
    </div>
  );
}
