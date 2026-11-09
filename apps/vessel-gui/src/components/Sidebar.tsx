import { useEffect, useRef, useState } from "react";

import { useApp } from "../store";
import { useCustomization } from "../customization";
import { TextInputModal } from "./Modal";
import { t } from "../i18n";
import * as api from "../api/commands";

function IconSearch() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="10.5" cy="10.5" r="7.5" />
      <line x1="16.5" y1="16.5" x2="21.5" y2="21.5" strokeWidth="2.7" />
    </svg>
  );
}

function IconHome() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor">
      <path d="M11.2 2.8a1.2 1.2 0 0 1 1.6 0l2.2 1.9V4a.8.8 0 0 1 .8-.8h1.8a.8.8 0 0 1 .8.8v3.4l2.8 2.4c.5.4.6 1.1.2 1.6-.4.5-1.1.6-1.6.2l-.8-.7V19.5a2.5 2.5 0 0 1-2.5 2.5H6.9A2.5 2.5 0 0 1 4.4 19.5V11l-.8.7c-.5.4-1.2.3-1.6-.2-.4-.5-.3-1.2.2-1.6l9-7.1z" />
    </svg>
  );
}

function IconWave() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor">
      <rect x="3" y="10" width="2.5" height="4" rx="1.25" />
      <rect x="8" y="5.5" width="2.5" height="13" rx="1.25" />
      <rect x="13.5" y="3" width="2.5" height="18" rx="1.25" />
      <rect x="19" y="8" width="2.5" height="8" rx="1.25" />
    </svg>
  );
}

function IconFavorites() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
    </svg>
  );
}

function IconPlaylists() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18 2H6a2 2 0 0 0-2 2v18l8-4.5 8 4.5V4a2 2 0 0 0-2-2z" />
    </svg>
  );
}

function IconRecent() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="9.5" />
      <polyline points="12 6.5 12 12 15.5 14" />
    </svg>
  );
}

function IconQueue() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="4" y1="6" x2="20" y2="6" />
      <line x1="4" y1="12" x2="14" y2="12" />
      <line x1="4" y1="18" x2="11" y2="18" />
      <polygon points="17 14 21 16.5 17 19 17 14" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconPlayer() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <polygon points="10 8.5 16 12 10 15.5 10 8.5" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3.2" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function Sidebar() {
  const {
    state,
    view,
    navigateTo,
    showToast,
    refresh,
    lang,
    isSettingsOpen,
    openSettings,
  } = useApp();
  const {
    config,
    isQueueOpen,
    toggleQueue,
  } = useCustomization();
  const [createOpen, setCreateOpen] = useState(false);

  const isSidebarRight = config.sidebar?.position === "right";
  const isSidebarTop = config.sidebar?.position === "top";
  const isSidebarBottom = config.sidebar?.position === "bottom";
  const isSidebarLeft = !isSidebarRight && !isSidebarTop && !isSidebarBottom;
  const isHorizontal = isSidebarTop || isSidebarBottom;
  const isIsland = config.sidebar?.style === "island" || config.sidebar?.style === "floating";
  const autoHide = Boolean(config.sidebar?.autoHide);

  const [isRevealed, setIsRevealed] = useState(!autoHide);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!autoHide) setIsRevealed(true);
    else setIsRevealed(false);
  }, [autoHide]);

  const reveal = () => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
    setIsRevealed(true);
  };

  const scheduleHide = () => {
    if (!autoHide) return;
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      setIsRevealed(false);
    }, 380);
  };

  const doCreate = async (title: string) => {
    const name = title.trim();
    if (!name) return;
    try {
      const pl = await api.createPlaylist(name);
      await refresh();
      setCreateOpen(false);
      navigateTo("playlist", { playlistId: pl.id });
      showToast(`Created: ${name}`);
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const getNavMeta = (v: string) => {
    switch (v) {
      case "home":
        return { label: t(lang, "nav.home"), icon: <IconHome /> };
      case "player":
        return { label: lang === "ru" ? "Плеер" : "Player", icon: <IconPlayer /> };
      case "wave":
        return { label: t(lang, "wave.title"), icon: <IconWave /> };
      case "search":
        return { label: t(lang, "nav.search"), icon: <IconSearch /> };
      case "library":
        return { label: t(lang, "nav.library"), icon: <IconPlaylists /> };
      case "playlists":
        return { label: t(lang, "nav.playlists"), icon: <IconPlaylists /> };
      case "favorites":
        return { label: t(lang, "nav.favorites"), icon: <IconFavorites />, count: state?.library.length };
      case "recent":
        return { label: t(lang, "nav.recent"), icon: <IconRecent /> };
      case "queue":
        return { label: t(lang, "nav.queue"), icon: <IconQueue />, count: state?.queue.length };
      default:
        return { label: v, icon: null };
    }
  };

  const isCompactRail = (config.sidebar?.variant || "standard") === "compact";

  const nav = (v: string) => {
    const meta = getNavMeta(v);
    const isActive = v === "queue" ? isQueueOpen : view === v;

    if (isCompactRail) {
      return (
        <button
          key={v}
          className={`nav-item icon-only ${isActive ? "active" : ""}`}
          onClick={() => {
            if (v === "queue") toggleQueue();
            else navigateTo(v);
          }}
          title={meta.count !== undefined ? `${meta.label} (${meta.count})` : meta.label}
          aria-label={meta.label}
        >
          <span className="nav-item-icon">{meta.icon}</span>
        </button>
      );
    }

    return (
      <button
        key={v}
        className={`nav-item ${isActive ? "active" : ""}`}
        onClick={() => {
          if (v === "queue") toggleQueue();
          else navigateTo(v);
        }}
        title={meta.label}
      >
        <span className="nav-item-icon">{meta.icon}</span>
        <span className="nav-item-label">{meta.label}</span>
        {meta.count !== undefined && state && <span className="nav-count">{meta.count}</span>}
      </button>
    );
  };

  const sidebarStyle = config.sidebar?.style || "dock";

  if (isIsland) {
    const posClass = isSidebarTop ? "pos-top" : isSidebarRight ? "pos-right" : isSidebarLeft ? "pos-left" : "pos-bottom";

    return (
      <>
        {autoHide && (
          <div
            className={`sidebar-autohide-sensor ${posClass}`}
            onMouseEnter={reveal}
          />
        )}
        <div
          className={`island-dock-wrap ${posClass} ${autoHide ? "auto-hide" : ""} ${isRevealed ? "revealed" : ""}`}
          onMouseEnter={reveal}
          onMouseLeave={scheduleHide}
        >
          <aside className="sidebar island-dock">
            <div className="island-nav-items">
              <button
                className={`island-nav-item ${view === "home" ? "active" : ""}`}
                onClick={() => navigateTo("home")}
                title={t(lang, "nav.home")}
              >
                <span className="island-nav-icon">{getNavMeta("home").icon}</span>
              </button>
              <div className="island-sep" />
              {(["search", "player", "library", "recent", "queue"] as const).map((v) => {
                const meta = getNavMeta(v);
                const isActive = v === "queue" ? isQueueOpen : view === v;
                return (
                  <button
                    key={v}
                    className={`island-nav-item ${isActive ? "active" : ""}`}
                    onClick={() => {
                      if (v === "queue") toggleQueue();
                      else navigateTo(v);
                    }}
                    title={meta.label}
                  >
                    <span className="island-nav-icon">{meta.icon}</span>
                  </button>
                );
              })}
              <div className="island-sep" />
              <button
                className={`island-nav-item ${isSettingsOpen ? "active" : ""}`}
                onClick={openSettings}
                title={t(lang, "nav.settings")}
              >
                <span className="island-nav-icon"><IconSettings /></span>
              </button>
            </div>
          </aside>
        </div>
      </>
    );
  }

  if (isHorizontal) {
    const defaultH = 58;
    const currentH = config.sidebar?.height && config.sidebar.height >= 50
      ? config.sidebar.height
      : defaultH;
    const posClass = isSidebarBottom ? "pos-bottom" : "pos-top";

    return (
      <>
        {autoHide && (
          <div
            className={`sidebar-autohide-sensor ${posClass}`}
            onMouseEnter={reveal}
          />
        )}
        <aside
          className={`sidebar ${isSidebarBottom ? "dock-bottom" : "dock-top"} style-${sidebarStyle} ${
            sidebarStyle === "round" ? "style-round" : sidebarStyle === "compact" ? "style-compact" : "style-dock full-dock"
          } top-compact ${
            autoHide ? "auto-hide" : ""
          } ${isRevealed ? "revealed" : ""}`}
          style={{
            position: "relative",
            zIndex: 50,
            height: `${currentH}px`,
          }}
          onMouseEnter={reveal}
          onMouseLeave={scheduleHide}
        >
          <div className="top-nav-bar compact">
            <div className="top-nav-left">
              <button
                className={`nav-item top-nav-item ${view === "home" ? "active" : ""}`}
                onClick={() => navigateTo("home")}
                title={t(lang, "nav.home")}
              >
                <span className="nav-item-icon">{getNavMeta("home").icon}</span>
              </button>
            </div>
            <div className="top-nav-center">
              {(["search", "player", "library", "recent", "queue"] as const).map((v) => {
                const meta = getNavMeta(v);
                const isActive = v === "queue" ? isQueueOpen : view === v;
                return (
                  <button
                    key={v}
                    className={`nav-item top-nav-item ${isActive ? "active" : ""}`}
                    onClick={() => {
                      if (v === "queue") toggleQueue();
                      else navigateTo(v);
                    }}
                    title={meta.label}
                  >
                    <span className="nav-item-icon">{meta.icon}</span>
                  </button>
                );
              })}
            </div>
            <div className="top-nav-right">
              <button
                className={`nav-item top-nav-item ${isSettingsOpen ? "active" : ""}`}
                onClick={openSettings}
                title={t(lang, "nav.settings")}
              >
                <span className="nav-item-icon"><IconSettings /></span>
              </button>
            </div>
          </div>
        </aside>
      </>
    );
  }

  const posClass = isSidebarRight ? "pos-right" : "pos-left";

  return (
    <>
      {autoHide && (
        <div
          className={`sidebar-autohide-sensor ${posClass}`}
          onMouseEnter={reveal}
        />
      )}
      <aside
        className={`sidebar collapsed rail-sidebar style-${sidebarStyle} ${
          isSidebarRight ? "dock-right" : "dock-left"
        } ${sidebarStyle === "round" ? "style-round" : sidebarStyle === "compact" ? "style-compact" : "style-dock full-dock"} ${
          autoHide ? "auto-hide" : ""
        } ${isRevealed ? "revealed" : ""}`}
        style={{
          position: "relative",
          zIndex: 50,
          width: "68px",
        }}
        onMouseEnter={reveal}
        onMouseLeave={scheduleHide}
      >
        {/* Top item: home */}
        <div className="sidebar-header collapsed" style={{ display: "flex", justifyContent: "center", padding: "12px 0 8px", width: "100%" }}>
          <button
            className={`nav-item icon-only ${view === "home" ? "active" : ""}`}
            onClick={() => navigateTo("home")}
            title={t(lang, "nav.home")}
            aria-label={t(lang, "nav.home")}
          >
            <span className="nav-item-icon">{getNavMeta("home").icon}</span>
          </button>
        </div>

        {/* Main navigation list */}
        <div className="nav" style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "center", width: "100%" }}>
          {["search", "player", "library", "recent", "queue"].map((v) => {
            return nav(v);
          })}
        </div>

        {/* Bottom section: settings */}
        <div className="sidebar-bottom-collapsed" style={{ marginTop: "auto", display: "flex", flexDirection: "column", alignItems: "center", paddingBottom: "12px", width: "100%", borderTop: "1px solid var(--border)", paddingTop: "10px" }}>
          <button
            className={`nav-item icon-only ${isSettingsOpen ? "active" : ""}`}
            onClick={openSettings}
            title={t(lang, "nav.settings")}
            aria-label={t(lang, "nav.settings")}
          >
            <span className="nav-item-icon"><IconSettings /></span>
          </button>
        </div>

        {createOpen && (
          <TextInputModal
            lang={lang}
            title={t(lang, "playlists.createName")}
            placeholder={t(lang, "playlists.createName")}
            confirmText={t(lang, "common.create")}
            onSubmit={doCreate}
            onClose={() => setCreateOpen(false)}
          />
        )}
      </aside>
    </>
  );
}