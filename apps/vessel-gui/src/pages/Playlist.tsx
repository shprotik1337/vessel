import { useState, useRef, useEffect } from "react";

import { useApp } from "../store";
import { TrackRow } from "../components/TrackRow";
import { VirtualTrackList } from "../components/VirtualTrackList";
import { PlaylistCover } from "../components/PlaylistCover";
import { TextInputModal, ConfirmModal } from "../components/Modal";
import { trackKey, formatDuration, artistLabel } from "../lib/utils";
import { t } from "../i18n";
import type { TrackRef } from "../api/types";
import * as api from "../api/commands";

interface PlaylistDetailProps {
  playlistId: string;
}

type SortMode = "custom" | "title" | "artist" | "added";
type SortDir = "asc" | "desc";

export function PlaylistDetail({ playlistId }: PlaylistDetailProps) {
  const { state, playTracks, showToast, refresh, navigateTo, goBack, lang, cacheProgress, externalPlaylist } = useApp();
  const [sort, setSort] = useState<SortMode>("custom");
  const [dir, setDir] = useState<SortDir>("desc");
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [addedTimes, setAddedTimes] = useState<Map<string, number>>(new Map());
  const [renameOpen, setRenameOpen] = useState(false);
  const [coverOpen, setCoverOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [savingPlaylist, setSavingPlaylist] = useState(false);
  const [excludedPlaylists, setExcludedPlaylists] = useState<string[]>([]);
  const dragRef = useRef<{ from: number } | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);

  useEffect(() => {
    void api.getExcludedRecommendationPlaylists().then(setExcludedPlaylists).catch(() => {});
  }, []);

  useEffect(() => {
    if (!sortDropdownOpen && !menuOpen) return;
    const close = () => {
      setSortDropdownOpen(false);
      setMenuOpen(false);
    };
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [sortDropdownOpen, menuOpen]);

  useEffect(() => {
    if (playlistId === "external") return;
    void (async () => {
      try {
        const times = await api.getPlaylistTrackTimes(playlistId);
        setAddedTimes(new Map(times.map((t) => [t.key, t.timestamp_ms])));
      } catch {
        // сортировка по дате просто не сработает
      }
    })();
  }, [playlistId, refresh]);

  if (!state) return null;

  const foundPlaylist = state.playlists.find((p) => p.id === playlistId);
  const isSaved = Boolean(foundPlaylist);
  const playlist = foundPlaylist || externalPlaylist;
  if (!playlist) {
    return (
      <div className="view">
        <div className="empty">
          <div className="ico">?</div>
          <div className="t1">{t(lang, "playlist.notFound1")}</div>
          <div className="t2">{t(lang, "playlist.notFound2")}</div>
        </div>
      </div>
    );
  }

  const nowKey = state.now_playing ? trackKey(state.now_playing) : null;
  const totalMs = playlist.tracks.reduce((sum, t) => sum + (t.duration_ms ?? 0), 0);

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
        case "added": {
          const diff = (addedTimes.get(trackKey(b)) ?? 0) - (addedTimes.get(trackKey(a)) ?? 0);
          if (diff !== 0) return diff * mult;
          return tracks.indexOf(a) - tracks.indexOf(b);
        }
        default:
          return 0;
      }
    });
    return arr;
  };

  const visible = sortTracks(playlist.tracks);

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
    if (visible.length === 0) return;
    const arr = [...visible].sort(() => Math.random() - 0.5);
    try {
      await api.playTracks(arr, 0);
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const downloadAll = async () => {
    if (visible.length === 0 || cacheProgress) return;
    try {
      showToast(lang === "ru" ? "Запуск кэширования…" : "Starting caching…");
      const res = await api.downloadAllToCache(visible);
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

  const removeAt = async (index: number) => {
    try {
      await api.removeFromPlaylist(playlist.id, index);
      await refresh();
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const rename = async (title: string) => {
    const name = title.trim();
    if (!name || name === playlist.title) return;
    try {
      await api.renamePlaylist(playlist.id, name);
      await refresh();
      setRenameOpen(false);
      showToast(`${t(lang, "common.renamed")} ${name}`);
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const changeCover = async (value: string) => {
    try {
      await api.setPlaylistCover(playlist.id, value.trim() || null);
      await refresh();
      setCoverOpen(false);
      showToast(value.trim() ? t(lang, "playlist.coverUpdated") : t(lang, "playlist.coverReset"));
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const deletePl = async () => {
    try {
      await api.deletePlaylist(playlist.id);
      await refresh();
      setDeleteOpen(false);
      navigateTo("playlists");
      showToast(`${t(lang, "common.deleted")} ${playlist.title}`);
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const reorder = async (from: number, to: number) => {
    try {
      await api.reorderPlaylist(playlist.id, from, to);
      await refresh();
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const onRowMouseDown = (e: React.MouseEvent, i: number) => {
    if (sort !== "custom") return;
    if (e.button !== 0) return;
    dragRef.current = { from: i };
    setDragOver(i);
  };

  const onRowMouseEnter = (i: number) => {
    if (dragRef.current && dragOver !== i) setDragOver(i);
  };

  const onRowMouseUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (isSaved && drag && dragOver != null && drag.from !== dragOver) {
      void reorder(drag.from, dragOver);
    }
    setDragOver(null);
  };

  const handleSaveToLibrary = async () => {
    if (!playlist || savingPlaylist) return;
    setSavingPlaylist(true);
    try {
      await api.saveImportedPlaylist(playlist);
      await refresh();
      showToast(lang === "ru" ? "Плейлист добавлен в библиотеку" : "Playlist saved to library");
    } catch (err) {
      showToast(String(err), true);
    } finally {
      setSavingPlaylist(false);
    }
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

  const isExcludedFromTaste = excludedPlaylists.includes(playlist.id);

  const handleToggleTasteExclusion = async () => {
    try {
      const isNowExcluded = await api.togglePlaylistTasteExclusion(playlist.id);
      setExcludedPlaylists((prev) =>
        isNowExcluded ? [...prev, playlist.id] : prev.filter((id) => id !== playlist.id)
      );
      setMenuOpen(false);
      showToast(
        isNowExcluded
          ? (lang === "ru" ? "Плейлист исключён из анализа вкуса" : "Playlist excluded from taste profile")
          : (lang === "ru" ? "Плейлист снова учитывается в рекомендациях" : "Playlist included back into recommendations")
      );
    } catch (e) {
      showToast(String(e), true);
    }
  };

  return (
    <div className="view">
      <div style={{ marginBottom: 18 }}>
        <button className="btn btn-outline btn-sm" onClick={goBack} title={t(lang, "common.back")}>
          {t(lang, "common.back")}
        </button>
      </div>
      <div className="page-panel">
        {playlist.cover_url || playlist.tracks[0]?.artwork_url ? (
          <div
            className="page-ambient-glow"
            style={{
              backgroundImage: `url("${playlist.cover_url || playlist.tracks[0]?.artwork_url}")`,
            }}
          />
        ) : (
          <div className="page-ambient-glow-fallback" />
        )}
        <div className="page-panel-header">
          <div className="hero-ref">
            <div className="hero-ref-cover">
              <PlaylistCover tracks={playlist.tracks} coverUrl={playlist.cover_url} size={260} borderRadius={20} />
            </div>
            <div className="hero-ref-info">
              <div className="hero-ref-title" style={{ maxWidth: 650, wordBreak: "break-word" }}>
                {playlist.title}
              </div>
              <div className="hero-ref-subtitle">
                {playlist.source_url?.includes("album") ? (lang === "ru" ? "Альбом" : "Album") : t(lang, "playlist.title")}
              </div>
              <div className="hero-ref-meta">
                <span>{playlist.tracks.length} {t(lang, "common.tracks")}</span>
                <span>·</span>
                <span>{formatDuration(totalMs)}</span>
                {isExcludedFromTaste && (
                  <>
                    <span>·</span>
                    <button
                      type="button"
                      onClick={handleToggleTasteExclusion}
                      title={lang === "ru" ? "Нажмите, чтобы вернуть плейлист в рекомендации" : "Click to include back into recommendations"}
                      style={{
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 5,
                        padding: "3px 9px",
                        borderRadius: "10px",
                        fontSize: 11,
                        fontWeight: 500,
                        background: "rgba(255, 100, 100, 0.12)",
                        color: "#ff7b72",
                        border: "1px solid rgba(255, 100, 100, 0.25)",
                        cursor: "pointer",
                      }}
                    >
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <circle cx="12" cy="12" r="10" />
                        <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
                      </svg>
                      <span>{lang === "ru" ? "Исключён из вкуса" : "Excluded from taste"}</span>
                    </button>
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
                {!isSaved && (
                  <button className="btn-pill" onClick={handleSaveToLibrary} disabled={savingPlaylist}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M12 5v14M5 12h14" />
                    </svg>
                    <span>{savingPlaylist ? (lang === "ru" ? "Добавление…" : "Adding…") : (lang === "ru" ? "Добавить в плейлисты" : "Save to library")}</span>
                  </button>
                )}
                <button
                  className="btn-pill"
                  onClick={downloadAll}
                  disabled={Boolean(cacheProgress)}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                  <span>
                    {cacheProgress
                      ? (lang === "ru"
                          ? `Кэширование ${cacheProgress.completed}/${cacheProgress.total}…`
                          : `Caching ${cacheProgress.completed}/${cacheProgress.total}…`)
                      : t(lang, "playlist.cache")}
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
                {isSaved && (
                  <div className="sort-dropdown-wrap" onClick={(e) => e.stopPropagation()}>
                    <button
                      className="btn-pill btn-pill-ghost btn-pill-icon"
                      onClick={() => setMenuOpen((v) => !v)}
                      title={t(lang, "trackrow.more")}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="5" cy="12" r="2" />
                        <circle cx="12" cy="12" r="2" />
                        <circle cx="19" cy="12" r="2" />
                      </svg>
                    </button>
                    {menuOpen && (
                      <div className="sort-dropdown-menu" style={{ minWidth: 170 }}>
                        <div
                          className="sort-dropdown-item"
                          onClick={() => { setMenuOpen(false); setRenameOpen(true); }}
                        >
                          {t(lang, "playlist.rename")}
                        </div>
                        <div
                          className="sort-dropdown-item"
                          onClick={() => { setMenuOpen(false); setCoverOpen(true); }}
                        >
                          {t(lang, "playlist.cover")}
                        </div>
                        <div
                          className="sort-dropdown-item"
                          onClick={handleToggleTasteExclusion}
                        >
                          {isExcludedFromTaste
                            ? (lang === "ru" ? "✓ Учитывать во вкусе" : "✓ Include in recommendations")
                            : (lang === "ru" ? "Исключить из моего вкуса" : "Exclude from taste profile")}
                        </div>
                        <div
                          className="sort-dropdown-item"
                          style={{ color: "var(--red)" }}
                          onClick={() => { setMenuOpen(false); setDeleteOpen(true); }}
                        >
                          {t(lang, "playlist.delete")}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        <div className="page-panel-body">
          {playlist.tracks.length === 0 ? (
            <div className="empty">
              <div className="ico">♫</div>
              <div className="t1">{t(lang, "playlist.empty1")}</div>
              <div className="t2">{t(lang, "playlist.empty2")}</div>
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
                    ...(sort === "custom" && isSaved ? { cursor: "grab", userSelect: "none" } : {}),
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
                    onRemove={isSaved ? () => removeAt(playlist.tracks.findIndex((t) => trackKey(t) === trackKey(track))) : undefined}
                  />
                </div>
              )}
            />
          )}
        </div>
      </div>

      {renameOpen && (
        <TextInputModal
          lang={lang}
          title={t(lang, "playlist.renamePrompt")}
          initial={playlist.title}
          confirmText={t(lang, "common.rename")}
          onSubmit={rename}
          onClose={() => setRenameOpen(false)}
        />
      )}

      {coverOpen && (
        <TextInputModal
          lang={lang}
          title={t(lang, "playlist.coverPrompt")}
          initial={playlist.cover_url ?? ""}
          placeholder="https://…"
          confirmText={t(lang, "common.save")}
          onSubmit={changeCover}
          onClose={() => setCoverOpen(false)}
        />
      )}

      {deleteOpen && (
        <ConfirmModal
          lang={lang}
          title={t(lang, "playlist.deleteConfirm").replace("{title}", playlist.title)}
          confirmText={t(lang, "common.delete")}
          onConfirm={deletePl}
          onClose={() => setDeleteOpen(false)}
        />
      )}
    </div>
  );
}