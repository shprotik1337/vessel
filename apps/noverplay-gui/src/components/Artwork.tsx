import { useState } from "react";

const TONES = [
  "#26262A",
  "#2E2F33",
  "#232428",
  "#2A2B2E",
  "#202024",
  "#33343A",
];

export function tone(n: number): string {
  const index = ((n % TONES.length) + TONES.length) % TONES.length;
  return TONES[index] || "#26262A";
}

interface ArtworkProps {
  url: string | null | undefined;
  alt: string;
  size?: number;
  className?: string;
  seed?: number;
  square?: boolean;
  style?: React.CSSProperties;
  onClick?: (e: React.MouseEvent) => void;
  onPlayClick?: () => void;
  isPlaying?: boolean;
}

export function Artwork({
  url,
  alt,
  size,
  className,
  seed,
  square = true,
  style: extraStyle,
  onClick,
  onPlayClick,
  isPlaying = false,
}: ArtworkProps) {
  const [hover, setHover] = useState(false);
  const showOverlay = onPlayClick && hover;

  const style: React.CSSProperties = {
    background: tone(seed ?? 0),
    position: "relative",
    ...(square ? { width: size, height: size } : {}),
    ...extraStyle,
  };

  const img = url ? (
    <img
      src={url}
      alt={alt}
      style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
    />
  ) : null;

  return (
    <div
      className={className}
      style={style}
      aria-label={alt}
      onClick={onClick}
      onMouseEnter={() => onPlayClick && setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {url ? (
        <div style={{ width: "100%", height: "100%", overflow: "hidden" }}>{img}</div>
      ) : square ? null : (
        <span
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            height: "100%",
            fontSize: size ? size * 0.4 : 18,
            color: "rgba(244,244,245,0.35)",
            fontWeight: 600,
          }}
        >
          {alt.charAt(0).toUpperCase()}
        </span>
      )}
      {showOverlay && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            background: "rgba(8,8,9,.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
          }}
          onClick={(e) => {
            e.stopPropagation();
            if (onPlayClick) onPlayClick();
          }}
        >
          <div
            style={{
              width: size ? Math.max(20, size * 0.4) : 28,
              height: size ? Math.max(20, size * 0.4) : 28,
              borderRadius: "50%",
              background: "var(--text)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "#0B0B0C",
            }}
          >
            {isPlaying ? (
              <span style={{ display: "flex", gap: 2 }}>
                <span style={{ width: 2, height: 10, background: "#0B0B0C", borderRadius: 1 }} />
                <span style={{ width: 2, height: 10, background: "#0B0B0C", borderRadius: 1 }} />
              </span>
            ) : (
              <span
                style={{
                  width: 0,
                  height: 0,
                  borderTop: "5px solid transparent",
                  borderBottom: "5px solid transparent",
                  borderLeft: "8px solid #0B0B0C",
                  marginLeft: 2,
                }}
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}