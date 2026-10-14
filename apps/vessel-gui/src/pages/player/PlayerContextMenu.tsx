import { useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import type { TrackRef } from "../../api/types";
import type { Lang } from "../../i18n";

export interface ContextMenuState {
  track: TrackRef;
  index: number;
  x: number;
  y: number;
}

interface PlayerContextMenuProps {
  menu: ContextMenuState | null;
  onClose: () => void;
  onPlayNext: (track: TrackRef) => void;
  onToggleFavorite: (track: TrackRef) => void;
  onCacheTrack: (track: TrackRef) => void;
  onRemoveTrack: (index: number) => void;
  isFav: boolean;
  lang: Lang;
}

export function PlayerContextMenu({
  menu,
  onClose,
  onPlayNext,
  onToggleFavorite,
  onCacheTrack,
  onRemoveTrack,
  isFav,
  lang,
}: PlayerContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menu) return;
    const handleClickOutside = () => onClose();
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, [menu, onClose]);

  if (!menu) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="ctx show"
      style={{
        position: "fixed",
        left: menu.x,
        top: menu.y,
        zIndex: 99999,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="ctx-head">{menu.track.title}</div>
      <div className="ctx-item" onClick={() => onPlayNext(menu.track)}>
        {lang === "ru" ? "Сыграть следующим" : "Play next"}
      </div>
      <div className="ctx-item" onClick={() => onToggleFavorite(menu.track)}>
        {isFav
          ? (lang === "ru" ? "Удалить из избранного" : "Remove from favorites")
          : (lang === "ru" ? "В избранное" : "Add to favorites")}
      </div>
      <div className="ctx-item" onClick={() => onCacheTrack(menu.track)}>
        {lang === "ru" ? "Сохранить в кэш" : "Save to cache"}
      </div>
      <div className="ctx-sep" />
      <div className="ctx-item danger" onClick={() => onRemoveTrack(menu.index)}>
        {lang === "ru" ? "Удалить из очереди" : "Remove from queue"}
      </div>
    </div>,
    document.body
  );
}
