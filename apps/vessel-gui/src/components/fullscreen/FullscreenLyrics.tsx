import type { TrackRef } from "../../api/types";
import { LYRICS_SOURCES } from "../../lib/lyrics";
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
  lyricsSource?: string;
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
  lyricsSource = "cadence",
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
    lineProgress,
    curSeconds,
  } = useFullscreenLyrics({
    track,
    playerStatus,
    playerPositionMs,
    playerDurationMs,
    progressPositionMs,
    progressDurationMs,
    followTrack,
    lyricsSource,
    refresh,
    showToast,
  });

  const activeSource = LYRICS_SOURCES.find((s) => s.id === lyricsSource) || LYRICS_SOURCES[0];

  return (
    <div className="fs-right">
      {userScrolled && lyricsData?.synced && (
        <div className="fs-resume-scroll-wrapper">
          <button
            type="button"
            className="fs-resume-scroll-pill"
            onClick={() => {
              setUserScrolled(false);
              scrollToActive();
            }}
          >
            {lang === "ru" ? "К текущей строке" : "To current line"}
          </button>
        </div>
      )}

      {/* Main lyrics scroll area */}
      <div
        ref={lyricsContainerRef}
        className={`fs-lyrics-container ${scrolledTop ? "scrolled" : ""}`}
        onWheel={handleUserScrollInteraction}
        onTouchMove={handleUserScrollInteraction}
        onScroll={handleContainerScroll}
      >
        {loadingLyrics ? (
          <div className="fs-lyrics-status">
            <div className="fs-lyrics-spinner" />
            <p className="fs-status-main">{lang === "ru" ? "Загрузка текста…" : "Loading lyrics…"}</p>
          </div>
        ) : lyricsData?.instrumental ? (
          <div className="fs-lyrics-status">
            <div className="fs-lyrics-icon">♪</div>
            <p className="fs-status-main">{t(lang, "fullscreen.instrumental")}</p>
            <p className="fs-status-sub">{lang === "ru" ? "Слова для этого трека не предусмотрены" : "No words for this track"}</p>
          </div>
        ) : lyricsData?.plain && (!lyricsData.lines || lyricsData.lines.length === 0) ? (
          <div className="fs-plain-lyrics">
            <pre className="fs-plain-text">{lyricsData.plain}</pre>
          </div>
        ) : lyricsData && lyricsData.lines && lyricsData.lines.length > 0 ? (
          <div className="fs-lyrics-list">
            {lyricsData.lines.map((line, idx) => {
              const isActive = lyricsData.synced && idx === activeIndex;
              const isPast = lyricsData.synced && activeIndex >= 0 && idx < activeIndex;

              return (
                <div
                  key={`${line.time}-${idx}`}
                  ref={isActive ? activeLineRef : null}
                  className={`fs-lyric-line ${isActive ? "active" : ""} ${isPast ? "past" : ""}`}
                  onClick={() => lyricsData.synced && void handleSeekToLyric(line.time)}
                >
                  {isActive && line.words && line.words.length > 0 ? (
                    <span className="fs-lyric-words-wrap">
                      {line.words.map((w, wIdx) => {
                        const wEnd =
                          w.duration != null && w.duration > 0
                            ? w.time + w.duration
                            : (line.words![wIdx + 1]?.time ?? (w.time + 0.6));
                        const wDur = Math.max(0.1, wEnd - w.time);
                        const isWordDone = curSeconds >= wEnd;
                        const isWordFuture = curSeconds < w.time;
                        const wRatio = isWordDone
                          ? 1
                          : isWordFuture
                          ? 0
                          : Math.min(1, Math.max(0, (curSeconds - w.time) / wDur));

                        return (
                          <span key={wIdx}>
                            <span
                              className={`fs-lyric-word ${isWordDone ? "done" : isWordFuture ? "future" : "current"}`}
                              style={
                                {
                                  "--word-progress": `${wRatio * 100}%`,
                                } as React.CSSProperties
                              }
                            >
                              {w.text}
                            </span>
                            {wIdx < line.words!.length - 1 && <span className="fs-lyric-space"> </span>}
                          </span>
                        );
                      })}
                    </span>
                  ) : isActive ? (
                    <span
                      className="fs-lyric-line-fill"
                      style={
                        {
                          "--line-progress": `${(lineProgress * 100).toFixed(1)}%`,
                        } as React.CSSProperties
                      }
                    >
                      {line.text}
                    </span>
                  ) : (
                    line.text
                  )}
                </div>
              );
            })}
          </div>
        ) : (
          <div className="fs-lyrics-status">
            <div className="fs-lyrics-icon">♪</div>
            <p className="fs-status-main">{t(lang, "fullscreen.noLyrics")}</p>
            <p className="fs-status-sub">
              {lang === "ru"
                ? `Для трека «${track?.title}» текст пока отсутствует в базе ${activeSource.name}`
                : `No lyrics found for "${track?.title}" in ${activeSource.name}`}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
