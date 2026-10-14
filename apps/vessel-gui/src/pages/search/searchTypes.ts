import type { Playlist } from "../../api/types";

export interface SearchPlatform {
  key: string;
  label: string;
  color: string;
}

export const SEARCH_PLATFORMS: SearchPlatform[] = [
  { key: "soundcloud", label: "SoundCloud", color: "#FF5500" },
  { key: "youtube_music", label: "YouTube Music", color: "#FF0000" },
  { key: "spotify", label: "Spotify", color: "#1ED760" },
  { key: "yandex", label: "Яндекс Музыка", color: "#FFCC00" },
  { key: "deezer", label: "Deezer", color: "#A238FF" },
];

export const PROVIDER_VALUE: Record<string, string> = {
  soundcloud: "soundcloud",
  yandex: "yandex_music",
  deezer: "deezer",
  spotify: "spotify",
  youtube_music: "youtube_music",
};

export type SearchCategory = "all" | "tracks" | "playlists" | "albums" | "artists";

export interface PreviewState {
  playlist: Playlist | null;
  loading: boolean;
  provider: string | null;
}
