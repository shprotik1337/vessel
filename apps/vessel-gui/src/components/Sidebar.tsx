import { useRef, useState } from "react";

import { useApp } from "../store";
import { useCustomization } from "../customization";
import { TextInputModal } from "./Modal";
import { t } from "../i18n";
import { resolveArtworkUrl } from "../lib/utils";
import * as api from "../api/commands";

function IconCollapse() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <polyline points="16 15 13 12 16 9" />
    </svg>
  );
}

function IconExpand() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <line x1="9" y1="3" x2="9" y2="21" />
      <polyline points="14 9 17 12 14 15" />
    </svg>
  );
}

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
    playlistId,
    navigateTo,
    showToast,
    refresh,
    lang,
    sidebarCollapsed: collapsed,
    toggleSidebarCollapsed: toggleCollapsed,
  } = useApp();
  const { isEditMode, config, toggleSidebarPosition } = useCustomization();
  const [plExpanded, setPlExpanded] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const dragRef = useRef<{ from: number } | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  const reorderPlaylists = async (from: number, to: number) => {
    if (!state) return;
    try {
      const order = state.playlists.map((p) => p.id);
      const [id] = order.splice(from, 1);
      order.splice(to, 0, id);
      await api.reorderPlaylists(order);
      await refresh();
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const onItemMouseDown = (e: React.MouseEvent, i: number) => {
    if (e.button !== 0) return;
    dragRef.current = { from: i };
    setDragOver(i);
  };

  const onItemMouseEnter = (i: number) => {
    if (dragRef.current && dragOver !== i) setDragOver(i);
  };

  const onItemMouseUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag && dragOver != null && drag.from !== dragOver) {
      void reorderPlaylists(drag.from, dragOver);
    }
    setDragOver(null);
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

  const nav = (v: string) => {
    const meta = getNavMeta(v);
    const isActive = view === v;

    if (collapsed) {
      return (
        <button
          key={v}
          className={`nav-item icon-only ${isActive ? "active" : ""}`}
          onClick={() => navigateTo(v)}
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
        onClick={() => navigateTo(v)}
        title={meta.label}
      >
        <span className="nav-item-icon">{meta.icon}</span>
        <span className="nav-item-label">{meta.label}</span>
        {meta.count !== undefined && state && <span className="nav-count">{meta.count}</span>}
      </button>
    );
  };

  const isSidebarRight = config.sidebar?.position === "right";
  const isSidebarTop = config.sidebar?.position === "top";

  if (isSidebarTop) {
    return (
      <aside className="sidebar dock-top" style={{ position: "relative" }}>
        {isEditMode && (
          <button
            className="sidebar-flip-handle dock-top-handle"
            onClick={toggleSidebarPosition}
            title="Сменить положение меню (Слева / Справа / Сверху)"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M7 16l-4-4m0 0l4-4m-4 4h18m-4 4l4-4m0 0l-4-4" />
            </svg>
          </button>
        )}
        <div className="top-nav-bar">
          <div className="top-nav-items">
            {["home", "wave", "search", "favorites", "playlists", "queue"].map((v) => {
              const meta = getNavMeta(v);
              const isActive = view === v;
              return (
                <button
                  key={v}
                  className={`nav-item top-nav-item ${isActive ? "active" : ""}`}
                  onClick={() => navigateTo(v)}
                >
                  <span className="nav-item-icon">{meta.icon}</span>
                  <span className="nav-item-label">{meta.label}</span>
                  {meta.count !== undefined && state && <span className="nav-count">{meta.count}</span>}
                </button>
              );
            })}
          </div>
          <div className="top-nav-right">
            <button
              className={`nav-item top-nav-item ${view === "settings" ? "active" : ""}`}
              onClick={() => navigateTo("settings")}
              title={t(lang, "nav.settings")}
            >
              <span className="nav-item-icon"><IconSettings /></span>
              <span className="nav-item-label">{t(lang, "nav.settings")}</span>
            </button>
          </div>
        </div>
      </aside>
    );
  }

  return (
    <aside
      className={`sidebar ${collapsed ? "collapsed" : ""} ${
        isSidebarRight ? "dock-right" : "dock-left"
      }`}
      style={{ position: "relative" }}
    >
      {isEditMode && (
        <button
          className="sidebar-flip-handle"
          onClick={toggleSidebarPosition}
          title="Сменить положение меню (Слева / Справа / Сверху)"
          style={
            !isSidebarRight
              ? { right: "-12px" }
              : { left: "-12px" }
          }
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M7 16l-4-4m0 0l4-4m-4 4h18m-4 4l4-4m0 0l-4-4" />
          </svg>
        </button>
      )}
      {/* Top section: search and sidebar toggle */}
      {!collapsed ? (
        <div className="sidebar-header">
          <div className="ssearch" onClick={() => navigateTo("search")} title={t(lang, "nav.searchEverything")}>
            <IconSearch />
            <span className="ssearch-text">{t(lang, "nav.searchEverything")}</span>
          </div>
          <button
            className="sidebar-toggle-btn"
            onClick={toggleCollapsed}
            title={t(lang, "nav.collapse")}
            aria-label={t(lang, "nav.collapse")}
          >
            <IconCollapse />
          </button>
        </div>
      ) : (
        <div className="sidebar-header collapsed">
          <button
            className="sidebar-toggle-btn"
            onClick={toggleCollapsed}
            title={t(lang, "nav.expand")}
            aria-label={t(lang, "nav.expand")}
          >
            <IconExpand />
          </button>
          <button
            className={`nav-item icon-only ${view === "search" ? "active" : ""}`}
            onClick={() => navigateTo("search")}
            title={t(lang, "nav.searchEverything")}
            aria-label={t(lang, "nav.searchEverything")}
          >
            <span className="nav-item-icon"><IconSearch /></span>
          </button>
        </div>
      )}

      {/* Main navigation list */}
      <div className="nav">
        {nav("home")}
        {nav("favorites")}
        {nav("playlists")}
        {nav("wave")}
        {nav("recent")}
        {nav("queue")}
      </div>

      {/* Playlists section */}
      {!collapsed ? (
        <div className="nav">
          <div className="nav-label-row">
            <span
              className={`nav-chevron ${plExpanded ? "open" : "closed"}`}
              onClick={() => setPlExpanded((v) => !v)}
              aria-label="Toggle playlists"
              title={plExpanded ? "Свернуть плейлисты" : "Развернуть плейлисты"}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
            </span>
            <span
              className="nav-label"
              style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, cursor: "pointer" }}
              onClick={() => setPlExpanded((v) => !v)}
            >
              {t(lang, "nav.playlists")}
            </span>
            <span className="plus" onClick={(e) => { e.stopPropagation(); setCreateOpen(true); }} aria-label="Создать плейлист" title="Создать плейлист">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </span>
          </div>
          <div
            style={{ display: "flex", flexDirection: "column", gap: 1 }}
            onMouseUp={onItemMouseUp}
            onMouseLeave={() => setDragOver(null)}
          >
            {plExpanded &&
              state?.playlists.map((p, i) => (
                <button
                  key={p.id}
                  className={`pl-item ${view === "playlist" && playlistId === p.id ? "active" : ""}`}
                  onMouseDown={(e) => onItemMouseDown(e, i)}
                  onMouseEnter={() => onItemMouseEnter(i)}
                  style={{
                    cursor: "grab",
                    userSelect: "none",
                    ...(dragOver === i && dragRef.current
                      ? { boxShadow: "inset 0 2px 0 0 var(--text)" }
                      : {}),
                  }}
                  onClick={() => navigateTo("playlist", { playlistId: p.id })}
                >
                  {p.cover_url || p.tracks[0]?.artwork_url ? (
                    <div
                      className="pl-mark"
                      style={{
                        background: "var(--track)",
                        overflow: "hidden",
                      }}
                    >
                      <img
                        src={resolveArtworkUrl(p.cover_url ?? p.tracks[0]?.artwork_url) ?? ""}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      />
                    </div>
                  ) : (
                    <div
                      className="pl-mark"
                      style={{
                        background: `var(--track${((p.tracks.length % 4) + 1)})`,
                      }}
                    />
                  )}
                  <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {p.title}
                  </span>
                </button>
              ))}
          </div>
        </div>
      ) : (
        <div className="collapsed-playlists">
          <button
            className="collapsed-add-pl"
            onClick={() => setCreateOpen(true)}
            title={t(lang, "playlists.createName")}
            aria-label={t(lang, "playlists.createName")}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </button>
          {state?.playlists.map((p) => {
            const isActive = view === "playlist" && playlistId === p.id;
            return (
              <button
                key={p.id}
                className={`pl-item-collapsed ${isActive ? "active" : ""}`}
                onClick={() => navigateTo("playlist", { playlistId: p.id })}
                title={p.title}
                aria-label={p.title}
              >
                {p.cover_url || p.tracks[0]?.artwork_url ? (
                  <div className="pl-mark-collapsed">
                    <img
                      src={resolveArtworkUrl(p.cover_url ?? p.tracks[0]?.artwork_url) ?? ""}
                      alt=""
                      loading="lazy"
                      decoding="async"
                      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                    />
                  </div>
                ) : (
                  <div
                    className="pl-mark-collapsed"
                    style={{
                      background: `var(--track${((p.tracks.length % 4) + 1)})`,
                    }}
                  />
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Bottom section: settings */}
      {!collapsed ? (
        <div
          className="nav"
          style={{ marginTop: "auto", borderTop: "1px solid var(--border)", paddingTop: "10px" }}
        >
          <button
            className={`nav-item ${view === "settings" ? "active" : ""}`}
            onClick={() => navigateTo("settings")}
            title={t(lang, "nav.settings")}
          >
            <span className="nav-item-icon"><IconSettings /></span>
            <span className="nav-item-label">{t(lang, "nav.settings")}</span>
          </button>
        </div>
      ) : (
        <div className="sidebar-bottom-collapsed">
          <button
            className={`nav-item icon-only ${view === "settings" ? "active" : ""}`}
            onClick={() => navigateTo("settings")}
            title={t(lang, "nav.settings")}
            aria-label={t(lang, "nav.settings")}
          >
            <span className="nav-item-icon"><IconSettings /></span>
          </button>
        </div>
      )}

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
  );
}