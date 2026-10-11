import { useState, useEffect, useRef } from "react";
import { useApp } from "../../store";
import { Artwork } from "../../components/Artwork";
import { PlatformIcon } from "../../components/PlatformIcon";
import { cleanAlbumTitle } from "../../lib/utils";
import * as api from "../../api/commands";
import { ScrollableCardRow, globalArtistAvatars } from "./HomeHelpers";

let cachedExploreAlbums: any[] | null = null;
let cachedExploreArtists: any[] | null = null;
let cachedExploreProvidersKey: string | null = null;

export function clearExploreCache() {
  cachedExploreAlbums = null;
  cachedExploreArtists = null;
  cachedExploreProvidersKey = null;
}

export function ExploreBlockContent({
  nowKey: _nowKey,
  isLive: _isLive,
  navigateTo,
  lang,
}: {
  nowKey: string | null;
  isLive: boolean;
  navigateTo: (view: any, params?: any) => void;
  lang: any;
}) {
  const { state, playTracks, showToast, setExternalPlaylist } = useApp();
  const [realAlbums, setRealAlbums] = useState<any[]>(() => cachedExploreAlbums || []);
  const [artistsQuadrant, setArtistsQuadrant] = useState<any[]>(() => cachedExploreArtists || []);
  const [artistAvatars, setArtistAvatars] = useState<Record<string, string>>(() => ({ ...globalArtistAvatars }));
  const [loadingExplore, setLoadingExplore] = useState(() => !cachedExploreAlbums && !cachedExploreArtists);
  const [providers, setProviders] = useState<string | null>(() => cachedExploreProvidersKey);
  const fetchedAvatarNames = useRef(new Set<string>());
  const inFlightRef = useRef(false);

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

    const onProvidersChanged = (e: any) => {
      cachedExploreAlbums = null;
      cachedExploreArtists = null;
      cachedExploreProvidersKey = null;
      setRealAlbums([]);
      setArtistsQuadrant([]);
      setLoadingExplore(true);
      setProviders(e.detail || "all");
    };
    window.addEventListener("vessel:providers-changed", onProvidersChanged);

    return () => {
      cancelled = true;
      window.removeEventListener("vessel:providers-changed", onProvidersChanged);
    };
  }, []);

  useEffect(() => {
    if (providers === null) return;
    let cancelled = false;
    const providersChanged = cachedExploreProvidersKey !== null && cachedExploreProvidersKey !== providers;
    if (providersChanged) {
      cachedExploreAlbums = null;
      cachedExploreArtists = null;
    }
    if (cachedExploreAlbums && cachedExploreArtists && !providersChanged) {
      setRealAlbums(cachedExploreAlbums);
      setArtistsQuadrant(cachedExploreArtists);
      setLoadingExplore(false);
      return;
    }
    if (inFlightRef.current) return;

    inFlightRef.current = true;
    setLoadingExplore(true);

    void (async () => {
      try {
        const content = await api.getExploreContent(providersChanged, providers || undefined);
        if (!cancelled) {
          if (content.albums && content.albums.length > 0) {
            cachedExploreAlbums = content.albums;
            setRealAlbums(content.albums);
          } else {
            cachedExploreAlbums = [];
            setRealAlbums([]);
          }
          if (content.artists && content.artists.length > 0) {
            const mappedArtists = content.artists.map((item) => ({
              name: item.title,
              provider: item.provider,
              avatarUrl: item.artwork_url,
              weight: 1,
            }));
            cachedExploreArtists = mappedArtists;
            setArtistsQuadrant(mappedArtists);
          } else {
            cachedExploreArtists = [];
            setArtistsQuadrant([]);
          }
          cachedExploreProvidersKey = providers;
        }
      } catch (e) {
        console.warn("Explore content error:", e);
      } finally {
        inFlightRef.current = false;
        if (!cancelled) {
          setLoadingExplore(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [state?.library?.length, state?.playlists?.length, providers]);

  // Asynchronously resolve true artist profile pictures without flood or loops
  useEffect(() => {
    if (artistsQuadrant.length === 0) return;
    const namesToFetch = artistsQuadrant
      .filter((a) => {
        const lower = a.name.toLowerCase().trim();
        return !artistAvatars[lower] && !globalArtistAvatars[lower] && !a.avatarUrl && !fetchedAvatarNames.current.has(lower);
      })
      .map((a) => a.name);
    if (namesToFetch.length === 0) return;

    for (const name of namesToFetch) {
      fetchedAvatarNames.current.add(name.toLowerCase().trim());
    }

    let cancelled = false;
    void (async () => {
      for (const name of namesToFetch.slice(0, 8)) {
        if (cancelled) break;
        try {
          const colls = await api.searchCollections(name, "artists");
          const lower = name.toLowerCase().trim();
          const match = colls.find((c: any) => c.title.toLowerCase().trim() === lower) || colls[0];
          if (match?.artwork_url && !cancelled) {
            globalArtistAvatars[lower] = match.artwork_url;
            setArtistAvatars((prev) => ({ ...prev, [lower]: match.artwork_url! }));
          }
        } catch {}
        await new Promise((r) => setTimeout(r, 150));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [artistsQuadrant]);

  const handlePlayRealAlbum = async (alb: any) => {
    try {
      if (alb.tracks && alb.tracks.length > 0) {
        await playTracks(alb.tracks, 0);
        return;
      }
      if (alb.web_url) {
        showToast(lang === "ru" ? "Загрузка…" : "Loading…", false, 1500);
        let pl = null;
        try {
          pl = await api.previewPlaylistUrl(alb.web_url);
        } catch {
          await new Promise((r) => setTimeout(r, 700));
          try {
            pl = await api.previewPlaylistUrl(alb.web_url);
          } catch {}
        }
        if (pl && pl.tracks && pl.tracks.length > 0) {
          await playTracks(pl.tracks, 0);
          return;
        }
      }
      if (alb.track) {
        await playTracks([alb.track], 0);
        return;
      }
      showToast(lang === "ru" ? "Альбом пуст" : "Album is empty", true);
    } catch (e) {
      showToast(String(e), true);
    }
  };

  const handleOpenRealAlbum = async (alb: any) => {
    try {
      if (alb.tracks && alb.tracks.length > 0) {
        const pl: any = {
          id: alb.id || `external-album-${Date.now()}`,
          title: alb.title,
          tracks: alb.tracks,
          created_at_ms: Date.now(),
          cover_url: alb.cover_url || alb.artwork_url || alb.coverUrl || null,
          source_url: alb.web_url || null,
        };
        setExternalPlaylist(pl);
        navigateTo("playlist", { playlistId: "external" });
        return;
      }
      if (alb.web_url) {
        showToast(lang === "ru" ? "Загрузка альбома…" : "Loading album…", false, 2000);
        let pl = null;
        try {
          pl = await api.previewPlaylistUrl(alb.web_url);
        } catch {
          await new Promise((r) => setTimeout(r, 700));
          try {
            pl = await api.previewPlaylistUrl(alb.web_url);
          } catch {}
        }
        if (pl) {
          setExternalPlaylist(pl);
          navigateTo("playlist", { playlistId: "external" });
          return;
        }
      }
      // Dynamic fallback for album tracks
      try {
        const searchRes = await api.search(`${alb.title}`, undefined);
        const tracks = (searchRes?.tracks || []).filter((t: any) =>
          alb.provider ? t.provider === alb.provider : true
        );
        if (tracks.length > 0) {
          const pl: any = {
            id: alb.id || `external-album-${Date.now()}`,
            title: alb.title,
            tracks: tracks.slice(0, 30),
            created_at_ms: Date.now(),
            cover_url: alb.cover_url || alb.artwork_url || alb.coverUrl || tracks[0]?.artwork_url || null,
            source_url: alb.web_url || null,
          };
          setExternalPlaylist(pl);
          navigateTo("playlist", { playlistId: "external" });
          return;
        }
      } catch {}

      if (alb.track) {
        const pl: any = {
          id: `external-album-${Date.now()}`,
          title: alb.title,
          tracks: [alb.track],
          created_at_ms: Date.now(),
          cover_url: alb.cover_url || alb.artwork_url || alb.coverUrl || null,
          source_url: null,
        };
        setExternalPlaylist(pl);
        navigateTo("playlist", { playlistId: "external" });
        return;
      }
      showToast(lang === "ru" ? "Не удалось открыть альбом" : "Failed to open album", true);
    } catch (e) {
      showToast(String(e), true);
    }
  };

  const totalPlaylistTracks = state?.playlists?.reduce((acc, p) => acc + (p.tracks?.length || 0), 0) ?? 0;
  const hasTasteProfile = (state?.library?.length ?? 0) > 0 || totalPlaylistTracks > 0;

  if (!hasTasteProfile) {
    return (
      <div className="section home-explore-section">
        <div className="home-section-head">
          <div className="home-section-title-wrap">
            <span className="home-section-title">{lang === "ru" ? "Возможно, вам понравится" : "You Might Like"}</span>
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
    <div className="section home-explore-section">
      <div className="home-section-head">
        <div className="home-section-title-wrap">
          <span className="home-section-title">{lang === "ru" ? "Возможно, вам понравится" : "You Might Like"}</span>
        </div>
      </div>

      <div className="home-explore-grid">
        {/* ROW 1: ИСПОЛНИТЕЛИ (ровно 12, во всю ширину страницы) */}
        <div className="home-explore-quadrant">
          <div className="home-explore-qtitle">{lang === "ru" ? "Исполнители" : "Artists"}</div>
          <ScrollableCardRow className="home-explore-row" hasMore={false}>
            {loadingExplore && artistsQuadrant.length === 0 ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={`skel-art-${i}`} className="home-explore-skeleton-card">
                  <div className="home-explore-skeleton-cover circle" />
                  <div className="home-skeleton-title" style={{ margin: "6px auto 0", width: "65%" }} />
                </div>
              ))
            ) : artistsQuadrant.length === 0 ? (
              <div className="home-empty-notice" style={{ padding: "16px 0", color: "var(--text3)", fontSize: "13px" }}>
                {lang === "ru" ? "Добавьте больше исполнителей в медиатеку" : "Add more artists to your library"}
              </div>
            ) : (
              artistsQuadrant.map((art, i) => (
                <div
                  key={art.name + i}
                  className="home-artist-card"
                  onClick={() => navigateTo("artist", { artist: art.name, provider: art.provider })}
                >
                  <div className="home-artist-avatar-wrap">
                    <Artwork
                      url={artistAvatars[art.name.toLowerCase().trim()] || globalArtistAvatars[art.name.toLowerCase().trim()] || art.avatarUrl}
                      alt={art.name}
                      seed={i + 10}
                      className="home-artist-avatar-img"
                    />
                    {art.provider && (
                      <div className="home-rec-badge" style={{ bottom: "2px", right: "2px" }}>
                        <PlatformIcon kind={art.provider as any} size={12} />
                      </div>
                    )}
                  </div>
                  <div className="home-artist-name">{art.name}</div>
                  <div className="home-artist-sub">{lang === "ru" ? "Исполнитель" : "Artist"}</div>
                </div>
              ))
            )}
          </ScrollableCardRow>
        </div>

        {/* ROW 2: АЛЬБОМЫ (ровно 12, во всю ширину страницы) */}
        <div className="home-explore-quadrant">
          <div className="home-explore-qtitle">{lang === "ru" ? "Альбомы" : "Albums"}</div>
          <ScrollableCardRow className="home-explore-row" hasMore={false}>
            {loadingExplore && realAlbums.length === 0 ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={`skel-alb-${i}`} className="home-explore-skeleton-card">
                  <div className="home-explore-skeleton-cover" />
                  <div className="home-skeleton-title" />
                  <div className="home-skeleton-sub" />
                </div>
              ))
            ) : realAlbums.length === 0 ? (
              <div className="home-empty-notice" style={{ padding: "16px 0", color: "var(--text3)", fontSize: "13px" }}>
                {lang === "ru" ? "Добавьте альбомы в медиатеку" : "Add albums to your library"}
              </div>
            ) : (
              realAlbums.slice(0, 12).map((alb, i) => {
                const author = alb.subtitle || alb.author || alb.artist || (lang === "ru" ? "Альбом" : "Album");
                const title = cleanAlbumTitle(alb.title, author);
                return (
                  <div
                    key={alb.id || alb.web_url || i}
                    className="home-explore-card"
                    onClick={() => handleOpenRealAlbum(alb)}
                    title={`${title} — ${author}`}
                  >
                    <div className="home-explore-card-cover">
                      <Artwork url={alb.cover_url || alb.artwork_url || alb.coverUrl} alt={title} seed={i + 20} className="home-explore-card-img" />
                      <div className="home-rec-play-overlay">
                        <button
                          type="button"
                          className="home-rec-play-btn"
                          onClick={(e) => {
                            e.stopPropagation();
                            handlePlayRealAlbum(alb);
                          }}
                        >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="#000000" style={{ marginLeft: "2px" }}>
                            <polygon points="6,4 20,12 6,20" />
                          </svg>
                        </button>
                      </div>
                      {alb.provider && (
                        <div className="home-rec-badge">
                          <PlatformIcon kind={alb.provider as any} size={13} />
                        </div>
                      )}
                    </div>
                    <div className="home-explore-card-title">{title}</div>
                    <div className="home-explore-card-sub">{author}</div>
                  </div>
                );
              })
            )}
          </ScrollableCardRow>
        </div>
      </div>
    </div>
  );
}
