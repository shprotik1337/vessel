import { Component, ErrorInfo, ReactNode, useEffect } from "react";
import { AppProvider, PlaybackProgressProvider, useApp, usePlaybackProgress } from "./store";
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
import { PlayerPage } from "./pages/PlayerPage";
import { UserSelector } from "./components/UserSelector";
import { FullscreenPlayer } from "./components/FullscreenPlayer";
import { Titlebar } from "./components/Titlebar";
import { QueueDrawer } from "./components/QueueDrawer";
import {
  CustomizationProvider,
  useCustomization,
  ThemeSettingsModal,
} from "./customization";
import { IconSparkles } from "./components/Icons";
import { resolveArtworkUrl } from "./lib/utils";
import { AuthPage } from "./pages/AuthPage";
import { MigrationModal } from "./components/MigrationModal";

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Vessel React Error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          height: "100vh",
          backgroundColor: "#121214",
          color: "#ffffff",
          padding: "24px",
          fontFamily: "system-ui, -apple-system, sans-serif",
          textAlign: "center"
        }}>
          <h2 style={{ marginBottom: "12px", color: "#f87171" }}>Ошибка интерфейса Vessel</h2>
          <pre style={{
            background: "#1c1c20",
            padding: "16px",
            borderRadius: "8px",
            maxWidth: "600px",
            overflowX: "auto",
            marginBottom: "20px",
            fontSize: "13px",
            color: "#e2e8f0"
          }}>
            {this.state.error?.message || "Unknown error"}
          </pre>
          <div style={{ display: "flex", gap: "12px" }}>
            <button
              onClick={() => {
                localStorage.removeItem("vessel_customization_v1");
                window.location.reload();
              }}
              style={{
                padding: "8px 16px",
                background: "#3b82f6",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer",
                fontWeight: "bold"
              }}
            >
              Сбросить настройки и перезагрузить
            </button>
            <button
              onClick={() => window.location.reload()}
              style={{
                padding: "8px 16px",
                background: "#27272a",
                color: "#fff",
                border: "none",
                borderRadius: "6px",
                cursor: "pointer"
              }}
            >
              Перезагрузить
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}


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
    cacheProgress,
    lang,
    navigateTo,
    isSettingsOpen,
    closeSettings,
    hasEverPlayed,
    setHasEverPlayed,
    showToast,
    isMigrationModalOpen,
    setIsMigrationModalOpen,
    refresh,
    continueGuest,
  } = useApp();
  const progress = usePlaybackProgress();

  useEffect(() => {
    if (hasEverPlayed) return;
    if (
      progress.status === "playing" ||
      progress.status === "buffering" ||
      state?.player?.status === "playing" ||
      state?.player?.status === "buffering"
    ) {
      setHasEverPlayed(true);
    }
  }, [hasEverPlayed, progress.status, state?.player?.status, setHasEverPlayed]);

  const {
    config,
    isPreviewActive,
    previewPreset,
    applyPreview,
    cancelPreview,
  } = useCustomization();

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
        return <Home />;
      case "wave":
        return <PlayerPage />;
      case "player":
        return <PlayerPage />;
      default:
        return <Home />;
    }
  };

  const hasWallpaper = Boolean(config.theme?.wallpaperData);
  const isGlass = Boolean(config.theme?.glassMode) || (config.theme?.glassOpacity ?? 1) < 0.98 || ((config.theme?.windowOpacity ?? 100) < 100);
  const isSidebarRight = config.sidebar?.position === "right";
  const isSidebarTop = config.sidebar?.position === "top";
  const isSidebarBottom = config.sidebar?.position === "bottom";
  const isSidebarLeft = !isSidebarRight && !isSidebarTop && !isSidebarBottom;
  const isPlayerTop = config.player?.position === "top";
  const showBottomPlayer = config.player?.showMiniPlayer !== false && view !== "player" && hasEverPlayed;

  const isIsland = config.sidebar?.style === "island" || config.sidebar?.style === "floating";
  const autoHide = Boolean(config.sidebar?.autoHide);
  const islandSafeClass = (isIsland && !autoHide)
    ? isSidebarLeft
      ? "island-safe-left"
      : isSidebarRight
      ? "island-safe-right"
      : isSidebarTop
      ? ""
      : "island-safe-bottom"
    : "";

  const globalAmbientArt = resolveArtworkUrl(state?.now_playing?.artwork_url);

  const appFlexDirection = (isSidebarTop || isSidebarBottom) ? "column" : "row";

  return (
    <div
      className={`app-shell view-${view} ${hasWallpaper ? "has-wallpaper" : ""} ${
        isGlass ? "glass-active" : ""
      }`}
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
      {/* Fixed Ambient Backdrop for fullscreen player view */}
      {view === "player" && (config.theme?.ambientMode === "off" ? null : config.theme?.ambientMode === "theme" ? (
        <div className="app-ambient-backdrop-theme app-ambient-backdrop-fs" />
      ) : globalAmbientArt ? (
        <div
          className="app-ambient-backdrop app-ambient-backdrop-fs"
          style={{ backgroundImage: `url("${globalAmbientArt}")` }}
        />
      ) : (
        <div className="app-ambient-backdrop-fallback app-ambient-backdrop-fs" />
      ))}
      <Titlebar />
      {isPreviewActive && (
        <div className="preview-floating-bar">
          <div className="preview-floating-info">
            <span className="preview-pill-eye"><IconSparkles size={15} /></span>
            <span className="preview-pill-text">
              {lang === "ru" ? "Предпросмотр темы: " : "Previewing theme: "}
              <strong>{previewPreset?.name || "Тема"}</strong>
            </span>
          </div>
          <div className="preview-floating-actions">
            <button
              type="button"
              className="preview-btn-apply"
              onClick={() => {
                applyPreview();
                navigateTo("settings");
              }}
            >
              {lang === "ru" ? "Применить" : "Apply"}
            </button>
            <button
              type="button"
              className="preview-btn-back"
              onClick={() => {
                cancelPreview();
                navigateTo("settings");
              }}
            >
              {lang === "ru" ? "Назад к настройкам" : "Back to settings"}
            </button>
          </div>
        </div>
      )}
      {view === "auth" ? (
        <AuthPage
          onSuccess={(hasLocalData, isRegister) => {
            void refresh();
            if (isRegister && hasLocalData) {
              setIsMigrationModalOpen(true);
            } else {
              showToast(isRegister ? "Аккаунт успешно создан" : "Вход выполнен успешно");
            }
            navigateTo("home");
          }}
          onContinueGuest={() => {
            void continueGuest();
          }}
        />
      ) : (
        <div
          className={`app ${
            isSidebarTop
              ? "sidebar-dock-top"
              : isSidebarBottom
              ? "sidebar-dock-bottom"
              : isSidebarRight
              ? "sidebar-dock-right"
              : "sidebar-dock-left"
          }`}
          style={{
            flexDirection: appFlexDirection,
          }}
        >
          <Sidebar />
          <div
            className={`app-main ${islandSafeClass} ${showBottomPlayer && isPlayerTop ? "player-at-top" : ""} ${
              showBottomPlayer && config.player?.position === "left" ? "player-at-left" : ""
            } ${showBottomPlayer && config.player?.position === "right" ? "player-at-right" : ""}`}
          >
            <main
              className={`content ${showBottomPlayer && isPlayerTop ? "player-dock-top" : ""} ${
                showBottomPlayer && config.player?.position === "left" ? "player-dock-left" : ""
              } ${showBottomPlayer && config.player?.position === "right" ? "player-dock-right" : ""} ${
                !showBottomPlayer ? "no-player-bottom" : ""
              }`}
            >
              {/* Scrollable Ambient Backdrop tied to content coordinate space */}
              {view !== "player" && (config.theme?.ambientMode === "off" ? null : config.theme?.ambientMode === "theme" ? (
                <div className="app-ambient-backdrop-theme app-ambient-backdrop-scroll" />
              ) : globalAmbientArt ? (
                <div
                  className="app-ambient-backdrop app-ambient-backdrop-scroll"
                  style={{ backgroundImage: `url("${globalAmbientArt}")` }}
                />
              ) : null)}
              {renderPage()}
            </main>
            {showBottomPlayer && <BottomPlayer />}
          </div>
        </div>
      )}
      <FullscreenPlayer />
      {isSettingsOpen && <Settings onClose={closeSettings} />}
      <QueueDrawer />
      {state?.needs_user_selection && <UserSelector />}
      <ThemeSettingsModal />
      <MigrationModal
        isOpen={isMigrationModalOpen}
        onClose={() => setIsMigrationModalOpen(false)}
        onSuccess={() => {
          setIsMigrationModalOpen(false);
          void refresh();
          showToast("Данные успешно перенесены в облако");
        }}
      />
      {cacheProgress && (
        <div
          className="toast-wrap"
          style={{
            bottom: !showBottomPlayer ? (toast ? "74px" : "24px") : (toast ? "154px" : "104px"),
            transition: "bottom 0.2s ease",
          }}
        >
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
        <div
          className="toast-wrap"
          style={{
            bottom: !showBottomPlayer ? "24px" : undefined,
            transition: "bottom 0.2s ease",
          }}
        >
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
    <ErrorBoundary>
      <AppProvider>
        <PlaybackProgressProvider>
          <CustomizationProvider>
            <AppContent />
          </CustomizationProvider>
        </PlaybackProgressProvider>
      </AppProvider>
    </ErrorBoundary>
  );
}