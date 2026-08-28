import { useApp } from "../store";
import {
  formatDuration,
  artistLabel,
  providerLabel,
  isFavorite,
  trackKey,
  canPlay,
} from "../lib/utils";
import type { TrackRef } from "../api/types";
import { Artwork } from "./Artwork";
import * as api from "../api/commands";

interface TrackRowProps {
  track: TrackRef;
  index: number;
  nowKey?: string | null;
  onPlay: (track: TrackRef) => void;
  showAlbum?: boolean;
  showAdded?: boolean;
  addedLabel?: string;
}

export function TrackRow({
  track,
  index,
  nowKey,
  onPlay,
  showAlbum,
  showAdded,
  addedLabel,
}: TrackRowProps) {
  const { state, showToast, refresh } = useApp();
  const key = trackKey(track);
  const playing = nowKey != null && nowKey === key;
  const fav = state ? isFavorite(state.library, track) : false;
  const playable = canPlay(track.capability);

  const handleFav = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.toggleFavorite(track);
      await refresh();
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const handleAddQueue = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.addToQueue(track);
      showToast(`Added to queue: ${track.title}`);
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const handlePlayNext = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await api.playNext(track);
      showToast(`Play next: ${track.title}`);
    } catch (error) {
      showToast(String(error), true);
    }
  };

  return (
    <div
      className={`trow ${playing ? "now" : ""} ${!playable ? "dim" : ""}`}
      onClick={() => playable && onPlay(track)}
      style={playable ? { cursor: "pointer" } : undefined}
    >
      <span className="c-idx">
        {playing ? (
          <span className="eq">
            <i />
            <i />
            <i />
          </span>
        ) : (
          <span className="t-num">{index + 1}</span>
        )}
      </span>
      <Artwork url={track.artwork_url} alt={track.title} size={32} seed={track.id.length} className="t-art" />
      <div className="c-title">
        <span className="ttl">{track.title}</span>
        <span className="sub">{artistLabel(track.artists)}</span>
      </div>
      {showAlbum ? <span className="c-album">—</span> : <span />}
      <span className="c-src">
        {!playable ? (
          <span className="badge-unav">Unavailable</span>
        ) : (
          <span className="src">{providerLabel(track.provider)}</span>
        )}
        <span className="row-actions">
          <i className={fav ? "fav" : ""} onClick={handleFav} title="Favorite">
            {fav ? "♥" : "♡"}
          </i>
          <i onClick={handleAddQueue} title="Add to queue">
            ＋
          </i>
          <i onClick={handlePlayNext} title="Play next">
            ⊕
          </i>
        </span>
      </span>
      {showAdded ? <span className="c-added">{addedLabel ?? ""}</span> : <span />}
      <span className="c-time">{formatDuration(track.duration_ms)}</span>
    </div>
  );
}
