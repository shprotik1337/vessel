import { useMemo } from "react";
import { useApp } from "../../../store";
import { PlatformIcon } from "../../../components/PlatformIcon";
import {
  IconSearch,
  IconPlay,
  IconInterface,
  IconPlayer,
  IconTabs,
  IconDiscord,
  IconStorage,
  IconUser,
} from "../../../components/Icons";
import {
  SETTINGS_NAV_ITEMS,
  type SettingsGroup,
  type SettingsTab,
} from "../types";

interface SettingsNavProps {
  activeTab: SettingsTab;
  setActiveTab: (t: SettingsTab) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  profilePreview?: {
    displayName: string;
    username: string;
    avatarUrl: string;
  } | null;
  onClose?: () => void;
}

const GROUP_META: Array<{ id: SettingsGroup; labelRu: string; labelEn: string }> = [
  { id: "player", labelRu: "Плеер", labelEn: "Player" },
  { id: "interface", labelRu: "Интерфейс", labelEn: "Interface" },
  { id: "integrations", labelRu: "Интеграции", labelEn: "Integrations" },
  { id: "app", labelRu: "Приложение", labelEn: "Application" },
];

const PLATFORM_BRAND_COLOR: Record<string, string> = {
  service_youtube_music: "#FF0000",
  service_soundcloud: "#FF5500",
  service_deezer: "#A238FF",
  service_yandex: "#FFCC00",
  service_spotify: "#1DB954",
};

function renderItemIcon(id: SettingsTab) {
  switch (id) {
    case "playback":
      return <IconPlay size={16} />;
    case "appearance":
      return <IconInterface size={16} />;
    case "player":
      return <IconPlayer size={16} />;
    case "tabs":
      return <IconTabs size={16} />;
    case "service_youtube_music":
      return <PlatformIcon kind="youtube_music" size={16} color={PLATFORM_BRAND_COLOR[id]} />;
    case "service_soundcloud":
      return <PlatformIcon kind="soundcloud" size={16} color={PLATFORM_BRAND_COLOR[id]} />;
    case "service_deezer":
      return <PlatformIcon kind="deezer" size={16} color={PLATFORM_BRAND_COLOR[id]} />;
    case "service_yandex":
      return <PlatformIcon kind="yandex" size={16} />;
    case "service_spotify":
      return <PlatformIcon kind="spotify" size={16} color={PLATFORM_BRAND_COLOR[id]} />;
    case "discord":
      return <IconDiscord size={16} color="#5865F2" />;
    case "storage":
      return <IconStorage size={16} />;
    case "about":
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      );
    default:
      return <IconUser size={16} />;
  }
}

export function SettingsNav({
  activeTab,
  setActiveTab,
  searchQuery,
  setSearchQuery,
  profilePreview,
  onClose,
}: SettingsNavProps) {
  const { state, lang, logoutAccount, showToast } = useApp();

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const groupedItems = useMemo(() => {
    return GROUP_META.map((group) => {
      const groupMatch =
        !normalizedQuery ||
        group.labelRu.toLowerCase().includes(normalizedQuery) ||
        group.labelEn.toLowerCase().includes(normalizedQuery);

      const items = SETTINGS_NAV_ITEMS.filter((item) => {
        if (item.group !== group.id) return false;
        if (groupMatch) return true;
        return (
          item.labelRu.toLowerCase().includes(normalizedQuery) ||
          item.labelEn.toLowerCase().includes(normalizedQuery) ||
          item.keywords.some((kw) => kw.includes(normalizedQuery))
        );
      });

      return { ...group, items };
    }).filter((g) => g.items.length > 0);
  }, [normalizedQuery]);

  const accState = state?.account_state;
  const isAuthenticated = accState?.kind === "authenticated";
  const isRestoring = accState?.kind === "restoring";
  const username = accState?.kind === "authenticated" ? accState.username : "";
  const displayName = profilePreview?.displayName || username || (lang === "ru" ? "Гость" : "Guest");
  const avatarUrl = profilePreview?.avatarUrl || "";
  const handleTag = isAuthenticated
    ? `@${username.replace(/^@+/, "")}`
    : isRestoring
    ? (lang === "ru" ? "Вход..." : "Restoring...")
    : (lang === "ru" ? "Войти в аккаунт" : "Sign in");

  return (
    <aside className="sett-sidebar">
      {/* Search bar */}
      <div className="sett-sidebar-search-wrap">
        <div className="sett-sidebar-search">
          <span className="sett-sidebar-search-icon">
            <IconSearch size={14} />
          </span>
          <input
            type="text"
            className="sett-sidebar-search-input"
            placeholder={lang === "ru" ? "Поиск настроек..." : "Search settings..."}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label={lang === "ru" ? "Поиск настроек" : "Search settings"}
          />
          {searchQuery && (
            <button
              type="button"
              className="sett-sidebar-search-clear"
              onClick={() => setSearchQuery("")}
              title={lang === "ru" ? "Очистить" : "Clear"}
              aria-label={lang === "ru" ? "Очистить поиск" : "Clear search"}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Category tree */}
      <nav className="sett-sidebar-nav" aria-label={lang === "ru" ? "Разделы настроек" : "Settings sections"}>
        {groupedItems.length === 0 ? (
          <div className="sett-sidebar-empty">
            {lang === "ru" ? "Ничего не найдено" : "No settings found"}
          </div>
        ) : (
          groupedItems.map((group) => (
            <div key={group.id} className="sett-sidebar-group">
              <div className="sett-sidebar-group-title">
                {lang === "ru" ? group.labelRu : group.labelEn}
              </div>
              <div className="sett-sidebar-group-list">
                {group.items.map((item) => {
                  const isActive = activeTab === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`sett-sidebar-item ${isActive ? "active" : ""}`}
                      onClick={() => setActiveTab(item.id)}
                    >
                      <span className="sett-sidebar-item-icon">
                        {renderItemIcon(item.id)}
                      </span>
                      <span className="sett-sidebar-item-label">
                        {lang === "ru" ? item.labelRu : item.labelEn}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))
        )}
      </nav>

      {/* Bottom Profile Dock */}
      <div className="sett-sidebar-footer">
        <div
          role="button"
          tabIndex={0}
          className={`sett-profile-dock ${activeTab === "account" ? "active" : ""}`}
          onClick={() => setActiveTab("account")}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setActiveTab("account");
            }
          }}
          title={lang === "ru" ? "Настройка профиля" : "Profile settings"}
        >
          <div className="sett-profile-avatar-wrap">
            <div className="sett-profile-avatar">
              {avatarUrl ? (
                <img src={avatarUrl} alt={displayName} />
              ) : (
                <span>{displayName.slice(0, 1).toUpperCase()}</span>
              )}
            </div>
            {isAuthenticated && <span className="sett-profile-status-dot" />}
          </div>

          <div className="sett-profile-meta">
            <div className="sett-profile-name">{displayName}</div>
            <div className="sett-profile-tag">{handleTag}</div>
          </div>

          {isAuthenticated && (
            <button
              type="button"
              className="sett-profile-logout"
              onClick={async (e) => {
                e.stopPropagation();
                await logoutAccount();
                onClose?.();
                showToast(lang === "ru" ? "Вы вышли из аккаунта Vessel" : "Logged out from Vessel");
              }}
              title={lang === "ru" ? "Выйти из аккаунта" : "Log out"}
              aria-label={lang === "ru" ? "Выйти из аккаунта" : "Log out"}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                <polyline points="16 17 21 12 16 7" />
                <line x1="21" y1="12" x2="9" y2="12" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </aside>
  );
}
