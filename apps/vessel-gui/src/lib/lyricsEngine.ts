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

    const hasWordSync = braccatoLyrics.some(
      (l) =>
        (l.parts?.length ?? 0) > 1 ||
        Boolean(l.parts?.some((p) => p.durationMs > 0))
    );

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
  blyrics-letter-wave = false;
*/

:host,
braccato-lyrics,
.blyrics-container {
  background: transparent !important;
  --blyrics-font-family: inherit, system-ui, sans-serif;
  --blyrics-font-size: var(--fs-lyric-font-size, 28px);
  --blyrics-font-weight: var(--fs-lyric-font-weight, 600);
  --blyrics-line-height: 1.55;
  --blyrics-padding: 24vh 16px;
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
  --blyrics-line-scroll-duration: 380ms;
  --blyrics-line-scroll-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
  --blyrics-lyric-scroll-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
  --blyrics-lyric-transition-timing-function: cubic-bezier(0.22, 1, 0.36, 1);
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

.blyrics-container {
  padding: 24vh 16px 24vh 6px !important;
  box-sizing: border-box !important;
}

.blyrics-container > div {
  background: transparent !important;
  border-radius: 8px;
  font-size: var(--fs-lyric-font-size, 28px) !important;
  font-weight: var(--fs-lyric-font-weight, 600) !important;
  opacity: 0.35;
  color: var(--text3, rgba(255, 255, 255, 0.35)) !important;
  padding: 4px 8px !important;
  margin: var(--fs-lyric-line-gap, 28px) 0 !important;
  line-height: 1.55 !important;
  text-align: var(--fs-lyric-align, left) !important;
  transform-origin: var(--fs-lyric-align, left) center;
  transform: perspective(820px)
    translate3d(var(--vessel-tx, 0px), var(--vessel-ty, 0px), 0)
    rotateX(var(--vessel-rx, 0deg))
    scale(var(--vessel-scale, 1));
  transition:
    opacity 0.36s cubic-bezier(0.22, 1, 0.36, 1),
    color 0.32s cubic-bezier(0.22, 1, 0.36, 1),
    transform var(--vessel-tr-dur, 0.4s) var(--vessel-tr-ease, cubic-bezier(0.22, 1, 0.36, 1)),
    filter 0.38s cubic-bezier(0.22, 1, 0.36, 1);
}

.blyrics-container > div:hover {
  background: transparent !important;
  opacity: 0.85 !important;
  filter: blur(0px) !important;
}

/* Strict: Active line stays identical font-size to prevent jumpy wrapping, bolded and full opacity */
.blyrics-container > div.blyrics--active {
  font-size: var(--fs-lyric-font-size, 28px) !important;
  font-weight: var(--fs-lyric-font-weight, 700) !important;
  opacity: 1 !important;
  filter: blur(0px) !important;
  color: var(--text, #ffffff) !important;
  text-align: var(--fs-lyric-align, left) !important;
  --vessel-tx: 0px;
  --vessel-ty: 0px;
  --vessel-rx: 0deg;
  --vessel-scale: 1;
}

/* If multiple elements somehow receive blyrics--active, keep subsequent upcoming lines from being bold */
.blyrics-container > div.blyrics--active ~ div.blyrics--active {
  font-size: var(--fs-lyric-font-size, 28px) !important;
  font-weight: var(--fs-lyric-font-weight, 700) !important;
  opacity: 1 !important;
  color: var(--text, #ffffff) !important;
  text-align: var(--fs-lyric-align, left) !important;
}

.blyrics-container > div:not(.blyrics--active) {
  font-size: var(--fs-lyric-font-size, 28px) !important;
  font-weight: var(--fs-lyric-font-weight, 600) !important;
  opacity: 0.35;
  color: var(--text3, rgba(255, 255, 255, 0.35)) !important;
  text-align: var(--fs-lyric-align, left) !important;
}

.blyrics--line-main,
.blyrics-line-main,
.blyrics-highlight-run {
  perspective: 720px;
}

.blyrics--word,
.blyrics--word::after,
.blyrics-word-highlight {
  --blyrics-glow-color: transparent;
  --blyrics-highlight-color: transparent;
  transform-origin: center 55%;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

/* Text styles (composited cleanly via CSS vars, no text-shadow dark box artifact) */
braccato-lyrics[data-lyrics-style="cinema"] .blyrics-container > div:not(.blyrics--active) {
  opacity: 0.16;
  --vessel-scale: 0.95;
  filter: blur(clamp(0px, calc(max(0, var(--blyrics-line-scroll-abs-relative-index, 1) - 1) * 0.9px), 3.2px));
}
braccato-lyrics[data-lyrics-style="cinema"] .blyrics-container > div.blyrics--active {
  --vessel-scale: 1.03;
}

braccato-lyrics[data-lyrics-style="shift"] .blyrics-container > div:not(.blyrics--active) {
  opacity: 0.28;
  --vessel-scale: 0.97;
}
braccato-lyrics[data-lyrics-style="shift"] .blyrics-container > div.blyrics--active {
  --vessel-tx: 12px;
  --vessel-scale: 1.015;
}

braccato-lyrics[data-lyrics-style="blur"] .blyrics-container > div:not(.blyrics--active) {
  opacity: clamp(0.22, calc(0.52 - var(--blyrics-line-scroll-abs-relative-index, 1) * 0.08), 0.52);
  filter: blur(clamp(3.6px, calc(2.5px + var(--blyrics-line-scroll-abs-relative-index, 1) * 1.1px), 6px));
}

/* Line sync mode: never run 50ms fake word cascade; whole active line transitions cleanly */
braccato-lyrics[data-lyrics-sync="line"] .blyrics-highlight-run {
  display: none !important;
}
braccato-lyrics[data-lyrics-sync="line"] .blyrics--active .blyrics--word {
  color: var(--text, #ffffff) !important;
}
braccato-lyrics[data-lyrics-sync="line"] .blyrics--word {
  transform: none !important;
  filter: none !important;
  animation: none !important;
  transition: none !important;
}
braccato-lyrics[data-lyrics-sync="line"] .blyrics-line-main .blyrics--word {
  opacity: 1 !important;
}

/* --- Line-level smooth transitions (zero keyframes reset, zero jerk) --- */
braccato-lyrics[data-lyrics-sync="line"][data-lyrics-anim="wave"] .blyrics-container > div:not(.blyrics--active) {
  --vessel-ty: 8px;
  --vessel-rx: -8deg;
}
braccato-lyrics[data-lyrics-sync="line"][data-lyrics-anim="wave"] .blyrics-container > div.blyrics--active {
  --vessel-ty: 0px;
  --vessel-rx: 0deg;
  --vessel-tr-dur: 0.64s;
  --vessel-tr-ease: cubic-bezier(0.37, 0, 0.63, 1);
}

braccato-lyrics[data-lyrics-sync="line"][data-lyrics-anim="blur"] .blyrics-container > div:not(.blyrics--active) {
  filter: blur(4px);
}

braccato-lyrics[data-lyrics-sync="line"][data-lyrics-anim="flip3d"] .blyrics-container > div:not(.blyrics--active) {
  --vessel-rx: -28deg;
  --vessel-ty: 6px;
}

braccato-lyrics[data-lyrics-sync="line"][data-lyrics-anim="bounce"] .blyrics-container > div:not(.blyrics--active) {
  --vessel-ty: 5px;
  --vessel-scale: 0.98;
}
braccato-lyrics[data-lyrics-sync="line"][data-lyrics-anim="bounce"] .blyrics-container > div.blyrics--active {
  --vessel-tr-dur: 0.48s;
  --vessel-tr-ease: cubic-bezier(0.34, 1.28, 0.64, 1);
}

braccato-lyrics[data-lyrics-sync="line"][data-lyrics-anim="drift"] .blyrics-container > div:not(.blyrics--active) {
  --vessel-ty: 10px;
  --vessel-tx: -8px;
}
braccato-lyrics[data-lyrics-sync="line"][data-lyrics-anim="drift"] .blyrics-container > div.blyrics--active {
  --vessel-tr-dur: 0.72s;
  --vessel-tr-ease: cubic-bezier(0.16, 1, 0.3, 1);
}

/* --- Word-level animations (strictly only when sync=word and real word parts exist) --- */

/* 1. Волна (Wave): плавная синусоидальная волна с лёгким покачиванием, отличная от отскока */
@keyframes vessel-word-wave {
  0% { transform: translate3d(-0.04em, 0.04em, 0) rotate(-1.8deg); }
  45% { transform: translate3d(0.03em, -0.09em, 0) rotate(1.4deg); }
  100% { transform: translate3d(0, 0, 0) rotate(0deg); }
}
braccato-lyrics[data-lyrics-sync="word"][data-lyrics-anim="wave"] .blyrics--active .blyrics--word[data-word-state="active"],
braccato-lyrics[data-lyrics-sync="word"][data-lyrics-anim="wave"] .blyrics--active .blyrics--word[data-word-state="past"] {
  animation: vessel-word-wave 0.68s cubic-bezier(0.37, 0, 0.63, 1) both;
}

/* 2. Размытие (Blur): неактивные строки размыты глубже (3.6-6px), будущие слова чуть мягче (2.4px) и плавно фокусируются */
braccato-lyrics[data-lyrics-sync="word"][data-lyrics-anim="blur"] .blyrics--word {
  transition: filter 0.42s cubic-bezier(0.22, 1, 0.36, 1);
}
braccato-lyrics[data-lyrics-sync="word"][data-lyrics-anim="blur"] .blyrics-line-main .blyrics--word {
  transition:
    filter 0.42s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.42s cubic-bezier(0.22, 1, 0.36, 1);
}
braccato-lyrics[data-lyrics-sync="word"][data-lyrics-anim="blur"] .blyrics--active .blyrics--word:not([data-word-state="active"]):not([data-word-state="past"]) {
  filter: blur(2.4px);
}
braccato-lyrics[data-lyrics-sync="word"][data-lyrics-anim="blur"] .blyrics--active .blyrics-line-main .blyrics--word:not([data-word-state="active"]):not([data-word-state="past"]) {
  opacity: 0.56;
}
braccato-lyrics[data-lyrics-sync="word"][data-lyrics-anim="blur"] .blyrics--active .blyrics--word[data-word-state="active"],
braccato-lyrics[data-lyrics-sync="word"][data-lyrics-anim="blur"] .blyrics--active .blyrics--word[data-word-state="past"] {
  filter: blur(0px);
}
braccato-lyrics[data-lyrics-sync="word"][data-lyrics-anim="blur"] .blyrics--active .blyrics-line-main .blyrics--word[data-word-state="active"],
braccato-lyrics[data-lyrics-sync="word"][data-lyrics-anim="blur"] .blyrics--active .blyrics-line-main .blyrics--word[data-word-state="past"] {
  opacity: 1;
}
braccato-lyrics[data-lyrics-sync="word"][data-lyrics-anim="blur"]:not([data-lyrics-style="blur"]) .blyrics-container > div:not(.blyrics--active) {
  filter: blur(3.6px);
}

/* 3. 3D Переворот (3D Flip): исходное состояние сразу на неспетых словах — ноль скачка при смене строки */
braccato-lyrics[data-lyrics-sync="word"][data-lyrics-anim="flip3d"] .blyrics--word {
  transition: transform 0.54s cubic-bezier(0.22, 1, 0.36, 1);
}
braccato-lyrics[data-lyrics-sync="word"][data-lyrics-anim="flip3d"] .blyrics-line-main .blyrics--word {
  transition:
    transform 0.54s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.42s ease;
}
braccato-lyrics[data-lyrics-sync="word"][data-lyrics-anim="flip3d"] .blyrics--line .blyrics--word:not([data-word-state="active"]):not([data-word-state="past"]) {
  transform: perspective(600px) rotateX(-74deg) scale(0.93);
}
braccato-lyrics[data-lyrics-sync="word"][data-lyrics-anim="flip3d"] .blyrics--line .blyrics-line-main .blyrics--word:not([data-word-state="active"]):not([data-word-state="past"]) {
  opacity: 0.45;
}
braccato-lyrics[data-lyrics-sync="word"][data-lyrics-anim="flip3d"] .blyrics--word[data-word-state="active"],
braccato-lyrics[data-lyrics-sync="word"][data-lyrics-anim="flip3d"] .blyrics--word[data-word-state="past"] {
  transform: perspective(600px) rotateX(0deg) scale(1);
}
braccato-lyrics[data-lyrics-sync="word"][data-lyrics-anim="flip3d"] .blyrics-line-main .blyrics--word[data-word-state="active"],
braccato-lyrics[data-lyrics-sync="word"][data-lyrics-anim="flip3d"] .blyrics-line-main .blyrics--word[data-word-state="past"] {
  opacity: 1;
}

/* 4. Отскок (Bounce): деликатный лёгкий микро-импульс */
@keyframes vessel-word-bounce {
  0% { transform: translate3d(0, 0.03em, 0) scale(0.985); }
  45% { transform: translate3d(0, -0.06em, 0) scale(1.025); }
  78% { transform: translate3d(0, 0.01em, 0) scale(0.996); }
  100% { transform: translate3d(0, 0, 0) scale(1); }
}
braccato-lyrics[data-lyrics-sync="word"][data-lyrics-anim="bounce"] .blyrics--active .blyrics--word[data-word-state="active"],
braccato-lyrics[data-lyrics-sync="word"][data-lyrics-anim="bounce"] .blyrics--active .blyrics--word[data-word-state="past"] {
  animation: vessel-word-bounce 0.42s cubic-bezier(0.22, 1, 0.36, 1) both;
}

/* 5. Дрифт (Drift): неспетые слова изначально в покое сдвига — при переходе строки ничего не дёргается */
braccato-lyrics[data-lyrics-sync="word"][data-lyrics-anim="drift"] .blyrics--word {
  transition: transform 0.62s cubic-bezier(0.16, 1, 0.3, 1);
}
braccato-lyrics[data-lyrics-sync="word"][data-lyrics-anim="drift"] .blyrics-line-main .blyrics--word {
  transition:
    transform 0.62s cubic-bezier(0.16, 1, 0.3, 1),
    opacity 0.5s ease;
}
braccato-lyrics[data-lyrics-sync="word"][data-lyrics-anim="drift"] .blyrics--line .blyrics--word:not([data-word-state="active"]):not([data-word-state="past"]) {
  transform: translate3d(-0.1em, 0.07em, 0);
}
braccato-lyrics[data-lyrics-sync="word"][data-lyrics-anim="drift"] .blyrics--line .blyrics-line-main .blyrics--word:not([data-word-state="active"]):not([data-word-state="past"]) {
  opacity: 0.56;
}
braccato-lyrics[data-lyrics-sync="word"][data-lyrics-anim="drift"] .blyrics--word[data-word-state="active"],
braccato-lyrics[data-lyrics-sync="word"][data-lyrics-anim="drift"] .blyrics--word[data-word-state="past"] {
  transform: translate3d(0, 0, 0);
}
braccato-lyrics[data-lyrics-sync="word"][data-lyrics-anim="drift"] .blyrics-line-main .blyrics--word[data-word-state="active"],
braccato-lyrics[data-lyrics-sync="word"][data-lyrics-anim="drift"] .blyrics-line-main .blyrics--word[data-word-state="past"] {
  opacity: 1;
}

.blyrics--instrumental-bg {
  fill: var(--text3, rgba(255, 255, 255, 0.35)) !important;
}

.blyrics--instrumental-fill {
  fill: var(--text, #ffffff) !important;
}
`;
