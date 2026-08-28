import { useEffect, useRef, useState } from "react";

import { useApp } from "../store";
import { TrackRow } from "../components/TrackRow";
import { trackKey } from "../lib/utils";
import type { TrackRef } from "../api/types";
import * as api from "../api/commands";

export function Search() {
  const { state, playTracks } = useApp();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TrackRef[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<number | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (debounce.current) window.clearTimeout(debounce.current);
    const q = query.trim();
    if (!q) {
      setResults([]);
      setMessage(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    debounce.current = window.setTimeout(async () => {
      try {
        const outcome = await api.search(q);
        setResults(outcome.tracks);
        setMessage(outcome.failures.length > 0 ? `Found: ${outcome.tracks.length}, some sources unavailable` : null);
        if (outcome.tracks.length === 0) {
          setMessage(outcome.failures.length > 0 ? outcome.failures.join("; ") : "Nothing found");
        }
      } catch (err) {
        setError(String(err));
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (debounce.current) window.clearTimeout(debounce.current);
    };
  }, [query]);

  const nowKey = state?.now_playing ? trackKey(state.now_playing) : null;

  const playOne = (track: TrackRef) => {
    void playTracks([track], 0);
  };

  return (
    <div className="view">
      <div className="search-big">
        <span style={{ color: "var(--text3)" }}>⌕</span>
        <input
          ref={inputRef}
          type="text"
          placeholder="Search tracks, artists, albums…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
        <span className="kbd">⌘K</span>
      </div>

      {error && (
        <div className="alert" style={{ marginBottom: 16 }}>
          <span className="alert-mark">!</span>
          <div className="set-desc" style={{ color: "var(--red)" }}>
            {error}
          </div>
        </div>
      )}

      {loading && (
        <div className="tracklist">
          <div className="skel" />
          <div className="skel" />
          <div className="skel" />
          <div className="skel" />
        </div>
      )}

      {!loading && !query.trim() && (
        <div className="empty">
          <div className="ico">⌕</div>
          <div className="t1">Search everything</div>
          <div className="t2">
            Every connected service becomes one library. Results show which source a track is
            fetched from.
          </div>
        </div>
      )}

      {!loading && query.trim() && results.length === 0 && !error && (
        <div className="empty">
          <div className="ico">?</div>
          <div className="t1">No results</div>
          <div className="t2">{message ?? "Try a different spelling."}</div>
        </div>
      )}

      {!loading && results.length > 0 && (
        <>
          <div className="group-title" style={{ margin: "4px 0 8px" }}>
            Tracks {message ? ` · ${message}` : ""}
          </div>
          <div className="tracklist">
            {results.map((track, i) => (
              <TrackRow
                key={trackKey(track) + i}
                track={track}
                index={i}
                nowKey={nowKey}
                onPlay={playOne}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}