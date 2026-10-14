import { Artwork } from "../../components/Artwork";
import { PlatformIcon } from "../../components/PlatformIcon";
import { providerLabel } from "../../lib/utils";
import type { CollectionItem } from "../../api/types";

interface SearchArtistCardProps {
  item: CollectionItem;
  onSelect: (item: CollectionItem) => void;
}

export function SearchArtistCard({ item, onSelect }: SearchArtistCardProps) {
  return (
    <div
      className="search-artist-card"
      onClick={() => onSelect(item)}
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
}

interface SearchCollectionCardProps {
  item: CollectionItem;
  playTitle?: string;
  onOpenPreview: (item: CollectionItem) => void;
  onPlayCollection: (item: CollectionItem) => void;
}

export function SearchCollectionCard({
  item,
  playTitle = "▶",
  onOpenPreview,
  onPlayCollection,
}: SearchCollectionCardProps) {
  return (
    <div
      className="search-collection-card"
      title={item.title}
      onClick={() => void onOpenPreview(item)}
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
          title={playTitle}
          onClick={(e) => {
            e.stopPropagation();
            void onPlayCollection(item);
          }}
        >
          ▶
        </button>
      </div>
      <div className="search-collection-title">{item.title}</div>
      <div className="search-collection-sub">{item.subtitle || providerLabel(item.provider)}</div>
    </div>
  );
}
