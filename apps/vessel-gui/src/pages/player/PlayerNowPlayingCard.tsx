import type { TrackRef, PlayerState } from "../../api/types";
import { formatTime, providerLabel, filterValidArtists } from "../../lib/utils";
import { t, type Lang } from "../../i18n";
import { Artwork } from "../../components/Artwork";
import { PlatformIcon } from "../../components/PlatformIcon";
import { IconSparkle } from "../../components/Icons";
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
  EXPAND_SVG,
  getPlatformColor,
} from "./playerIcons";

interface PlayerNowPlayingCardProps {
  track: TrackRef | null | undefined;
  player: PlayerState | null | undefined;
  playing: boolean;
  fav: boolean;
  muted: boolean;
  smartShuffle: boolean;
  fullscreenOpen: boolean;
  lang: Lang;
  customTrackArt?: string | null;
  shownPercent: number;
  shownMs: number;
  durationMs: number;
  dragPercent: number | null;
  seekBarRef: React.RefObject<HTMLDivElement>;
  volBarRef: React.RefObject<HTMLDivElement>;
  onSeekPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onVolPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onToggle: () => void;
  onPrev: () => void;
  onNext: () => void;
  onRepeat: () => void;
  onFav: () => void;
  onMute: () => void;
  onCycleShuffle: () => void;
  onToggleFullscreen: () => void;
  onNavigateArtist: (artist: string, provider?: string) => void;
}

export function PlayerNowPlayingCard({
  track,
  player,
  playing,
  fav,
  muted,
  smartShuffle,
  fullscreenOpen,
  lang,
  customTrackArt,
  shownPercent,
  shownMs,
  durationMs,
  dragPercent,
  seekBarRef,
  volBarRef,
  onSeekPointerDown,
  onVolPointerDown,
  onToggle,
  onPrev,
  onNext,
  onRepeat,
  onFav,
  onMute,
  onCycleShuffle,
  onToggleFullscreen,
  onNavigateArtist,
}: PlayerNowPlayingCardProps) {
  return (
    <div
      className="player-main-card"
      style={{
        background: "transparent",
        backdropFilter: "none",
        WebkitBackdropFilter: "none",
        border: "none",
        borderRadius: 0,
        padding: "32px 8px 36px 8px",
        display: "flex",
        gap: 52,
        alignItems: "center",
        marginBottom: 32,
        boxShadow: "none",
        position: "relative",
      }}
    >
      {/* Left Artwork */}
      <div
        onClick={onToggleFullscreen}
        title={lang === "ru" ? "Открыть полноэкранный плеер" : "Open fullscreen player"}
        style={{
          position: "relative",
          zIndex: 2,
          width: 360,
          height: 360,
          flexShrink: 0,
          borderRadius: 16,
          overflow: "hidden",
          boxShadow: "0 16px 48px rgba(0,0,0,0.65)",
          cursor: "pointer",
          transition: "transform 0.18s ease, box-shadow 0.18s ease",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "scale(1.015)";
          e.currentTarget.style.boxShadow = "0 20px 54px rgba(0,0,0,0.75)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "scale(1)";
          e.currentTarget.style.boxShadow = "0 16px 48px rgba(0,0,0,0.65)";
        }}
      >
        {track ? (
          <Artwork
            url={customTrackArt || track.artwork_url}
            alt={track.title}
            seed={track.id.length}
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        ) : (
          <div
            style={{
              width: "100%",
              height: "100%",
              background: "#1a1a1e",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--text3)",
              fontSize: 48,
            }}
          >
            ♫
          </div>
        )}
      </div>

      {/* Right Info & Controls */}
      <div
        style={{
          flex: 1,
          minWidth: 0,
          display: "flex",
          flexDirection: "column",
          position: "relative",
          zIndex: 2,
        }}
      >
        {track ? (
          <>
            {/* Platform badge */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <PlatformIcon kind={track.provider as any} size={16} />
              <span
                style={{
                  color: getPlatformColor(track.provider),
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                {providerLabel(track.provider)}
              </span>
            </div>

            {/* Title */}
            <div
              style={{
                fontSize: 38,
                fontWeight: 800,
                color: "#ffffff",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                marginBottom: 8,
                letterSpacing: "-0.02em",
                lineHeight: 1.15,
              }}
              title={track.title}
            >
              {track.title}
            </div>

            {/* Artists */}
            <div
              style={{
                fontSize: 17.5,
                color: "rgba(255, 255, 255, 0.85)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                marginBottom: 32,
              }}
            >
              {filterValidArtists(track.artists).map((artist, idx, arr) => (
                <span key={`${artist}-${idx}`}>
                  <span
                    style={{ cursor: "pointer" }}
                    onClick={() => onNavigateArtist(artist, track.provider)}
                    onMouseEnter={(e) => (e.currentTarget.style.textDecoration = "underline")}
                    onMouseLeave={(e) => (e.currentTarget.style.textDecoration = "none")}
                  >
                    {artist}
                  </span>
                  {idx < arr.length - 1 ? ", " : ""}
                </span>
              ))}
            </div>

            {/* Progress seekbar */}
            <div style={{ marginBottom: 18 }}>
              <div
                ref={seekBarRef}
                onPointerDown={onSeekPointerDown}
                style={{
                  width: "100%",
                  height: 5,
                  background: "rgba(255, 255, 255, 0.15)",
                  borderRadius: 3,
                  position: "relative",
                  cursor: "pointer",
                  marginBottom: 7,
                }}
              >
                <div
                  style={{
                    width: `${shownPercent}%`,
                    height: "100%",
                    background: "#ffffff",
                    borderRadius: 3,
                    transition: dragPercent == null ? "width 0.1s linear" : "none",
                  }}
                />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontSize: 12,
                  color: "var(--text3, rgba(255,255,255,0.45))",
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                <span>{formatTime(shownMs)}</span>
                <span>{formatTime(durationMs)}</span>
              </div>
            </div>

            {/* Playback Controls & Volume Row */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              {/* Center controls */}
              <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
                <button
                  onClick={onCycleShuffle}
                  style={{
                    background: "none",
                    border: "none",
                    color: smartShuffle
                      ? "#1db954"
                      : player?.shuffle
                      ? "var(--accent, #3b82f6)"
                      : "var(--text3, rgba(255,255,255,0.45))",
                    cursor: "pointer",
                    padding: 4,
                    display: "flex",
                    position: "relative",
                  }}
                  title={
                    smartShuffle
                      ? (lang === "ru" ? "Умное перемешивание (включено)" : "Smart Shuffle (On)")
                      : player?.shuffle
                      ? (lang === "ru" ? "Перемешивание (нажмите для Умного)" : "Shuffle (Click for Smart)")
                      : t(lang, "bottom.shuffle")
                  }
                >
                  {SHUFFLE_SVG}
                  {smartShuffle && (
                    <span style={{ position: "absolute", top: -2, right: -2, color: "#1db954", display: "flex" }}>
                      <IconSparkle size={10} />
                    </span>
                  )}
                </button>
                <button
                  onClick={onPrev}
                  style={{ background: "none", border: "none", color: "var(--text, #fff)", cursor: "pointer", padding: 4, display: "flex" }}
                  title={t(lang, "bottom.previous")}
                >
                  {PREV_SVG}
                </button>
                <button
                  onClick={onToggle}
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 22,
                    background: "#ffffff",
                    color: "#0b0b0d",
                    border: "none",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 2px 10px rgba(0,0,0,0.3)",
                    transition: "transform 0.12s ease",
                  }}
                  title={playing ? "Пауза" : "Воспроизвести"}
                >
                  {playing ? PAUSE_SVG : PLAY_SVG}
                </button>
                <button
                  onClick={onNext}
                  style={{ background: "none", border: "none", color: "var(--text, #fff)", cursor: "pointer", padding: 4, display: "flex" }}
                  title={t(lang, "bottom.next")}
                >
                  {NEXT_SVG}
                </button>
                <button
                  onClick={onRepeat}
                  style={{
                    background: "none",
                    border: "none",
                    color: player?.repeat !== "off" ? "var(--accent, #3b82f6)" : "var(--text3, rgba(255,255,255,0.45))",
                    cursor: "pointer",
                    padding: 4,
                    display: "flex",
                    position: "relative",
                  }}
                  title={t(lang, "bottom.repeat")}
                >
                  {REPEAT_SVG}
                  {player?.repeat === "one" && (
                    <span style={{ position: "absolute", top: -3, right: -4, fontSize: 10, fontWeight: 700 }}>1</span>
                  )}
                </button>
              </div>

              {/* Like, Expand & Volume slider */}
              <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                {/* Like button */}
                <button
                  onClick={onFav}
                  style={{
                    background: "none",
                    border: "none",
                    color: fav ? "#ff4060" : "var(--text3, rgba(255,255,255,0.5))",
                    cursor: "pointer",
                    padding: 4,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "color 0.15s ease, transform 0.12s ease",
                  }}
                  title={t(lang, "bottom.favorite")}
                  aria-label="Favorite"
                >
                  {fav ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="#ff4060" stroke="#ff4060" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
                    </svg>
                  ) : (
                    HEART_SVG
                  )}
                </button>

                {/* Expand button (mini player icon) */}
                <button
                  onClick={onToggleFullscreen}
                  style={{
                    background: "none",
                    border: "none",
                    color: fullscreenOpen ? "var(--accent, #3b82f6)" : "var(--text3, rgba(255,255,255,0.5))",
                    cursor: "pointer",
                    padding: 4,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "color 0.15s ease, transform 0.12s ease",
                  }}
                  title={t(lang, "bottom.fullscreen")}
                  aria-label="Fullscreen player"
                >
                  {EXPAND_SVG}
                </button>

                {/* Volume slider */}
                <div style={{ display: "flex", alignItems: "center", gap: 10, width: 130 }}>
                  <button
                    onClick={onMute}
                    style={{ background: "none", border: "none", color: "var(--text3)", cursor: "pointer", padding: 2, display: "flex" }}
                    title={muted ? "Включить звук" : "Выключить звук"}
                  >
                    {muted ? MUTE_SVG : VOLUME_SVG}
                  </button>
                  <div
                    ref={volBarRef}
                    onPointerDown={onVolPointerDown}
                    style={{
                      flex: 1,
                      height: 4,
                      background: "rgba(255,255,255,0.15)",
                      borderRadius: 2,
                      position: "relative",
                      cursor: "pointer",
                    }}
                  >
                    <div
                      style={{
                        width: `${player?.volume_percent || 0}%`,
                        height: "100%",
                        background: "var(--text, #ffffff)",
                        borderRadius: 2,
                      }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </>
        ) : (
          <div style={{ color: "var(--text3)", textAlign: "center", padding: "40px 0", fontSize: 16 }}>
            {lang === "ru" ? "Сейчас ничего не играет" : "Nothing is currently playing"}
          </div>
        )}
      </div>
    </div>
  );
}
