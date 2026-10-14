import { useEffect, useState } from "react";
import { useApp } from "../../../store";
import { PlatformIcon } from "../../../components/PlatformIcon";
import { clearExploreCache } from "../../home_sections/ExploreSection";
import { clearPersonalMixesCache } from "../../home_sections/PersonalMixesSection";
import { UNIFIED_PLATFORMS } from "../types";
import * as api from "../../../api/commands";

interface GeneralSectionProps {
  onResetApp: (target: "settings" | "data") => void;
}

export function GeneralSection({ onResetApp }: GeneralSectionProps) {
  const { lang, refresh, showToast } = useApp();

  const [autostart, setAutostart] = useState(() => localStorage.getItem("vessel_autostart") === "true");
  const [minimizeToTray, setMinimizeToTray] = useState(() => localStorage.getItem("vessel_tray") !== "false");
  const [restoreQueue, setRestoreQueue] = useState(() => localStorage.getItem("vessel_restore_queue") !== "false");

  const [selectedRecProviders, setSelectedRecProviders] = useState<string[]>(() => UNIFIED_PLATFORMS.map((p) => p.key));
  const [allSelectedRec, setAllSelectedRec] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const provVal = await api.getRecommendationProviders().catch(() => "all");
        if (cancelled) return;
        if (provVal === "all" || !provVal) {
          setAllSelectedRec(true);
          setSelectedRecProviders(UNIFIED_PLATFORMS.map((p) => p.key));
        } else {
          const list = provVal.split(",").filter((k) => UNIFIED_PLATFORMS.some((p) => p.key === k));
          setAllSelectedRec(list.length === UNIFIED_PLATFORMS.length);
          setSelectedRecProviders(list);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  const handleToggleAllRec = async () => {
    const nextAll = !allSelectedRec;
    setAllSelectedRec(nextAll);
    const nextList = nextAll ? UNIFIED_PLATFORMS.map((p) => p.key) : [UNIFIED_PLATFORMS[0].key];
    setSelectedRecProviders(nextList);
    try {
      const val = nextAll ? "all" : nextList.join(",");
      await api.setRecommendationProviders(val);
      clearExploreCache();
      clearPersonalMixesCache();
      window.dispatchEvent(new CustomEvent("vessel:providers-changed", { detail: val }));
      showToast(lang === "ru" ? "Платформы рекомендаций обновлены" : "Recommendation platforms updated");
    } catch (e) {
      showToast(String(e), true);
    }
  };

  const handleToggleRecPlatform = async (key: string) => {
    const allKeys = UNIFIED_PLATFORMS.map((p) => p.key);
    const current = allSelectedRec ? allKeys : [...selectedRecProviders];
    let next: string[];

    if (!current.includes(key)) {
      next = [...current, key];
    } else {
      if (current.length > 1) {
        next = current.filter((k) => k !== key);
      } else {
        showToast(
          lang === "ru"
            ? "Должна быть выбрана хотя бы одна платформа"
            : "At least one platform must be selected",
          true,
        );
        return;
      }
    }

    const isAll = next.length === allKeys.length;
    setAllSelectedRec(isAll);
    setSelectedRecProviders(next);
    try {
      const val = isAll ? "all" : next.join(",");
      await api.setRecommendationProviders(val);
      clearExploreCache();
      clearPersonalMixesCache();
      window.dispatchEvent(new CustomEvent("vessel:providers-changed", { detail: val }));
      showToast(lang === "ru" ? "Платформы рекомендаций обновлены" : "Recommendation platforms updated");
    } catch (e) {
      showToast(String(e), true);
    }
  };

  const handleSetLanguage = async (newLang: string) => {
    try {
      await api.setLanguage(newLang);
      await refresh();
      showToast(newLang === "ru" ? "Язык переключен на русский" : "Language switched to English");
    } catch (e) {
      showToast(String(e), true);
    }
  };

  const toggleAutostart = (val: boolean) => {
    setAutostart(val);
    localStorage.setItem("vessel_autostart", String(val));
    showToast(val ? "Автозапуск включен" : "Автозапуск выключен");
  };

  const toggleMinimizeToTray = (val: boolean) => {
    setMinimizeToTray(val);
    localStorage.setItem("vessel_tray", String(val));
  };

  const toggleRestoreQueue = (val: boolean) => {
    setRestoreQueue(val);
    localStorage.setItem("vessel_restore_queue", String(val));
  };

  return (
    <div>
      <div className="sett-page-header">
        <h1 className="sett-page-title">
          {lang === "ru" ? "Основные настройки" : "General Settings"}
        </h1>
        <p className="sett-page-sub">
          {lang === "ru"
            ? "Поведение приложения, язык и системные параметры"
            : "App behavior, language and system parameters"}
        </p>
      </div>

      <div className="sett-section-title">
        {lang === "ru" ? "ЯЗЫК ИНТЕРФЕЙСА" : "INTERFACE LANGUAGE"}
      </div>
      <div className="sett-card">
        <div className="sett-card-info">
          <div className="sett-card-title">
            {lang === "ru" ? "Язык приложения" : "Application Language"}
          </div>
          <div className="sett-card-desc">
            {lang === "ru" ? "Выберите основной язык интерфейса" : "Choose primary interface language"}
          </div>
        </div>
        <div className="sett-segmented-group">
          <button
            type="button"
            className={`sett-segmented-btn ${lang === "ru" ? "active" : ""}`}
            onClick={() => void handleSetLanguage("ru")}
          >
            <span className="sett-segmented-btn-label" style={{ fontWeight: 600 }}>RU · Русский</span>
          </button>
          <button
            type="button"
            className={`sett-segmented-btn ${lang === "en" ? "active" : ""}`}
            onClick={() => void handleSetLanguage("en")}
          >
            <span className="sett-segmented-btn-label" style={{ fontWeight: 600 }}>EN · English</span>
          </button>
        </div>
      </div>

      <div className="sett-section-title">
        {lang === "ru" ? "ПЛАТФОРМА" : "PLATFORM"}
      </div>
      <div className="sett-card">
        <div className="sett-card-row" style={{ alignItems: "center" }}>
          <div className="sett-card-info">
            <div className="sett-card-title">
              {lang === "ru" ? "Платформа" : "Platform"}
            </div>
            <div className="sett-card-desc">
              {lang === "ru"
                ? "Используется на главной странице для персональных миксов и рекомендаций"
                : "Used on the main page for personal mixes and recommendations"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
            <button
              type="button"
              onClick={handleToggleAllRec}
              title="Все платформы"
              style={{
                background: "transparent",
                border: "none",
                color: allSelectedRec ? "#ffffff" : "rgba(255, 255, 255, 0.35)",
                fontWeight: 800,
                fontSize: 14,
                padding: "0 8px",
                cursor: "pointer",
                transition: "color 0.15s ease",
              }}
            >
              A
            </button>
            {UNIFIED_PLATFORMS.map((p) => {
              const isSel = allSelectedRec || selectedRecProviders.includes(p.key);
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => handleToggleRecPlatform(p.key)}
                  title={p.label}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    background: isSel ? "rgba(255, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.04)",
                    border: "none",
                    boxShadow: "none",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  <PlatformIcon
                    kind={p.key as any}
                    size={18}
                    color={isSel ? p.color : "rgba(255, 255, 255, 0.25)"}
                    style={{ filter: isSel ? "none" : "grayscale(100%)", opacity: isSel ? 1 : 0.35 }}
                  />
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="sett-section-title">
        {lang === "ru" ? "ПОВЕДЕНИЕ ПРИЛОЖЕНИЯ" : "APPLICATION BEHAVIOR"}
      </div>
      <div className="sett-card">
        <div className="sett-card-row">
          <div className="sett-card-info">
            <div className="sett-card-title">
              {lang === "ru" ? "Автозапуск приложения" : "Autostart Application"}
            </div>
            <div className="sett-card-desc">
              {lang === "ru"
                ? "Автоматически запускать Vessel при входе в систему Windows"
                : "Automatically launch Vessel on Windows startup"}
            </div>
          </div>
          <label className="sett-switch">
            <input
              type="checkbox"
              checked={autostart}
              onChange={(e) => toggleAutostart(e.target.checked)}
            />
            <span className="sett-slider" />
          </label>
        </div>
      </div>

      <div className="sett-card">
        <div className="sett-card-row">
          <div className="sett-card-info">
            <div className="sett-card-title">
              {lang === "ru" ? "Сворачивать в трей" : "Minimize to System Tray"}
            </div>
            <div className="sett-card-desc">
              {lang === "ru"
                ? "При закрытии окна сворачивать приложение в системный трей вместо завершения работы"
                : "Minimize to tray instead of quitting when closing window"}
            </div>
          </div>
          <label className="sett-switch">
            <input
              type="checkbox"
              checked={minimizeToTray}
              onChange={(e) => toggleMinimizeToTray(e.target.checked)}
            />
            <span className="sett-slider" />
          </label>
        </div>
      </div>

      <div className="sett-card">
        <div className="sett-card-row">
          <div className="sett-card-info">
            <div className="sett-card-title">
              {lang === "ru" ? "Восстановление очереди при запуске" : "Restore Queue on Startup"}
            </div>
            <div className="sett-card-desc">
              {lang === "ru"
                ? "Запоминать список воспроизводимых треков и восстанавливать очередь при следующем запуске"
                : "Remember current playback queue and restore it on next startup"}
            </div>
          </div>
          <label className="sett-switch">
            <input
              type="checkbox"
              checked={restoreQueue}
              onChange={(e) => toggleRestoreQueue(e.target.checked)}
            />
            <span className="sett-slider" />
          </label>
        </div>
      </div>

      <div className="sett-section-title">
        {lang === "ru" ? "ОПАСНАЯ ЗОНА" : "DANGER ZONE"}
      </div>
      <div className="sett-card" style={{ borderColor: "rgba(239, 68, 68, 0.3)" }}>
        <div className="sett-card-row">
          <div>
            <div className="sett-card-title" style={{ color: "#ef4444" }}>
              {lang === "ru" ? "Сброс приложения" : "Reset Application"}
            </div>
            <div className="sett-card-desc">
              {lang === "ru"
                ? "Сбросить пользовательские настройки или очистить все базы данных"
                : "Reset user settings or purge all application databases"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button
              type="button"
              className="sett-token-action-btn"
              onClick={() => onResetApp("settings")}
            >
              {lang === "ru" ? "Сброс настроек" : "Reset Settings"}
            </button>
            <button
              type="button"
              className="sett-token-action-btn"
              style={{ color: "#ef4444" }}
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
