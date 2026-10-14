import type { TrackRef } from "../../api/types";
import { formatTime } from "../../lib/utils";
import { t, type Lang } from "../../i18n";
import { useFullscreenLyrics } from "./useFullscreenLyrics";

export interface FullscreenLyricsProps {
  track: TrackRef | null | undefined;
  playerStatus: string | undefined;
  playerPositionMs: number | undefined;
  playerDurationMs: number | undefined;
  progressPositionMs: number | undefined;
  progressDurationMs: number | undefined;
  followTrack: boolean;
  lang: Lang;
  refresh: () => Promise<void>;
  showToast: (msg: string, isError?: boolean) => void;
}

export function FullscreenLyrics({
  track,
  playerStatus,
  playerPositionMs,
  playerDurationMs,
  progressPositionMs,
  progressDurationMs,
  followTrack,
  lang,
  refresh,
  showToast,
}: FullscreenLyricsProps) {
  const {
    lyricsData,
    loadingLyrics,
    userScrolled,
    scrolledTop,
    activeIndex,
    activeLineRef,
    lyricsContainerRef,
    scrollToActive,
    setUserScrolled,
    handleUserScrollInteraction,
    handleContainerScroll,
    handleSeekToLyric,
  } = useFullscreenLyrics({
    track,
    playerStatus,
    playerPositionMs,
    playerDurationMs,
    progressPositionMs,
    progressDurationMs,
    followTrack,
    refresh,
    showToast,
  });

  return (
    <div className="fs-right">
      <div className="fs-lyrics-header">
        <span className="fs-lyrics-title">{t(lang, "fullscreen.lyrics")}</span>
        {userScrolled && lyricsData?.synced && (
          <button
            className="fs-resume-scroll-btn"
            onClick={() => {
              setUserScrolled(false);
              scrollToActive();
            }}
          >
            К текущей строке
          </button>
        )}
      </div>

      <div
        ref={lyricsContainerRef}
        className={`fs-lyrics-container ${scrolledTop ? "scrolled-top" : ""}`}
        onScroll={handleContainerScroll}
        onWheel={handleUserScrollInteraction}
        onTouchMove={handleUserScrollInteraction}
        onPointerDown={handleUserScrollInteraction}
      >
        {loadingLyrics ? (
          <div className="fs-lyrics-status">
            <div className="fs-lyrics-spinner" />
            <p>{t(lang, "fullscreen.searchingLyrics")}</p>
          </div>
        ) : lyricsData?.instrumental ? (
          <div className="fs-lyrics-status">
            <div className="fs-lyrics-icon">♪</div>
            <p className="fs-status-main">{t(lang, "fullscreen.instrumental")}</p>
            <p className="fs-status-sub">{lyricsData.plain}</p>
          </div>
        ) : lyricsData?.lines && lyricsData.lines.length > 0 ? (
          <div className="fs-lyrics-list">
            {lyricsData.lines.map((line, idx) => {
              const isActive = lyricsData.synced && idx === activeIndex;
              const isPast = lyricsData.synced && idx < activeIndex;
              return (
                <div
                  key={`${line.time}-${idx}`}
                  ref={isActive ? activeLineRef : null}
                  className={`fs-lyric-line ${isActive ? "active" : ""} ${isPast ? "past" : ""}`}
                  onClick={() => {
                    if (lyricsData.synced) {
                      void handleSeekToLyric(line.time);
                    }
                  }}
                  title={lyricsData.synced ? `Перейти к ${formatTime(line.time * 1000)}` : undefined}
                >
                  {line.text}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="fs-lyrics-status">
            <div className="fs-lyrics-icon">♪</div>
            <p className="fs-status-main">{t(lang, "fullscreen.noLyrics")}</p>
            <p className="fs-status-sub">
              Для трека «{track?.title}» текст пока отсутствует в базе LRCLIB
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
