import { useState, useEffect } from "react";
import { useApp } from "../../store";
import { Artwork } from "../../components/Artwork";
import { PlatformIcon } from "../../components/PlatformIcon";
import { filterValidArtists, trackKey } from "../../lib/utils";
import type { MixItem } from "../../api/types";
import * as api from "../../api/commands";
import { formatDuration, getProviderLabel } from "./HomeHelpers";

export function HomeMixPageView({
  mix,
  onBack,
  lang,
  nowKey,
  isLive,
}: {
  mix: MixItem;
  onBack: () => void;
  lang: any;
  nowKey: string | null;
  isLive: boolean;
}) {
  const { playTracks, showToast, refresh, state, setActiveMixContext, navigateTo } = useApp();
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (state?.playlists.some((p) => p.title.toLowerCase() === mix.title.toLowerCase())) {
      setIsSaved(true);
    }
  }, [state?.playlists?.length, mix.title]);

  const handlePlayAll = () => {
    if (mix.tracks.length === 0) return;
    setActiveMixContext({ title: mix.title, artists: mix.relatedArtists, tracks: mix.tracks });
    void playTracks(mix.tracks, 0);
  };

  const handlePlayIndex = (idx: number) => {
    const t = mix.tracks[idx];
    if (t && trackKey(t) === nowKey) {
      void api.togglePlayback();
      return;
    }
    setActiveMixContext({ title: mix.title, artists: mix.relatedArtists, tracks: mix.tracks });
    void playTracks(mix.tracks, idx);
  };

  const handleSaveToPlaylists = async () => {
    try {
      const pl = await api.createPlaylist(mix.title);
      for (const track of mix.tracks) {
        await api.addToPlaylist(pl.id, track);
      }
      await refresh();
      setIsSaved(true);
      showToast(lang === "ru" ? "Микс сохранён в ваши плейлисты!" : "Mix saved to your playlists!");
    } catch (e) {
      showToast(String(e), true);
    }
  };

  return (
    <div className="view home-mix-page">
      <button type="button" className="home-mix-page-back" onClick={onBack}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="12" x2="5" y2="12" />
          <polyline points="12 19 5 12 12 5" />
        </svg>
        <span>{lang === "ru" ? "Назад ко всем разделам" : "Back to Home"}</span>
      </button>

      <div className="home-mix-page-hero">
        <div className="home-mix-page-art">
          <Artwork url={mix.coverUrl} alt={mix.title} seed={mix.id} className="home-rec-cover-img" />
        </div>
        <div className="home-mix-page-info">
          <div
            className="home-mix-page-pill"
            style={{ backgroundColor: mix.pillColor, color: mix.pillTextColor }}
          >
            {mix.title}
          </div>
          <h1 className="home-mix-page-title">{mix.title}</h1>
          <div className="home-mix-page-sub">
            {lang === "ru" ? "Персональный микс на основе любимых артистов: " : "Personal mix based on: "}
            <strong>{mix.relatedArtists.join(", ")}</strong>
            <span style={{ display: "block", marginTop: 4, opacity: 0.7 }}>
              {mix.tracks.length} {lang === "ru" ? "треков" : "tracks"}
            </span>
          </div>
          <div className="home-mix-page-actions">
            <button type="button" className="home-mix-play-btn" onClick={handlePlayAll}>
              <span>▶</span>
              <span>{lang === "ru" ? "Слушать" : "Play"}</span>
            </button>
            <button
              type="button"
              className={`home-mix-save-btn ${isSaved ? "saved" : ""}`}
              onClick={handleSaveToPlaylists}
            >
              <span>{isSaved ? "✓" : "+"}</span>
              <span>
                {isSaved
                  ? (lang === "ru" ? "В плейлистах" : "Saved in Playlists")
                  : (lang === "ru" ? "Добавить в плейлисты" : "Save to Playlists")}
              </span>
            </button>
          </div>
        </div>
      </div>

      <div className="home-library-table" style={{ paddingBottom: "calc(var(--player-h, 84px) + 48px)" }}>
        {mix.tracks.map((t, idx) => {
          const isTrackPlaying = trackKey(t) === nowKey && isLive;
          return (
            <div
              key={trackKey(t) + idx}
              className="home-lib-row"
              onClick={() => handlePlayIndex(idx)}
            >
              <div className="home-lib-num">{idx + 1}</div>
              <div className="home-lib-art-wrap">
                <Artwork url={t.artwork_url} alt={t.title} seed={idx} className="home-lib-art-img" />
                <div className={`home-lib-play-hover ${isTrackPlaying ? "playing" : ""}`}>
                  <span style={{ fontSize: 13, color: "#fff" }}>{isTrackPlaying ? "❚❚" : "▶"}</span>
                </div>
              </div>
              <div className="home-lib-info">
                <div className="home-lib-title">{t.title}</div>
                <div className="home-lib-artist">
                  {filterValidArtists(t.artists).map((artist, aIdx, arr) => (
                    <span key={`${artist}-${aIdx}`}>
                      <span
                        className="pl-artist-link"
                        onClick={(e) => {
                          e.stopPropagation();
                          navigateTo("artist", { artist, provider: t.provider });
                        }}
                      >
                        {artist}
                      </span>
                      {aIdx < arr.length - 1 ? ", " : ""}
                    </span>
                  ))}
                </div>
              </div>
              <div className="home-lib-badge">
                <PlatformIcon kind={t.provider as any} size={14} />
                <span>{getProviderLabel(t.provider)}</span>
              </div>
              <div className="home-lib-duration">{formatDuration(t.duration_ms)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
