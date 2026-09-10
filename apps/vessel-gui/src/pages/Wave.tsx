import { useEffect, useState } from "react";

import { useApp } from "../store";
import { TrackRow } from "../components/TrackRow";
import { PlaylistCover } from "../components/PlaylistCover";
import { trackKey, formatDuration, artistLabel } from "../lib/utils";
import { t } from "../i18n";
import type { TrackRef } from "../api/types";
import * as api from "../api/commands";

type SortMode = "custom" | "title" | "artist";
type SortDir = "asc" | "desc";

export function WavePage() {
  const { state, playTracks, showToast, refresh, navigateTo, goBack, lang, waveTracks, setWaveTracks } = useApp();
  const [sourcePicker, setSourcePicker] = useState(false);
  const [playlistPicker, setPlaylistPicker] = useState(false);
  const [building, setBuilding] = useState(false);
  const [providers, setProviders] = useState<string>("all");
  const [sort, setSort] = useState<SortMode>("custom");
  const [dir, setDir] = useState<SortDir>("desc");

  useEffect(() => {
    void api.getWaveProviders().then(setProviders).catch(() => {});
  }, []);

  if (!state) return null;

  const nowKey = state.now_playing ? trackKey(state.now_playing) : null;

  const buildWave = async (source: "favorites" | "playlists", playlistId: string | null) => {
    if (building) return;
    setBuilding(true);
    try {
      const tracks = await api.getWaveRecommendations(source, 50, playlistId, providers);
      setWaveTracks(tracks);
      if (tracks.length > 0) {
        await api.playTracks(tracks, 0);
      } else {
        showToast(t(lang, "wave.empty1"), true);
      }
      await refresh();
    } catch (error) {
      showToast(String(error), true);
    } finally {
      setBuilding(false);
      setPlaylistPicker(false);
    }
  };

  const playOne = (track: TrackRef) => {
    const idx = waveTracks.findIndex((t) => trackKey(t) === trackKey(track));
    void playTracks(waveTracks, idx < 0 ? 0 : idx);
  };

  const playAll = () => {
    if (waveTracks.length === 0) return;
    void playTracks(waveTracks, 0);
  };

  const openBuild = () => setSourcePicker(true);

  const chooseSource = async (source: "favorites" | "playlists") => {
    setSourcePicker(false);
    if (source === "favorites") {
      await buildWave("favorites", null);
    } else {
      setPlaylistPicker(true);
    }
  };

  const totalMs = waveTracks.reduce((sum, t) => sum + (t.duration_ms ?? 0), 0);

  const sortTracks = (tracks: TrackRef[]): TrackRef[] => {
    if (sort === "custom") return tracks;
    const arr = [...tracks];
    const mult = dir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sort) {
        case "title":
          return a.title.localeCompare(b.title) * mult;
        case "artist":
          return artistLabel(a.artists).localeCompare(artistLabel(b.artists)) * mult;
        default:
          return 0;
      }
    });
    return arr;
  };

  const visible = sortTracks(waveTracks);

  const sortOptions: { mode: SortMode; label: string }[] = [
    { mode: "custom", label: t(lang, "playlist.customOrder") },
    { mode: "title", label: t(lang, "playlist.titleSort") },
    { mode: "artist", label: t(lang, "playlist.artistSort") },
  ];

  const toggleSort = (mode: SortMode) => {
    if (sort === mode) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(mode);
      setDir("desc");
    }
  };

  return (
    <div className="view">
      <div style={{ marginBottom: 18 }}>
        <button className="btn btn-outline btn-sm" onClick={goBack} title={t(lang, "common.back")}>
          {t(lang, "common.back")}
        </button>
      </div>

      <div className="panel">
        <div className="playlist-hd" style={{ padding: "16px 20px" }}>
          <PlaylistCover tracks={waveTracks} coverUrl={null} size={148} />
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 6, minWidth: 0 }}>
            <span className="kicker">{t(lang, "wave.title")}</span>
            <div className="big-title" style={{ maxWidth: 600, wordBreak: "break-word" }}>
              {t(lang, "wave.title")}
            </div>
            <div className="meta-line">
              <span>{waveTracks.length} {t(lang, "common.tracks")}</span>
              <span className="meta-sep">·</span>
              <span>{formatDuration(totalMs)}</span>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              {waveTracks.length > 0 ? (
                <>
                  <button className="btn btn-primary btn-sm" onClick={playAll}>
                    ▶ {t(lang, "common.play")}
                  </button>
                  <button className="btn btn-ghost btn-sm" onClick={openBuild} disabled={building}>
                    {t(lang, "wave.refresh")}
                  </button>
                </>
              ) : (
                <button className="btn btn-primary btn-sm" onClick={openBuild} disabled={building}>
                  {building ? "…" : t(lang, "wave.refresh")}
                </button>
              )}
            </div>
          </div>
        </div>

        {waveTracks.length > 0 && (
          <div className="playlist-bar" style={{ padding: "12px 24px", gap: 12 }}>
            <div className="chips">
              {sortOptions.map((opt) => (
                <button
                  key={opt.mode}
                  className="chip"
                  style={
                    sort === opt.mode
                      ? { borderColor: "var(--border3)", color: "var(--text)" }
                      : undefined
                  }
                  onClick={() => toggleSort(opt.mode)}
                  title={sort === opt.mode && opt.mode !== "custom" ? (dir === "asc" ? t(lang, "playlist.ascending") : t(lang, "playlist.descending")) : undefined}
                >
                  {opt.label}
                  {sort === opt.mode && opt.mode !== "custom" && (dir === "asc" ? " ↑" : " ↓")}
                </button>
              ))}
            </div>
          </div>
        )}

        <div style={{ padding: "12px 8px" }}>
          {waveTracks.length === 0 ? (
            <div className="empty">
              <div className="ico">≈</div>
              <div className="t1">{t(lang, "wave.emptyTrack")}</div>
            </div>
          ) : (
            <div className="tracklist">
              {visible.map((track, i) => (
                <TrackRow
                  key={`${track.provider}:${track.id}`}
                  track={track}
                  index={i}
                  nowKey={nowKey}
                  onPlay={playOne}
                  onArtistClick={(name, provider) => navigateTo("artist", { artist: name, provider })}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {sourcePicker && (
        <div className="ov show" onClick={() => setSourcePicker(false)}>
          <div
            className="ov-card"
            style={{ width: 360, height: "auto", maxHeight: "auto", padding: 24, gap: 12 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sett-title" style={{ fontSize: 17 }}>
              {t(lang, "wave.sourceTitle")}
            </div>
            <div className="set-desc">{t(lang, "wave.sourceSub")}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              <button className="btn btn-primary" onClick={() => chooseSource("favorites")} disabled={building}>
                {t(lang, "nav.favorites")}
              </button>
              <button className="btn btn-outline" onClick={() => chooseSource("playlists")} disabled={building}>
                {t(lang, "nav.playlists")}
              </button>
            </div>
          </div>
        </div>
      )}

      {playlistPicker && (
        <div className="ov show" onClick={() => setPlaylistPicker(false)}>
          <div
            className="ov-card"
            style={{ width: 420, height: "auto", maxHeight: "70vh", padding: 24, gap: 12 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sett-title" style={{ fontSize: 17 }}>
              {t(lang, "wave.choosePlaylist")}
            </div>
            <div className="set-desc">{t(lang, "wave.choosePlaylistSub")}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, overflowY: "auto" }}>
              {state?.playlists.map((p) => (
                <button
                  key={p.id}
                  className="btn btn-outline"
                  style={{ justifyContent: "flex-start", textAlign: "left", height: "auto", padding: "10px 14px" }}
                  onClick={() => buildWave("playlists", p.id)}
                  disabled={building}
                >
                  <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {p.title}
                  </span>
                  <span style={{ color: "var(--text3)", fontSize: 12, flexShrink: 0 }}>
                    {p.tracks.length}
                  </span>
                </button>
              ))}
              {state && state.playlists.length === 0 && (
                <div className="set-desc" style={{ padding: 12, textAlign: "center" }}>
                  {t(lang, "playlists.empty1")}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}