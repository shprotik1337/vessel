import { useState } from "react";
import { useApp } from "../../../store";
import {
  useCustomization,
  BUILTIN_THEMES,
  type ThemeColors,
} from "../../../customization";
import {
  IconSparkles,
  IconCornerNone,
  IconCornerSmall,
  IconCornerMedium,
  IconCornerRound,
  IconDevice,
} from "../../../components/Icons";

interface InterfaceSectionProps {
  fullscreenScale: number;
  windowedScale: number;
  onFullscreenScale: (val: number) => void;
  onWindowedScale: (val: number) => void;
  selectedFont: string;
  onFontSelect: (font: string) => void;
}

export function InterfaceSection({
  fullscreenScale,
  windowedScale,
  onFullscreenScale,
  onWindowedScale,
  selectedFont,
  onFontSelect,
}: InterfaceSectionProps) {
  const { lang, showToast } = useApp();
  const {
    config,
    applyPreset,
    updateThemeDirectly,
    setBorderRadius,
    saveToUserSlot,
  } = useCustomization();

  const [customThemeOpen, setCustomThemeOpen] = useState(false);
  const [customThemeName, setCustomThemeName] = useState("Моя тема");
  const [customColors, setCustomColors] = useState<ThemeColors>(() => ({
    accentColor: config.theme?.accentColor || "#ffffff",
    appBgColor: config.theme?.appBgColor || "#000000",
    sidebarBgColor: config.theme?.sidebarBgColor || "#000000",
    playerBgColor: config.theme?.playerBgColor || "#000000",
    cardBgColor: config.theme?.cardBgColor || "#000000",
    textColor: config.theme?.textColor || "#ffffff",
    wallpaperData: null,
    wallpaperBlur: 14,
    wallpaperDim: 45,
    glassMode: true,
    glassOpacity: 0.72,
  }));

  const randomizeCustomColors = () => {
    const ACCENTS = ["#6366f1", "#3b82f6", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#06b6d4", "#f43f5e", "#14b8a6", "#e11d48", "#a855f7"];
    const DARK_BGS = ["#09090b", "#0b0c10", "#090d16", "#070c0e", "#100914", "#050505", "#0e0e12"];
    const randAccent = ACCENTS[Math.floor(Math.random() * ACCENTS.length)];
    const randBg = DARK_BGS[Math.floor(Math.random() * DARK_BGS.length)];
    setCustomColors((prev: ThemeColors) => ({
      ...prev,
      accentColor: randAccent,
      appBgColor: randBg,
      sidebarBgColor: randBg,
      playerBgColor: randBg,
      cardBgColor: "#18181b",
      textColor: "#f4f4f5",
    }));
  };

  const handleSaveCustomTheme = () => {
    updateThemeDirectly({
      accentColor: customColors.accentColor,
      appBgColor: customColors.appBgColor,
      sidebarBgColor: customColors.sidebarBgColor,
      playerBgColor: customColors.playerBgColor,
      cardBgColor: customColors.cardBgColor,
      textColor: customColors.textColor,
    });
    saveToUserSlot(0, customThemeName.trim() || "Своя тема");
    setCustomThemeOpen(false);
    showToast(lang === "ru" ? `Тема «${customThemeName}» сохранена и применена` : `Theme "${customThemeName}" saved & applied`);
  };

  return (
    <div>
      <div className="sett-page-header">
        <h1 className="sett-page-title">
          {lang === "ru" ? "Интерфейс" : "Appearance"}
        </h1>
        <p className="sett-page-sub">
          {lang === "ru"
            ? "Темы оформления, собственная палитра цветов, скругления, масштабирование и шрифт"
            : "Themes, custom color palette, border radius, scaling and typography"}
        </p>
      </div>

      <div className="sett-section-title">
        {lang === "ru" ? "ТЕМА" : "THEME"}
      </div>
      <div className="sett-card" style={{ marginBottom: 20, position: "relative", zIndex: customThemeOpen ? 1000 : 1 }}>
        <div style={{ marginBottom: 18 }}>
          <div className="sett-card-title">{lang === "ru" ? "Тема" : "Theme"}</div>
          <div className="sett-card-desc">
            {lang === "ru" ? "Выберите общее оформление приложения" : "Select overall visual appearance"}
          </div>
        </div>

        <div style={{ position: "relative" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 10 }}>
            {BUILTIN_THEMES.map((theme) => {
              const isActive = config.theme?.accentColor === theme.accentColor && config.theme?.appBgColor === theme.appBgColor;
              return (
                <button
                  key={theme.id}
                  type="button"
                  onClick={() => applyPreset(theme)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 10,
                    padding: "16px 8px 12px 8px",
                    borderRadius: 12,
                    background: isActive ? "var(--elev2, rgba(255, 255, 255, 0.08))" : "var(--elev, rgba(255, 255, 255, 0.03))",
                    border: isActive ? "1.5px solid var(--accent, #ffffff)" : "1px solid var(--border)",
                    cursor: "pointer",
                    position: "relative",
                    transition: "all 0.15s ease",
                  }}
                >
                  {isActive && (
                    <span
                      style={{
                        position: "absolute",
                        top: 6,
                        right: 6,
                        width: 16,
                        height: 16,
                        borderRadius: "50%",
                        background: "#ffffff",
                        color: "#000000",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: 10,
                        fontWeight: 900,
                      }}
                    >
                      ✓
                    </span>
                  )}
                  {/* Two overlapping circles */}
                  <div style={{ position: "relative", width: 34, height: 22, display: "flex", alignItems: "center" }}>
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        backgroundColor: theme.accentColor,
                        border: theme.accentColor === "#ffffff" ? "1px solid rgba(0,0,0,0.2)" : "none",
                        zIndex: 1,
                      }}
                    />
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        backgroundColor: theme.secondaryColor || theme.cardBgColor,
                        marginLeft: -6,
                        border: (theme.secondaryColor === "#000000" || theme.secondaryColor === "#ffffff") ? "1px solid rgba(255,255,255,0.2)" : "none",
                        zIndex: 2,
                      }}
                    />
                  </div>
                  <span style={{ fontSize: 12, fontWeight: isActive ? 700 : 500, color: "var(--text)" }}>
                    {theme.name}
                  </span>
                </button>
              );
            })}

            {/* '+' button for custom theme popover */}
            <button
              type="button"
              onClick={() => {
                setCustomColors({
                  accentColor: config.theme?.accentColor || "#ffffff",
                  appBgColor: config.theme?.appBgColor || "#000000",
                  sidebarBgColor: config.theme?.sidebarBgColor || "#000000",
                  playerBgColor: config.theme?.playerBgColor || "#000000",
                  cardBgColor: config.theme?.cardBgColor || "#000000",
                  textColor: config.theme?.textColor || "#ffffff",
                  wallpaperData: null,
                  wallpaperBlur: 14,
                  wallpaperDim: 45,
                  glassMode: true,
                  glassOpacity: 0.72,
                });
                setCustomThemeOpen((prev) => !prev);
              }}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                padding: "16px 8px 12px 8px",
                borderRadius: 12,
                background: customThemeOpen ? "var(--elev2, rgba(255, 255, 255, 0.08))" : "var(--elev, rgba(255, 255, 255, 0.03))",
                border: customThemeOpen ? "1.5px solid var(--accent)" : "1px dashed var(--border2)",
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
              title={lang === "ru" ? "Создать свой пресет" : "Create custom preset"}
            >
              <div style={{ width: 34, height: 22, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: customThemeOpen ? "var(--accent)" : "var(--text3)" }}>
                +
              </div>
              <span style={{ fontSize: 12, fontWeight: 500, color: customThemeOpen ? "var(--accent)" : "var(--text3)" }}>
                {lang === "ru" ? "Свой" : "Custom"}
              </span>
            </button>
          </div>

          {/* CUSTOM THEME POPOVER */}
          {customThemeOpen && (
            <>
              <div
                style={{ position: "fixed", inset: 0, zIndex: 1001 }}
                onClick={() => setCustomThemeOpen(false)}
              />
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + 10px)",
                  width: 320,
                  background: "var(--card-bg, #000000)",
                  backdropFilter: "blur(28px) saturate(180%)",
                  WebkitBackdropFilter: "blur(28px) saturate(180%)",
                  border: "1px solid var(--border)",
                  borderRadius: 16,
                  boxShadow: "0 18px 48px rgba(0, 0, 0, 0.8), 0 0 1px rgba(255, 255, 255, 0.15)",
                  padding: "16px",
                  zIndex: 1002,
                  display: "flex",
                  flexDirection: "column",
                  gap: 12,
                }}
              >
                {/* Top: Name Input + Wand Icon */}
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="text"
                    value={customThemeName}
                    onChange={(e) => setCustomThemeName(e.target.value)}
                    placeholder={lang === "ru" ? "Название темы" : "Theme name"}
                    style={{
                      flex: 1,
                      height: 38,
                      borderRadius: 9999,
                      background: "var(--elev, rgba(255, 255, 255, 0.05))",
                      border: "1px solid var(--border)",
                      padding: "0 16px",
                      color: "var(--text, #ffffff)",
                      fontSize: 13.5,
                      outline: "none",
                    }}
                  />
                  <button
                    type="button"
                    onClick={randomizeCustomColors}
                    title={lang === "ru" ? "Случайная палитра" : "Random colors"}
                    style={{
                      width: 38,
                      height: 38,
                      borderRadius: "50%",
                      background: "var(--elev, rgba(255, 255, 255, 0.06))",
                      border: "1px solid var(--border)",
                      color: "var(--accent)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <IconSparkles size={16} />
                  </button>
                </div>

                {/* 6 Color Pickers in 2 Columns */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  {[
                    { key: "accentColor" as const, label: lang === "ru" ? "Основной" : "Accent" },
                    { key: "textColor" as const, label: lang === "ru" ? "Текст" : "Text" },
                    { key: "appBgColor" as const, label: lang === "ru" ? "Фон" : "Canvas" },
                    { key: "sidebarBgColor" as const, label: lang === "ru" ? "Панель" : "Sidebar" },
                    { key: "cardBgColor" as const, label: lang === "ru" ? "Карточка" : "Card" },
                    { key: "playerBgColor" as const, label: lang === "ru" ? "Плеер" : "Player" },
                  ].map((item) => {
                    const val = customColors[item.key] || "#ffffff";
                    return (
                      <label
                        key={item.key}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          padding: "7px 10px",
                          borderRadius: 10,
                          background: "var(--elev, rgba(255, 255, 255, 0.03))",
                          border: "1px solid var(--border)",
                          cursor: "pointer",
                        }}
                      >
                        <div
                          style={{
                            width: 22,
                            height: 22,
                            borderRadius: "50%",
                            backgroundColor: val,
                            border: "2px solid rgba(255, 255, 255, 0.3)",
                            boxShadow: `0 0 6px ${val}40`,
                            position: "relative",
                            overflow: "hidden",
                            flexShrink: 0,
                          }}
                        >
                          <input
                            type="color"
                            value={val}
                            onChange={(e) => setCustomColors((prev: ThemeColors) => ({ ...prev, [item.key]: e.target.value }))}
                            style={{
                              position: "absolute",
                              top: -10,
                              left: -10,
                              width: 44,
                              height: 44,
                              opacity: 0,
                              cursor: "pointer",
                            }}
                          />
                        </div>
                        <span style={{ fontSize: 12, fontWeight: 500, color: "var(--text)" }}>
                          {item.label}
                        </span>
                      </label>
                    );
                  })}
                </div>

                {/* Action buttons: Сохранить & Отмена */}
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 4 }}>
                  <button
                    type="button"
                    onClick={handleSaveCustomTheme}
                    style={{
                      height: 38,
                      borderRadius: 9999,
                      background: "var(--accent, #ffffff)",
                      color: "var(--accent-contrast-text, #000000)",
                      border: "none",
                      fontSize: 13.5,
                      fontWeight: 700,
                      cursor: "pointer",
                      boxShadow: "0 2px 10px rgba(0, 0, 0, 0.25)",
                      transition: "opacity 0.15s ease",
                    }}
                  >
                    {lang === "ru" ? "Сохранить" : "Save"}
                  </button>
                  <button
                    type="button"
                    onClick={() => setCustomThemeOpen(false)}
                    style={{
                      background: "transparent",
                      border: "none",
                      color: "var(--text3)",
                      fontSize: 12.5,
                      cursor: "pointer",
                      padding: "4px",
                    }}
                  >
                    {lang === "ru" ? "Отмена" : "Cancel"}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="sett-section-title">
        {lang === "ru" ? "ПРОЗРАЧНОСТЬ" : "TRANSPARENCY"}
      </div>
      <div className="sett-card" style={{ marginBottom: 20 }}>
        {/* Row 1: Switch Прозрачность */}
        <div className="sett-card-row" style={{ paddingBottom: 14, borderBottom: "1px solid var(--border)" }}>
          <div className="sett-card-info">
            <div className="sett-card-title">{lang === "ru" ? "Прозрачность" : "Transparency"}</div>
            <div className="sett-card-desc">
              {lang === "ru" ? "Эффекты прозрачности и размытия окна" : "Window transparency and blur effects"}
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

        {/* Row 2: Slider Прозрачность */}
        <div className="sett-slider-row" style={{ marginTop: 14 }}>
          <div className="sett-card-info">
            <div className="sett-card-title">{lang === "ru" ? "Прозрачность" : "Opacity"}</div>
            <div className="sett-card-desc">{lang === "ru" ? "Прозрачность фона окна" : "Window background opacity"}</div>
          </div>
          <div className="sett-slider-control-wrap">
            <input
              type="range"
              min="0"
              max="100"
              value={config.theme?.windowOpacity ?? 66}
              onChange={(e) => updateThemeDirectly({ windowOpacity: Number(e.target.value) })}
              className="sett-range-input"
            />
            <span className="sett-slider-value">{config.theme?.windowOpacity ?? 66}%</span>
          </div>
        </div>

        {/* Row 3: Slider Сила стекла */}
        <div className="sett-slider-row" style={{ marginTop: 14 }}>
          <div className="sett-card-info">
            <div className="sett-card-title">{lang === "ru" ? "Сила стекла" : "Glass Strength"}</div>
            <div className="sett-card-desc">{lang === "ru" ? "Интенсивность и выраженность акрилового слоя" : "Intensity of acrylic layer"}</div>
          </div>
          <div className="sett-slider-control-wrap">
            <input
              type="range"
              min="0"
              max="100"
              value={config.theme?.glassForce ?? 5}
              onChange={(e) => updateThemeDirectly({ glassForce: Number(e.target.value) })}
              className="sett-range-input"
            />
            <span className="sett-slider-value">{config.theme?.glassForce ?? 5}%</span>
          </div>
        </div>

        {/* Row 4: Slider Размытие стекла */}
        <div className="sett-slider-row" style={{ marginTop: 14 }}>
          <div className="sett-card-info">
            <div className="sett-card-title">{lang === "ru" ? "Размытие стекла" : "Backdrop Blur"}</div>
            <div className="sett-card-desc">{lang === "ru" ? "Радиус размытия заднего плана под окном" : "Blur radius under the window"}</div>
          </div>
          <div className="sett-slider-control-wrap">
            <input
              type="range"
              min="0"
              max="40"
              value={config.theme?.backdropBlur ?? 6}
              onChange={(e) => updateThemeDirectly({ backdropBlur: Number(e.target.value) })}
              className="sett-range-input"
            />
            <span className="sett-slider-value">{config.theme?.backdropBlur ?? 6}px</span>
          </div>
        </div>
      </div>

      <div className="sett-section-title">
        {lang === "ru" ? "СКРУГЛЕНИЕ УГЛОВ" : "BORDER RADIUS"}
      </div>
      <div className="sett-card">
        <div className="sett-segmented-group">
          <button
            type="button"
            className={`sett-segmented-btn ${config.borderRadius === "sharp" ? "active" : ""}`}
            onClick={() => setBorderRadius("sharp")}
          >
            <span className="sett-segmented-btn-icon"><IconCornerNone size={15} /></span>
            <span className="sett-segmented-btn-label">{lang === "ru" ? "Нет (0px)" : "None (0px)"}</span>
          </button>
          <button
            type="button"
            className={`sett-segmented-btn ${config.borderRadius === "small" ? "active" : ""}`}
            onClick={() => setBorderRadius("small")}
          >
            <span className="sett-segmented-btn-icon"><IconCornerSmall size={15} /></span>
            <span className="sett-segmented-btn-label">{lang === "ru" ? "Маленькое" : "Small"}</span>
          </button>
          <button
            type="button"
            className={`sett-segmented-btn ${config.borderRadius === "medium" ? "active" : ""}`}
            onClick={() => setBorderRadius("medium")}
          >
            <span className="sett-segmented-btn-icon"><IconCornerMedium size={15} /></span>
            <span className="sett-segmented-btn-label">{lang === "ru" ? "Среднее" : "Medium"}</span>
          </button>
          <button
            type="button"
            className={`sett-segmented-btn ${config.borderRadius === "round" ? "active" : ""}`}
            onClick={() => setBorderRadius("round")}
          >
            <span className="sett-segmented-btn-icon"><IconCornerRound size={15} /></span>
            <span className="sett-segmented-btn-label">{lang === "ru" ? "Большое" : "Large"}</span>
          </button>
        </div>
      </div>

      <div className="sett-section-title">
        {lang === "ru" ? "МАСШТАБИРОВАНИЕ" : "UI SCALING"}
      </div>

      {/* CARD 1: FULLSCREEN SCALE */}
      <div className="sett-card" style={{ marginBottom: 14 }}>
        <div className="sett-card-title" style={{ marginBottom: 12 }}>
          {lang === "ru" ? "Полноэкранный" : "Fullscreen"}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 16 }}>
          {["75", "90", "100", "110", "125"].map((sc) => {
            const isSel = fullscreenScale === Number(sc);
            return (
              <button
                key={sc}
                type="button"
                onClick={() => onFullscreenScale(Number(sc))}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: "12px 6px",
                  borderRadius: 10,
                  border: isSel ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                  background: isSel ? "var(--elev2, rgba(255, 255, 255, 0.08))" : "var(--elev, rgba(255, 255, 255, 0.03))",
                  cursor: "pointer",
                }}
              >
                <span style={{ color: isSel ? "var(--accent)" : "var(--text3)" }}><IconDevice size={16} /></span>
                <span style={{ fontSize: 13, fontWeight: isSel ? 700 : 500, color: "var(--text)" }}>{sc}%</span>
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <input
            type="range"
            min="75"
            max="150"
            step="1"
            value={fullscreenScale}
            onChange={(e) => onFullscreenScale(Number(e.target.value))}
            style={{ flex: 1, accentColor: "var(--accent)" }}
          />
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", minWidth: 40, textAlign: "right" }}>
            {fullscreenScale}%
          </span>
        </div>
      </div>

      {/* CARD 2: WINDOWED SCALE */}
      <div className="sett-card">
        <div className="sett-card-title" style={{ marginBottom: 12 }}>
          {lang === "ru" ? "Оконный" : "Windowed"}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 10, marginBottom: 16 }}>
          {["75", "90", "100", "110", "125"].map((sc) => {
            const isSel = windowedScale === Number(sc);
            return (
              <button
                key={sc}
                type="button"
                onClick={() => onWindowedScale(Number(sc))}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 6,
                  padding: "12px 6px",
                  borderRadius: 10,
                  border: isSel ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                  background: isSel ? "var(--elev2, rgba(255, 255, 255, 0.08))" : "var(--elev, rgba(255, 255, 255, 0.03))",
                  cursor: "pointer",
                }}
              >
                <span style={{ color: isSel ? "var(--accent)" : "var(--text3)" }}><IconDevice size={16} /></span>
                <span style={{ fontSize: 13, fontWeight: isSel ? 700 : 500, color: "var(--text)" }}>{sc}%</span>
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <input
            type="range"
            min="75"
            max="150"
            step="1"
            value={windowedScale}
            onChange={(e) => onWindowedScale(Number(e.target.value))}
            style={{ flex: 1, accentColor: "var(--accent)" }}
          />
          <span style={{ fontSize: 13, fontWeight: 700, color: "var(--accent)", minWidth: 40, textAlign: "right" }}>
            {windowedScale}%
          </span>
        </div>
      </div>

      <div className="sett-section-title">
        {lang === "ru" ? "ШРИФТ ИНТЕРФЕЙСА" : "INTERFACE FONT"}
      </div>
      <div className="sett-presets-grid" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))" }}>
        {[
          { id: "Inter", label: "Inter (Default)" },
          { id: "Segoe UI", label: "Segoe UI" },
          { id: "Roboto", label: "Roboto" },
          { id: "Arial", label: "Arial" },
          { id: "Helvetica Neue", label: "Helvetica" },
          { id: "Calibri", label: "Calibri" },
        ].map((f) => {
          const isSel = selectedFont === f.id;
          return (
            <div
              key={f.id}
              className={`sett-preset-card ${isSel ? "active" : ""}`}
              onClick={() => onFontSelect(f.id)}
              style={{ padding: 14, cursor: "pointer", alignItems: "center", textAlign: "center" }}
            >
              <div style={{ fontSize: 24, fontWeight: 700, fontFamily: f.id, marginBottom: 6 }}>
                Aa
              </div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)" }}>{f.label}</div>
              {isSel && (
                <div style={{ fontSize: 11, color: "var(--accent)", marginTop: 4 }}>
                  {lang === "ru" ? "✓ Выбран" : "✓ Selected"}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
