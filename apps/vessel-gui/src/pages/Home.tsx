import { useState } from "react";
import { useApp } from "../store";
import { useCustomization, EditableBlock, useBlockWidth, ALL_HOME_BLOCKS } from "../customization";
import { TrackRow } from "../components/TrackRow";
import { WaveSection } from "../components/WaveSection";
import { trackKey, dedupe, filterValidArtists } from "../lib/utils";
import { t } from "../i18n";
import type { TrackRef } from "../api/types";
import { Artwork } from "../components/Artwork";
import { PlaylistCover } from "../components/PlaylistCover";
import * as api from "../api/commands";

function RecentBlockContent({
  recent,
  recentCardWidth,
  isEditMode,
  nowKey,
  isLive,
  playRecent,
  navigateTo,
  lang,
}: {
  recent: TrackRef[];
  recentCardWidth: number;
  isEditMode: boolean;
  nowKey: string | null;
  isLive: boolean;
  playRecent: (track: TrackRef) => void;
  navigateTo: (view: any, params?: any) => void;
  lang: any;
}) {
  const width = useBlockWidth();
  const isMini = width === "third" || width === "half";

  if (isMini) {
    const count = width === "third" ? 2 : 3;
    return (
      <div className="section">
        <div className="sec-head">
          <span className="sec-title">{t(lang, "home.continue")}</span>
          <span className="sec-link" onClick={() => !isEditMode && navigateTo("recent")}>
            {t(lang, "home.seeAll")}
          </span>
        </div>
        <div className="recent-mini-container">
          {recent.slice(0, count).map((track, i) => (
            <div
              key={trackKey(track) + i}
              className="recent-mini-item"
              onClick={() => playRecent(track)}
            >
              <Artwork
                url={track.artwork_url}
                alt={track.title}
                seed={i}
                className="recent-mini-art"
              />
              <div className="recent-mini-meta">
                <span className="recent-mini-title">{track.title}</span>
                <span className="recent-mini-artist">
                  {filterValidArtists(track.artists).join(", ")}
                </span>
              </div>
              <button
                type="button"
                className="recent-mini-play"
                onClick={(e) => {
                  e.stopPropagation();
                  playRecent(track);
                }}
                title={trackKey(track) === nowKey && isLive ? "Пауза" : "Играть"}
              >
                {trackKey(track) === nowKey && isLive ? "⏸" : "▶"}
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const visibleRecent = width === "two-thirds" ? recent.slice(0, 4) : recent;
  return (
    <div className="section">
      <div className="sec-head">
        <span className="sec-title">{t(lang, "home.continue")}</span>
        <span className="sec-link" onClick={() => !isEditMode && navigateTo("recent")}>
          {t(lang, "home.seeAll")}
        </span>
      </div>
      <div className="row-scroll">
        {visibleRecent.map((track, i) => (
          <div
            key={trackKey(track) + i}
            className="card"
            style={{ width: recentCardWidth, position: "relative" }}
            onClick={() => playRecent(track)}
          >
            {isEditMode && (
              <div className="card-edit-badge" title="Настройка элемента">
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
              {filterValidArtists(track.artists).map((artist, idx, arr) => (
                <span
                  key={`${artist}-${idx}`}
                  style={{ cursor: "pointer" }}
                  onClick={(e) => {
                    if (isEditMode) return;
                    e.stopPropagation();
                    navigateTo("artist", { artist, provider: track.provider });
                  }}
                >
                  {artist}
                  {idx < arr.length - 1 ? ", " : ""}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PlaylistsBlockContent({
  playlists,
  plCardWidth,
  isEditMode,
  isPlayingPlaylist,
  playPlaylist,
  navigateTo,
  lang,
}: {
  playlists: any[];
  plCardWidth: number;
  isEditMode: boolean;
  isPlayingPlaylist: (tracks: TrackRef[]) => boolean;
  playPlaylist: (id: string) => Promise<void>;
  navigateTo: (view: any, params?: any) => void;
  lang: any;
}) {
  const width = useBlockWidth();
  const isMini = width === "third" || width === "half";

  if (isMini) {
    const count = width === "third" ? 2 : 3;
    return (
      <div className="section">
        <div className="sec-head">
          <span className="sec-title">{t(lang, "home.yourPlaylists")}</span>
          <span className="sec-link" onClick={() => !isEditMode && navigateTo("playlists")}>
            {t(lang, "home.seeAll")}
          </span>
        </div>
        <div className="playlists-mini-container">
          {playlists.slice(0, count).map((p) => (
            <div
              key={p.id}
              className="playlist-mini-item"
              onClick={() => !isEditMode && navigateTo("playlist", { playlistId: p.id })}
            >
              <div className="playlist-mini-art">
                <PlaylistCover tracks={p.tracks} coverUrl={p.cover_url} border={false} />
              </div>
              <div className="playlist-mini-meta">
                <span className="playlist-mini-title">{p.title}</span>
                <span className="playlist-mini-count">
                  {p.tracks.length} {t(lang, "common.tracks")}
                </span>
              </div>
              <button
                type="button"
                className="playlist-mini-play"
                onClick={(e) => {
                  e.stopPropagation();
                  void playPlaylist(p.id);
                }}
                title={isPlayingPlaylist(p.tracks) ? "Пауза" : "Играть"}
              >
                {isPlayingPlaylist(p.tracks) ? "❚❚" : "▶"}
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const visiblePlaylists = width === "two-thirds" ? playlists.slice(0, 4) : playlists;
  return (
    <div className="section">
      <div className="sec-head">
        <span className="sec-title">{t(lang, "home.yourPlaylists")}</span>
        <span className="sec-link" onClick={() => !isEditMode && navigateTo("playlists")}>
          {t(lang, "home.seeAll")}
        </span>
      </div>
      <div className="row-scroll">
        {visiblePlaylists.map((p) => (
          <div
            key={p.id}
            className="card"
            style={{ width: plCardWidth, position: "relative" }}
            onClick={() => !isEditMode && navigateTo("playlist", { playlistId: p.id })}
          >
            {isEditMode && (
              <div className="card-edit-badge" title="Настройка элемента">
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
                {isPlayingPlaylist(p.tracks) ? "❚❚" : "▶"}
              </button>
            </div>
            <div className="card-t">{p.title}</div>
            <div className="card-s">{p.tracks.length} {t(lang, "common.tracks")}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LibraryBlockContent({
  library,
  isEditMode,
  nowKey,
  playOne,
  navigateTo,
  lang,
}: {
  library: TrackRef[];
  isEditMode: boolean;
  nowKey: string | null;
  playOne: (track: TrackRef) => void;
  navigateTo: (view: any, params?: any) => void;
  lang: any;
}) {
  const width = useBlockWidth();
  const isMini = width === "third" || width === "half";
  const visibleTracks = isMini ? library.slice(0, 4) : library;

  return (
    <div className="section">
      <div className="sec-head">
        <span className="sec-title">{t(lang, "home.fromLibrary")}</span>
        <span className="sec-link" onClick={() => !isEditMode && navigateTo("favorites")}>
          {t(lang, "home.seeAll")}
        </span>
      </div>
      <div className="panel home-tracklist-panel" style={{ padding: isMini ? "8px 6px" : "12px 8px" }}>
        <div className={`tracklist home-tracklist ${isMini ? "mini-tracklist" : ""}`}>
          {visibleTracks.map((track, i) => (
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
  );
}

export function Home() {
  const { state, playTracks, navigateTo, showToast, lang } = useApp();
  const { config, isEditMode, addBlock } = useCustomization();
  const [isAddDropdownOpen, setIsAddDropdownOpen] = useState(false);

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

  const recentCols = config.home?.gridColumns?.["recent"] || 4;
  const recentCardWidth = Math.max(130, Math.min(260, Math.round(760 / recentCols)));

  const plCols = config.home?.gridColumns?.["playlists"] || 3;
  const plCardWidth = Math.max(140, Math.min(280, Math.round(760 / plCols)));

  const activeBlockIds = config.home?.blockOrder || ["header", "wave", "recent", "playlists", "library"];
  const deletedBlocks = ALL_HOME_BLOCKS.filter((b) => !activeBlockIds.includes(b.id));

  const renderSection = (blockId: string) => {
    switch (blockId) {
      case "wave":
        return (
          <EditableBlock key="wave" id="wave" title="Моя волна" allowMove={true}>
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
            <RecentBlockContent
              recent={recent}
              recentCardWidth={recentCardWidth}
              isEditMode={isEditMode}
              nowKey={nowKey}
              isLive={isLive}
              playRecent={playRecent}
              navigateTo={navigateTo}
              lang={lang}
            />
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
            <PlaylistsBlockContent
              playlists={playlists}
              plCardWidth={plCardWidth}
              isEditMode={isEditMode}
              isPlayingPlaylist={isPlayingPlaylist}
              playPlaylist={playPlaylist}
              navigateTo={navigateTo}
              lang={lang}
            />
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
            <LibraryBlockContent
              library={library}
              isEditMode={isEditMode}
              nowKey={nowKey}
              playOne={playOne}
              navigateTo={navigateTo}
              lang={lang}
            />
          </EditableBlock>
        );

      case "header":
        return (
          <EditableBlock
            key="header"
            id="header"
            title="Приветствие и заголовок"
            allowMove={true}
          >
            <div className="view-hd">
              <div>
                <div className="view-title">{t(lang, "home.title")}</div>
                <div className="view-sub">{t(lang, "home.sub")}</div>
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
      <div className="home-modular-grid">
        {activeBlockIds.map((blockId) => renderSection(blockId))}
      </div>

      {isEditMode && (
        <div className="home-add-block-container">
          <button
            type="button"
            className="btn-add-home-block"
            onClick={() => setIsAddDropdownOpen((prev) => !prev)}
          >
            <span style={{ fontSize: 16 }}>+</span>
            <span>Добавить блок</span>
          </button>
          {isAddDropdownOpen && (
            <div className="add-block-dropdown">
              {deletedBlocks.length === 0 ? (
                <div style={{ padding: "8px 12px", color: "var(--text3)", fontSize: 12 }}>
                  Все блоки уже добавлены на страницу
                </div>
              ) : (
                deletedBlocks.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    className="add-block-item"
                    onClick={() => {
                      addBlock(b.id);
                      setIsAddDropdownOpen(false);
                    }}
                  >
                    <span>{b.title}</span>
                    <span style={{ color: "var(--accent)", fontSize: 16 }}>+</span>
                  </button>
                ))
              )}
            </div>
          )}
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
