import { useApp } from "../store";
import { tone } from "../components/Artwork";
import * as api from "../api/commands";

export function Playlists() {
  const { state, navigateTo, showToast, refresh } = useApp();
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

  return (
    <div className="view">
      <div className="view-hd">
        <div>
          <div className="view-title">Playlists</div>
          <div className="view-sub">{state.playlists.length} playlists</div>
        </div>
        <div className="btns">
          <button className="btn btn-primary" onClick={createPlaylist}>
            ＋ New
          </button>
        </div>
      </div>

      {state.playlists.length === 0 ? (
        <div className="empty">
          <div className="ico">♫</div>
          <div className="t1">No playlists yet</div>
          <div className="t2">Create a playlist to organize your music.</div>
        </div>
      ) : (
        <div className="grid">
          {state.playlists.map((p, i) => (
            <div
              key={p.id}
              className="card"
              onClick={() => navigateTo("playlist", { playlistId: p.id })}
              onContextMenu={(e) => {
                e.preventDefault();
                deletePl(p.id, p.title);
              }}
            >
              <div className="card-art" style={{ background: tone(i), display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "var(--text3)" }}>
                ♫
              </div>
              <div className="card-t">{p.title}</div>
              <div className="card-s">{p.tracks.length} tracks</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}