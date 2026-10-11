import { useState, useEffect } from "react";
import { useApp } from "../../store";
import { Artwork } from "../../components/Artwork";
import type { MixItem } from "../../api/types";
import * as api from "../../api/commands";
import { ScrollableCardRow } from "./HomeHelpers";

let cachedPersonalMixes: MixItem[] | null = null;
let cachedRecProvidersKey: string | null = null;

export function clearPersonalMixesCache() {
  cachedPersonalMixes = null;
  cachedRecProvidersKey = null;
}

export function MixesBlockContent({
  lang,
  onOpenMix,
}: {
  lang: any;
  onOpenMix: (mix: MixItem) => void;
}) {
  const { state, playTracks, showToast, setActiveMixContext } = useApp();
  const [mixes, setMixes] = useState<MixItem[]>(() => cachedPersonalMixes || []);
  const [recProviders, setRecProviders] = useState<string | null>(() => cachedRecProvidersKey);
  const [loadingMixes, setLoadingMixes] = useState(() => !cachedPersonalMixes || cachedPersonalMixes.length === 0);

  useEffect(() => {
    let cancelled = false;
    void api
      .getRecommendationProviders()
      .then((p) => {
        if (!cancelled) setRecProviders(p || "all");
      })
      .catch(() => {
        if (!cancelled) setRecProviders("all");
      });

    const onProvidersChanged = (e: any) => {
      cachedPersonalMixes = null;
      cachedRecProvidersKey = null;
      setMixes([]);
      setLoadingMixes(true);
      setRecProviders(e.detail || "all");
    };
    window.addEventListener("vessel:providers-changed", onProvidersChanged);

    return () => {
      cancelled = true;
      window.removeEventListener("vessel:providers-changed", onProvidersChanged);
    };
  }, []);

  useEffect(() => {
    if (recProviders === null) return;
    let cancelled = false;
    const providersChanged = cachedRecProvidersKey !== null && cachedRecProvidersKey !== recProviders;
    if (providersChanged) {
      cachedPersonalMixes = null;
    }
    if (cachedPersonalMixes && cachedPersonalMixes.length > 0 && !providersChanged) {
      setMixes(cachedPersonalMixes);
      setLoadingMixes(false);
      return;
    }
    setLoadingMixes(true);

    void (async () => {
      const libraryTracks = state?.library ?? [];
      const totalPlaylistTracks = state?.playlists?.reduce((acc, p) => acc + (p.tracks?.length || 0), 0) ?? 0;
      if (libraryTracks.length === 0 && totalPlaylistTracks === 0) {
        if (!cancelled) {
          setMixes([]);
          setLoadingMixes(false);
        }
        return;
      }

      try {
        const force = providersChanged;
        const res = await api.getPersonalMixes(force, recProviders || undefined);
        if (!cancelled) {
          cachedPersonalMixes = res;
          cachedRecProvidersKey = recProviders;
          setMixes(res);
          setLoadingMixes(false);
        }
      } catch (err) {
        console.warn("Personal mixes error:", err);
        if (!cancelled) {
          setLoadingMixes(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [state?.library?.length, state?.playlists?.length, recProviders]);

  const handlePlayMix = (mix: MixItem) => {
    if (mix.tracks.length === 0) {
      showToast(lang === "ru" ? "Микс пуст" : "Mix is empty", true);
      return;
    }
    setActiveMixContext({ title: mix.title, artists: mix.relatedArtists, tracks: mix.tracks });
    void playTracks(mix.tracks, 0);
  };

  const handleOpenMixItem = (mix: MixItem) => {
    onOpenMix?.(mix);
  };

  const totalPlaylistTracks = state?.playlists?.reduce((acc, p) => acc + (p.tracks?.length || 0), 0) ?? 0;
  const hasTasteProfile = (state?.library?.length ?? 0) > 0 || totalPlaylistTracks > 0;

  if (!hasTasteProfile) {
    return (
      <div className="section">
        <div className="home-section-head" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div className="home-section-title-wrap">
            <span className="home-section-title">{lang === "ru" ? "Персональные миксы" : "Personal Mixes"}</span>
          </div>
        </div>
        <div className="home-rec-empty">
          <div className="home-rec-empty-icon">❤️</div>
          <div className="home-rec-empty-title">
            {lang === "ru"
              ? "Добавьте треки в Избранное ❤️ или создайте плейлист, чтобы мы могли подобрать рекомендации"
              : "Add tracks to Favorites ❤️ or create a playlist so we can generate recommendations"}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="section">
      <div className="home-section-head">
        <div className="home-section-title-wrap">
          <span className="home-section-title">{lang === "ru" ? "Персональные миксы" : "Personal Mixes"}</span>
          <span className="home-section-sub">
            {lang === "ru"
              ? "Собраны на основе любимых артистов"
              : "Assembled based on your top artists"}
          </span>
        </div>
      </div>

      <ScrollableCardRow hasMore={false}>
        {loadingMixes && mixes.length === 0 ? (
          Array.from({ length: 12 }).map((_, i) => (
            <div key={`mix-skel-${i}`} className="home-mix-skeleton-card">
              <div className="home-mix-skeleton-cover">
                <div className="home-mix-skeleton-pill" />
              </div>
              <div className="home-mix-skeleton-artists" />
            </div>
          ))
        ) : mixes.length === 0 ? (
          <div className="home-empty-notice" style={{ padding: "24px 0", color: "var(--text3)", fontSize: "13px" }}>
            {lang === "ru" ? "Добавьте больше треков в медиатеку для составления миксов" : "Add more tracks to your library to generate mixes"}
          </div>
        ) : (
          mixes.map((mix) => (
            <div
              key={mix.id}
              className="home-mix-card"
              onClick={() => handleOpenMixItem(mix)}
              title={`MIX ${mix.id} — ${mix.relatedArtists.join(", ")}`}
            >
              <div className="home-mix-cover-wrap">
                <Artwork url={mix.coverUrl} alt={mix.title} seed={mix.id} className="home-mix-cover-img" />
                <div
                  className="home-mix-pill"
                  style={{ backgroundColor: mix.pillColor, color: mix.pillTextColor }}
                >
                  <span>{mix.title}</span>
                </div>
                <div className="home-rec-play-overlay">
                  <button
                    type="button"
                    className="home-rec-play-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      handlePlayMix(mix);
                    }}
                    title={lang === "ru" ? "Слушать микс" : "Play mix"}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="#000000" style={{ marginLeft: "2px" }}>
                      <polygon points="6,4 20,12 6,20" />
                    </svg>
                  </button>
                </div>
              </div>
              <div className="home-mix-artists">{mix.relatedArtists.join(", ")}</div>
            </div>
          ))
        )}
      </ScrollableCardRow>
    </div>
  );
}
