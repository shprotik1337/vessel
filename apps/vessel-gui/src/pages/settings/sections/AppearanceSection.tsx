import { useEffect, useRef, useState } from "react";
import { useApp } from "../../../store";
import {
  useCustomization,
  LIGHT_THEME_PRESET,
  DARK_THEME_PRESET,
  type ThemeColors,
} from "../../../customization";
import { IconBackground, IconDevice, IconDisc, IconSparkles } from "../../../components/Icons";
import * as api from "../../../api/commands";

interface AppearanceSectionProps {
  scale: number;
  onScale: (val: number) => void;
  selectedFont: string;
  onFontSelect: (font: string) => void;
}

export function AppearanceSection({
  scale,
  onScale,
  selectedFont,
  onFontSelect,
}: AppearanceSectionProps) {
  const { lang, refresh, showToast } = useApp();
  const {
    config,
    setThemeMode,
    applyPreset,
    updateThemeDirectly,
    userPresets,
    saveToUserSlot,
    deleteUserSlot,
    customTrackArt,
    setCustomTrackArt,
    setWallpaperData,
  } = useCustomization();

  const [langMenuOpen, setLangMenuOpen] = useState(false);
  const langDropdownRef = useRef<HTMLDivElement>(null);

  const [customEditorOpen, setCustomEditorOpen] = useState(false);
  const [customThemeName, setCustomThemeName] = useState(lang === "ru" ? "Моя тема" : "My Theme");
  const [customColors, setCustomColors] = useState<ThemeColors>(() => ({
    ...config.theme,
  }));

  useEffect(() => {
    if (!langMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (langDropdownRef.current && !langDropdownRef.current.contains(e.target as Node)) {
        setLangMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handleOutside);
    return () => window.removeEventListener("mousedown", handleOutside);
  }, [langMenuOpen]);

  const handleSetLanguage = async (newLang: string) => {
    setLangMenuOpen(false);
    if (newLang === lang) return;
    try {
      await api.setLanguage(newLang);
      await refresh();
      showToast(newLang === "ru" ? "Язык переключен на русский" : "Language switched to English");
    } catch (e) {
      showToast(String(e), true);
    }
  };

  const currentThemeMode = config.theme?.themeMode || "dark";

  const openCustomEditor = () => {
    setCustomColors({
      ...config.theme,
    });
    setCustomThemeName(lang === "ru" ? "Моя тема" : "My Theme");
    setCustomEditorOpen((prev) => !prev);
  };

  const applyCustomBase = (base: "light" | "dark") => {
    const preset = base === "light" ? LIGHT_THEME_PRESET : DARK_THEME_PRESET;
    setCustomColors((prev) => ({
      ...prev,
      themeMode: "custom",
      accentColor: preset.accentColor,
      appBgColor: preset.appBgColor,
      sidebarBgColor: preset.sidebarBgColor,
      playerBgColor: preset.playerBgColor,
      cardBgColor: preset.cardBgColor,
      textColor: preset.textColor,
    }));
  };

  const randomizeCustomColors = () => {
    const ACCENTS = ["#6366f1", "#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4", "#f43f5e", "#14b8a6", "#e11d48"];
    const DARK_BGS = ["#09090b", "#0b0c10", "#090d16", "#070c0e", "#100914", "#050505", "#0e0e12"];
    const randAccent = ACCENTS[Math.floor(Math.random() * ACCENTS.length)];
    const randBg = DARK_BGS[Math.floor(Math.random() * DARK_BGS.length)];
    setCustomColors((prev) => ({
      ...prev,
      themeMode: "custom",
      accentColor: randAccent,
      appBgColor: randBg,
      sidebarBgColor: randBg,
      playerBgColor: randBg,
      cardBgColor: "#18181b",
      textColor: "#f4f4f5",
    }));
  };

  const handleSaveCustomTheme = () => {
    const emptySlot = userPresets.findIndex((p) => p === null);
    const slotIdx = emptySlot !== -1 ? emptySlot : 0;
    updateThemeDirectly({
      themeMode: "custom",
      accentColor: customColors.accentColor,
      appBgColor: customColors.appBgColor,
      sidebarBgColor: customColors.sidebarBgColor,
      playerBgColor: customColors.playerBgColor,
      cardBgColor: customColors.cardBgColor,
      textColor: customColors.textColor,
    });
    saveToUserSlot(slotIdx, customThemeName.trim() || (lang === "ru" ? "Своя тема" : "Custom Theme"));
    setCustomEditorOpen(false);
    showToast(
      lang === "ru"
        ? `Тема «${customThemeName.trim() || "Своя тема"}» сохранена`
        : `Theme "${customThemeName.trim() || "Custom Theme"}" saved`,
    );
  };

  const handlePickWallpaperFromPc = async () => {
    try {
      const filePath = await api.pickFile(["png", "jpg", "jpeg", "webp", "gif", "bmp"]);
      if (!filePath) return;
      const dataUrl = await api.loadImageAsDataUrl(filePath);
      setWallpaperData(dataUrl);
      showToast(lang === "ru" ? "Фон приложения установлен!" : "Wallpaper set!");
    } catch (err) {
      showToast(String(err), true);
    }
  };

  const handlePickTrackArtFromPc = async () => {
    try {
      const filePath = await api.pickFile(["png", "jpg", "jpeg", "webp", "gif", "bmp"]);
      if (!filePath) return;
      const dataUrl = await api.loadImageAsDataUrl(filePath);
      setCustomTrackArt(dataUrl);
      showToast(lang === "ru" ? "Обложка трека установлена!" : "Track artwork set!");
    } catch (err) {
      showToast(String(err), true);
    }
  };

  const themeCards: Array<{ id: "system" | "light" | "dark"; label: string }> = [
    { id: "system", label: lang === "ru" ? "Системная" : "System" },
    { id: "light", label: lang === "ru" ? "Светлая" : "Light" },
    { id: "dark", label: lang === "ru" ? "Тёмная" : "Dark" },
  ];

  const savedCustomList = userPresets
    .map((preset, idx) => ({ preset, idx }))
    .filter((entry): entry is { preset: NonNullable<typeof entry.preset>; idx: number } => entry.preset !== null);

  return (
    <div>
      <div className="sett-page-header">
        <h1 className="sett-page-title">
          {lang === "ru" ? "Внешний вид" : "Appearance"}
        </h1>
        <p className="sett-page-sub">
          {lang === "ru"
            ? "Выберите внешний вид приложения."
            : "Choose the visual appearance of the application."}
        </p>
      </div>

      {/* Main Language & Theme Group Card */}
      <div className="sett-group-card">
        {/* Language row */}
        <div className="sett-row">
          <div className="sett-row-info">
            <div className="sett-row-title">{lang === "ru" ? "Язык" : "Language"}</div>
            <div className="sett-row-desc">
              {lang === "ru" ? "Выберите язык интерфейса" : "Select interface language"}
            </div>
          </div>

          <div className="sett-dropdown-wrap" ref={langDropdownRef}>
            <button
              type="button"
              className="sett-dropdown-trigger"
              onClick={() => setLangMenuOpen((v) => !v)}
            >
              <span>{lang === "ru" ? "Русский" : "English"}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {langMenuOpen && (
              <div className="sett-dropdown-menu">
                <button
                  type="button"
                  className={`sett-dropdown-option ${lang === "ru" ? "active" : ""}`}
                  onClick={() => void handleSetLanguage("ru")}
                >
                  <span>Русский</span>
                  {lang === "ru" && <span>✓</span>}
                </button>
                <button
                  type="button"
                  className={`sett-dropdown-option ${lang === "en" ? "active" : ""}`}
                  onClick={() => void handleSetLanguage("en")}
                >
                  <span>English</span>
                  {lang === "en" && <span>✓</span>}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Theme cards row */}
        <div className="sett-row-col">
          <div className="sett-row-info" style={{ marginBottom: 14 }}>
            <div className="sett-row-title">{lang === "ru" ? "Тема" : "Theme"}</div>
            <div className="sett-row-desc">
              {lang === "ru" ? "Выберите внешний вид приложения." : "Choose overall app theme."}
            </div>
          </div>

          <div className="sett-theme-grid">
            {themeCards.map((card) => {
              const isSelected = currentThemeMode === card.id;
              return (
                <button
                  key={card.id}
                  type="button"
                  className={`sett-theme-card-btn ${isSelected ? "active" : ""}`}
                  onClick={() => setThemeMode(card.id)}
                >
                  <div className={`sett-theme-preview sett-theme-preview-${card.id}`}>
                    {card.id === "system" ? (
                      <>
                        <div className="sett-preview-half sett-preview-light">
                          <div className="sett-preview-sidebar">
                            <div className="sett-preview-dots">
                              <span className="dot-r" />
                              <span className="dot-y" />
                              <span className="dot-g" />
                            </div>
                            <span className="sett-preview-bar w70" />
                            <span className="sett-preview-bar w50" />
                            <span className="sett-preview-pill" />
                          </div>
                          <div className="sett-preview-main">
                            <span className="sett-preview-bar w80" />
                            <div className="sett-preview-blocks">
                              <span className="sett-preview-block" />
                              <span className="sett-preview-block" />
                              <span className="sett-preview-block" />
                              <span className="sett-preview-block" />
                            </div>
                          </div>
                        </div>
                        <div className="sett-preview-half sett-preview-dark">
                          <div className="sett-preview-sidebar">
                            <div className="sett-preview-dots">
                              <span className="dot-r" />
                              <span className="dot-y" />
                              <span className="dot-g" />
                            </div>
                            <span className="sett-preview-bar w70" />
                            <span className="sett-preview-bar w50" />
                            <span className="sett-preview-pill" />
                          </div>
                          <div className="sett-preview-main">
                            <span className="sett-preview-bar w80" />
                            <div className="sett-preview-blocks">
                              <span className="sett-preview-block" />
                              <span className="sett-preview-block" />
                              <span className="sett-preview-block" />
                              <span className="sett-preview-block" />
                            </div>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className={`sett-preview-full sett-preview-${card.id}`}>
                        <div className="sett-preview-sidebar">
                          <div className="sett-preview-dots">
                            <span className="dot-r" />
                            <span className="dot-y" />
                            <span className="dot-g" />
                          </div>
                          <span className="sett-preview-bar w70" />
                          <span className="sett-preview-bar w50" />
                          <span className="sett-preview-pill" />
                        </div>
                        <div className="sett-preview-main">
                          <span className="sett-preview-bar w60" />
                          <div className="sett-preview-blocks">
                            <span className="sett-preview-block" />
                            <span className="sett-preview-block" />
                            <span className="sett-preview-block" />
                            <span className="sett-preview-block" />
                          </div>
                        </div>
                      </div>
                    )}

                    {isSelected && (
                      <span className="sett-theme-check" aria-hidden="true">
                        ✓
                      </span>
                    )}
                  </div>
                  <span className="sett-theme-label">{card.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Themes Section inside Appearance */}
        <div className="sett-row-col">
          <div className="sett-row-top" style={{ marginBottom: 12 }}>
            <div className="sett-row-info">
              <div className="sett-row-title">
                {lang === "ru" ? "Кастомные темы" : "Custom Themes"}
              </div>
              <div className="sett-row-desc">
                {lang === "ru"
                  ? "Создавайте собственные цветовые палитры на основе светлой или тёмной темы."
                  : "Create your own color palettes based on light or dark themes."}
              </div>
            </div>
            <button
              type="button"
              className="sett-btn-secondary"
              onClick={openCustomEditor}
            >
              {customEditorOpen
                ? (lang === "ru" ? "Закрыть редактор" : "Close Editor")
                : (lang === "ru" ? "+ Создать тему" : "+ Create Theme")}
            </button>
          </div>

          {savedCustomList.length > 0 && (
            <div className="sett-custom-themes-row">
              {savedCustomList.map(({ preset, idx }) => {
                const isActive =
                  currentThemeMode === "custom" &&
                  config.theme?.accentColor === preset.accentColor &&
                  config.theme?.appBgColor === preset.appBgColor;
                return (
                  <div
                    key={preset.id}
                    className={`sett-custom-chip ${isActive ? "active" : ""}`}
                    onClick={() => applyPreset({ ...preset, themeMode: "custom" })}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        applyPreset({ ...preset, themeMode: "custom" });
                      }
                    }}
                  >
                    <span
                      className="sett-custom-chip-swatch"
                      style={{
                        background: `linear-gradient(135deg, ${preset.appBgColor} 50%, ${preset.accentColor} 50%)`,
                      }}
                    />
                    <span className="sett-custom-chip-name">{preset.name}</span>
                    <button
                      type="button"
                      className="sett-custom-chip-del"
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteUserSlot(idx);
                        showToast(lang === "ru" ? "Тема удалена" : "Theme deleted");
                      }}
                      title={lang === "ru" ? "Удалить" : "Delete"}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {customEditorOpen && (
            <div className="sett-custom-editor">
              <div className="sett-custom-editor-head">
                <input
                  type="text"
                  className="sett-input"
                  value={customThemeName}
                  onChange={(e) => setCustomThemeName(e.target.value)}
                  placeholder={lang === "ru" ? "Название темы" : "Theme name"}
                />
                <div className="sett-pill-switch">
                  <button
                    type="button"
                    className="sett-pill-opt"
                    onClick={() => applyCustomBase("light")}
                  >
                    {lang === "ru" ? "Светлая база" : "Light base"}
                  </button>
                  <button
                    type="button"
                    className="sett-pill-opt"
                    onClick={() => applyCustomBase("dark")}
                  >
                    {lang === "ru" ? "Тёмная база" : "Dark base"}
                  </button>
                </div>
                <button
                  type="button"
                  className="sett-icon-btn"
                  onClick={randomizeCustomColors}
                  title={lang === "ru" ? "Случайная палитра" : "Random palette"}
                >
                  <IconSparkles size={15} />
                </button>
              </div>

              <div className="sett-color-grid">
                {[
                  { key: "accentColor" as const, label: lang === "ru" ? "Акцент" : "Accent" },
                  { key: "textColor" as const, label: lang === "ru" ? "Текст" : "Text" },
                  { key: "appBgColor" as const, label: lang === "ru" ? "Фон окна" : "Window BG" },
                  { key: "sidebarBgColor" as const, label: lang === "ru" ? "Панель" : "Sidebar" },
                  { key: "cardBgColor" as const, label: lang === "ru" ? "Карточки" : "Cards" },
                  { key: "playerBgColor" as const, label: lang === "ru" ? "Плеер" : "Player" },
                ].map((item) => {
                  const val = customColors[item.key] || "#ffffff";
                  return (
                    <label key={item.key} className="sett-color-item">
                      <span className="sett-color-dot" style={{ backgroundColor: val }}>
                        <input
                          type="color"
                          value={val}
                          onChange={(e) =>
                            setCustomColors((prev) => ({ ...prev, [item.key]: e.target.value }))
                          }
                        />
                      </span>
                      <span className="sett-color-label">{item.label}</span>
                    </label>
                  );
                })}
              </div>

              <div className="sett-custom-editor-actions">
                <button
                  type="button"
                  className="sett-btn-secondary"
                  onClick={() => setCustomEditorOpen(false)}
                >
                  {lang === "ru" ? "Отмена" : "Cancel"}
                </button>
                <button
                  type="button"
                  className="sett-btn-primary"
                  onClick={handleSaveCustomTheme}
                >
                  {lang === "ru" ? "Сохранить и применить" : "Save & Apply"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Transparency */}
      <div className="sett-section-label">
        {lang === "ru" ? "Прозрачность и стекло" : "Transparency & Glass"}
      </div>
      <div className="sett-group-card">
        <div className="sett-row">
          <div className="sett-row-info">
            <div className="sett-row-title">
              {lang === "ru" ? "Прозрачность интерфейса" : "Interface Transparency"}
            </div>
            <div className="sett-row-desc">
              {lang === "ru"
                ? "Эффекты матового стекла и прозрачности панелей и окон."
                : "Frosted glass and panel transparency effects."}
            </div>
          </div>
          <label className="sett-switch">
            <input
              type="checkbox"
              checked={config.theme?.glassMode ?? true}
              onChange={(e) => updateThemeDirectly({ glassMode: e.target.checked })}
            />
            <span className="sett-slider" />
          </label>
        </div>

        <div className="sett-row">
          <div className="sett-row-info">
            <div className="sett-row-title">{lang === "ru" ? "Непрозрачность окна" : "Window Opacity"}</div>
            <div className="sett-row-desc">
              {lang === "ru" ? "Плотность фона панелей и модальных окон." : "Background density of panels and modals."}
            </div>
          </div>
          <div className="sett-slider-control-wrap">
            <input
              type="range"
              min="10"
              max="100"
              value={config.theme?.windowOpacity ?? 35}
              onChange={(e) => updateThemeDirectly({ windowOpacity: Number(e.target.value) })}
              className="sett-range-input"
            />
            <span className="sett-slider-value">{config.theme?.windowOpacity ?? 35}%</span>
          </div>
        </div>

        <div className="sett-row">
          <div className="sett-row-info">
            <div className="sett-row-title">{lang === "ru" ? "Сила стекла" : "Glass Strength"}</div>
            <div className="sett-row-desc">
              {lang === "ru" ? "Интенсивность акрилового слоя." : "Intensity of the acrylic layer."}
            </div>
          </div>
          <div className="sett-slider-control-wrap">
            <input
              type="range"
              min="0"
              max="100"
              value={config.theme?.glassForce ?? 55}
              onChange={(e) => updateThemeDirectly({ glassForce: Number(e.target.value) })}
              className="sett-range-input"
            />
            <span className="sett-slider-value">{config.theme?.glassForce ?? 55}%</span>
          </div>
        </div>

        <div className="sett-row">
          <div className="sett-row-info">
            <div className="sett-row-title">{lang === "ru" ? "Размытие стекла" : "Backdrop Blur"}</div>
            <div className="sett-row-desc">
              {lang === "ru" ? "Радиус размытия заднего плана." : "Blur radius behind translucent panels."}
            </div>
          </div>
          <div className="sett-slider-control-wrap">
            <input
              type="range"
              min="0"
              max="40"
              value={config.theme?.backdropBlur ?? 10}
              onChange={(e) => updateThemeDirectly({ backdropBlur: Number(e.target.value) })}
              className="sett-range-input"
            />
            <span className="sett-slider-value">{config.theme?.backdropBlur ?? 10}px</span>
          </div>
        </div>
      </div>

      {/* Wallpaper & Custom Track Art */}
      <div className="sett-section-label">
        {lang === "ru" ? "Фон и обложка" : "Wallpaper & Track Art"}
      </div>
      <div className="sett-group-card">
        <div className="sett-row">
          <div className="sett-wallpaper-row-left">
            <div className="sett-wallpaper-thumb">
              {customTrackArt ? (
                <img src={customTrackArt} alt="Track Artwork" />
              ) : (
                <IconDisc size={20} />
              )}
            </div>
            <div className="sett-row-info">
              <div className="sett-row-title">
                {lang === "ru" ? "Кастомная обложка трека" : "Custom Track Artwork"}
              </div>
              <div className="sett-row-desc">
                {lang === "ru"
                  ? "Подменяет обложку текущего трека в плеере."
                  : "Overrides the current track artwork in the player."}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button
              type="button"
              className="sett-btn-primary"
              onClick={() => void handlePickTrackArtFromPc()}
            >
              {lang === "ru" ? "Выбрать файл" : "Choose File"}
            </button>
            {customTrackArt && (
              <button
                type="button"
                className="sett-btn-secondary"
                onClick={() => {
                  setCustomTrackArt(null);
                  showToast(lang === "ru" ? "Обложка сброшена к оригиналу" : "Track artwork reset");
                }}
              >
                {lang === "ru" ? "Сбросить" : "Reset"}
              </button>
            )}
          </div>
        </div>

        <div className="sett-row">
          <div className="sett-wallpaper-row-left">
            <div className="sett-wallpaper-thumb">
              {config.theme?.wallpaperData ? (
                <img src={config.theme.wallpaperData} alt="Wallpaper" />
              ) : (
                <IconBackground size={20} />
              )}
            </div>
            <div className="sett-row-info">
              <div className="sett-row-title">
                {lang === "ru" ? "Фоновое изображение" : "Background Image"}
              </div>
              <div className="sett-row-desc">
                {config.theme?.wallpaperData
                  ? (lang === "ru" ? "Пользовательский фон активен (динамическое свечение приглушено)." : "Custom wallpaper active (dynamic glow dimmed).")
                  : (lang === "ru" ? "Выберите изображение или GIF с компьютера. Без обоев активен динамический фон." : "Choose an image or GIF from your PC. Without wallpaper, dynamic ambient background is active.")}
              </div>
            </div>
          </div>

          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            <button
              type="button"
              className="sett-btn-primary"
              onClick={() => void handlePickWallpaperFromPc()}
            >
              {lang === "ru" ? "Выбрать файл" : "Choose File"}
            </button>
            {config.theme?.wallpaperData && (
              <button
                type="button"
                className="sett-btn-secondary"
                onClick={() => {
                  setWallpaperData(null);
                  showToast(lang === "ru" ? "Фон приложения сброшен" : "Wallpaper reset");
                }}
              >
                {lang === "ru" ? "Сбросить" : "Reset"}
              </button>
            )}
          </div>
        </div>

        {config.theme?.wallpaperData && (
          <>
            <div className="sett-row">
              <div className="sett-row-info">
                <div className="sett-row-title">{lang === "ru" ? "Размытие фона" : "Wallpaper Blur"}</div>
              </div>
              <div className="sett-slider-control-wrap">
                <input
                  type="range"
                  min="0"
                  max="40"
                  value={config.theme?.wallpaperBlur ?? 0}
                  onChange={(e) => updateThemeDirectly({ wallpaperBlur: Number(e.target.value) })}
                  className="sett-range-input"
                />
                <span className="sett-slider-value">{config.theme?.wallpaperBlur ?? 0}px</span>
              </div>
            </div>
            <div className="sett-row">
              <div className="sett-row-info">
                <div className="sett-row-title">{lang === "ru" ? "Затемнение фона" : "Wallpaper Dim"}</div>
              </div>
              <div className="sett-slider-control-wrap">
                <input
                  type="range"
                  min="0"
                  max="90"
                  value={config.theme?.wallpaperDim ?? 0}
                  onChange={(e) => updateThemeDirectly({ wallpaperDim: Number(e.target.value) })}
                  className="sett-range-input"
                />
                <span className="sett-slider-value">{config.theme?.wallpaperDim ?? 0}%</span>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Scaling & Font */}
      <div className="sett-section-label">
        {lang === "ru" ? "Масштаб и шрифт" : "Scaling & Font"}
      </div>
      <div className="sett-group-card">
        <div className="sett-row-col">
          <div className="sett-row-top" style={{ marginBottom: 12 }}>
            <div className="sett-row-info">
              <div className="sett-row-title">{lang === "ru" ? "Масштаб интерфейса" : "UI Scaling"}</div>
              <div className="sett-row-desc">
                {lang === "ru" ? "Размер элементов интерфейса и текста." : "Size of interface elements and typography."}
              </div>
            </div>
            <span className="sett-slider-value">{scale}%</span>
          </div>

          <div className="sett-scale-presets">
            {[75, 90, 100, 110, 125].map((sc) => (
              <button
                key={sc}
                type="button"
                className={`sett-scale-chip ${scale === sc ? "active" : ""}`}
                onClick={() => onScale(sc)}
              >
                <IconDevice size={14} />
                <span>{sc}%</span>
              </button>
            ))}
          </div>

          <input
            type="range"
            min="75"
            max="150"
            step="1"
            value={scale}
            onChange={(e) => onScale(Number(e.target.value))}
            className="sett-range-input"
            style={{ width: "100%", marginTop: 12 }}
          />
        </div>

        <div className="sett-row-col">
          <div className="sett-row-info" style={{ marginBottom: 12 }}>
            <div className="sett-row-title">{lang === "ru" ? "Шрифт интерфейса" : "Interface Font"}</div>
          </div>
          <div className="sett-font-grid">
            {[
              { id: "Inter", label: "Inter" },
              { id: "Segoe UI", label: "Segoe UI" },
              { id: "Roboto", label: "Roboto" },
              { id: "Arial", label: "Arial" },
              { id: "Helvetica Neue", label: "Helvetica" },
              { id: "Calibri", label: "Calibri" },
            ].map((f) => {
              const isSel = selectedFont === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  className={`sett-font-chip ${isSel ? "active" : ""}`}
                  onClick={() => onFontSelect(f.id)}
                >
                  <span className="sett-font-sample" style={{ fontFamily: f.id }}>Aa</span>
                  <span className="sett-font-name">{f.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
