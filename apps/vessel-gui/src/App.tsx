import { AppProvider, useApp } from "./store";
import { Sidebar } from "./components/Sidebar";
import { BottomPlayer } from "./components/BottomPlayer";
import { Home } from "./pages/Home";
import { Search } from "./pages/Search";
import { Playlists } from "./pages/Playlists";
import { PlaylistDetail } from "./pages/Playlist";
import { Queue } from "./pages/Queue";
import { Favorites } from "./pages/Favorites";
import { Recent } from "./pages/Recent";
import { Settings } from "./pages/Settings";
import { Artist } from "./pages/Artist";
import { WavePage } from "./pages/Wave";
import { UserSelector } from "./components/UserSelector";
import { FullscreenPlayer } from "./components/FullscreenPlayer";

import { Titlebar } from "./components/Titlebar";

function AppContent() {
  const {
    state,
    view,
    playlistId,
    artist,
    artistProvider,
    artistId,
    toast,
    toastError,
    fullscreenOpen,
    cacheProgress,
    lang,
  } = useApp();

  const renderPage = () => {
    switch (view) {
      case "home":
        return <Home />;
      case "search":
        return <Search />;
      case "playlists":
        return <Playlists />;
      case "playlist":
        return playlistId ? <PlaylistDetail playlistId={playlistId} /> : <Playlists />;
      case "artist":
        return artist ? (
          <Artist
            artist={artist}
            provider={artistProvider}
            artistId={artistId}
            mode="profile"
          />
        ) : (
          <Home />
        );
      case "artist-releases":
        return artist ? (
          <Artist
            artist={artist}
            provider={artistProvider}
            artistId={artistId}
            mode="releases"
          />
        ) : (
          <Home />
        );
      case "artist-tracks":
        return artist ? (
          <Artist
            artist={artist}
            provider={artistProvider}
            artistId={artistId}
            mode="tracks"
          />
        ) : (
          <Home />
        );
      case "queue":
        return <Queue />;
      case "favorites":
        return <Favorites />;
      case "recent":
        return <Recent />;
      case "settings":
        return <Settings />;
      case "wave":
        return <WavePage />;
      default:
        return <Home />;
    }
  };

  return (
    <div className="app-shell">
      <Titlebar />
      <div className="app">
        <Sidebar />
        <div className="app-main">
          <main className="content">{renderPage()}</main>
          <BottomPlayer />
        </div>
      </div>
      {fullscreenOpen && <FullscreenPlayer />}
      {state?.needs_user_selection && <UserSelector />}
      {cacheProgress && (
        <div className="toast-wrap" style={{ bottom: toast ? "154px" : "104px", transition: "bottom 0.2s ease" }}>
          <div className="toast cache-toast">
            <span className="cache-spinner" />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {lang === "ru"
                ? `Кэширование [${cacheProgress.completed}/${cacheProgress.total}]: ${cacheProgress.title}`
                : `Caching [${cacheProgress.completed}/${cacheProgress.total}]: ${cacheProgress.title}`}
            </span>
          </div>
        </div>
      )}
      {toast && (
        <div className="toast-wrap">
          <div className={`toast ${toastError ? "error" : ""}`}>
            <span>{toast}</span>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}