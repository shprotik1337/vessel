import { TrackRow } from "../../components/TrackRow";
import { trackKey } from "../../lib/utils";
import { t, type Lang } from "../../i18n";
import type { CollectionItem, TrackRef } from "../../api/types";
import type { SearchCategory } from "./searchTypes";
import { SearchArtistCard, SearchCollectionCard } from "./SearchCards";

interface SearchResultsAllProps {
  allTracks: TrackRef[];
  allArtists: CollectionItem[];
  allPlaylists: CollectionItem[];
  allAlbums: CollectionItem[];
  hasAllResults: boolean;
  error: string | null;
  nowKey: string | null;
  lang: Lang;
  setCategory: (cat: SearchCategory) => void;
  onPlayTrack: (track: TrackRef, list: TrackRef[]) => void;
  onArtistClick: (name: string, provider?: string) => void;
  onArtistSelect: (item: CollectionItem) => void;
  onOpenPreview: (item: CollectionItem) => void;
  onPlayCollection: (item: CollectionItem) => void;
}

export function SearchResultsAll({
  allTracks,
  allArtists,
  allPlaylists,
  allAlbums,
  hasAllResults,
  error,
  nowKey,
  lang,
  setCategory,
  onPlayTrack,
  onArtistClick,
  onArtistSelect,
  onOpenPreview,
  onPlayCollection,
}: SearchResultsAllProps) {
  const playLabel = t(lang, "common.play");

  return (
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
                onPlay={(t) => onPlayTrack(t, allTracks)}
                onArtistClick={(name, provider) => onArtistClick(name, provider)}
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
            {allArtists.slice(0, 8).map((item) => (
              <SearchArtistCard
                key={`${item.provider}:${item.id}`}
                item={item}
                onSelect={onArtistSelect}
              />
            ))}
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
            {allPlaylists.slice(0, 6).map((item) => (
              <SearchCollectionCard
                key={`${item.provider}:${item.id}`}
                item={item}
                playTitle={playLabel}
                onOpenPreview={onOpenPreview}
                onPlayCollection={onPlayCollection}
              />
            ))}
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
            {allAlbums.slice(0, 6).map((item) => (
              <SearchCollectionCard
                key={`${item.provider}:${item.id}`}
                item={item}
                playTitle={playLabel}
                onOpenPreview={onOpenPreview}
                onPlayCollection={onPlayCollection}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
