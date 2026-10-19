import { useEffect, useMemo, useRef, useState } from "react";

import { useApp } from "../store";
import { TrackRow } from "../components/TrackRow";
import { VirtualTrackList } from "../components/VirtualTrackList";
import { Artwork } from "../components/Artwork";
import { PlaylistCover } from "../components/PlaylistCover";
import { ArtistBioModal } from "../components/ArtistBioModal";
import { trackKey, providerLabel, formatDuration, artistLabel, filterValidArtists, dedupe, resolveArtworkUrl } from "../lib/utils";
import { t, type Lang } from "../i18n";
import type { ArtistProfile, CollectionItem, GeniusArtistInfo, Playlist, TrackRef } from "../api/types";
import * as api from "../api/commands";

const INITIAL_RELEASES = 7;
const INITIAL_TRACKS = 20;

interface ArtistProps {
  artist: string;
  provider: string | null;
  artistId: string | null;
  mode: "profile" | "releases" | "singles" | "tracks";
}

interface CachedArtistEntry {
  profile: ArtistProfile;
  geniusData: GeniusArtistInfo | null;
  allTracks: TrackRef[] | null;
  activeTarget: { provider: string; id: string } | null;
  timestamp: number;
}

const MAX_ARTIST_CACHE = 60;
const artistCache = new Map<string, CachedArtistEntry>();

function getCacheKey(artist: string, provider: string | null, artistId?: string | null): string {
  if (artistId) {
    return `${(provider || "any").toLowerCase()}:id:${artistId}`;
  }
  return `${(provider || "any").toLowerCase()}:${artist.toLowerCase().trim()}`;
}

function findInCache(artist: string, provider: string | null, artistId?: string | null): CachedArtistEntry | undefined {
  if (artistId) {
    const byId = artistCache.get(getCacheKey(artist, provider, artistId));
    if (byId) return byId;
  }
  const byName = artistCache.get(getCacheKey(artist, provider));
  if (byName) return byName;
  if (!provider) {
    for (const [k, v] of artistCache.entries()) {
      if (k.endsWith(`:${artist.toLowerCase().trim()}`) || v.profile.name.toLowerCase().trim() === artist.toLowerCase().trim()) {
        return v;
      }
    }
  }
  return undefined;
}

function ArtistHeroSkeleton({
  artistName,
  goBack,
  lang,
}: {
  artistName: string;
  goBack: () => void;
  lang: Lang;
}) {
  return (
    <div className="artist-skeleton-view" style={{ width: "100%", animation: "fade .15s ease" }}>
      {/* 420px Hero Banner Skeleton */}
      <div
        className="artist-hero-banner"
        style={{
          position: "relative",
          width: "100%",
          minHeight: "420px",
          borderRadius: 0,
          overflow: "hidden",
          marginBottom: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: "48px 32px 32px",
          border: "none",
          boxShadow: "none",
          background: "linear-gradient(180deg, var(--elev, rgba(255,255,255,0.05)) 0%, rgba(0,0,0,0.5) 75%, rgba(0,0,0,0.92) 100%)",
        }}
      >
        {/* Shimmer overlay */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "linear-gradient(90deg, transparent 0%, var(--hover, rgba(255,255,255,0.06)) 50%, transparent 100%)",
            backgroundSize: "200% 100%",
            animation: "skel 1.8s infinite ease-in-out",
            pointerEvents: "none",
          }}
        />

        {/* Floating Back Button - functional immediately */}
        <button
          onClick={goBack}
          title={t(lang, "common.back")}
          style={{
            position: "absolute",
            top: "48px",
            left: "32px",
            zIndex: 10,
            background: "rgba(0, 0, 0, 0.45)",
            backdropFilter: "blur(12px)",
            WebkitBackdropFilter: "blur(12px)",
            border: "1px solid rgba(255, 255, 255, 0.15)",
            borderRadius: "20px",
            color: "#ffffff",
            padding: "6px 14px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          }}
        >
          {t(lang, "common.back")}
        </button>

        {/* Bottom content row */}
        <div
          style={{
            position: "relative",
            zIndex: 2,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "space-between",
            gap: "24px",
            flexWrap: "wrap",
          }}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: 0, flex: 1 }}>
            <h1
              style={{
                fontSize: "42px",
                fontWeight: 800,
                color: "#ffffff",
                margin: 0,
                letterSpacing: "-0.5px",
                lineHeight: 1.1,
                opacity: 0.88,
              }}
            >
              {artistName}
            </h1>
            {/* Shimmer bar for monthly listeners */}
            <div
              className="skel"
              style={{
                width: "160px",
                height: "18px",
                borderRadius: "4px",
                marginTop: "4px",
                marginBottom: 0,
              }}
            />
            {/* Action buttons placeholder */}
            <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "14px", flexWrap: "wrap" }}>
              <div
                className="skel"
                style={{
                  width: "130px",
                  height: "38px",
                  borderRadius: "24px",
                  marginBottom: 0,
                }}
              />
              <div
                className="skel"
                style={{
                  width: "115px",
                  height: "38px",
                  borderRadius: "24px",
                  marginBottom: 0,
                }}
              />
              <div
                className="skel"
                style={{
                  width: "36px",
                  height: "36px",
                  borderRadius: "50%",
                  marginBottom: 0,
                }}
              />
            </div>
          </div>

          {/* Glass bio card placeholder */}
          <div
            style={{
              width: "320px",
              maxWidth: "100%",
              background: "rgba(255, 255, 255, 0.05)",
              backdropFilter: "blur(24px)",
              WebkitBackdropFilter: "blur(24px)",
              border: "none",
              borderRadius: "14px",
              padding: "16px 18px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
              boxShadow: "0 10px 30px rgba(0, 0, 0, 0.45)",
            }}
          >
            <div className="skel" style={{ width: "90px", height: "12px", borderRadius: "3px", marginBottom: 0 }} />
            <div className="skel" style={{ width: "100%", height: "13px", borderRadius: "3px", marginBottom: 0 }} />
            <div className="skel" style={{ width: "85%", height: "13px", borderRadius: "3px", marginBottom: 0 }} />
            <div className="skel" style={{ width: "60%", height: "13px", borderRadius: "3px", marginBottom: 0 }} />
          </div>
        </div>
      </div>

      {/* Main Content Area Skeletons */}
      <div className="artist-content" style={{ padding: "28px 32px" }}>
        {/* Popular Tracks Section Skeleton */}
        <div className="section" style={{ marginBottom: "32px" }}>
          <div className="sec-head" style={{ marginBottom: "14px" }}>
            <div className="skel" style={{ width: "150px", height: "22px", borderRadius: "4px", marginBottom: 0 }} />
          </div>
          <div className="tracklist">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "14px",
                  height: "54px",
                  padding: "0 12px",
                  borderRadius: "6px",
                  background: "var(--elev, rgba(255,255,255,0.03))",
                  marginBottom: "4px",
                }}
              >
                <div className="skel" style={{ width: "16px", height: "14px", borderRadius: "3px", marginBottom: 0, flexShrink: 0 }} />
                <div className="skel" style={{ width: "40px", height: "40px", borderRadius: "6px", marginBottom: 0, flexShrink: 0 }} />
                <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: 1, minWidth: 0 }}>
                  <div className="skel" style={{ width: `${35 + (i * 13) % 35}%`, height: "14px", borderRadius: "3px", marginBottom: 0 }} />
                  <div className="skel" style={{ width: `${20 + (i * 9) % 20}%`, height: "11px", borderRadius: "3px", marginBottom: 0 }} />
                </div>
                <div className="skel" style={{ width: "36px", height: "12px", borderRadius: "3px", marginBottom: 0, flexShrink: 0 }} />
              </div>
            ))}
          </div>
        </div>

        {/* Albums / Releases Skeleton */}
        <div className="section">
          <div className="sec-head" style={{ marginBottom: "14px" }}>
            <div className="skel" style={{ width: "110px", height: "22px", borderRadius: "4px", marginBottom: 0 }} />
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(130px, 140px))",
              gap: "12px 14px",
              justifyContent: "flex-start",
            }}
          >
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div
                key={i}
                style={{
                  width: 134,
                  minWidth: 134,
                  display: "flex",
                  flexDirection: "column",
                  gap: "6px",
                }}
              >
                <div className="skel" style={{ width: "100%", aspectRatio: "1/1", borderRadius: "8px", marginBottom: 0 }} />
                <div className="skel" style={{ width: "80%", height: "13px", borderRadius: "3px", marginBottom: 0 }} />
                <div className="skel" style={{ width: "50%", height: "11px", borderRadius: "3px", marginBottom: 0 }} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

async function fetchArtistBioFallback(name: string, lang: Lang): Promise<string | null> {
  try {
    const wikiLang = lang === "ru" ? "ru" : "en";
    const res = await fetch(`https://${wikiLang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`);
    if (res.ok) {
      const data = await res.json();
      if (data.extract && data.type !== "disambiguation") {
        return data.extract;
      }
    }
    if (wikiLang !== "en") {
      const resEn = await fetch(`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}`);
      if (resEn.ok) {
        const dataEn = await resEn.json();
        if (dataEn.extract && dataEn.type !== "disambiguation") {
          return dataEn.extract;
        }
      }
    }
  } catch {}
  return null;
}

export function Artist({ artist, provider, artistId, mode }: ArtistProps) {
  const { state, playTracks, showToast, goBack, navigateTo, refresh, lang, setExternalPlaylist } = useApp();
  const initialCached = findInCache(artist, provider, artistId);
  const [profile, setProfile] = useState<ArtistProfile | null>(initialCached?.profile ?? null);
  const [geniusData, setGeniusData] = useState<GeniusArtistInfo | null>(initialCached?.geniusData ?? null);
  const [allTracks, setAllTracks] = useState<TrackRef[] | null>(initialCached?.allTracks ?? null);
  const [loading, setLoading] = useState(!initialCached);
  const [error, setError] = useState<string | null>(null);
  const [bioModalOpen, setBioModalOpen] = useState(false);
  const [isFollowed, setIsFollowed] = useState(false);
  const [followLoading, setFollowLoading] = useState(false);
  const [activeTargetState, setActiveTargetState] = useState<{ provider: string; id: string } | null>(initialCached?.activeTarget ?? null);
  const [showAllPopular, setShowAllPopular] = useState(false);
  const [preview, setPreview] = useState<{
    playlist: Playlist | null;
    loading: boolean;
    provider: string | null;
  } | null>(null);
  const [previewSort, setPreviewSort] = useState<"custom" | "title" | "artist">("custom");
  const [previewDir, setPreviewDir] = useState<"asc" | "desc">("asc");
  const [sortOpen, setSortOpen] = useState(false);
  const requested = useRef<string | null>(null);
  const tracksRequested = useRef<string | null>(null);

  useEffect(() => {
    if (!sortOpen) return;
    const close = () => setSortOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [sortOpen]);

  const previewTracks = (tracks: TrackRef[]): TrackRef[] => {
    if (previewSort === "custom") return tracks;
    const arr = [...tracks];
    const mult = previewDir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      if (previewSort === "title") {
        return a.title.localeCompare(b.title) * mult;
      }
      return artistLabel(a.artists).localeCompare(artistLabel(b.artists)) * mult;
    });
    return arr;
  };

  useEffect(() => {
    const key = `${provider ?? ""}|${artistId ?? ""}|${artist}`;
    const cacheKey = getCacheKey(artist, provider, artistId);
    const cached = findInCache(artist, provider, artistId);

    if (cached) {
      setProfile(cached.profile);
      setGeniusData(cached.geniusData);
      setAllTracks(cached.allTracks);
      setActiveTargetState(cached.activeTarget);
      setLoading(false);
      setError(null);

      if (cached.activeTarget?.id) {
        void api.isArtistFollowed(cached.activeTarget.id).then(setIsFollowed).catch(() => {});
      } else if (artistId) {
        void api.isArtistFollowed(artistId).then(setIsFollowed).catch(() => {});
      }

      // If fresh within 3 minutes and already requested for this key, skip re-fetching
      if (Date.now() - cached.timestamp < 180_000 && requested.current === key) {
        return;
      }
    } else {
      setLoading(true);
      setError(null);
      setProfile(null);
      setGeniusData(null);
      setAllTracks(null);
      setActiveTargetState(null);
    }

    if (requested.current === key && cached && Date.now() - cached.timestamp < 180_000) return;
    requested.current = key;
    let cancelled = false;

    // Concurrently fetch rich artist details & HD visuals via official server
    void api.getArtistExtras(artist).then((gData) => {
      if (!cancelled && gData) {
        const parsed: GeniusArtistInfo = {
          name: gData.name,
          biography: gData.biography || null,
          biography_dom: gData.biography_dom || gData.biographyDom || null,
          biographyDom: gData.biography_dom || gData.biographyDom || null,
          social_links: gData.social_links || gData.socialLinks || [],
          socialLinks: gData.social_links || gData.socialLinks || [],
        };
        setGeniusData(parsed);
        const existing = artistCache.get(cacheKey) || findInCache(artist, provider, artistId);
        if (existing) {
          existing.geniusData = parsed;
        }
      }
    });

    void (async () => {
      try {
        let loadedProfile: ArtistProfile | null = null;
        let activeTarget: { provider: string; id: string } | null = null;

        // 1. If explicit provider and id were passed, attempt loading it first
        if (provider && artistId) {
          try {
            loadedProfile = await api.artistProfile(provider, artistId);
            activeTarget = { provider, id: artistId };
          } catch {
            loadedProfile = null;
          }
        }

        // 2. If not loaded, search for artist across all providers
        if (!loadedProfile) {
          const found = await api.searchCollections(artist, "artists").catch(() => []);
          if (cancelled) return;
          const lower = artist.toLowerCase().trim();

          const candidates = [...found].sort((a, b) => {
            const aExact = a.title.toLowerCase().trim() === lower ? 1 : 0;
            const bExact = b.title.toLowerCase().trim() === lower ? 1 : 0;
            if (aExact !== bExact) return bExact - aExact;
            if (provider) {
              const aProv = a.provider === provider ? 1 : 0;
              const bProv = b.provider === provider ? 1 : 0;
              if (aProv !== bProv) return bProv - aProv;
            }
            return 0;
          });

          for (const cand of candidates) {
            if (cancelled) return;
            try {
              const p = await api.artistProfile(cand.provider, cand.id);
              if (p && (p.name || (p.popular_tracks && p.popular_tracks.length > 0))) {
                loadedProfile = p;
                activeTarget = { provider: cand.provider, id: cand.id };
                break;
              }
            } catch {}
          }
        }

        // 3. Fallback: if no platform profile exists (e.g. underground SoundCloud, Lil Zivert, etc.),
        // build a dynamic profile from search tracks so the user NEVER sees "Артист не найден"!
        if (!loadedProfile) {
          try {
            let searchRes = await api.search(artist, provider || undefined).catch(() => null);
            if (!searchRes || !searchRes.tracks || searchRes.tracks.length === 0) {
              searchRes = await api.search(artist, undefined).catch(() => null);
            }
            if (cancelled) return;
            const qLower = artist.toLowerCase().trim();
            const matchedTracks = (searchRes?.tracks || []).filter((t) => {
              const aLower = (t.artists || []).map((a) => a.toLowerCase().trim());
              return aLower.some((a) => a.includes(qLower) || qLower.includes(a));
            });
            let fallbackTracks = matchedTracks.length > 0 ? matchedTracks : (searchRes?.tracks || []);

            // Check library & history if search was empty or sparse
            if (fallbackTracks.length < 5) {
              const localTracks = [...(state?.library || []), ...(state?.history || []).map((h) => h.track).filter(Boolean)].filter((t) => {
                const aLower = (t?.artists || []).map((a: string) => a.toLowerCase().trim());
                return aLower.some((a: string) => a.includes(qLower) || qLower.includes(a));
              }) as TrackRef[];
              fallbackTracks = dedupe([...fallbackTracks, ...localTracks]);
            }

            if (fallbackTracks.length > 0) {
              loadedProfile = {
                name: artist,
                avatar_url: fallbackTracks[0]?.artwork_url ?? null,
                popular_tracks: fallbackTracks.slice(0, 20),
                releases: [],
              };
              setAllTracks(fallbackTracks);
            }
          } catch {}
        }

        if (cancelled) return;

        if (!loadedProfile) {
          const localTracks = [...(state?.library || []), ...(state?.history || []).map((h) => h.track).filter(Boolean)].filter((t) => {
            const aLower = (t?.artists || []).map((a: string) => a.toLowerCase().trim());
            return aLower.some((a: string) => a.includes(artist.toLowerCase().trim()));
          }) as TrackRef[];
          if (localTracks.length > 0) {
            loadedProfile = {
              name: artist,
              avatar_url: localTracks[0]?.artwork_url ?? null,
              popular_tracks: localTracks,
              releases: [],
            };
            setAllTracks(localTracks);
          } else {
            setError(t(lang, "artist.notFound"));
            return;
          }
        }

        if (loadedProfile.popular_tracks) {
          sanitizeTracks(loadedProfile.popular_tracks, loadedProfile.name, loadedProfile.releases);
        }
        setProfile(loadedProfile);
        setLoading(false);
        setActiveTargetState(activeTarget);

        // Update in-memory artist cache
        const toSave: CachedArtistEntry = {
          profile: loadedProfile,
          geniusData: artistCache.get(cacheKey)?.geniusData ?? geniusData,
          allTracks: artistCache.get(cacheKey)?.allTracks ?? null,
          activeTarget,
          timestamp: Date.now(),
        };
        if (artistCache.size >= MAX_ARTIST_CACHE) {
          const oldestKey = artistCache.keys().next().value;
          if (oldestKey) artistCache.delete(oldestKey);
        }
        artistCache.set(cacheKey, toSave);
        if (artistId) {
          artistCache.set(getCacheKey(artist, provider), toSave);
        }

        if (loadedProfile?.name && loadedProfile.name.toLowerCase().trim() !== artist.toLowerCase().trim()) {
          void api.getArtistExtras(loadedProfile.name).then((gData) => {
            if (!cancelled && gData) {
              const parsed: GeniusArtistInfo = {
                name: gData.name,
                biography: gData.biography || null,
                biography_dom: gData.biography_dom || gData.biographyDom || null,
                biographyDom: gData.biography_dom || gData.biographyDom || null,
                social_links: gData.social_links || gData.socialLinks || [],
                socialLinks: gData.social_links || gData.socialLinks || [],
              };
              setGeniusData(parsed);
              const existing = artistCache.get(cacheKey) || findInCache(artist, provider, artistId);
              if (existing) {
                existing.geniusData = parsed;
              }
            }
          });
        }
        if (loadedProfile && !loadedProfile.biography) {
          const aName = loadedProfile.name;
          void fetchArtistBioFallback(aName, lang).then((bio) => {
            if (bio && !cancelled) {
              setProfile((prev) => {
                const next = prev && prev.name === aName ? { ...prev, biography: bio } : prev;
                if (next) {
                  const existing = artistCache.get(cacheKey) || findInCache(artist, provider, artistId);
                  if (existing) existing.profile = next;
                }
                return next;
              });
            }
          });
        }
        if (activeTarget?.id) {
          void api.isArtistFollowed(activeTarget.id).then(setIsFollowed).catch(() => {});
        } else if (artistId) {
          void api.isArtistFollowed(artistId).then(setIsFollowed).catch(() => {});
        }

        // Background load all tracks if official provider supported
        if (activeTarget && (mode === "tracks" || mode === "profile")) {
          const tracksKey = `${activeTarget.provider}|${activeTarget.id}`;
          if (tracksRequested.current === tracksKey) return;
          tracksRequested.current = tracksKey;
          try {
            const tracks = await api.artistAllTracks(activeTarget.provider, activeTarget.id);
            if (!cancelled && tracks && tracks.length > 0) {
              sanitizeTracks(tracks, loadedProfile?.name, loadedProfile?.releases);
              setAllTracks(tracks);
              const existing = artistCache.get(cacheKey) || findInCache(artist, provider, artistId);
              if (existing) {
                existing.allTracks = tracks;
              }
            }
          } catch {}
        }
      } catch (err) {
        if (!cancelled) setError(String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [artist, provider, artistId]);

  useEffect(() => {
    if (mode !== "tracks" || allTracks || !activeTargetState) return;
    let cancelled = false;
    const tracksKey = `${activeTargetState.provider}|${activeTargetState.id}`;
    if (tracksRequested.current === tracksKey) return;
    tracksRequested.current = tracksKey;
    void (async () => {
      try {
        const tracks = await api.artistAllTracks(activeTargetState.provider, activeTargetState.id);
        if (!cancelled && tracks && tracks.length > 0) {
          sanitizeTracks(tracks, profile?.name, profile?.releases);
          setAllTracks(tracks);
        }
      } catch {}
    })();
    return () => {
      cancelled = true;
    };
  }, [mode, allTracks, activeTargetState, profile]);

  const nowKey = state?.now_playing ? trackKey(state.now_playing) : null;

  const isOwned = (url: string) =>
    state?.playlists.some((p) => p.source_url === url) ?? false;

  const releases = profile?.releases ?? [];

  const popular = useMemo(() => {
    const list = profile?.popular_tracks ?? [];
    return sanitizeTracks([...list], profile?.name, releases);
  }, [profile?.popular_tracks, releases, profile?.avatar_url, profile?.name]);

  const displayedAllTracks = useMemo(() => {
    if (!allTracks) return null;
    return sanitizeTracks([...allTracks], profile?.name, releases);
  }, [allTracks, releases, profile?.avatar_url, profile?.name]);

  const albums = useMemo(() => {
    return releases.filter((r) => !isSingleOrEp(r));
  }, [releases]);

  const singles = useMemo(() => {
    return releases.filter((r) => isSingleOrEp(r));
  }, [releases]);

  const handleToggleFollow = async () => {
    if (!profile) return;
    const targetId = activeTargetState?.id || artistId || artist;
    const targetProv = activeTargetState?.provider || provider || "spotify";
    setFollowLoading(true);
    try {
      if (isFollowed) {
        await api.unfollowArtist(targetId);
        setIsFollowed(false);
      } else {
        await api.followArtist({
          id: targetId,
          provider: (targetProv as any) || "spotify",
          name: profile.name,
          avatar_url: profile.avatar_url,
          header_image_url: profile.header_image_url,
          monthly_listeners: profile.monthly_listeners ?? null,
          verified: Boolean(profile.verified),
          added_at_ms: Date.now(),
        });
        setIsFollowed(true);
      }
    } catch (err) {
      showToast(String(err), true);
    } finally {
      setFollowLoading(false);
    }
  };

  const handleShare = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href || profile?.name || artist);
      showToast(lang === "ru" ? "Ссылка скопирована в буфер обмена" : "Link copied to clipboard");
    } catch {
      showToast(profile?.name || artist);
    }
  };

  const playPopular = (track: TrackRef) => {
    const idx = popular.findIndex((t) => trackKey(t) === trackKey(track));
    void playTracks(popular, idx < 0 ? 0 : idx);
  };

  if (preview) {
    const pl = preview.playlist;
    const totalMs = pl?.tracks.reduce((sum, t) => sum + (t.duration_ms ?? 0), 0) ?? 0;
    const owned = pl?.source_url ? isOwned(pl.source_url) : false;
    return (
      <div className="view artist-view">
        <div style={{ marginBottom: 18 }}>
          <button className="btn-back-pill" onClick={() => setPreview(null)}>
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
            {pl.cover_url || pl.tracks[0]?.artwork_url ? (
              <div
                className="page-ambient-glow"
                style={{
                  backgroundImage: `url("${pl.cover_url || pl.tracks[0]?.artwork_url}")`,
                }}
              />
            ) : (
              <div className="page-ambient-glow-fallback" />
            )}
            <div className="page-panel-header">
              <div className="hero-ref">
                <div className="hero-ref-cover">
                  <PlaylistCover tracks={pl.tracks} coverUrl={pl.cover_url} size={260} borderRadius={20} />
                </div>
                <div className="hero-ref-info">
                  <div className="hero-ref-title">{pl.title}</div>
                  <div className="hero-ref-subtitle">
                    {profile?.name || (preview.provider ? providerLabel(preview.provider) : t(lang, "artist.playlist"))}
                  </div>
                  <div className="hero-ref-meta">
                    <span>{pl.tracks.length} {t(lang, "common.tracks")}</span>
                    <span>·</span>
                    <span>{formatDuration(totalMs)}</span>
                  </div>
                  <div className="hero-ref-actions">
                    {pl.tracks.length > 0 && (
                      <button
                        className="btn-pill btn-pill-primary"
                        onClick={() => void playTracks(previewTracks(pl.tracks), 0)}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                        <span>{t(lang, "artist.play")}</span>
                      </button>
                    )}
                    {pl.tracks.length > 0 && (
                      <button
                        className="btn-pill"
                        onClick={() => {
                          const arr = [...pl.tracks].sort(() => Math.random() - 0.5);
                          void playTracks(arr, 0);
                        }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="16 3 21 3 21 8"/><line x1="4" y1="20" x2="21" y2="3"/><polyline points="21 16 21 21 16 21"/><line x1="15" y1="15" x2="21" y2="21"/><line x1="4" y1="4" x2="9" y2="9"/></svg>
                        <span>{t(lang, "favorites.shuffle")}</span>
                      </button>
                    )}
                    {pl.source_url && !owned && (
                      <button className="btn-pill" onClick={addPreviewed}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        <span>{t(lang, "artist.addToLibrary")}</span>
                      </button>
                    )}
                    {owned && (
                      <span className="btn-pill btn-pill-active" style={{ cursor: "default" }}>
                        ✓ {t(lang, "artist.alreadyInLibrary")}
                      </span>
                    )}
                    <div className="sort-dropdown-wrap" onClick={(e) => e.stopPropagation()}>
                      <button
                        className={`btn-pill ${previewSort !== "custom" ? "btn-pill-active" : ""}`}
                        onClick={() => setSortOpen((v) => !v)}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 15l5 5 5-5M7 9l5-5 5 5"/></svg>
                        <span>
                          {previewSort === "custom"
                            ? (lang === "ru" ? "Сортировка" : "Sort")
                            : (previewSort === "title" ? t(lang, "artist.titleSort") : t(lang, "artist.artistSort"))}
                          {previewSort !== "custom" && (previewDir === "asc" ? " ↑" : " ↓")}
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
                              className={`sort-dropdown-item ${previewSort === opt.mode ? "active" : ""}`}
                              onClick={() => {
                                if (previewSort === opt.mode) {
                                  setPreviewDir((d) => (d === "asc" ? "desc" : "asc"));
                                } else {
                                  setPreviewSort(opt.mode as any);
                                  setPreviewDir("asc");
                                }
                                setSortOpen(false);
                              }}
                            >
                              <span>{opt.label}</span>
                              {previewSort === opt.mode && (
                                <span className="sort-dropdown-badge">
                                  {previewDir === "asc" ? "↑" : "↓"}
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
            <div className="page-panel-body">
              {pl.tracks.length === 0 ? (
                <div className="empty">
                  <div className="t1">{t(lang, "artist.emptyPlaylist")}</div>
                </div>
              ) : (
                <div className="tracklist">
                  {previewTracks(pl.tracks).map((track, i) => (
                    <TrackRow
                      key={trackKey(track) + i}
                      track={track}
                      index={i}
                      nowKey={nowKey}
                      onPlay={(t) => {
                        const idx = pl.tracks.findIndex((x) => trackKey(x) === trackKey(t));
                        void playTracks(pl.tracks, idx < 0 ? 0 : idx);
                      }}
                      onArtistClick={(name, prov) =>
                        navigateTo("artist", { artist: name, provider: prov })
                      }
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

  const header = (back: boolean) => (
    <div style={{ marginBottom: 22 }}>
      {back && (
        <div style={{ marginBottom: 16 }}>
          <button className="btn-back-pill" onClick={goBack} title={t(lang, "common.back")}>
            {t(lang, "common.back")}
          </button>
        </div>
      )}
      <div className="big-title" style={{ fontSize: 26, display: "flex", alignItems: "baseline", gap: 10 }}>
        <span>{profile?.name || artist}</span>
        {(mode === "releases" || mode === "singles") && (
          <>
            <span style={{ fontSize: 20, fontWeight: 400, color: "var(--text3, rgba(255, 255, 255, 0.4))" }}>
              —
            </span>
            <span style={{ fontSize: 18, fontWeight: 500, color: "var(--text2)" }}>
              {mode === "singles"
                ? (lang === "ru" ? "Синглы и EP" : "Singles & EPs")
                : (lang === "ru" ? "Альбомы" : "Albums")}
            </span>
          </>
        )}
        {mode === "tracks" && (
          <>
            <span style={{ fontSize: 20, fontWeight: 400, color: "var(--text3, rgba(255, 255, 255, 0.4))" }}>
              —
            </span>
            <span style={{ fontSize: 18, fontWeight: 500, color: "var(--text2)" }}>
              {lang === "ru" ? "Все треки" : "All tracks"}
            </span>
          </>
        )}
      </div>
    </div>
  );

  function isSingleOrEp(release: CollectionItem): boolean {
    const sub = (release.subtitle || "").toLowerCase();
    return sub.includes("сингл") || sub.includes("single") || sub.includes("ep");
  }

  function formatReleaseSubtitle(release: CollectionItem, isSingle?: boolean): string {
    const yearMatch = release.subtitle?.match(/\b(19\d\d|20\d\d)\b/);
    const year = yearMatch ? yearMatch[1] : (release.subtitle || "");
    const sub = (release.subtitle || "").toLowerCase();
    const single = isSingle ?? isSingleOrEp(release);
    const typeLabel = single
      ? (sub.includes("ep") ? "EP" : "Single")
      : (sub.includes("сборник") || sub.includes("compilation") ? "Compilation" : "Album");
    return year ? `${typeLabel} • ${year}` : typeLabel;
  }

  const releaseCard = (release: CollectionItem, isSingle?: boolean) => {
    const single = isSingle ?? isSingleOrEp(release);
    return (
      <div
        key={`${release.provider}:${release.id}`}
        className="artist-release-item"
        title={release.title}
        onClick={() => void openReleasePreview(release)}
        style={{
          width: 134,
          minWidth: 134,
          cursor: "pointer",
          display: "flex",
          flexDirection: "column",
          gap: 6,
          background: "transparent",
          padding: 0,
          border: "none",
          boxShadow: "none",
        }}
      >
        <div style={{ position: "relative", width: "100%", aspectRatio: "1/1", borderRadius: 8, overflow: "hidden" }}>
          <Artwork
            url={release.artwork_url}
            alt={release.title}
            seed={release.id.length}
            square={false}
            style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: 8 }}
          />
        </div>
        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--text, #ffffff)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {release.title}
        </div>
        <div style={{ fontSize: 12, fontWeight: 500, color: "var(--text2, rgba(255, 255, 255, 0.6))", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", display: "flex", alignItems: "center", gap: 4 }}>
          {(release as any).explicit && (
            <span style={{ fontSize: 10, padding: "1px 3px", borderRadius: 3, background: "rgba(255,255,255,0.2)", color: "#fff", fontWeight: 700 }}>E</span>
          )}
          <span>{formatReleaseSubtitle(release, single)}</span>
        </div>
      </div>
    );
  };

  return (
    <div className="view artist-view" style={{ padding: 0 }}>
      {mode === "profile" && (
        <div key="profile" style={{ animation: "fade .18s ease", width: "100%" }}>
          {loading && !profile && (
            <ArtistHeroSkeleton artistName={artist} goBack={goBack} lang={lang} />
          )}

          {error && !loading && !profile && (
            <div className="empty" style={{ padding: "40px 32px" }}>
              <div className="t1">{t(lang, "artist.notFound")}</div>
              <div className="t2">{error}</div>
            </div>
          )}

          {profile && (() => {
            const heroBannerUrl = resolveArtworkUrl(
              profile.header_image_url ||
              profile.avatar_url ||
              profile.popular_tracks?.[0]?.artwork_url ||
              profile.releases?.[0]?.artwork_url
            );

            return (
              <>
                {/* Full-Bleed Hero Banner */}
                <div
                  className="artist-hero-banner"
                  style={{
                    position: "relative",
                    width: "100%",
                    minHeight: "420px",
                    borderRadius: 0,
                    overflow: "hidden",
                    marginBottom: "0px",
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "flex-end",
                    padding: "48px 32px 32px",
                    border: "none",
                    boxShadow: "none",
                  }}
                >
                  {/* Native Artwork Banner Layer: 100% crisp from 0% to 90%, smooth fade to transparent from 90% to 100% */}
                  <div
                    className="artist-hero-bg-layer"
                    style={{
                      position: "absolute",
                      inset: 0,
                      backgroundImage: heroBannerUrl ? `url("${heroBannerUrl}")` : undefined,
                      backgroundSize: "cover",
                      backgroundPosition: "center 25%",
                      filter: "none",
                      opacity: 1,
                      WebkitMaskImage: "linear-gradient(to bottom, #000 0%, #000 90%, rgba(0,0,0,0.6) 95%, transparent 100%)",
                      maskImage: "linear-gradient(to bottom, #000 0%, #000 90%, rgba(0,0,0,0.6) 95%, transparent 100%)",
                      zIndex: 1,
                      pointerEvents: "none",
                    }}
                  >
                    {/* Readability Scrim: light top shading, vibrant clean middle, soft bottom contrast for title */}
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        background: "linear-gradient(to bottom, rgba(0,0,0,0.3) 0%, rgba(0,0,0,0) 25%, rgba(0,0,0,0.3) 78%, rgba(0,0,0,0.7) 92%, rgba(0,0,0,0.85) 100%)",
                        pointerEvents: "none",
                      }}
                    />
                  </div>

                  {/* Floating Back Button on Top Left */}
                  <button
                    onClick={goBack}
                    title={t(lang, "common.back")}
                    style={{
                      position: "absolute",
                      top: "48px",
                      left: "32px",
                      zIndex: 10,
                      background: "rgba(0, 0, 0, 0.45)",
                      backdropFilter: "blur(12px)",
                      WebkitBackdropFilter: "blur(12px)",
                      border: "1px solid rgba(255, 255, 255, 0.15)",
                      borderRadius: "20px",
                      color: "#ffffff",
                      padding: "6px 14px",
                      fontSize: "13px",
                      fontWeight: 600,
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    {t(lang, "common.back")}
                  </button>

                  <div
                    style={{
                      position: "relative",
                      zIndex: 2,
                      display: "flex",
                      alignItems: "flex-end",
                      justifyContent: "space-between",
                      gap: "24px",
                      flexWrap: "wrap",
                    }}
                  >
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px", minWidth: 0, flex: 1 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: "10px", flexWrap: "wrap" }}>
                        <h1 style={{ fontSize: "42px", fontWeight: 800, color: "#ffffff", margin: 0, letterSpacing: "-0.5px", lineHeight: 1.1 }}>
                          {profile.name}
                        </h1>
                      {profile.verified && (
                        <span title={lang === "ru" ? "Верифицированный исполнитель" : "Verified Artist"}>
                          <svg width="22" height="22" viewBox="0 0 24 24" fill="#3b82f6">
                            <circle cx="12" cy="12" r="10" />
                            <path d="M9 12l2 2 4-4" stroke="#ffffff" strokeWidth="2.5" fill="none" />
                          </svg>
                        </span>
                      )}
                    </div>

                    {profile.monthly_listeners != null && (
                      <div style={{ fontSize: "14px", fontWeight: 500, color: "rgba(255, 255, 255, 0.85)", marginTop: 2 }}>
                        {(profile.monthly_listeners / 1_000_000).toFixed(2)}M{" "}
                        {lang === "ru" ? "слушателей за месяц" : "monthly listeners"}
                      </div>
                    )}

                    {/* Action Buttons: 1. Play [▶ Воспроизвести], 2. Follow [+ Подписаться], 3. Share [↗] */}
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginTop: "14px", flexWrap: "wrap" }}>
                      {popular.length > 0 && (
                        <button
                          onClick={() => playPopular(popular[0])}
                          style={{
                            background: "#ffffff",
                            color: "#000000",
                            border: "none",
                            borderRadius: "24px",
                            padding: "9px 20px",
                            fontWeight: 600,
                            fontSize: "14px",
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            cursor: "pointer",
                            boxShadow: "0 4px 14px rgba(0, 0, 0, 0.35)",
                            transition: "transform 0.16s ease",
                          }}
                          onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.04)")}
                          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
                        >
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                            <polygon points="6 4 20 12 6 20 6 4" />
                          </svg>
                          <span>{lang === "ru" ? "Воспроизвести" : "Play"}</span>
                        </button>
                      )}

                      <button
                        onClick={handleToggleFollow}
                        disabled={followLoading}
                        style={{
                          background: isFollowed ? "rgba(255, 255, 255, 0.2)" : "rgba(255, 255, 255, 0.12)",
                          color: "#ffffff",
                          border: "none",
                          borderRadius: "24px",
                          padding: "9px 18px",
                          fontWeight: 600,
                          fontSize: "13px",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                          cursor: "pointer",
                          backdropFilter: "blur(8px)",
                          transition: "all 0.18s ease",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.25)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = isFollowed ? "rgba(255, 255, 255, 0.2)" : "rgba(255, 255, 255, 0.12)")}
                      >
                        {isFollowed ? (
                          <>
                            <span>✓</span>
                            <span>{lang === "ru" ? "Подписка" : "Following"}</span>
                          </>
                        ) : (
                          <>
                            <span>+</span>
                            <span>{lang === "ru" ? "Подписаться" : "Follow"}</span>
                          </>
                        )}
                      </button>

                      <button
                        onClick={handleShare}
                        title={lang === "ru" ? "Поделиться" : "Share"}
                        style={{
                          background: "rgba(255, 255, 255, 0.12)",
                          color: "#ffffff",
                          border: "none",
                          borderRadius: "50%",
                          width: "36px",
                          height: "36px",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          backdropFilter: "blur(8px)",
                          transition: "all 0.16s ease",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.22)")}
                        onMouseLeave={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.12)")}
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                          <circle cx="18" cy="5" r="3" />
                          <circle cx="6" cy="12" r="3" />
                          <circle cx="18" cy="19" r="3" />
                          <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                          <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                        </svg>
                      </button>
                    </div>
                  </div>

                {/* Floating Glass Bio Card without border */}
                  <div
                    style={{
                      width: "320px",
                      maxWidth: "100%",
                      background: "rgba(255, 255, 255, 0.06)",
                      backdropFilter: "blur(24px)",
                      WebkitBackdropFilter: "blur(24px)",
                      border: "none",
                      borderRadius: "14px",
                      padding: "16px 18px",
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                      boxShadow: "0 10px 30px rgba(0, 0, 0, 0.45)",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: "11px", fontWeight: 700, color: "rgba(255, 255, 255, 0.9)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                        {lang === "ru" ? "Об исполнителе" : "About the artist"}
                      </span>
                      <button
                        onClick={() => setBioModalOpen(true)}
                        style={{
                          background: "transparent",
                          border: "none",
                          color: "var(--accent, #ffffff)",
                          fontSize: "12px",
                          fontWeight: 600,
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        {lang === "ru" ? "Показать всё" : "Show all"} →
                      </button>
                    </div>

                    <div
                      style={{
                        fontSize: "13px",
                        lineHeight: "1.45",
                        color: "rgba(255, 255, 255, 0.75)",
                        display: "-webkit-box",
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {geniusData?.biography ||
                        profile.biography ||
                        (lang === "ru"
                          ? `${profile.name} — исполнитель, доступный для прослушивания в Vessel.`
                          : `${profile.name} is available for streaming on Vessel.`)}
                    </div>
                  </div>
                </div>
              </div>

              {/* Page content below banner */}
              <div className="artist-content" style={{ padding: "0 32px" }}>
                {/* Popular Tracks Section (Top 5 + Show all toggle) */}
                {popular.length > 0 && (
                  <div className="section" style={{ marginBottom: "32px" }}>
                    <div className="sec-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                      <span className="sec-title" style={{ fontSize: "20px", fontWeight: 700, color: "var(--text)" }}>
                        {t(lang, "artist.popular")}
                      </span>
                      {popular.length > 5 && (
                        <span
                          className="sec-link"
                          onClick={() => setShowAllPopular((prev) => !prev)}
                          style={{ cursor: "pointer", fontSize: "13px", color: "var(--text2)", fontWeight: 500 }}
                        >
                          {showAllPopular
                            ? (lang === "ru" ? "Свернуть" : "Collapse")
                            : `${t(lang, "artist.showAll")} (${popular.length})`}
                        </span>
                      )}
                    </div>
                    <div className="tracklist">
                      {(showAllPopular ? popular : popular.slice(0, 5)).map((track, i) => (
                        <TrackRow
                          key={trackKey(track) + i}
                          track={track}
                          index={i}
                          nowKey={nowKey}
                          onPlay={playPopular}
                          onArtistClick={(name, prov) =>
                            navigateTo("artist", { artist: name, provider: prov })
                          }
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Albums Section (Dense Grid) */}
                {albums.length > 0 && (
                  <div className="section" style={{ marginBottom: "32px" }}>
                    <div className="sec-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                      <span className="sec-title" style={{ fontSize: "20px", fontWeight: 700, color: "var(--text)" }}>
                        {lang === "ru" ? "Альбомы" : "Albums"}
                      </span>
                      {albums.length > INITIAL_RELEASES && (
                        <span
                          className="sec-link"
                          onClick={() => navigateTo("artist-releases")}
                          style={{ cursor: "pointer", fontSize: "13px", color: "var(--text2)", fontWeight: 500 }}
                        >
                          {t(lang, "artist.showAll")} ({albums.length})
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(130px, 140px))",
                        gap: "12px 14px",
                        justifyContent: "flex-start",
                      }}
                    >
                      {albums.slice(0, INITIAL_RELEASES).map((rel) => releaseCard(rel, false))}
                    </div>
                  </div>
                )}

                {/* Singles and EPs Section (Dense Grid) */}
                {singles.length > 0 && (
                  <div className="section" style={{ marginBottom: "32px" }}>
                    <div className="sec-head" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px" }}>
                      <span className="sec-title" style={{ fontSize: "20px", fontWeight: 700, color: "var(--text)" }}>
                        {lang === "ru" ? "Синглы и EP" : "Singles & EPs"}
                      </span>
                      {singles.length > INITIAL_RELEASES && (
                        <span
                          className="sec-link"
                          onClick={() => navigateTo("artist-singles")}
                          style={{ cursor: "pointer", fontSize: "13px", color: "var(--text2)", fontWeight: 500 }}
                        >
                          {t(lang, "artist.showAll")} ({singles.length})
                        </span>
                      )}
                    </div>
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fill, minmax(130px, 140px))",
                        gap: "12px 14px",
                        justifyContent: "flex-start",
                      }}
                    >
                      {singles.slice(0, INITIAL_RELEASES).map((rel) => releaseCard(rel, true))}
                    </div>
                  </div>
                )}

              {(displayedAllTracks == null || displayedAllTracks.length > 0) && (
                <div className="section">
                  <div className="sec-head">
                    <span className="sec-title">{t(lang, "artist.music")}</span>
                    {displayedAllTracks != null && displayedAllTracks.length > INITIAL_TRACKS && (
                      <span
                        className="sec-link"
                        onClick={() => navigateTo("artist-tracks")}
                      >
                        {t(lang, "artist.showAll")} ({displayedAllTracks.length})
                      </span>
                    )}
                  </div>
                  {displayedAllTracks == null ? (
                    // Ещё грузится в фоне — скелетоны
                    <div className="tracklist">
                      <div className="skel" />
                      <div className="skel" />
                      <div className="skel" />
                      <div className="skel" />
                    </div>
                  ) : (
                    <div className="tracklist">
                      {displayedAllTracks.slice(0, INITIAL_TRACKS).map((track, i) => (
                        <TrackRow
                          key={trackKey(track) + i}
                          track={track}
                          index={i}
                          nowKey={nowKey}
                          onPlay={(t) => {
                            const idx = displayedAllTracks.findIndex(
                              (x) => trackKey(x) === trackKey(t),
                            );
                            void playTracks(displayedAllTracks, idx < 0 ? 0 : idx);
                          }}
                          onArtistClick={(name, prov) =>
                            navigateTo("artist", { artist: name, provider: prov })
                          }
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}

              {popular.length === 0 &&
                releases.length === 0 &&
                (displayedAllTracks == null || displayedAllTracks.length === 0) &&
                !loading && (
                  <div className="empty">
                    <div className="t1">{t(lang, "artist.empty1")}</div>
                    <div className="t2">{t(lang, "artist.empty2")}</div>
                  </div>
                )}
              </div>
            </>
          );
        })()}
        </div>
      )}

      {(mode === "releases" || mode === "singles") && (() => {
        const items = mode === "singles" ? singles : albums;
        return (
          <div key={mode} style={{ animation: "fade .18s ease", width: "100%", padding: "24px 32px" }}>
            {header(true)}
            {loading && !profile && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(130px, 140px))",
                  gap: "12px 14px",
                  justifyContent: "flex-start",
                }}
              >
                {[1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <div key={i} style={{ width: 134, minWidth: 134, display: "flex", flexDirection: "column", gap: "6px" }}>
                    <div className="skel" style={{ width: "100%", aspectRatio: "1/1", borderRadius: "8px", marginBottom: 0 }} />
                    <div className="skel" style={{ width: "80%", height: "13px", borderRadius: "3px", marginBottom: 0 }} />
                    <div className="skel" style={{ width: "50%", height: "11px", borderRadius: "3px", marginBottom: 0 }} />
                  </div>
                ))}
              </div>
            )}
            {profile && (
              items.length === 0 ? (
                <div className="empty" style={{ padding: "40px 0" }}>
                  <div className="t1">{lang === "ru" ? "Нет релизов" : "No releases"}</div>
                </div>
              ) : (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(130px, 140px))",
                    gap: "12px 14px",
                    justifyContent: "flex-start",
                  }}
                >
                  {items.map((rel) => releaseCard(rel))}
                </div>
              )
            )}
          </div>
        );
      })()}

      {mode === "tracks" && (
        <div key="tracks" style={{ animation: "fade .18s ease", width: "100%", padding: "24px 32px" }}>
          {header(true)}
          {loading && (!displayedAllTracks || displayedAllTracks.length === 0) && (
            <div className="tracklist">
              {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "14px",
                    height: "54px",
                    padding: "0 12px",
                    borderRadius: "6px",
                    background: "var(--elev, rgba(255,255,255,0.03))",
                    marginBottom: "4px",
                  }}
                >
                  <div className="skel" style={{ width: "16px", height: "14px", borderRadius: "3px", marginBottom: 0, flexShrink: 0 }} />
                  <div className="skel" style={{ width: "40px", height: "40px", borderRadius: "6px", marginBottom: 0, flexShrink: 0 }} />
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", flex: 1, minWidth: 0 }}>
                    <div className="skel" style={{ width: `${35 + (i * 13) % 35}%`, height: "14px", borderRadius: "3px", marginBottom: 0 }} />
                    <div className="skel" style={{ width: `${20 + (i * 9) % 20}%`, height: "11px", borderRadius: "3px", marginBottom: 0 }} />
                  </div>
                  <div className="skel" style={{ width: "36px", height: "12px", borderRadius: "3px", marginBottom: 0, flexShrink: 0 }} />
                </div>
              ))}
            </div>
          )}
          {displayedAllTracks && displayedAllTracks.length > 0 && (
            <VirtualTrackList
              items={displayedAllTracks}
              renderItem={(track, i) => (
                <TrackRow
                  key={trackKey(track) + i}
                  track={track}
                  index={i}
                  nowKey={nowKey}
                  onPlay={(t) => {
                    const idx = displayedAllTracks.findIndex((x) => trackKey(x) === trackKey(t));
                    void playTracks(displayedAllTracks, idx < 0 ? 0 : idx);
                  }}
                  onArtistClick={(name, prov) =>
                    navigateTo("artist", { artist: name, provider: prov })
                  }
                />
              )}
            />
          )}
        </div>
      )}
      <ArtistBioModal
        isOpen={bioModalOpen}
        onClose={() => setBioModalOpen(false)}
        name={profile?.name || artist}
        avatarUrl={profile?.avatar_url}
        headerImageUrl={profile?.header_image_url || profile?.avatar_url}
        biography={geniusData?.biography || profile?.biography}
        biographyDom={geniusData?.biography_dom || geniusData?.biographyDom}
        monthlyListeners={profile?.monthly_listeners}
        socialLinks={geniusData?.social_links?.length ? geniusData.social_links : (geniusData?.socialLinks?.length ? geniusData.socialLinks : profile?.external_links)}
        onArtistClick={(artistName) => {
          setBioModalOpen(false);
          navigateTo("artist", { artist: artistName });
        }}
        lang={lang}
      />
    </div>
  );

  function sanitizeTracks(tracks: TrackRef[], fallbackArtist?: string, rels?: CollectionItem[]): TrackRef[] {
    const fallback = fallbackArtist?.trim() || profile?.name?.trim() || "";
    const releasesList = rels || profile?.releases || [];

    const cleanStr = (s?: string | null) =>
      (s || "")
        .toLowerCase()
        .replace(/\s*\([^)]*\)/g, "")
        .replace(/\s*\[[^\]]*\]/g, "")
        .replace(/[-–—_]/g, " ")
        .trim();

    for (const t of tracks) {
      const valid = filterValidArtists(t.artists);
      if (valid.length > 0) {
        t.artists = valid;
      } else if (fallback) {
        t.artists = [fallback];
      }

      const isAvatar = Boolean(profile?.avatar_url && t.artwork_url === profile.avatar_url);
      if (!t.artwork_url || isAvatar) {
        let matchedCover: string | null = null;

        // 1. Поиск по названию альбома (точное совпадение либо очищенное от фитов/суффиксов)
        if (t.album_title) {
          const albumClean = cleanStr(t.album_title);
          const byAlbum = releasesList.find(
            (r) =>
              r.title &&
              (r.title.toLowerCase().trim() === t.album_title!.toLowerCase().trim() ||
                cleanStr(r.title) === albumClean)
          );
          if (byAlbum?.artwork_url) {
            matchedCover = byAlbum.artwork_url;
          }
        }

        // 2. Поиск по ID альбома из album_url
        if (!matchedCover && t.album_url) {
          const albId = t.album_url.split("/").pop();
          if (albId) {
            const byId = releasesList.find((r) => r.id === albId || (r.web_url && r.web_url.includes(albId)));
            if (byId?.artwork_url) {
              matchedCover = byId.artwork_url;
            }
          }
        }

        // 3. Поиск по названию трека среди синглов и релизов
        if (!matchedCover && t.title) {
          const trackClean = cleanStr(t.title);
          const byTitle = releasesList.find(
            (r) =>
              r.title &&
              (r.title.toLowerCase().trim() === t.title.toLowerCase().trim() ||
                cleanStr(r.title) === trackClean)
          );
          if (byTitle?.artwork_url) {
            matchedCover = byTitle.artwork_url;
          }
        }

        if (matchedCover) {
          t.artwork_url = matchedCover;
        } else if (!isAvatar && profile?.avatar_url) {
          t.artwork_url = profile.avatar_url;
        }
      }
    }
    return tracks;
  }

  async function openReleasePreview(release: CollectionItem) {
    if (release.web_url) {
      try {
        const pl = await api.previewPlaylistUrl(release.web_url);
        if (pl && pl.tracks && pl.tracks.length > 0) {
          sanitizeTracks(pl.tracks, profile?.name);
          pl.is_album = true;
          setExternalPlaylist(pl);
          navigateTo("playlist", { playlistId: "external" });
          return;
        }
      } catch (err) {
        showToast(String(err), true);
        return;
      }
    }
    setPreview({ playlist: null, loading: true, provider: release.provider });
    try {
      const pl = await api.previewPlaylistUrl(release.web_url);
      sanitizeTracks(pl.tracks, profile?.name);
      pl.is_album = true;
      setPreview({ playlist: pl, loading: false, provider: release.provider });
    } catch (err) {
      showToast(String(err), true);
      setPreview(null);
    }
  }

  async function addPreviewed() {
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
  }
}