import type {
  CustomizationConfig,
  BorderRadiusPreset,
  ComponentStyle,
  BlockWidth,
  BlockAlign,
  BlockCanvasPos,
  ThemeColors,
} from "./types";
import { DEFAULT_CUSTOMIZATION } from "./defaults";

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
  const validPlayerStyles: ComponentStyle[] = ["dock", "floating", "progress_fill"];
  const playerStyle: ComponentStyle = validPlayerStyles.includes(raw.player?.style)
    ? raw.player.style
    : "floating";
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

  const showMiniPlayer = raw.player?.showMiniPlayer !== false;
  const validFsModes = ["both", "lyrics", "cover"] as const;
  const fullscreenMode = validFsModes.includes(raw.player?.fullscreenMode)
    ? raw.player.fullscreenMode
    : "both";
  const fullscreenFollowTrack = raw.player?.fullscreenFollowTrack !== false;

  const validFsLyricsPositions = ["right", "left"] as const;
  const fullscreenLyricsPosition = validFsLyricsPositions.includes(raw.player?.fullscreenLyricsPosition)
    ? raw.player.fullscreenLyricsPosition
    : "right";

  const validLyricsProviders = ["Vessel", "Musixmatch", "Cadence", "LRCLIB"] as const;
  const defaultLyricsProvider = validLyricsProviders.includes(raw.player?.defaultLyricsProvider)
    ? raw.player.defaultLyricsProvider
    : "Vessel";

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
    trackRowStyle: raw.theme?.trackRowStyle === "glass" ? "glass" : "none",
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
    customTrackArt: typeof raw.theme?.customTrackArt === "string" ? raw.theme.customTrackArt : null,
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
      defaultLyricsProvider,
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
    imageLibrary: Array.isArray(raw.imageLibrary)
      ? raw.imageLibrary
          .filter((item: any) => item && typeof item.id === "string" && typeof item.url === "string")
          .map((item: any) => ({
            id: item.id,
            url: item.url,
            name: typeof item.name === "string" ? item.name : "Изображение",
          }))
      : [],
  };
}
