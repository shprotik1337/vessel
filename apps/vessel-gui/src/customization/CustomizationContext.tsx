import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export interface ThemeColors {
  accentColor: string;
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
}

export type BorderRadiusPreset = "sharp" | "small" | "medium" | "round";
export type BlockWidth = "third" | "half" | "two-thirds" | "full";
export type BlockAlign = "left" | "center" | "right";
export type ComponentStyle = "dock" | "floating";

export let globalDraggingPanelId: string | null = null;
export function setGlobalDraggingPanelId(id: string | null) {
  globalDraggingPanelId = id;
}

export let globalDragStartX: number | null = null;
export function setGlobalDragStartX(x: number | null) {
  globalDragStartX = x;
}

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
  };
  player: {
    position: "bottom" | "top" | "left" | "right";
    style: ComponentStyle;
    height: number; // default 82, min 68, max 120
    widthPercent?: number; // default 100, min 50, max 100
    largeIcons: boolean;
    hideDetails: boolean;
    queuePosition?: "right" | "left" | "bottom";
    miniPlayerPreset?: "full" | "rounded" | "hybrid" | "deck";
    miniPlayerBg?: "theme" | "artwork" | "dominant";
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
}

export interface ThemePreset {
  id: string;
  name: string;
  desc: string;
  accentColor: string;
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
}

export const BUILTIN_THEMES: ThemePreset[] = [
  {
    id: "classic",
    name: "Classic Dark",
    desc: "Стандартная сбалансированная тёмная тема",
    accentColor: "#3b82f6",
    appBgColor: "#0B0B0C",
    sidebarBgColor: "#141416",
    playerBgColor: "#141416",
    cardBgColor: "#1C1C1F",
    textColor: "#F4F4F5",
    glassMode: true,
    glassOpacity: 0.72,
  },
  {
    id: "cyberpunk",
    name: "Cyberpunk Neon",
    desc: "Яркий неоновый контраст в стиле ночного города",
    accentColor: "#f43f5e",
    appBgColor: "#0b0914",
    sidebarBgColor: "#120e24",
    playerBgColor: "#120e24",
    cardBgColor: "#1c1438",
    textColor: "#fdf2f8",
    glassMode: true,
    glassOpacity: 0.68,
  },
  {
    id: "midnight",
    name: "Midnight Ocean",
    desc: "Глубокий тёмно-синий океан с лазурным акцентом",
    accentColor: "#06b6d4",
    appBgColor: "#060e17",
    sidebarBgColor: "#0a1626",
    playerBgColor: "#0a1626",
    cardBgColor: "#112238",
    textColor: "#ecfeff",
    glassMode: true,
    glassOpacity: 0.72,
  },
  {
    id: "emerald",
    name: "Emerald Forest",
    desc: "Спокойный лесной изумрудный стиль",
    accentColor: "#10b981",
    appBgColor: "#06120b",
    sidebarBgColor: "#0d1f14",
    playerBgColor: "#0d1f14",
    cardBgColor: "#152e1f",
    textColor: "#ecfdf5",
    glassMode: true,
    glassOpacity: 0.72,
  },
  {
    id: "amethyst",
    name: "Purple Velvet",
    desc: "Мистический фиолетовый бархат",
    accentColor: "#a855f7",
    appBgColor: "#0e0717",
    sidebarBgColor: "#170c26",
    playerBgColor: "#170c26",
    cardBgColor: "#24143b",
    textColor: "#faf5ff",
    glassMode: true,
    glassOpacity: 0.72,
  },
  {
    id: "obsidian",
    name: "OLED Pure Black",
    desc: "Максимально глубокий чёрный для OLED-экранов",
    accentColor: "#ffffff",
    appBgColor: "#000000",
    sidebarBgColor: "#090909",
    playerBgColor: "#090909",
    cardBgColor: "#141414",
    textColor: "#ffffff",
    glassMode: false,
    glassOpacity: 0.95,
  },
];

export const DEFAULT_CUSTOMIZATION: CustomizationConfig = {
  borderRadius: "medium",
  sidebar: {
    position: "left",
    style: "dock",
    width: 232,
    height: 64,
    collapsed: false,
    topVariant: "full",
  },
  player: {
    position: "bottom",
    style: "floating",
    height: 82,
    widthPercent: 100,
    largeIcons: false,
    hideDetails: false,
    queuePosition: "right",
    miniPlayerPreset: "full",
    miniPlayerBg: "theme",
    miniPlayerShape: "default",
  },
  home: {
    blockOrder: ["header", "wave", "playlists", "recent", "library"],
    hiddenBlocks: [],
    rows: [
      ["header"],
      ["wave"],
      ["playlists", "recent"],
      ["library"],
      [],
    ],
    blockWidths: {
      header: "full",
      wave: "full",
      playlists: "half",
      recent: "half",
      library: "full",
    },
    blockAligns: {
      header: "left",
      wave: "left",
      playlists: "left",
      recent: "left",
      library: "left",
    },
    gridColumns: {
      recent: 4,
      playlists: 3,
      library: 4,
    },
    canvasPositions: {
      header: { x: 0, y: 0, w: "100%", widthPreset: "full", offsetX: 0 },
      wave: { x: 0, y: 72, w: "100%", widthPreset: "full", offsetX: 0 },
      playlists: { x: 0, y: 264, w: 576, widthPreset: "half", offsetX: 0 },
      recent: { x: 0, y: 264, w: 576, widthPreset: "half", offsetX: 0 },
      library: { x: 0, y: 552, w: "100%", widthPreset: "full", offsetX: 0 },
    },
    freeLayoutSections: [],
  },
  theme: {
    accentColor: "#3b82f6",
    appBgColor: "#0B0B0C",
    sidebarBgColor: "#141416",
    playerBgColor: "#141416",
    cardBgColor: "#1C1C1F",
    textColor: "#F4F4F5",
    wallpaperData: null,
    wallpaperBlur: 14,
    wallpaperDim: 45,
    glassMode: true,
    glassOpacity: 0.72,
  },
};

const STORAGE_KEY = "vessel_customization_v2";
const USER_PRESETS_KEY = "vessel_customization_user_presets_v2";

export function hexToRgba(hex: string, alpha: number): string {
  if (!hex || typeof hex !== "string" || !hex.startsWith("#")) return hex;
  let c = hex.substring(1);
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  if (c.length === 6) {
    const r = parseInt(c.substring(0, 2), 16);
    const g = parseInt(c.substring(2, 4), 16);
    const b = parseInt(c.substring(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
  }
  return hex;
}

export function getContrastTextColor(hex: string): string {
  if (!hex || typeof hex !== "string" || !hex.startsWith("#")) return "#ffffff";
  let c = hex.substring(1);
  if (c.length === 3) c = c.split("").map((x) => x + x).join("");
  if (c.length === 6) {
    const r = parseInt(c.substring(0, 2), 16) / 255;
    const g = parseInt(c.substring(2, 4), 16) / 255;
    const b = parseInt(c.substring(4, 6), 16) / 255;
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    return lum > 0.48 ? "#000000" : "#ffffff";
  }
  return "#ffffff";
}

export const ALL_HOME_BLOCKS = [
  { id: "header", title: "Приветствие и статус", defaultWidth: "full" as BlockWidth },
  { id: "wave", title: "Моя волна", defaultWidth: "full" as BlockWidth },
  { id: "recent", title: "Продолжить прослушивание", defaultWidth: "full" as BlockWidth },
  { id: "playlists", title: "Плейлисты", defaultWidth: "full" as BlockWidth },
  { id: "library", title: "Библиотека", defaultWidth: "full" as BlockWidth },
] as const;

export function sanitizeConfig(raw: any): CustomizationConfig {
  if (!raw || typeof raw !== "object") {
    return JSON.parse(JSON.stringify(DEFAULT_CUSTOMIZATION));
  }

  const validRadii: BorderRadiusPreset[] = ["sharp", "small", "medium", "round"];
  const borderRadius: BorderRadiusPreset = validRadii.includes(raw.borderRadius)
    ? raw.borderRadius
    : "medium";

  const validPositions = ["left", "right", "top", "bottom"] as const;
  const sidebarPos = validPositions.includes(raw.sidebar?.position)
    ? raw.sidebar.position
    : "left";
  const sidebarStyle: ComponentStyle =
    raw.sidebar?.style === "floating" ? "floating" : "dock";
  const sidebarWidth =
    typeof raw.sidebar?.width === "number" && !isNaN(raw.sidebar.width)
      ? Math.max(160, Math.min(360, raw.sidebar.width))
      : 232;
  const sidebarHeight =
    typeof raw.sidebar?.height === "number" && !isNaN(raw.sidebar.height)
      ? Math.max(50, Math.min(130, raw.sidebar.height))
      : 64;
  const sidebarCollapsed = Boolean(raw.sidebar?.collapsed);

  const validPlayerPositions = ["bottom", "top", "left", "right"] as const;
  const playerPos = validPlayerPositions.includes(raw.player?.position)
    ? raw.player.position
    : "bottom";
  const playerStyle: ComponentStyle =
    raw.player?.style === "dock" ? "dock" : "floating";
  const playerHeight =
    typeof raw.player?.height === "number" && !isNaN(raw.player.height)
      ? Math.max(68, Math.min(120, raw.player.height))
      : 82;
  const playerWidthPercent =
    typeof raw.player?.widthPercent === "number" && !isNaN(raw.player.widthPercent)
      ? Math.max(50, Math.min(100, raw.player.widthPercent))
      : 100;
  const playerLargeIcons = Boolean(raw.player?.largeIcons);
  const playerHideDetails = Boolean(raw.player?.hideDetails);

  const validQueuePositions = ["right", "left", "bottom"] as const;
  const queuePosition = validQueuePositions.includes(raw.player?.queuePosition)
    ? raw.player.queuePosition
    : "right";

  const validMiniPlayerPresets = ["full", "rounded", "hybrid", "deck"] as const;
  const miniPlayerPreset = validMiniPlayerPresets.includes(raw.player?.miniPlayerPreset)
    ? raw.player.miniPlayerPreset
    : "full";

  const validMiniPlayerBgs = ["theme", "artwork", "dominant"] as const;
  const miniPlayerBg = validMiniPlayerBgs.includes(raw.player?.miniPlayerBg)
    ? raw.player.miniPlayerBg
    : "theme";

  const validMiniPlayerShapes = ["default", "capsule"] as const;
  const miniPlayerShape = validMiniPlayerShapes.includes(raw.player?.miniPlayerShape)
    ? raw.player.miniPlayerShape
    : "default";

  const defaultOrder = ["header", "wave", "recent", "playlists", "library"];
  let blockOrder: string[] = [];
  if (Array.isArray(raw.home?.blockOrder)) {
    blockOrder = raw.home.blockOrder.filter((b: any) => typeof b === "string");
  } else {
    blockOrder = [...defaultOrder];
  }

  const hiddenBlocks = Array.isArray(raw.home?.hiddenBlocks)
    ? raw.home.hiddenBlocks.filter((b: any) => typeof b === "string")
    : [];

  const validWidths: BlockWidth[] = ["third", "half", "two-thirds", "full"];
  const blockWidths: Record<string, BlockWidth> = {
    header: "full",
    wave: "full",
    recent: "full",
    playlists: "full",
    library: "full",
  };
  if (typeof raw.home?.blockWidths === "object" && raw.home.blockWidths !== null) {
    for (const [k, v] of Object.entries(raw.home.blockWidths)) {
      if (typeof v === "string" && validWidths.includes(v as BlockWidth)) {
        blockWidths[k] = v as BlockWidth;
      }
    }
  }

  const gridColumns = {
    recent: 4,
    playlists: 3,
    library: 4,
  };
  if (typeof raw.home?.gridColumns === "object" && raw.home?.gridColumns !== null) {
    if (typeof raw.home.gridColumns.recent === "number") gridColumns.recent = raw.home.gridColumns.recent;
    if (typeof raw.home.gridColumns.playlists === "number") gridColumns.playlists = raw.home.gridColumns.playlists;
    if (typeof raw.home.gridColumns.library === "number") gridColumns.library = raw.home.gridColumns.library;
  }

  const sidebarTopVariant = raw.sidebar?.topVariant === "compact" ? "compact" : "full";

  const defaultCanvasPositions: Record<string, BlockCanvasPos> = {
    header: { x: 0, y: 0, w: "100%", widthPreset: "full", offsetX: 0 },
    wave: { x: 0, y: 72, w: "100%", widthPreset: "full", offsetX: 0 },
    playlists: { x: 0, y: 264, w: 576, widthPreset: "half", offsetX: 0 },
    recent: { x: 0, y: 264, w: 576, widthPreset: "half", offsetX: 0 },
    library: { x: 0, y: 552, w: "100%", widthPreset: "full", offsetX: 0 },
  };

  const canvasPositions: Record<string, BlockCanvasPos> = { ...defaultCanvasPositions };
  if (typeof raw.home?.canvasPositions === "object" && raw.home?.canvasPositions !== null) {
    for (const [k, v] of Object.entries(raw.home.canvasPositions)) {
      if (typeof v === "object" && v !== null) {
        const item = v as any;
        canvasPositions[k] = {
          x: typeof item.x === "number" ? item.x : 0,
          y: typeof item.y === "number" ? item.y : 0,
          w: typeof item.w === "number" || typeof item.w === "string" ? item.w : "100%",
          h: typeof item.h === "number" || typeof item.h === "string" ? item.h : undefined,
          widthPreset: item.widthPreset,
          offsetX: typeof item.offsetX === "number" ? item.offsetX : 0,
        };
      }
    }
  }

  let freeLayoutSections: number[] = [];
  if (Array.isArray(raw.home?.freeLayoutSections)) {
    freeLayoutSections = raw.home.freeLayoutSections.filter((i: any) => typeof i === "number");
  }

  const theme: ThemeColors = {
    accentColor: typeof raw.theme?.accentColor === "string" ? raw.theme.accentColor : "#3b82f6",
    appBgColor: typeof raw.theme?.appBgColor === "string" ? raw.theme.appBgColor : "#0B0B0C",
    sidebarBgColor: typeof raw.theme?.sidebarBgColor === "string" ? raw.theme.sidebarBgColor : "#141416",
    playerBgColor: typeof raw.theme?.playerBgColor === "string" ? raw.theme.playerBgColor : "#141416",
    cardBgColor: typeof raw.theme?.cardBgColor === "string" ? raw.theme.cardBgColor : "#1C1C1F",
    textColor: typeof raw.theme?.textColor === "string" ? raw.theme.textColor : "#F4F4F5",
    wallpaperData: typeof raw.theme?.wallpaperData === "string" ? raw.theme.wallpaperData : null,
    wallpaperBlur: typeof raw.theme?.wallpaperBlur === "number" ? raw.theme.wallpaperBlur : 14,
    wallpaperDim: typeof raw.theme?.wallpaperDim === "number" ? raw.theme.wallpaperDim : 45,
    glassMode: raw.theme?.glassMode !== undefined ? Boolean(raw.theme.glassMode) : true,
    glassOpacity: typeof raw.theme?.glassOpacity === "number" ? raw.theme.glassOpacity : 0.72,
  };

  const validAligns: BlockAlign[] = ["left", "center", "right"];
  const blockAligns: Record<string, BlockAlign> = {
    header: "left",
    wave: "left",
    playlists: "left",
    recent: "left",
    library: "left",
  };
  if (typeof raw.home?.blockAligns === "object" && raw.home.blockAligns !== null) {
    for (const [k, v] of Object.entries(raw.home.blockAligns)) {
      if (typeof v === "string" && validAligns.includes(v as BlockAlign)) {
        blockAligns[k] = v as BlockAlign;
      }
    }
  }

  // Row lines (sections): string[][]
  let rows: string[][] = [];
  if (Array.isArray(raw.home?.rows) && raw.home.rows.length > 0) {
    rows = raw.home.rows.map((r: any) =>
      Array.isArray(r) ? r.filter((b: any) => typeof b === "string") : []
    );
  }
  if (rows.length === 0) {
    rows = [
      ["header"],
      ["wave"],
      ["playlists", "recent"],
      ["library"],
      [],
    ];
  }
  const existingInRows = new Set(rows.flat());
  for (const b of blockOrder) {
    if (!existingInRows.has(b) && !hiddenBlocks.includes(b)) {
      const emptyIdx = rows.findIndex((r) => r.length === 0);
      if (emptyIdx !== -1) {
        rows[emptyIdx].push(b);
      } else {
        rows.push([b]);
      }
      existingInRows.add(b);
    }
  }

  return {
    borderRadius,
    sidebar: {
      position: sidebarPos,
      style: sidebarStyle,
      width: sidebarWidth,
      height: sidebarHeight,
      collapsed: sidebarCollapsed,
      topVariant: sidebarTopVariant,
    },
    player: {
      position: playerPos,
      style: playerStyle,
      height: playerHeight,
      widthPercent: playerWidthPercent,
      largeIcons: playerLargeIcons,
      hideDetails: playerHideDetails,
      queuePosition,
      miniPlayerPreset,
      miniPlayerBg,
      miniPlayerShape,
    },
    home: {
      blockOrder,
      hiddenBlocks,
      blockWidths,
      blockAligns,
      rows,
      gridColumns,
      canvasPositions,
      freeLayoutSections,
    },
    theme,
  };
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
  setQueuePosition: (pos: "right" | "left" | "bottom") => void;
  setMiniPlayerPreset: (preset: "full" | "rounded" | "hybrid" | "deck") => void;
  setMiniPlayerBg: (bg: "theme" | "artwork" | "dominant") => void;
  setMiniPlayerShape: (shape: "default" | "capsule") => void;
  isPreviewActive: boolean;
  previewPreset: ThemePreset | null;
  startPreview: (preset: ThemePreset) => void;
  applyPreview: () => void;
  cancelPreview: () => void;
  activeDragTarget: "sidebar" | "player" | null;
  setActiveDragTarget: (target: "sidebar" | "player" | null) => void;
  activeDropZone: "left" | "right" | "top" | "bottom" | null;
  setActiveDropZone: (zone: "left" | "right" | "top" | "bottom" | null) => void;
}

const CustomizationContext = createContext<CustomizationContextType | null>(null);

export function CustomizationProvider({ children }: { children: ReactNode }) {
  const [savedConfig, setSavedConfig] = useState<CustomizationConfig>(() => {
    try {
      const item = localStorage.getItem(STORAGE_KEY) || localStorage.getItem("vessel_customization_v1");
      if (item) {
        return sanitizeConfig(JSON.parse(item));
      }
    } catch (e) {
      console.error("Failed to read customization config from localStorage", e);
    }
    return JSON.parse(JSON.stringify(DEFAULT_CUSTOMIZATION));
  });

  const [draftConfig, setDraftConfig] = useState<CustomizationConfig>(() => sanitizeConfig(savedConfig));
  const [isEditMode, setIsEditMode] = useState(false);
  const [activeDragTarget, setActiveDragTarget] = useState<"sidebar" | "player" | null>(null);
  const [activeDropZone, setActiveDropZone] = useState<"left" | "right" | "top" | "bottom" | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // User preset slots (up to 3 slots)
  const [userPresets, setUserPresets] = useState<(ThemePreset | null)[]>(() => {
    try {
      const item = localStorage.getItem(USER_PRESETS_KEY);
      if (item) {
        const parsed = JSON.parse(item);
        if (Array.isArray(parsed)) return parsed.slice(0, 3);
      }
    } catch {}
    return [null, null, null];
  });

  // Queue drawer state
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const toggleQueue = () => setIsQueueOpen((prev) => !prev);

  // Fullscreen theme preview state
  const [previewPreset, setPreviewPreset] = useState<ThemePreset | null>(null);
  const [prePreviewConfig, setPrePreviewConfig] = useState<CustomizationConfig | null>(null);

  const activeConfig = sanitizeConfig(isEditMode ? draftConfig : savedConfig);

  // Dynamically inject CSS variables into document.documentElement
  useEffect(() => {
    const root = document.documentElement;
    const { theme, borderRadius, sidebar, player } = activeConfig;

    root.style.setProperty("--accent", theme.accentColor);
    root.style.setProperty("--accent-hover", hexToRgba(theme.accentColor, 0.85));
    root.style.setProperty("--accent-glow", hexToRgba(theme.accentColor, 0.35));
    root.style.setProperty("--accent-contrast-text", getContrastTextColor(theme.accentColor));
    root.style.setProperty("--text", theme.textColor);
    root.style.setProperty("--text2", hexToRgba(theme.textColor, 0.72));
    root.style.setProperty("--text3", hexToRgba(theme.textColor, 0.45));
    root.style.setProperty("--wp-blur", `${theme.wallpaperBlur}px`);
    root.style.setProperty("--wp-dim", `${theme.wallpaperDim / 100}`);

    const radiusMap: Record<BorderRadiusPreset, { card: string; panel: string; btn: string; player: string }> = {
      sharp: { card: "0px", panel: "0px", btn: "0px", player: "0px" },
      small: { card: "6px", panel: "8px", btn: "4px", player: "8px" },
      medium: { card: "14px", panel: "16px", btn: "8px", player: "16px" },
      round: { card: "24px", panel: "24px", btn: "9999px", player: "26px" },
    };
    const r = radiusMap[borderRadius] || radiusMap.medium;
    root.style.setProperty("--radius-card", r.card);
    root.style.setProperty("--radius-panel", r.panel);
    root.style.setProperty("--radius-btn", r.btn);
    root.style.setProperty("--radius-player", r.player);
    root.style.setProperty("--sidebar-width", `${sidebar.width || 232}px`);
    root.style.setProperty("--sidebar-height", `${sidebar.height || 64}px`);
    root.style.setProperty("--player-height", `${player.height || 82}px`);
    root.style.setProperty("--player-width", `${player.widthPercent || 100}%`);

    const isGlass = Boolean(theme.glassMode);
    const alpha = isGlass ? Math.max(0.1, Math.min(0.95, theme.glassOpacity ?? 0.72)) : 1;

    root.style.setProperty("--bg", theme.wallpaperData ? "transparent" : theme.appBgColor);
    root.style.setProperty("--panel", hexToRgba(theme.sidebarBgColor, alpha));
    root.style.setProperty("--panel2", hexToRgba(theme.sidebarBgColor, Math.max(0.08, alpha * 0.85)));
    root.style.setProperty("--sidebar-bg", hexToRgba(theme.sidebarBgColor, alpha));
    root.style.setProperty("--player-bg", hexToRgba(theme.playerBgColor, alpha));
    root.style.setProperty("--panel-bg-glass", hexToRgba(theme.sidebarBgColor, alpha));
    root.style.setProperty("--player-bg-glass", hexToRgba(theme.playerBgColor, alpha));
    root.style.setProperty("--card-bg", hexToRgba(theme.cardBgColor, Math.min(0.95, alpha + 0.05)));
    root.style.setProperty("--card-bg-glass", hexToRgba(theme.cardBgColor, Math.min(0.95, alpha + 0.05)));
    root.style.setProperty("--elev", hexToRgba(theme.cardBgColor, Math.min(0.95, alpha + 0.05)));
    root.style.setProperty("--elev2", hexToRgba(theme.cardBgColor, Math.min(0.95, alpha + 0.12)));
    root.style.setProperty("--hover", hexToRgba(theme.cardBgColor, Math.min(0.95, alpha + 0.18)));
    root.style.setProperty("--border", hexToRgba(theme.textColor, 0.10));
    root.style.setProperty("--border2", hexToRgba(theme.textColor, 0.18));
    root.style.setProperty("--border3", hexToRgba(theme.textColor, 0.28));
    root.style.setProperty("--glass-border", hexToRgba(theme.textColor, 0.12));
    root.style.setProperty("--glass-blur", isGlass ? `${Math.max(12, theme.wallpaperBlur || 16)}px` : "0px");
    root.style.setProperty("--glass-blur-val", `${Math.max(12, theme.wallpaperBlur || 16)}px`);
  }, [activeConfig]);

  const enterEditMode = () => {
    setDraftConfig(JSON.parse(JSON.stringify(savedConfig)));
    setIsEditMode(true);
  };

  const saveEditMode = () => {
    setSavedConfig(draftConfig);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(draftConfig));
    } catch (e) {
      console.error("Failed to save customization config to localStorage", e);
    }
    setIsEditMode(false);
  };

  const cancelEditMode = () => {
    setDraftConfig(JSON.parse(JSON.stringify(savedConfig)));
    setIsEditMode(false);
  };

  const updateDraft = (updater: (prev: CustomizationConfig) => CustomizationConfig) => {
    setDraftConfig((prev) => sanitizeConfig(updater(prev)));
  };

  const persistOrDraft = (updater: (prev: CustomizationConfig) => CustomizationConfig) => {
    if (isEditMode) {
      updateDraft(updater);
    } else {
      setSavedConfig((prev) => {
        const next = sanitizeConfig(updater(prev));
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
        return next;
      });
      setDraftConfig((prev) => sanitizeConfig(updater(prev)));
    }
  };

  const updateThemeDirectly = (partial: Partial<ThemeColors>) => {
    persistOrDraft((prev) => ({
      ...prev,
      theme: { ...prev.theme, ...partial },
    }));
  };

  const setSidebarPosition = (pos: "left" | "right" | "top" | "bottom") => {
    persistOrDraft((prev) => ({
      ...prev,
      sidebar: { ...prev.sidebar, position: pos },
    }));
  };

  const setSidebarStyle = (style: ComponentStyle) => {
    persistOrDraft((prev) => ({
      ...prev,
      sidebar: { ...prev.sidebar, style },
    }));
  };

  const setSidebarWidth = (width: number) => {
    const clamped = Math.max(160, Math.min(360, Math.round(width)));
    persistOrDraft((prev) => ({
      ...prev,
      sidebar: { ...prev.sidebar, width: clamped },
    }));
  };

  const setSidebarHeight = (height: number) => {
    const clamped = Math.max(50, Math.min(130, Math.round(height)));
    persistOrDraft((prev) => ({
      ...prev,
      sidebar: { ...prev.sidebar, height: clamped },
    }));
  };

  const setSidebarTopVariant = (variant: "compact" | "full") => {
    persistOrDraft((prev) => ({
      ...prev,
      sidebar: { ...prev.sidebar, topVariant: variant },
    }));
  };

  const setPlayerPosition = (pos: "bottom" | "top" | "left" | "right") => {
    persistOrDraft((prev) => ({
      ...prev,
      player: { ...prev.player, position: pos },
    }));
  };

  const setPlayerStyle = (style: ComponentStyle) => {
    persistOrDraft((prev) => ({
      ...prev,
      player: { ...prev.player, style },
    }));
  };

  const setPlayerHeight = (height: number) => {
    const clamped = Math.max(68, Math.min(120, Math.round(height)));
    persistOrDraft((prev) => ({
      ...prev,
      player: { ...prev.player, height: clamped },
    }));
  };

  const setPlayerWidthPercent = (widthPercent: number) => {
    const clamped = Math.max(50, Math.min(100, Math.round(widthPercent)));
    persistOrDraft((prev) => ({
      ...prev,
      player: { ...prev.player, widthPercent: clamped },
    }));
  };

  const setPlayerOptions = (options: { largeIcons?: boolean; hideDetails?: boolean }) => {
    persistOrDraft((prev) => ({
      ...prev,
      player: {
        ...prev.player,
        ...(options.largeIcons !== undefined ? { largeIcons: options.largeIcons } : {}),
        ...(options.hideDetails !== undefined ? { hideDetails: options.hideDetails } : {}),
      },
    }));
  };

  const setQueuePosition = (pos: "right" | "left" | "bottom") => {
    persistOrDraft((prev) => ({
      ...prev,
      player: { ...prev.player, queuePosition: pos },
    }));
  };

  const setMiniPlayerPreset = (preset: "full" | "rounded" | "hybrid" | "deck") => {
    persistOrDraft((prev) => ({
      ...prev,
      player: { ...prev.player, miniPlayerPreset: preset },
    }));
  };

  const setMiniPlayerBg = (bg: "theme" | "artwork" | "dominant") => {
    persistOrDraft((prev) => ({
      ...prev,
      player: { ...prev.player, miniPlayerBg: bg },
    }));
  };

  const setMiniPlayerShape = (shape: "default" | "capsule") => {
    persistOrDraft((prev) => ({
      ...prev,
      player: { ...prev.player, miniPlayerShape: shape },
    }));
  };

  const setBorderRadius = (preset: BorderRadiusPreset) => {
    persistOrDraft((prev) => ({
      ...prev,
      borderRadius: preset,
    }));
  };

  const setBlockWidth = (id: string, width: BlockWidth) => {
    persistOrDraft((prev) => ({
      ...prev,
      home: {
        ...prev.home,
        blockWidths: {
          ...prev.home.blockWidths,
          [id]: width,
        },
      },
    }));
  };

  const setBlockCanvasPos = (id: string, pos: Partial<BlockCanvasPos>) => {
    persistOrDraft((prev) => {
      const current = prev.home.canvasPositions?.[id] || { x: 0, y: 0, w: "100%", widthPreset: "full" };
      return {
        ...prev,
        home: {
          ...prev.home,
          canvasPositions: {
            ...prev.home.canvasPositions,
            [id]: {
              ...current,
              ...pos,
            },
          },
        },
      };
    });
  };

  const toggleSectionLayoutMode = (rowIndex: number) => {
    persistOrDraft((prev) => {
      const current = prev.home.freeLayoutSections || [];
      const isFree = current.includes(rowIndex);
      return {
        ...prev,
        home: {
          ...prev.home,
          freeLayoutSections: isFree ? current.filter(i => i !== rowIndex) : [...current, rowIndex],
        },
      };
    });
  };

  const resetSectionOffsets = (rowIndex: number) => {
    persistOrDraft((prev) => {
      const row = prev.home.rows?.[rowIndex] || [];
      const updatedCanvasPositions = { ...(prev.home.canvasPositions || {}) };
      for (const blockId of row) {
        if (updatedCanvasPositions[blockId]) {
          updatedCanvasPositions[blockId] = {
            ...updatedCanvasPositions[blockId],
            offsetX: 0,
            x: 0,
          };
        }
      }
      return {
        ...prev,
        home: {
          ...prev.home,
          canvasPositions: updatedCanvasPositions,
        },
      };
    });
  };

  const toggleSidebarPosition = () => {
    const current = activeConfig.sidebar.position;
    const next =
      current === "left" ? "right" : current === "right" ? "top" : current === "top" ? "bottom" : "left";
    setSidebarPosition(next);
  };

  const moveBlock = (id: string, direction: "up" | "down") => {
    updateDraft((prev) => {
      const order = [...prev.home.blockOrder];
      const idx = order.indexOf(id);
      if (idx === -1) return prev;
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= order.length) return prev;
      const temp = order[idx];
      order[idx] = order[targetIdx];
      order[targetIdx] = temp;
      return {
        ...prev,
        home: {
          ...prev.home,
          blockOrder: order,
        },
      };
    });
  };

  const reorderBlocks = (sourceId: string, targetId: string) => {
    if (sourceId === targetId) return;
    updateDraft((prev) => {
      const order = [...prev.home.blockOrder];
      const fromIdx = order.indexOf(sourceId);
      const toIdx = order.indexOf(targetId);
      if (fromIdx === -1 || toIdx === -1) return prev;
      order.splice(fromIdx, 1);
      order.splice(toIdx, 0, sourceId);
      return {
        ...prev,
        home: {
          ...prev.home,
          blockOrder: order,
        },
      };
    });
  };

  const toggleBlockVisibility = (id: string) => {
    updateDraft((prev) => {
      const isHidden = prev.home.hiddenBlocks.includes(id);
      const hidden = isHidden
        ? prev.home.hiddenBlocks.filter((b) => b !== id)
        : [...prev.home.hiddenBlocks, id];
      return {
        ...prev,
        home: {
          ...prev.home,
          hiddenBlocks: hidden,
        },
      };
    });
  };

  const moveBlockRow = (id: string, direction: "up" | "down") => {
    persistOrDraft((prev) => {
      let rows = (prev.home.rows || [["header"], ["wave"], ["playlists", "recent"], ["library"]]).map((r) => [...r]);
      const r = rows.findIndex((row) => row.includes(id));
      if (r === -1) return prev;

      if (direction === "up") {
        if (r === 0) return prev;
        if (rows[r].length > 1) {
          rows[r] = rows[r].filter((b) => b !== id);
          rows.splice(r, 0, [id]);
        } else {
          const temp = rows[r];
          rows[r] = rows[r - 1];
          rows[r - 1] = temp;
        }
      } else {
        if (rows[r].length > 1) {
          rows[r] = rows[r].filter((b) => b !== id);
          rows.splice(r + 1, 0, [id]);
        } else {
          if (r < rows.length - 1) {
            const temp = rows[r];
            rows[r] = rows[r + 1];
            rows[r + 1] = temp;
          } else {
            return prev;
          }
        }
      }

      rows = rows.filter((row) => row.length > 0);
      return {
        ...prev,
        home: {
          ...prev.home,
          rows,
          blockOrder: rows.flat(),
        },
      };
    });
  };

  const shiftBlockInRow = (id: string, direction: "left" | "right") => {
    persistOrDraft((prev) => {
      const rows = (prev.home.rows || [["header"], ["wave"], ["playlists", "recent"], ["library"]]).map((r) => [...r]);
      const r = rows.findIndex((row) => row.includes(id));
      if (r === -1) return prev;

      const currentRow = rows[r];
      if (currentRow.length > 1) {
        const idx = currentRow.indexOf(id);
        const targetIdx = direction === "left" ? idx - 1 : idx + 1;
        if (targetIdx >= 0 && targetIdx < currentRow.length) {
          const temp = currentRow[idx];
          currentRow[idx] = currentRow[targetIdx];
          currentRow[targetIdx] = temp;
          return {
            ...prev,
            home: {
              ...prev.home,
              rows,
              blockOrder: rows.flat(),
            },
          };
        }
        return prev;
      }

      const currentAlign = prev.home.blockAligns?.[id] || "left";
      const alignCycle: BlockAlign[] = ["left", "center", "right"];
      let curIdx = alignCycle.indexOf(currentAlign);
      if (curIdx === -1) curIdx = 0;
      let nextIdx = direction === "left" ? curIdx - 1 : curIdx + 1;
      if (nextIdx < 0) nextIdx = 0;
      if (nextIdx >= alignCycle.length) nextIdx = alignCycle.length - 1;

      return {
        ...prev,
        home: {
          ...prev.home,
          blockAligns: {
            ...prev.home.blockAligns,
            [id]: alignCycle[nextIdx],
          },
        },
      };
    });
  };

  const setBlockAlign = (id: string, align: BlockAlign) => {
    persistOrDraft((prev) => ({
      ...prev,
      home: {
        ...prev.home,
        blockAligns: {
          ...prev.home.blockAligns,
          [id]: align,
        },
      },
    }));
  };

  const separateBlockToNewRow = (id: string) => {
    persistOrDraft((prev) => {
      let rows = (prev.home.rows || [["header"], ["wave"], ["playlists", "recent"], ["library"]]).map((r) => [...r]);
      const r = rows.findIndex((row) => row.includes(id));
      if (r === -1 || rows[r].length <= 1) return prev;
      rows[r] = rows[r].filter((b) => b !== id);
      rows.splice(r + 1, 0, [id]);
      rows = rows.filter((row) => row.length > 0);
      return {
        ...prev,
        home: {
          ...prev.home,
          rows,
          blockOrder: rows.flat(),
        },
      };
    });
  };

  const joinBlockWithRowAbove = (id: string) => {
    persistOrDraft((prev) => {
      let rows = (prev.home.rows || [["header"], ["wave"], ["playlists", "recent"], ["library"]]).map((r) => [...r]);
      const r = rows.findIndex((row) => row.includes(id));
      if (r <= 0) return prev;
      rows[r] = rows[r].filter((b) => b !== id);
      rows[r - 1].push(id);
      rows = rows.filter((row) => row.length > 0);
      return {
        ...prev,
        home: {
          ...prev.home,
          rows,
          blockOrder: rows.flat(),
        },
      };
    });
  };

  const addSection = () => {
    persistOrDraft((prev) => {
      const currentRows = (prev.home.rows || [["header"], ["wave"], ["playlists", "recent"], ["library"], []]).map((r) => [...r]);
      return {
        ...prev,
        home: {
          ...prev.home,
          rows: [...currentRows, []],
        },
      };
    });
  };

  const removeSection = (sectionIndex: number) => {
    persistOrDraft((prev) => {
      const currentRows = (prev.home.rows || [["header"], ["wave"], ["playlists", "recent"], ["library"], []]).map((r) => [...r]);
      if (sectionIndex < 0 || sectionIndex >= currentRows.length) return prev;

      const removedBlocks = currentRows[sectionIndex];
      currentRows.splice(sectionIndex, 1);

      if (removedBlocks.length > 0) {
        const targetIdx = Math.max(0, sectionIndex - 1);
        if (currentRows[targetIdx]) {
          currentRows[targetIdx].push(...removedBlocks);
        } else {
          currentRows.push(removedBlocks);
        }
      }

      if (currentRows.length === 0) {
        currentRows.push([]);
      }

      return {
        ...prev,
        home: {
          ...prev.home,
          rows: currentRows,
          blockOrder: currentRows.flat(),
        },
      };
    });
  };

  const movePanel = (panelId: string, targetSectionIndex: number, targetSlotIndex?: number) => {
    persistOrDraft((prev) => {
      let currentRows = (prev.home.rows || [["header"], ["wave"], ["playlists", "recent"], ["library"], []]).map((r) => [...r]);

      while (currentRows.length <= targetSectionIndex) {
        currentRows.push([]);
      }

      const sourceRowIndex = currentRows.findIndex((r) => r.includes(panelId));
      let sourceSlotIndex = -1;
      if (sourceRowIndex >= 0) {
        sourceSlotIndex = currentRows[sourceRowIndex].indexOf(panelId);
      }

      if (sourceRowIndex === targetSectionIndex && sourceSlotIndex >= 0 && typeof targetSlotIndex === "number") {
        const row = [...currentRows[targetSectionIndex]];
        row.splice(sourceSlotIndex, 1);
        let adjustedTarget = targetSlotIndex;
        if (sourceSlotIndex < targetSlotIndex) {
          adjustedTarget = targetSlotIndex - 1;
        }
        if (adjustedTarget < 0) adjustedTarget = 0;
        if (adjustedTarget > row.length) adjustedTarget = row.length;
        row.splice(adjustedTarget, 0, panelId);
        currentRows[targetSectionIndex] = row;
      } else {
        currentRows = currentRows.map((r) => r.filter((id) => id !== panelId));
        const targetRow = currentRows[targetSectionIndex] || [];
        if (typeof targetSlotIndex === "number" && targetSlotIndex >= 0 && targetSlotIndex <= targetRow.length) {
          targetRow.splice(targetSlotIndex, 0, panelId);
        } else {
          targetRow.push(panelId);
        }
        currentRows[targetSectionIndex] = targetRow;
      }

      const hidden = (prev.home.hiddenBlocks || []).filter((b) => b !== panelId);
      const order = currentRows.flat();
      const updatedBlockWidths = { ...(prev.home.blockWidths || {}) };

      // If the target section now has multiple blocks, make sure they don't force each other to wrap onto separate lines
      if (currentRows[targetSectionIndex].length > 1) {
        for (const bid of currentRows[targetSectionIndex]) {
          if (!updatedBlockWidths[bid] || updatedBlockWidths[bid] === "full") {
            updatedBlockWidths[bid] = "half";
          }
        }
      }

      return {
        ...prev,
        home: {
          ...prev.home,
          rows: currentRows,
          blockOrder: order,
          hiddenBlocks: hidden,
          blockWidths: updatedBlockWidths,
        },
      };
    });
  };

  const deleteBlock = (id: string) => {
    persistOrDraft((prev) => {
      const rows = (prev.home.rows || []).map((r) => r.filter((b) => b !== id));
      return {
        ...prev,
        home: {
          ...prev.home,
          blockOrder: prev.home.blockOrder.filter((b) => b !== id),
          rows,
        },
      };
    });
  };

  const addBlock = (id: string, targetSectionIndex?: number) => {
    persistOrDraft((prev) => {
      let rows = (prev.home.rows || [["header"], ["wave"], ["playlists", "recent"], ["library"], []]).map((r) => [...r]);
      rows = rows.map((r) => r.filter((b) => b !== id));

      if (typeof targetSectionIndex === "number" && targetSectionIndex >= 0 && targetSectionIndex < rows.length) {
        rows[targetSectionIndex].push(id);
      } else {
        const emptyIdx = rows.findIndex((r) => r.length === 0);
        if (emptyIdx !== -1) {
          rows[emptyIdx].push(id);
        } else {
          rows.push([id]);
        }
      }

      const order = rows.flat();
      const hidden = (prev.home.hiddenBlocks || []).filter((b) => b !== id);

      return {
        ...prev,
        home: {
          ...prev.home,
          blockOrder: order,
          hiddenBlocks: hidden,
          rows,
        },
      };
    });
  };

  const setBlockGridColumns = (id: string, cols: number) => {
    updateDraft((prev) => ({
      ...prev,
      home: {
        ...prev.home,
        gridColumns: {
          ...prev.home.gridColumns,
          [id]: cols,
        },
      },
    }));
  };

  const applyPreset = (preset: ThemePreset) => {
    updateThemeDirectly({
      accentColor: preset.accentColor,
      appBgColor: preset.appBgColor,
      sidebarBgColor: preset.sidebarBgColor,
      playerBgColor: preset.playerBgColor,
      cardBgColor: preset.cardBgColor,
      textColor: preset.textColor,
      glassMode: preset.glassMode,
      glassOpacity: preset.glassOpacity,
      ...(preset.wallpaperData !== undefined ? { wallpaperData: preset.wallpaperData } : {}),
      ...(preset.wallpaperBlur !== undefined ? { wallpaperBlur: preset.wallpaperBlur } : {}),
      ...(preset.wallpaperDim !== undefined ? { wallpaperDim: preset.wallpaperDim } : {}),
    });
    if (preset.borderRadius) {
      setBorderRadius(preset.borderRadius);
    }
  };

  const saveToUserSlot = (slotIndex: number, customName?: string) => {
    if (slotIndex < 0 || slotIndex >= 3) return;
    const slotName = customName?.trim() || `Пользовательский пресет ${slotIndex + 1}`;
    const newPreset: ThemePreset = {
      id: `user_slot_${slotIndex + 1}`,
      name: slotName,
      desc: `Сохранено ${new Date().toLocaleDateString()}`,
      accentColor: activeConfig.theme.accentColor,
      appBgColor: activeConfig.theme.appBgColor,
      sidebarBgColor: activeConfig.theme.sidebarBgColor,
      playerBgColor: activeConfig.theme.playerBgColor,
      cardBgColor: activeConfig.theme.cardBgColor,
      textColor: activeConfig.theme.textColor,
      glassMode: activeConfig.theme.glassMode,
      glassOpacity: activeConfig.theme.glassOpacity,
      wallpaperData: activeConfig.theme.wallpaperData,
      wallpaperBlur: activeConfig.theme.wallpaperBlur,
      wallpaperDim: activeConfig.theme.wallpaperDim,
      borderRadius: activeConfig.borderRadius,
    };

    const nextPresets = [...userPresets];
    nextPresets[slotIndex] = newPreset;
    setUserPresets(nextPresets);
    try {
      localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(nextPresets));
    } catch {}
  };

  const deleteUserSlot = (slotIndex: number) => {
    if (slotIndex < 0 || slotIndex >= 3) return;
    const nextPresets = [...userPresets];
    nextPresets[slotIndex] = null;
    setUserPresets(nextPresets);
    try {
      localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(nextPresets));
    } catch {}
  };

  const loadFromUserSlot = (slotIndex: number) => {
    const p = userPresets[slotIndex];
    if (p) applyPreset(p);
  };

  const isPreviewActive = previewPreset !== null;

  const startPreview = (preset: ThemePreset) => {
    setPrePreviewConfig(JSON.parse(JSON.stringify(savedConfig)));
    setPreviewPreset(preset);
    applyPreset(preset);
  };

  const applyPreview = () => {
    if (previewPreset) {
      applyPreset(previewPreset);
    }
    setPreviewPreset(null);
    setPrePreviewConfig(null);
  };

  const cancelPreview = () => {
    if (prePreviewConfig) {
      setSavedConfig(prePreviewConfig);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(prePreviewConfig));
      } catch {}
    }
    setPreviewPreset(null);
    setPrePreviewConfig(null);
  };

  const resetToDefaults = () => {
    setDraftConfig(JSON.parse(JSON.stringify(DEFAULT_CUSTOMIZATION)));
    if (!isEditMode) {
      setSavedConfig(DEFAULT_CUSTOMIZATION);
      try { localStorage.removeItem(STORAGE_KEY); } catch {}
    }
  };

  return (
    <CustomizationContext.Provider
      value={{
        config: activeConfig,
        isEditMode,
        enterEditMode,
        saveEditMode,
        cancelEditMode,
        updateDraft,
        updateThemeDirectly,
        setSidebarPosition,
        setSidebarStyle,
        setSidebarWidth,
        setSidebarHeight,
        setSidebarTopVariant,
        setPlayerPosition,
        setPlayerStyle,
        setPlayerHeight,
        setPlayerWidthPercent,
        setPlayerOptions,
        setQueuePosition,
        setMiniPlayerPreset,
        setMiniPlayerBg,
        setMiniPlayerShape,
        isQueueOpen,
        setIsQueueOpen,
        toggleQueue,
        isPreviewActive,
        previewPreset,
        startPreview,
        applyPreview,
        cancelPreview,
        setBorderRadius,
        setBlockWidth,
        setBlockAlign,
        setBlockCanvasPos,
        toggleSectionLayoutMode,
        resetSectionOffsets,
        toggleSidebarPosition,
        moveBlock,
        moveBlockRow,
        shiftBlockInRow,
        separateBlockToNewRow,
        joinBlockWithRowAbove,
        reorderBlocks,
        addSection,
        removeSection,
        movePanel,
        toggleBlockVisibility,
        deleteBlock,
        addBlock,
        isAddModalOpen,
        setIsAddModalOpen,
        setBlockGridColumns,
        applyPreset,
        userPresets,
        saveToUserSlot,
        loadFromUserSlot,
        deleteUserSlot,
        resetToDefaults,
        activeDragTarget,
        setActiveDragTarget,
        activeDropZone,
        setActiveDropZone,
      }}
    >
      {children}
    </CustomizationContext.Provider>
  );
}

export function useCustomization() {
  const ctx = useContext(CustomizationContext);
  if (!ctx) {
    throw new Error("useCustomization must be used within CustomizationProvider");
  }
  return ctx;
}
