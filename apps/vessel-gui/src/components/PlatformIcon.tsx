interface PlatformIconProps {
  kind: "soundcloud" | "deezer" | "yandex" | "spotify" | "you_tube_music";
  size?: number;
  className?: string;
}

const icons: Record<string, string> = {
  soundcloud: "soundcloud.png",
  deezer: "deezer.png",
  yandex: "yandex.png",
  spotify: "spotify.png",
  you_tube_music: "youtube_music.png",
  youtube_music: "youtube_music.png",
};

export function PlatformIcon({ kind, size = 18, className }: PlatformIconProps) {
  return (
    <img
      src={`/assets/${icons[kind]}`}
      alt={kind}
      width={size}
      height={size}
      className={className}
      style={{ display: "block", objectFit: "contain", flexShrink: 0 }}
      draggable={false}
    />
  );
}