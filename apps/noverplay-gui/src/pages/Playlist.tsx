import { useApp } from "../store";
import { TrackRow } from "../components/TrackRow";
import { trackKey, formatDuration } from "../lib/utils";
import type { TrackRef } from "../api/types";
import * as api from "../api/commands";

interface PlaylistDetailProps {
  playlistId: string;
}

export function PlaylistDetail({ playlistId }: PlaylistDetailProps) {
  const { state, playTracks, showToast, refresh, navigateTo } = useApp();
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

  const playOne = (track: TrackRef) => {
    void playTracks([track], 0);
  };

  const playAll = async () => {
    if (playlist.tracks.length === 0) return;
    try {
      await api.playTracks(playlist.tracks, 0);
    } catch (error) {
      showToast(String(error), true);
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

  return (
    <div className="view">
      <div className="panel">
        <div className="playlist-hd">
          <div className="pcover off">
            <span>♫</span>
          </div>
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
              <button className="btn btn-danger btn-sm" onClick={deletePl}>
                Delete
              </button>
            </div>
          </div>
        </div>
        <div className="playlist-bar" style={{ padding: "12px 24px" }}>
          <span style={{ color: "var(--text3)" }}>Right-click a track to remove it</span>
        </div>
        <div style={{ padding: "12px 8px" }}>
          {playlist.tracks.length === 0 ? (
            <div className="empty">
              <div className="ico">♫</div>
              <div className="t1">Empty playlist</div>
              <div className="t2">Add tracks from search results or the library.</div>
            </div>
          ) : (
            <div className="tracklist">
              {playlist.tracks.map((track, i) => (
                <div
                  key={trackKey(track) + i}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    removeAt(i);
                  }}
                >
                  <TrackRow track={track} index={i} nowKey={nowKey} onPlay={playOne} />
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}