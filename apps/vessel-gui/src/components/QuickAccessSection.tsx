import { useMemo, useState } from "react";
import { useApp } from "../store";
import { t } from "../i18n";
import { resolveArtworkUrl } from "../lib/utils";
import { IconHeartFilled, IconPlaylist } from "./Icons";

export function QuickAccessSection() {
  const { state, playlists, navigateTo, lang } = useApp();

  // 1. Плейлисты: берем обложку первого/самого актуального плейлиста
  const latestPlaylistCover = useMemo(() => {
    const plList = playlists && playlists.length > 0 ? playlists : (state?.playlists ?? []);
    for (const pl of plList) {
      if (pl.cover_url) return pl.cover_url;
      for (const track of pl.tracks ?? []) {
        if (track.artwork_url) return track.artwork_url;
      }
    }
    return null;
  }, [playlists, state?.playlists]);

  // 2. Любимые треки: обложка последнего добавленного трека
  const latestFavoriteCover = useMemo(() => {
    for (const track of state?.library ?? []) {
      if (track.artwork_url) {
        return track.artwork_url;
      }
    }
    return null;
  }, [state?.library]);

  const [plCoverError, setPlCoverError] = useState(false);
  const [favCoverError, setFavCoverError] = useState(false);

  const resolvedPlCover = resolveArtworkUrl(latestPlaylistCover);
  const resolvedFavCover = resolveArtworkUrl(latestFavoriteCover);

  const favTitle = t(lang, "home.quickAccess.favorites") || "Любимые треки";
  const favSub = t(lang, "home.quickAccess.favoritesSub") || "Ваша коллекция любимой музыки";
  const plTitle = t(lang, "home.quickAccess.playlists") || "Плейлисты";
  const plSub = t(lang, "home.quickAccess.playlistsSub") || "Твоя коллекция";

  return (
    <div className="quick-access-section" role="region" aria-label="Быстрый доступ">
      {/* 1. Плейлисты (симметрично: чистая левая сторона, 1 крупная обложка справа с мягким растворением) */}
      <div
        className="quick-access-card"
        role="button"
        tabIndex={0}
        onClick={() => navigateTo("playlists")}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navigateTo("playlists");
          }
        }}
      >
        <div className="quick-access-content">
          <div className="quick-access-icon" aria-hidden="true">
            <IconPlaylist size={20} />
          </div>
          <div className="quick-access-text">
            <span className="quick-access-title">{plTitle}</span>
            <span className="quick-access-subtitle">{plSub}</span>
          </div>
        </div>

        {resolvedPlCover && !plCoverError ? (
          <div className="quick-access-single-cover-wrapper" aria-hidden="true">
            <img
              src={resolvedPlCover}
              alt=""
              loading="lazy"
              decoding="async"
              className="quick-access-single-cover-img"
              onError={() => setPlCoverError(true)}
            />
          </div>
        ) : (
          <div className="quick-access-fallback-glow" aria-hidden="true" />
        )}
      </div>

      {/* 2. Любимые треки (симметрично: чистая левая сторона, 1 крупная обложка справа с мягким растворением) */}
      <div
        className="quick-access-card"
        role="button"
        tabIndex={0}
        onClick={() => navigateTo("favorites")}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            navigateTo("favorites");
          }
        }}
      >
        <div className="quick-access-content">
          <div className="quick-access-icon" aria-hidden="true">
            <IconHeartFilled size={20} />
          </div>
          <div className="quick-access-text">
            <span className="quick-access-title">{favTitle}</span>
            <span className="quick-access-subtitle">{favSub}</span>
          </div>
        </div>

        {resolvedFavCover && !favCoverError ? (
          <div className="quick-access-single-cover-wrapper" aria-hidden="true">
            <img
              src={resolvedFavCover}
              alt=""
              loading="lazy"
              decoding="async"
              className="quick-access-single-cover-img"
              onError={() => setFavCoverError(true)}
            />
          </div>
        ) : (
          <div className="quick-access-fallback-glow" aria-hidden="true" />
        )}
      </div>
    </div>
  );
}
