import type { CustomizationConfig, BorderRadiusPreset } from "./types";
import { hexToRgba, getContrastTextColor, isLightColor } from "./colorUtils";

/**
 * Injects dynamic CSS variables into document.documentElement based on the active configuration.
 */
export function applyThemeVariables(activeConfig: CustomizationConfig): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  const { theme, borderRadius, sidebar, player } = activeConfig;
  const isLight = isLightColor(theme.appBgColor);

  const effectiveAccent = isLight && isLightColor(theme.accentColor) ? "#111114" : theme.accentColor;

  root.setAttribute("data-theme-mode", isLight ? "light" : "dark");
  root.style.setProperty("color-scheme", isLight ? "light" : "dark");

  root.style.setProperty("--accent", effectiveAccent);
  root.style.setProperty("--accent-hover", hexToRgba(effectiveAccent, 0.85));
  root.style.setProperty("--accent-glow", hexToRgba(effectiveAccent, 0.35));
  root.style.setProperty("--accent-contrast-text", getContrastTextColor(effectiveAccent));
  root.style.setProperty("--text", theme.textColor);
  root.style.setProperty("--text2", hexToRgba(theme.textColor, 0.72));
  root.style.setProperty("--text3", hexToRgba(theme.textColor, 0.48));
  root.style.setProperty("--wp-blur", `${theme.wallpaperBlur}px`);
  root.style.setProperty("--wp-dim", `${theme.wallpaperDim / 100}`);
  const isRowDisabled = theme.trackRowStyle === "none" || (theme.trackRowStyle === undefined && (theme.trackRowOpacity ?? 0) === 0);
  const trowAlpha = isRowDisabled
    ? 0
    : (typeof theme.trackRowOpacity === "number" ? Math.max(0, Math.min(1, theme.trackRowOpacity)) : 0.08);

  root.style.setProperty("--trow-bg-opacity", `${trowAlpha}`);
  const trowBg = !isRowDisabled && trowAlpha > 0 ? hexToRgba(theme.cardBgColor, trowAlpha * 0.95) : "transparent";
  const trowBorder = !isRowDisabled && trowAlpha > 0 ? `1px solid ${hexToRgba(theme.textColor, Math.max(0.04, trowAlpha * 0.08))}` : "none";
  const trowFilter = !isRowDisabled && trowAlpha > 0 ? "blur(10px)" : "none";

  root.style.setProperty("--trow-bg", trowBg);
  root.style.setProperty("--trow-border", trowBorder);
  root.style.setProperty("--trow-filter", trowFilter);
  const trowActiveAlpha = typeof theme.trackRowActiveOpacity === "number" ? Math.max(0, Math.min(1, theme.trackRowActiveOpacity)) : 0.08;
  root.style.setProperty("--trow-active-opacity", `${trowActiveAlpha}`);

  const activeStyle = theme.trackRowActiveStyle || "glass";
  let activeBg = hexToRgba(theme.textColor, trowActiveAlpha);
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
  const effectiveSidebarWidth = isCompactRail ? 60 : (sidebar.width || 232);
  root.style.setProperty("--sidebar-width", `${effectiveSidebarWidth}px`);
  root.style.setProperty("--sidebar-height", `${sidebar.height || 64}px`);
  const isPlayerEnabled = true;
  const isProgressFill = player.style === "progress_fill";
  const playerHeight = isPlayerEnabled ? (isProgressFill ? 66 : 68) : 0;
  const safeAreaBottom = isPlayerEnabled ? Math.max(140, playerHeight + 60) : 24;
  root.style.setProperty("--player-height", `${playerHeight}px`);
  root.style.setProperty("--safe-area-bottom", `${safeAreaBottom}px`);
  root.style.setProperty("--player-width", `${player.widthPercent || 100}%`);

  const isGlass = Boolean(theme.glassMode);
  const winOpacity = typeof theme.windowOpacity === "number" ? theme.windowOpacity : Math.round((theme.glassOpacity ?? 0.35) * 100);
  const alpha = isGlass ? Math.max(0.08, Math.min(1, winOpacity / 100)) : 1;
  const surfaceAlpha = isLight ? (isGlass ? Math.max(0.5, alpha) : 1) : alpha;
  const playerBlurAlpha = isLight
    ? (isGlass ? Math.max(0.82, surfaceAlpha) : 0.94)
    : (isGlass ? Math.max(0.1, Math.min(0.9, surfaceAlpha * 0.9)) : 0.85);
  const blurPx = isGlass ? (typeof theme.backdropBlur === "number" ? theme.backdropBlur : (theme.wallpaperBlur || 16)) : 0;
  const glassForceVal = typeof theme.glassForce === "number" ? theme.glassForce / 100 : 0.05;

  root.style.setProperty("--glass-blur", `${blurPx}px`);
  root.style.setProperty("--glass-blur-val", `${blurPx}px`);
  root.style.setProperty("--glass-force", `${glassForceVal}`);

  root.style.setProperty("--bg", theme.wallpaperData ? "transparent" : theme.appBgColor);
  root.style.setProperty("--panel", hexToRgba(theme.sidebarBgColor, surfaceAlpha));
  root.style.setProperty("--panel2", hexToRgba(theme.sidebarBgColor, Math.max(0.08, surfaceAlpha * 0.85)));
  root.style.setProperty("--sidebar-bg", hexToRgba(theme.sidebarBgColor, surfaceAlpha));
  root.style.setProperty("--player-bg", hexToRgba(theme.playerBgColor, surfaceAlpha));
  root.style.setProperty("--player-blur-bg", hexToRgba(theme.playerBgColor, playerBlurAlpha));
  root.style.setProperty("--panel-bg-glass", hexToRgba(theme.sidebarBgColor, surfaceAlpha));
  root.style.setProperty("--player-bg-glass", hexToRgba(theme.playerBgColor, playerBlurAlpha));
  root.style.setProperty("--player-contrast-text", getContrastTextColor(theme.playerBgColor));
  root.style.setProperty("--card-bg", hexToRgba(theme.cardBgColor, Math.min(0.96, isLight && isGlass ? surfaceAlpha : alpha + 0.05)));
  root.style.setProperty("--card-bg-glass", hexToRgba(theme.cardBgColor, Math.min(0.96, isLight && isGlass ? surfaceAlpha : alpha + 0.05)));
  root.style.setProperty("--elev", isLight ? hexToRgba(theme.textColor, 0.045) : hexToRgba(theme.cardBgColor, Math.min(0.95, alpha + 0.05)));
  root.style.setProperty("--elev2", isLight ? hexToRgba(theme.textColor, 0.08) : hexToRgba(theme.cardBgColor, Math.min(0.95, alpha + 0.12)));
  root.style.setProperty("--hover", isLight ? hexToRgba(theme.textColor, 0.10) : hexToRgba(theme.cardBgColor, Math.min(0.95, alpha + 0.18)));
  root.style.setProperty("--track", hexToRgba(theme.textColor, isLight ? 0.09 : 0.14));
  root.style.setProperty("--track2", hexToRgba(theme.textColor, isLight ? 0.13 : 0.20));
  root.style.setProperty("--track3", hexToRgba(theme.textColor, isLight ? 0.18 : 0.26));
  root.style.setProperty("--border", hexToRgba(theme.textColor, isLight ? 0.09 : 0.10));
  root.style.setProperty("--border2", hexToRgba(theme.textColor, isLight ? 0.15 : 0.18));
  root.style.setProperty("--border3", hexToRgba(theme.textColor, isLight ? 0.24 : 0.28));
  root.style.setProperty("--glass-border", hexToRgba(theme.textColor, 0.12));
  root.style.setProperty("--app-bg", theme.appBgColor);
  root.style.setProperty("--titlebar-bg", "transparent");
  const waveBgAlpha = isLight ? (isGlass ? Math.max(0.86, alpha) : 1) : (isGlass ? alpha : 1);
  root.style.setProperty("--wave-bg-alpha", `${waveBgAlpha}`);

  // Settings modal adaptive surface tokens (respond to light/dark/custom themes & transparency)
  const sameCardAsApp = theme.cardBgColor.toLowerCase() === theme.appBgColor.toLowerCase();
  const contentAlpha = isGlass ? Math.max(0.24, Math.min(0.98, alpha + 0.12)) : 1;
  const sidebarAlpha = isGlass ? Math.max(0.22, Math.min(0.96, alpha + 0.06)) : 1;
  root.style.setProperty("--sett-modal-sidebar", hexToRgba(theme.sidebarBgColor, sidebarAlpha));
  root.style.setProperty("--sett-modal-content", hexToRgba(isLight ? theme.cardBgColor : theme.appBgColor, contentAlpha));
  root.style.setProperty(
    "--sett-card-bg",
    sameCardAsApp
      ? hexToRgba(theme.textColor, isLight ? 0.04 : 0.055)
      : hexToRgba(theme.cardBgColor, isGlass ? Math.max(0.32, Math.min(0.94, alpha + 0.14)) : 1),
  );
  root.style.setProperty("--sett-surface", hexToRgba(theme.textColor, isLight ? 0.06 : 0.07));
  root.style.setProperty("--sett-surface-hover", hexToRgba(theme.textColor, isLight ? 0.10 : 0.12));
  root.style.setProperty("--sett-active-pill", hexToRgba(theme.textColor, isLight ? 0.095 : 0.12));
  root.style.setProperty("--sett-backdrop", isLight ? "rgba(15, 18, 25, 0.22)" : "rgba(0, 0, 0, 0.65)");
  root.style.setProperty(
    "--sett-shadow",
    isLight
      ? "0 24px 64px rgba(0, 0, 0, 0.16)"
      : "0 24px 64px rgba(0, 0, 0, 0.72)",
  );
  root.style.setProperty("--sett-switch-off", hexToRgba(theme.textColor, isLight ? 0.18 : 0.22));
  root.style.setProperty("--sett-switch-thumb-off", isLight ? theme.cardBgColor : theme.textColor);
  root.style.setProperty("--sett-switch-thumb-on", getContrastTextColor(effectiveAccent));
}
