import { useApp } from "../store";
import { TrackRow } from "../components/TrackRow";
import { trackKey, relativeTime } from "../lib/utils";
import { t } from "../i18n";
import type { TrackRef } from "../api/types";
import * as api from "../api/commands";

export function Recent() {
  const { state, playTracks, showToast, refresh, navigateTo, lang } = useApp();
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

  const clearAll = async () => {
    try {
      await api.clearHistory();
      await refresh();
      showToast(t(lang, "recent.cleared"));
    } catch (error) {
      showToast(String(error), true);
    }
  };

  return (
    <div className="view">
      <div className="view-hd">
        <div>
          <div className="view-title">{t(lang, "recent.title")}</div>
          <div className="view-sub">{uniqueHistory.length} {t(lang, "common.tracks")}</div>
        </div>
        <div className="btns">
          {uniqueHistory.length > 0 && (
            <button className="btn btn-ghost" onClick={clearAll}>
              {t(lang, "recent.clear")}
            </button>
          )}
        </div>
      </div>

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
  );
}