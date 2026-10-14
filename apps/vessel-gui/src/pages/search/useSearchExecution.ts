import { useEffect, useRef, useState } from "react";
import type { CollectionItem, TrackRef } from "../../api/types";
import * as api from "../../api/commands";
import { t, type Lang } from "../../i18n";
import type { SearchCategory } from "./searchTypes";
import { mixSearchTracks, filterCollectionsByProvider } from "./searchUtils";

export function useSearchExecution(
  query: string,
  provider: string,
  category: SearchCategory,
  lang: Lang
) {
  // Main results for mono-category
  const [results, setResults] = useState<TrackRef[]>([]);
  const [collections, setCollections] = useState<CollectionItem[]>([]);

  // Composite results for "all"
  const [allTracks, setAllTracks] = useState<TrackRef[]>([]);
  const [allArtists, setAllArtists] = useState<CollectionItem[]>([]);
  const [allPlaylists, setAllPlaylists] = useState<CollectionItem[]>([]);
  const [allAlbums, setAllAlbums] = useState<CollectionItem[]>([]);

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const debounce = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (debounce.current) window.clearTimeout(debounce.current);
    const q = query.trim();
    if (!q) {
      setResults([]);
      setCollections([]);
      setAllTracks([]);
      setAllArtists([]);
      setAllPlaylists([]);
      setAllAlbums([]);
      setMessage(null);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    debounce.current = window.setTimeout(async () => {
      try {
        if (category === "all") {
          const [outcome, foundPlaylists, foundAlbums, foundArtists] = await Promise.all([
            api.search(q, provider).catch(() => ({ tracks: [], failures: [] })),
            api.searchCollections(q, "playlists", provider).catch(() => []),
            api.searchCollections(q, "albums", provider).catch(() => []),
            api.searchCollections(q, "artists", provider).catch(() => []),
          ]);
          const mixed = mixSearchTracks(outcome.tracks);
          setAllTracks(mixed);
          setAllPlaylists(filterCollectionsByProvider(foundPlaylists, provider));
          setAllAlbums(filterCollectionsByProvider(foundAlbums, provider));
          setAllArtists(filterCollectionsByProvider(foundArtists, provider));
          setResults([]);
          setCollections([]);
          if (
            mixed.length === 0 &&
            foundArtists.length === 0 &&
            foundPlaylists.length === 0 &&
            foundAlbums.length === 0
          ) {
            setMessage(t(lang, "search.noResults"));
          } else {
            setMessage(null);
          }
        } else if (category === "tracks") {
          const outcome = await api.search(q, provider);
          const mixed = mixSearchTracks(outcome.tracks);
          setResults(mixed);
          setCollections([]);
          if (mixed.length === 0) {
            setMessage(
              outcome.failures.length > 0
                ? outcome.failures.join("; ")
                : t(lang, "search.noResults")
            );
          } else {
            setMessage(
              outcome.failures.length > 0
                ? `${t(lang, "common.found")} ${mixed.length}, ${t(lang, "search.someUnavailable")}`
                : null
            );
          }
        } else {
          const kind =
            category === "playlists"
              ? "playlists"
              : category === "albums"
              ? "albums"
              : "artists";
          const found = await api.searchCollections(q, kind, provider);
          const filtered = filterCollectionsByProvider(found, provider);
          setCollections(filtered);
          setResults([]);
          setMessage(filtered.length === 0 ? t(lang, "search.noResults") : null);
        }
      } catch (err) {
        setError(String(err));
        setResults([]);
        setCollections([]);
        setAllTracks([]);
        setAllArtists([]);
        setAllPlaylists([]);
        setAllAlbums([]);
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => {
      if (debounce.current) window.clearTimeout(debounce.current);
    };
  }, [query, provider, category, lang]);

  return {
    results,
    collections,
    allTracks,
    allArtists,
    allPlaylists,
    allAlbums,
    loading,
    message,
    error,
  };
}
