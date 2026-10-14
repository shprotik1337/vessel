import type { CustomizationConfig, BorderRadiusPreset } from "./types";
import { hexToRgba, getContrastTextColor } from "./colorUtils";

/**
 * Injects dynamic CSS variables into document.documentElement based on the active configuration.
 */
export function applyThemeVariables(activeConfig: CustomizationConfig): void {
  if (typeof document === "undefined") return;
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
  root.style.setProperty("--app-bg", theme.appBgColor);
  root.style.setProperty("--titlebar-bg", "transparent");
}
