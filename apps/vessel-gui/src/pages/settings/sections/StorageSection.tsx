import { useState, useEffect } from "react";
import { useApp } from "../../../store";
import { IconAudio, IconBackground, IconFileText } from "../../../components/Icons";
import * as api from "../../../api/commands";
import type { StorageStats } from "../../../api/types";

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

export function StorageSection() {
  const { lang, showToast } = useApp();

  const [stats, setStats] = useState<StorageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [clearing, setClearing] = useState(false);

  const fetchStats = async () => {
    try {
      const data = await api.getStorageStats();
      setStats(data);
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
    } catch (e) {
      showToast(
        lang === "ru" ? "Ошибка очистки кэша" : "Failed to clear cache",
        true,
      );
    } finally {
      setClearing(false);
    }
  };

  const totalBytes = stats?.total_bytes ?? 0;
  const tracksBytes = stats?.tracks_bytes ?? 0;
  const tracksCount = stats?.tracks_count ?? 0;
  const coversBytes = stats?.covers_bytes ?? 0;
  const lyricsBytes = stats?.lyrics_bytes ?? 0;

  // Рассчитываем дугу индикатора: максимум берем 4 GB для красивого визуала, но не менее totalBytes
  const maxScaleBytes = Math.max(totalBytes, 4 * 1024 * 1024 * 1024);
  const progressRatio = totalBytes > 0 ? Math.min(totalBytes / maxScaleBytes, 1) : 0;
  const circumference = 314; // 2 * pi * 50
  const dashoffset = circumference - (circumference * Math.max(progressRatio, totalBytes > 0 ? 0.08 : 0));

  return (
    <div>
      <div className="sett-page-header">
        <h1 className="sett-page-title">
          {lang === "ru" ? "Хранилище" : "Storage"}
        </h1>
        <p className="sett-page-sub">
          {lang === "ru"
            ? "Контроль занимаемого дискового пространства и очистка временных данных"
            : "Disk space usage control and temporary data purging"}
        </p>
      </div>

      <div className="sett-card">
        <div className="sett-storage-gauge-wrap">
          <div className="sett-circular-gauge">
            <svg width="120" height="120" viewBox="0 0 120 120">
              <circle
                cx="60"
                cy="60"
                r="50"
                fill="none"
                stroke="rgba(255,255,255,0.06)"
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
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, color: "var(--text)" }}>
                  <IconAudio size={16} />
                  <span>{lang === "ru" ? "Музыкальные треки" : "Music Tracks"}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
                  {loading ? "..." : `${tracksCount} ${lang === "ru" ? "аудиодорожек" : "audio tracks"}`}
                </div>
              </div>
              <div style={{ fontWeight: 700, color: "var(--text)" }}>
                {loading ? "..." : formatBytes(tracksBytes)}
              </div>
            </div>

            <div className="sett-storage-item">
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, color: "var(--text)" }}>
                  <IconBackground size={16} />
                  <span>{lang === "ru" ? "Обложки альбомов" : "Album Covers"}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
                  {lang === "ru" ? "Изображения и миниатюры" : "Images and thumbnails"}
                </div>
              </div>
              <div style={{ fontWeight: 700, color: "var(--text)" }}>
                {loading ? "..." : formatBytes(coversBytes)}
              </div>
            </div>

            <div className="sett-storage-item">
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600, color: "var(--text)" }}>
                  <IconFileText size={16} />
                  <span>{lang === "ru" ? "Тексты песен и метаданные" : "Lyrics & Metadata"}</span>
                </div>
                <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 2 }}>
                  {lang === "ru" ? "Кэш синхронизированных текстов" : "Synced lyrics cache"}
                </div>
              </div>
              <div style={{ fontWeight: 700, color: "var(--text)" }}>
                {loading ? "..." : formatBytes(lyricsBytes)}
              </div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            className="sett-token-action-btn submit"
            onClick={handleClearCache}
            disabled={clearing || totalBytes === 0}
            style={{ opacity: clearing ? 0.6 : 1 }}
          >
            {clearing
              ? (lang === "ru" ? "Очистка…" : "Clearing…")
              : (lang === "ru" ? "Очистить всё хранилище" : "Clear All Cache")}
          </button>
        </div>
      </div>
    </div>
  );
}

