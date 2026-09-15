import { useEffect, useRef, useState } from "react";

import { useApp } from "../store";
import { TrackRow } from "../components/TrackRow";
import { PlaylistCover } from "../components/PlaylistCover";
import { Artwork } from "../components/Artwork";
import { trackKey, providerLabel, formatDuration } from "../lib/utils";
import { t } from "../i18n";
import type { CollectionItem, Playlist, TrackRef } from "../api/types";
import * as api from "../api/commands";

const PROVIDERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "soundcloud", label: "SoundCloud" },
  { key: "deezer", label: "Deezer" },
  { key: "yandex", label: "Yandex" },
  { key: "spotify", label: "Spotify" },
  { key: "youtube_music", label: "YouTube Music" },
];

// провайдеры сериализуются в snake_case: sound_cloud / yandex_music / deezer / spotify / youtube_music
const PROVIDER_VALUE: Record<string, string> = {
  soundcloud: "sound_cloud",
  yandex: "yandex_music",
  deezer: "deezer",
  spotify: "spotify",
  youtube_music: "you_tube_music",
};

const TABS = ["tracks", "playlists", "artists", "albums"];

interface PreviewState {
  playlist: Playlist | null;
  loading: boolean;
  provider: string | null;
}

export function Search() {
  const { state, playTracks, navigateTo, showToast, refresh, lang } = useApp();
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
  const [recs, setRecs] = useState<TrackRef[]>([]);
  const [recsLoading, setRecsLoading] = useState(false);
  const debounce = useRef<number | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Рекомендации при пустом поиске — всегда из избранного, с учётом выбранных провайдеров
  useEffect(() => {
    if (query.trim()) {
      setRecs([]);
      return;
    }
    let cancelled = false;
    setRecsLoading(true);
    void (async () => {
      try {
        const providers = await api.getRecommendationProviders().catch(() => "all");
        const result = await api.getWaveRecommendations("favorites", 20, null, providers);
        if (!cancelled) setRecs(result);
      } catch {
        // тихо — поиск без рекомендаций тоже норм
      } finally {
        if (!cancelled) setRecsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [query]);

  const recsNowKey = state?.now_playing ? trackKey(state.now_playing) : null;

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
                : t(lang, "search.noResults"),
            );
          } else {
            setMessage(
              outcome.failures.length > 0
                ? `${t(lang, "common.found")} ${outcome.tracks.length}, ${t(lang, "search.someUnavailable")}`
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
          console.log(
            `[search] collections kind=${kind} total=${found.length} providers=`,
            found.reduce<Record<string, number>>((acc, c) => {
              acc[c.provider] = (acc[c.provider] ?? 0) + 1;
              return acc;
            }, {}),
          );
          setCollections(found);
          setResults([]);
          setMessage(
            found.length === 0
              ? `0 коллекций · kind=${kind} · провайдеры: ${JSON.stringify(
                  Object.keys(
                    (state?.providers ?? []).filter((p) => p.connected),
                  ),
                )}`
              : null,
          );
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
      showToast(`${t(lang, "search.added")} ${pl.title} (${pl.tracks.length} ${t(lang, "common.tracks")})`);
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
      showToast(`${t(lang, "search.added")} ${pl.title} (${pl.tracks.length} ${t(lang, "common.tracks")})`);
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
                  {preview.provider ? providerLabel(preview.provider) : t(lang, "search.preview")}
                </span>
                <div className="big-title" style={{ maxWidth: 600, wordBreak: "break-word" }}>
                  {pl.title}
                </div>
                <div className="meta-line">
                  <span>{pl.tracks.length} {t(lang, "common.tracks")}</span>
                  <span className="meta-sep">·</span>
                  <span>{formatDuration(totalMs)}</span>
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  {pl.tracks.length > 0 && (
                    <button
                      className="btn btn-primary btn-sm"
                      onClick={() => void playTracks(pl.tracks, 0)}
                    >
                      ▶ {t(lang, "common.play")}
                    </button>
                  )}
                  {pl.source_url && !owned && (
                    <button className="btn btn-ghost btn-sm" onClick={addPreviewed}>
                      {t(lang, "search.addToLibrary")}
                    </button>
                  )}
                  {owned && (
                    <span className="badge ok" style={{ padding: "6px 10px" }}>
                      ✓ {t(lang, "search.alreadyInLibrary")}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div style={{ padding: "12px 8px" }}>
              {pl.tracks.length === 0 ? (
                <div className="empty">
                  <div className="ico">♫</div>
                  <div className="t1">{t(lang, "search.emptyPlaylist")}</div>
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
                  {adding === item.web_url ? "…" : (<span><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" style={{verticalAlign:"-2px",marginRight:4}}><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>{t(lang, "search.add")}</span>)}
                </button>
              )}
              {owned && (
                <span className="badge ok" style={{ position: "absolute", left: 8, bottom: 8, background: "rgba(11,11,12,.88)" }}>
                  ✓ {t(lang, "search.inLibrary")}
                </span>
              )}
              <button
                className="card-play"
                title={t(lang, "common.play")}
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
          placeholder={t(lang, "search.placeholder")}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoComplete="off"
          spellCheck={false}
        />
      </div>

      <div className="tabs">
        {TABS.map((tab) => (
          <button
            key={tab}
            className={`tab ${category === tab ? "active" : ""}`}
            onClick={() => setCategory(tab)}
          >
            {tab === "tracks"
              ? t(lang, "search.tracks")
              : tab === "playlists"
                ? t(lang, "search.playlists")
                : tab === "albums"
                  ? t(lang, "search.albums")
                  : t(lang, "search.artists")}
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

      {!loading && !query.trim() && recsLoading && (
        <div className="tracklist">
          {[0, 1, 2, 3, 4].map((i) => (
            <div key={i} className="skel" />
          ))}
        </div>
      )}

      {!loading && !query.trim() && !recsLoading && recs.length > 0 && (
        <>
          <div className="sec-head" style={{ marginBottom: 14 }}>
            <span className="sec-title">{t(lang, "wave.recommended")}</span>
          </div>
          <div className="tracklist">
            {recs.map((track, i) => (
              <TrackRow
                key={`${track.provider}:${track.id}`}
                track={track}
                index={i}
                nowKey={recsNowKey}
                onPlay={(t) => {
                  const idx = recs.findIndex((r) => trackKey(r) === trackKey(t));
                  playTracks(recs, idx < 0 ? 0 : idx);
                }}
                onArtistClick={(name, provider) => navigateTo("artist", { artist: name, provider })}
              />
            ))}
          </div>
        </>
      )}

      {!loading && !query.trim() && recs.length === 0 && !recsLoading && (
        <div className="empty">
          <div className="ico">⌕</div>
          <div className="t1">{t(lang, "search.everything")}</div>
          <div className="t2">{t(lang, "search.emptyDesc")}</div>
        </div>
      )}

      {!loading &&
        query.trim() &&
        category !== "tracks" &&
        filteredCollections.length === 0 &&
        !error && (
          <div className="empty">
            <div className="ico">?</div>
            <div className="t1">{t(lang, "search.noResults")}</div>
            <div className="t2">{t(lang, "search.tryDifferent")}</div>
          </div>
        )}

      {!loading &&
        query.trim() &&
        category === "tracks" &&
        results.length === 0 &&
        !error && (
          <div className="empty">
            <div className="ico">?</div>
            <div className="t1">{t(lang, "search.noResults")}</div>
            <div className="t2">{t(lang, "search.tryDifferent")}</div>
          </div>
        )}

      {!loading && category === "tracks" && results.length > 0 && (
        <>
          <div className="group-title" style={{ margin: "4px 0 8px" }}>
            {t(lang, "search.tracks")} {message ? ` · ${message}` : ""}
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
              ? t(lang, "search.playlists")
              : category === "albums"
                ? t(lang, "search.albums")
                : t(lang, "search.artists")}{" "}
            · {filteredCollections.length} {JSON.stringify(collections.reduce((a: Record<string, number>, c: CollectionItem) => { a[c.provider] = (a[c.provider] ?? 0) + 1; return a; }, {}))}
          </div>
          <div className="grid">{filteredCollections.map(renderCollectionCard)}</div>
        </>
      )}
    </div>
  );
}

