import type { ImageProxyConfig, PlaybackCapability, TrackRef } from "../api/types";

let activeImageProxy: ImageProxyConfig | null = null;

export function setActiveImageProxy(proxy: ImageProxyConfig | null | undefined) {
  activeImageProxy = proxy ?? null;
}

export function getActiveImageProxy(): ImageProxyConfig | null {
  return activeImageProxy;
}

function inferProviderFromUrl(url: string): string | null {
  const lower = url.toLowerCase();
  if (lower.includes(".scdn.co") || lower.includes("spotifycdn.com")) {
    return "spotify";
  }
  if (lower.includes(".sndcdn.com")) {
    return "soundcloud";
  }
  if (lower.includes(".dzcdn.net") || lower.includes("deezer.com")) {
    return "deezer";
  }
  if (
    lower.includes(".googleusercontent.com") ||
    lower.includes("ytimg.com") ||
    lower.includes("ggpht.com") ||
    lower.includes("youtube.com")
  ) {
    return "youtube_music";
  }
  if (
    lower.includes("avatars.yandex.net") ||
    lower.includes("yandex.ru") ||
    lower.includes("yandex.net")
  ) {
    return "yandex_music";
  }
  return null;
}

export function resolveArtworkUrl(url: string | null | undefined): string | undefined {
  if (!url || typeof url !== "string") return undefined;
  const trimmed = url.trim();
  if (!trimmed) return undefined;

  // Прямая загрузка для российских сервисов (Яндекс Музыка не блокируется в РФ)
  if (
    trimmed.includes("avatars.yandex.net") ||
    trimmed.includes("yandex.ru") ||
    trimmed.includes("yandex.net")
  ) {
    return trimmed;
  }

  // Локальные ассеты, data URI, blob
  if (
    trimmed.startsWith("data:") ||
    trimmed.startsWith("blob:") ||
    trimmed.startsWith("/") ||
    trimmed.startsWith("asset://") ||
    trimmed.startsWith("http://localhost") ||
    trimmed.startsWith("http://127.0.0.1")
  ) {
    return trimmed;
  }

  // Защита от повторного проксирования
  if (trimmed.includes("/api/v1/image?")) {
    return trimmed;
  }

  // VPS используется ТОЛЬКО если активен сервер и данный провайдер переключен на «Сервер».
  // В локальном режиме всё обрабатывается строго локально, VPS никак не взаимодействует.
  if (activeImageProxy?.server_url && activeImageProxy.routed_providers?.length > 0) {
    const prov = inferProviderFromUrl(trimmed);
    if (prov && !activeImageProxy.routed_providers.includes(prov)) {
      // Провайдер стоит на «Локально» — грузим напрямую
      return trimmed;
    }

    const base = activeImageProxy.server_url.replace(/\/+$/, "");
    const params = new URLSearchParams();
    params.set("url", trimmed);
    if (activeImageProxy.token) {
      params.set("token", activeImageProxy.token);
    }
    return `${base}/api/v1/image?${params.toString()}`;
  }

  // Чисто локальный режим — напрямую, без обращения к серверу
  return trimmed;
}

export function formatTime(ms: number | null | undefined): string {
  if (ms == null || ms <= 0) return "0:00";
  const totalSeconds = Math.round(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

export function formatDuration(ms: number | null | undefined): string {
  return formatTime(ms);
}

export function relativeTime(ms: number): string {
  const diff = Date.now() - ms;
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 5) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

export function providerLabel(provider: string): string {
  switch (provider) {
    case "soundcloud":
    case "sound_cloud":
      return "SoundCloud";
    case "yandex":
    case "yandex_music":
      return "Yandex Music";
    case "deezer":
      return "Deezer";
    case "spotify":
      return "Spotify";
    case "youtube_music":
    case "you_tube_music":
      return "YouTube Music";
    default:
      return provider;
  }
}

export function isPlayCountString(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text.trim();
  if (!t) return false;

  // Чистые счётчики вида "1.6M", "295K", "100"
  if (/^[\d.,]+\s*[KMBkmb]?$/i.test(t)) {
    return true;
  }

  // Счётчики обязательно содержат цифры
  if (!/\d/.test(t)) {
    return false;
  }

  // И слово прослушиваний/просмотров как отдельное слово/корень
  return (
    /\b(plays?|views?|streams?|played|listens?)\b/i.test(t) ||
    /прослушиван|просмотр|воспроизведен|reproducci|reproduç|écoute|ecoute|lecture|wiedergabe|aufruf|odtworze/i.test(t) ||
    /\b(thousand|million|billion|тыс|млн|млрд)\b/i.test(t)
  );
}

export function isJunkArtistString(s: string): boolean {
  if (!s) return true;
  const t = s.trim().toLowerCase();
  if (t.length <= 1) return true;
  return (
    isPlayCountString(s) ||
    /\b(ballsack|w9dz)\b/iu.test(t) ||
    /(^|[\s.,_\-/])(leak|leaks|unreleased|archive|vault|reupload|snippet|snippets|uploader|reposter)([\s.,_\-/]|$)/iu.test(t) ||
    /рифмы\s*и\s*панчи/iu.test(t) ||
    /(^|[\s.,_\-/])рип([\s.,_\-/]|$)/iu.test(t) ||
    /rhymes\s*&?\s*punches/iu.test(t) ||
    /finesse\s*(music)?/iu.test(t) ||
    /trap\s*city/iu.test(t) ||
    /soundclout/iu.test(t) ||
    /(^|[\s.,_\-/])repost(s)?([\s.,_\-/]|$)/iu.test(t) ||
    /(^|[\s.,_\-/])promo([\s.,_\-/]|$)/iu.test(t) ||
    /trustees/iu.test(t) ||
    /(^|[\s.,_\-/])sccc([\s.,_\-/]|$)/iu.test(t) ||
    /board\s*of/iu.test(t) ||
    /community\s*college/iu.test(t) ||
    /(^|[\s.,_\-/])meeting([\s.,_\-/]|$)/iu.test(t) ||
    /audiobook/iu.test(t) ||
    /\.(mp3|wav|flac|m4a)$/iu.test(t) ||
    /https?:/iu.test(t) ||
    /www\./iu.test(t) ||
    /various\s*artists/iu.test(t) ||
    /(^|[\s.,_\-/])va([\s.,_\-/]|$)/iu.test(t)
  );
}

export function isRealArtistName(name: string): boolean {
  if (!name) return false;
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 60) return false;
  if (!/[a-zа-я0-9]/i.test(trimmed)) return false;
  return !isJunkArtistString(trimmed);
}

export function isJunkCollection(item: { title?: string; subtitle?: string } | null | undefined): boolean {
  if (!item || !item.title) return true;
  const t = item.title.toLowerCase();
  const sub = (item.subtitle || "").toLowerCase();
  const junkRegex = /\b(trustee(s)?|board\s*of|qualification|lecture|syllabus|audiobook|community\s*college|meeting\s*minutes|school\s*board|exam\s*prep|parliament|court\s*hearing)\b/i;
  return junkRegex.test(t) || junkRegex.test(sub);
}

export function normalizeAlbumTitle(title: string, author?: string): string {
  let t = (title || "").trim();
  if (author) {
    const artEscaped = author.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(`^${artEscaped}\\s*[-–—:]\\s*`, "i"), "");
    t = t.replace(new RegExp(`\\s*[-–—:]\\s*${artEscaped}$`, "i"), "");
  }
  t = t.replace(/^[^-–—:]{2,30}\s*[-–—:]\s*/, (match) => {
    const rem = t.slice(match.length).trim();
    return rem.length >= 2 ? "" : match;
  });
  return t.toLowerCase().replace(/[\s\-_.,/\\()[\]!]+/g, " ").trim();
}

export function cleanAlbumTitle(title: string, author?: string): string {
  let t = (title || "").trim();
  if (author) {
    const artEscaped = author.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    t = t.replace(new RegExp(`^${artEscaped}\\s*[-–—:]\\s*`, "i"), "").trim();
  }
  return t || title;
}

export function balanceItemsOrganicRandom<T>(
  items: T[],
  targetCount: number,
  activeProviders?: string[],
  getProvider: (item: T) => string = (item: any) => item?.provider || "unknown"
): T[] {
  if (!items || items.length === 0 || targetCount <= 0) return [];

  const buckets = new Map<string, T[]>();
  for (const item of items) {
    if (!item) continue;
    const p = getProvider(item);
    if (activeProviders && activeProviders.length > 0 && !activeProviders.includes(p)) continue;
    if (!buckets.has(p)) buckets.set(p, []);
    buckets.get(p)!.push(item);
  }

  const providers = Array.from(buckets.keys());
  if (providers.length === 0) return [];
  if (providers.length === 1) return buckets.get(providers[0])!.slice(0, targetCount);

  // Lightly shuffle within each bucket for natural freshness
  for (const p of providers) {
    const list = buckets.get(p)!;
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  }

  const result: T[] = [];
  const indices = new Map<string, number>();
  for (const p of providers) indices.set(p, 0);

  const minPerProv = Math.max(1, Math.floor(targetCount / providers.length) - 1);
  const maxPerProv = Math.ceil(targetCount / providers.length) + 1;
  let lastProvider: string | null = null;

  while (result.length < targetCount) {
    let available = providers.filter(
      (p) => (indices.get(p) || 0) < (buckets.get(p)?.length || 0) && (indices.get(p) || 0) < maxPerProv
    );
    if (available.length === 0) {
      available = providers.filter((p) => (indices.get(p) || 0) < (buckets.get(p)?.length || 0));
    }
    if (available.length === 0) break;

    // Prioritize providers that have not yet reached minPerProv
    const underRepresented = available.filter((p) => (indices.get(p) || 0) < minPerProv);
    let pool = underRepresented.length > 0 ? underRepresented : available;

    if (pool.length > 1 && lastProvider) {
      const other = pool.filter((p) => p !== lastProvider);
      if (other.length > 0) pool = other;
    }

    const minPicks = Math.min(...pool.map((p) => indices.get(p) || 0));
    const viable = pool.filter((p) => (indices.get(p) || 0) <= minPicks + 1);
    const nextProvider = viable[Math.floor(Math.random() * viable.length)];

    lastProvider = nextProvider;
    const list = buckets.get(nextProvider)!;
    const curIdx = indices.get(nextProvider)!;
    const remainingInBucket = list.length - curIdx;
    const remainingToTarget = targetCount - result.length;

    // Random burst of 1, 2, or 3 items
    const desiredBurst = Math.floor(Math.random() * 3) + 1;
    const maxAllowedForProvider = maxPerProv - curIdx;
    const maxBurst = Math.max(1, Math.min(desiredBurst, remainingInBucket, remainingToTarget, maxAllowedForProvider > 0 ? maxAllowedForProvider : 3));
    const burst = Math.min(desiredBurst, maxBurst);

    for (let i = 0; i < burst; i++) {
      result.push(list[curIdx + i]);
    }
    indices.set(nextProvider, curIdx + burst);
  }

  return result;
}

export function balanceCollectionsOrganic(items: any[], targetCount: number, activeProviders?: string[]): any[] {
  const seen = new Set<string>();
  const deduped: any[] = [];

  for (const item of items) {
    if (!item || !item.title) continue;
    const author = item.subtitle || item.author || item.artist || "";
    const titleKey = normalizeAlbumTitle(item.title, author);
    const idKey = `${item.provider}:${item.id || item.web_url}`;
    const artUrl = (item.cover_url || item.artwork_url || item.coverUrl || "").trim();
    const artKey = artUrl.length > 25 ? artUrl : null;

    if (seen.has(idKey)) continue;
    if (titleKey && seen.has(titleKey)) continue;
    if (artKey && seen.has(artKey)) continue;

    seen.add(idKey);
    if (titleKey) seen.add(titleKey);
    if (artKey) seen.add(artKey);

    deduped.push(item);
  }

  return balanceItemsOrganicRandom(deduped, targetCount, activeProviders, (it) => it.provider);
}

export function balanceProvidersOrganic(tracks: TrackRef[], targetCount: number): TrackRef[] {
  const buckets = new Map<string, TrackRef[]>();
  const perProviderSeen = new Map<string, Set<string>>();

  const getSemanticKey = (t: TrackRef) => {
    const artist = (t.artists && t.artists.length > 0 ? t.artists[0] : "").toLowerCase().trim();
    const title = (t.title || "").toLowerCase().trim();
    if (!artist && !title) return "";
    return `${artist}:::${title}`;
  };

  for (const t of tracks) {
    const p = t.provider;
    if (!buckets.has(p)) {
      buckets.set(p, []);
      perProviderSeen.set(p, new Set());
    }
    const seenSet = perProviderSeen.get(p)!;
    const k = trackKey(t);
    const sk = getSemanticKey(t);

    if (seenSet.has(k) || (sk !== "" && seenSet.has(sk))) continue;
    seenSet.add(k);
    if (sk !== "") seenSet.add(sk);

    buckets.get(p)!.push(t);
  }

  const providers = Array.from(buckets.keys());
  if (providers.length === 0) return [];

  const normalizeArt = (s: string) => s.toLowerCase().replace(/[^a-zа-я0-9]/gi, "").trim();
  const getArts = (t: TrackRef) => {
    const res: string[] = [];
    if (Array.isArray(t.artists)) {
      for (const a of t.artists) {
        const n = normalizeArt(a);
        if (n.length >= 2) res.push(n);
      }
    }
    return res;
  };
  const sharesArtist = (a: TrackRef, b: TrackRef) => {
    const artsA = getArts(a);
    const artsB = getArts(b);
    return artsA.some((art) => artsB.includes(art));
  };

  const maxPerArtist = targetCount <= 15 ? 2 : Math.max(2, Math.floor(targetCount / 8));
  const artistCounts = new Map<string, number>();

  const getArtistPrimary = (t: TrackRef) => {
    const arts = getArts(t);
    return arts[0] || normalizeArt(t.artists?.[0] || "");
  };

  const globalSeenKey = new Set<string>();
  const globalSeenSk = new Set<string>();

  const canAddTrack = (t: TrackRef, current: TrackRef[], enforceStreak = true, capLimit: number = maxPerArtist) => {
    const k = trackKey(t);
    if (globalSeenKey.has(k)) return false;
    const sk = getSemanticKey(t);
    if (sk !== "" && globalSeenSk.has(sk)) return false;

    if (enforceStreak && current.length > 0) {
      const prev = current[current.length - 1];
      if (sharesArtist(prev, t)) return false;
    }
    const primary = getArtistPrimary(t);
    if (primary && (artistCounts.get(primary) || 0) >= capLimit) {
      return false;
    }
    const arts = getArts(t);
    for (const a of arts) {
      if ((artistCounts.get(a) || 0) >= capLimit) return false;
    }
    return true;
  };

  const recordArtist = (t: TrackRef) => {
    const arts = getArts(t);
    if (arts.length === 0) {
      const p = getArtistPrimary(t);
      if (p) artistCounts.set(p, (artistCounts.get(p) || 0) + 1);
    } else {
      for (const a of arts) {
        artistCounts.set(a, (artistCounts.get(a) || 0) + 1);
      }
    }
  };

  // Lightly shuffle within each bucket to avoid artist clusters from bulk search results
  for (const p of providers) {
    const list = buckets.get(p)!;
    for (let i = list.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [list[i], list[j]] = [list[j], list[i]];
    }
  }

  const result: TrackRef[] = [];
  const indices = new Map<string, number>();
  for (const p of providers) indices.set(p, 0);

  let lastProvider: string | null = null;
  let currentStreak = 0;

  for (const [enforceStreak, capLimit] of [
    [true, maxPerArtist],
    [false, maxPerArtist],
    [false, maxPerArtist + 1],
    [false, maxPerArtist + 2],
    [false, Math.max(4, maxPerArtist + 3)],
  ] as [boolean, number][]) {
    while (result.length < targetCount) {
      const available = providers.filter((p) => {
        const list = buckets.get(p) || [];
        let idx = indices.get(p) || 0;
        while (idx < list.length && !canAddTrack(list[idx], result, enforceStreak, capLimit)) {
          idx++;
        }
        return idx < list.length;
      });

      if (available.length === 0) break;

      let nextProvider: string;
      if (available.length === 1) {
        nextProvider = available[0];
      } else {
        const candidates = available.filter((p) => p !== lastProvider);
        const poolToPick = candidates.length > 0 ? candidates : available;
        const minPicks = Math.min(...poolToPick.map((p) => indices.get(p) || 0));
        const viable = poolToPick.filter((p) => (indices.get(p) || 0) <= minPicks + 1);
        nextProvider = viable[Math.floor(Math.random() * viable.length)];
      }

      if (nextProvider !== lastProvider) {
        currentStreak = 0;
        lastProvider = nextProvider;
      }

      const list = buckets.get(nextProvider)!;
      let curIdx = indices.get(nextProvider)!;

      while (curIdx < list.length && !canAddTrack(list[curIdx], result, enforceStreak, capLimit)) {
        curIdx++;
      }

      if (curIdx >= list.length) {
        indices.set(nextProvider, curIdx);
        continue;
      }

      const picked = list[curIdx];
      result.push(picked);
      globalSeenKey.add(trackKey(picked));
      const pickedSk = getSemanticKey(picked);
      if (pickedSk !== "") globalSeenSk.add(pickedSk);
      recordArtist(picked);
      indices.set(nextProvider, curIdx + 1);
      currentStreak++;

      const maxStreak = Math.floor(Math.random() * 2) + 1;
      if (currentStreak >= maxStreak) {
        currentStreak = 0;
        lastProvider = null;
      }
    }
  }

  return result;
}

export function normalizeProvider(provider: string | null | undefined): string {
  if (!provider) return "";
  const p = provider.trim().toLowerCase();
  if (p === "you_tube_music" || p === "youtube") return "youtube_music";
  if (p === "yandex_music") return "yandex";
  if (p === "sound_cloud") return "soundcloud";
  return p;
}

export function parseActiveProviders(
  pref: string | null | undefined,
  defaultProviders: string[] = ["spotify", "soundcloud", "deezer", "youtube_music", "yandex"]
): string[] {
  if (!pref || pref.trim() === "" || pref === "all") {
    return defaultProviders.map(normalizeProvider);
  }
  const parts = pref
    .split(",")
    .map(normalizeProvider)
    .filter(Boolean);
  return parts.length > 0 ? parts : defaultProviders.map(normalizeProvider);
}

export function balanceProvidersRoundRobin(tracks: TrackRef[], targetCount: number): TrackRef[] {
  return balanceProvidersOrganic(tracks, targetCount);
}

export function filterValidArtists(artists: string[] | null | undefined): string[] {
  if (!artists || !Array.isArray(artists)) return [];
  return artists
    .map((a) => a.trim())
    .filter((a) => a.length > 0 && !isJunkArtistString(a));
}

export function artistLabel(artists: string[]): string {
  const valid = filterValidArtists(artists);
  if (valid.length === 0) return "Unknown artist";
  return valid.join(", ");
}

export function canPlay(capability: PlaybackCapability | undefined): boolean {
  if (!capability) return true;
  return capability.kind !== "unavailable";
}

export function isFavorite(library: TrackRef[] | Set<string>, track: TrackRef): boolean {
  if (library instanceof Set) {
    return library.has(`${track.provider}:${track.id}`);
  }
  return library.some((t) => t.provider === track.provider && t.id === track.id);
}

export function trackKey(track: TrackRef): string {
  return `${track.provider}:${track.id}`;
}

export function providerKey(track: TrackRef): string {
  return `${track.provider}:${track.id}`;
}

export function dedupe(tracks: TrackRef[]): TrackRef[] {
  const seen = new Set<string>();
  const out: TrackRef[] = [];
  for (const t of tracks) {
    const key = trackKey(t);
    if (!seen.has(key)) {
      seen.add(key);
      out.push(t);
    }
  }
  return out;
}
