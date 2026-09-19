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
export type ComponentStyle = "dock" | "floating";

export interface CustomizationConfig {
  borderRadius: BorderRadiusPreset;
  sidebar: {
    position: "left" | "right" | "top" | "bottom";
    style: ComponentStyle;
    width: number; // default 232, min 160, max 360
    collapsed: boolean;
  };
  player: {
    position: "bottom" | "top";
    style: ComponentStyle;
    height: number; // default 82, min 68, max 120
    largeIcons: boolean;
    hideDetails: boolean;
  };
  home: {
    blockOrder: string[];
    hiddenBlocks: string[];
    blockWidths: Record<string, BlockWidth>;
    gridColumns: Record<string, number>;
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
    collapsed: false,
  },
  player: {
    position: "bottom",
    style: "floating",
    height: 82,
    largeIcons: false,
    hideDetails: false,
  },
  home: {
    blockOrder: ["header", "wave", "recent", "playlists", "library"],
    hiddenBlocks: [],
    blockWidths: {
      header: "full",
      wave: "full",
      recent: "full",
      playlists: "full",
      library: "full",
    },
    gridColumns: {
      recent: 4,
      playlists: 3,
      library: 4,
    },
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
  const sidebarCollapsed = Boolean(raw.sidebar?.collapsed);

  const playerPos = raw.player?.position === "top" ? "top" : "bottom";
  const playerStyle: ComponentStyle =
    raw.player?.style === "dock" ? "dock" : "floating";
  const playerHeight =
    typeof raw.player?.height === "number" && !isNaN(raw.player.height)
      ? Math.max(68, Math.min(120, raw.player.height))
      : 82;
  const playerLargeIcons = Boolean(raw.player?.largeIcons);
  const playerHideDetails = Boolean(raw.player?.hideDetails);

  const defaultOrder = ["header", "wave", "recent", "playlists", "library"];
  let blockOrder: string[] = [];
  if (Array.isArray(raw.home?.blockOrder) && raw.home.blockOrder.length > 0) {
    blockOrder = raw.home.blockOrder.filter((b: any) => typeof b === "string");
  }
  if (blockOrder.length === 0) {
    blockOrder = [...defaultOrder];
  }
  for (const b of defaultOrder) {
    if (!blockOrder.includes(b)) {
      blockOrder.push(b);
    }
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
    ...(typeof raw.home?.gridColumns === "object" && raw.home?.gridColumns !== null ? raw.home.gridColumns : {}),
  };

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

  return {
    borderRadius,
    sidebar: {
      position: sidebarPos,
      style: sidebarStyle,
      width: sidebarWidth,
      collapsed: sidebarCollapsed,
    },
    player: {
      position: playerPos,
      style: playerStyle,
      height: playerHeight,
      largeIcons: playerLargeIcons,
      hideDetails: playerHideDetails,
    },
    home: {
      blockOrder,
      hiddenBlocks,
      blockWidths,
      gridColumns,
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
  setPlayerPosition: (pos: "bottom" | "top") => void;
  setPlayerStyle: (style: ComponentStyle) => void;
  setPlayerHeight: (height: number) => void;
  setPlayerOptions: (options: { largeIcons?: boolean; hideDetails?: boolean }) => void;
  setBorderRadius: (preset: BorderRadiusPreset) => void;
  setBlockWidth: (id: string, width: BlockWidth) => void;
  toggleSidebarPosition: () => void;
  moveBlock: (id: string, direction: "up" | "down") => void;
  reorderBlocks: (sourceId: string, targetId: string) => void;
  toggleBlockVisibility: (id: string) => void;
  setBlockGridColumns: (id: string, cols: number) => void;
  applyPreset: (preset: ThemePreset) => void;
  userPresets: (ThemePreset | null)[];
  saveToUserSlot: (slotIndex: number, customName?: string) => void;
  loadFromUserSlot: (slotIndex: number) => void;
  resetToDefaults: () => void;
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
    root.style.setProperty("--player-height", `${player.height || 82}px`);

    if (theme.glassMode) {
      const alpha = Math.max(0.1, Math.min(0.95, theme.glassOpacity));
      root.style.setProperty("--bg", theme.wallpaperData ? "transparent" : theme.appBgColor);
      root.style.setProperty("--panel", hexToRgba(theme.sidebarBgColor, alpha));
      root.style.setProperty("--sidebar-bg", hexToRgba(theme.sidebarBgColor, alpha));
      root.style.setProperty("--player-bg", hexToRgba(theme.playerBgColor, alpha));
      root.style.setProperty("--card-bg", hexToRgba(theme.cardBgColor, Math.min(0.95, alpha + 0.05)));
      root.style.setProperty("--elev", hexToRgba(theme.cardBgColor, Math.min(0.95, alpha + 0.05)));
      root.style.setProperty("--elev2", hexToRgba(theme.cardBgColor, Math.min(0.95, alpha + 0.12)));
      root.style.setProperty("--border", "rgba(255, 255, 255, 0.10)");
      root.style.setProperty("--border2", "rgba(255, 255, 255, 0.16)");
      root.style.setProperty("--glass-blur", "16px");
    } else {
      root.style.setProperty("--bg", theme.appBgColor);
      root.style.setProperty("--panel", theme.sidebarBgColor);
      root.style.setProperty("--sidebar-bg", theme.sidebarBgColor);
      root.style.setProperty("--player-bg", theme.playerBgColor);
      root.style.setProperty("--card-bg", theme.cardBgColor);
      root.style.setProperty("--elev", theme.cardBgColor);
      root.style.setProperty("--elev2", hexToRgba(theme.cardBgColor, 0.9));
      root.style.setProperty("--border", "rgba(255, 255, 255, 0.08)");
      root.style.setProperty("--border2", "rgba(255, 255, 255, 0.14)");
      root.style.setProperty("--glass-blur", "0px");
    }
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

  const setPlayerPosition = (pos: "bottom" | "top") => {
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
    });
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
    };

    const nextPresets = [...userPresets];
    nextPresets[slotIndex] = newPreset;
    setUserPresets(nextPresets);
    try {
      localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(nextPresets));
    } catch {}
  };

  const loadFromUserSlot = (slotIndex: number) => {
    const p = userPresets[slotIndex];
    if (p) applyPreset(p);
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
        setPlayerPosition,
        setPlayerStyle,
        setPlayerHeight,
        setPlayerOptions,
        setBorderRadius,
        setBlockWidth,
        toggleSidebarPosition,
        moveBlock,
        reorderBlocks,
        toggleBlockVisibility,
        setBlockGridColumns,
        applyPreset,
        userPresets,
        saveToUserSlot,
        loadFromUserSlot,
        resetToDefaults,
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
