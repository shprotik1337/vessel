import { useState, useEffect } from "react";
import { useApp } from "../../../store";
import { IconAudio, IconBackground, IconFileText } from "../../../components/Icons";
import * as api from "../../../api/commands";
import type { StorageStats } from "../../../api/types";
import type { DirTarget } from "../types";

interface StorageSectionProps {
  downloadDir: string;
  cacheDir: string;
  onOpenDirModal: (target: DirTarget) => void;
}

function formatBytes(bytes: number): string {
  if (bytes <= 0) return "0 MB";
  const k = 1024;
  if (bytes < k * k) {
    return `${(bytes / k).toFixed(1)} KB`;
  }
  if (bytes < k * k * k) {
    return `${(bytes / (k * k)).toFixed(1)} MB`;
  }
  return `${(bytes / (k * k * k)).toFixed(2)} GB`;
}

export function StorageSection({
  downloadDir,
  cacheDir,
  onOpenDirModal,
}: StorageSectionProps) {
  const { lang, showToast } = useApp();

  const [stats, setStats] = useState<StorageStats | null>(null);
  const [dataDir, setDataDir] = useState("");
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  const fetchStats = async () => {
    try {
      const [data, dDir] = await Promise.all([
        api.getStorageStats(),
        api.getDataDir().catch(() => ""),
      ]);
      setStats(data);
      setDataDir(dDir);
    } catch (e) {
      console.error("Failed to load storage stats:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchStats();
  }, []);

  const handleClearCache = async () => {
    try {
      setClearing(true);
      const updated = await api.clearStorageCache("all");
      setStats(updated);
      showToast(
        lang === "ru"
          ? "Кэш приложения полностью очищен"
          : "App cache successfully cleared",
      );
    } catch {
      showToast(
        lang === "ru" ? "Ошибка очистки кэша" : "Failed to clear cache",
        true,
      );
    } finally {
      setClearing(false);
    }
  };

  const handleOpenFolder = async (path: string) => {
    if (!path) return;
    try {
      await api.openPath(path);
    } catch (e) {
      showToast(String(e), true);
    }
  };

  const totalBytes = stats?.total_bytes ?? 0;
  const tracksBytes = stats?.tracks_bytes ?? 0;
  const tracksCount = stats?.tracks_count ?? 0;
  const coversBytes = stats?.covers_bytes ?? 0;
  const lyricsBytes = stats?.lyrics_bytes ?? 0;

  const maxScaleBytes = Math.max(totalBytes, 4 * 1024 * 1024 * 1024);
  const progressRatio = totalBytes > 0 ? Math.min(totalBytes / maxScaleBytes, 1) : 0;
  const circumference = 314;
  const dashoffset = circumference - circumference * Math.max(progressRatio, totalBytes > 0 ? 0.08 : 0);

  return (
    <div>
      <div className="sett-page-header">
        <h1 className="sett-page-title">
          {lang === "ru" ? "Память и кеш" : "Storage & Cache"}
        </h1>
        <p className="sett-page-sub">
          {lang === "ru"
            ? "Занимаемое пространство, очистка кэша и директории хранения данных."
            : "Disk usage, cache cleanup and application folders."}
        </p>
      </div>

      {/* Storage usage & clear */}
      <div className="sett-group-card">
        <div className="sett-row-col">
          <div className="sett-storage-gauge-wrap">
            <div className="sett-circular-gauge">
              <svg width="116" height="116" viewBox="0 0 120 120">
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  fill="none"
                  stroke="var(--border)"
                  strokeWidth="10"
                />
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="10"
                  strokeDasharray={circumference}
                  strokeDashoffset={loading ? circumference : dashoffset}
                  strokeLinecap="round"
                  transform="rotate(-90 60 60)"
                  style={{ transition: "stroke-dashoffset 0.5s ease" }}
                />
              </svg>
              <div className="sett-gauge-inner">
                <span className="sett-gauge-percent">
                  {loading ? "..." : formatBytes(totalBytes)}
                </span>
                <span className="sett-gauge-sub">{lang === "ru" ? "Занято" : "Used"}</span>
              </div>
            </div>

            <div className="sett-storage-breakdown">
              <div className="sett-storage-item">
                <div>
                  <div className="sett-storage-item-title">
                    <IconAudio size={15} />
                    <span>{lang === "ru" ? "Музыкальные треки" : "Music Tracks"}</span>
                  </div>
                  <div className="sett-storage-item-sub">
                    {loading ? "..." : `${tracksCount} ${lang === "ru" ? "аудиодорожек" : "audio tracks"}`}
                  </div>
                </div>
                <div className="sett-storage-item-size">
                  {loading ? "..." : formatBytes(tracksBytes)}
                </div>
              </div>

              <div className="sett-storage-item">
                <div>
                  <div className="sett-storage-item-title">
                    <IconBackground size={15} />
                    <span>{lang === "ru" ? "Обложки альбомов" : "Album Covers"}</span>
                  </div>
                  <div className="sett-storage-item-sub">
                    {lang === "ru" ? "Изображения и миниатюры" : "Images and thumbnails"}
                  </div>
                </div>
                <div className="sett-storage-item-size">
                  {loading ? "..." : formatBytes(coversBytes)}
                </div>
              </div>

              <div className="sett-storage-item">
                <div>
                  <div className="sett-storage-item-title">
                    <IconFileText size={15} />
                    <span>{lang === "ru" ? "Тексты песен и метаданные" : "Lyrics & Metadata"}</span>
                  </div>
                  <div className="sett-storage-item-sub">
                    {lang === "ru" ? "Кэш синхронизированных текстов" : "Synced lyrics cache"}
                  </div>
                </div>
                <div className="sett-storage-item-size">
                  {loading ? "..." : formatBytes(lyricsBytes)}
                </div>
              </div>
            </div>
          </div>

          <div style={{ marginTop: 18, display: "flex", justifyContent: "flex-end" }}>
            <button
              type="button"
              className="sett-btn-primary"
              onClick={handleClearCache}
              disabled={clearing || totalBytes === 0}
            >
              {clearing
                ? (lang === "ru" ? "Очистка…" : "Clearing…")
                : (lang === "ru" ? "Очистить весь кеш" : "Clear All Cache")}
            </button>
          </div>
        </div>
      </div>

      {/* App folders */}
      <div className="sett-section-label">
        {lang === "ru" ? "Папки приложения" : "Application Folders"}
      </div>
      <div className="sett-group-card">
        <div className="sett-row">
          <div className="sett-row-info">
            <div className="sett-row-title">{lang === "ru" ? "Папка загрузок" : "Downloads Directory"}</div>
            <div className="sett-row-desc" style={{ wordBreak: "break-all" }}>
              {downloadDir || (lang === "ru" ? "По умолчанию (~/Music/Vessel)" : "Default (~/Music/Vessel)")}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {downloadDir && (
              <button
                type="button"
                className="sett-btn-secondary"
                onClick={() => void handleOpenFolder(downloadDir)}
              >
                {lang === "ru" ? "Открыть" : "Open"}
              </button>
            )}
            <button
              type="button"
              className="sett-btn-secondary"
              onClick={() => onOpenDirModal("download")}
            >
              {lang === "ru" ? "Изменить" : "Change"}
            </button>
          </div>
        </div>

        <div className="sett-row">
          <div className="sett-row-info">
            <div className="sett-row-title">{lang === "ru" ? "Папка аудиокэша" : "Audio Cache Directory"}</div>
            <div className="sett-row-desc" style={{ wordBreak: "break-all" }}>
              {cacheDir || (lang === "ru" ? "По умолчанию (AppData/Vessel/cache)" : "Default (AppData/Vessel/cache)")}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {cacheDir && (
              <button
                type="button"
                className="sett-btn-secondary"
                onClick={() => void handleOpenFolder(cacheDir)}
              >
                {lang === "ru" ? "Открыть" : "Open"}
              </button>
            )}
            <button
              type="button"
              className="sett-btn-secondary"
              onClick={() => onOpenDirModal("cache")}
            >
              {lang === "ru" ? "Изменить" : "Change"}
            </button>
          </div>
        </div>

        {dataDir && (
          <div className="sett-row">
            <div className="sett-row-info">
              <div className="sett-row-title">{lang === "ru" ? "Папка данных и БД" : "App Data Directory"}</div>
              <div className="sett-row-desc" style={{ wordBreak: "break-all" }}>
                {dataDir}
              </div>
            </div>
            <button
              type="button"
              className="sett-btn-secondary"
              onClick={() => void handleOpenFolder(dataDir)}
            >
              {lang === "ru" ? "Открыть" : "Open"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
