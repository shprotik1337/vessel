export type LyricsSyncMode = "word" | "line";
export type LyricsTextStyle = "default" | "cinema" | "shift" | "blur";
export type LyricsAnimation = "off" | "wave" | "blur" | "flip3d" | "bounce" | "drift";

export interface LyricsTypography {
  fontSize: number; // 18..56, def 28
  fontWeight: number; // 300..900, def 700
  lineSpacing: number; // 4..48, def 28
  alignment: "left" | "center"; // def "left"
  syncMode: LyricsSyncMode; // def "word"
  textStyle: LyricsTextStyle; // def "default"
  animation: LyricsAnimation; // def "wave"
}

export const DEFAULT_LYRICS_TYPOGRAPHY: LyricsTypography = {
  fontSize: 28,
  fontWeight: 700,
  lineSpacing: 28,
  alignment: "left",
  syncMode: "word",
  textStyle: "default",
  animation: "wave",
};

const LYRICS_TYPO_KEY = "vessel_lyrics_typography";
const LYRICS_OFFSETS_KEY = "vessel_lyrics_offsets_v1";
export const LYRICS_SETTINGS_EVENT = "vessel-lyrics-settings-changed";
export const LYRICS_OFFSET_MIN_MS = -5000;
export const LYRICS_OFFSET_MAX_MS = 5000;
export const LYRICS_OFFSET_STEP_MS = 100;

function isValidTextStyle(v: unknown): v is LyricsTextStyle {
  return v === "default" || v === "cinema" || v === "shift" || v === "blur";
}

function isValidAnimation(v: unknown): v is LyricsAnimation {
  return v === "off" || v === "wave" || v === "blur" || v === "flip3d" || v === "bounce" || v === "drift";
}

export function loadLyricsTypography(): LyricsTypography {
  try {
    const raw = localStorage.getItem(LYRICS_TYPO_KEY);
    if (!raw) return DEFAULT_LYRICS_TYPOGRAPHY;
    const parsed = JSON.parse(raw);
    return {
      fontSize: typeof parsed.fontSize === "number" ? Math.min(56, Math.max(18, parsed.fontSize)) : 28,
      fontWeight: typeof parsed.fontWeight === "number" ? Math.min(900, Math.max(300, parsed.fontWeight)) : 700,
      lineSpacing: typeof parsed.lineSpacing === "number" ? Math.min(48, Math.max(4, parsed.lineSpacing)) : 28,
      alignment: parsed.alignment === "center" ? "center" : "left",
      syncMode: parsed.syncMode === "line" ? "line" : "word",
      textStyle: isValidTextStyle(parsed.textStyle) ? parsed.textStyle : "default",
      animation: isValidAnimation(parsed.animation) ? parsed.animation : "wave",
    };
  } catch {
    return DEFAULT_LYRICS_TYPOGRAPHY;
  }
}

export function saveLyricsTypography(t: LyricsTypography) {
  try {
    localStorage.setItem(LYRICS_TYPO_KEY, JSON.stringify(t));
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(LYRICS_SETTINGS_EVENT, { detail: { typo: t } }));
    }
  } catch {}
}

export function getLyricsTrackKey(track?: { provider: string; id: string } | null): string {
  return track ? `${track.provider}:${track.id}` : "";
}

export function clampLyricOffsetMs(offsetMs: number): number {
  if (!Number.isFinite(offsetMs)) return 0;
  const snapped = Math.round(offsetMs / LYRICS_OFFSET_STEP_MS) * LYRICS_OFFSET_STEP_MS;
  return Math.min(LYRICS_OFFSET_MAX_MS, Math.max(LYRICS_OFFSET_MIN_MS, snapped));
}

export function loadTrackLyricOffset(trackKey: string): number {
  if (!trackKey) return 0;
  try {
    const raw = localStorage.getItem(LYRICS_OFFSETS_KEY);
    if (!raw) return 0;
    const map = JSON.parse(raw) as Record<string, unknown>;
    const val = map?.[trackKey];
    return typeof val === "number" ? clampLyricOffsetMs(val) : 0;
  } catch {
    return 0;
  }
}

export function saveTrackLyricOffset(trackKey: string, offsetMs: number): void {
  if (!trackKey) return;
  try {
    const raw = localStorage.getItem(LYRICS_OFFSETS_KEY);
    const map: Record<string, number> = raw ? JSON.parse(raw) : {};
    const clamped = clampLyricOffsetMs(offsetMs);
    if (clamped === 0) {
      delete map[trackKey];
    } else {
      map[trackKey] = clamped;
    }
    localStorage.setItem(LYRICS_OFFSETS_KEY, JSON.stringify(map));
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent(LYRICS_SETTINGS_EVENT, { detail: { trackKey, offsetMs: clamped } }),
      );
    }
  } catch {}
}

export function formatLyricOffset(offsetMs: number, lang = "ru"): string {
  if (Math.abs(offsetMs) < 1) return "0";
  const secs = (offsetMs / 1000).toFixed(1);
  return `${offsetMs > 0 ? "+" : ""}${secs}${lang === "ru" ? " с" : "s"}`;
}

export function applyLyricsTypography(t: LyricsTypography) {
  const root = document.documentElement;
  const minFont = Math.max(15, Math.round(t.fontSize * 0.65));
  const vwFactor = (t.fontSize * 0.08).toFixed(2);
  const vhFactor = (t.fontSize * 0.095).toFixed(2);
  const minGap = Math.max(4, Math.round(t.lineSpacing * 0.5));
  const gapVhFactor = (t.lineSpacing * 0.085).toFixed(2);

  root.style.setProperty(
    "--fs-lyric-font-size",
    `clamp(${minFont}px, min(${vwFactor}vw, ${vhFactor}vh), ${t.fontSize}px)`,
  );
  root.style.setProperty("--fs-lyric-font-weight", `${t.fontWeight}`);
  root.style.setProperty(
    "--fs-lyric-line-gap",
    `clamp(${minGap}px, ${gapVhFactor}vh, ${t.lineSpacing}px)`,
  );
  root.style.setProperty("--fs-lyric-align", t.alignment);
  root.style.setProperty("--fs-lyric-justify", t.alignment === "center" ? "center" : "flex-start");
  root.dataset.lyricsSync = t.syncMode;
  root.dataset.lyricsStyle = t.textStyle;
  root.dataset.lyricsAnim = t.animation;
}
