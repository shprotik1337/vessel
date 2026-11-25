import { useEffect, useMemo, useState } from "react";
import { useApp } from "../store";
import { useCustomization } from "../customization";
import { ConfirmModal, PathModal } from "../components/Modal";
import * as api from "../api/commands";

import {
  SETTINGS_NAV_ITEMS,
  type SettingsTab,
  type ConfirmTarget,
  type DirTarget,
} from "./settings/types";
import { SettingsNav } from "./settings/components/SettingsNav";
import {
  UsersSection,
  PlaybackSection,
  AppearanceSection,
  StorageSection,
  PlayerSection,
  TabsSection,
  ServicesSection,
  DiscordSection,
  AboutSection,
} from "./settings/sections";

export function Settings({ onClose }: { onClose?: () => void } = {}) {
  const { state, lang, refresh, showToast } = useApp();
  const { resetToDefaults } = useCustomization();

  const [isClosing, setIsClosing] = useState(false);
  const [activeTab, setActiveTab] = useState<SettingsTab>("playback");
  const [searchQuery, setSearchQuery] = useState("");
  const [profilePreview, setProfilePreview] = useState<{
    displayName: string;
    username: string;
    avatarUrl: string;
  } | null>(null);

  const [scale, setScale] = useState(() => {
    const saved = localStorage.getItem("vessel_scale") || localStorage.getItem("vessel_scale_windowed");
    return saved ? Number(saved) : 100;
  });
  const [selectedFont, setSelectedFont] = useState(() => localStorage.getItem("vessel_font") || "Inter");

  const [downloadDir, setDownloadDir] = useState("");
  const [cacheDir, setCacheDir] = useState("");

  const [confirm, setConfirm] = useState<ConfirmTarget>(null);
  const [dirModal, setDirModal] = useState<DirTarget>(null);

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

  // Load user profile preview for sidebar dock on modal open
  useEffect(() => {
    if (state?.account_state?.kind !== "authenticated") {
      setProfilePreview(null);
      return;
    }
    let mounted = true;
    void api
      .authGetProfile()
      .then((p) => {
        if (!mounted) return;
        setProfilePreview({
          displayName: p.display_name || p.username,
          username: p.username,
          avatarUrl: p.avatar_url || "",
        });
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [state?.account_state]);

  // When searching, auto-select first matching tab if current tab isn't in filtered results
  const matchingTabIds = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return null;
    return SETTINGS_NAV_ITEMS.filter(
      (item) =>
        item.labelRu.toLowerCase().includes(q) ||
        item.labelEn.toLowerCase().includes(q) ||
        item.keywords.some((kw) => kw.includes(q)),
    ).map((i) => i.id);
  }, [searchQuery]);

  useEffect(() => {
    if (!matchingTabIds || matchingTabIds.length === 0) return;
    if (!matchingTabIds.includes(activeTab)) {
      setActiveTab(matchingTabIds[0]);
    }
  }, [matchingTabIds, activeTab]);

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
      localStorage.setItem("vessel_auto_fallback", "true");
      localStorage.setItem("vessel_auto_cache", "true");
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
      localStorage.setItem("vessel_auto_fallback", "true");
      localStorage.setItem("vessel_auto_cache", "true");
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
        {/* LEFT SIDEBAR NAVIGATION */}
        <SettingsNav
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          profilePreview={profilePreview}
          onClose={onClose}
        />

        {/* RIGHT CONTENT AREA */}
        <div className="sett-main-pane">
          <button
            type="button"
            className="settings-modal-close sett-floating-close"
            onClick={triggerClose}
            aria-label={lang === "ru" ? "Закрыть" : "Close"}
          >
            ✕
          </button>

          <div className="sett-modal-body">
            <div key={activeTab} className="sett-tab-page">
              {activeTab === "playback" && <PlaybackSection />}
              {activeTab === "appearance" && (
                <AppearanceSection
                  scale={scale}
                  onScale={handleScale}
                  selectedFont={selectedFont}
                  onFontSelect={handleFontSelect}
                />
              )}
              {activeTab === "player" && <PlayerSection />}
              {activeTab === "tabs" && <TabsSection />}
              {activeTab.startsWith("service_") && <ServicesSection activeTab={activeTab} />}
              {activeTab === "discord" && <DiscordSection />}
              {activeTab === "storage" && (
                <StorageSection
                  downloadDir={downloadDir}
                  cacheDir={cacheDir}
                  onOpenDirModal={setDirModal}
                />
              )}
              {activeTab === "about" && <AboutSection onResetApp={setConfirm} />}
              {activeTab === "account" && (
                <UsersSection
                  onClose={onClose}
                  onProfileLoadedOrSaved={setProfilePreview}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* MODALS */}
      {confirm && (
        <ConfirmModal
          lang={lang}
          title={lang === "ru" ? "Подтверждение" : "Confirmation"}
          text={
            confirm === "settings"
              ? (lang === "ru" ? "Сбросить настройки к значениям по умолчанию?" : "Reset settings to defaults?")
              : (lang === "ru" ? "Стереть все сохранённые данные приложения?" : "Purge all saved application data?")
          }
          confirmText={lang === "ru" ? "Подтвердить" : "Confirm"}
          onConfirm={handleConfirmAction}
          onClose={() => setConfirm(null)}
        />
      )}

      {dirModal && (
        <PathModal
          lang={lang}
          title={
            dirModal === "download"
              ? (lang === "ru" ? "Папка загрузок" : "Downloads Directory")
              : (lang === "ru" ? "Папка кэша" : "Cache Directory")
          }
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
    </div>
  );
}
