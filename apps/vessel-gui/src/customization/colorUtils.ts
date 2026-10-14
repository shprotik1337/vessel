/**
 * Pure color utility functions for the Vessel theme engine.
 */

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
