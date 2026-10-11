import { useEffect, useRef, useState } from "react";

import { useApp } from "../store";
import { useCustomization } from "../customization";
import { TrackRow } from "../components/TrackRow";
import { VirtualTrackList } from "../components/VirtualTrackList";
import { Artwork } from "../components/Artwork";
import { PlatformIcon } from "../components/PlatformIcon";
import { trackKey, providerLabel, parseActiveProviders } from "../lib/utils";
import { t } from "../i18n";
import type { CollectionItem, Playlist, TrackRef } from "../api/types";
import * as api from "../api/commands";

export const SEARCH_PLATFORMS = [
  { key: "soundcloud", label: "SoundCloud", color: "#FF5500" },
  { key: "youtube_music", label: "YouTube Music", color: "#FF0000" },
  { key: "spotify", label: "Spotify", color: "#1ED760" },
  { key: "yandex", label: "Яндекс Музыка", color: "#FFCC00" },
  { key: "deezer", label: "Deezer", color: "#A238FF" },
];

const PROVIDER_VALUE: Record<string, string> = {
  soundcloud: "soundcloud",
  yandex: "yandex_music",
  deezer: "deezer",
  spotify: "spotify",
  youtube_music: "youtube_music",
};

type SearchCategory = "all" | "tracks" | "playlists" | "albums" | "artists";

interface PreviewState {
  playlist: Playlist | null;
  loading: boolean;
  provider: string | null;
}

let cachedSearchRecs: TrackRef[] | null = null;
let cachedSearchRecsKey: string = "";

function mixSearchTracks(tracks: TrackRef[]): TrackRef[] {
  if (tracks.length <= 2) return tracks;
  const groups: Record<string, TrackRef[]> = {};
  for (const t of tracks) {
    if (!groups[t.provider]) groups[t.provider] = [];
    groups[t.provider].push(t);
  }
  const providers = Object.keys(groups);
  if (providers.length <= 1) return tracks;

  const result: TrackRef[] = [];
  let seed = tracks.length;
  const nextRand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  let hasMore = true;
  while (hasMore) {
    hasMore = false;
    const order = [...providers].sort(() => nextRand() - 0.5);
    for (const p of order) {
      const list = groups[p];
      if (list && list.length > 0) {
        hasMore = true;
        const takeCount = Math.min(list.length, Math.floor(nextRand() * 3) + 1);
        const chunk = list.splice(0, takeCount);
        result.push(...chunk);
      }
    }
  }
  return result;
}

function IconSearchTab() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

function IconMusicTab() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  );
}

function IconPlaylistTab() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <line x1="3" y1="6" x2="3.01" y2="6" />
      <line x1="3" y1="12" x2="3.01" y2="12" />
      <line x1="3" y1="18" x2="3.01" y2="18" />
    </svg>
  );
}

function IconDiscTab() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconUserTab() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export function Search() {
  const {
    state,
    playTracks,
    navigateTo,
    showToast,
    refresh,
    lang,
    searchQuery: query,
    setSearchQuery: setQuery,
    searchProvider: provider,
    setSearchProvider: setProvider,
  } = useApp();
  const { config } = useCustomization();
  const isSidebarTop = config.sidebar?.position === "top";
  const isSidebarAutoHide = Boolean(config.sidebar?.autoHide);
  const hasActiveQuery = Boolean(query.trim());

  const [category, setCategory] = useState<SearchCategory>("all");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  useEffect(() => {
    if (provider === "all" || !SEARCH_PLATFORMS.some((p) => p.key === provider)) {
      setProvider("soundcloud");
    }
  }, [provider, setProvider]);

  // Main results
  const [results, setResults] = useState<TrackRef[]>([]);
  const [collections, setCollections] = useState<CollectionItem[]>([]);

  // "All" composite results
  const [allTracks, setAllTracks] = useState<TrackRef[]>([]);
  const [allArtists, setAllArtists] = useState<CollectionItem[]>([]);
  const [allPlaylists, setAllPlaylists] = useState<CollectionItem[]>([]);
  const [allAlbums, setAllAlbums] = useState<CollectionItem[]>([]);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [recs, setRecs] = useState<TrackRef[]>(cachedSearchRecs ?? []);
  const [recsLoading, setRecsLoading] = useState(false);
  const [searchPlayingKey, setSearchPlayingKey] = useState<string | null>(null);
  const [searchPlayingCover, setSearchPlayingCover] = useState<string | null>(null);
  const debounce = useRef<number | undefined>(undefined);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Блокируем скролл внешнего контейнера в режиме пустого поиска (Hero), чтобы центрировать без скроллбара
  useEffect(() => {
    if (!hasActiveQuery) {
      const contentEl = document.querySelector(".content") as HTMLElement | null;
      if (contentEl) {
        const prevOverflow = contentEl.style.overflowY;
        const prevPadding = contentEl.style.paddingBottom;
        contentEl.style.overflowY = "hidden";
        contentEl.style.paddingBottom = "0px";
        return () => {
          contentEl.style.overflowY = prevOverflow;
          contentEl.style.paddingBottom = prevPadding;
        };
      }
    }
  }, [hasActiveQuery]);

  // Рекомендации при пустом поиске
  const [recRefreshKey, setRecRefreshKey] = useState(0);

  useEffect(() => {
    const onProvidersChanged = () => {
      cachedSearchRecs = null;
      cachedSearchRecsKey = "";
      setRecs([]);
      setRecRefreshKey((k) => k + 1);
    };
    window.addEventListener("vessel:providers-changed", onProvidersChanged);
    return () => {
      window.removeEventListener("vessel:providers-changed", onProvidersChanged);
    };
  }, []);

  useEffect(() => {
    if (query.trim()) {
      return;
    }
    const currentKey = `${state?.library?.length ?? 0}:${state?.playlists?.length ?? 0}:${recRefreshKey}`;
    if (cachedSearchRecs && cachedSearchRecs.length > 0 && cachedSearchRecsKey === currentKey) {
      setRecs(cachedSearchRecs);
      return;
    }
    let cancelled = false;
    setRecsLoading(true);
    void (async () => {
      try {
        const providersStr = await api.getRecommendationProviders().catch(() => "all");
        const activeProviders = parseActiveProviders(providersStr);

        let result: TrackRef[] = [];

        // 1. Быстрый и качественный единый Recommendation Core
        try {
          const homeRecs = await api.getHomeRecommendations(24, false, providersStr);
          if (Array.isArray(homeRecs) && homeRecs.length > 0) {
            result = homeRecs;
          }
        } catch (e) {
          console.warn("Search home recs error:", e);
        }

        // 2. Если мало треков, пробуем рекомендации волны
        if (result.length < 6) {
          try {
            const waveRecs = await api.getWaveRecommendations("favorites", 20, null, providersStr);
            if (Array.isArray(waveRecs) && waveRecs.length > 0) {
              for (const t of waveRecs) {
                if (t && !result.some((r) => trackKey(r) === trackKey(t))) {
                  result.push(t);
                }
              }
            }
          } catch {}
        }

        // 3. Если всё ещё мало, пробуем getRelated от недавних любимых треков
        if (result.length < 6 && state?.library && state.library.length > 0) {
          const seeds = state.library.slice(0, 4);
          for (const s of seeds) {
            if (result.length >= 18) break;
            try {
              const rel = await api.getRelated(s, 6);
              if (Array.isArray(rel)) {
                for (const t of rel) {
                  if (t && !result.some((r) => trackKey(r) === trackKey(t))) {
                    result.push(t);
                  }
                }
              }
            } catch {}
          }
        }

        // 4. Если всё ещё пусто, ищем популярные хиты по активным сервисам
        if (result.length < 6) {
          for (const p of activeProviders) {
            if (result.length >= 18) break;
            try {
              const chartSearch = await api.search("Top Hits", p);
              if (chartSearch?.tracks && chartSearch.tracks.length > 0) {
                for (const t of chartSearch.tracks) {
                  if (result.length >= 18) break;
                  if (!result.some((r) => trackKey(r) === trackKey(t))) {
                    result.push(t);
                  }
                }
              }
            } catch {}
          }
        }

        if (!cancelled) {
          if (result.length > 0) {
            cachedSearchRecs = result;
            cachedSearchRecsKey = currentKey;
            setRecs(result);
          } else {
            setRecs([]);
          }
        }
      } catch {
        // тихо
      } finally {
        if (!cancelled) setRecsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [query, state?.library?.length, state?.playlists?.length, recRefreshKey]);

  useEffect(() => {
    if (debounce.current) window.clearTimeout(debounce.current);
    const q = query.trim();
    if (!q) {
      setResults([]);
      setCollections([]);
      setAllTracks([]);
      setAllArtists([]);
      setAllPlaylists([]);
      setAllAlbums([]);
      setMessage(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    debounce.current = window.setTimeout(async () => {
      try {
        const filterCol = (list: CollectionItem[]) => {
          if (provider === "all") return list;
          const target = PROVIDER_VALUE[provider] || provider;
          return list.filter(
            (c) =>
              c.provider === target ||
              c.provider === provider ||
              (provider === "soundcloud" && (c.provider as string) === "sound_cloud") ||
              (provider === "youtube_music" && (c.provider as string) === "you_tube_music")
          );
        };

        if (category === "all") {
          const [outcome, foundPlaylists, foundAlbums, foundArtists] = await Promise.all([
            api.search(q, provider).catch(() => ({ tracks: [], failures: [] })),
            api.searchCollections(q, "playlists", provider).catch(() => []),
            api.searchCollections(q, "albums", provider).catch(() => []),
            api.searchCollections(q, "artists", provider).catch(() => []),
          ]);
          const mixed = mixSearchTracks(outcome.tracks);
          setAllTracks(mixed);
          setAllPlaylists(filterCol(foundPlaylists));
          setAllAlbums(filterCol(foundAlbums));
          setAllArtists(filterCol(foundArtists));
          setResults([]);
          setCollections([]);
          if (mixed.length === 0 && foundArtists.length === 0 && foundPlaylists.length === 0 && foundAlbums.length === 0) {
            setMessage(t(lang, "search.noResults"));
          } else {
            setMessage(null);
          }
        } else if (category === "tracks") {
          const outcome = await api.search(q, provider);
          const mixed = mixSearchTracks(outcome.tracks);
          setResults(mixed);
          setCollections([]);
          if (mixed.length === 0) {
            setMessage(
              outcome.failures.length > 0
                ? outcome.failures.join("; ")
                : t(lang, "search.noResults")
            );
          } else {
            setMessage(
              outcome.failures.length > 0
                ? `${t(lang, "common.found")} ${mixed.length}, ${t(lang, "search.someUnavailable")}`
                : null
            );
          }
        } else {
          const kind =
            category === "playlists"
              ? "playlists"
              : category === "albums"
              ? "albums"
              : "artists";
          const found = await api.searchCollections(q, kind, provider);
          const filtered = filterCol(found);
          setCollections(filtered);
          setResults([]);
          setMessage(filtered.length === 0 ? t(lang, "search.noResults") : null);
        }
      } catch (err) {
        setError(String(err));
        setResults([]);
        setCollections([]);
        setAllTracks([]);
        setAllArtists([]);
        setAllPlaylists([]);
        setAllAlbums([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounce.current) window.clearTimeout(debounce.current);
    };
  }, [query, provider, category]);

  const nowKey = state?.now_playing ? trackKey(state.now_playing) : null;

  const playOne = (track: TrackRef, listToUse = results) => {
    setSearchPlayingKey(trackKey(track));
    setSearchPlayingCover(track.artwork_url || null);
    const idx = listToUse.findIndex((t) => trackKey(t) === trackKey(track));
    void playTracks(listToUse, idx < 0 ? 0 : idx);
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
      if (pl.tracks[0]) {
        setSearchPlayingKey(trackKey(pl.tracks[0]));
        setSearchPlayingCover(pl.cover_url || pl.tracks[0]?.artwork_url || null);
      }
      await playTracks(pl.tracks, 0);
    } catch (err) {
      showToast(String(err), true);
    }
  };

  if (preview) {
    const pl = preview.playlist;
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
          <div className="page-panel">
            <div className="page-panel-header" style={{ display: "flex", gap: 20, alignItems: "center", marginBottom: 18 }}>
              {pl.cover_url && (
                <img
                  src={pl.cover_url}
                  alt={pl.title}
                  style={{ width: 120, height: 120, borderRadius: 12, objectFit: "cover" }}
                />
              )}
              <div>
                <h2 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>{pl.title}</h2>
                <div style={{ fontSize: 13, color: "var(--text3)", marginTop: 6 }}>
                  {pl.tracks.length} {t(lang, "common.tracks")}
                </div>
                <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      if (pl.tracks.length > 0) void playTracks(pl.tracks, 0);
                    }}
                  >
                    ▶ {t(lang, "common.play")}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => void addToLibrary(pl.source_url || "")}
                    disabled={adding === pl.source_url}
                  >
                    + {t(lang, "search.add")}
                  </button>
                </div>
              </div>
            </div>
            <div className="page-panel-body">
              <VirtualTrackList
                items={pl.tracks}
                renderItem={(track, i) => (
                  <TrackRow
                    key={trackKey(track) + i}
                    track={track}
                    index={i}
                    nowKey={nowKey}
                    onPlay={(t) => {
                      setSearchPlayingKey(trackKey(t));
                      setSearchPlayingCover(t.artwork_url || null);
                      const idx = pl.tracks.findIndex((x) => trackKey(x) === trackKey(t));
                      void playTracks(pl.tracks, idx < 0 ? 0 : idx);
                    }}
                    onArtistClick={(name, provider) => navigateTo("artist", { artist: name, provider })}
                  />
                )}
              />
            </div>
          </div>
        )}
      </div>
    );
  }

  const renderArtistCard = (item: CollectionItem) => {
    return (
      <div
        key={`${item.provider}:${item.id}`}
        className="search-artist-card"
        onClick={() => navigateTo("artist", { artist: item.title, provider: item.provider, artistId: item.id })}
        title={item.title}
      >
        <div className="search-artist-avatar-wrap">
          <Artwork
            url={item.artwork_url}
            alt={item.title}
            seed={item.id.length}
            square={true}
            className="search-artist-avatar-img"
          />
          {item.provider && (
            <span className="search-artist-badge" title={providerLabel(item.provider)}>
              <PlatformIcon kind={item.provider} size={13} />
            </span>
          )}
        </div>
        <div className="search-artist-name">{item.title}</div>
      </div>
    );
  };

  const renderCollectionCard = (item: CollectionItem) => {
    return (
      <div
        key={`${item.provider}:${item.id}`}
        className="search-collection-card"
        title={item.title}
        onClick={() => void openPreview(item)}
      >
        <div className="search-collection-art-wrap">
          <Artwork
            url={item.artwork_url}
            alt={item.title}
            seed={item.id.length}
            square={true}
            className="search-collection-art"
          />
          {item.provider && (
            <span className="search-collection-badge" title={providerLabel(item.provider)}>
              <PlatformIcon kind={item.provider} size={13} />
            </span>
          )}
          <button
            className="search-card-play-btn"
            title={t(lang, "common.play")}
            onClick={(e) => {
              e.stopPropagation();
              void playCollection(item);
            }}
          >
            ▶
          </button>
        </div>
        <div className="search-collection-title">{item.title}</div>
        <div className="search-collection-sub">{item.subtitle || providerLabel(item.provider)}</div>
      </div>
    );
  };

  const currentProviderObj =
    SEARCH_PLATFORMS.find((p) => p.key === provider) || SEARCH_PLATFORMS[0];

  const isPlayingFromSearch = Boolean(
    searchPlayingKey &&
    state?.now_playing &&
    trackKey(state.now_playing) === searchPlayingKey
  );
  const searchGlowArt = isPlayingFromSearch ? searchPlayingCover : null;

  const hasAllResults =
    allTracks.length > 0 || allArtists.length > 0 || allPlaylists.length > 0 || allAlbums.length > 0;

  return (
    <div className={`view search-page ${hasActiveQuery ? "mode-top" : "mode-hero"}`}>
      <div className="page-panel">
        {searchGlowArt && (
          <div
            className="page-ambient-glow"
            style={{ backgroundImage: `url("${searchGlowArt}")` }}
          />
        )}

        <div
          className={`page-panel-header search-header ${
            hasActiveQuery
              ? isSidebarTop && !isSidebarAutoHide
                ? "search-bar-offset-top"
                : "search-bar-compact-top"
              : "search-header-hero"
          }`}
          style={{ paddingBottom: hasActiveQuery ? 6 : 0 }}
        >
          <div className="search-interactive-group">
            {/* Capsule Search Bar */}
            <div className="search-pill-container">
              <div className="search-pill">
                <svg
                  className="search-pill-icon"
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>

                <input
                  ref={inputRef}
                  type="text"
                  className="search-pill-input"
                  placeholder={lang === "ru" ? "Поиск..." : "Search..."}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                />

                {query && (
                  <button
                    type="button"
                    className="search-pill-clear-btn"
                    onClick={() => {
                      setQuery("");
                      inputRef.current?.focus();
                    }}
                    title={lang === "ru" ? "Очистить" : "Clear"}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="18" y1="6" x2="6" y2="18" />
                      <line x1="6" y1="6" x2="18" y2="18" />
                    </svg>
                  </button>
                )}

                {/* Provider Flyout Trigger */}
                <div className="search-pill-provider-anchor" ref={dropdownRef}>
                  <button
                    className="search-pill-provider-btn"
                    onClick={() => setDropdownOpen(!dropdownOpen)}
                    type="button"
                    title={currentProviderObj.label}
                  >
                    <PlatformIcon kind={currentProviderObj.key} size={22} color={currentProviderObj.color} />
                  </button>

                  {dropdownOpen && (
                    <div className="search-provider-flyout">
                      {SEARCH_PLATFORMS.map((p) => {
                        const selected = p.key === provider;
                        return (
                          <button
                            key={p.key}
                            type="button"
                            className={`search-flyout-item ${selected ? "selected" : ""}`}
                            onClick={() => {
                              setProvider(p.key);
                              setDropdownOpen(false);
                            }}
                            title={p.label}
                          >
                            <PlatformIcon kind={p.key} size={22} color={p.color} />
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Category Filter Pills (hover zone - appears on hover over search or this zone) */}
            <div className="search-cat-pills-zone">
              <div className="search-cat-pills">
                {[
                  { id: "all", label: "Все", icon: <IconSearchTab /> },
                  { id: "tracks", label: "Треки", icon: <IconMusicTab /> },
                  { id: "playlists", label: "Плейлисты", icon: <IconPlaylistTab /> },
                  { id: "albums", label: "Альбомы", icon: <IconDiscTab /> },
                  { id: "artists", label: "Артисты", icon: <IconUserTab /> },
                ].map((tab) => {
                  const active = category === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      className={`search-cat-pill ${active ? "active" : ""}`}
                      onClick={() => setCategory(tab.id as any)}
                    >
                      <span className="search-cat-icon">{tab.icon}</span>
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        <div className="page-panel-body">
          {error && (
            <div className="alert" style={{ marginBottom: 16 }}>
              <span className="alert-mark">!</span>
              <div className="set-desc" style={{ color: "var(--red)" }}>
                {error}
              </div>
            </div>
          )}

          {/* Empty query recommendations: horizontal card row (Screenshot 5) */}
          {!hasActiveQuery && recsLoading && (
            <div className="search-hero-recs-wrap">
              <div className="search-hero-recs-row">
                {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map((num) => (
                  <div key={num} className="search-hero-rec-card skel-card">
                    <div className="skel search-hero-rec-skel-art" />
                    <div className="skel search-hero-rec-skel-line" style={{ width: "80%" }} />
                    <div className="skel search-hero-rec-skel-line" style={{ width: "50%" }} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {!hasActiveQuery && !recsLoading && recs.length > 0 && (
            <div className="search-hero-recs-wrap">
              <div className="search-hero-recs-row">
                {recs.map((track) => {
                  const artistStr = track.artists?.join(", ") || "";
                  return (
                    <div
                      key={`${track.provider}:${track.id}`}
                      className="search-hero-rec-card"
                      onClick={() => {
                        setSearchPlayingKey(trackKey(track));
                        setSearchPlayingCover(track.artwork_url || null);
                        const idx = recs.findIndex((r) => trackKey(r) === trackKey(track));
                        playTracks(recs, idx < 0 ? 0 : idx);
                      }}
                      title={`${track.title} - ${artistStr}`}
                    >
                      <div className="search-hero-rec-art-wrap">
                        <Artwork
                          url={track.artwork_url}
                          alt={track.title}
                          seed={track.id.length}
                          square={true}
                          className="search-hero-rec-art"
                        />
                        {track.provider && (
                          <span className="search-hero-rec-badge" title={providerLabel(track.provider)}>
                            <PlatformIcon kind={track.provider} size={12} />
                          </span>
                        )}
                      </div>
                      <div className="search-hero-rec-title">{track.title}</div>
                      <div className="search-hero-rec-artist">{artistStr}</div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {hasActiveQuery && loading && (
            <div className="tracklist">
              <div className="skel" />
              <div className="skel" />
              <div className="skel" />
              <div className="skel" />
            </div>
          )}

          {/* CATEGORY: ALL */}
          {!loading && query.trim() && category === "all" && (
            <>
              {!hasAllResults && !error && (
                <div className="empty">
                  <div className="ico">?</div>
                  <div className="t1">{t(lang, "search.noResults")}</div>
                  <div className="t2">{t(lang, "search.tryDifferent")}</div>
                </div>
              )}

              {/* Section: Tracks */}
              {allTracks.length > 0 && (
                <div className="search-all-section">
                  <div className="search-all-head">
                    <span className="search-all-title">Треки</span>
                    <span className="search-all-more-link" onClick={() => setCategory("tracks")}>
                      Показать все ({allTracks.length})
                    </span>
                  </div>
                  <div className="tracklist">
                    {allTracks.slice(0, 6).map((track, i) => (
                      <TrackRow
                        key={trackKey(track) + i}
                        track={track}
                        index={i}
                        nowKey={nowKey}
                        onPlay={(t) => playOne(t, allTracks)}
                        onArtistClick={(name, provider) => navigateTo("artist", { artist: name, provider })}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Section: Artists */}
              {allArtists.length > 0 && (
                <div className="search-all-section">
                  <div className="search-all-head">
                    <span className="search-all-title">Артисты</span>
                    <span className="search-all-more-link" onClick={() => setCategory("artists")}>
                      Показать все ({allArtists.length})
                    </span>
                  </div>
                  <div className="search-artists-grid">
                    {allArtists.slice(0, 8).map(renderArtistCard)}
                  </div>
                </div>
              )}

              {/* Section: Playlists */}
              {allPlaylists.length > 0 && (
                <div className="search-all-section">
                  <div className="search-all-head">
                    <span className="search-all-title">Плейлисты</span>
                    <span className="search-all-more-link" onClick={() => setCategory("playlists")}>
                      Показать все ({allPlaylists.length})
                    </span>
                  </div>
                  <div className="search-collections-grid">
                    {allPlaylists.slice(0, 6).map(renderCollectionCard)}
                  </div>
                </div>
              )}

              {/* Section: Albums */}
              {allAlbums.length > 0 && (
                <div className="search-all-section">
                  <div className="search-all-head">
                    <span className="search-all-title">Альбомы</span>
                    <span className="search-all-more-link" onClick={() => setCategory("albums")}>
                      Показать все ({allAlbums.length})
                    </span>
                  </div>
                  <div className="search-collections-grid">
                    {allAlbums.slice(0, 6).map(renderCollectionCard)}
                  </div>
                </div>
              )}
            </>
          )}

          {/* CATEGORY: TRACKS */}
          {!loading && query.trim() && category === "tracks" && (
            <>
              {results.length === 0 && !error && (
                <div className="empty">
                  <div className="ico">?</div>
                  <div className="t1">{t(lang, "search.noResults")}</div>
                  <div className="t2">{t(lang, "search.tryDifferent")}</div>
                </div>
              )}
              {results.length > 0 && (
                <>
                  <div className="group-title" style={{ margin: "4px 0 8px" }}>
                    {t(lang, "search.tracks")} {message ? ` · ${message}` : ""}
                  </div>
                  <VirtualTrackList
                    items={results}
                    renderItem={(track, i) => (
                      <TrackRow
                        key={trackKey(track) + i}
                        track={track}
                        index={i}
                        nowKey={nowKey}
                        onPlay={(t) => playOne(t, results)}
                        onArtistClick={(name, provider) => navigateTo("artist", { artist: name, provider })}
                      />
                    )}
                  />
                </>
              )}
            </>
          )}

          {/* CATEGORY: ARTISTS */}
          {!loading && query.trim() && category === "artists" && (
            <>
              {collections.length === 0 && !error && (
                <div className="empty">
                  <div className="ico">?</div>
                  <div className="t1">{t(lang, "search.noResults")}</div>
                  <div className="t2">{t(lang, "search.tryDifferent")}</div>
                </div>
              )}
              {collections.length > 0 && (
                <>
                  <div className="group-title" style={{ margin: "4px 0 8px" }}>
                    {t(lang, "search.artists")} · {collections.length}
                  </div>
                  <div className="search-artists-grid">
                    {collections.map(renderArtistCard)}
                  </div>
                </>
              )}
            </>
          )}

          {/* CATEGORY: PLAYLISTS & ALBUMS */}
          {!loading && query.trim() && (category === "playlists" || category === "albums") && (
            <>
              {collections.length === 0 && !error && (
                <div className="empty">
                  <div className="ico">?</div>
                  <div className="t1">{t(lang, "search.noResults")}</div>
                  <div className="t2">{t(lang, "search.tryDifferent")}</div>
                </div>
              )}
              {collections.length > 0 && (
                <>
                  <div className="group-title" style={{ margin: "4px 0 8px" }}>
                    {category === "playlists" ? t(lang, "search.playlists") : t(lang, "search.albums")} · {collections.length}
                  </div>
                  <div className="search-collections-grid">
                    {collections.map(renderCollectionCard)}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
