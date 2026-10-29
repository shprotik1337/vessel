import { openUrl } from "../api/commands";

export const APP_CURRENT_VERSION = "1.5.0";
export const GITHUB_REPO = "shprotik1337/vessel";
export const GITHUB_LATEST_RELEASE_API = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`;

export interface ReleaseAsset {
  name: string;
  browser_download_url: string;
  size: number;
  content_type: string;
}

export interface GitHubRelease {
  tag_name: string;
  name: string;
  body: string;
  html_url: string;
  published_at: string;
  prerelease: boolean;
  draft: boolean;
  assets: ReleaseAsset[];
}

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseName: string;
  releaseNotes: string;
  releaseUrl: string;
  publishedAt: string;
  downloadUrl?: string;
  installerName?: string;
  installerSize?: number;
}

/**
 * Нормализует строку версии (удаляет префиксы 'v', пробелы)
 */
export function normalizeVersion(v: string): string {
  return v.replace(/^[vV]/, "").trim();
}

/**
 * Семантическое сравнение версий:
 * Возвращает 1, если v1 > v2; -1, если v1 < v2; 0, если равны.
 */
export function compareVersions(v1: string, v2: string): number {
  const norm1 = normalizeVersion(v1);
  const norm2 = normalizeVersion(v2);

  const parts1 = norm1.split(".").map((p) => {
    const n = parseInt(p, 10);
    return isNaN(n) ? 0 : n;
  });
  const parts2 = norm2.split(".").map((p) => {
    const n = parseInt(p, 10);
    return isNaN(n) ? 0 : n;
  });

  const maxLen = Math.max(parts1.length, parts2.length);
  for (let i = 0; i < maxLen; i++) {
    const val1 = parts1[i] ?? 0;
    const val2 = parts2[i] ?? 0;
    if (val1 > val2) return 1;
    if (val1 < val2) return -1;
  }
  return 0;
}

/**
 * Находит наиболее подходящий установщик для Windows среди Assets
 */
export function pickWindowsInstaller(assets: ReleaseAsset[]): ReleaseAsset | undefined {
  if (!assets || assets.length === 0) return undefined;

  // 1. Предпочитаем файл установщика (_setup.exe / setup.exe)
  const setupAsset = assets.find((a) => {
    const name = a.name.toLowerCase();
    return name.endsWith(".exe") && (name.includes("setup") || name.includes("installer"));
  });
  if (setupAsset) return setupAsset;

  // 2. Иначе любой .exe файл (например, vessel.exe)
  const exeAsset = assets.find((a) => a.name.toLowerCase().endsWith(".exe"));
  if (exeAsset) return exeAsset;

  return undefined;
}

/**
 * Выполняет асинхронный запрос к GitHub Releases и проверяет наличие обновления
 */
export async function checkForUpdates(currentVersion = APP_CURRENT_VERSION): Promise<UpdateInfo | null> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    const res = await fetch(GITHUB_LATEST_RELEASE_API, {
      signal: controller.signal,
      headers: {
        Accept: "application/vnd.github.v3+json",
      },
    });
    clearTimeout(timeoutId);

    if (!res.ok) {
      console.warn(`[Updater] GitHub release check returned HTTP ${res.status}`);
      return null;
    }

    const data: GitHubRelease = await res.json();

    // Игнорируем черновики и пре-релизы
    if (data.draft || data.prerelease) {
      return null;
    }

    const latestVersion = normalizeVersion(data.tag_name || data.name || "");
    if (!latestVersion) {
      return null;
    }

    const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;
    const installer = pickWindowsInstaller(data.assets);

    return {
      hasUpdate,
      currentVersion,
      latestVersion,
      releaseName: data.name || `Vessel ${latestVersion}`,
      releaseNotes: data.body || "",
      releaseUrl: data.html_url || `https://github.com/${GITHUB_REPO}/releases/tag/${data.tag_name}`,
      publishedAt: data.published_at || "",
      downloadUrl: installer?.browser_download_url || data.html_url,
      installerName: installer?.name,
      installerSize: installer?.size,
    };
  } catch (err) {
    console.warn("[Updater] Failed to check for updates:", err);
    return null;
  }
}

/**
 * Открывает URL во внешнем системном браузере
 */
export async function openExternal(url: string): Promise<void> {
  if (!url) return;
  try {
    await openUrl(url);
  } catch (e) {
    console.warn("[Updater] openUrl command failed, falling back to window.open", e);
    try {
      window.open(url, "_blank");
    } catch {}
  }
}
