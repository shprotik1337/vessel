import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

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
}

export type BorderRadiusPreset = "sharp" | "small" | "medium" | "round";
export type BlockWidth = "third" | "half" | "two-thirds" | "full";
export type BlockAlign = "left" | "center" | "right";
export type ComponentStyle = "dock" | "compact" | "round" | "floating" | "island";

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
}

export const BUILTIN_THEMES: ThemePreset[] = [
  {
    id: "neutral",
    name: "Neutral",
    desc: "Сбалансированная тёмно-серая палитра",
    accentColor: "#ffffff",
    secondaryColor: "#2b2d31",
    appBgColor: "#0b0b0c",
    sidebarBgColor: "#141416",
    playerBgColor: "#141416",
    cardBgColor: "#1c1c1f",
    textColor: "#f4f4f5",
    glassMode: true,
    glassOpacity: 0.72,
  },
  {
    id: "amoled",
    name: "AMOLED",
    desc: "Максимально глубокий чёрный для OLED-экранов",
    accentColor: "#ffffff",
    secondaryColor: "#000000",
    appBgColor: "#000000",
    sidebarBgColor: "#000000",
    playerBgColor: "#000000",
    cardBgColor: "#000000",
    textColor: "#ffffff",
    glassMode: false,
    glassOpacity: 1,
    ambientMode: "off",
  },
  {
    id: "crimson",
    name: "Crimson",
    desc: "Энергичный рубиновый акцент",
    accentColor: "#ef4444",
    secondaryColor: "#991b1b",
    appBgColor: "#0f0808",
    sidebarBgColor: "#170c0c",
    playerBgColor: "#170c0c",
    cardBgColor: "#221111",
    textColor: "#fef2f2",
    glassMode: true,
    glassOpacity: 0.72,
  },
  {
    id: "nord",
    name: "Nord",
    desc: "Ледяной нордический лазурный стиль",
    accentColor: "#38bdf8",
    secondaryColor: "#0369a1",
    appBgColor: "#060f17",
    sidebarBgColor: "#0a1724",
    playerBgColor: "#0a1724",
    cardBgColor: "#102336",
    textColor: "#f0f9ff",
    glassMode: true,
    glassOpacity: 0.72,
  },
  {
    id: "sky",
    name: "Sky",
    desc: "Небесно-голубой чистый оттенок",
    accentColor: "#60a5fa",
    secondaryColor: "#1d4ed8",
    appBgColor: "#070d18",
    sidebarBgColor: "#0c1527",
    playerBgColor: "#0c1527",
    cardBgColor: "#13203b",
    textColor: "#eff6ff",
    glassMode: true,
    glassOpacity: 0.72,
  },
  {
    id: "mint",
    name: "Mint",
    desc: "Свежая мятная изумрудная палитра",
    accentColor: "#34d399",
    secondaryColor: "#047857",
    appBgColor: "#06130e",
    sidebarBgColor: "#0b1f17",
    playerBgColor: "#0b1f17",
    cardBgColor: "#112e23",
    textColor: "#ecfdf5",
    glassMode: true,
    glassOpacity: 0.72,
  },
  {
    id: "violet",
    name: "Violet",
    desc: "Насыщенный благородный фиолетовый",
    accentColor: "#a855f7",
    secondaryColor: "#6b21a8",
    appBgColor: "#0e0717",
    sidebarBgColor: "#170c26",
    playerBgColor: "#170c26",
    cardBgColor: "#24143b",
    textColor: "#faf5ff",
    glassMode: true,
    glassOpacity: 0.72,
  },
  {
    id: "blossom",
    name: "Blossom",
    desc: "Яркий неоново-розовый акцент",
    accentColor: "#f472b6",
    secondaryColor: "#be185d",
    appBgColor: "#140810",
    sidebarBgColor: "#200d1a",
    playerBgColor: "#200d1a",
    cardBgColor: "#301327",
    textColor: "#fdf2f8",
    glassMode: true,
    glassOpacity: 0.72,
  },
  {
    id: "sakura",
    name: "Sakura",
    desc: "Нежные лепестки сакуры",
    accentColor: "#fb7185",
    secondaryColor: "#be123c",
    appBgColor: "#14080a",
    sidebarBgColor: "#220c10",
    playerBgColor: "#220c10",
    cardBgColor: "#331218",
    textColor: "#fff1f2",
    glassMode: true,
    glassOpacity: 0.72,
  },
  {
    id: "terminal",
    name: "Terminal",
    desc: "Киберпанк и матричный зелёный",
    accentColor: "#22c55e",
    secondaryColor: "#15803d",
    appBgColor: "#051208",
    sidebarBgColor: "#0a1d0d",
    playerBgColor: "#0a1d0d",
    cardBgColor: "#0f2c14",
    textColor: "#f0fdf4",
    glassMode: true,
    glassOpacity: 0.72,
  },
  {
    id: "aqua",
    name: "Aqua",
    desc: "Глубокая морская бирюза",
    accentColor: "#06b6d4",
    secondaryColor: "#0e7490",
    appBgColor: "#051114",
    sidebarBgColor: "#091b20",
    playerBgColor: "#091b20",
    cardBgColor: "#0e2930",
    textColor: "#ecfeff",
    glassMode: true,
    glassOpacity: 0.72,
  },
  {
    id: "sunset",
    name: "Sunset",
    desc: "Тёплый закатный оранжевый",
    accentColor: "#f97316",
    secondaryColor: "#c2410c",
    appBgColor: "#130904",
    sidebarBgColor: "#1f0f06",
    playerBgColor: "#1f0f06",
    cardBgColor: "#2e1609",
    textColor: "#fff7ed",
    glassMode: true,
    glassOpacity: 0.72,
  },
  {
    id: "slate",
    name: "Slate",
    desc: "Строгий матовый металлик",
    accentColor: "#94a3b8",
    secondaryColor: "#475569",
    appBgColor: "#0a0e14",
    sidebarBgColor: "#101620",
    playerBgColor: "#101620",
    cardBgColor: "#17202e",
    textColor: "#f8fafc",
    glassMode: true,
    glassOpacity: 0.72,
  },
];

export const DEFAULT_CUSTOMIZATION: CustomizationConfig = {
  borderRadius: "medium",
  sidebar: {
    position: "top",
    style: "floating",
    width: 76,
    height: 58,
    collapsed: false,
    topVariant: "compact",
    variant: "compact",
    autoHide: false,
  },
  player: {
    position: "bottom",
    style: "floating",
    height: 96,
    widthPercent: 100,
    largeIcons: false,
    hideDetails: false,
    showMiniPlayer: false,
    queuePosition: "right",
    fullscreenMode: "both",
    fullscreenFollowTrack: true,
    fullscreenLyricsPosition: "right",
    miniPlayerBg: "theme",
    miniPlayerShape: "default",
  },
  home: {
    blockOrder: ["wave", "recommendations", "mixes", "explore", "library"],
    hiddenBlocks: [],
    rows: [
      ["wave"],
      ["recommendations"],
      ["mixes"],
      ["explore"],
      ["library"],
      [],
    ],
    blockWidths: {
      wave: "full",
      recommendations: "full",
      mixes: "full",
      explore: "full",
      library: "full",
      header: "full",
      playlists: "full",
      recent: "full",
    },
    blockAligns: {
      wave: "left",
      recommendations: "left",
      mixes: "left",
      explore: "left",
      library: "left",
      header: "left",
      playlists: "left",
      recent: "left",
    },
    gridColumns: {
      recommendations: 5,
      mixes: 4,
      explore: 4,
      library: 1,
      recent: 4,
      playlists: 3,
    },
    canvasPositions: {
      wave: { x: 0, y: 0, w: "100%", widthPreset: "full", offsetX: 0 },
      recommendations: { x: 0, y: 160, w: "100%", widthPreset: "full", offsetX: 0 },
      mixes: { x: 0, y: 440, w: "100%", widthPreset: "full", offsetX: 0 },
      explore: { x: 0, y: 720, w: "100%", widthPreset: "full", offsetX: 0 },
      library: { x: 0, y: 1100, w: "100%", widthPreset: "full", offsetX: 0 },
    },
    freeLayoutSections: [],
  },
  theme: {
    accentColor: "#ffffff",
    secondaryColor: "#000000",
    appBgColor: "#000000",
    sidebarBgColor: "#000000",
    playerBgColor: "#000000",
    cardBgColor: "#000000",
    textColor: "#ffffff",
    wallpaperData: null,
    wallpaperBlur: 0,
    wallpaperDim: 0,
    glassMode: true,
    glassOpacity: 0.5,
    glassForce: 65,
    windowOpacity: 50,
    backdropBlur: 15,
    trackRowOpacity: 0,
    trackRowActiveOpacity: 0.08,
    trackRowActiveStyle: "glass",
    ambientMode: "dynamic",
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
  { id: "wave", title: "Моя волна", defaultWidth: "full" as BlockWidth },
  { id: "recommendations", title: "Рекомендации", defaultWidth: "full" as BlockWidth },
  { id: "mixes", title: "Персональные миксы", defaultWidth: "full" as BlockWidth },
  { id: "explore", title: "Возможно, вам понравится", defaultWidth: "full" as BlockWidth },
  { id: "library", title: "Из вашей библиотеки", defaultWidth: "full" as BlockWidth },
  { id: "recent", title: "Продолжить прослушивание", defaultWidth: "full" as BlockWidth },
  { id: "playlists", title: "Плейлисты", defaultWidth: "full" as BlockWidth },
  { id: "header", title: "Приветствие и статус", defaultWidth: "full" as BlockWidth },
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
    : "top";
  const validSidebarStyles: ComponentStyle[] = ["dock", "compact", "round", "floating", "island"];
  const sidebarStyle: ComponentStyle = validSidebarStyles.includes(raw.sidebar?.style)
    ? raw.sidebar.style
    : "floating";
  const sidebarAutoHide = Boolean(raw.sidebar?.autoHide);
  const sidebarWidth =
    typeof raw.sidebar?.width === "number" && !isNaN(raw.sidebar.width)
      ? Math.max(160, Math.min(360, raw.sidebar.width))
      : 232;
  const sidebarHeight =
    typeof raw.sidebar?.height === "number" && !isNaN(raw.sidebar.height)
      ? Math.max(50, Math.min(130, raw.sidebar.height))
      : 58;
  const sidebarCollapsed = Boolean(raw.sidebar?.collapsed);
  const horizontalNavButtons = Array.isArray(raw.sidebar?.horizontalNavButtons)
    ? raw.sidebar.horizontalNavButtons.filter((b: any) => typeof b === "string")
    : ["player", "home", "wave", "search", "favorites", "playlists", "recent", "queue"];

  const validPlayerPositions = ["bottom", "top", "left", "right"] as const;
  const playerPos = validPlayerPositions.includes(raw.player?.position)
    ? raw.player.position
    : "bottom";
  const playerStyle: ComponentStyle =
    raw.player?.style === "dock" ? "dock" : "floating";
  const playerHeight =
    typeof raw.player?.height === "number" && !isNaN(raw.player.height)
      ? Math.max(68, Math.min(120, raw.player.height))
      : 96;
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

  const validMiniPlayerPresets = ["default", "compact", "minimal", "expanded"] as const;
  const miniPlayerPreset = validMiniPlayerPresets.includes(raw.player?.miniPlayerPreset)
    ? raw.player.miniPlayerPreset
    : "default";

  const showMiniPlayer = raw.player?.showMiniPlayer === true;
  const validFsModes = ["both", "lyrics", "cover"] as const;
  const fullscreenMode = validFsModes.includes(raw.player?.fullscreenMode)
    ? raw.player.fullscreenMode
    : "both";
  const fullscreenFollowTrack = raw.player?.fullscreenFollowTrack !== false;

  const validFsLyricsPositions = ["right", "left"] as const;
  const fullscreenLyricsPosition = validFsLyricsPositions.includes(raw.player?.fullscreenLyricsPosition)
    ? raw.player.fullscreenLyricsPosition
    : "right";

  const validMiniPlayerBgs = ["solid", "theme", "artwork", "dominant", "dense_glass"] as const;
  const rawMiniPlayerBg = raw.player?.miniPlayerBg;
  const miniPlayerBg = (rawMiniPlayerBg === "blur" || !rawMiniPlayerBg || !validMiniPlayerBgs.includes(rawMiniPlayerBg))
    ? "theme"
    : rawMiniPlayerBg;

  const validMiniPlayerShapes = ["default", "capsule"] as const;
  const miniPlayerShape = validMiniPlayerShapes.includes(raw.player?.miniPlayerShape)
    ? raw.player.miniPlayerShape
    : "default";

  const defaultOrder = ["wave", "recommendations", "mixes", "explore", "library"];
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
    wave: "full",
    recommendations: "full",
    mixes: "full",
    explore: "full",
    library: "full",
    header: "full",
    recent: "full",
    playlists: "full",
  };
  if (typeof raw.home?.blockWidths === "object" && raw.home.blockWidths !== null) {
    for (const [k, v] of Object.entries(raw.home.blockWidths)) {
      if (typeof v === "string" && validWidths.includes(v as BlockWidth)) {
        blockWidths[k] = v as BlockWidth;
      }
    }
  }

  const gridColumns = {
    recommendations: 5,
    mixes: 4,
    explore: 4,
    library: 1,
    recent: 4,
    playlists: 3,
  };
  if (typeof raw.home?.gridColumns === "object" && raw.home?.gridColumns !== null) {
    if (typeof raw.home.gridColumns.recent === "number") gridColumns.recent = raw.home.gridColumns.recent;
    if (typeof raw.home.gridColumns.playlists === "number") gridColumns.playlists = raw.home.gridColumns.playlists;
    if (typeof raw.home.gridColumns.library === "number") gridColumns.library = raw.home.gridColumns.library;
  }

  const sidebarTopVariant = raw.sidebar?.topVariant === "compact" ? "compact" : "full";
  const sidebarVariant = raw.sidebar?.variant === "compact" ? "compact" : "standard";

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
    accentColor: typeof raw.theme?.accentColor === "string" ? raw.theme.accentColor : "#ffffff",
    appBgColor: typeof raw.theme?.appBgColor === "string" ? raw.theme.appBgColor : "#000000",
    sidebarBgColor: typeof raw.theme?.sidebarBgColor === "string" ? raw.theme.sidebarBgColor : "#000000",
    playerBgColor: typeof raw.theme?.playerBgColor === "string" ? raw.theme.playerBgColor : "#000000",
    cardBgColor: typeof raw.theme?.cardBgColor === "string" ? raw.theme.cardBgColor : "#000000",
    textColor: typeof raw.theme?.textColor === "string" ? raw.theme.textColor : "#ffffff",
    wallpaperData: typeof raw.theme?.wallpaperData === "string" ? raw.theme.wallpaperData : null,
    wallpaperBlur: typeof raw.theme?.wallpaperBlur === "number" ? raw.theme.wallpaperBlur : 0,
    wallpaperDim: typeof raw.theme?.wallpaperDim === "number" ? raw.theme.wallpaperDim : 0,
    glassMode: raw.theme?.glassMode !== undefined ? Boolean(raw.theme.glassMode) : true,
    glassOpacity: typeof raw.theme?.glassOpacity === "number" ? raw.theme.glassOpacity : 0.5,
    trackRowOpacity: typeof raw.theme?.trackRowOpacity === "number" ? Math.max(0, Math.min(1, raw.theme.trackRowOpacity)) : 0,
    trackRowActiveOpacity: typeof raw.theme?.trackRowActiveOpacity === "number" ? Math.max(0, Math.min(1, raw.theme.trackRowActiveOpacity)) : 0.08,
    trackRowActiveStyle: (raw.theme?.trackRowActiveStyle === "accent" || raw.theme?.trackRowActiveStyle === "dark")
      ? raw.theme.trackRowActiveStyle
      : "glass",
    ambientMode: (raw.theme?.ambientMode === "theme" || raw.theme?.ambientMode === "dynamic" || raw.theme?.ambientMode === "off")
      ? raw.theme.ambientMode
      : "dynamic",
    windowOpacity: typeof raw.theme?.windowOpacity === "number" ? Math.max(0, Math.min(100, raw.theme.windowOpacity)) : 50,
    glassForce: typeof raw.theme?.glassForce === "number" ? Math.max(0, Math.min(100, raw.theme.glassForce)) : 65,
    backdropBlur: typeof raw.theme?.backdropBlur === "number" ? Math.max(0, Math.min(40, raw.theme.backdropBlur)) : 15,
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
      variant: sidebarVariant,
      horizontalNavButtons,
      autoHide: sidebarAutoHide,
    },
    player: {
      position: playerPos,
      style: playerStyle,
      height: playerHeight,
      widthPercent: playerWidthPercent,
      largeIcons: playerLargeIcons,
      hideDetails: playerHideDetails,
      showMiniPlayer,
      queuePosition,
      fullscreenMode,
      fullscreenFollowTrack,
      fullscreenLyricsPosition,
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
    const trowAlpha = typeof theme.trackRowOpacity === "number" ? Math.max(0, Math.min(1, theme.trackRowOpacity)) : 0;
    root.style.setProperty("--trow-bg-opacity", `${trowAlpha}`);
    const trowBg = trowAlpha > 0 ? hexToRgba(theme.cardBgColor, trowAlpha * 0.95) : "transparent";
    const trowBorder = trowAlpha > 0 ? `rgba(255, 255, 255, ${trowAlpha * 0.08})` : "transparent";
    root.style.setProperty("--trow-bg", trowBg);
    root.style.setProperty("--trow-border", trowBorder);
    const trowActiveAlpha = typeof theme.trackRowActiveOpacity === "number" ? Math.max(0, Math.min(1, theme.trackRowActiveOpacity)) : 0.08;
    root.style.setProperty("--trow-active-opacity", `${trowActiveAlpha}`);

    const activeStyle = theme.trackRowActiveStyle || "glass";
    let activeBg = `rgba(255, 255, 255, ${trowActiveAlpha})`;
    let activeBorder = "transparent";

    if (activeStyle === "accent") {
      activeBg = hexToRgba(theme.accentColor, trowActiveAlpha);
      activeBorder = hexToRgba(theme.accentColor, Math.min(1, trowActiveAlpha * 1.5));
    } else if (activeStyle === "dark") {
      activeBg = `rgba(0, 0, 0, ${trowActiveAlpha})`;
      activeBorder = "transparent";
    }

    root.style.setProperty("--trow-now-bg", activeBg);
    root.style.setProperty("--trow-now-border", activeBorder);

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
    const playerRadius = player.miniPlayerShape === "capsule" ? "9999px" : "16px";
    root.style.setProperty("--radius-player", playerRadius);
    const isCompactRail = sidebar.variant === "compact";
    const effectiveSidebarWidth = isCompactRail ? 76 : (sidebar.width || 232);
    root.style.setProperty("--sidebar-width", `${effectiveSidebarWidth}px`);
    root.style.setProperty("--sidebar-height", `${sidebar.height || 64}px`);
    const playerHeight = player.height || 96;
    const safeAreaBottom = Math.max(180, playerHeight + 84);
    root.style.setProperty("--player-height", `${playerHeight}px`);
    root.style.setProperty("--safe-area-bottom", `${safeAreaBottom}px`);
    root.style.setProperty("--player-width", `${player.widthPercent || 100}%`);

    const isGlass = Boolean(theme.glassMode);
    const winOpacity = typeof theme.windowOpacity === "number" ? theme.windowOpacity : Math.round((theme.glassOpacity ?? 0.66) * 100);
    const alpha = isGlass ? Math.max(0.04, Math.min(1, winOpacity / 100)) : 1;
    const playerBlurAlpha = isGlass ? Math.max(0.1, Math.min(0.9, alpha * 0.9)) : 0.85;
    const blurPx = typeof theme.backdropBlur === "number" ? theme.backdropBlur : (theme.wallpaperBlur || 16);
    const glassForceVal = typeof theme.glassForce === "number" ? theme.glassForce / 100 : 0.05;

    root.style.setProperty("--glass-blur", `${blurPx}px`);
    root.style.setProperty("--glass-blur-val", `${blurPx}px`);
    root.style.setProperty("--glass-force", `${glassForceVal}`);

    root.style.setProperty("--bg", theme.wallpaperData ? "transparent" : theme.appBgColor);
    root.style.setProperty("--panel", hexToRgba(theme.sidebarBgColor, alpha));
    root.style.setProperty("--panel2", hexToRgba(theme.sidebarBgColor, Math.max(0.08, alpha * 0.85)));
    root.style.setProperty("--sidebar-bg", hexToRgba(theme.sidebarBgColor, alpha));
    root.style.setProperty("--player-bg", hexToRgba(theme.playerBgColor, alpha));
    root.style.setProperty("--player-blur-bg", hexToRgba(theme.playerBgColor, playerBlurAlpha));
    root.style.setProperty("--panel-bg-glass", hexToRgba(theme.sidebarBgColor, alpha));
    root.style.setProperty("--player-bg-glass", hexToRgba(theme.playerBgColor, playerBlurAlpha));
    root.style.setProperty("--player-contrast-text", getContrastTextColor(theme.playerBgColor));
    root.style.setProperty("--card-bg", hexToRgba(theme.cardBgColor, Math.min(0.95, alpha + 0.05)));
    root.style.setProperty("--card-bg-glass", hexToRgba(theme.cardBgColor, Math.min(0.95, alpha + 0.05)));
    root.style.setProperty("--elev", hexToRgba(theme.cardBgColor, Math.min(0.95, alpha + 0.05)));
    root.style.setProperty("--elev2", hexToRgba(theme.cardBgColor, Math.min(0.95, alpha + 0.12)));
    root.style.setProperty("--hover", hexToRgba(theme.cardBgColor, Math.min(0.95, alpha + 0.18)));
    root.style.setProperty("--border", hexToRgba(theme.textColor, 0.10));
    root.style.setProperty("--border2", hexToRgba(theme.textColor, 0.18));
    root.style.setProperty("--border3", hexToRgba(theme.textColor, 0.28));
    root.style.setProperty("--glass-border", hexToRgba(theme.textColor, 0.12));
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

  const setSidebarVariant = (variant: "standard" | "compact") => {
    persistOrDraft((prev) => ({
      ...prev,
      sidebar: { ...prev.sidebar, variant },
    }));
  };

  const setSidebarAutoHide = (autoHide: boolean) => {
    persistOrDraft((prev) => ({
      ...prev,
      sidebar: { ...prev.sidebar, autoHide },
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

  const setShowMiniPlayer = (show: boolean) => {
    persistOrDraft((prev) => ({
      ...prev,
      player: { ...prev.player, showMiniPlayer: show },
    }));
  };

  const setFullscreenMode = (mode: "both" | "lyrics" | "cover") => {
    persistOrDraft((prev) => ({
      ...prev,
      player: { ...prev.player, fullscreenMode: mode },
    }));
  };

  const setFullscreenFollowTrack = (follow: boolean) => {
    persistOrDraft((prev) => ({
      ...prev,
      player: { ...prev.player, fullscreenFollowTrack: follow },
    }));
  };

  const setFullscreenLyricsPosition = (pos: "right" | "left") => {
    persistOrDraft((prev) => ({
      ...prev,
      player: { ...prev.player, fullscreenLyricsPosition: pos },
    }));
  };

  const setMiniPlayerPreset = (preset: "default" | "compact" | "minimal" | "expanded") => {
    persistOrDraft((prev) => ({
      ...prev,
      player: { ...prev.player, miniPlayerPreset: preset },
    }));
  };

  const setMiniPlayerBg = (bg: "blur" | "solid" | "theme" | "artwork" | "dominant" | "dense_glass") => {
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

  const setHorizontalNavButtons = (buttons: string[]) => {
    persistOrDraft((prev) => ({
      ...prev,
      sidebar: { ...prev.sidebar, horizontalNavButtons: buttons },
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
      ...(preset.ambientMode !== undefined ? { ambientMode: preset.ambientMode } : {}),
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
    const def = JSON.parse(JSON.stringify(DEFAULT_CUSTOMIZATION));
    setDraftConfig(def);
    setSavedConfig(def);
    setIsEditMode(false);
    try { localStorage.removeItem(STORAGE_KEY); } catch {}
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
        setSidebarVariant,
        setSidebarAutoHide,
        setPlayerPosition,
        setPlayerStyle,
        setPlayerHeight,
        setPlayerWidthPercent,
        setPlayerOptions,
        setQueuePosition,
        setShowMiniPlayer,
        setFullscreenMode,
        setFullscreenFollowTrack,
        setFullscreenLyricsPosition,
        setMiniPlayerPreset,
        setMiniPlayerBg,
        setMiniPlayerShape,
        setHorizontalNavButtons,
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
