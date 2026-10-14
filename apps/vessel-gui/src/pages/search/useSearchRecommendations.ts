import { useEffect, useState } from "react";
import type { FullState, TrackRef } from "../../api/types";
import * as api from "../../api/commands";
import { trackKey, parseActiveProviders } from "../../lib/utils";

let cachedSearchRecs: TrackRef[] | null = null;
let cachedSearchRecsKey: string = "";

export function useSearchRecommendations(
  query: string,
  state: FullState | null
) {
  const [recs, setRecs] = useState<TrackRef[]>(cachedSearchRecs ?? []);
  const [recsLoading, setRecsLoading] = useState(false);
  const [recRefreshKey, setRecRefreshKey] = useState(0);

  useEffect(() => {
    const onProvidersChanged = () => {
      cachedSearchRecs = null;
      cachedSearchRecsKey = "";
      setRecs([]);
      setRecRefreshKey((k) => k + 1);
    };
    window.addEventListener("vessel:providers-changed", onProvidersChanged);
    return () => {
      window.removeEventListener("vessel:providers-changed", onProvidersChanged);
    };
  }, []);

  useEffect(() => {
    if (query.trim()) {
      return;
    }
    const currentKey = `${state?.library?.length ?? 0}:${state?.playlists?.length ?? 0}:${recRefreshKey}`;
    if (cachedSearchRecs && cachedSearchRecs.length > 0 && cachedSearchRecsKey === currentKey) {
      setRecs(cachedSearchRecs);
      return;
    }
    let cancelled = false;
    setRecsLoading(true);
    void (async () => {
      try {
        const providersStr = await api.getRecommendationProviders().catch(() => "all");
        const activeProviders = parseActiveProviders(providersStr);

        let result: TrackRef[] = [];

        // 1. Быстрый и качественный единый Recommendation Core
        try {
          const homeRecs = await api.getHomeRecommendations(24, false, providersStr);
          if (Array.isArray(homeRecs) && homeRecs.length > 0) {
            result = homeRecs;
          }
        } catch (e) {
          console.warn("Search home recs error:", e);
        }

        // 2. Если мало треков, пробуем рекомендации волны
        if (result.length < 6) {
          try {
            const waveRecs = await api.getWaveRecommendations("favorites", 20, null, providersStr);
            if (Array.isArray(waveRecs) && waveRecs.length > 0) {
              for (const t of waveRecs) {
                if (t && !result.some((r) => trackKey(r) === trackKey(t))) {
                  result.push(t);
                }
              }
            }
          } catch {}
        }

        // 3. Если всё ещё мало, пробуем getRelated от недавних любимых треков
        if (result.length < 6 && state?.library && state.library.length > 0) {
          const seeds = state.library.slice(0, 4);
          for (const s of seeds) {
            if (result.length >= 18) break;
            try {
              const rel = await api.getRelated(s, 6);
              if (Array.isArray(rel)) {
                for (const t of rel) {
                  if (t && !result.some((r) => trackKey(r) === trackKey(t))) {
                    result.push(t);
                  }
                }
              }
            } catch {}
          }
        }

        // 4. Если всё ещё пусто, ищем популярные хиты по активным сервисам
        if (result.length < 6) {
          for (const p of activeProviders) {
            if (result.length >= 18) break;
            try {
              const chartSearch = await api.search("Top Hits", p);
              if (chartSearch?.tracks && chartSearch.tracks.length > 0) {
                for (const t of chartSearch.tracks) {
                  if (result.length >= 18) break;
                  if (!result.some((r) => trackKey(r) === trackKey(t))) {
                    result.push(t);
                  }
                }
              }
            } catch {}
          }
        }

        if (!cancelled) {
          if (result.length > 0) {
            cachedSearchRecs = result;
            cachedSearchRecsKey = currentKey;
            setRecs(result);
          } else {
            setRecs([]);
          }
        }
      } catch {
        // тихо
      } finally {
        if (!cancelled) setRecsLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [query, state?.library?.length, state?.playlists?.length, recRefreshKey]);

  return { recs, recsLoading };
}
