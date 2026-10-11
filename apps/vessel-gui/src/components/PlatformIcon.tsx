import type { CSSProperties } from "react";
import yandexLogo from "../assets/yandex_music.png";

export type PlatformKind =
  | "soundcloud"
  | "deezer"
  | "yandex"
  | "spotify"
  | "you_tube_music"
  | "youtube_music";

interface PlatformIconProps {
  kind: PlatformKind | string;
  size?: number;
  className?: string;
  style?: CSSProperties;
  color?: string;
}

export function PlatformIcon({
  kind,
  size = 20,
  className = "",
  style = {},
  color,
}: PlatformIconProps) {
  const normKind = kind === "you_tube_music" ? "youtube_music" : kind;
  const svgStyle: CSSProperties = {
    display: "inline-block",
    verticalAlign: "middle",
    flexShrink: 0,
    color: color || "currentColor",
    ...style,
  };

  switch (normKind) {
    case "youtube_music":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="currentColor"
          className={className}
          style={svgStyle}
        >
          <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z" />
        </svg>
      );

    case "spotify":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="currentColor"
          className={className}
          style={svgStyle}
        >
          <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.494 17.305a.75.75 0 0 1-1.03.248c-2.822-1.724-6.375-2.114-10.559-1.157a.748.748 0 0 1-.337-1.458c4.58-1.049 8.514-.606 11.678 1.337a.75.75 0 0 1 .248 1.03zm1.467-3.262a.936.936 0 0 1-1.288.308c-3.23-1.986-8.156-2.56-11.977-1.4a.938.938 0 0 1-.55-1.791c4.369-1.327 9.8-.686 13.507 1.595a.936.936 0 0 1 .308 1.288zm.126-3.41c-3.874-2.3-10.264-2.513-13.978-1.385a1.124 1.124 0 0 1-.65-2.152c4.27-1.296 11.33-1.045 15.795 1.606a1.125 1.125 0 0 1-1.167 1.931z" />
        </svg>
      );

    case "soundcloud":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="currentColor"
          className={className}
          style={svgStyle}
        >
          <path d="M11.56 8.87V17h7.22c2.09 0 3.78-1.69 3.78-3.78 0-2.02-1.58-3.66-3.58-3.77-.38-2.61-2.63-4.62-5.34-4.62-1.01 0-1.95.28-2.76.77.29 1.05.5 2.16.68 3.27zm-1.89 8.13V9.75c-.24-1.07-.55-2.13-.93-3.13v10.38h.93zm-1.87 0v-8.9c-.28-.75-.62-1.46-1.01-2.1v11h1.01zm-1.88 0V8.75c-.32-.48-.68-.92-1.08-1.3v9.55h1.08zm-1.87 0v-7.3c-.35-.22-.72-.4-1.12-.52v7.82h1.12zm-1.87 0v-6.3c-.39-.02-.77.01-1.13.08v6.22h1.13zm-1.88 0v-5.2c-.38.16-.73.38-1.04.66v4.54h1.04zm-1.87 0v-3.48c-.4.43-.72.93-.94 1.49v1.99h.94z" />
        </svg>
      );

    case "yandex":
    case "yandex_music":
      return (
        <img
          src={yandexLogo}
          alt="Yandex Music"
          width={size}
          height={size}
          className={className}
          style={{
            width: size,
            height: size,
            objectFit: "contain",
            display: "inline-block",
            verticalAlign: "middle",
            flexShrink: 0,
            ...style,
          }}
        />
      );

    case "deezer":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="currentColor"
          className={className}
          style={svgStyle}
        >
          <path d="M18.8 4.6h4.5v3.1h-4.5V4.6zm-6.2 3.1h4.5v3.1h-4.5V7.7zm6.2 3.1h4.5v3.1h-4.5v-3.1zm-12.5 3.1h4.5v3.1H6.3V14zm6.3 0h4.5v3.1h-4.5V14zm6.2 0h4.5v3.1h-4.5V14zM0 17.1h4.5v3.1H0v-3.1zm6.3 0h4.5v3.1H6.3v-3.1zm6.3 0h4.5v3.1h-4.5v-3.1zm6.2 0h4.5v3.1h-4.5v-3.1z" />
        </svg>
      );

    case "vk":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="currentColor"
          className={className}
          style={svgStyle}
        >
          <path d="M15.684 0H8.316C2.992 0 0 2.992 0 8.316v7.368C0 21.008 2.992 24 8.316 24h7.368C21.008 24 24 21.008 24 15.684V8.316C24 2.992 21.008 0 15.684 0zm3.602 17.185h-1.68c-.636 0-.832-.507-1.977-1.652-1-.98-1.444-1.107-1.69-1.107-.346 0-.444.1-.444.577v1.547c0 .412-.132.635-1.226.635-1.808 0-3.818-1.096-5.23-3.136-2.146-3.033-2.73-5.318-2.73-5.787 0-.256.1-.493.585-.493h1.681c.44 0 .605.2.775.674 1.05 3.032 2.798 5.69 3.518 5.69.27 0 .393-.124.393-.804v-3.11c-.084-1.253-.733-1.358-.733-1.802 0-.213.176-.425.46-.425h2.637c.367 0 .496.195.496.63v4.204c0 .367.164.496.27.496.22 0 .405-.128.818-.54 1.27-1.378 2.18-3.504 2.18-3.504.12-.256.326-.486.764-.486h1.68c.508 0 .614.256.505.614-.207.962-2.228 3.824-2.33 3.987-.23.36-.32.52 0 .945.228.307.98 1.033 1.48 1.696.93 1.238 1.636 2.276 1.83 2.532.203.267.106.585-.355.585z" />
        </svg>
      );

    case "apple":
    case "apple_music":
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="currentColor"
          className={className}
          style={svgStyle}
        >
          <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M15.97 4.95c.61-.74 1.02-1.76.91-2.79-.88.04-1.95.59-2.58 1.32-.55.64-.99 1.67-.86 2.67.98.08 1.92-.46 2.53-1.2z" />
        </svg>
      );

    default:
      return (
        <svg
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="currentColor"
          className={className}
          style={svgStyle}
        >
          <circle cx="12" cy="12" r="10" />
        </svg>
      );
  }
}