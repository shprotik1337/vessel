import { useApp } from "../store";
import { TrackRow } from "../components/TrackRow";
import { PlaylistCover } from "../components/PlaylistCover";
import { trackKey, relativeTime, formatDuration } from "../lib/utils";
import { t } from "../i18n";
import type { TrackRef } from "../api/types";
import * as api from "../api/commands";

export function Recent() {
  const { state, playTracks, showToast, refresh, navigateTo, goBack, lang } = useApp();
  if (!state) return null;

  const nowKey = state.now_playing ? trackKey(state.now_playing) : null;
  const history = state.history;

  // unique by track key, keep most recent occurrence, ordered by most recent
  const uniqueHistory = (() => {
    const seen = new Map<string, (typeof history)[number]>();
    for (const entry of history) {
      const key = trackKey(entry.track);
      seen.set(key, entry);
    }
    return Array.from(seen.values());
  })();

  const playOne = (track: TrackRef) => {
    const idx = uniqueHistory.findIndex((h) => trackKey(h.track) === trackKey(track));
    void playTracks(uniqueHistory.map((h) => h.track), idx < 0 ? 0 : idx);
  };

  const playAll = () => {
    if (uniqueHistory.length === 0) return;
    void playTracks(uniqueHistory.map((h) => h.track), 0);
  };

  const clearAll = async () => {
    try {
      await api.clearHistory();
      await refresh();
      showToast(t(lang, "recent.cleared"));
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const totalMs = uniqueHistory.reduce((sum, h) => sum + (h.track.duration_ms ?? 0), 0);
  const glowArt = uniqueHistory[0]?.track.artwork_url || state.now_playing?.artwork_url;

  return (
    <div className="view">
      <div style={{ marginBottom: 18 }}>
        <button className="btn btn-outline btn-sm" onClick={goBack} title={t(lang, "common.back")}>
          {t(lang, "common.back")}
        </button>
      </div>

      <div className="page-panel">
        {glowArt ? (
          <div
            className="page-ambient-glow"
            style={{ backgroundImage: `url("${glowArt}")` }}
          />
        ) : (
          <div className="page-ambient-glow-fallback" />
        )}

        <div className="page-panel-header">
          <div className="hero-ref">
            <div className="hero-ref-cover">
              <PlaylistCover
                tracks={uniqueHistory.map((h) => h.track)}
                coverUrl={null}
                size={260}
                borderRadius={20}
              />
            </div>
            <div className="hero-ref-info">
              <div className="hero-ref-title" style={{ maxWidth: 650, wordBreak: "break-word" }}>
                {t(lang, "recent.title")}
              </div>
              <div className="hero-ref-subtitle">
                {lang === "ru" ? "История прослушиваний" : "Listening history"}
              </div>
              <div className="hero-ref-meta">
                <span>{uniqueHistory.length} {t(lang, "common.tracks")}</span>
                {totalMs > 0 && (
                  <>
                    <span>·</span>
                    <span>{formatDuration(totalMs)}</span>
                  </>
                )}
              </div>

              {uniqueHistory.length > 0 && (
                <div className="hero-ref-actions">
                  <button className="btn-pill btn-pill-primary" onClick={playAll}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                    <span>{t(lang, "playlist.play")}</span>
                  </button>
                  <button className="btn-pill" onClick={clearAll}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6" />
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                    <span>{t(lang, "recent.clear")}</span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="page-panel-body">
          {uniqueHistory.length === 0 ? (
            <div className="empty">
              <div className="ico">⏱</div>
              <div className="t1">{t(lang, "recent.empty1")}</div>
              <div className="t2">{t(lang, "recent.empty2")}</div>
            </div>
          ) : (
            <div className="tracklist">
              {uniqueHistory.map((entry, i) => (
                <TrackRow
                  key={trackKey(entry.track) + i}
                  track={entry.track}
                  index={i}
                  nowKey={nowKey}
                  onPlay={playOne}
                  onArtistClick={(name, provider) => navigateTo("artist", { artist: name, provider })}
                  showAdded
                  addedLabel={relativeTime(entry.played_at_ms)}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}