import { invoke } from "@tauri-apps/api/core";
import type { ProviderStatus, VesselServerProbe, VesselServerView } from "../types";

export type { VesselServerProbe, VesselServerView };

export async function getProviderStatus(): Promise<ProviderStatus[]> {
  return invoke<ProviderStatus[]>("get_provider_status");
}

export async function saveCredential(provider: string, value: string): Promise<void> {
  return invoke("save_credential", { provider, value });
}

export async function probeCredential(provider: string, value: string): Promise<boolean> {
  return invoke<boolean>("probe_credential", { provider, value });
}

export async function removeCredential(provider: string): Promise<void> {
  return invoke("remove_credential", { provider });
}

export async function setProviderEnabled(provider: string, enabled: boolean): Promise<void> {
  return invoke("set_provider_enabled", { provider, enabled });
}

export async function getSpotifyProxy(): Promise<string> {
  return invoke<string>("get_spotify_proxy");
}

export async function setSpotifyProxy(path: string | null): Promise<void> {
  return invoke("set_spotify_proxy", { path });
}

export async function getSpotifyPlaybackSource(): Promise<string> {
  return invoke<string>("get_spotify_playback_source");
}

export async function setSpotifyPlaybackSource(source: string): Promise<void> {
  return invoke("set_spotify_playback_source", { source });
}

export async function spotifyBrowserLogin(): Promise<void> {
  return invoke("spotify_browser_login");
}

export async function spotifyCaptureCookies(): Promise<string> {
  return invoke<string>("spotify_capture_cookies");
}

export async function spotifyLoginWindowOpen(): Promise<boolean> {
  return invoke<boolean>("spotify_login_window_open");
}

export async function spotifyAuthCancel(): Promise<void> {
  return invoke("spotify_auth_cancel");
}

export async function soundcloudBrowserLogin(): Promise<void> {
  return invoke("soundcloud_browser_login");
}

export async function soundcloudLoginWindowOpen(): Promise<boolean> {
  return invoke<boolean>("soundcloud_login_window_open");
}

export async function soundcloudAuthCancel(): Promise<void> {
  return invoke("soundcloud_auth_cancel");
}

export async function deezerBrowserLogin(): Promise<void> {
  return invoke("deezer_browser_login");
}

export async function deezerLoginWindowOpen(): Promise<boolean> {
  return invoke<boolean>("deezer_login_window_open");
}

export async function deezerAuthCancel(): Promise<void> {
  return invoke("deezer_auth_cancel");
}

export async function vesselServers(): Promise<VesselServerView[]> {
  return invoke<VesselServerView[]>("vessel_servers");
}

export async function vesselRoutes(): Promise<Record<string, string>> {
  return invoke<Record<string, string>>("vessel_routes");
}

export async function vesselServerProbe(input: {
  id?: string;
  url?: string;
  token?: string;
}): Promise<VesselServerProbe> {
  return invoke<VesselServerProbe>("vessel_server_probe", {
    id: input.id ?? null,
    url: input.url ?? null,
    token: input.token ?? null,
  });
}

export async function vesselServerAdd(
  name: string,
  url: string,
  token: string,
): Promise<VesselServerView> {
  return invoke<VesselServerView>("vessel_server_add", { name, url, token });
}

export async function vesselServerRemove(id: string): Promise<void> {
  return invoke("vessel_server_remove", { id });
}

export async function vesselRouteSet(provider: string, target: string): Promise<void> {
  return invoke("vessel_route_set", { provider, target });
}

// kind (GUI) -> protocol-сегмент провайдера для маршрутов
export const PROVIDER_SEGMENT: Record<string, string> = {
  soundcloud: "soundcloud",
  yandex: "yandex_music",
  deezer: "deezer",
  spotify: "spotify",
  youtube_music: "youtube_music",
};
