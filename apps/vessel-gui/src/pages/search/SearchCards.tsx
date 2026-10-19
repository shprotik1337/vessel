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
  onPlayCollection?: (item: CollectionItem) => void;
}

export function SearchCollectionCard({
  item,
  onOpenPreview,
}: SearchCollectionCardProps) {
  const isAlbum = item.kind === "album";
  const yearMatch = item.subtitle?.match(/\b(19\d\d|20\d\d)\b/);
  const year = yearMatch ? yearMatch[1] : "";
  let formattedSub = item.subtitle || providerLabel(item.provider);
  if (isAlbum) {
    formattedSub = year ? `Альбом • ${year}` : (item.subtitle || "Альбом");
  }

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
      </div>
      <div className="search-collection-title">{item.title}</div>
      <div className="search-collection-sub">{formattedSub}</div>
    </div>
  );
}
