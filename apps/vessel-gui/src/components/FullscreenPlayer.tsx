import React, { useEffect, useRef, useState } from "react";
import { useApp, usePlaybackProgress } from "../store";
import { useCustomization } from "../customization";
import { isFavorite } from "../lib/utils";
import * as api from "../api/commands";
import {
  FullscreenHeader,
  FullscreenControls,
  FullscreenLyrics,
  useFullscreenLyrics,
  KawarpBackground,
} from "./fullscreen";

export function FullscreenPlayer() {
  const {
    state,
    refresh,
    showToast,
    navigateTo,
    lang,
    fullscreenOpen,
    setFullscreenOpen,
    smartShuffle,
    cycleShuffleMode,
    playNextTrack,
  } = useApp();
  const progress = usePlaybackProgress();
  const { config } = useCustomization();

  const [isRendered, setIsRendered] = useState(fullscreenOpen);
  const [isClosing, setIsClosing] = useState(false);
  const overlayRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (fullscreenOpen) {
      setIsRendered(true);
      setIsClosing(false);
    } else if (isRendered && !isClosing) {
      setIsClosing(true);
    }
  }, [fullscreenOpen, isRendered, isClosing]);

  const handleAnimationEnd = (e: React.AnimationEvent) => {
    if (e.target === overlayRef.current && isClosing) {
      setIsRendered(false);
      setIsClosing(false);
    }
  };

  const fullscreenMode = config.player?.fullscreenMode || "both";
  const followTrack = config.player?.fullscreenFollowTrack !== false;
  const lyricsPosition = config.player?.fullscreenLyricsPosition || "right";

  const track = state?.now_playing;
  const player = state?.player;
  const fav = track && state ? isFavorite(state.library, track) : false;
  const playing = player?.status === "playing" || player?.status === "buffering";
  const durationMs = progress.duration_ms || player?.duration_ms || track?.duration_ms || 0;
  const positionMs = progress.position_ms ?? player?.position_ms ?? 0;

  const lyrics = useFullscreenLyrics({
    track,
    playerStatus: player?.status,
    playerPositionMs: player?.position_ms,
    playerDurationMs: player?.duration_ms,
    progressPositionMs: progress.position_ms,
    progressDurationMs: progress.duration_ms,
    followTrack,
    refresh,
    showToast,
    lang,
    defaultProvider: config.player?.defaultLyricsProvider,
  });

  // Keyboard shortcuts
  useEffect(() => {
    if (!fullscreenOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setFullscreenOpen(false);
      } else if (e.key === " " && (e.target as HTMLElement)?.tagName !== "INPUT") {
        e.preventDefault();
        void handleToggle();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [fullscreenOpen, playing]);

  const handleToggle = async () => {
    try {
      await api.togglePlayback();
      await refresh();
    } catch (err) {
      showToast(String(err), true);
    }
  };

  const handlePrev = async () => {
    try {
      await api.previous();
      await refresh();
    } catch (err) {
      showToast(String(err), true);
    }
  };

  const handleNext = async () => {
    await playNextTrack();
  };

  const handleRepeat = async () => {
    if (!player) return;
    const next = player.repeat === "off" ? "all" : player.repeat === "all" ? "one" : "off";
    try {
      await api.setRepeat(next);
      await refresh();
    } catch (err) {
      showToast(String(err), true);
    }
  };

  const handleFav = async () => {
    if (!track) return;
    try {
      await api.toggleFavorite(track);
      await refresh();
    } catch (err) {
      showToast(String(err), true);
    }
  };

  const handleNavigateArtist = (artist: string, provider?: string) => {
    setFullscreenOpen(false);
    navigateTo("artist", { artist, provider: provider || track?.provider });
  };

  if (!isRendered || !track || !player) return null;

  const renderControls = () => (
    <FullscreenControls
      track={track}
      player={player}
      customTrackArt={config.theme?.customTrackArt}
      fav={fav}
      playing={playing}
      smartShuffle={smartShuffle}
      durationMs={durationMs}
      positionMs={positionMs}
      lang={lang}
      onToggle={handleToggle}
      onPrev={handlePrev}
      onNext={handleNext}
      onRepeat={handleRepeat}
      onFav={handleFav}
      onCycleShuffle={() => void cycleShuffleMode()}
      onNavigateArtist={handleNavigateArtist}
      refresh={refresh}
      showToast={showToast}
    />
  );

  const renderLyrics = () => (
    <FullscreenLyrics
      track={track}
      playerStatus={player.status}
      lang={lang}
      lyrics={lyrics}
    />
  );

  return (
    <div
      ref={overlayRef}
      className={`fs-overlay ${isClosing ? "is-closing" : ""}`}
      onAnimationEnd={handleAnimationEnd}
    >
      {/* Living fluid animated background from album artwork */}
      <KawarpBackground coverUrl={track?.artwork_url} />
      <div className="fs-backdrop-scrim" />

      {/* Top Header Bar */}
      <FullscreenHeader
        onClose={() => setFullscreenOpen(false)}
        lang={lang}
        availableProviders={lyrics.availableProviders}
        activeProvider={lyrics.activeProvider}
        onSelectProvider={lyrics.selectProvider}
        onNextProvider={lyrics.nextProvider}
        onPrevProvider={lyrics.prevProvider}
      />

      {/* Main Content Layout based on fullscreenMode */}
      <div className={`fs-container mode-${fullscreenMode} ${lyricsPosition === "left" ? "lyrics-left" : ""}`}>
        {fullscreenMode === "cover" ? (
          <div className="fs-cover-centered">
            {renderControls()}
          </div>
        ) : fullscreenMode === "lyrics" ? (
          <div className="fs-lyrics-centered">
            {renderLyrics()}
          </div>
        ) : (
          <div className="fs-split-view">
            {lyricsPosition === "left" && renderLyrics()}
            {renderControls()}
            {lyricsPosition === "right" && renderLyrics()}
          </div>
        )}
      </div>
    </div>
  );
}
