import { useState } from "react";

import { useApp } from "../store";
import { PlaylistCover } from "../components/PlaylistCover";
import { trackKey } from "../lib/utils";
import * as api from "../api/commands";

export function Playlists() {
  const { state, navigateTo, showToast, refresh, playTracks } = useApp();
  const [importOpen, setImportOpen] = useState(false);
  const [importUrl, setImportUrl] = useState("");
  const [importing, setImporting] = useState(false);

  if (!state) return null;

  const createPlaylist = async () => {
    const title = window.prompt("Playlist name:", "New Playlist");
    if (!title || !title.trim()) return;
    try {
      await api.createPlaylist(title.trim());
      await refresh();
      showToast(`Created: ${title.trim()}`);
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const deletePl = async (id: string, title: string) => {
    if (!window.confirm(`Delete "${title}"?`)) return;
    try {
      await api.deletePlaylist(id);
      await refresh();
      showToast(`Deleted: ${title}`);
    } catch (error) {
      showToast(String(error), true);
    }
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

  const isPlayingPlaylist = (tracks: { provider: string; id: string }[]) => {
    if (!state.now_playing) return false;
    return tracks.some((t) => trackKey(t as never) === trackKey(state.now_playing!));
  };

  return (
    <div className="view">
      <div className="view-hd">
        <div>
          <div className="view-title">Playlists</div>
          <div className="view-sub">{state.playlists.length} playlists</div>
        </div>
        <div className="btns">
          <button className="btn btn-ghost" onClick={() => setImportOpen(true)}>
            Import
          </button>
          <button className="btn btn-primary" onClick={createPlaylist}>
            ＋ New
          </button>
        </div>
      </div>

      {state.playlists.length === 0 ? (
        <div className="empty">
          <div className="ico">♫</div>
          <div className="t1">No playlists yet</div>
          <div className="t2">Create a playlist or import one from SoundCloud, Deezer or Yandex.</div>
        </div>
      ) : (
        <div className="grid">
          {state.playlists.map((p) => (
            <div
              key={p.id}
              className="card"
              onClick={() => navigateTo("playlist", { playlistId: p.id })}
              onContextMenu={(e) => {
                e.preventDefault();
                deletePl(p.id, p.title);
              }}
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
      )}

      {importOpen && (
        <div className="ov show" onMouseDown={(e) => e.stopPropagation()}>
          <div
            className="playlist-picker-card"
            style={{ width: 420 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="playlist-picker-head">
              <span className="ov-title">Import playlist</span>
              <button className="ov-close" onClick={() => setImportOpen(false)}>
                ✕
              </button>
            </div>
            <div style={{ padding: 18, display: "flex", flexDirection: "column", gap: 14 }}>
              <div className="set-desc">
                Paste a playlist URL from SoundCloud, Deezer or Yandex Music. It will be
                imported and saved to your library.
              </div>
              <div className="input-row">
                <input
                  type="text"
                  placeholder="https://soundcloud.com/user/sets/…"
                  value={importUrl}
                  onChange={(e) => setImportUrl(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") void doImport();
                    if (e.key === "Escape") setImportOpen(false);
                  }}
                  autoFocus
                />
              </div>
              <div className="btns" style={{ justifyContent: "flex-end" }}>
                <button className="btn btn-outline" onClick={() => setImportOpen(false)}>
                  Cancel
                </button>
                <button
                  className="btn btn-primary"
                  onClick={doImport}
                  disabled={importing || !importUrl.trim()}
                >
                  {importing ? "Importing…" : "Import"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  async function doImport() {
    const url = importUrl.trim();
    if (!url) return;
    setImporting(true);
    try {
      const pl = await api.importPlaylistUrl(url);
      await refresh();
      setImportOpen(false);
      setImportUrl("");
      showToast(`Imported: ${pl.title} (${pl.tracks.length} tracks)`);
    } catch (error) {
      showToast(String(error), true);
    } finally {
      setImporting(false);
    }
  }
}