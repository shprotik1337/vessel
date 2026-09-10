import { useRef, useState } from "react";

import { useApp } from "../store";
import { providerLabel } from "../lib/utils";
import { TextInputModal } from "./Modal";
import { t } from "../i18n";
import * as api from "../api/commands";

export function Sidebar() {
  const { state, view, playlistId, navigateTo, showToast, refresh, lang } = useApp();
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

  const nav = (v: string) => (
    <button
      className={`nav-item ${view === v ? "active" : ""}`}
      onClick={() => navigateTo(v)}
    >
      <span>
        {v === "home"
          ? t(lang, "nav.home")
          : v === "wave"
            ? t(lang, "wave.title")
            : v === "search"
              ? t(lang, "nav.search")
              : v === "library"
                ? t(lang, "nav.library")
                : v === "playlists"
                  ? t(lang, "nav.playlists")
                  : v === "favorites"
                    ? t(lang, "nav.favorites")
                    : v === "recent"
                      ? t(lang, "nav.recent")
                      : v === "queue"
                        ? t(lang, "nav.queue")
                        : v}
      </span>
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
        <span>{t(lang, "nav.searchEverything")}</span>
        <span className="kbd">⌘K</span>
      </div>
      <div className="nav">
        {nav("home")}
        {nav("wave")}
        {nav("favorites")}
        {nav("playlists")}
        {nav("recent")}
        {nav("queue")}
      </div>
      <div className="nav">
        <div className="nav-label-row">
          <span
            className={`nav-chevron ${plExpanded ? "open" : "closed"}`}
            onClick={() => setPlExpanded((v) => !v)}
            aria-label="Toggle playlists"
            title={plExpanded ? "Свернуть плейлисты" : "Развернуть плейлисты"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"/></svg>
          </span>
          <span
            className="nav-label"
            style={{ display: "flex", alignItems: "center", gap: 6, flex: 1, cursor: "pointer" }}
            onClick={() => setPlExpanded((v) => !v)}
          >
            {t(lang, "nav.playlists")}
          </span>
          <span className="plus" onClick={(e) => { e.stopPropagation(); setCreateOpen(true); }} aria-label="Создать плейлист" title="Создать плейлист">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
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
                    src={p.cover_url ?? p.tracks[0]?.artwork_url ?? ""}
                    alt=""
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
      <div
        className="nav"
        style={{ marginTop: "auto", borderTop: "1px solid var(--border)", paddingTop: "14px" }}
      >
        <span className="nav-label">{t(lang, "nav.sources")}</span>
        {state?.providers.map((p) => (
          <div key={p.kind} className={`src-row ${!p.enabled ? "dis" : ""}`}>
            <span>{providerLabel(p.kind)}</span>
            {p.enabled ? (
              <span
                className="src-dot"
                style={{ background: p.connected ? "#9A9BA1" : "var(--red)" }}
              />
            ) : (
              <span className="src-soon">{t(lang, "settings.off")}</span>
            )}
          </div>
        ))}
        <button
          className={`nav-item ${view === "settings" ? "active" : ""}`}
          style={{ marginTop: "6px" }}
          onClick={() => navigateTo("settings")}
        >
          <span>{t(lang, "nav.settings")}</span>
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
  );
}