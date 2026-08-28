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
}

export function Artwork({
  url,
  alt,
  size,
  className,
  seed,
  square = true,
}: ArtworkProps) {
  const style: React.CSSProperties = {
    background: tone(seed ?? 0),
    ...(square ? { width: size, height: size } : {}),
  };

  if (url) {
    return (
      <div
        className={className}
        style={{ ...style, overflow: "hidden", background: "#202024" }}
      >
        <img src={url} alt={alt} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
      </div>
    );
  }

  return (
    <div className={className} style={style} aria-label={alt}>
      {!square && (
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
    </div>
  );
}
