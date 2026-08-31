import { useEffect, useRef, useState } from "react";

import { useApp } from "../store";
import { TrackRow } from "../components/TrackRow";
import { PlaylistCover } from "../components/PlaylistCover";
import { Artwork } from "../components/Artwork";
import { trackKey, providerLabel, formatDuration } from "../lib/utils";
import type { CollectionItem, Playlist, TrackRef } from "../api/types";
import * as api from "../api/commands";

const PROVIDERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "soundcloud", label: "SoundCloud" },
  { key: "deezer", label: "Deezer" },
  { key: "yandex", label: "Yandex" },
  { key: "spotify", label: "Spotify" },
];

// провайдеры сериализуются в snake_case: sound_cloud / yandex_music / deezer / spotify
const PROVIDER_VALUE: Record<string, string> = {
  soundcloud: "sound_cloud",
  yandex: "yandex_music",
  deezer: "deezer",
  spotify: "spotify",
};

const TABS = ["tracks", "playlists", "artists", "albums"];

interface PreviewState {
  playlist: Playlist | null;
  loading: boolean;
  provider: string | null;
}

export function Search() {
  const { state, playTracks, navigateTo, showToast, refresh } = useApp();
  const [query, setQuery] = useState("");
  const [provider, setProvider] = useState("all");
  const [category, setCategory] = useState("tracks");
  const [results, setResults] = useState<TrackRef[]>([]);
  const [collections, setCollections] = useState<CollectionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
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
      setCollections([]);
      setMessage(null);
      setError(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    debounce.current = window.setTimeout(async () => {
      try {
        if (category === "tracks") {
          const outcome = await api.search(q, provider);
          setResults(outcome.tracks);
          setCollections([]);
          if (outcome.tracks.length === 0) {
            setMessage(
              outcome.failures.length > 0
                ? outcome.failures.join("; ")
                : "Nothing found",
            );
          } else {
            setMessage(
              outcome.failures.length > 0
                ? `Found: ${outcome.tracks.length}, some sources unavailable`
                : null,
            );
          }
        } else {
          const kind =
            category === "playlists"
              ? "playlists"
              : category === "albums"
                ? "albums"
                : "artists";
          const found = await api.searchCollections(q, kind);
          setCollections(found);
          setResults([]);
          setMessage(found.length === 0 ? "Nothing found" : null);
        }
      } catch (err) {
        setError(String(err));
        setResults([]);
        setCollections([]);
      } finally {
        setLoading(false);
      }
    }, 300);
    return () => {
      if (debounce.current) window.clearTimeout(debounce.current);
    };
  }, [query, provider, category]);

  const nowKey = state?.now_playing ? trackKey(state.now_playing) : null;

  const isOwned = (url: string) =>
    state?.playlists.some((p) => p.source_url === url) ?? false;

  const playOne = (track: TrackRef) => {
    const idx = results.findIndex((t) => trackKey(t) === trackKey(track));
    void playTracks(results, idx < 0 ? 0 : idx);
  };

  const addToLibrary = async (url: string) => {
    setAdding(url);
    try {
      const pl = await api.importPlaylistUrl(url);
      await refresh();
      showToast(`Добавлено: ${pl.title} (${pl.tracks.length} треков)`);
    } catch (err) {
      showToast(String(err), true);
    } finally {
      setAdding(null);
    }
  };

  const openPreview = async (item: CollectionItem) => {
    setPreview({ playlist: null, loading: true, provider: item.provider });
    try {
      const pl = await api.previewPlaylistUrl(item.web_url);
      setPreview({ playlist: pl, loading: false, provider: item.provider });
    } catch (err) {
      showToast(String(err), true);
      setPreview(null);
    }
  };

  const playCollection = async (item: CollectionItem) => {
    try {
      const pl = await api.previewPlaylistUrl(item.web_url);
      if (pl.tracks.length === 0) return;
      await playTracks(pl.tracks, 0);
    } catch (err) {
      showToast(String(err), true);
    }
  };

  const addPreviewed = async () => {
    if (!preview?.playlist) return;
    const pl = preview.playlist;
    try {
      await api.saveImportedPlaylist(pl);
      await refresh();
      showToast(`Добавлено: ${pl.title} (${pl.tracks.length} треков)`);
      setPreview(null);
    } catch (err) {
      showToast(String(err), true);
    }
  };

  if (preview) {
    const pl = preview.playlist;
    const totalMs = pl?.tracks.reduce((sum, t) => sum + (t.duration_ms ?? 0), 0) ?? 0;
    const owned = pl?.source_url ? isOwned(pl.source_url) : false;
    return (
      <div className="view">
        <div style={{ marginBottom: 18 }}>
          <button className="btn btn-outline btn-sm" onClick={() => setPreview(null)}>
            ← Назад
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
          <div className="panel">
            <div className="playlist-hd">
              <PlaylistCover tracks={pl.tracks} coverUrl={pl.cover_url} size={148} />
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  gap: 8,
                  minWidth: 0,
                }}
              >
                <span className="kicker">
                  {preview.provider ? providerLabel(preview.provider) : "Плейлист"}
                </span>
                <div className="big-title" style={{ maxWidth: 600, wordBreak: "break-word" }}>
                  {pl.title}
                </div>
                <div className="meta-line">
                  <span>{pl.tracks.length} треков</span>
                  <span className="meta-sep">·</span>
                  <span>{formatDuration(totalMs)}</span>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  {pl.tracks.length > 0 && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => void playTracks(pl.tracks, 0)}
                    >
                      ▶ Играть
                    </button>
                  )}
                  {pl.source_url && !owned && (
                    <button className="btn btn-ghost btn-sm" onClick={addPreviewed}>
                      Добавить в библиотеку
                    </button>
                  )}
                  {owned && (
                    <span className="badge ok" style={{ padding: "6px 10px" }}>
                      ✓ Уже в библиотеке
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div style={{ padding: "12px 8px" }}>
              {pl.tracks.length === 0 ? (
                <div className="empty">
                  <div className="ico">♫</div>
                  <div className="t1">Пустой плейлист</div>
                </div>
              ) : (
                <div className="tracklist">
                  {pl.tracks.map((track, i) => (
                    <TrackRow
                      key={trackKey(track) + i}
                      track={track}
                      index={i}
                      nowKey={nowKey}
                      onPlay={(t) => {
                        const idx = pl.tracks.findIndex((x) => trackKey(x) === trackKey(t));
                        void playTracks(pl.tracks, idx < 0 ? 0 : idx);
                      }}
                      onArtistClick={(name, provider) => navigateTo("artist", { artist: name, provider })}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }

  const filteredCollections =
    provider === "all"
      ? collections
      : collections.filter((c) => c.provider === PROVIDER_VALUE[provider]);

  const renderCollectionCard = (item: CollectionItem) => {
    const isArtist = item.kind === "artist";
    const owned = isOwned(item.web_url);
    return (
      <div
        key={`${item.provider}:${item.id}`}
        className="card"
        title={item.title}
        onClick={() => {
          if (isArtist) navigateTo("artist", { artist: item.title, provider: item.provider, artistId: item.id });
          else void openPreview(item);
        }}
        style={{ width: 172, cursor: "pointer" }}
      >
        <div className="card-art" style={{ marginBottom: 9 }}>
          <Artwork
            url={item.artwork_url}
            alt={item.title}
            seed={item.id.length}
            square={false}
            style={{ width: "100%", aspectRatio: "1", borderRadius: 4 }}
          />
          {!isArtist && (
            <>
              {!owned && (
                <button
                  className="card-add"
                  style={{ right: 48 }}
                  disabled={adding === item.web_url}
                  onClick={(e) => {
                    e.stopPropagation();
                    void addToLibrary(item.web_url);
                  }}
                >
                  {adding === item.web_url ? "…" : "＋ Добавить"}
                </button>
              )}
              {owned && (
                <span className="badge ok" style={{ position: "absolute", left: 8, bottom: 8, background: "rgba(11,11,12,.88)" }}>
                  ✓ В библиотеке
                </span>
              )}
              <button
                className="card-play"
                title="Играть"
                onClick={(e) => {
                  e.stopPropagation();
                  void playCollection(item);
                }}
              >
                ▶
              </button>
            </>
          )}
        </div>
        <div className="card-t">{item.title}</div>
        <div className="card-s">{item.subtitle}</div>
        <span className="pl-src">{providerLabel(item.provider)}</span>
      </div>
    );
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

      <div className="tabs">
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`tab ${category === tab ? "active" : ""}`}
            onClick={() => setCategory(tab)}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      <div className="chips" style={{ margin: "16px 0 18px" }}>
        {PROVIDERS.map((p) => (
          <button
            key={p.key}
            className="chip"
            style={
              provider === p.key
                ? { borderColor: "var(--border3)", color: "var(--text)" }
                : undefined
            }
            onClick={() => setProvider(p.key)}
          >
            {p.label}
          </button>
        ))}
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

      {!loading &&
        query.trim() &&
        category !== "tracks" &&
        filteredCollections.length === 0 &&
        !error && (
          <div className="empty">
            <div className="ico">?</div>
            <div className="t1">No results</div>
            <div className="t2">{message ?? "Try a different spelling."}</div>
          </div>
        )}

      {!loading &&
        query.trim() &&
        category === "tracks" &&
        results.length === 0 &&
        !error && (
          <div className="empty">
            <div className="ico">?</div>
            <div className="t1">No results</div>
            <div className="t2">{message ?? "Try a different spelling."}</div>
          </div>
        )}

      {!loading && category === "tracks" && results.length > 0 && (
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
                onArtistClick={(name, provider) => navigateTo("artist", { artist: name, provider })}
              />
            ))}
          </div>
        </>
      )}

      {!loading && category !== "tracks" && filteredCollections.length > 0 && (
        <>
          <div className="group-title" style={{ margin: "4px 0 8px" }}>
            {category === "playlists"
              ? "Playlists"
              : category === "albums"
                ? "Albums"
                : "Artists"}{" "}
            · {filteredCollections.length}
          </div>
          <div className="grid">{filteredCollections.map(renderCollectionCard)}</div>
        </>
      )}
    </div>
  );
}

