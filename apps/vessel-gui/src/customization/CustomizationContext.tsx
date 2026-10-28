import { createContext, useContext, useState, useEffect, type ReactNode } from "react";
import type {
  ThemeColors,
  ImageLibraryItem,
  BorderRadiusPreset,
  BlockWidth,
  BlockAlign,
  ComponentStyle,
  BlockCanvasPos,
  CustomizationConfig,
  ThemePreset,
  CustomizationContextType,
} from "./types";
import { DEFAULT_CUSTOMIZATION, STORAGE_KEY, USER_PRESETS_KEY } from "./defaults";
import { sanitizeConfig } from "./configSanitizer";
import { applyThemeVariables } from "./cssVariables";

// Re-export all types, utilities, constants, and themes for complete backward compatibility
export * from "./types";
export * from "./colorUtils";
export * from "./builtinThemes";
export * from "./defaults";
export * from "./configSanitizer";
export * from "./cssVariables";

export let globalDraggingPanelId: string | null = null;
export function setGlobalDraggingPanelId(id: string | null) {
  globalDraggingPanelId = id;
}

export let globalDragStartX: number | null = null;
export function setGlobalDragStartX(x: number | null) {
  globalDragStartX = x;
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
    applyThemeVariables(activeConfig);
  }, [activeConfig]);

  // Synchronize remote customization when received from cloud
  useEffect(() => {
    const handleRemoteSettings = (event: Event) => {
      const customEvent = event as CustomEvent<any>;
      const remote = customEvent.detail;
      if (!remote) return;
      if (remote.customization) {
        const sanitized = sanitizeConfig(remote.customization);
        setSavedConfig(sanitized);
        setDraftConfig(sanitized);
        try {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(sanitized));
        } catch {}
      }
      if (Array.isArray(remote.user_presets)) {
        setUserPresets(remote.user_presets.slice(0, 3));
        try {
          localStorage.setItem(USER_PRESETS_KEY, JSON.stringify(remote.user_presets.slice(0, 3)));
        } catch {}
      }
      if (remote.font) {
        localStorage.setItem("vessel_font", remote.font);
        document.body.style.fontFamily = remote.font === "Default" ? "Inter, -apple-system, sans-serif" : `${remote.font}, sans-serif`;
      }
    };
    window.addEventListener("vessel:cloud-settings-synced", handleRemoteSettings);
    return () => window.removeEventListener("vessel:cloud-settings-synced", handleRemoteSettings);
  }, []);

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

  const setDefaultLyricsProvider = (provider: string) => {
    persistOrDraft((prev) => ({
      ...prev,
      player: { ...prev.player, defaultLyricsProvider: provider },
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

  const customTrackArt = activeConfig.theme?.customTrackArt ?? null;
  const imageLibrary = activeConfig.imageLibrary ?? [];

  const setCustomTrackArt = (url: string | null) => {
    updateThemeDirectly({ customTrackArt: url });
  };

  const setWallpaperData = (url: string | null) => {
    updateThemeDirectly({ wallpaperData: url });
  };

  const addToImageLibrary = (item: { url: string; name: string }) => {
    const newItem: ImageLibraryItem = {
      id: "img_" + Date.now() + "_" + Math.random().toString(36).substring(2, 7),
      url: item.url,
      name: item.name || "Изображение",
    };
    setSavedConfig((prev) => {
      const existing = prev.imageLibrary ?? [];
      const updated = [newItem, ...existing.filter((x) => x.url !== item.url)];
      const next = { ...prev, imageLibrary: updated };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.error("Failed to save imageLibrary", e);
      }
      return next;
    });
    setDraftConfig((prev) => {
      const existing = prev.imageLibrary ?? [];
      const updated = [newItem, ...existing.filter((x) => x.url !== item.url)];
      return { ...prev, imageLibrary: updated };
    });
  };

  const removeFromImageLibrary = (id: string) => {
    setSavedConfig((prev) => {
      const existing = prev.imageLibrary ?? [];
      const updated = existing.filter((x) => x.id !== id);
      const next = { ...prev, imageLibrary: updated };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch (e) {
        console.error("Failed to save imageLibrary", e);
      }
      return next;
    });
    setDraftConfig((prev) => {
      const existing = prev.imageLibrary ?? [];
      const updated = existing.filter((x) => x.id !== id);
      return { ...prev, imageLibrary: updated };
    });
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
        setDefaultLyricsProvider,
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
        customTrackArt,
        setCustomTrackArt,
        imageLibrary,
        addToImageLibrary,
        removeFromImageLibrary,
        setWallpaperData,
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
