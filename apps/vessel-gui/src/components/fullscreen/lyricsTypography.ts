export interface LyricsTypography {
  fontSize: number; // 18..56, def 28
  fontWeight: number; // 300..900, def 700
  lineSpacing: number; // 4..48, def 28
  alignment: "left" | "center"; // def "left"
}

export const DEFAULT_LYRICS_TYPOGRAPHY: LyricsTypography = {
  fontSize: 28,
  fontWeight: 700,
  lineSpacing: 28,
  alignment: "left",
};

const LYRICS_TYPO_KEY = "vessel_lyrics_typography";

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
    };
  } catch {
    return DEFAULT_LYRICS_TYPOGRAPHY;
  }
}

export function saveLyricsTypography(t: LyricsTypography) {
  try {
    localStorage.setItem(LYRICS_TYPO_KEY, JSON.stringify(t));
  } catch {}
}

export function applyLyricsTypography(t: LyricsTypography) {
  const root = document.documentElement;
  root.style.setProperty("--fs-lyric-font-size", `${t.fontSize}px`);
  root.style.setProperty("--fs-lyric-font-weight", `${t.fontWeight}`);
  root.style.setProperty("--fs-lyric-line-gap", `${t.lineSpacing}px`);
  root.style.setProperty("--fs-lyric-align", t.alignment);
  root.style.setProperty("--fs-lyric-justify", t.alignment === "center" ? "center" : "flex-start");
}
