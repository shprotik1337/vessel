import { useState } from "react";
import { TrackRow } from "../../components/TrackRow";
import { VirtualTrackList } from "../../components/VirtualTrackList";
import { trackKey, formatDuration } from "../../lib/utils";
import { t, type Lang } from "../../i18n";
import type { TrackRef } from "../../api/types";
import type { PreviewState } from "./searchTypes";
import { PlaylistCover } from "../../components/PlaylistCover";

interface SearchCollectionPreviewProps {
  preview: PreviewState;
  onClose: () => void;
  nowKey: string | null;
  lang: Lang;
  adding: string | null;
  onPlayTracks: (tracks: TrackRef[], startIndex: number) => void;
  onPlayTrack: (track: TrackRef, tracks: TrackRef[]) => void;
  onAddToLibrary: (url: string) => void;
  onArtistClick: (name: string, provider?: string) => void;
}

export function SearchCollectionPreview({
  preview,
  onClose,
  nowKey,
  lang,
  adding,
  onPlayTracks,
  onPlayTrack,
  onAddToLibrary,
  onArtistClick,
}: SearchCollectionPreviewProps) {
  const pl = preview.playlist;
  const [sort, setSort] = useState<"custom" | "title" | "artist">("custom");
  const [dir, setDir] = useState<"asc" | "desc">("asc");
  const [sortOpen, setSortOpen] = useState(false);

  const totalMs = (pl?.tracks || []).reduce((acc, t) => acc + (t.duration_ms || 0), 0);

  const getSortedTracks = () => {
    if (!pl?.tracks) return [];
    if (sort === "custom") return pl.tracks;
    return [...pl.tracks].sort((a, b) => {
      const fieldA = sort === "title" ? a.title : (a.artists?.[0] || "");
      const fieldB = sort === "title" ? b.title : (b.artists?.[0] || "");
      const cmp = fieldA.localeCompare(fieldB);
      return dir === "asc" ? cmp : -cmp;
    });
  };

  const visibleTracks = getSortedTracks();

  return (
    <div className="view">
      <div style={{ marginBottom: 18 }}>
        <button className="btn-back-pill" onClick={onClose}>
          {t(lang, "common.back")}
        </button>
      </div>
      {preview.loading || !pl ? (
        <div className="tracklist">
          <div className="skel" />
          <div className="skel" />
          <div className="skel" />
          <div className="skel" />
        </div>
      ) : (
        <div className="page-panel" style={{ border: "none", background: "transparent" }}>
          {pl.cover_url && (
            <div
              className="page-ambient-glow"
              style={{ backgroundImage: `url("${pl.cover_url}")` }}
            />
          )}
          <div className="page-panel-header" style={{ padding: "0 0 24px" }}>
            <div className="hero-ref" style={{ display: "flex", gap: "28px", alignItems: "flex-end" }}>
              <div className="hero-ref-cover" style={{ flexShrink: 0 }}>
                <PlaylistCover tracks={pl.tracks} coverUrl={pl.cover_url} size={260} borderRadius={20} border={false} />
              </div>
              <div className="hero-ref-info" style={{ display: "flex", flexDirection: "column", gap: "8px", minWidth: 0, flex: 1 }}>
                <div className="hero-ref-subtitle" style={{ fontSize: "14px", fontWeight: 600, color: "var(--text3)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                  {pl.is_album || pl.source_url?.includes("album") || preview.provider ? (lang === "ru" ? "Альбом" : "Album") : t(lang, "playlist.title")}
                </div>
                <div className="hero-ref-title" style={{ fontSize: "36px", fontWeight: 800, color: "var(--text)", lineHeight: 1.15, wordBreak: "break-word" }}>
                  {pl.title}
                </div>
                <div className="hero-ref-meta" style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "var(--text2)", fontWeight: 500 }}>
                  <span>{pl.tracks.length} {t(lang, "common.tracks")}</span>
                  <span>·</span>
                  <span>{formatDuration(totalMs)}</span>
                </div>
                <div className="hero-ref-actions" style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "12px", flexWrap: "wrap" }}>
                  {pl.tracks.length > 0 && (
                    <button
                      className="btn-pill btn-pill-primary"
                      onClick={() => void onPlayTracks(visibleTracks, 0)}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                      <span>{t(lang, "playlist.play")}</span>
                    </button>
                  )}
                  {pl.tracks.length > 0 && !(pl.is_album || pl.source_url?.includes("album")) && (
                    <button
                      className="btn-pill"
                      onClick={() => {
                        const arr = [...visibleTracks].sort(() => Math.random() - 0.5);
                        void onPlayTracks(arr, 0);
                      }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
                      <span>{t(lang, "favorites.shuffle")}</span>
                    </button>
                  )}
                  <button
                    className="btn-pill"
                    onClick={() => void onAddToLibrary(pl.source_url || "")}
                    disabled={adding === pl.source_url}
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                    <span>{adding === pl.source_url ? (lang === "ru" ? "Добавление…" : "Adding…") : (lang === "ru" ? "Добавить в медиатеку" : "Add to Library")}</span>
                  </button>
                  <div className="sort-dropdown-wrap" onClick={(e) => e.stopPropagation()}>
                    <button
                      className={`btn-pill ${sort !== "custom" ? "btn-pill-active" : ""}`}
                      onClick={() => setSortOpen((v) => !v)}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 15l5 5 5-5M7 9l5-5 5 5"/></svg>
                      <span>
                        {sort === "custom"
                          ? (lang === "ru" ? "Сортировка" : "Sort")
                          : (sort === "title" ? t(lang, "artist.titleSort") : t(lang, "artist.artistSort"))}
                        {sort !== "custom" && (dir === "asc" ? " ↑" : " ↓")}
                      </span>
                      <span style={{ fontSize: 9, opacity: 0.7, marginLeft: 2 }}>▾</span>
                    </button>
                    {sortOpen && (
                      <div className="sort-dropdown-menu">
                        {[
                          { mode: "custom", label: t(lang, "artist.customOrder") },
                          { mode: "title", label: t(lang, "artist.titleSort") },
                          { mode: "artist", label: t(lang, "artist.artistSort") },
                        ].map((opt) => (
                          <div
                            key={opt.mode}
                            className={`sort-dropdown-item ${sort === opt.mode ? "active" : ""}`}
                            onClick={() => {
                              if (sort === opt.mode) {
                                setDir((d) => (d === "asc" ? "desc" : "asc"));
                              } else {
                                setSort(opt.mode as any);
                                setDir("asc");
                              }
                              setSortOpen(false);
                            }}
                          >
                            <span>{opt.label}</span>
                            {sort === opt.mode && (
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
          <div className="page-panel-body" style={{ padding: 0 }}>
            <VirtualTrackList
              items={visibleTracks}
              renderItem={(track, i) => (
                <TrackRow
                  key={trackKey(track) + i}
                  track={track}
                  index={i}
                  nowKey={nowKey}
                  onPlay={(t) => onPlayTrack(t, visibleTracks)}
                  onArtistClick={onArtistClick}
                />
              )}
            />
          </div>
        </div>
      )}
    </div>
  );
}
