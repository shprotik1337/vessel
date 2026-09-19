import { createContext, useContext, useState, useEffect, type ReactNode } from "react";

export interface CustomizationConfig {
  sidebar: {
    position: "left" | "right";
    collapsed: boolean;
  };
  home: {
    blockOrder: string[];
    hiddenBlocks: string[];
    gridColumns: Record<string, number>;
  };
  player: {
    largeIcons: boolean;
    verticalVolume: boolean;
    hideDetails: boolean;
    miniQueue: boolean;
  };
  theme: {
    accentColor: string;
    wallpaperData: string | null;
    wallpaperBlur: number; // 0..40 px
    wallpaperDim: number; // 0..90 %
    glassMode: boolean;
    glassOpacity: number; // 0.1..0.9
  };
}

export const DEFAULT_CUSTOMIZATION: CustomizationConfig = {
  sidebar: {
    position: "left",
    collapsed: false,
  },
  home: {
    blockOrder: ["wave", "recent", "playlists", "library"],
    hiddenBlocks: [],
    gridColumns: {
      recent: 4,
      playlists: 3,
      library: 4,
    },
  },
  player: {
    largeIcons: false,
    verticalVolume: false,
    hideDetails: false,
    miniQueue: false,
  },
  theme: {
    accentColor: "#3b82f6",
    wallpaperData: null,
    wallpaperBlur: 14,
    wallpaperDim: 45,
    glassMode: true,
    glassOpacity: 0.72,
  },
};

const STORAGE_KEY = "vessel_customization_v1";

interface CustomizationContextType {
  config: CustomizationConfig;
  isEditMode: boolean;
  enterEditMode: () => void;
  saveEditMode: () => void;
  cancelEditMode: () => void;
  updateDraft: (updater: (prev: CustomizationConfig) => CustomizationConfig) => void;
  updateThemeDirectly: (updater: (prev: CustomizationConfig["theme"]) => CustomizationConfig["theme"]) => void;
  isThemeModalOpen: boolean;
  openThemeModal: () => void;
  closeThemeModal: () => void;
  activeBlockSettings: string | null;
  setActiveBlockSettings: (id: string | null) => void;
  moveBlock: (id: string, direction: "up" | "down") => void;
  toggleBlockVisibility: (id: string) => void;
  setBlockGridColumns: (id: string, cols: number) => void;
  toggleSidebarPosition: () => void;
  resetToDefaults: () => void;
}

const CustomizationContext = createContext<CustomizationContextType | null>(null);

export function CustomizationProvider({ children }: { children: ReactNode }) {
  const [savedConfig, setSavedConfig] = useState<CustomizationConfig>(() => {
    try {
      const item = localStorage.getItem(STORAGE_KEY);
      if (item) {
        const parsed = JSON.parse(item);
        return {
          ...DEFAULT_CUSTOMIZATION,
          ...parsed,
          sidebar: { ...DEFAULT_CUSTOMIZATION.sidebar, ...(parsed.sidebar || {}) },
          home: {
            ...DEFAULT_CUSTOMIZATION.home,
            ...(parsed.home || {}),
            gridColumns: { ...DEFAULT_CUSTOMIZATION.home.gridColumns, ...(parsed.home?.gridColumns || {}) },
          },
          player: { ...DEFAULT_CUSTOMIZATION.player, ...(parsed.player || {}) },
          theme: { ...DEFAULT_CUSTOMIZATION.theme, ...(parsed.theme || {}) },
        };
      }
    } catch (e) {
      console.error("Failed to read customization config from localStorage", e);
    }
    return DEFAULT_CUSTOMIZATION;
  });

  const [draftConfig, setDraftConfig] = useState<CustomizationConfig>(savedConfig);
  const [isEditMode, setIsEditMode] = useState(false);
  const [isThemeModalOpen, setIsThemeModalOpen] = useState(false);
  const [activeBlockSettings, setActiveBlockSettings] = useState<string | null>(null);

  const activeConfig = isEditMode ? draftConfig : savedConfig;

  // Apply CSS custom variables whenever activeConfig changes
  useEffect(() => {
    const root = document.documentElement;
    const { theme } = activeConfig;

    root.style.setProperty("--accent-custom", theme.accentColor);
    root.style.setProperty("--wp-blur", `${theme.wallpaperBlur}px`);
    root.style.setProperty("--wp-dim", `${theme.wallpaperDim / 100}`);

    if (theme.wallpaperData && theme.glassMode) {
      const alpha = Math.max(0.1, Math.min(0.95, theme.glassOpacity));
      root.style.setProperty("--panel-bg-glass", `rgba(18, 18, 22, ${alpha})`);
      root.style.setProperty("--card-bg-glass", `rgba(28, 28, 34, ${alpha + 0.05})`);
      root.style.setProperty("--glass-border", `rgba(255, 255, 255, 0.09)`);
      root.style.setProperty("--glass-blur-val", "16px");
    } else {
      root.style.setProperty("--panel-bg-glass", "var(--panel)");
      root.style.setProperty("--card-bg-glass", "var(--elev)");
      root.style.setProperty("--glass-border", "var(--border)");
      root.style.setProperty("--glass-blur-val", "0px");
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
    setActiveBlockSettings(null);
  };

  const cancelEditMode = () => {
    setDraftConfig(JSON.parse(JSON.stringify(savedConfig)));
    setIsEditMode(false);
    setActiveBlockSettings(null);
  };

  const updateDraft = (updater: (prev: CustomizationConfig) => CustomizationConfig) => {
    setDraftConfig((prev) => updater(prev));
  };

  const updateThemeDirectly = (updater: (prev: CustomizationConfig["theme"]) => CustomizationConfig["theme"]) => {
    const newTheme = updater(activeConfig.theme);
    if (isEditMode) {
      setDraftConfig((prev) => ({ ...prev, theme: newTheme }));
    } else {
      const nextConfig = { ...savedConfig, theme: newTheme };
      setSavedConfig(nextConfig);
      setDraftConfig(nextConfig);
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nextConfig));
      } catch (e) {
        console.error("Failed to save theme update", e);
      }
    }
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

  const toggleSidebarPosition = () => {
    updateDraft((prev) => ({
      ...prev,
      sidebar: {
        ...prev.sidebar,
        position: prev.sidebar.position === "left" ? "right" : "left",
      },
    }));
  };

  const resetToDefaults = () => {
    setDraftConfig(JSON.parse(JSON.stringify(DEFAULT_CUSTOMIZATION)));
    if (!isEditMode) {
      setSavedConfig(DEFAULT_CUSTOMIZATION);
      localStorage.removeItem(STORAGE_KEY);
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
        isThemeModalOpen,
        openThemeModal: () => setIsThemeModalOpen(true),
        closeThemeModal: () => setIsThemeModalOpen(false),
        activeBlockSettings,
        setActiveBlockSettings,
        moveBlock,
        toggleBlockVisibility,
        setBlockGridColumns,
        toggleSidebarPosition,
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
