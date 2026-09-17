import { isPlayCountString } from "./utils";

export interface LyricLine {
  time: number; // in seconds
  text: string;
}

export interface LyricsData {
  synced: boolean;
  lines: LyricLine[];
  plain?: string;
  source?: string;
  instrumental?: boolean;
}

const lyricsCache = new Map<string, LyricsData | null>();

/**
 * Parse an LRC-formatted string into structured LyricLine array.
 */
export function parseLrc(lrcText: string): LyricLine[] {
  const lines = lrcText.split("\n");
  const result: LyricLine[] = [];
  const timeRegex = /\[(\d+):(\d+(?:\.\d+)?)\]/g;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    // Extract all timestamps in the line (some lines have multiple timestamps)
    const timestamps: number[] = [];
    let match: RegExpExecArray | null;
    let lastIndex = 0;

    while ((match = timeRegex.exec(line)) !== null) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseFloat(match[2]);
      if (!isNaN(minutes) && !isNaN(seconds)) {
        timestamps.push(minutes * 60 + seconds);
      }
      lastIndex = timeRegex.lastIndex;
    }

    const text = line.slice(lastIndex).trim();

    for (const time of timestamps) {
      result.push({ time, text });
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
 * Fetch lyrics from LRCLIB API.
 * Uses exact match endpoint first, falls back to search.
 */
export async function fetchLyrics(
  title: string,
  artist: string,
  durationSecs?: number,
  album?: string
): Promise<LyricsData | null> {
  const effectiveArtist = isPlayCountString(artist) ? "" : artist.trim();
  const rawPrimary = effectiveArtist.split(/[,&/]|feat\.|ft\./i)[0].trim();
  const primaryArtist = isPlayCountString(rawPrimary) ? "" : rawPrimary;

  const cacheKey = `${(primaryArtist || effectiveArtist).toLowerCase()} - ${title.toLowerCase()}`;
  if (lyricsCache.has(cacheKey)) {
    return lyricsCache.get(cacheKey) ?? null;
  }

  const cleanedTitle = cleanTitle(title);

  try {
    // 1. Try exact match with duration
    const params = new URLSearchParams({
      track_name: cleanedTitle || title,
    });
    if (primaryArtist || effectiveArtist) {
      params.append("artist_name", primaryArtist || effectiveArtist);
    }
    if (album) params.append("album_name", album);
    if (durationSecs && durationSecs > 0) {
      params.append("duration", Math.round(durationSecs).toString());
    }

    let res = await fetch(`https://lrclib.net/api/get?${params.toString()}`, {
      headers: {
        "User-Agent": "Vessel Music Player v1.3.5 (https://github.com/smilingknight)",
      },
    });

    if (res.ok) {
      const data = await res.json();
      const parsed = processLrclibResponse(data);
      if (parsed) {
        lyricsCache.set(cacheKey, parsed);
        return parsed;
      }
    }

    // 2. Fallback: search query
    const searchParams = new URLSearchParams({
      track_name: cleanedTitle || title,
    });
    if (primaryArtist || effectiveArtist) {
      searchParams.append("artist_name", primaryArtist || effectiveArtist);
    }
    res = await fetch(`https://lrclib.net/api/search?${searchParams.toString()}`, {
      headers: {
        "User-Agent": "Vessel Music Player v1.3.5 (https://github.com/smilingknight)",
      },
    });

    if (res.ok) {
      const searchResults: any[] = await res.json();
      if (Array.isArray(searchResults) && searchResults.length > 0) {
        // Pick best matching result (prefer synced lyrics, then closest duration)
        let best = searchResults.find((item) => item.syncedLyrics);
        if (!best) {
          best = searchResults[0];
        }

        const parsed = processLrclibResponse(best);
        if (parsed) {
          lyricsCache.set(cacheKey, parsed);
          return parsed;
        }
      }
    }

    // 3. Fallback: general query string search
    const query = primaryArtist || effectiveArtist
      ? `${primaryArtist || effectiveArtist} ${cleanedTitle}`.trim()
      : cleanedTitle.trim();
    const qParams = new URLSearchParams({ q: query });
    res = await fetch(`https://lrclib.net/api/search?${qParams.toString()}`, {
      headers: {
        "User-Agent": "Vessel Music Player v1.3.5 (https://github.com/smilingknight)",
      },
    });

    if (res.ok) {
      const qResults: any[] = await res.json();
      if (Array.isArray(qResults) && qResults.length > 0) {
        let best = qResults.find((item) => item.syncedLyrics) || qResults[0];
        const parsed = processLrclibResponse(best);
        if (parsed) {
          lyricsCache.set(cacheKey, parsed);
          return parsed;
        }
      }
    }
  } catch (err) {
    console.warn("Failed to fetch lyrics:", err);
  }

  lyricsCache.set(cacheKey, null);
  return null;
}

function processLrclibResponse(data: any): LyricsData | null {
  if (!data) return null;

  if (data.instrumental) {
    return {
      synced: false,
      lines: [],
      plain: "Инструментальный трек (без слов)",
      source: "LRCLIB",
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
        source: "LRCLIB",
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
      source: "LRCLIB",
    };
  }

  return null;
}
