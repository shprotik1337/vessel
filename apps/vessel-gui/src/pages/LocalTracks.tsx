import { useCallback, useEffect, useMemo, useState } from "react";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { PageAmbientBackdrop } from "../components/PageAmbientBackdrop";
import { TrackRow } from "../components/TrackRow";
import { VirtualTrackList } from "../components/VirtualTrackList";
import { useApp } from "../store";
import { artistLabel, formatDuration, trackKey } from "../lib/utils";
import { t } from "../i18n";
import type { TrackRef } from "../api/types";
import * as api from "../api/commands";

type SortMode = "default" | "title" | "artist";
type SortDir = "asc" | "desc";

export function LocalTracks() {
  const {
    state,
    playTracks,
    smartShuffle,
    showToast,
    goBack,
    lang,
  } = useApp();

  const [tracks, setTracks] = useState<TrackRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [dragHover, setDragHover] = useState(false);
  const [sort, setSort] = useState<SortMode>("default");
  const [dir, setDir] = useState<SortDir>("asc");
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);

  const loadTracks = useCallback(async () => {
    try {
      const list = await api.getLocalTracks();
      setTracks(list);
    } catch (err) {
      showToast(String(err), true);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    void loadTracks();
  }, [loadTracks]);

  useEffect(() => {
    if (!sortDropdownOpen) return;
    const close = () => setSortDropdownOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [sortDropdownOpen]);

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    let active = true;

    void getCurrentWebview()
      .onDragDropEvent(async (event) => {
        if (!active) return;
        const payload = event.payload;
        if (payload.type === "enter" || payload.type === "over") {
          setDragHover(true);
        } else if (payload.type === "leave") {
          setDragHover(false);
        } else if (payload.type === "drop") {
          setDragHover(false);
          if (payload.paths.length === 0) return;
          setAdding(true);
          try {
            const updated = await api.addLocalTrackPaths(payload.paths);
            if (!active) return;
            const addedCount = Math.max(0, updated.length - tracks.length);
            setTracks(updated);
            showToast(
              addedCount > 0
                ? (lang === "ru" ? `Добавлено треков: ${addedCount}` : `Added tracks: ${addedCount}`)
                : (lang === "ru" ? "Аудиофайлы обновлены" : "Audio files updated")
            );
          } catch (err) {
            if (active) showToast(String(err), true);
          } finally {
            if (active) setAdding(false);
          }
        }
      })
      .then((fn) => {
        if (active) {
          unlisten = fn;
        } else {
          fn();
        }
      })
      .catch(() => {});

    return () => {
      active = false;
      if (unlisten) unlisten();
    };
  }, [lang, showToast, tracks.length]);

  const visible = useMemo(() => {
    if (sort === "default") return tracks;
    const arr = [...tracks];
    const mult = dir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      if (sort === "title") return a.title.localeCompare(b.title) * mult;
      if (sort === "artist") return artistLabel(a.artists).localeCompare(artistLabel(b.artists)) * mult;
      return 0;
    });
    return arr;
  }, [tracks, sort, dir]);

  if (!state) return null;

  const nowKey = state.now_playing ? trackKey(state.now_playing) : null;
  const totalMs = tracks.reduce((sum, item) => sum + (item.duration_ms ?? 0), 0);

  const playOne = (track: TrackRef) => {
    const idx = visible.findIndex((item) => trackKey(item) === trackKey(track));
    void playTracks(visible, idx < 0 ? 0 : idx, false);
  };

  const playAll = () => {
    if (visible.length === 0) return;
    void playTracks(visible, 0, true);
  };

  const shufflePlay = async () => {
    if (visible.length === 0) return;
    if (!state.player.shuffle && !smartShuffle) {
      try {
        await api.setShuffle(true);
      } catch {}
    }
    void playTracks(visible, Math.floor(Math.random() * visible.length), true, {
      preserveShuffle: true,
    });
  };

  const handlePickFiles = async () => {
    if (adding) return;
    setAdding(true);
    try {
      const before = tracks.length;
      const updated = await api.pickAndAddLocalTracks();
      setTracks(updated);
      const diff = updated.length - before;
      if (diff > 0) {
        showToast(lang === "ru" ? `Добавлено треков: ${diff}` : `Added tracks: ${diff}`);
      }
    } catch (err) {
      showToast(String(err), true);
    } finally {
      setAdding(false);
    }
  };

  const handleRemove = async (track: TrackRef) => {
    try {
      const updated = await api.removeLocalTrack(track.id);
      setTracks(updated);
      showToast(lang === "ru" ? `Убрано из списка: ${track.title}` : `Removed: ${track.title}`);
    } catch (err) {
      showToast(String(err), true);
    }
  };

  const sortOptions: { mode: SortMode; label: string }[] = [
    { mode: "default", label: t(lang, "playlist.customOrder") },
    { mode: "title", label: t(lang, "playlist.titleSort") },
    { mode: "artist", label: t(lang, "playlist.artistSort") },
  ];

  const toggleSort = (mode: SortMode) => {
    if (sort === mode) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(mode);
      setDir("asc");
    }
  };

  return (
    <div className={`view ${dragHover ? "local-drop-active" : ""}`}>
      <div style={{ marginBottom: 18 }}>
        <button className="btn-back-pill" onClick={goBack} title={t(lang, "common.back")}>
          {t(lang, "common.back")}
        </button>
      </div>

      <div className="page-panel">
        <PageAmbientBackdrop fallbackClass="page-ambient-glow-fav" />
        <div className="page-panel-header">
          <div className="hero-ref">
            <div className="fav-cover-large" title={lang === "ru" ? "На устройстве" : "On Device"}>
              <svg
                width="84"
                height="84"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--text)"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div className="hero-ref-info">
              <div className="hero-ref-title" style={{ maxWidth: 650, wordBreak: "break-word" }}>
                {lang === "ru" ? "На устройстве" : "On Device"}
              </div>
              <div className="hero-ref-subtitle" style={{ whiteSpace: "normal" }}>
                {lang === "ru"
                  ? "Твои аудиофайлы. Они хранятся только на этом компьютере и не уходят на серверы Vessel."
                  : "Your audio files. Stored only on this computer and never uploaded to Vessel servers."}
              </div>
              <div className="hero-ref-meta">
                <span>{tracks.length} {t(lang, "common.tracks")}</span>
                {totalMs > 0 && (
                  <>
                    <span>·</span>
                    <span>{formatDuration(totalMs)}</span>
                  </>
                )}
              </div>
              <div className="hero-ref-actions">
                <button className="btn-pill btn-pill-primary" onClick={playAll} disabled={visible.length === 0}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <polygon points="5 3 19 12 5 21 5 3" />
                  </svg>
                  <span>{t(lang, "playlist.play")}</span>
                </button>
                <button className="btn-pill" onClick={shufflePlay} disabled={visible.length === 0}>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="16 3 21 3 21 8" />
                    <line x1="4" y1="20" x2="21" y2="3" />
                    <polyline points="21 16 21 21 16 21" />
                    <line x1="15" y1="15" x2="21" y2="21" />
                    <line x1="4" y1="4" x2="9" y2="9" />
                  </svg>
                  <span>{t(lang, "favorites.shuffle")}</span>
                </button>
                <button className="btn-pill" onClick={handlePickFiles} disabled={adding}>
                  <svg
                    width="12"
                    height="12"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>
                    {adding
                      ? (lang === "ru" ? "Добавление…" : "Adding…")
                      : (lang === "ru" ? "Добавить файлы" : "Add files")}
                  </span>
                </button>
                <div className="sort-dropdown-wrap" onClick={(e) => e.stopPropagation()}>
                  <button
                    className={`btn-pill ${sort !== "default" ? "btn-pill-active" : ""}`}
                    onClick={() => setSortDropdownOpen((v) => !v)}
                  >
                    <svg
                      width="12"
                      height="12"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M7 15l5 5 5-5M7 9l5-5 5 5" />
                    </svg>
                    <span>
                      {sort === "default"
                        ? lang === "ru"
                          ? "Сортировка"
                          : "Sort"
                        : sortOptions.find((o) => o.mode === sort)?.label ?? ""}
                      {sort !== "default" && (dir === "asc" ? " ↑" : " ↓")}
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
                          {sort === opt.mode && opt.mode !== "default" && (
                            <span className="sort-dropdown-badge">{dir === "asc" ? "↑" : "↓"}</span>
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
          {loading ? (
            <div className="empty">
              <div className="t2">{lang === "ru" ? "Загрузка файлов…" : "Loading files…"}</div>
            </div>
          ) : visible.length === 0 ? (
            <div className="local-empty-state">
              <svg
                width="42"
                height="42"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--text3)"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <path d="M12 18v-5" />
                <circle cx="10.5" cy="18" r="1.5" fill="var(--text3)" stroke="none" />
              </svg>
              <div className="t1">
                {lang === "ru" ? "Локальных файлов пока нет" : "No local files yet"}
              </div>
              <div className="t2">
                {lang === "ru"
                  ? "Добавь MP3, FLAC, M4A, OGG, OPUS или WAV или перетащи их в любое место окна."
                  : "Add MP3, FLAC, M4A, OGG, OPUS, or WAV files or drag them anywhere into the window."}
              </div>
              <button className="btn-pill btn-pill-primary local-empty-btn" onClick={handlePickFiles} disabled={adding}>
                <span>{lang === "ru" ? "Добавить файлы" : "Add files"}</span>
              </button>
            </div>
          ) : (
            <VirtualTrackList
              items={visible}
              renderItem={(track, i) => (
                <div key={`${trackKey(track)}-${i}`}>
                  <TrackRow
                    track={track}
                    index={i}
                    nowKey={nowKey}
                    onPlay={playOne}
                    onRemove={handleRemove}
                    removeLabel={lang === "ru" ? "Убрать из списка" : "Remove from list"}
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
