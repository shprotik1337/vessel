import React from "react";
import type { TrackRef } from "../../api/types";
import { t, type Lang } from "../../i18n";
import { type useFullscreenLyrics } from "./useFullscreenLyrics";
import { BraccatoLyricsView } from "./BraccatoLyricsView";

export interface FullscreenLyricsProps {
  track: TrackRef | null | undefined;
  playerStatus: string | undefined;
  lang: Lang;
  lyrics: ReturnType<typeof useFullscreenLyrics>;
}

export function FullscreenLyrics({
  track,
  playerStatus,
  lang,
  lyrics,
}: FullscreenLyricsProps) {
  const {
    lyricsData,
    loadingLyrics,
    scrolledTop,
    activeIndex,
    activeLineRef,
    lyricsContainerRef,
    handleUserScrollInteraction,
    handleContainerScroll,
    handleSeekToLyric,
    lineProgress,
    curSeconds,
    activeProvider,
  } = lyrics;

  return (
    <div className="fs-right">
      {loadingLyrics ? (
        <div className="fs-lyrics-container">
          <div className="fs-lyrics-status">
            <div className="fs-lyrics-spinner" />
            <p className="fs-status-main">{lang === "ru" ? "Загрузка текста…" : "Loading lyrics…"}</p>
          </div>
        </div>
      ) : lyricsData?.instrumental ? (
        <div className="fs-lyrics-container">
          <div className="fs-lyrics-status">
            <div className="fs-lyrics-icon">♪</div>
            <p className="fs-status-main">{t(lang, "fullscreen.instrumental")}</p>
            <p className="fs-status-sub">
              {lang === "ru" ? "Слова для этого трека не предусмотрены" : "No words for this track"}
            </p>
          </div>
        </div>
      ) : lyricsData?.plain && (!lyricsData.lines || lyricsData.lines.length === 0) ? (
        <div className="fs-lyrics-container">
          <div className="fs-plain-lyrics">
            <pre className="fs-plain-text">{lyricsData.plain}</pre>
          </div>
        </div>
      ) : lyricsData && lyricsData.braccatoLyrics && lyricsData.braccatoLyrics.length > 0 ? (
        <BraccatoLyricsView
          lyrics={lyricsData.braccatoLyrics}
          curSeconds={curSeconds}
          isPlaying={playerStatus === "playing"}
          onSeek={(timeS) => void handleSeekToLyric(timeS)}
          onUserScrollInteraction={handleUserScrollInteraction}
          onContainerScroll={handleContainerScroll}
          scrolledTop={scrolledTop}
        />
      ) : lyricsData && lyricsData.lines && lyricsData.lines.length > 0 ? (
        <div
          ref={lyricsContainerRef}
          className={`fs-lyrics-container ${scrolledTop ? "scrolled-top" : ""}`}
          onWheel={handleUserScrollInteraction}
          onTouchMove={handleUserScrollInteraction}
          onScroll={handleContainerScroll}
        >
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
        </div>
      ) : (
        <div className="fs-lyrics-container">
          <div className="fs-lyrics-status">
            <div className="fs-lyrics-icon">♪</div>
            <p className="fs-status-main">{t(lang, "fullscreen.noLyrics")}</p>
            <p className="fs-status-sub">
              {lang === "ru"
                ? `Для трека «${track?.title}» текст пока не найден${
                    activeProvider ? ` (${activeProvider})` : ""
                  }`
                : `No lyrics found for "${track?.title}"${
                    activeProvider ? ` (${activeProvider})` : ""
                  }`}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
