import { useEffect, useRef, useState } from "react";

import { useApp } from "../store";
import { TrackRow } from "../components/TrackRow";
import { trackKey, artistLabel, formatDuration } from "../lib/utils";
import { t } from "../i18n";
import type { TrackRef } from "../api/types";
import * as api from "../api/commands";

type SortMode = "custom" | "title" | "artist" | "added";
type SortDir = "asc" | "desc";

export function Favorites() {
  const { state, playTracks, showToast, navigateTo, refresh, goBack, lang } = useApp();
  const dragRef = useRef<{ from: number } | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [sort, setSort] = useState<SortMode>("custom");
  const [dir, setDir] = useState<SortDir>("desc");
  const [likedTimes, setLikedTimes] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    void (async () => {
      try {
        const times = await api.getLibraryTimes();
        setLikedTimes(new Map(times.map((t) => [t.key, t.timestamp_ms])));
      } catch {
        // сортировка по дате просто не сработает
      }
    })();
  }, [refresh]);

  if (!state) return null;

  const nowKey = state.now_playing ? trackKey(state.now_playing) : null;
  const favTracks = state.library;

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
        case "added":
          return (
            ((likedTimes.get(trackKey(b)) ?? 0) - (likedTimes.get(trackKey(a)) ?? 0)) * mult
          );
        default:
          return 0;
      }
    });
    return arr;
  };

  const visible = sortTracks(favTracks);

  const playOne = (track: TrackRef) => {
    const idx = visible.findIndex((t) => trackKey(t) === trackKey(track));
    void playTracks(visible, idx < 0 ? 0 : idx);
  };

  const playAll = async () => {
    if (visible.length === 0) return;
    try {
      await api.playTracks(visible, 0);
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

  const [downloading, setDownloading] = useState(false);

  const downloadAll = async () => {
    if (favTracks.length === 0) return;
    setDownloading(true);
    try {
      const res = await api.downloadAllToCache(favTracks);
      await refresh();
      showToast(
        `${t(lang, "favorites.cache")}: ${res.downloaded} · skipped: ${res.skipped} · failed: ${res.failed}`,
      );
    } catch (error) {
      showToast(String(error), true);
    } finally {
      setDownloading(false);
    }
  };

  const reorder = async (from: number, to: number) => {
    try {
      await api.reorderLibrary(from, to);
      await refresh();
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const onRowMouseDown = (e: React.MouseEvent, i: number) => {
    if (e.button !== 0) return;
    if (sort !== "custom") return;
    dragRef.current = { from: i };
    setDragOver(i);
  };

  const onRowMouseEnter = (i: number) => {
    if (dragRef.current && dragOver !== i) setDragOver(i);
  };

  const onRowMouseUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag && dragOver != null && drag.from !== dragOver) {
      void reorder(drag.from, dragOver);
    }
    setDragOver(null);
  };

  const sortOptions: { mode: SortMode; label: string }[] = [
    { mode: "custom", label: t(lang, "playlist.customOrder") },
    { mode: "title", label: t(lang, "playlist.titleSort") },
    { mode: "artist", label: t(lang, "playlist.artistSort") },
    { mode: "added", label: t(lang, "playlist.dateAdded") },
  ];

  const toggleSort = (mode: SortMode) => {
    if (sort === mode) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(mode);
      setDir("desc");
    }
  };

  const totalMs = favTracks.reduce((sum, t) => sum + (t.duration_ms ?? 0), 0);

  return (
    <div className="view">
      <div style={{ marginBottom: 18 }}>
        <button className="btn btn-outline btn-sm" onClick={goBack} title={t(lang, "common.back")}>
          {t(lang, "common.back")}
        </button>
      </div>

      <div className="panel">
        <div className="playlist-hd">
          <div className="fav-cover" title={t(lang, "favorites.title")}>
            <svg width="60" height="60" viewBox="0 0 24 24" fill="#ffffff">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          </div>
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 8, minWidth: 0 }}>
            <span className="kicker">{t(lang, "nav.favorites")}</span>
            <div className="big-title" style={{ maxWidth: 600, wordBreak: "break-word" }}>
              {t(lang, "favorites.title")}
            </div>
            <div className="meta-line">
              <span>{favTracks.length} {t(lang, "common.tracks")}</span>
              {totalMs > 0 && (
                <>
                  <span className="meta-sep">·</span>
                  <span>{formatDuration(totalMs)}</span>
                </>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={playAll}>
                ▶ {t(lang, "playlist.play")}
              </button>
              <button className="btn btn-ghost btn-sm" onClick={shufflePlay}>
                {t(lang, "favorites.shuffle")}
              </button>
              <button
                className="btn btn-outline btn-sm"
                onClick={downloadAll}
                disabled={downloading}
                title={t(lang, "favorites.cacheTitle")}
              >
                {downloading ? "..." : t(lang, "favorites.cache")}
              </button>
            </div>
          </div>
        </div>

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
          <span style={{ color: "var(--text3)", fontSize: 12 }}>
            {t(lang, "playlist.reorderHint")}
          </span>
        </div>

        <div style={{ padding: "12px 8px" }}>
          {favTracks.length === 0 ? (
            <div className="empty">
              <div className="ico">♡</div>
              <div className="t1">{t(lang, "favorites.empty1")}</div>
              <div className="t2">{t(lang, "favorites.empty2")}</div>
            </div>
          ) : (
            <div className="tracklist" onMouseUp={onRowMouseUp} onMouseLeave={() => setDragOver(null)}>
              {visible.map((track, i) => (
                <div
                  key={trackKey(track) + i}
                  onMouseDown={(e) => onRowMouseDown(e, i)}
                  onMouseEnter={() => onRowMouseEnter(i)}
                  style={{
                    cursor: "grab",
                    userSelect: "none",
                    ...(dragOver === i && dragRef.current
                      ? { boxShadow: "inset 0 2px 0 0 var(--text)" }
                      : {}),
                  }}
                >
                  <TrackRow
                    track={track}
                    index={i}
                    nowKey={nowKey}
                    onPlay={playOne}
                    onArtistClick={(name, provider) => navigateTo("artist", { artist: name, provider })}
                  />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}