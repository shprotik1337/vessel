import { invoke } from "@tauri-apps/api/core";
import type { UserProfile } from "../types";

export async function getUserProfile(): Promise<UserProfile | null> {
  return invoke<UserProfile | null>("get_user_profile");
}

export async function getKnownUsers(): Promise<UserProfile[]> {
  return invoke<UserProfile[]>("get_known_users");
}

export async function switchUser(name: string): Promise<void> {
  return invoke("switch_user", { name });
}

export async function createUser(name: string): Promise<UserProfile> {
  return invoke<UserProfile>("create_user", { name });
}

export async function exportUser(destination: string): Promise<string> {
  return invoke<string>("export_user", { destination });
}

export async function importUser(source: string): Promise<UserProfile> {
  return invoke<UserProfile>("import_user", { source });
}

export async function backupUser(): Promise<string> {
  return invoke<string>("backup_user");
}

export async function selectUser(name: string, remember: boolean): Promise<void> {
  return invoke("select_user", { name, remember });
}

export async function clearAutoLogin(): Promise<void> {
  return invoke("clear_auto_login");
}

export async function getAutoLogin(): Promise<string | null> {
  return invoke<string | null>("get_auto_login");
}

export async function deleteUser(name: string): Promise<void> {
  return invoke("delete_user", { name });
}

export async function getUsersDir(): Promise<string> {
  return invoke<string>("get_users_dir");
}
