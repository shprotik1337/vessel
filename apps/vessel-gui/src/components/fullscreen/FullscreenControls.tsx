import type { TrackRef, PlayerState } from "../../api/types";
import { formatTime, providerLabel, filterValidArtists } from "../../lib/utils";
import { t, type Lang } from "../../i18n";
import { Artwork } from "../Artwork";
import { PlatformIcon } from "../PlatformIcon";
import { IconSparkle } from "../Icons";
import {
  HEART_SVG,
  SHUFFLE_SVG,
  PREV_SVG,
  NEXT_SVG,
  PLAY_SVG,
  PAUSE_SVG,
  REPEAT_SVG,
  VOLUME_SVG,
  MUTE_SVG,
  getPlatformColor,
} from "../../pages/player/playerIcons";
import { usePlayerVolume } from "../../pages/player/usePlayerVolume";
import { usePlayerProgress } from "../../pages/player/usePlayerProgress";

export interface FullscreenControlsProps {
  track: TrackRef;
  player: PlayerState;
  customTrackArt?: string | null;
  fav: boolean;
  playing: boolean;
  smartShuffle: boolean;
  durationMs: number;
  positionMs: number;
  lang: Lang;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onRepeat: () => void;
  onFav: () => void;
  onCycleShuffle: () => void;
  onNavigateArtist: (artist: string, provider?: string) => void;
  refresh: () => Promise<void>;
  showToast: (msg: string, isError?: boolean) => void;
}

export function FullscreenControls({
  track,
  player,
  customTrackArt,
  fav,
  playing,
  smartShuffle,
  durationMs,
  positionMs,
  lang,
  onToggle,
  onPrev,
  onNext,
  onRepeat,
  onFav,
  onCycleShuffle,
  onNavigateArtist,
  refresh,
  showToast,
}: FullscreenControlsProps) {
  const {
    muted,
    volBarRef,
    onVolPointerDown,
    handleMute,
  } = usePlayerVolume({
    volumePercent: player?.volume_percent ?? 100,
    refresh,
  });

  const {
    shownPercent,
    shownMs,
    seekBarRef,
    onSeekPointerDown,
  } = usePlayerProgress({
    positionMs,
    durationMs,
    playerStatus: player.status,
    refresh,
    showToast,
  });

  return (
    <div className="fs-left">
      <div className="fs-artwork-wrap">
        <Artwork
          url={customTrackArt || track.artwork_url}
          alt={track.title}
          className="fs-art"
          seed={track.id.length}
        />
      </div>

      <div className="fs-track-info">
        <div className="fs-platform-row" style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
          <PlatformIcon kind={track.provider as any} size={14} />
          <span style={{
            color: getPlatformColor(track.provider),
            fontSize: 11,
            fontWeight: 800,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
          }}>
            {providerLabel(track.provider)}
          </span>
        </div>

        <div className="fs-track-title-row">
          <div className="fs-track-title" title={track.title}>
            {track.title}
          </div>
          <button
            className={`fs-heart-btn ${fav ? "active" : ""}`}
            onClick={onFav}
            title={t(lang, "bottom.favorite")}
            aria-label="Favorite"
          >
            {fav ? (
              <svg width="22" height="22" viewBox="0 0 24 24" fill="#ff4060" stroke="#ff4060" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
              </svg>
            ) : (
              HEART_SVG
            )}
          </button>
        </div>
        <div className="fs-track-artists">
          {filterValidArtists(track.artists).map((artist, idx, arr) => (
            <span key={`${artist}-${idx}`}>
              <span
                className="fs-artist-link"
                onClick={() => onNavigateArtist(artist, track.provider)}
              >
                {artist}
              </span>
              {idx < arr.length - 1 ? ", " : ""}
            </span>
          ))}
        </div>
      </div>

      {/* Progress Seek Bar */}
      <div className="fs-progress-wrap">
        <div
          ref={seekBarRef}
          className="fs-seek-bar"
          onPointerDown={onSeekPointerDown}
        >
          <div className="fill" style={{ width: `${shownPercent}%` }} />
          <div className="knob" style={{ left: `${shownPercent}%` }} />
        </div>
        <div className="fs-time-row">
          <span>{formatTime(shownMs)}</span>
          <span>{formatTime(durationMs)}</span>
        </div>
      </div>

      {/* Playback Controls */}
      <div className="fs-controls">
        <button
          className={`fs-ctrl-btn smart-shuffle ${smartShuffle ? "active" : player.shuffle ? "active" : "muted"}`}
          style={smartShuffle ? { color: "#1db954" } : undefined}
          onClick={onCycleShuffle}
          title={
            smartShuffle
              ? (lang === "ru" ? "Умное перемешивание (включено)" : "Smart Shuffle (On)")
              : player.shuffle
              ? (lang === "ru" ? "Перемешивание (нажмите для Умного)" : "Shuffle (Click for Smart)")
              : t(lang, "bottom.shuffle")
          }
          aria-label="Shuffle"
        >
          {SHUFFLE_SVG}
          {smartShuffle && <span className="fs-smart-sparkle"><IconSparkle size={12} /></span>}
        </button>
        <button
          className="fs-ctrl-btn"
          onClick={onPrev}
          title={t(lang, "bottom.previous")}
          aria-label="Previous"
        >
          {PREV_SVG}
        </button>
        <button
          className="fs-play-btn"
          onClick={onToggle}
          title={t(lang, "bottom.playPause")}
          aria-label={playing ? "Pause" : "Play"}
        >
          {playing ? PAUSE_SVG : PLAY_SVG}
        </button>
        <button
          className="fs-ctrl-btn"
          onClick={onNext}
          title={t(lang, "bottom.next")}
          aria-label="Next"
        >
          {NEXT_SVG}
        </button>
        <button
          className={`fs-ctrl-btn ${player.repeat === "off" ? "muted" : "active"}`}
          onClick={onRepeat}
          title={t(lang, "bottom.repeat")}
          aria-label="Repeat"
        >
          {REPEAT_SVG}
          {player.repeat === "one" && <span className="fs-rep-one">1</span>}
        </button>
      </div>

      {/* Volume Control */}
      <div className="fs-vol-wrap">
        <button
          className="fs-vol-btn"
          onClick={handleMute}
          title={muted ? "Включить звук" : "Выключить звук"}
          aria-label={muted ? "Unmute" : "Mute"}
        >
          {muted ? MUTE_SVG : VOLUME_SVG}
        </button>
        <div
          ref={volBarRef}
          className="fs-vol-bar"
          onPointerDown={onVolPointerDown}
        >
          <div className="fill" style={{ width: `${player.volume_percent}%` }} />
          <div className="knob" style={{ left: `${player.volume_percent}%` }} />
        </div>
      </div>
    </div>
  );
}
