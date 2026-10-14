import { useState } from "react";
import { useApp } from "../../../store";
import { IconAudio, IconBackground, IconFileText } from "../../../components/Icons";

export function StorageSection() {
  const { lang, showToast } = useApp();

  const [storageTracksCount, setStorageTracksCount] = useState(48);
  const [storageTracksSize, setStorageTracksSize] = useState("320 MB");
  const [storageCoversSize, setStorageCoversSize] = useState("45 MB");
  const [storageLyricsSize, setStorageLyricsSize] = useState("2.4 MB");

  const handleClearCache = () => {
    setStorageTracksSize("0 MB");
    setStorageCoversSize("0 MB");
    setStorageLyricsSize("0 KB");
    setStorageTracksCount(0);
    showToast(lang === "ru" ? "Кэш приложения полностью очищен" : "App cache successfully cleared");
  };

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
                strokeDasharray="314"
                strokeDashoffset="240"
                strokeLinecap="round"
                transform="rotate(-90 60 60)"
              />
            </svg>
            <div className="sett-gauge-inner">
              <span className="sett-gauge-percent">367 MB</span>
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
                  {storageTracksCount} {lang === "ru" ? "аудиодорожек" : "audio tracks"}
                </div>
              </div>
              <div style={{ fontWeight: 700, color: "var(--text)" }}>{storageTracksSize}</div>
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
              <div style={{ fontWeight: 700, color: "var(--text)" }}>{storageCoversSize}</div>
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
              <div style={{ fontWeight: 700, color: "var(--text)" }}>{storageLyricsSize}</div>
            </div>
          </div>
        </div>

        <div style={{ marginTop: 20, display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            className="sett-token-action-btn submit"
            onClick={handleClearCache}
          >
            {lang === "ru" ? "Очистить всё хранилище" : "Clear All Cache"}
          </button>
        </div>
      </div>
    </div>
  );
}
