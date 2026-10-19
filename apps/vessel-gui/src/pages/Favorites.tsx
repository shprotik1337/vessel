import { useEffect, useRef, useState } from "react";

import { useApp } from "../store";
import { TrackRow } from "../components/TrackRow";
import { VirtualTrackList } from "../components/VirtualTrackList";
import { trackKey, artistLabel, formatDuration } from "../lib/utils";
import { t } from "../i18n";
import type { TrackRef } from "../api/types";
import * as api from "../api/commands";

type SortMode = "custom" | "title" | "artist" | "added";
type SortDir = "asc" | "desc";

export function Favorites() {
  const { state, playTracks, showToast, navigateTo, refresh, goBack, lang, cacheProgress } = useApp();
  const dragRef = useRef<{ from: number } | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [sort, setSort] = useState<SortMode>("custom");
  const [dir, setDir] = useState<SortDir>("desc");
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [likedTimes, setLikedTimes] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (!sortDropdownOpen) return;
    const close = () => setSortDropdownOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [sortDropdownOpen]);

  useEffect(() => {
    void (async () => {
      try {
        const times = await api.getLibraryTimes();
        setLikedTimes(new Map(times.map((t) => [t.key, t.timestamp_ms])));
      } catch {
        // сортировка по дате просто не сработает
      }
    })();
  }, [refresh]);

  if (!state) return null;

  const nowKey = state.now_playing ? trackKey(state.now_playing) : null;
  const favTracks = state.library;

  const sortTracks = (tracks: TrackRef[]): TrackRef[] => {
    if (sort === "custom") return tracks;
    const arr = [...tracks];
    const mult = dir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sort) {
        case "title":
          return a.title.localeCompare(b.title) * mult;
        case "artist":
          return artistLabel(a.artists).localeCompare(artistLabel(b.artists)) * mult;
        case "added":
          return (
            ((likedTimes.get(trackKey(b)) ?? 0) - (likedTimes.get(trackKey(a)) ?? 0)) * mult
          );
        default:
          return 0;
      }
    });
    return arr;
  };

  const visible = sortTracks(favTracks);

  const playOne = (track: TrackRef) => {
    const idx = visible.findIndex((t) => trackKey(t) === trackKey(track));
    void playTracks(visible, idx < 0 ? 0 : idx);
  };

  const playAll = async () => {
    if (visible.length === 0) return;
    try {
      await api.playTracks(visible, 0);
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const shufflePlay = async () => {
    const tracks = [...favTracks].sort(() => Math.random() - 0.5);
    if (tracks.length === 0) return;
    try {
      await api.playTracks(tracks, 0);
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const downloadAll = async () => {
    if (favTracks.length === 0 || cacheProgress) return;
    try {
      showToast(lang === "ru" ? "Запуск кэширования…" : "Starting caching…");
      const res = await api.downloadAllToCache(favTracks);
      if (res.downloaded === 0 && res.failed === 0) {
        showToast(
          lang === "ru"
            ? `Все треки уже в кэше (${res.skipped})`
            : `All tracks are already cached (${res.skipped})`,
          false,
          5000,
        );
      } else {
        const parts: string[] = [];
        if (res.downloaded > 0) {
          parts.push(lang === "ru" ? `Скачано: ${res.downloaded}` : `Downloaded: ${res.downloaded}`);
        }
        if (res.skipped > 0) {
          parts.push(lang === "ru" ? `в кэше: ${res.skipped}` : `already cached: ${res.skipped}`);
        }
        if (res.failed > 0) {
          parts.push(lang === "ru" ? `сбоев: ${res.failed}` : `failed: ${res.failed}`);
        }
        showToast(parts.join(" · "), res.failed > 0 && res.downloaded === 0, 5500);
      }
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const reorder = async (from: number, to: number) => {
    try {
      await api.reorderLibrary(from, to);
      await refresh();
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const onRowMouseDown = (e: React.MouseEvent, i: number) => {
    if (e.button !== 0) return;
    if (sort !== "custom") return;
    dragRef.current = { from: i };
    setDragOver(i);
  };

  const onRowMouseEnter = (i: number) => {
    if (dragRef.current && dragOver !== i) setDragOver(i);
  };

  const onRowMouseUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag && dragOver != null && drag.from !== dragOver) {
      void reorder(drag.from, dragOver);
    }
    setDragOver(null);
  };

  const sortOptions: { mode: SortMode; label: string }[] = [
    { mode: "custom", label: t(lang, "playlist.customOrder") },
    { mode: "title", label: t(lang, "playlist.titleSort") },
    { mode: "artist", label: t(lang, "playlist.artistSort") },
    { mode: "added", label: t(lang, "playlist.dateAdded") },
  ];

  const toggleSort = (mode: SortMode) => {
    if (sort === mode) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(mode);
      setDir("desc");
    }
  };

  const totalMs = favTracks.reduce((sum, t) => sum + (t.duration_ms ?? 0), 0);

  return (
    <div className="view">
      <div style={{ marginBottom: 18 }}>
        <button className="btn-back-pill" onClick={goBack} title={t(lang, "common.back")}>
          {t(lang, "common.back")}
        </button>
      </div>

      <div className="page-panel">
        <div className="page-ambient-glow-fav" />
        <div className="page-panel-header">
          <div className="hero-ref">
            <div className="fav-cover-large" title={t(lang, "favorites.title")}>
              <svg width="84" height="84" viewBox="0 0 24 24" fill="#ffffff">
                <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
              </svg>
            </div>
            <div className="hero-ref-info">
              <div className="hero-ref-title" style={{ maxWidth: 650, wordBreak: "break-word" }}>
                {t(lang, "favorites.title")}
              </div>
              <div className="hero-ref-subtitle">
                {lang === "ru" ? "Моя медиатека" : "My Library"}
              </div>
              <div className="hero-ref-meta">
                <span>{favTracks.length} {t(lang, "common.tracks")}</span>
                {totalMs > 0 && (
                  <>
                    <span>·</span>
                    <span>{formatDuration(totalMs)}</span>
                  </>
                )}
              </div>
              <div className="hero-ref-actions">
                <button className="btn-pill btn-pill-primary" onClick={playAll}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  <span>{t(lang, "playlist.play")}</span>
                </button>
                <button className="btn-pill" onClick={shufflePlay}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
                  <span>{t(lang, "favorites.shuffle")}</span>
                </button>
                <button
                  className="btn-pill"
                  onClick={downloadAll}
                  disabled={Boolean(cacheProgress)}
                  title={t(lang, "favorites.cacheTitle")}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  <span>
                    {cacheProgress
                      ? (lang === "ru"
                          ? `Кэширование ${cacheProgress.completed}/${cacheProgress.total}…`
                          : `Caching ${cacheProgress.completed}/${cacheProgress.total}…`)
                      : t(lang, "favorites.cache")}
                  </span>
                </button>
                <div className="sort-dropdown-wrap" onClick={(e) => e.stopPropagation()}>
                  <button
                    className={`btn-pill ${sort !== "custom" ? "btn-pill-active" : ""}`}
                    onClick={() => setSortDropdownOpen((v) => !v)}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 15l5 5 5-5M7 9l5-5 5 5"/></svg>
                    <span>
                      {sort === "custom"
                        ? (lang === "ru" ? "Сортировка" : "Sort")
                        : (sortOptions.find((o) => o.mode === sort)?.label ?? "")}
                      {sort !== "custom" && (dir === "asc" ? " ↑" : " ↓")}
                    </span>
                    <span style={{ fontSize: 9, opacity: 0.7, marginLeft: 2 }}>▾</span>
                  </button>
                  {sortDropdownOpen && (
                    <div className="sort-dropdown-menu">
                      {sortOptions.map((opt) => (
                        <div
                          key={opt.mode}
                          className={`sort-dropdown-item ${sort === opt.mode ? "active" : ""}`}
                          onClick={() => {
                            toggleSort(opt.mode);
                            setSortDropdownOpen(false);
                          }}
                        >
                          <span>{opt.label}</span>
                          {sort === opt.mode && opt.mode !== "custom" && (
                            <span className="sort-dropdown-badge">
                              {dir === "asc" ? "↑" : "↓"}
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="page-panel-body">
          {favTracks.length === 0 ? (
            <div className="empty">
              <div className="t1">{t(lang, "favorites.empty1")}</div>
              <div className="t2">{t(lang, "favorites.empty2")}</div>
            </div>
          ) : (
            <VirtualTrackList
              items={visible}
              onMouseUp={onRowMouseUp}
              onMouseLeave={() => setDragOver(null)}
              renderItem={(track, i) => (
                <div
                  key={trackKey(track) + i}
                  onMouseDown={(e) => onRowMouseDown(e, i)}
                  onMouseEnter={() => onRowMouseEnter(i)}
                  style={{
                    cursor: "grab",
                    userSelect: "none",
                    ...(dragOver === i && dragRef.current
                      ? { boxShadow: "inset 0 2px 0 0 var(--text)" }
                      : {}),
                  }}
                >
                  <TrackRow
                    track={track}
                    index={i}
                    nowKey={nowKey}
                    onPlay={playOne}
                    onArtistClick={(name, provider) => navigateTo("artist", { artist: name, provider })}
                  />
                </div>
              )}
            />
          )}
        </div>
      </div>
    </div>
  );
}