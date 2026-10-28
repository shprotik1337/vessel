import type { SettingsCategory, SettingsTab } from "../types";
import {
  IconUser,
  IconGeneral,
  IconAudio,
  IconPlayer,
  IconInterface,
  IconBackground,
  IconCustomization,
  IconProxy,
  IconDiscord,
  IconVpn,
  IconStorage,
  IconTabs,
  IconSparkles,
} from "../../../components/Icons";
import { PlatformIcon } from "../../../components/PlatformIcon";

interface SettingsNavProps {
  category: SettingsCategory;
  setCategory: (c: SettingsCategory) => void;
  activeTab: SettingsTab;
  setActiveTab: (t: SettingsTab) => void;
  lang: string;
}

const SERVICE_TABS = [
  { id: "service_spotify" as const, name: "Spotify", kind: "spotify" as const, brandColor: "#1ED760" },
  { id: "service_yandex" as const, name: "Yandex", kind: "yandex" as const, brandColor: "#FFCC00" },
  { id: "service_youtube_music" as const, name: "YouTube", kind: "youtube_music" as const, brandColor: "#FF0000" },
  { id: "service_soundcloud" as const, name: "SoundCloud", kind: "soundcloud" as const, brandColor: "#FF5500" },
  { id: "service_deezer" as const, name: "Deezer", kind: "deezer" as const, brandColor: "#A238FF" },
  { id: "service_lyrics" as const, name: "Тексты", kind: "lyrics" as const, brandColor: "var(--accent)" },
];

export function SettingsNav({
  category,
  setCategory,
  activeTab,
  setActiveTab,
  lang,
}: SettingsNavProps) {
  return (
    <div className="sett-modal-nav-container">
      {/* TIER 1: CATEGORIES */}
      <div className="sett-modal-categories">
        <button
          type="button"
          className={`sett-cat-btn ${category === "profile" ? "active" : ""}`}
          onClick={() => {
            setCategory("profile");
            setActiveTab("users");
          }}
        >
          {lang === "ru" ? "Профиль" : "Profile"}
        </button>
        <button
          type="button"
          className={`sett-cat-btn ${category === "general" ? "active" : ""}`}
          onClick={() => {
            setCategory("general");
            setActiveTab("general");
          }}
        >
          {lang === "ru" ? "Общие" : "General"}
        </button>
        <button
          type="button"
          className={`sett-cat-btn ${category === "interface" ? "active" : ""}`}
          onClick={() => {
            setCategory("interface");
            setActiveTab("interface");
          }}
        >
          {lang === "ru" ? "Интерфейс" : "Interface"}
        </button>
        <button
          type="button"
          className={`sett-cat-btn ${category === "services" ? "active" : ""}`}
          onClick={() => {
            setCategory("services");
            setActiveTab("service_spotify");
          }}
        >
          {lang === "ru" ? "Сервисы" : "Services"}
        </button>
        <button
          type="button"
          className={`sett-cat-btn ${category === "integrations" ? "active" : ""}`}
          onClick={() => {
            setCategory("integrations");
            setActiveTab("proxy");
          }}
        >
          {lang === "ru" ? "Интеграции" : "Integrations"}
        </button>
      </div>

      {/* TIER 2: SUB-TABS (Pill bar) */}
      <div className="sett-modal-subtabs-wrap">
        <div className="sett-modal-subtabs">
          {category === "profile" && (
            <>
              <button
                type="button"
                className={`sett-subtab-pill ${activeTab === "users" ? "active" : ""}`}
                onClick={() => setActiveTab("users")}
              >
                <IconUser size={15} />
                <span>{lang === "ru" ? "Профиль" : "Profile"}</span>
              </button>
              <button
                type="button"
                className={`sett-subtab-pill ${activeTab === "migration" ? "active" : ""}`}
                onClick={() => setActiveTab("migration")}
              >
                <svg
                  width="15"
                  height="15"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M17 3L21 7L17 11" />
                  <path d="M3 7H21" />
                  <path d="M7 21L3 17L7 13" />
                  <path d="M21 17H3" />
                </svg>
                <span>{lang === "ru" ? "Перенос треков" : "Transfer Tracks"}</span>
              </button>
            </>
          )}

          {category === "general" && (
            <>
              <button
                type="button"
                className={`sett-subtab-pill ${activeTab === "general" ? "active" : ""}`}
                onClick={() => setActiveTab("general")}
              >
                <IconGeneral size={15} />
                <span>{lang === "ru" ? "Основные" : "General"}</span>
              </button>
              <button
                type="button"
                className={`sett-subtab-pill ${activeTab === "audio" ? "active" : ""}`}
                onClick={() => setActiveTab("audio")}
              >
                <IconAudio size={15} />
                <span>{lang === "ru" ? "Аудио" : "Audio"}</span>
              </button>
              <button
                type="button"
                className={`sett-subtab-pill ${activeTab === "storage" ? "active" : ""}`}
                onClick={() => setActiveTab("storage")}
              >
                <IconStorage size={15} />
                <span>{lang === "ru" ? "Кеш" : "Cache"}</span>
              </button>
            </>
          )}

          {category === "interface" && (
            <>
              <button
                type="button"
                className={`sett-subtab-pill ${activeTab === "interface" ? "active" : ""}`}
                onClick={() => setActiveTab("interface")}
              >
                <IconInterface size={15} />
                <span>{lang === "ru" ? "Вид" : "Appearance"}</span>
              </button>
              <button
                type="button"
                className={`sett-subtab-pill ${activeTab === "background" ? "active" : ""}`}
                onClick={() => setActiveTab("background")}
              >
                <IconBackground size={15} />
                <span>{lang === "ru" ? "Фон" : "Background"}</span>
              </button>
              <button
                type="button"
                className={`sett-subtab-pill ${activeTab === "player" ? "active" : ""}`}
                onClick={() => setActiveTab("player")}
              >
                <IconPlayer size={15} />
                <span>{lang === "ru" ? "Плеер" : "Player"}</span>
              </button>
              <button
                type="button"
                className={`sett-subtab-pill ${activeTab === "tabs" ? "active" : ""}`}
                onClick={() => setActiveTab("tabs")}
              >
                <IconTabs size={15} />
                <span>{lang === "ru" ? "Вкладки" : "Tabs"}</span>
              </button>
              <button
                type="button"
                className={`sett-subtab-pill ${activeTab === "customization" ? "active" : ""}`}
                onClick={() => setActiveTab("customization")}
              >
                <IconCustomization size={15} />
                <span>{lang === "ru" ? "Кастом" : "Custom"}</span>
              </button>
              <button
                type="button"
                className={`sett-subtab-pill ${activeTab === "workshop" ? "active" : ""}`}
                onClick={() => setActiveTab("workshop")}
              >
                <IconSparkles size={15} />
                <span>{lang === "ru" ? "Мастерская" : "Workshop"}</span>
              </button>
            </>
          )}

          {category === "services" && (
            <>
              {SERVICE_TABS.map((srv) => {
                const isTabActive = activeTab === srv.id;
                return (
                  <button
                    key={srv.id}
                    type="button"
                    className={`sett-subtab-pill ${isTabActive ? "active" : ""}`}
                    onClick={() => setActiveTab(srv.id)}
                  >
                    <PlatformIcon
                      kind={srv.kind}
                      size={15}
                      color={isTabActive ? srv.brandColor : "var(--text3)"}
                      style={{
                        filter: isTabActive ? "none" : "grayscale(100%)",
                        opacity: isTabActive ? 1 : 0.55,
                        transition: "all 0.15s ease",
                      }}
                    />
                    <span>{srv.name}</span>
                  </button>
                );
              })}
            </>
          )}

          {category === "integrations" && (
            <>
              <button
                type="button"
                className={`sett-subtab-pill ${activeTab === "proxy" ? "active" : ""}`}
                onClick={() => setActiveTab("proxy")}
              >
                <IconProxy size={15} />
                <span>{lang === "ru" ? "Прокси" : "Proxy"}</span>
              </button>
              <button
                type="button"
                className={`sett-subtab-pill ${activeTab === "discord" ? "active" : ""}`}
                onClick={() => setActiveTab("discord")}
              >
                <IconDiscord size={15} />
                <span>Discord RPC</span>
              </button>
              <button
                type="button"
                className={`sett-subtab-pill ${activeTab === "vpn" ? "active" : ""}`}
                onClick={() => setActiveTab("vpn")}
              >
                <IconVpn size={15} />
                <span>VPN</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
