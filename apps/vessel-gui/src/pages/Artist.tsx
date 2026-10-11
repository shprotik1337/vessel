import { useEffect, useRef, useState } from "react";

import { useApp } from "../store";
import { TrackRow } from "../components/TrackRow";
import { VirtualTrackList } from "../components/VirtualTrackList";
import { Artwork } from "../components/Artwork";
import { PlaylistCover } from "../components/PlaylistCover";
import { trackKey, providerLabel, formatDuration, artistLabel, filterValidArtists, dedupe } from "../lib/utils";
import { t } from "../i18n";
import type { ArtistProfile, CollectionItem, Playlist, TrackRef } from "../api/types";
import * as api from "../api/commands";

const INITIAL_RELEASES = 7;
const INITIAL_TRACKS = 20;

interface ArtistProps {
  artist: string;
  provider: string | null;
  artistId: string | null;
  mode: "profile" | "releases" | "tracks";
}

export function Artist({ artist, provider, artistId, mode }: ArtistProps) {
  const { state, playTracks, showToast, goBack, navigateTo, refresh, lang, setExternalPlaylist } = useApp();
  const [profile, setProfile] = useState<ArtistProfile | null>(null);
  const [allTracks, setAllTracks] = useState<TrackRef[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
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
    if (requested.current === key) return;
    requested.current = key;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setProfile(null);
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
          for (const t of loadedProfile.popular_tracks) {
            const valid = filterValidArtists(t.artists);
            t.artists = valid.length > 0 ? valid : (loadedProfile.name ? [loadedProfile.name] : []);
          }
        }
        setProfile(loadedProfile);
        setLoading(false);

        // Background load all tracks if official provider supported
        if (activeTarget && (mode === "tracks" || mode === "profile")) {
          const tracksKey = `${activeTarget.provider}|${activeTarget.id}`;
          if (tracksRequested.current === tracksKey) return;
          tracksRequested.current = tracksKey;
          try {
            const tracks = await api.artistAllTracks(activeTarget.provider, activeTarget.id);
            if (!cancelled && tracks && tracks.length > 0) setAllTracks(tracks);
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
  }, [artist, provider, artistId, mode]);

  const nowKey = state?.now_playing ? trackKey(state.now_playing) : null;

  const isOwned = (url: string) =>
    state?.playlists.some((p) => p.source_url === url) ?? false;

  const popular = profile?.popular_tracks ?? [];
  const releases = profile?.releases ?? [];

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
                  <div className="ico">♫</div>
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
    <div style={{ marginBottom: 18, display: "flex", alignItems: "center", gap: 12 }}>
      {back && (
        <button className="btn btn-outline btn-sm" onClick={goBack} title={t(lang, "common.back")}>
          {t(lang, "common.back")}
        </button>
      )}
      {profile && (
        <div className="big-title" style={{ fontSize: 24 }}>
          {profile.name}
        </div>
      )}
    </div>
  );

  const releaseCard = (release: CollectionItem) => (
    <div
      key={`${release.provider}:${release.id}`}
      className="card"
      title={release.title}
      onClick={() => void openReleasePreview(release)}
      style={{ width: 172, cursor: "pointer" }}
    >
      <div className="card-art" style={{ marginBottom: 9 }}>
        <Artwork
          url={release.artwork_url}
          alt={release.title}
          seed={release.id.length}
          square={false}
          style={{ width: "100%", aspectRatio: "1", borderRadius: 4 }}
        />
        <button
          className="card-play"
          title={t(lang, "common.play")}
          onClick={(e) => {
            e.stopPropagation();
            void playRelease(release);
          }}
        >
          ▶
        </button>
      </div>
      <div className="card-t">{release.title}</div>
      <div className="card-s">{release.subtitle}</div>
      <span className="pl-src">{providerLabel(release.provider)}</span>
    </div>
  );

  return (
    <div className="view artist-view">
      {mode === "profile" && (
        <>
          <div style={{ marginBottom: 18 }}>
            <button className="btn btn-outline btn-sm" onClick={goBack} title={t(lang, "common.back")}>
              {t(lang, "common.back")}
            </button>
          </div>

          {loading && (
            <div className="tracklist">
              <div className="skel" />
              <div className="skel" />
              <div className="skel" />
              <div className="skel" />
            </div>
          )}

          {error && !loading && (
            <div className="empty">
              <div className="ico">?</div>
              <div className="t1">{t(lang, "artist.notFound")}</div>
              <div className="t2">{error}</div>
            </div>
          )}

          {!loading && profile && (
            <>
              <div className="artist-hero-card">
                {profile.avatar_url ? (
                  <div
                    className="page-ambient-glow"
                    style={{ backgroundImage: `url("${profile.avatar_url}")` }}
                  />
                ) : (
                  <div className="page-ambient-glow-fallback" />
                )}
                <div className="artist-hero-content">
                  <div className="artist-avatar-wrap">
                    <Artwork
                      url={profile.avatar_url}
                      alt={profile.name}
                      square={false}
                      style={{
                        width: "100%",
                        height: "100%",
                        borderRadius: "50%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    />
                  </div>
                  <div className="artist-hero-info">
                    <span className="kicker">{t(lang, "artist.artist")}</span>
                    <div className="big-title" style={{ maxWidth: 600, wordBreak: "break-word" }}>
                      {profile.name}
                    </div>
                  </div>
                </div>
              </div>

              {popular.length > 0 && (
                <div className="section">
                  <div className="sec-head">
                    <span className="sec-title">{t(lang, "artist.popular")}</span>
                  </div>
                  <div className="tracklist">
                    {popular.map((track, i) => (
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

              {releases.length > 0 && (
                <div className="section">
                  <div className="sec-head">
                    <span className="sec-title">{t(lang, "artist.releases")}</span>
                    {releases.length > INITIAL_RELEASES && (
                      <span
                        className="sec-link"
                        onClick={() => navigateTo("artist-releases")}
                      >
                        {t(lang, "artist.showAll")} ({releases.length})
                      </span>
                    )}
                  </div>
                  <div className="grid">
                    {releases.slice(0, INITIAL_RELEASES).map(releaseCard)}
                  </div>
                </div>
              )}

              {(allTracks == null || allTracks.length > 0) && (
                <div className="section">
                  <div className="sec-head">
                    <span className="sec-title">{t(lang, "artist.music")}</span>
                    {allTracks != null && allTracks.length > INITIAL_TRACKS && (
                      <span
                        className="sec-link"
                        onClick={() => navigateTo("artist-tracks")}
                      >
                        {t(lang, "artist.showAll")} ({allTracks.length})
                      </span>
                    )}
                  </div>
                  {allTracks == null ? (
                    // Ещё грузится в фоне — скелетоны
                    <div className="tracklist">
                      <div className="skel" />
                      <div className="skel" />
                      <div className="skel" />
                      <div className="skel" />
                    </div>
                  ) : (
                    <div className="tracklist">
                      {allTracks.slice(0, INITIAL_TRACKS).map((track, i) => (
                        <TrackRow
                          key={trackKey(track) + i}
                          track={track}
                          index={i}
                          nowKey={nowKey}
                          onPlay={(t) => {
                            const idx = allTracks.findIndex(
                              (x) => trackKey(x) === trackKey(t),
                            );
                            void playTracks(allTracks, idx < 0 ? 0 : idx);
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
                (allTracks == null || allTracks.length === 0) &&
                !loading && (
                  <div className="empty">
                    <div className="ico">♫</div>
                    <div className="t1">{t(lang, "artist.empty1")}</div>
                    <div className="t2">{t(lang, "artist.empty2")}</div>
                  </div>
                )}
            </>
          )}
        </>
      )}

      {mode === "releases" && (
        <>
          {header(true)}
          {loading && (
            <div className="tracklist">
              <div className="skel" />
              <div className="skel" />
              <div className="skel" />
              <div className="skel" />
            </div>
          )}
          {!loading && profile && (
            <div className="grid">{releases.map(releaseCard)}</div>
          )}
        </>
      )}

      {mode === "tracks" && (
        <>
          {header(true)}
          {loading && (
            <div className="tracklist">
              <div className="skel" />
              <div className="skel" />
              <div className="skel" />
              <div className="skel" />
            </div>
          )}
          {!loading && allTracks && allTracks.length > 0 && (
            <VirtualTrackList
              items={allTracks}
              renderItem={(track, i) => (
                <TrackRow
                  key={trackKey(track) + i}
                  track={track}
                  index={i}
                  nowKey={nowKey}
                  onPlay={(t) => {
                    const idx = allTracks.findIndex((x) => trackKey(x) === trackKey(t));
                    void playTracks(allTracks, idx < 0 ? 0 : idx);
                  }}
                  onArtistClick={(name, prov) =>
                    navigateTo("artist", { artist: name, provider: prov })
                  }
                />
              )}
            />
          )}
        </>
      )}
    </div>
  );

  function sanitizeTracks(tracks: TrackRef[], fallbackArtist?: string): TrackRef[] {
    const fallback = fallbackArtist?.trim() || profile?.name?.trim() || "";
    for (const t of tracks) {
      const valid = filterValidArtists(t.artists);
      if (valid.length > 0) {
        t.artists = valid;
      } else if (fallback) {
        t.artists = [fallback];
      }
    }
    return tracks;
  }

  async function openReleasePreview(release: CollectionItem) {
    if (release.web_url) {
      showToast(lang === "ru" ? "Загрузка…" : "Loading…", false, 2000);
      try {
        const pl = await api.previewPlaylistUrl(release.web_url);
        if (pl && pl.tracks && pl.tracks.length > 0) {
          sanitizeTracks(pl.tracks, profile?.name);
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
      setPreview({ playlist: pl, loading: false, provider: release.provider });
    } catch (err) {
      showToast(String(err), true);
      setPreview(null);
    }
  }

  async function playRelease(release: CollectionItem) {
    try {
      const pl = await api.previewPlaylistUrl(release.web_url);
      sanitizeTracks(pl.tracks, profile?.name);
      if (pl.tracks.length === 0) return;
      await playTracks(pl.tracks, 0);
    } catch (err) {
      showToast(String(err), true);
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