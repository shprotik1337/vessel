import { useEffect, useRef, useState, type RefObject } from "react";
import { PlatformIcon } from "../../components/PlatformIcon";
import type { Lang } from "../../i18n";
import {
  IconDiscTab,
  IconMusicTab,
  IconPlaylistTab,
  IconSearchTab,
  IconUserTab,
} from "./searchIcons";
import { SEARCH_PLATFORMS, type SearchCategory } from "./searchTypes";

interface SearchBarProps {
  query: string;
  setQuery: (q: string) => void;
  provider: string;
  setProvider: (p: string) => void;
  category: SearchCategory;
  setCategory: (c: SearchCategory) => void;
  lang: Lang;
  hasActiveQuery: boolean;
  isSidebarTop: boolean;
  isSidebarAutoHide: boolean;
  inputRef: RefObject<HTMLInputElement>;
}

export function SearchBar({
  query,
  setQuery,
  provider,
  setProvider,
  category,
  setCategory,
  lang,
  hasActiveQuery,
  isSidebarTop,
  isSidebarAutoHide,
  inputRef,
}: SearchBarProps) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClickOutside);
    return () => window.removeEventListener("mousedown", handleClickOutside);
  }, [dropdownOpen]);

  const currentProviderObj =
    SEARCH_PLATFORMS.find((p) => p.key === provider) || SEARCH_PLATFORMS[0];

  const categoryTabs: { id: SearchCategory; label: string; icon: React.ReactNode }[] = [
    { id: "all", label: "Все", icon: <IconSearchTab /> },
    { id: "tracks", label: "Треки", icon: <IconMusicTab /> },
    { id: "playlists", label: "Плейлисты", icon: <IconPlaylistTab /> },
    { id: "albums", label: "Альбомы", icon: <IconDiscTab /> },
    { id: "artists", label: "Артисты", icon: <IconUserTab /> },
  ];

  return (
    <div
      className={`page-panel-header search-header ${
        hasActiveQuery
          ? isSidebarTop && !isSidebarAutoHide
            ? "search-bar-offset-top"
            : "search-bar-compact-top"
          : "search-header-hero"
      }`}
      style={{ paddingBottom: hasActiveQuery ? 6 : 0 }}
    >
      <div className="search-interactive-group">
        {/* Capsule Search Bar */}
        <div className="search-pill-container">
          <div className="search-pill">
            <svg
              className="search-pill-icon"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>

            <input
              ref={inputRef}
              type="text"
              className="search-pill-input"
              placeholder={lang === "ru" ? "Поиск..." : "Search..."}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />

            {query && (
              <button
                type="button"
                className="search-pill-clear-btn"
                onClick={() => {
                  setQuery("");
                  inputRef.current?.focus();
                }}
                title={lang === "ru" ? "Очистить" : "Clear"}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                >
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            )}

            {/* Provider Flyout Trigger */}
            <div className="search-pill-provider-anchor" ref={dropdownRef}>
              <button
                className="search-pill-provider-btn"
                onClick={() => setDropdownOpen(!dropdownOpen)}
                type="button"
                title={currentProviderObj.label}
              >
                <PlatformIcon kind={currentProviderObj.key} size={22} color={currentProviderObj.color} />
              </button>

              {dropdownOpen && (
                <div className="search-provider-flyout">
                  {SEARCH_PLATFORMS.map((p) => {
                    const selected = p.key === provider;
                    return (
                      <button
                        key={p.key}
                        type="button"
                        className={`search-flyout-item ${selected ? "selected" : ""}`}
                        onClick={() => {
                          setProvider(p.key);
                          setDropdownOpen(false);
                        }}
                        title={p.label}
                      >
                        <PlatformIcon kind={p.key} size={22} color={p.color} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Category Filter Pills (hover zone - appears on hover over search or this zone) */}
        <div className="search-cat-pills-zone">
          <div className="search-cat-pills">
            {categoryTabs.map((tab) => {
              const active = category === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  className={`search-cat-pill ${active ? "active" : ""}`}
                  onClick={() => setCategory(tab.id)}
                >
                  <span className="search-cat-icon">{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
