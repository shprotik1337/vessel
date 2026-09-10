import { useEffect, useRef, useState } from "react";

import { useApp } from "../store";
import { TrackRow } from "../components/TrackRow";
import { Artwork } from "../components/Artwork";
import { PlaylistCover } from "../components/PlaylistCover";
import { trackKey, providerLabel, formatDuration, artistLabel } from "../lib/utils";
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
  const { state, playTracks, showToast, goBack, navigateTo, refresh, lang } = useApp();
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
  const requested = useRef<string | null>(null);
  const tracksRequested = useRef<string | null>(null);

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
        let target = provider && artistId ? { provider, id: artistId } : null;
        if (!target) {
          const found = await api.searchCollections(artist, "artists");
          if (cancelled) return;
          const lower = artist.toLowerCase();
          const candidates = provider
            ? found.filter((a) => a.provider === provider)
            : found;
          // Точное совпадение имени важнее всего, иначе берём первого (самого популярного)
          const match =
            candidates.find((a) => a.title.toLowerCase() === lower) ??
            candidates[0] ??
            null;
          target = match ? { provider: match.provider, id: match.id } : null;
          if (!target && found.length === 0) {
            setError(t(lang, "artist.notFound"));
          }
        }
        if (!target) return;
        const profile = await api.artistProfile(target.provider, target.id);
        if (cancelled) return;
        setProfile(profile);
        // Профиль показываем сразу, треки грузим в фоне (могут быть десятки
        // browse-запросов — не блокируем карточку артиста).
        // Для YouTube Music секции «Вся музыка» нет — только популярное и релизы.
        setLoading(false);
        const isYtMusic = target.provider === "you_tube_music";
        if (!isYtMusic && (mode === "tracks" || mode === "profile")) {
          const tracksKey = `${target.provider}|${target.id}`;
          if (tracksRequested.current === tracksKey) return;
          tracksRequested.current = tracksKey;
          try {
            const tracks = await api.artistAllTracks(target.provider, target.id);
            if (!cancelled) setAllTracks(tracks);
          } catch (err) {
            if (!cancelled) {
              // Ошибка — показываем честный «пусто», а не вечные скелетоны
              setAllTracks([]);
              showToast(String(err), true);
            }
          }
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
                  {preview.provider
                    ? providerLabel(preview.provider)
                    : t(lang, "artist.playlist")}
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
                      ▶ {t(lang, "artist.play")}
                    </button>
                  )}
                  {pl.source_url && !owned && (
                    <button className="btn btn-ghost btn-sm" onClick={addPreviewed}>
                      {t(lang, "artist.addToLibrary")}
                    </button>
                  )}
                  {owned && (
                    <span className="badge ok" style={{ padding: "6px 10px" }}>
                      ✓ {t(lang, "artist.alreadyInLibrary")}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="playlist-bar" style={{ padding: "12px 24px" }}>
              <div className="chips">
                {(["custom", "title", "artist"] as const).map((opt) => (
                  <button
                    key={opt}
                    className="chip"
                    style={
                      previewSort === opt
                        ? { borderColor: "var(--border3)", color: "var(--text)" }
                        : undefined
                    }
                    onClick={() => {
                      if (previewSort === opt) {
                        setPreviewDir((d) => (d === "asc" ? "desc" : "asc"));
                      } else {
                        setPreviewSort(opt);
                        setPreviewDir("asc");
                      }
                    }}
                  >
                    {opt === "custom"
                      ? t(lang, "artist.customOrder")
                      : opt === "title"
                        ? t(lang, "artist.titleSort")
                        : t(lang, "artist.artistSort")}
                    {previewSort === opt && opt !== "custom" && (previewDir === "asc" ? " ↑" : " ↓")}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ padding: "12px 8px" }}>
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
    <div className="view">
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
              <div
                className="playlist-hd"
                style={{ paddingLeft: 0, paddingRight: 0, borderBottom: "none" }}
              >
                <div
                  style={{
                    width: 160,
                    height: 160,
                    borderRadius: 80,
                    overflow: "hidden",
                    flexShrink: 0,
                    border: "1px solid var(--border2)",
                    background: "var(--elev)",
                  }}
                >
                  <Artwork
                    url={profile.avatar_url}
                    alt={profile.name}
                    square={false}
                    style={{
                      width: "100%",
                      height: "100%",
                      borderRadius: 80,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  />
                </div>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    justifyContent: "center",
                    gap: 8,
                    minWidth: 0,
                  }}
                >
                  <span className="kicker">{t(lang, "artist.artist")}</span>
                  <div className="big-title" style={{ maxWidth: 600, wordBreak: "break-word" }}>
                    {profile.name}
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

              {/* В YouTube Music секции «Вся музыка» нет — только популярное и релизы */}
              {provider !== "you_tube_music" &&
                (allTracks == null || allTracks.length > 0) && (
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
                (provider === "you_tube_music" ||
                  allTracks == null ||
                  allTracks.length === 0) &&
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
            <div className="tracklist">
              {allTracks.map((track, i) => (
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
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );

  async function openReleasePreview(release: CollectionItem) {
    setPreview({ playlist: null, loading: true, provider: release.provider });
    try {
      const pl = await api.previewPlaylistUrl(release.web_url);
      setPreview({ playlist: pl, loading: false, provider: release.provider });
    } catch (err) {
      showToast(String(err), true);
      setPreview(null);
    }
  }

  async function playRelease(release: CollectionItem) {
    try {
      const pl = await api.previewPlaylistUrl(release.web_url);
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