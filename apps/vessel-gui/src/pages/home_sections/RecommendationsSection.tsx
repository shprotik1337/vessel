import { useState, useEffect, useRef, useCallback } from "react";
import { useApp, semanticTrackKey } from "../../store";
import { PlatformIcon } from "../../components/PlatformIcon";
import { Artwork } from "../../components/Artwork";
import {
  trackKey,
  filterValidArtists,
  parseActiveProviders,
  normalizeProvider,
} from "../../lib/utils";
import type { TrackRef } from "../../api/types";
import * as api from "../../api/commands";
import { ScrollableCardRow } from "./HomeHelpers";

let cachedHomeRecs: TrackRef[] | null = null;
let cachedHomeRecsProvidersKey: string | null = null;

export function clearHomeRecsCache() {
  cachedHomeRecs = null;
  cachedHomeRecsProvidersKey = null;
}

export function RecommendationsBlockContent({
  nowKey,
  isLive,
  lang,
}: {
  nowKey: string | null;
  isLive: boolean;
  lang: any;
}) {
  const { state, playTracks, navigateTo } = useApp();
  const [recTracks, setRecTracks] = useState<TrackRef[]>(() => cachedHomeRecs ?? []);
  const [loading, setLoading] = useState(() => !cachedHomeRecs || cachedHomeRecs.length === 0);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingRef = useRef(false);
  const reqIdRef = useRef(0);
  const [providers, setProviders] = useState<string | null>(() => cachedHomeRecsProvidersKey);
  const [excludedPlaylists, setExcludedPlaylists] = useState<string[]>([]);
  const favorites = state?.library ?? [];
  const playlists = state?.playlists ?? [];

  useEffect(() => {
    let cancelled = false;
    void api
      .getRecommendationProviders()
      .then((p) => {
        if (!cancelled) setProviders(p || "all");
      })
      .catch(() => {
        if (!cancelled) setProviders("all");
      });
    void api
      .getExcludedRecommendationPlaylists()
      .then((list) => {
        if (!cancelled) setExcludedPlaylists(list);
      })
      .catch(() => {});

    const onProvidersChanged = (e: any) => {
      cachedHomeRecs = null;
      cachedHomeRecsProvidersKey = null;
      setRecTracks([]);
      setLoading(true);
      setProviders(e.detail || "all");
    };
    window.addEventListener("vessel:providers-changed", onProvidersChanged);

    return () => {
      cancelled = true;
      window.removeEventListener("vessel:providers-changed", onProvidersChanged);
    };
  }, []);

  // Собираем все треки вкуса: лайки + не исключённые плейлисты
  const playlistTracks: TrackRef[] = [];
  const seenPlaylistTrackKeys = new Set<string>();
  for (const pl of playlists) {
    if (excludedPlaylists.includes(pl.id)) continue;
    for (const t of pl.tracks || []) {
      const k = trackKey(t);
      if (!seenPlaylistTrackKeys.has(k)) {
        seenPlaylistTrackKeys.add(k);
        playlistTracks.push(t);
      }
    }
  }
  const tasteTracks: TrackRef[] = [...favorites];
  for (const pt of playlistTracks) {
    if (!tasteTracks.some((t) => trackKey(t) === trackKey(pt))) {
      tasteTracks.push(pt);
    }
  }

  useEffect(() => {
    if (providers === null) return;
    let cancelled = false;
    const providersChanged =
      cachedHomeRecsProvidersKey !== null && cachedHomeRecsProvidersKey !== providers;
    if (providersChanged) {
      cachedHomeRecs = null;
      cachedHomeRecsProvidersKey = null;
    }

    if (tasteTracks.length === 0) {
      setRecTracks([]);
      setLoading(false);
      loadingRef.current = false;
      return;
    }

    const activeProviders = parseActiveProviders(providers);
    if (
      cachedHomeRecs &&
      cachedHomeRecs.length > 0 &&
      !providersChanged &&
      cachedHomeRecs.every((t) => activeProviders.includes(normalizeProvider(t.provider)))
    ) {
      setRecTracks(cachedHomeRecs);
      setLoading(false);
      loadingRef.current = false;
      return;
    }

    const curReqId = ++reqIdRef.current;
    loadingRef.current = true;
    setLoading(true);

    void (async () => {
      try {
        const tracks = await api.getHomeRecommendations(24, false, providers);
        if (curReqId === reqIdRef.current && !cancelled) {
          if (tracks.length > 0) {
            cachedHomeRecs = tracks;
            cachedHomeRecsProvidersKey = providers;
            setRecTracks(tracks);
          } else {
            const fallbackFavs = tasteTracks
              .filter((t) => activeProviders.includes(normalizeProvider(t.provider)))
              .slice(0, 12);
            setRecTracks(fallbackFavs);
          }
        }
      } catch {
        if (curReqId === reqIdRef.current && !cancelled) {
          const fallbackFavs = tasteTracks
            .filter((t) => activeProviders.includes(normalizeProvider(t.provider)))
            .slice(0, 12);
          setRecTracks(fallbackFavs);
        }
      } finally {
        if (curReqId === reqIdRef.current && !cancelled) {
          loadingRef.current = false;
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [providers]);

  const handlePlayTrack = (_track: TrackRef, index: number) => {
    if (trackKey(_track) === nowKey) {
      void api.togglePlayback();
      return;
    }
    const list = recTracks.length > 0 ? recTracks : tasteTracks;
    void playTracks(list, index);
  };

  const handleLoadMore = useCallback(async () => {
    if (loadingRef.current || tasteTracks.length === 0 || recTracks.length >= 100 || providers === null) return;
    loadingRef.current = true;
    setLoadingMore(true);
    try {
      const more = await api.getHomeRecommendations(Math.min(100, recTracks.length + 16), true, providers);
      const existingKeys = new Set(recTracks.map(trackKey));
      const existingSemantics = new Set(recTracks.map(semanticTrackKey));
      const newTracks = more.filter(
        (t) => !existingKeys.has(trackKey(t)) && !existingSemantics.has(semanticTrackKey(t))
      );
      if (newTracks.length > 0) {
        setRecTracks((prev) => {
          const merged = [...prev, ...newTracks].slice(0, 100);
          cachedHomeRecs = merged;
          cachedHomeRecsProvidersKey = providers;
          return merged;
        });
      }
    } catch (e) {
      console.warn("Load more recs failed:", e);
    } finally {
      loadingRef.current = false;
      setLoadingMore(false);
    }
  }, [tasteTracks.length, recTracks, providers]);

  if (tasteTracks.length === 0) {
    return (
      <div className="section">
        <div className="home-section-head">
          <div className="home-section-title-wrap">
            <span className="home-section-title">{lang === "ru" ? "Рекомендации" : "Recommendations"}</span>
          </div>
        </div>
        <div className="home-rec-empty">
          <div className="home-rec-empty-icon">❤️</div>
          <div className="home-rec-empty-title">
            {lang === "ru"
              ? "Добавьте треки в Избранное ❤️ или создайте плейлист, чтобы мы могли подобрать рекомендации"
              : "Add tracks to Favorites ❤️ or create a playlist so we can generate recommendations"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      <div className="home-section-head">
        <div className="home-section-title-wrap">
          <span className="home-section-title">{lang === "ru" ? "Рекомендации" : "Recommendations"}</span>
          <span className="home-section-sub">
            {lang === "ru" ? "Подобрано на основе вашего вкуса и плейлистов" : "Picked based on your taste and playlists"}
          </span>
        </div>
      </div>

      <ScrollableCardRow onNearEnd={handleLoadMore} hasMore={recTracks.length < 100}>
        {loading && recTracks.length === 0 ? (
          Array.from({ length: 12 }).map((_, i) => (
            <div key={`skel-init-${i}`} className="home-skeleton-card">
              <div className="home-skeleton-cover" />
              <div className="home-skeleton-title" />
              <div className="home-skeleton-sub" />
            </div>
          ))
        ) : (
          <>
            {recTracks.map((track, i) => {
              const isTrackPlaying = trackKey(track) === nowKey && isLive;
              return (
                <div
                  key={trackKey(track) + i}
                  className="home-rec-card"
                  onClick={() => handlePlayTrack(track, i)}
                  title={`${track.title} — ${filterValidArtists(track.artists).join(", ")}`}
                >
                  <div className="home-rec-cover-wrap">
                    <Artwork url={track.artwork_url} alt={track.title} seed={i} className="home-rec-cover-img" />
                    <div className={`home-rec-play-overlay ${isTrackPlaying ? "playing" : ""}`}>
                      <button
                        type="button"
                        className="home-rec-play-btn"
                        onClick={(e) => {
                          e.stopPropagation();
                          handlePlayTrack(track, i);
                        }}
                      >
                        {isTrackPlaying ? (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="#000000">
                            <rect x="6" y="4" width="4" height="16" rx="1" />
                            <rect x="14" y="4" width="4" height="16" rx="1" />
                          </svg>
                        ) : (
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="#000000" style={{ marginLeft: "2px" }}>
                            <polygon points="6,4 20,12 6,20" />
                          </svg>
                        )}
                      </button>
                    </div>
                    <div className="home-rec-badge">
                      <PlatformIcon kind={track.provider as any} size={13} />
                    </div>
                  </div>
                  <div className="home-rec-title">{track.title}</div>
                  <div className="home-rec-artist">
                    {filterValidArtists(track.artists).map((artist, aIdx, arr) => (
                      <span key={`${artist}-${aIdx}`}>
                        <span
                          className="pl-artist-link"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigateTo("artist", { artist, provider: track.provider });
                          }}
                        >
                          {artist}
                        </span>
                        {aIdx < arr.length - 1 ? ", " : ""}
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
            {loadingMore && (
              Array.from({ length: 4 }).map((_, idx) => (
                <div key={`skel-more-${idx}`} className="home-skeleton-card">
                  <div className="home-skeleton-cover" />
                  <div className="home-skeleton-title" />
                  <div className="home-skeleton-sub" />
                </div>
              ))
            )}
          </>
        )}
      </ScrollableCardRow>
    </div>
  );
}
