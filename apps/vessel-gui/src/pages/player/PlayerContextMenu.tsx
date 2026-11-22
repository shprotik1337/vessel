import type { TrackRef } from "../../api/types";
import type { Lang } from "../../i18n";
import { MiniContextMenu, type MiniContextMenuState } from "../../components/MiniContextMenu";

export interface ContextMenuState extends MiniContextMenuState {}

interface PlayerContextMenuProps {
  menu: ContextMenuState | null;
  onClose: () => void;
  onPlayNext: (track: TrackRef) => void;
  onToggleFavorite?: (track: TrackRef) => void;
  onCacheTrack?: (track: TrackRef) => void;
  onRemoveTrack?: (index: number) => void;
  isFav?: boolean;
  lang: Lang;
}

export function PlayerContextMenu({
  menu,
  onClose,
  onPlayNext,
  onRemoveTrack,
  lang,
}: PlayerContextMenuProps) {
  if (!menu) return null;

  return (
    <MiniContextMenu
      menu={menu}
      onClose={onClose}
      onPlayNext={onPlayNext}
      onRemoveTrack={onRemoveTrack}
      lang={lang}
    />
  );
}
