import type { TrackRef } from "../api/types";

export function semanticTrackKey(t: TrackRef): string {
  const artist = (t.artists && t.artists.length > 0 ? t.artists[0] : "").toLowerCase().trim();
  const title = (t.title || "").toLowerCase().trim();
  return `${artist}:::${title}`;
}
