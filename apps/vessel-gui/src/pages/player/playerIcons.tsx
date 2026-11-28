
export const HEART_SVG = (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z" />
  </svg>
);

export const SHUFFLE_SVG = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="16 3 21 3 21 8" />
    <line x1="4" y1="20" x2="21" y2="3" />
    <polyline points="21 16 21 21 16 21" />
    <line x1="15" y1="15" x2="21" y2="21" />
    <line x1="4" y1="4" x2="9" y2="9" />
  </svg>
);

export const PREV_SVG = (
  <svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <rect x="4.5" y="5.5" width="2.4" height="13" rx="1.2" />
    <path d="M17.75 6.1C18.58 5.58 19.65 6.18 19.65 7.15V16.85C19.65 17.82 18.58 18.42 17.75 17.9L9.65 13.05C8.85 12.57 8.85 11.43 9.65 10.95L17.75 6.1Z" />
  </svg>
);

export const NEXT_SVG = (
  <svg width="23" height="23" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M6.25 6.1C5.42 5.58 4.35 6.18 4.35 7.15V16.85C4.35 17.82 5.42 18.42 6.25 17.9L14.35 13.05C15.15 12.57 15.15 11.43 14.35 10.95L6.25 6.1Z" />
    <rect x="17.1" y="5.5" width="2.4" height="13" rx="1.2" />
  </svg>
);

export const PLAY_SVG = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <path d="M7 4l14 8-14 8V4z" />
  </svg>
);

export const PAUSE_SVG = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
    <rect x="6" y="5" width="4" height="14" rx="1" />
    <rect x="14" y="5" width="4" height="14" rx="1" />
  </svg>
);

export const REPEAT_SVG = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M17 1l4 4-4 4" />
    <path d="M3 11V9a4 4 0 0 1 4-4h14" />
    <path d="M7 23l-4-4 4-4" />
    <path d="M21 13v2a4 4 0 0 1-4 4H3" />
  </svg>
);

export const VOLUME_SVG = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M15.5 8.5a5 5 0 0 1 0 7" />
  </svg>
);

export const MUTE_SVG = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <line x1="23" y1="9" x2="17" y2="15" />
    <line x1="17" y1="9" x2="23" y2="15" />
  </svg>
);

export const TRASH_SVG = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);

export const EXPAND_SVG = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <polyline points="15 3 21 3 21 9" />
    <polyline points="9 21 3 21 3 15" />
    <line x1="21" y1="3" x2="14" y2="10" />
    <line x1="3" y1="21" x2="10" y2="14" />
  </svg>
);

export const EQUALIZER_SVG = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="4" y1="21" x2="4" y2="14" />
    <line x1="4" y1="10" x2="4" y2="3" />
    <line x1="12" y1="21" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12" y2="3" />
    <line x1="20" y1="21" x2="20" y2="16" />
    <line x1="20" y1="12" x2="20" y2="3" />
    <line x1="1" y1="14" x2="7" y2="14" />
    <line x1="9" y1="8" x2="15" y2="8" />
    <line x1="17" y1="16" x2="23" y2="16" />
  </svg>
);

export function getPlatformColor(provider?: string): string {
  switch (provider?.toLowerCase()) {
    case "soundcloud":
      return "#ff5500";
    case "spotify":
      return "#1ed760";
    case "you_tube_music":
    case "youtube":
      return "#ff0000";
    case "deezer":
      return "#a238ff";
    case "yandex":
      return "#fc3f1d";
    case "vk":
      return "#0077ff";
    case "apple_music":
    case "apple":
      return "#fc3c44";
    default:
      return "var(--accent, #6366f1)";
  }
}
