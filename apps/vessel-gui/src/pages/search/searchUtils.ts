import type { CollectionItem, TrackRef } from "../../api/types";
import { PROVIDER_VALUE } from "./searchTypes";

export function mixSearchTracks(tracks: TrackRef[]): TrackRef[] {
  if (tracks.length <= 2) return tracks;
  const groups: Record<string, TrackRef[]> = {};
  for (const t of tracks) {
    if (!groups[t.provider]) groups[t.provider] = [];
    groups[t.provider].push(t);
  }
  const providers = Object.keys(groups);
  if (providers.length <= 1) return tracks;

  const result: TrackRef[] = [];
  let seed = tracks.length;
  const nextRand = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  let hasMore = true;
  while (hasMore) {
    hasMore = false;
    const order = [...providers].sort(() => nextRand() - 0.5);
    for (const p of order) {
      const list = groups[p];
      if (list && list.length > 0) {
        hasMore = true;
        const takeCount = Math.min(list.length, Math.floor(nextRand() * 3) + 1);
        const chunk = list.splice(0, takeCount);
        result.push(...chunk);
      }
    }
  }
  return result;
}

export function filterCollectionsByProvider(
  list: CollectionItem[],
  provider: string
): CollectionItem[] {
  if (provider === "all") return list;
  const target = PROVIDER_VALUE[provider] || provider;
  return list.filter(
    (c) =>
      c.provider === target ||
      c.provider === provider ||
      (provider === "soundcloud" && (c.provider as string) === "sound_cloud") ||
      (provider === "youtube_music" && (c.provider as string) === "you_tube_music")
  );
}
