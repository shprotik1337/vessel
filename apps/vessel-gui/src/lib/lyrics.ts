import { isPlayCountString } from "./utils";
import { fetchServerLyrics } from "../api/commands";
import { parseRawLyrics } from "./lyricsEngine";
import type { Lyric } from "@braccato/parsers";

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
  braccatoLyrics?: Lyric[];
  rawLyrics?: string;
  plain?: string;
  source?: string;
  instrumental?: boolean;
}

const lyricsCache = new Map<string, LyricsData | null>();

/**
 * Synthesizes word-by-word timing for lines that only contain line-level timestamps.
 * Dynamically computes a realistic vocal window (not stretching across long pauses)
 * and distributes time among words proportional to phonetic length and vowels.
 */
export function synthesizeWordTimings(lines: LyricLine[], totalDuration?: number): LyricLine[] {
  if (!lines || lines.length === 0) return lines;

  return lines.map((line, idx) => {
    // If line already has word timings from Enhanced LRC, keep them
    if (line.words && line.words.length > 0) {
      return line;
    }

    const trimmed = line.text.trim();
    if (!trimmed) {
      return { ...line, words: [] };
    }

    const rawWords = trimmed.split(/\s+/).filter(Boolean);
    if (rawWords.length === 0) {
      return { ...line, words: [] };
    }

    // Interval to next line
    const nextLine = lines[idx + 1];
    const rawGap = nextLine
      ? Math.max(0.5, nextLine.time - line.time)
      : totalDuration && totalDuration > line.time
      ? Math.min(6.0, Math.max(1.5, totalDuration - line.time))
      : Math.max(2.0, rawWords.length * 0.55);

    // Natural vocal window: singers don't sing continuously until the next line starts.
    // Cut off the trailing breath/instrumental pause so animation doesn't drag or feel slow.
    const maxNaturalDuration = Math.max(1.2, rawWords.length * 0.62);
    const vocalDuration = Math.max(
      0.6,
      Math.min(
        maxNaturalDuration,
        rawGap > 1.8 ? rawGap - 0.45 : rawGap * 0.85
      )
    );

    // Calculate phonetic weight per word (vowels have higher weight as they are held)
    const weights = rawWords.map((word) => {
      const len = word.length;
      const vowels = (word.match(/[aeiouyаеёиоуыэюя]/gi) || []).length;
      const hasCadencePunct = /[,.!?…]$/.test(word);
      return Math.max(1, len + vowels * 1.2 + (hasCadencePunct ? 1.5 : 0));
    });

    const totalWeight = weights.reduce((acc, w) => acc + w, 0) || 1;

    let curTime = line.time;
    const words: LyricWord[] = rawWords.map((word, wIdx) => {
      const share = weights[wIdx] / totalWeight;
      const wordDur = Math.max(0.16, vocalDuration * share);
      const wordObj: LyricWord = {
        time: curTime,
        duration: wordDur,
        text: word,
      };
      curTime += wordDur;
      return wordObj;
    });

    return {
      ...line,
      words,
    };
  });
}

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
    const parsed = parseRawLyrics(data.syncedLyrics);
    if (parsed.syncedLines.length > 0 || parsed.braccatoLyrics.length > 0) {
      return {
        synced: true,
        lines: parsed.syncedLines,
        braccatoLyrics: parsed.braccatoLyrics,
        rawLyrics: data.syncedLyrics,
        plain: data.plainLyrics || parsed.plainLyrics || undefined,
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

export interface LyricsCandidateOption {
  provider: string;
  syncLevel: "word_level" | "line_level" | "plain";
  format: "richsync" | "ttml" | "lrc" | "plain";
  content: string;
  isMeta?: boolean;
  source?: string;
}

export function parseCandidateToLyricsData(
  candidate: LyricsCandidateOption,
  durationSecs?: number
): LyricsData {
  if (candidate.format === "plain") {
    const plainLines: LyricLine[] = candidate.content
      .split("\n")
      .map((text: string, i: number) => ({ time: i, text: text.trim() }))
      .filter((l: LyricLine) => l.text.length > 0);
    return {
      synced: false,
      lines: plainLines,
      plain: candidate.content,
      source: candidate.provider,
    };
  }

  const parsed = parseRawLyrics(candidate.content, durationSecs);
  return {
    synced: parsed.syncedLines.length > 0 || parsed.braccatoLyrics.length > 0,
    lines: parsed.syncedLines,
    braccatoLyrics: parsed.braccatoLyrics,
    rawLyrics: candidate.content,
    plain: parsed.plainLyrics || undefined,
    source: candidate.provider,
  };
}

export async function fetchLyricsMulti(
  title: string,
  artist: string,
  durationSecs?: number,
  album?: string
): Promise<{
  candidates: LyricsCandidateOption[];
  activeProvider: string;
  initialLyrics: LyricsData | null;
}> {
  const effectiveArtist = isPlayCountString(artist) ? "" : artist.trim();
  const rawPrimary = effectiveArtist.split(/[,&/]|feat\.|ft\./i)[0].trim();
  const primaryArtist = isPlayCountString(rawPrimary) ? "" : rawPrimary;
  const cleanedTitle = cleanTitle(title);

  try {
    const data = await fetchServerLyrics({
      trackName: cleanedTitle || title,
      artistName: primaryArtist || effectiveArtist || undefined,
      albumName: album || undefined,
      duration: durationSecs && durationSecs > 0 ? Math.round(durationSecs) : undefined,
      search: false,
    });

    if (data && Array.isArray(data.candidates) && data.candidates.length > 0) {
      const candidates: LyricsCandidateOption[] = data.candidates.map((c: any) => ({
        provider: c.provider,
        syncLevel: c.sync_level,
        format: c.format,
        content: c.content,
        isMeta: c.is_meta,
        source: c.source,
      }));

      const active = candidates[0];
      const initialLyrics = parseCandidateToLyricsData(active, durationSecs);
      return {
        candidates,
        activeProvider: active.provider,
        initialLyrics,
      };
    }

    // Fallback if legacy response returned
    if (data && (data.syncedLyrics || data.plainLyrics)) {
      const parsed = processLyricsResponse(data, "Vessel");
      const singleCandidate: LyricsCandidateOption = {
        provider: "Vessel",
        syncLevel: data.syncedLyrics ? "line_level" : "plain",
        format: data.syncedLyrics ? "lrc" : "plain",
        content: data.syncedLyrics || data.plainLyrics,
      };
      return {
        candidates: [singleCandidate],
        activeProvider: "Vessel",
        initialLyrics: parsed,
      };
    }
  } catch (err) {
    console.warn("Failed to fetch multi lyrics:", err);
  }

  return {
    candidates: [],
    activeProvider: "",
    initialLyrics: null,
  };
}
