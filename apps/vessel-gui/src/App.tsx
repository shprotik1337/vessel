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
import {
  CustomizationProvider,
  useCustomization,
  EditModeBanner,
  ThemeSettingsModal,
} from "./customization";

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
  const { config, isEditMode, activeDragTarget, activeDropZone } = useCustomization();

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

  const hasWallpaper = Boolean(config.theme?.wallpaperData);
  const isGlass = config.theme?.glassMode || (config.theme?.glassOpacity ?? 1) < 0.98;
  const isSidebarRight = config.sidebar?.position === "right";
  const isSidebarTop = config.sidebar?.position === "top";
  const isSidebarBottom = config.sidebar?.position === "bottom";
  const isPlayerTop = config.player?.position === "top";

  const appFlexDirection = isSidebarTop
    ? "column"
    : isSidebarBottom
    ? "column-reverse"
    : isSidebarRight
    ? "row-reverse"
    : "row";

  return (
    <div
      className={`app-shell ${hasWallpaper ? "has-wallpaper" : ""} ${
        isGlass ? "glass-active" : ""
      } ${isEditMode ? "edit-mode-active" : ""}`}
    >
      {hasWallpaper && (
        <div
          className="vessel-wallpaper-layer"
          style={{
            backgroundImage: `url(${config.theme?.wallpaperData})`,
            filter: `blur(var(--wp-blur, 14px))`,
            opacity: `calc(1 - var(--wp-dim, 0.45))`,
          }}
        />
      )}
      <Titlebar />
      <EditModeBanner />
      {activeDragTarget && (
        <div className="screen-drop-zones-overlay">
          {activeDragTarget === "sidebar" && (
            <>
              <div className={`screen-drop-zone zone-left ${activeDropZone === "left" ? "active" : ""}`}>
                <div className="zone-indicator">
                  <span className="zone-icon">◧</span>
                  <span>Слева</span>
                </div>
              </div>
              <div className={`screen-drop-zone zone-right ${activeDropZone === "right" ? "active" : ""}`}>
                <div className="zone-indicator">
                  <span className="zone-icon">◨</span>
                  <span>Справа</span>
                </div>
              </div>
              <div className={`screen-drop-zone zone-top ${activeDropZone === "top" ? "active" : ""}`}>
                <div className="zone-indicator">
                  <span className="zone-icon">⬒</span>
                  <span>Сверху</span>
                </div>
              </div>
              <div className={`screen-drop-zone zone-bottom ${activeDropZone === "bottom" ? "active" : ""}`}>
                <div className="zone-indicator">
                  <span className="zone-icon">⬓</span>
                  <span>Снизу</span>
                </div>
              </div>
            </>
          )}
          {activeDragTarget === "player" && (
            <>
              <div className={`screen-drop-zone zone-left ${activeDropZone === "left" ? "active" : ""}`}>
                <div className="zone-indicator">
                  <span className="zone-icon">◀</span>
                  <span>Плеер слева</span>
                </div>
              </div>
              <div className={`screen-drop-zone zone-right ${activeDropZone === "right" ? "active" : ""}`}>
                <div className="zone-indicator">
                  <span className="zone-icon">▶</span>
                  <span>Плеер справа</span>
                </div>
              </div>
              <div className={`screen-drop-zone zone-top ${activeDropZone === "top" ? "active" : ""}`}>
                <div className="zone-indicator">
                  <span className="zone-icon">▲</span>
                  <span>Плеер сверху</span>
                </div>
              </div>
              <div className={`screen-drop-zone zone-bottom ${activeDropZone === "bottom" ? "active" : ""}`}>
                <div className="zone-indicator">
                  <span className="zone-icon">▼</span>
                  <span>Плеер снизу</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
      <div
        className={`app ${isSidebarTop ? "sidebar-dock-top" : ""} ${
          isSidebarBottom ? "sidebar-dock-bottom" : ""
        }`}
        style={{
          flexDirection: appFlexDirection,
        }}
      >
        <Sidebar />
        <div
          className={`app-main ${isPlayerTop ? "player-at-top" : ""} ${
            config.player?.position === "left" ? "player-at-left" : ""
          } ${config.player?.position === "right" ? "player-at-right" : ""}`}
        >
          <main
            className={`content ${isPlayerTop ? "player-dock-top" : ""} ${
              config.player?.position === "left" ? "player-dock-left" : ""
            } ${config.player?.position === "right" ? "player-dock-right" : ""}`}
          >
            {renderPage()}
          </main>
          <BottomPlayer />
        </div>
      </div>
      {fullscreenOpen && <FullscreenPlayer />}
      {state?.needs_user_selection && <UserSelector />}
      <ThemeSettingsModal />
      {cacheProgress && (
        <div className="toast-wrap" style={{ bottom: toast ? "154px" : "104px", transition: "bottom 0.2s ease" }}>
          <div className="toast cache-toast">
            <span className="cache-spinner" />
            <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {lang === "ru"
                ? `[${cacheProgress.completed}/${cacheProgress.total}] ${cacheProgress.title} (скачано: ${cacheProgress.downloaded}, в кэше: ${cacheProgress.skipped}${cacheProgress.failed > 0 ? `, сбоев: ${cacheProgress.failed}` : ""})`
                : `[${cacheProgress.completed}/${cacheProgress.total}] ${cacheProgress.title} (downloaded: ${cacheProgress.downloaded}, cached: ${cacheProgress.skipped}${cacheProgress.failed > 0 ? `, failed: ${cacheProgress.failed}` : ""})`}
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
      <CustomizationProvider>
        <AppContent />
      </CustomizationProvider>
    </AppProvider>
  );
}