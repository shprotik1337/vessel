import { useRef, useEffect, useLayoutEffect } from "react";
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

  useLayoutEffect(() => {
    if (!menu || !menuRef.current) return;
    const rect = menuRef.current.getBoundingClientRect();
    if (rect.right > window.innerWidth - 16) {
      const overflow = rect.right - (window.innerWidth - 16);
      menuRef.current.style.left = `${Math.max(12, rect.left - overflow)}px`;
    }
    if (rect.bottom > window.innerHeight - 16) {
      const overflow = rect.bottom - (window.innerHeight - 16);
      menuRef.current.style.top = `${Math.max(12, rect.top - overflow)}px`;
    }
  }, [menu]);

  if (!menu) return null;

  return createPortal(
    <div
      ref={menuRef}
      className="ctx show"
      style={{
        position: "fixed",
        left: menu.x,
        top: menu.y,
        maxWidth: "240px",
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
