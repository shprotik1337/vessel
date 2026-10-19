export interface ThemeColors {
  accentColor: string;
  secondaryColor?: string;
  appBgColor: string;
  sidebarBgColor: string;
  playerBgColor: string;
  cardBgColor: string;
  textColor: string;
  wallpaperData: string | null;
  wallpaperBlur: number; // 0..40 px
  wallpaperDim: number; // 0..90 %
  glassMode: boolean;
  glassOpacity: number; // 0.1..0.95
  trackRowOpacity?: number; // 0..1
  trackRowActiveOpacity?: number; // 0..1
  trackRowActiveStyle?: "glass" | "accent" | "dark";
  ambientMode?: "dynamic" | "theme" | "off";
  windowOpacity?: number; // 0..100 % (Непрозрачность фона окна)
  glassForce?: number; // 0..100 % (Сила стекла - интенсивность акрилового слоя)
  backdropBlur?: number; // 0..40 px (Размытие стекла - радиус размытия заднего плана)
  customTrackArt?: string | null;
}

export interface ImageLibraryItem {
  id: string;
  url: string;
  name: string;
}

export type BorderRadiusPreset = "sharp" | "small" | "medium" | "round";
export type BlockWidth = "third" | "half" | "two-thirds" | "full";
export type BlockAlign = "left" | "center" | "right";
export type ComponentStyle = "dock" | "compact" | "round" | "floating" | "island" | "progress_fill";

export interface BlockCanvasPos {
  x: number; // in pixels, snapped to 24px
  y: number; // in pixels, snapped to 24px
  w: number | string; // in pixels or percentage
  h?: number | string; // optional height in pixels
  widthPreset?: BlockWidth;
  offsetX?: number;
}

export interface CustomizationConfig {
  borderRadius: BorderRadiusPreset;
  sidebar: {
    position: "left" | "right" | "top" | "bottom";
    style: ComponentStyle;
    width: number; // default 232, min 160, max 360
    height?: number; // for top/bottom, default 64, min 50, max 130
    collapsed: boolean;
    topVariant?: "compact" | "full";
    variant?: "standard" | "compact";
    horizontalNavButtons?: string[];
    autoHide?: boolean;
  };
  player: {
    position: "bottom" | "top" | "left" | "right";
    style: ComponentStyle;
    height: number; // default 96, min 68, max 120
    widthPercent?: number; // default 100, min 50, max 100
    largeIcons: boolean;
    showMiniPlayer?: boolean;
    hideDetails?: boolean;
    queuePosition?: "right" | "left" | "bottom";
    fullscreenMode?: "both" | "lyrics" | "cover";
    fullscreenFollowTrack?: boolean;
    fullscreenLyricsPosition?: "right" | "left";
    miniPlayerPreset?: "default" | "compact" | "minimal" | "expanded";
    miniPlayerBg?: "blur" | "solid" | "theme" | "artwork" | "dominant" | "dense_glass";
    miniPlayerShape?: "default" | "capsule";
  };
  home: {
    blockOrder: string[];
    hiddenBlocks: string[];
    blockWidths: Record<string, BlockWidth>;
    blockAligns?: Record<string, BlockAlign>;
    rows?: string[][];
    gridColumns: Record<string, number>;
    canvasPositions?: Record<string, BlockCanvasPos>;
    freeLayoutSections?: number[];
  };
  theme: ThemeColors;
  imageLibrary?: ImageLibraryItem[];
}

export interface ThemePreset {
  id: string;
  name: string;
  desc: string;
  accentColor: string;
  secondaryColor?: string;
  appBgColor: string;
  sidebarBgColor: string;
  playerBgColor: string;
  cardBgColor: string;
  textColor: string;
  glassMode: boolean;
  glassOpacity: number;
  wallpaperData?: string | null;
  wallpaperBlur?: number;
  wallpaperDim?: number;
  borderRadius?: BorderRadiusPreset;
  ambientMode?: "off" | "dynamic" | "theme";
  customTrackArt?: string | null;
}

export interface CustomizationContextType {
  config: CustomizationConfig;
  isEditMode: boolean;
  enterEditMode: () => void;
  saveEditMode: () => void;
  cancelEditMode: () => void;
  updateDraft: (updater: (prev: CustomizationConfig) => CustomizationConfig) => void;
  updateThemeDirectly: (partial: Partial<ThemeColors>) => void;
  setSidebarPosition: (pos: "left" | "right" | "top" | "bottom") => void;
  setSidebarStyle: (style: ComponentStyle) => void;
  setSidebarWidth: (width: number) => void;
  setSidebarHeight: (height: number) => void;
  setSidebarTopVariant: (variant: "compact" | "full") => void;
  setSidebarVariant: (variant: "standard" | "compact") => void;
  setSidebarAutoHide: (autoHide: boolean) => void;
  setPlayerPosition: (pos: "bottom" | "top" | "left" | "right") => void;
  setPlayerStyle: (style: ComponentStyle) => void;
  setPlayerHeight: (height: number) => void;
  setPlayerWidthPercent: (widthPercent: number) => void;
  setPlayerOptions: (options: { largeIcons?: boolean; hideDetails?: boolean }) => void;
  setBorderRadius: (preset: BorderRadiusPreset) => void;
  setBlockWidth: (id: string, width: BlockWidth) => void;
  setBlockAlign: (id: string, align: BlockAlign) => void;
  setBlockCanvasPos: (id: string, pos: Partial<BlockCanvasPos>) => void;
  toggleSectionLayoutMode: (rowIndex: number) => void;
  resetSectionOffsets: (rowIndex: number) => void;
  toggleSidebarPosition: () => void;
  moveBlock: (id: string, direction: "up" | "down") => void;
  moveBlockRow: (id: string, direction: "up" | "down") => void;
  shiftBlockInRow: (id: string, direction: "left" | "right") => void;
  separateBlockToNewRow: (id: string) => void;
  joinBlockWithRowAbove: (id: string) => void;
  reorderBlocks: (sourceId: string, targetId: string) => void;
  addSection: () => void;
  removeSection: (sectionIndex: number) => void;
  movePanel: (panelId: string, targetSectionIndex: number, targetSlotIndex?: number) => void;
  toggleBlockVisibility: (id: string) => void;
  deleteBlock: (id: string) => void;
  addBlock: (id: string, targetSectionIndex?: number) => void;
  isAddModalOpen: boolean;
  setIsAddModalOpen: (open: boolean) => void;
  setBlockGridColumns: (id: string, cols: number) => void;
  applyPreset: (preset: ThemePreset) => void;
  userPresets: (ThemePreset | null)[];
  saveToUserSlot: (slotIndex: number, customName?: string) => void;
  loadFromUserSlot: (slotIndex: number) => void;
  deleteUserSlot: (slotIndex: number) => void;
  resetToDefaults: () => void;
  isQueueOpen: boolean;
  setIsQueueOpen: (open: boolean) => void;
  toggleQueue: () => void;
  setShowMiniPlayer: (show: boolean) => void;
  setQueuePosition: (pos: "right" | "left" | "bottom") => void;
  setFullscreenMode: (mode: "both" | "lyrics" | "cover") => void;
  setFullscreenFollowTrack: (follow: boolean) => void;
  setFullscreenLyricsPosition: (pos: "right" | "left") => void;
  setMiniPlayerPreset: (preset: "default" | "compact" | "minimal" | "expanded") => void;
  setMiniPlayerBg: (bg: "blur" | "solid" | "theme" | "artwork" | "dominant" | "dense_glass") => void;
  setMiniPlayerShape: (shape: "default" | "capsule") => void;
  setHorizontalNavButtons: (buttons: string[]) => void;
  isPreviewActive: boolean;
  previewPreset: ThemePreset | null;
  startPreview: (preset: ThemePreset) => void;
  applyPreview: () => void;
  cancelPreview: () => void;
  activeDragTarget: "sidebar" | "player" | null;
  setActiveDragTarget: (target: "sidebar" | "player" | null) => void;
  activeDropZone: "left" | "right" | "top" | "bottom" | null;
  setActiveDropZone: (zone: "left" | "right" | "top" | "bottom" | null) => void;
  customTrackArt: string | null;
  setCustomTrackArt: (url: string | null) => void;
  imageLibrary: ImageLibraryItem[];
  addToImageLibrary: (item: { url: string; name: string }) => void;
  removeFromImageLibrary: (id: string) => void;
  setWallpaperData: (url: string | null) => void;
}
