import { useEffect, useRef, useState } from "react";

import { useApp } from "../store";
import { TrackRow } from "../components/TrackRow";
import { trackKey, artistLabel } from "../lib/utils";
import type { TrackRef } from "../api/types";
import * as api from "../api/commands";

type SortMode = "custom" | "title" | "artist" | "added";
type SortDir = "asc" | "desc";

export function Favorites() {
  const { state, playTracks, showToast, navigateTo, refresh } = useApp();
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
        `Downloaded: ${res.downloaded} · skipped: ${res.skipped} · failed: ${res.failed}`,
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
    { mode: "custom", label: "Custom order" },
    { mode: "title", label: "Title" },
    { mode: "artist", label: "Artist" },
    { mode: "added", label: "Date added" },
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
          <button
            className="btn btn-outline"
            onClick={downloadAll}
            disabled={downloading}
            title="Скачать все треки в кэш"
          >
            {downloading ? "..." : "⤓ Cache"}
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
        <>
          <div className="chips" style={{ marginBottom: 14 }}>
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
              >
                {opt.label}
                {sort === opt.mode && opt.mode !== "custom" && (dir === "asc" ? " ↑" : " ↓")}
              </button>
            ))}
          </div>
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
        </>
      )}
    </div>
  );
}