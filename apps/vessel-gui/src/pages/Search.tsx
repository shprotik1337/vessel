import { useEffect, useRef, useState } from "react";

import { useApp } from "../store";
import { useCustomization } from "../customization";
import { TrackRow } from "../components/TrackRow";
import { VirtualTrackList } from "../components/VirtualTrackList";
import { trackKey } from "../lib/utils";
import { t } from "../i18n";
import type { CollectionItem, TrackRef } from "../api/types";
import * as api from "../api/commands";
import {
  SEARCH_PLATFORMS,
  type SearchCategory,
  type PreviewState,
  SearchBar,
  SearchHeroRecs,
  SearchResultsAll,
  SearchArtistCard,
  SearchCollectionCard,
  SearchCollectionPreview,
  useSearchRecommendations,
  useSearchExecution,
} from "./search/index";

export { SEARCH_PLATFORMS } from "./search/index";

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
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    if (provider === "all" || !SEARCH_PLATFORMS.some((p) => p.key === provider)) {
      setProvider("soundcloud");
    }
  }, [provider, setProvider]);

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
  const { recs, recsLoading } = useSearchRecommendations(query, state);

  // Выполнение поиска с дебаунсом 300 мс
  const {
    results,
    collections,
    allTracks,
    allArtists,
    allPlaylists,
    allAlbums,
    loading,
    message,
    error,
  } = useSearchExecution(query, provider, category, lang);

  const [adding, setAdding] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [searchPlayingKey, setSearchPlayingKey] = useState<string | null>(null);
  const [searchPlayingCover, setSearchPlayingCover] = useState<string | null>(null);

  const nowKey = state?.now_playing ? trackKey(state.now_playing) : null;

  const playOne = (track: TrackRef, listToUse: TrackRef[] = results) => {
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
    return (
      <SearchCollectionPreview
        preview={preview}
        onClose={() => setPreview(null)}
        nowKey={nowKey}
        lang={lang}
        adding={adding}
        onPlayTracks={(tracks: TrackRef[], startIndex: number) => void playTracks(tracks, startIndex)}
        onPlayTrack={(track: TrackRef, tracks: TrackRef[]) => {
          setSearchPlayingKey(trackKey(track));
          setSearchPlayingCover(track.artwork_url || null);
          const idx = tracks.findIndex((x) => trackKey(x) === trackKey(track));
          void playTracks(tracks, idx < 0 ? 0 : idx);
        }}
        onAddToLibrary={(url: string) => void addToLibrary(url)}
        onArtistClick={(name: string, prov?: string) => navigateTo("artist", { artist: name, provider: prov })}
      />
    );
  }

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

        <SearchBar
          query={query}
          setQuery={setQuery}
          provider={provider}
          setProvider={setProvider}
          category={category}
          setCategory={setCategory}
          lang={lang}
          hasActiveQuery={hasActiveQuery}
          isSidebarTop={isSidebarTop}
          isSidebarAutoHide={isSidebarAutoHide}
          inputRef={inputRef as React.RefObject<HTMLInputElement>}
        />

        <div className="page-panel-body">
          {error && (
            <div className="alert" style={{ marginBottom: 16 }}>
              <span className="alert-mark">!</span>
              <div className="set-desc" style={{ color: "var(--red)" }}>
                {error}
              </div>
            </div>
          )}

          {/* Empty query recommendations: horizontal card row */}
          {!hasActiveQuery && (
            <SearchHeroRecs
              recs={recs}
              recsLoading={recsLoading}
              onPlayRec={(track: TrackRef, list: TrackRef[]) => playOne(track, list)}
            />
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
            <SearchResultsAll
              allTracks={allTracks}
              allArtists={allArtists}
              allPlaylists={allPlaylists}
              allAlbums={allAlbums}
              hasAllResults={hasAllResults}
              error={error}
              nowKey={nowKey}
              lang={lang}
              setCategory={setCategory}
              onPlayTrack={playOne}
              onArtistClick={(name: string, prov?: string) => navigateTo("artist", { artist: name, provider: prov })}
              onArtistSelect={(item: CollectionItem) =>
                navigateTo("artist", {
                  artist: item.title,
                  provider: item.provider,
                  artistId: item.id,
                })
              }
              onOpenPreview={openPreview}
              onPlayCollection={playCollection}
            />
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
                    renderItem={(track: TrackRef, i: number) => (
                      <TrackRow
                        key={trackKey(track) + i}
                        track={track}
                        index={i}
                        nowKey={nowKey}
                        onPlay={(t: TrackRef) => playOne(t, results)}
                        onArtistClick={(name: string, prov?: string) =>
                          navigateTo("artist", { artist: name, provider: prov })
                        }
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
                    {collections.map((item: CollectionItem) => (
                      <SearchArtistCard
                        key={`${item.provider}:${item.id}`}
                        item={item}
                        onSelect={(it: CollectionItem) =>
                          navigateTo("artist", {
                            artist: it.title,
                            provider: it.provider,
                            artistId: it.id,
                          })
                        }
                      />
                    ))}
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
                    {category === "playlists"
                      ? t(lang, "search.playlists")
                      : t(lang, "search.albums")}{" "}
                    · {collections.length}
                  </div>
                  <div className="search-collections-grid">
                    {collections.map((item: CollectionItem) => (
                      <SearchCollectionCard
                        key={`${item.provider}:${item.id}`}
                        item={item}
                        playTitle={t(lang, "common.play")}
                        onOpenPreview={openPreview}
                        onPlayCollection={playCollection}
                      />
                    ))}
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
