import { useState } from "react";
import { useApp } from "../../../store";
import {
  APP_CURRENT_VERSION,
  GITHUB_REPO,
  checkForUpdates,
  openExternal,
  type UpdateInfo,
} from "../../../services/updater";
import type { ConfirmTarget } from "../types";

interface AboutSectionProps {
  onResetApp: (target: ConfirmTarget) => void;
}

export function AboutSection({ onResetApp }: AboutSectionProps) {
  const { lang, showToast } = useApp();
  const [checking, setChecking] = useState(false);
  const [updateResult, setUpdateResult] = useState<UpdateInfo | null>(null);
  const [checkedOnce, setCheckedOnce] = useState(false);

  const handleCheckUpdates = async () => {
    if (checking) return;
    setChecking(true);
    try {
      const info = await checkForUpdates(APP_CURRENT_VERSION);
      if (!info) {
        showToast(
          lang === "ru" ? "Не удалось проверить обновления" : "Failed to check for updates",
          true,
        );
        return;
      }
      setUpdateResult(info);
      setCheckedOnce(true);
      if (!info.hasUpdate) {
        showToast(lang === "ru" ? "У вас установлена последняя версия" : "You have the latest version");
      }
    } finally {
      setChecking(false);
    }
  };

  const handleInstallUpdate = () => {
    if (!updateResult) return;
    void openExternal(updateResult.downloadUrl || updateResult.releaseUrl);
  };

  return (
    <div>
      <div className="sett-page-header">
        <h1 className="sett-page-title">
          {lang === "ru" ? "О приложении" : "About"}
        </h1>
        <p className="sett-page-sub">
          {lang === "ru"
            ? "Прост приложение прост"
            : "Just an app, just simple."}
        </p>
      </div>

      {/* App Info & Updates */}
      <div className="sett-group-card">
        <div className="sett-row">
          <div className="sett-row-info">
            <div className="sett-row-title">Vessel Desktop</div>
            <div className="sett-row-desc">
              {lang === "ru" ? `Версия ${APP_CURRENT_VERSION}` : `Version ${APP_CURRENT_VERSION}`}
            </div>
          </div>

          <button
            type="button"
            className="sett-btn-primary"
            disabled={checking}
            onClick={() => void handleCheckUpdates()}
          >
            {checking
              ? (lang === "ru" ? "Проверка…" : "Checking…")
              : (lang === "ru" ? "Проверить обновления" : "Check for Updates")}
          </button>
        </div>

        {checkedOnce && updateResult && !updateResult.hasUpdate && (
          <div className="sett-row">
            <div className="sett-update-status-pill">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="16" x2="12" y2="12" />
                <line x1="12" y1="8" x2="12.01" y2="8" />
              </svg>
              <span>
                {lang === "ru"
                  ? `У вас установлена последняя версия (v${APP_CURRENT_VERSION})`
                  : `You are running the latest version (v${APP_CURRENT_VERSION})`}
              </span>
            </div>
          </div>
        )}

        {checkedOnce && updateResult && updateResult.hasUpdate && (
          <div className="sett-row">
            <div className="sett-row-info">
              <div className="sett-row-title">
                {lang === "ru"
                  ? `Доступна новая версия ${updateResult.latestVersion}`
                  : `New version ${updateResult.latestVersion} available`}
              </div>
              <div className="sett-row-desc">
                {lang === "ru"
                  ? "Нажмите «Установить», чтобы скачать обновление в браузере."
                  : "Click Install to open the release download in your browser."}
              </div>
            </div>
            <button
              type="button"
              className="sett-btn-primary"
              onClick={handleInstallUpdate}
            >
              {lang === "ru" ? "Установить" : "Install"}
            </button>
          </div>
        )}

        <div className="sett-row">
          <div className="sett-row-info">
            <div className="sett-row-title">GitHub</div>
            <div className="sett-row-desc">{`https://github.com/${GITHUB_REPO}`}</div>
          </div>
          <button
            type="button"
            className="sett-btn-secondary"
            onClick={() => void openExternal(`https://github.com/${GITHUB_REPO}`)}
          >
            {lang === "ru" ? "Открыть" : "Open"}
          </button>
        </div>
      </div>

      {/* Reset / Danger Zone */}
      <div className="sett-section-label">
        {lang === "ru" ? "Сброс данных" : "Reset"}
      </div>
      <div className="sett-group-card">
        <div className="sett-row">
          <div className="sett-row-info">
            <div className="sett-row-title" style={{ color: "#ef4444" }}>
              {lang === "ru" ? "Сброс приложения" : "Reset Application"}
            </div>
            <div className="sett-row-desc">
              {lang === "ru"
                ? "Сбросить настройки интерфейса или полностью очистить локальные данные."
                : "Reset interface settings or purge local application databases."}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button
              type="button"
              className="sett-btn-secondary"
              onClick={() => onResetApp("settings")}
            >
              {lang === "ru" ? "Сброс настроек" : "Reset Settings"}
            </button>
            <button
              type="button"
              className="sett-btn-danger"
              onClick={() => onResetApp("data")}
            >
              {lang === "ru" ? "Очистить данные" : "Purge Data"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
