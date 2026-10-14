import React, { useState } from "react";
import { useApp, usePlaybackProgress } from "../store";
import { useCustomization } from "../customization";
import { isFavorite } from "../lib/utils";
import type { TrackRef } from "../api/types";
import { t } from "../i18n";
import * as api from "../api/commands";
import {
  usePlayerProgress,
  usePlayerVolume,
  useQueueReorder,
  PlayerNowPlayingCard,
  PlayerQueueCard,
  PlayerContextMenu,
  type ContextMenuState,
} from "./player";

export function PlayerPage() {
  const {
    state,
    refresh,
    showToast,
    playTracks,
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
  const track = state?.now_playing;
  const player = state?.player;
  const queue = state?.queue || [];
  const currentIndex = state?.queue_index ?? -1;
  const fav = track && state ? isFavorite(state.library, track) : false;
  const playing = player?.status === "playing" || player?.status === "buffering";
  const durationMs = progress.duration_ms || track?.duration_ms || player?.duration_ms || 0;

  // Playback Progress & Seek
  const {
    dragPercent,
    shownPercent,
    shownMs,
    seekBarRef,
    onSeekPointerDown,
  } = usePlayerProgress({
    positionMs: progress.position_ms ?? player?.position_ms ?? 0,

    durationMs,
    playerStatus: player?.status,
    refresh,
    showToast,
  });

  // Volume & Mute
  const {
    muted,
    volBarRef,
    onVolPointerDown,
    handleMute,
  } = usePlayerVolume({
    volumePercent: player?.volume_percent ?? 100,
    refresh,
  });

  // Queue Drag & Drop Reorder
  const {
    dragIndex,
    dropOverIndex,
    handleQueuePointerDown,
    handleQueuePointerMove,
    handleQueuePointerUp,
  } = useQueueReorder({
    queue,
    refresh,
    showToast,
  });

  // Playback Action Handlers
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
    const nextMode = player.repeat === "off" ? "all" : player.repeat === "all" ? "one" : "off";
    try {
      await api.setRepeat(nextMode);
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
      showToast(fav ? t(lang, "trackrow.unlike") : t(lang, "trackrow.like"));
    } catch (err) {
      showToast(String(err), true);
    }
  };

  const handleClearQueue = async () => {
    try {
      await api.clearQueue();
      await refresh();
      showToast(lang === "ru" ? "Очередь очищена" : "Queue cleared");
    } catch (err) {
      showToast(String(err), true);
    }
  };

  const handlePlayFromQueue = (index: number) => {
    if (queue.length === 0) return;
    void playTracks(queue, index);
  };

  // Context Menu State & Actions
  const [menu, setMenu] = useState<ContextMenuState | null>(null);

  const handleContextMenu = (e: React.MouseEvent, targetTrack: TrackRef, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 220);
    const y = Math.min(e.clientY, window.innerHeight - 260);
    setMenu({ track: targetTrack, index, x: Math.max(10, x), y: Math.max(10, y) });
  };

  const handlePlayNext = async (targetTrack: TrackRef) => {
    setMenu(null);
    try {
      await api.playNext(targetTrack);
      await refresh();
      showToast(`${lang === "ru" ? "Будет играть следующим:" : "Play next:"} ${targetTrack.title}`);
    } catch (e) {
      showToast(String(e), true);
    }
  };

  const handleToggleFavTrack = async (targetTrack: TrackRef) => {
    setMenu(null);
    try {
      await api.toggleFavorite(targetTrack);
      await refresh();
    } catch (e) {
      showToast(String(e), true);
    }
  };

  const handleCacheTrack = async (targetTrack: TrackRef) => {
    setMenu(null);
    try {
      showToast(lang === "ru" ? "Сохранение в кэш…" : "Saving to cache…");
      await api.downloadTrackToCache(targetTrack);
      showToast(lang === "ru" ? "Сохранено в кэш" : "Saved to cache");
    } catch (e) {
      showToast(String(e), true);
    }
  };

  const handleRemoveTrack = async (index: number) => {
    setMenu(null);
    try {
      await api.removeFromQueue(index);
      await refresh();
    } catch (e) {
      showToast(String(e), true);
    }
  };

  return (
    <div className="view page-player-view" style={{ width: "100%", paddingBottom: 40, boxSizing: "border-box" }}>
      {/* Top Card: Now Playing Player */}
      <PlayerNowPlayingCard
        track={track}
        player={player}
        playing={playing}
        fav={fav}
        muted={muted}
        smartShuffle={smartShuffle}
        fullscreenOpen={fullscreenOpen}
        lang={lang}
        customTrackArt={config.theme?.customTrackArt}
        shownPercent={shownPercent}
        shownMs={shownMs}
        durationMs={durationMs}
        dragPercent={dragPercent}
        seekBarRef={seekBarRef}
        volBarRef={volBarRef}
        onSeekPointerDown={onSeekPointerDown}
        onVolPointerDown={onVolPointerDown}
        onToggle={handleToggle}
        onPrev={handlePrev}
        onNext={handleNext}
        onRepeat={handleRepeat}
        onFav={handleFav}
        onMute={handleMute}
        onCycleShuffle={() => void cycleShuffleMode()}
        onToggleFullscreen={() => setFullscreenOpen(!fullscreenOpen)}
        onNavigateArtist={(artist, provider) => navigateTo("artist", { artist, provider })}
      />

      {/* Bottom Card: Playback Queue */}
      <PlayerQueueCard
        queue={queue}
        currentIndex={currentIndex}
        playing={playing}
        dragIndex={dragIndex}
        dropOverIndex={dropOverIndex}
        trackRowActiveStyle={config.theme?.trackRowActiveStyle}
        lang={lang}
        onClearQueue={handleClearQueue}
        onPlayTrack={handlePlayFromQueue}
        onTogglePlayCurrent={() => void handleToggle()}
        onPointerDownRow={handleQueuePointerDown}
        onPointerMoveContainer={handleQueuePointerMove}
        onPointerUpContainer={handleQueuePointerUp}
        onContextMenuRow={handleContextMenu}
      />

      {/* Context Menu Portal */}
      <PlayerContextMenu
        menu={menu}
        onClose={() => setMenu(null)}
        onPlayNext={handlePlayNext}
        onToggleFavorite={handleToggleFavTrack}
        onCacheTrack={handleCacheTrack}
        onRemoveTrack={handleRemoveTrack}
        isFav={Boolean(menu && state && isFavorite(state.library, menu.track))}
        lang={lang}
      />
    </div>
  );
}
