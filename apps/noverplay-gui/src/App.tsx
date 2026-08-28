import { AppProvider, useApp } from "./store";
import { Sidebar } from "./components/Sidebar";
import { BottomPlayer } from "./components/BottomPlayer";
import { Home } from "./pages/Home";
import { Search } from "./pages/Search";
import { Library } from "./pages/Library";
import { Playlists } from "./pages/Playlists";
import { PlaylistDetail } from "./pages/Playlist";
import { Queue } from "./pages/Queue";
import { Favorites } from "./pages/Favorites";
import { Recent } from "./pages/Recent";
import { Settings } from "./pages/Settings";

function AppContent() {
  const { view, playlistId, toast, toastError } = useApp();

  const renderPage = () => {
    switch (view) {
      case "home":
        return <Home />;
      case "search":
        return <Search />;
      case "library":
        return <Library />;
      case "playlists":
        return <Playlists />;
      case "playlist":
        return playlistId ? <PlaylistDetail playlistId={playlistId} /> : <Playlists />;
      case "queue":
        return <Queue />;
      case "favorites":
        return <Favorites />;
      case "recent":
        return <Recent />;
      case "settings":
        return <Settings />;
      default:
        return <Home />;
    }
  };

  return (
    <div className="app">
      <div className="app-body">
        <Sidebar />
        <main className="content">{renderPage()}</main>
      </div>
      <BottomPlayer />
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