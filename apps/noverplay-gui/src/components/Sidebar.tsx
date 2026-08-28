import { useApp } from "../store";
import { providerLabel } from "../lib/utils";
import { tone } from "./Artwork";
import * as api from "../api/commands";

export function Sidebar() {
  const { state, view, playlistId, navigateTo, showToast, refresh } = useApp();

  const createPlaylist = async () => {
    const title = window.prompt("Playlist name:", "New Playlist");
    if (!title || !title.trim()) return;
    try {
      const pl = await api.createPlaylist(title.trim());
      await refresh();
      navigateTo("playlist", { playlistId: pl.id });
      showToast(`Created: ${title.trim()}`);
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const nav = (v: string) => (
    <button
      className={`nav-item ${view === v ? "active" : ""}`}
      onClick={() => navigateTo(v)}
    >
      <span>
        {v === "home"
          ? "Home"
          : v === "search"
            ? "Search"
            : v === "library"
              ? "Library"
              : v === "playlists"
                ? "Playlists"
                : v === "favorites"
                  ? "Favorites"
                  : v === "recent"
                    ? "Recently played"
                    : v === "queue"
                      ? "Queue"
                      : v}
      </span>
      {v === "library" && state && <span className="nav-count">{state.library.length}</span>}
      {v === "favorites" && state && <span className="nav-count">{state.library.length}</span>}
      {v === "queue" && state && <span className="nav-count">{state.queue.length}</span>}
    </button>
  );

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark" />
        <span>Vessel</span>
      </div>
      <div className="ssearch" onClick={() => navigateTo("search")}>
        <span>Search everything</span>
        <span className="kbd">⌘K</span>
      </div>
      <div className="nav">
        {nav("home")}
        {nav("library")}
        {nav("playlists")}
        {nav("favorites")}
        {nav("recent")}
        {nav("queue")}
      </div>
      <div className="nav">
        <div className="nav-label-row">
          <span className="nav-label">Playlists</span>
          <span className="plus" onClick={createPlaylist}>
            ＋
          </span>
        </div>
        {state?.playlists.map((p, i) => (
          <button
            key={p.id}
            className={`pl-item ${view === "playlist" && playlistId === p.id ? "active" : ""}`}
            onClick={() => navigateTo("playlist", { playlistId: p.id })}
          >
            <div className="pl-mark" style={{ background: tone(i) }} />
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              {p.title}
            </span>
          </button>
        ))}
      </div>
      <div
        className="nav"
        style={{ marginTop: "auto", borderTop: "1px solid var(--border)", paddingTop: "14px" }}
      >
        <span className="nav-label">Sources</span>
        {state?.providers.map((p) => (
          <div key={p.kind} className={`src-row ${!p.enabled ? "dis" : ""}`}>
            <span>{providerLabel(p.kind)}</span>
            {p.enabled ? (
              <span
                className="src-dot"
                style={{ background: p.connected ? "#9A9BA1" : "var(--red)" }}
              />
            ) : (
              <span className="src-soon">Off</span>
            )}
          </div>
        ))}
        <button
          className={`nav-item ${view === "settings" ? "active" : ""}`}
          style={{ marginTop: "6px" }}
          onClick={() => navigateTo("settings")}
        >
          <span>Settings</span>
        </button>
      </div>
    </aside>
  );
}