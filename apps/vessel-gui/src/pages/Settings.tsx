import { useEffect, useState } from "react";
import { useApp } from "../store";
import { useCustomization } from "../customization";
import { ConfirmModal, PathModal } from "../components/Modal";
import { VpnTab } from "../components/VpnTab";
import * as api from "../api/commands";

import type {
  SettingsCategory,
  SettingsTab,
  ConfirmTarget,
  DirTarget,
} from "./settings/types";
import { SettingsNav } from "./settings/components/SettingsNav";
import { ImagePickerModal } from "./settings/components/ImagePickerModal";
import {
  UsersSection,
  MigrationSection,
  GeneralSection,
  AudioSection,
  StorageSection,
  PlayerSection,
  InterfaceSection,
  TabsSection,
  BackgroundSection,
  ServicesSection,
  CustomizationSection,
  WorkshopSection,
  ProxySection,
  DiscordSection,
} from "./settings/sections";

export function Settings({ onClose }: { onClose?: () => void } = {}) {
  const { lang, refresh, showToast } = useApp();
  const {
    resetToDefaults,
    imageLibrary,
    addToImageLibrary,
    setCustomTrackArt,
    setWallpaperData,
  } = useCustomization();

  const [isClosing, setIsClosing] = useState(false);
  const [category, setCategory] = useState<SettingsCategory>("general");
  const [activeTab, setActiveTab] = useState<SettingsTab>("general");

  const [scale, setScale] = useState(() => {
    const saved = localStorage.getItem("vessel_scale") || localStorage.getItem("vessel_scale_windowed");
    return saved ? Number(saved) : 100;
  });
  const [selectedFont, setSelectedFont] = useState(() => localStorage.getItem("vessel_font") || "Inter");

  const [downloadDir, setDownloadDir] = useState("");
  const [cacheDir, setCacheDir] = useState("");

  const [confirm, setConfirm] = useState<ConfirmTarget>(null);
  const [dirModal, setDirModal] = useState<DirTarget>(null);
  const [pickerTarget, setPickerTarget] = useState<"trackArt" | "wallpaper" | null>(null);

  const triggerClose = () => {
    if (isClosing) return;
    setIsClosing(true);
    setTimeout(() => {
      onClose?.();
    }, 180);
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        triggerClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    void (async () => {
      try {
        const [dDir, cDir] = await Promise.all([
          api.getDownloadDir().catch(() => ""),
          api.getCacheDir().catch(() => ""),
        ]);
        setDownloadDir(dDir);
        setCacheDir(cDir);
      } catch (e) {
        console.error("Failed to load directories:", e);
      }
    })();
  }, []);

  const handleScale = (val: number) => {
    setScale(val);
    localStorage.setItem("vessel_scale", String(val));
    localStorage.removeItem("vessel_scale_fullscreen");
    localStorage.removeItem("vessel_scale_windowed");
    void api.windowSetZoom(val / 100).catch(() => {});
    (document.documentElement.style as any).zoom = "";
    document.documentElement.style.fontSize = "";
  };

  const handleFontSelect = (font: string) => {
    setSelectedFont(font);
    localStorage.setItem("vessel_font", font);
    document.body.style.fontFamily = font === "Default" ? "Inter, -apple-system, sans-serif" : `${font}, sans-serif`;
  };

  const changeDownloadDir = async (value: string) => {
    const next = value.trim();
    try {
      await api.setDownloadDir(next || null);
      setDownloadDir(next);
      setDirModal(null);
      showToast(next ? `Папка загрузок: ${next}` : "Сброшено по умолчанию");
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const changeCacheDir = async (value: string) => {
    const next = value.trim();
    try {
      await api.setCacheDir(next || null);
      setCacheDir(next);
      setDirModal(null);
      showToast(next ? `Папка кэша: ${next}` : "Сброшено по умолчанию");
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const handleConfirmAction = async () => {
    if (confirm === "settings") {
      await api.resetSettings();
      resetToDefaults();
      localStorage.removeItem("vessel_scale");
      localStorage.removeItem("vessel_scale_fullscreen");
      localStorage.removeItem("vessel_scale_windowed");
      setScale(100);
      void api.windowSetZoom(1.0).catch(() => {});
      (document.documentElement.style as any).zoom = "";
      document.documentElement.style.fontSize = "";
      document.documentElement.style.setProperty("--ui-scale", "1");
      localStorage.removeItem("vessel_font");
      setSelectedFont("Inter");
      document.documentElement.style.setProperty("--custom-font", "Inter");
      showToast(lang === "ru" ? "Настройки и интерфейс сброшены к значениям по умолчанию" : "Settings reset to defaults");
    } else {
      await api.resetData();
      resetToDefaults();
      localStorage.removeItem("vessel_scale");
      localStorage.removeItem("vessel_scale_fullscreen");
      localStorage.removeItem("vessel_scale_windowed");
      setScale(100);
      void api.windowSetZoom(1.0).catch(() => {});
      (document.documentElement.style as any).zoom = "";
      document.documentElement.style.fontSize = "";
      document.documentElement.style.setProperty("--ui-scale", "1");
      localStorage.removeItem("vessel_font");
      setSelectedFont("Inter");
      document.documentElement.style.setProperty("--custom-font", "Inter");
      showToast(lang === "ru" ? "Все данные и настройки очищены" : "All data and settings purged");
    }
    await refresh();
    setConfirm(null);
  };

  return (
    <div
      className={`settings-modal-backdrop ${isClosing ? "closing" : ""}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          triggerClose();
        }
      }}
    >
      <div className={`settings-modal-window ${isClosing ? "closing" : ""}`} role="dialog" aria-modal="true">
        {/* MODAL HEADER */}
        <div className="settings-modal-header">
          <div className="settings-modal-title">
            {lang === "ru" ? "Настройки" : "Settings"}
          </div>
          <button
            type="button"
            className="settings-modal-close"
            onClick={triggerClose}
            aria-label="Закрыть"
          >
            ✕
          </button>
        </div>

        {/* 2-TIER TOP NAVIGATION */}
        <SettingsNav
          category={category}
          setCategory={setCategory}
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          lang={lang}
        />

        {/* MAIN SETTINGS CONTENT */}
        <div className="sett-modal-body sett-sett-content">
          <div key={activeTab} className="sett-tab-page">
            {activeTab === "users" && <UsersSection onClose={onClose} />}
            {activeTab === "migration" && <MigrationSection onClose={onClose} />}
            {activeTab === "general" && <GeneralSection onResetApp={setConfirm} />}
            {activeTab === "audio" && (
              <AudioSection
                downloadDir={downloadDir}
                cacheDir={cacheDir}
                onOpenDirModal={setDirModal}
              />
            )}
            {activeTab === "storage" && <StorageSection />}
            {activeTab === "player" && <PlayerSection />}
            {activeTab === "interface" && (
              <InterfaceSection
                scale={scale}
                onScale={handleScale}
                selectedFont={selectedFont}
                onFontSelect={handleFontSelect}
              />
            )}
            {activeTab === "tabs" && <TabsSection />}
            {activeTab === "background" && (
              <BackgroundSection onOpenImagePicker={setPickerTarget} />
            )}
            {activeTab === "customization" && <CustomizationSection />}
            {activeTab === "workshop" && <WorkshopSection />}
            {activeTab.startsWith("service_") && <ServicesSection activeTab={activeTab} />}
            {activeTab === "proxy" && <ProxySection />}
            {activeTab === "discord" && <DiscordSection />}
            {activeTab === "vpn" && <VpnTab />}
          </div>
        </div>
      </div>

      {/* MODALS */}
      {confirm && (
        <ConfirmModal
          lang={lang}
          title={lang === "ru" ? "Подтверждение" : "Confirmation"}
          text={confirm === "settings"
            ? (lang === "ru" ? "Сбросить настройки к значениям по умолчанию?" : "Reset settings to defaults?")
            : (lang === "ru" ? "Стереть все сохраненные данные приложения?" : "Purge all saved application data?")}
          confirmText={lang === "ru" ? "Подтвердить" : "Confirm"}
          onConfirm={handleConfirmAction}
          onClose={() => setConfirm(null)}
        />
      )}

      {dirModal && (
        <PathModal
          lang={lang}
          title={dirModal === "download" ? (lang === "ru" ? "Папка загрузок" : "Downloads Directory") : (lang === "ru" ? "Папка кэша" : "Cache Directory")}
          initial={dirModal === "download" ? downloadDir : cacheDir}
          browseMode="folder"
          confirmText={lang === "ru" ? "Сохранить" : "Save"}
          onSubmit={(val: string) => {
            if (dirModal === "download") void changeDownloadDir(val);
            else void changeCacheDir(val);
          }}
          onClose={() => setDirModal(null)}
        />
      )}

      <ImagePickerModal
        pickerTarget={pickerTarget}
        onClose={() => setPickerTarget(null)}
        imageLibrary={imageLibrary}
        onAddToLibrary={addToImageLibrary}
        lang={lang}
        onSelectTrackArt={(url) => {
          setCustomTrackArt(url);
          showToast(lang === "ru" ? "Обложка трека установлена!" : "Track artwork set!");
        }}
        onSelectWallpaper={(url) => {
          setWallpaperData(url);
          showToast(lang === "ru" ? "Фон приложения установлен!" : "Wallpaper set!");
        }}
      />
    </div>
  );
}
