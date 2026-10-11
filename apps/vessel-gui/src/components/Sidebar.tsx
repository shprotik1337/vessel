import { useEffect, useRef, useState } from "react";

import { useApp } from "../store";
import { useCustomization } from "../customization";
import { TextInputModal } from "./Modal";
import { t } from "../i18n";
import * as api from "../api/commands";

function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconHome() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 9.5L12 3l9 6.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1V9.5z" />
    </svg>
  );
}

function IconWave() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 12h2" />
      <path d="M6 8v8" />
      <path d="M10 4v16" />
      <path d="M14 7v10" />
      <path d="M18 10v4" />
      <path d="M22 12h-2" />
    </svg>
  );
}

function IconFavorites() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.72 1.06-1.06a5.5 5.5 0 0 0 0-7.84z" />
    </svg>
  );
}

function IconPlaylists() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

function IconRecent() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}

function IconQueue() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function IconPlayer() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <polygon points="10 8 16 12 10 16 10 8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
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
              {(["search", "player", "favorites", "playlists", "recent", "queue"] as const).map((v) => {
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
              {(["search", "player", "favorites", "playlists", "recent", "queue"] as const).map((v) => {
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
          width: "76px",
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
          {["search", "player", "favorites", "playlists", "recent", "queue"].map((v) => {
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