import { useState } from "react";
import type { TrackRef } from "../api/types";
import { tone } from "./Artwork";
import { resolveArtworkUrl } from "../lib/utils";

interface PlaylistCoverProps {
  tracks: TrackRef[];
  coverUrl?: string | null;
  size?: number;
  className?: string;
  border?: boolean;
  onPlayClick?: () => void;
  isPlaying?: boolean;
}

export function PlaylistCover({
  tracks,
  coverUrl,
  size,
  className,
  border = true,
  onPlayClick,
  isPlaying = false,
}: PlaylistCoverProps) {
  const [hover, setHover] = useState(false);
  const first = tracks.slice(0, 4);

  const style: React.CSSProperties = {
    width: size ?? "100%",
    height: size ?? "100%",
    borderRadius: 6,
    overflow: "hidden",
    display: "flex",
    flexWrap: "wrap",
    flexShrink: 0,
    position: "relative",
    ...(border ? { border: "1px solid var(--border2)" } : {}),
    background: "var(--elev)",
  };

  const cellSize = size ? size / 2 : "50%";

  const resolvedCover = resolveArtworkUrl(coverUrl);

  const content = resolvedCover ? (
    <img
      src={resolvedCover}
      alt=""
      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
    />
  ) : first.length === 0 ? (
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontSize: 22,
        color: "var(--text3)",
      }}
    >
      ♫
    </div>
  ) : (
    first.map((track, i) => {
      const trackArt = resolveArtworkUrl(track.artwork_url);
      return (
        <div
          key={i}
          style={{
            width: cellSize,
            height: cellSize,
            overflow: "hidden",
            background: tone(i + 1),
          }}
        >
          {trackArt ? (
            <img
              src={trackArt}
              alt=""
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
            />
          ) : null}
        </div>
      );
    })
  );

  return (
    <div
      className={className}
      style={style}
      onMouseEnter={() => onPlayClick && setHover(true)}
      onMouseLeave={() => setHover(false)}
      onClick={(e) => {
        if (!onPlayClick) return;
        e.stopPropagation();
        onPlayClick();
      }}
    >
      {content}
      {onPlayClick && hover && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(8,8,9,.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div
            style={{
              width: size ? Math.max(32, size * 0.32) : 44,
              height: size ? Math.max(32, size * 0.32) : 44,
              borderRadius: "50%",
              background: "var(--text)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#0B0B0C",
              cursor: "pointer",
            }}
          >
            {isPlaying ? (
              <span style={{ display: "flex", gap: 3 }}>
                <span style={{ width: 3, height: 14, background: "#0B0B0C", borderRadius: 1 }} />
                <span style={{ width: 3, height: 14, background: "#0B0B0C", borderRadius: 1 }} />
              </span>
            ) : (
              <span
                style={{
                  width: 0,
                  height: 0,
                  borderTop: "7px solid transparent",
                  borderBottom: "7px solid transparent",
                  borderLeft: "11px solid #0B0B0C",
                  marginLeft: 3,
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}