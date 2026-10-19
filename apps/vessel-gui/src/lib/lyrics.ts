import { isPlayCountString } from "./utils";
import { fetchServerLyrics } from "../api/commands";

export interface LyricWord {
  time: number; // in seconds
  duration?: number;
  text: string;
}

export interface LyricLine {
  time: number; // in seconds
  text: string;
  words?: LyricWord[];
}

export interface LyricsSource {
  id: string;
  name: string;
}

export const LYRICS_SOURCES: LyricsSource[] = [
  { id: "cadence", name: "Cadence" },
  { id: "lrclib", name: "LRCLIB" },
];

export interface LyricsData {
  synced: boolean;
  lines: LyricLine[];
  plain?: string;
  source?: string;
  instrumental?: boolean;
}

const lyricsCache = new Map<string, LyricsData | null>();

/**
 * Parse an LRC or Enhanced LRC string (with word/syllable timings <mm:ss.xx>word)
 * into structured LyricLine array.
 */
export function parseLrc(lrcText: string): LyricLine[] {
  const lines = lrcText.split("\n");
  const result: LyricLine[] = [];
  const lineTimeRegex = /\[(\d+):(\d+(?:\.\d+)?)\]/g;
  const wordTimeRegex = /<(\d+):(\d+(?:\.\d+)?)>([^<]*)/g;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Extract all line timestamps (some lines have multiple timestamps)
    const timestamps: number[] = [];
    let match: RegExpExecArray | null;
    let lastIndex = 0;

    while ((match = lineTimeRegex.exec(line)) !== null) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseFloat(match[2]);
      if (!isNaN(minutes) && !isNaN(seconds)) {
        timestamps.push(minutes * 60 + seconds);
      }
      lastIndex = lineTimeRegex.lastIndex;
    }

    const rawContent = line.slice(lastIndex).trim();
    if (!rawContent && timestamps.length === 0) continue;

    // Check if syllable/word timestamps are present in the line (<mm:ss.xx>word)
    let words: LyricWord[] | undefined;
    let cleanText = rawContent;

    if (rawContent.includes("<") && rawContent.includes(">")) {
      const parsedWords: LyricWord[] = [];
      let wMatch: RegExpExecArray | null;
      wordTimeRegex.lastIndex = 0;
      while ((wMatch = wordTimeRegex.exec(rawContent)) !== null) {
        const wMin = parseInt(wMatch[1], 10);
        const wSec = parseFloat(wMatch[2]);
        const wText = wMatch[3];
        if (!isNaN(wMin) && !isNaN(wSec) && wText) {
          parsedWords.push({
            time: wMin * 60 + wSec,
            text: wText,
          });
        }
      }
      if (parsedWords.length > 0) {
        for (let i = 0; i < parsedWords.length; i++) {
          const nextTime = parsedWords[i + 1]?.time ?? (parsedWords[i].time + 0.6);
          parsedWords[i].duration = Math.max(0.08, nextTime - parsedWords[i].time);
        }
        words = parsedWords;
        cleanText = rawContent.replace(/<[^>]+>/g, "").trim();
      }
    }

    for (const time of timestamps) {
      result.push({ time, text: cleanText, words });
    }
  }

  // Sort chronologically
  result.sort((a, b) => a.time - b.time);
  return result;
}

/**
 * Clean track title by removing video tags, remastered notes, etc.
 */
function cleanTitle(title: string): string {
  return title
    .replace(/\s*[\(\[](official\s*(music\s*)?(video|audio)|lyric\s*video|remaster(ed)?\s*\d*|audio|hq|hd)[\)\]]/gi, "")
    .replace(/\s*-\s*(official\s*(music\s*)?(video|audio)|remaster(ed)?\s*\d*)/gi, "")
    .trim();
}

/**
 * Fetch lyrics from selected source (Cadence or LRCLIB).
 * Uses exact match endpoint first, falls back to search.
 */
export async function fetchLyrics(
  title: string,
  artist: string,
  durationSecs?: number,
  album?: string,
  sourceId: string = "cadence"
): Promise<LyricsData | null> {
  const effectiveArtist = isPlayCountString(artist) ? "" : artist.trim();
  const rawPrimary = effectiveArtist.split(/[,&/]|feat\.|ft\./i)[0].trim();
  const primaryArtist = isPlayCountString(rawPrimary) ? "" : rawPrimary;

  const displaySource = sourceId === "cadence" ? "Cadence" : "LRCLIB";
  const cacheKey = `${sourceId}:${(primaryArtist || effectiveArtist).toLowerCase()} - ${title.toLowerCase()}`;
  if (lyricsCache.has(cacheKey)) {
    return lyricsCache.get(cacheKey) ?? null;
  }

  const cleanedTitle = cleanTitle(title);

  try {
    // 1. Try exact match with duration
    const exactData = await fetchServerLyrics({
      trackName: cleanedTitle || title,
      artistName: primaryArtist || effectiveArtist || undefined,
      albumName: album || undefined,
      duration: durationSecs && durationSecs > 0 ? Math.round(durationSecs) : undefined,
      search: false,
    }).catch(() => null);

    if (exactData && !exactData.detail) {
      const parsed = processLyricsResponse(exactData, displaySource);
      if (parsed) {
        lyricsCache.set(cacheKey, parsed);
        return parsed;
      }
    }

    // 2. Fallback: search query
    const searchData = await fetchServerLyrics({
      trackName: cleanedTitle || title,
      artistName: primaryArtist || effectiveArtist || undefined,
      search: true,
    }).catch(() => null);

    if (Array.isArray(searchData) && searchData.length > 0) {
      let best = searchData.find((item: any) => item.syncedLyrics) || searchData[0];
      const parsed = processLyricsResponse(best, displaySource);
      if (parsed) {
        lyricsCache.set(cacheKey, parsed);
        return parsed;
      }
    }

    // 3. Fallback: general query string search
    const query = primaryArtist || effectiveArtist
      ? `${primaryArtist || effectiveArtist} ${cleanedTitle}`.trim()
      : cleanedTitle.trim();
    const queryData = await fetchServerLyrics({
      q: query,
      search: true,
    }).catch(() => null);

    if (Array.isArray(queryData) && queryData.length > 0) {
      let best = queryData.find((item: any) => item.syncedLyrics) || queryData[0];
      const parsed = processLyricsResponse(best, displaySource);
      if (parsed) {
        lyricsCache.set(cacheKey, parsed);
        return parsed;
      }
    }
  } catch (err) {
    console.warn(`Failed to fetch lyrics from ${displaySource}:`, err);
  }

  lyricsCache.set(cacheKey, null);
  return null;
}

function processLyricsResponse(data: any, sourceName: string): LyricsData | null {
  if (!data) return null;

  if (data.instrumental) {
    return {
      synced: false,
      lines: [],
      plain: "Инструментальный трек (без слов)",
      source: sourceName,
      instrumental: true,
    };
  }

  if (data.syncedLyrics && typeof data.syncedLyrics === "string") {
    const lines = parseLrc(data.syncedLyrics);
    if (lines.length > 0) {
      return {
        synced: true,
        lines,
        plain: data.plainLyrics || undefined,
        source: sourceName,
      };
    }
  }

  if (data.plainLyrics && typeof data.plainLyrics === "string") {
    const plainLines: LyricLine[] = data.plainLyrics
      .split("\n")
      .map((text: string, i: number) => ({ time: i, text: text.trim() }))
      .filter((l: LyricLine) => l.text.length > 0);

    return {
      synced: false,
      lines: plainLines,
      plain: data.plainLyrics,
      source: sourceName,
    };
  }

  return null;
}
