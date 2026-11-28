import { useCallback, useEffect, useMemo, useState } from "react";
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

export function Downloads() {
  const {
    state,
    playTracks,
    smartShuffle,
    showToast,
    navigateTo,
    goBack,
    lang,
  } = useApp();

  const [tracks, setTracks] = useState<TrackRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [sort, setSort] = useState<SortMode>("default");
  const [dir, setDir] = useState<SortDir>("asc");
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);

  const loadTracks = useCallback(async () => {
    try {
      const list = await api.getDownloadedTracks();
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

  const handleRemove = async (track: TrackRef) => {
    try {
      await api.removeDownloadedTrack(track);
      setTracks((prev) => prev.filter((item) => trackKey(item) !== trackKey(track)));
      showToast(lang === "ru" ? `Удалено из загрузок: ${track.title}` : `Removed: ${track.title}`);
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
    <div className="view">
      <div style={{ marginBottom: 18 }}>
        <button className="btn-back-pill" onClick={goBack} title={t(lang, "common.back")}>
          {t(lang, "common.back")}
        </button>
      </div>

      <div className="page-panel">
        <PageAmbientBackdrop fallbackClass="page-ambient-glow-fav" />
        <div className="page-panel-header">
          <div className="hero-ref">
            <div className="fav-cover-large" title={lang === "ru" ? "Скачанные" : "Downloads"}>
              <svg
                width="82"
                height="82"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--text)"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </div>
            <div className="hero-ref-info">
              <div className="hero-ref-title" style={{ maxWidth: 650, wordBreak: "break-word" }}>
                {lang === "ru" ? "Скачанные" : "Downloaded"}
              </div>
              <div className="hero-ref-subtitle">
                {lang === "ru" ? "Офлайн-кэш и загрузки" : "Offline cache and downloads"}
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
              <div className="t2">{lang === "ru" ? "Сканирование загрузок…" : "Scanning downloads…"}</div>
            </div>
          ) : visible.length === 0 ? (
            <div className="empty">
              <div className="t1">
                {lang === "ru" ? "Скачанных треков пока нет" : "No downloaded tracks yet"}
              </div>
              <div className="t2">
                {lang === "ru"
                  ? "Нажми «В кэш» в плейлисте или «Скачать» в меню трека — музыка появится здесь для офлайн-прослушивания."
                  : "Click 'Cache' on a playlist or 'Download' in a track menu to listen offline."}
              </div>
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
                    onArtistClick={(name, provider) => navigateTo("artist", { artist: name, provider })}
                    onRemove={handleRemove}
                    removeLabel={lang === "ru" ? "Удалить из загрузок" : "Remove download"}
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
