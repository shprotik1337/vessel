import { useState, useRef, useEffect } from "react";

import { useApp } from "../store";
import { TrackRow } from "../components/TrackRow";
import { PlaylistCover } from "../components/PlaylistCover";
import { trackKey, formatDuration, artistLabel } from "../lib/utils";
import type { TrackRef } from "../api/types";
import * as api from "../api/commands";

interface PlaylistDetailProps {
  playlistId: string;
}

type SortMode = "custom" | "title" | "artist" | "added";
type SortDir = "asc" | "desc";

export function PlaylistDetail({ playlistId }: PlaylistDetailProps) {
  const { state, playTracks, showToast, refresh, navigateTo, goBack } = useApp();
  const [sort, setSort] = useState<SortMode>("custom");
  const [dir, setDir] = useState<SortDir>("desc");
  const [addedTimes, setAddedTimes] = useState<Map<string, number>>(new Map());
  const dragRef = useRef<{ from: number } | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        const times = await api.getPlaylistTrackTimes(playlistId);
        setAddedTimes(new Map(times.map((t) => [t.key, t.timestamp_ms])));
      } catch {
        // сортировка по дате просто не сработает
      }
    })();
  }, [playlistId, refresh]);

  if (!state) return null;

  const playlist = state.playlists.find((p) => p.id === playlistId);
  if (!playlist) {
    return (
      <div className="view">
        <div className="empty">
          <div className="ico">?</div>
          <div className="t1">Playlist not found</div>
          <div className="t2">It may have been deleted.</div>
        </div>
      </div>
    );
  }

  const nowKey = state.now_playing ? trackKey(state.now_playing) : null;
  const totalMs = playlist.tracks.reduce((sum, t) => sum + (t.duration_ms ?? 0), 0);

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
            ((addedTimes.get(trackKey(b)) ?? 0) - (addedTimes.get(trackKey(a)) ?? 0)) * mult
          );
        default:
          return 0;
      }
    });
    return arr;
  };

  const visible = sortTracks(playlist.tracks);

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

  const [downloading, setDownloading] = useState(false);

  const downloadAll = async () => {
    if (visible.length === 0) return;
    setDownloading(true);
    try {
      const res = await api.downloadAllToCache(visible);
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

  const removeAt = async (index: number) => {
    try {
      await api.removeFromPlaylist(playlist.id, index);
      await refresh();
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const rename = async () => {
    const title = window.prompt("Rename playlist:", playlist.title);
    if (!title || !title.trim() || title.trim() === playlist.title) return;
    try {
      await api.renamePlaylist(playlist.id, title.trim());
      await refresh();
      showToast(`Renamed to: ${title.trim()}`);
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const changeCover = async () => {
    const current = playlist.cover_url ?? "";
    const value = window.prompt("Cover image URL (leave empty to reset):", current);
    if (value === null) return;
    try {
      await api.setPlaylistCover(playlist.id, value.trim() || null);
      await refresh();
      showToast(value.trim() ? "Cover updated" : "Cover reset");
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const deletePl = async () => {
    if (!window.confirm(`Delete "${playlist.title}"?`)) return;
    try {
      await api.deletePlaylist(playlist.id);
      await refresh();
      navigateTo("playlists");
      showToast(`Deleted: ${playlist.title}`);
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const reorder = async (from: number, to: number) => {
    try {
      await api.reorderPlaylist(playlist.id, from, to);
      await refresh();
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const onRowMouseDown = (e: React.MouseEvent, i: number) => {
    if (sort !== "custom") return;
    if (e.button !== 0) return;
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
      <div style={{ marginBottom: 18 }}>
        <button className="btn btn-outline btn-sm" onClick={goBack} title="Back">
          ← Назад
        </button>
      </div>
      <div className="panel">
        <div className="playlist-hd">
          <PlaylistCover tracks={playlist.tracks} coverUrl={playlist.cover_url} size={148} />
          <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 8, minWidth: 0 }}>
            <span className="kicker">Playlist</span>
            <div className="big-title" style={{ maxWidth: 600, wordBreak: "break-word" }}>
              {playlist.title}
            </div>
            <div className="meta-line">
              <span>{playlist.tracks.length} tracks</span>
              <span className="meta-sep">·</span>
              <span>{formatDuration(totalMs)}</span>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <button className="btn btn-primary btn-sm" onClick={playAll}>
                ▶ Play
              </button>
              <button className="btn btn-ghost btn-sm" onClick={rename}>
                Rename
              </button>
              <button className="btn btn-ghost btn-sm" onClick={changeCover}>
                Cover
              </button>
              <button
                className="btn btn-outline btn-sm"
                onClick={downloadAll}
                disabled={downloading}
              >
                {downloading ? "..." : "Cache"}
              </button>
              <button className="btn btn-danger btn-sm" onClick={deletePl}>
                Delete
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
                title={sort === opt.mode && opt.mode !== "custom" ? (dir === "asc" ? "Ascending" : "Descending") : undefined}
              >
                {opt.label}
                {sort === opt.mode && opt.mode !== "custom" && (dir === "asc" ? " ↑" : " ↓")}
              </button>
            ))}
          </div>
          <span style={{ color: "var(--text3)", fontSize: 12 }}>
            Drag tracks to reorder · Right-click for actions
          </span>
        </div>
        <div style={{ padding: "12px 8px" }}>
          {playlist.tracks.length === 0 ? (
            <div className="empty">
              <div className="ico">♫</div>
              <div className="t1">Empty playlist</div>
              <div className="t2">Add tracks from search results or the library.</div>
            </div>
          ) : (
            <div className="tracklist" onMouseUp={onRowMouseUp} onMouseLeave={() => setDragOver(null)}>
              {visible.map((track, i) => (
                <div
                  key={trackKey(track) + i}
                  onMouseDown={(e) => onRowMouseDown(e, i)}
                  onMouseEnter={() => onRowMouseEnter(i)}
                  style={{
                    ...(sort === "custom" ? { cursor: "grab", userSelect: "none" } : {}),
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
                    onRemove={() => removeAt(playlist.tracks.findIndex((t) => trackKey(t) === trackKey(track)))}
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