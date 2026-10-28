import { detectParser, type Lyric, type LyricPart } from "@braccato/parsers";
import type { LyricLine, LyricWord } from "./lyrics";

export interface ParsedLyricsResult {
  braccatoLyrics: Lyric[];
  syncedLines: LyricLine[];
  plainLyrics: string | null;
  hasWordSync: boolean;
}

/**
 * Parses Musixmatch Richsync JSON format if present
 */
function tryParseRichsync(raw: string): Lyric[] | null {
  const trimmed = raw.trim();
  if (!trimmed.startsWith("[")) return null;
  try {
    const lines = JSON.parse(trimmed);
    if (!Array.isArray(lines) || lines.length === 0 || typeof lines[0]?.ts !== "number") {
      return null;
    }
    return lines.map((line: any): Lyric => {
      const startMs = Math.round(line.ts * 1000);
      const endMs = Math.round(line.te * 1000);
      const durationMs = Math.max(0, endMs - startMs);
      const wordsArray: { c: string; o?: number }[] = Array.isArray(line.l) ? line.l : [];

      const mergedWords: { c: string; o?: number }[] = [];
      for (const w of wordsArray) {
        if (!w || typeof w.c !== "string") continue;
        if (w.c.trim().length === 0) {
          if (mergedWords.length > 0) {
            mergedWords[mergedWords.length - 1] = {
              ...mergedWords[mergedWords.length - 1],
              c: mergedWords[mergedWords.length - 1].c + w.c,
            };
          }
        } else {
          mergedWords.push(w);
        }
      }

      const text = mergedWords.map((w) => w.c).join("");

      const parts: LyricPart[] = mergedWords.map((w, i, arr): LyricPart => {
        const rawOffsetMs = Math.round((w.o ?? 0) * 1000);
        const wordStart = rawOffsetMs >= startMs ? rawOffsetMs : startMs + rawOffsetMs;
        const nextRaw = arr[i + 1]?.o;
        const nextWordStart =
          nextRaw !== undefined
            ? Math.round((nextRaw ?? 0) * 1000) >= startMs
              ? Math.round((nextRaw ?? 0) * 1000)
              : startMs + Math.round((nextRaw ?? 0) * 1000)
            : endMs;
        return {
          startTimeMs: wordStart,
          durationMs: Math.max(0, nextWordStart - wordStart),
          words: w.c,
        };
      });

      return {
        startTimeMs: startMs,
        durationMs,
        words: text,
        parts: parts.length > 0 ? parts : undefined,
      };
    });
  } catch {
    return null;
  }
}

function cleanRawToPlain(raw: string): string {
  if (!raw.includes("<")) return raw.trim();
  const pMatches = Array.from(raw.matchAll(/<p[^>]*>(.*?)<\/p>/gis));
  if (pMatches.length > 0) {
    return pMatches
      .map((m) =>
        m[1]
          .replace(/<[^>]+>/g, "")
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&apos;/g, "'")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .trim()
      )
      .filter((s) => s.length > 0)
      .join("\n");
  }
  return raw
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim();
}

/**
 * Full lyrics parser converting raw input into Braccato Lyric[] and structured lines
 */
export function parseRawLyrics(
  raw: string,
  songDurationMs?: number
): ParsedLyricsResult {
  if (!raw || !raw.trim()) {
    return {
      braccatoLyrics: [],
      syncedLines: [],
      plainLyrics: null,
      hasWordSync: false,
    };
  }

  const trimmed = raw.trim();

  try {
    const richsyncLyrics = tryParseRichsync(trimmed);
    let braccatoLyrics: Lyric[] =
      richsyncLyrics ?? detectParser(trimmed).parse(trimmed, songDurationMs);

    if (!braccatoLyrics || braccatoLyrics.length === 0) {
      const cleanPlain = cleanRawToPlain(trimmed);
      return {
        braccatoLyrics: [],
        syncedLines: [],
        plainLyrics: cleanPlain || null,
        hasWordSync: false,
      };
    }

    const hasWordSync = braccatoLyrics.some((l) => (l.parts?.length ?? 0) > 0);

    const syncedLines: LyricLine[] = braccatoLyrics.map((line) => {
      const words: LyricWord[] | undefined = line.parts?.map((p) => ({
        time: p.startTimeMs / 1000,
        duration: p.durationMs / 1000,
        text: p.words,
      }));

      return {
        time: line.startTimeMs / 1000,
        text: line.words,
        words,
      };
    });

    const plainLyrics = braccatoLyrics
      .filter((l) => !l.isInstrumental)
      .map((l) => l.words)
      .join("\n")
      .trim();

    return {
      braccatoLyrics,
      syncedLines,
      plainLyrics: plainLyrics || null,
      hasWordSync,
    };
  } catch (e) {
    console.warn("Failed to parse lyrics with braccato parser:", e);
    const cleanPlain = cleanRawToPlain(trimmed);
    return {
      braccatoLyrics: [],
      syncedLines: [],
      plainLyrics: cleanPlain || null,
      hasWordSync: false,
    };
  }
}

/**
 * Theme CSS adhering strictly to Vessel's zero-hardcode policy:
 * transparent background, dynamic text colors, smooth Apple Music-style spring physics.
 * Configures BetterLyrics engine timing via comment headers to prevent premature line bolding.
 */
export const braccatoVesselThemeCss = `
/*
  blyrics-early-scroll-consider-s = 0;
  blyrics-lyric-ending-threshold-s = 0.05;
  blyrics-swipe-lead-ratio = 0;
  blyrics-swipe-duration-ratio = 1.0;
  blyrics-scroll-timing-offset = 0;
*/

:host,
braccato-lyrics,
.blyrics-container {
  background: transparent !important;
  --blyrics-font-family: inherit, system-ui, sans-serif;
  --blyrics-font-size: 28px;
  --blyrics-font-weight: 500;
  --blyrics-line-height: 1.38;
  --blyrics-padding: 14px;
  --blyrics-text-color: var(--text, #ffffff);
  --blyrics-lyric-active-color: var(--text, #ffffff);
  --blyrics-lyric-inactive-color: var(--text3, rgba(255, 255, 255, 0.35));
  --blyrics-active-opacity: 1;
  --blyrics-inactive-opacity: 0.35;
  --blyrics-glow-color: transparent;
  --blyrics-highlight-color: transparent;
  --blyrics-scale: 1;
  --blyrics-active-scale: 1;
  --blyrics-animate-line-scale: 0;
  --blyrics-animate-instrumental: 1;
  --blyrics-animate-scroll: 1;
  --blyrics-animate-word-wobble: 0;
  --blyrics-scroll-timing-offset: 0s;
  --blyrics-timing-offset: 0s;
  --blyrics-richsync-timing-offset: 0s;
  --blyrics-wobble-duration: 0s;
  --blyrics-word-wobble-transform-from: none;
  --blyrics-word-wobble-transform-peak: none;
  --blyrics-word-wobble-transform-settle: none;
  --blyrics-word-wobble-transform-to: none;
}

.blyrics-container > div {
  background: transparent !important;
  border-radius: 8px;
  transform: none !important;
  font-weight: 500 !important;
  opacity: 0.35 !important;
  color: var(--text3, rgba(255, 255, 255, 0.35)) !important;
  transition: opacity 0.3s cubic-bezier(0.2, 0, 0, 1), color 0.3s cubic-bezier(0.2, 0, 0, 1);
}

.blyrics-container > div:hover {
  background: transparent !important;
  opacity: 0.85;
  transform: none !important;
}

/* Strict: ONLY the single currently active line is bold and fully visible */
.blyrics-container > div.blyrics--active {
  font-weight: 700 !important;
  opacity: 1 !important;
  color: var(--text, #ffffff) !important;
}

/* If multiple elements somehow receive blyrics--active, keep subsequent upcoming lines from being bold */
.blyrics-container > div.blyrics--active ~ div.blyrics--active {
  font-weight: 700 !important;
  opacity: 1 !important;
  color: var(--text, #ffffff) !important;
}

.blyrics-container > div:not(.blyrics--active) {
  font-weight: 500 !important;
  opacity: 0.35 !important;
  color: var(--text3, rgba(255, 255, 255, 0.35)) !important;
}

.blyrics--word,
.blyrics--word::after,
.blyrics-word-highlight {
  --blyrics-glow-color: transparent;
  --blyrics-highlight-color: transparent;
  transform: none !important;
}

.blyrics--instrumental-bg {
  fill: var(--text3, rgba(255, 255, 255, 0.35)) !important;
}

.blyrics--instrumental-fill {
  fill: var(--text, #ffffff) !important;
}
`;
