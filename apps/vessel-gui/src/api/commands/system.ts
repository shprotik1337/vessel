import { invoke } from "@tauri-apps/api/core";
import type {
  AccountState,
  AuthResult,
  CaptchaChallenge,
  CloudSyncResult,
  DownloadBatchResult,
  FullState,
  LoginRequest,
  RegisterRequest,
  StorageStats,
  SyncedUserSettings,
  TrackRef,
  UpdateProfileRequest,
  UserInfo,
  UserSettingsResponse,
  SaveUserSettingsRequest,
  SaveUserSettingsResponse,
} from "../types";

export type { CloudSyncResult, DownloadBatchResult, SyncedUserSettings, UserSettingsResponse, SaveUserSettingsRequest, SaveUserSettingsResponse };

export async function getState(): Promise<FullState> {
  return invoke<FullState>("get_state");
}

export async function resetSettings(): Promise<void> {
  return invoke("reset_settings");
}

export async function resetData(): Promise<void> {
  return invoke("reset_data");
}

export async function getLanguage(): Promise<string> {
  return invoke<string>("get_language");
}

export async function setLanguage(language: string): Promise<void> {
  return invoke("set_language", { language });
}

export async function getDiscordRpc(): Promise<boolean> {
  return invoke<boolean>("get_discord_rpc");
}

export async function setDiscordRpc(enabled: boolean): Promise<void> {
  return invoke("set_discord_rpc", { enabled });
}

export async function pickFolder(): Promise<string | null> {
  return invoke<string | null>("pick_folder");
}

export async function pickFile(extensions?: string[]): Promise<string | null> {
  return invoke<string | null>("pick_file", { extensions: extensions ?? null });
}

export async function saveFileAs(
  defaultName?: string,
  extensions?: string[],
): Promise<string | null> {
  return invoke<string | null>("save_file_as", {
    defaultName: defaultName ?? null,
    extensions: extensions ?? null,
  });
}

export async function openPath(path: string): Promise<void> {
  return invoke("open_path", { path });
}

export async function openUrl(url: string): Promise<void> {
  return invoke("open_url", { url });
}

export async function getDataDir(): Promise<string> {
  return invoke<string>("get_data_dir");
}

export async function getDatabasePath(): Promise<string> {
  return invoke<string>("get_database_path");
}

export async function writeTextFile(path: string, content: string): Promise<void> {
  return invoke("write_text_file", { path, content });
}

export async function readTextFile(path: string): Promise<string> {
  return invoke<string>("read_text_file", { path });
}

export async function windowMinimize(): Promise<void> {
  return invoke("window_minimize");
}

export async function windowToggleMaximize(): Promise<void> {
  return invoke("window_toggle_maximize");
}

export async function windowIsMaximized(): Promise<boolean> {
  return invoke<boolean>("window_is_maximized");
}

export async function windowClose(): Promise<void> {
  return invoke("window_close");
}

export async function windowStartDragging(): Promise<void> {
  return invoke("window_start_dragging");
}

export async function windowSetZoom(scale: number): Promise<void> {
  return invoke("window_set_zoom", { scale });
}

export async function loadImageAsDataUrl(path: string): Promise<string> {
  return invoke<string>("load_image_as_data_url", { path });
}

export async function downloadTrack(track: TrackRef): Promise<string> {
  return invoke<string>("download_track", { track });
}

export async function downloadTrackToCache(track: TrackRef): Promise<string> {
  return invoke<string>("download_track_to_cache", { track });
}

export async function downloadAllToCache(
  tracks: TrackRef[],
): Promise<DownloadBatchResult> {
  return invoke<DownloadBatchResult>("download_all_to_cache", { tracks });
}

export async function getDownloadDir(): Promise<string> {
  return invoke<string>("get_download_dir");
}

export async function setDownloadDir(path: string | null): Promise<void> {
  return invoke("set_download_dir", { path });
}

export async function getCacheDir(): Promise<string> {
  return invoke<string>("get_cache_dir");
}

export async function setCacheDir(path: string | null): Promise<void> {
  return invoke("set_cache_dir", { path });
}

export async function authGetCaptcha(): Promise<CaptchaChallenge> {
  return invoke<CaptchaChallenge>("auth_get_captcha");
}

export async function authRegister(req: RegisterRequest): Promise<AuthResult> {
  return invoke<AuthResult>("auth_register", { req });
}

export async function authLogin(req: LoginRequest): Promise<AuthResult> {
  return invoke<AuthResult>("auth_login", { req });
}

export async function authLogout(): Promise<void> {
  return invoke("auth_logout");
}

export async function authContinueGuest(): Promise<void> {
  return invoke("auth_continue_guest");
}

export async function authMigrateData(): Promise<void> {
  return invoke("auth_migrate_data");
}

export async function authDownloadCloudData(): Promise<CloudSyncResult> {
  return invoke<CloudSyncResult>("auth_download_cloud_data");
}

export async function authGetAccountState(): Promise<AccountState> {
  return invoke<AccountState>("auth_get_account_state");
}

export async function authGetProfile(): Promise<UserInfo> {
  return invoke<UserInfo>("auth_get_profile");
}

export async function authUpdateProfile(req: UpdateProfileRequest): Promise<UserInfo> {
  return invoke<UserInfo>("auth_update_profile", { req });
}

export async function getAutoCache(): Promise<boolean> {
  return invoke<boolean>("get_auto_cache");
}

export async function setAutoCache(enabled: boolean): Promise<void> {
  return invoke("set_auto_cache", { enabled });
}

export async function getStorageStats(): Promise<StorageStats> {
  return invoke<StorageStats>("get_storage_stats");
}

export async function clearStorageCache(target?: "all" | "tracks" | "covers"): Promise<StorageStats> {
  return invoke<StorageStats>("clear_storage_cache", { target: target ?? null });
}

export async function authGetUserSettings(): Promise<UserSettingsResponse> {
  return invoke<UserSettingsResponse>("auth_get_user_settings");
}

export async function authSaveUserSettings(req: SaveUserSettingsRequest): Promise<SaveUserSettingsResponse> {
  return invoke<SaveUserSettingsResponse>("auth_save_user_settings", { req });
}

export async function authSyncSettings(localSettings?: SyncedUserSettings | null): Promise<UserSettingsResponse> {
  return invoke<UserSettingsResponse>("auth_sync_settings", { localSettings: localSettings ?? null });
}
