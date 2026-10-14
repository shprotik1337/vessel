import { useState } from "react";
import { useApp } from "../../../store";
import { useCustomization, hexToRgba } from "../../../customization";
import {
  IconSparkles,
  IconCustomization,
  IconSolid,
  IconDisc,
  IconPlay,
} from "../../../components/Icons";

interface BackgroundSectionProps {
  onOpenImagePicker: (target: "trackArt" | "wallpaper") => void;
}

export function BackgroundSection({ onOpenImagePicker }: BackgroundSectionProps) {
  const { lang, showToast } = useApp();
  const {
    config,
    updateThemeDirectly,
    customTrackArt,
    setCustomTrackArt,
    imageLibrary,
    addToImageLibrary,
    removeFromImageLibrary,
    setWallpaperData,
  } = useCustomization();

  const [libraryUrlInput, setLibraryUrlInput] = useState("");
  const [activeImageMenuId, setActiveImageMenuId] = useState<string | null>(null);

  return (
    <div>
      <div className="sett-page-header">
        <h1 className="sett-page-title">
          {lang === "ru" ? "Фон и эффекты" : "Background & Effects"}
        </h1>
        <p className="sett-page-sub">
          {lang === "ru"
            ? "Кастомные обои (включая анимированные GIF), размытие и матовое стекло"
            : "Custom wallpaper (including animated GIF), blur and acrylic glass"}
        </p>
      </div>

      <div className="sett-section-title">
        {lang === "ru" ? "ОКРУЖЕНИЕ ИНТЕРФЕЙСА (ЭМБИЕНТ-СВЕЧЕНИЕ)" : "AMBIENT GLOW"}
      </div>
      <div className="sett-card">
        <div className="sett-card-info" style={{ marginBottom: 12 }}>
          <div className="sett-card-title">
            {lang === "ru" ? "Режим фонового рассеянного свечения" : "Ambient Glow Mode"}
          </div>
          <div className="sett-card-desc">
            {lang === "ru"
              ? "Выберите источник цветного эмбиент-свечения позади интерфейса"
              : "Choose source of colored ambient glow behind UI"}
          </div>
        </div>
        <div className="sett-segmented-group">
          <button
            type="button"
            className={`sett-segmented-btn ${(config.theme?.ambientMode || "dynamic") === "dynamic" ? "active" : ""}`}
            onClick={() => updateThemeDirectly({ ambientMode: "dynamic" })}
          >
            <span className="sett-segmented-btn-icon"><IconSparkles size={15} /></span>
            <span className="sett-segmented-btn-label">
              {lang === "ru" ? "Динамический (под обложку трека)" : "Dynamic (Cover match)"}
            </span>
          </button>
          <button
            type="button"
            className={`sett-segmented-btn ${config.theme?.ambientMode === "theme" ? "active" : ""}`}
            onClick={() => updateThemeDirectly({ ambientMode: "theme" })}
          >
            <span className="sett-segmented-btn-icon"><IconCustomization size={15} /></span>
            <span className="sett-segmented-btn-label">
              {lang === "ru" ? "Статичный (акцент темы)" : "Static (Theme accent)"}
            </span>
          </button>
          <button
            type="button"
            className={`sett-segmented-btn ${config.theme?.ambientMode === "off" ? "active" : ""}`}
            onClick={() => updateThemeDirectly({ ambientMode: "off" })}
          >
            <span className="sett-segmented-btn-icon"><IconSolid size={15} /></span>
            <span className="sett-segmented-btn-label">
              {lang === "ru" ? "Отключено (чистый фон)" : "Off (Clean background)"}
            </span>
          </button>
        </div>
      </div>

      <div className="sett-section-title">
        {lang === "ru" ? "КАСТОМИЗАЦИЯ" : "CUSTOMIZATION"}
      </div>
      <div style={{ fontSize: 13, color: "var(--text3)", marginTop: -8, marginBottom: 16 }}>
        {lang === "ru"
          ? "Своя обложка, фон приложения и постоянная библиотека изображений."
          : "Custom track art, application background and persistent image library."}
      </div>

      {/* 2 Карточки: Обложка трека и Фон приложения */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 14, marginBottom: 16 }}>
        {/* Карточка 1. Обложка трека */}
        <div className="sett-card" style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div style={{ width: 72, height: 72, minWidth: 72, minHeight: 72, borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)", background: "var(--elev)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {customTrackArt ? (
              <img
                src={customTrackArt}
                alt="Обложка трека"
                style={{ width: 72, height: 72, objectFit: "cover" }}
              />
            ) : (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="10" r="10" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text)", marginBottom: 2 }}>
              {lang === "ru" ? "Обложка трека" : "Track Artwork"}
            </div>
            <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 8 }}>
              {lang === "ru" ? "Только для текущего трека в плеере." : "For current now-playing track only."}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="sett-token-action-btn submit"
                style={{ padding: "5px 10px", fontSize: 12 }}
                onClick={() => onOpenImagePicker("trackArt")}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                  <span>{lang === "ru" ? "Выбрать из библиотеки" : "Choose from library"}</span>
                </span>
              </button>
              {customTrackArt && (
                <button
                  type="button"
                  className="sett-token-action-btn"
                  style={{ padding: "5px 10px", fontSize: 12 }}
                  onClick={() => {
                    setCustomTrackArt(null);
                    showToast(lang === "ru" ? "Обложка сброшена к оригиналу" : "Track artwork reset to original");
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                    <span>{lang === "ru" ? "Сброс" : "Reset"}</span>
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Карточка 2. Фон приложения */}
        <div className="sett-card" style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div style={{ width: 72, height: 72, minWidth: 72, minHeight: 72, borderRadius: 8, overflow: "hidden", border: "1px solid var(--border)", background: "var(--elev)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            {config.theme?.wallpaperData ? (
              <img
                src={config.theme.wallpaperData}
                alt="Фон приложения"
                style={{ width: 72, height: 72, objectFit: "cover" }}
              />
            ) : (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--text3)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600, fontSize: 14, color: "var(--text)", marginBottom: 2 }}>
              {lang === "ru" ? "Фон приложения" : "App Wallpaper"}
            </div>
            <div style={{ fontSize: 12, color: "var(--text3)", marginBottom: 8 }}>
              {lang === "ru" ? "Картинка под интерфейсными слоями." : "Image underneath UI layers."}
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                className="sett-token-action-btn submit"
                style={{ padding: "5px 10px", fontSize: 12 }}
                onClick={() => onOpenImagePicker("wallpaper")}
              >
                <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                  <span>{lang === "ru" ? "Выбрать из библиотеки" : "Choose from library"}</span>
                </span>
              </button>
              {config.theme?.wallpaperData && (
                <button
                  type="button"
                  className="sett-token-action-btn"
                  style={{ padding: "5px 10px", fontSize: 12 }}
                  onClick={() => {
                    setWallpaperData(null);
                    showToast(lang === "ru" ? "Фон приложения сброшен" : "Wallpaper reset");
                  }}
                >
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="3 6 5 6 21 6"/>
                      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                    </svg>
                    <span>{lang === "ru" ? "Сброс" : "Reset"}</span>
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Блок Библиотека изображений */}
      <div className="sett-card" style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div>
            <div className="sett-card-title">{lang === "ru" ? "Библиотека изображений" : "Image Library"}</div>
            <div className="sett-card-desc">
              {lang === "ru" ? "Сохранённые обложки и фоны для быстрого переключения" : "Saved artwork and backgrounds for fast switching"}
            </div>
          </div>
        </div>

        {/* Input для добавления по URL */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <input
            type="text"
            className="sett-token-input"
            style={{ flex: 1 }}
            placeholder={lang === "ru" ? "Вставьте прямую ссылку на изображение (jpg, png, webp, gif)..." : "Paste direct image URL (jpg, png, webp, gif)..."}
            value={libraryUrlInput}
            onChange={(e) => setLibraryUrlInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && libraryUrlInput.trim()) {
                addToImageLibrary({ url: libraryUrlInput.trim(), name: `Картинка ${imageLibrary.length + 1}` });
                setLibraryUrlInput("");
                showToast(lang === "ru" ? "Изображение добавлено в библиотеку!" : "Image added to library!");
              }
            }}
          />
          <button
            type="button"
            className="sett-token-action-btn submit"
            disabled={!libraryUrlInput.trim()}
            onClick={() => {
              if (libraryUrlInput.trim()) {
                addToImageLibrary({ url: libraryUrlInput.trim(), name: `Картинка ${imageLibrary.length + 1}` });
                setLibraryUrlInput("");
                showToast(lang === "ru" ? "Изображение добавлено в библиотеку!" : "Image added to library!");
              }
            }}
          >
            {lang === "ru" ? "Добавить" : "Add"}
          </button>
        </div>

        {/* Сетка картинок */}
        {imageLibrary.length === 0 ? (
          <div style={{ padding: "24px 10px", textAlign: "center", color: "var(--text3)", fontSize: 13 }}>
            {lang === "ru"
              ? "Библиотека пока пуста. Добавьте ссылки на изображения выше."
              : "Library is empty. Add image URLs above."}
          </div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))", gap: 10 }}>
            {imageLibrary.map((item) => {
              const isMenuOpen = activeImageMenuId === item.id;
              return (
                <div
                  key={item.id}
                  style={{
                    borderRadius: 10,
                    overflow: "hidden",
                    border: "1px solid var(--border)",
                    background: "var(--elev)",
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                  }}
                >
                  <div style={{ height: 90, position: "relative", overflow: "hidden" }}>
                    <img
                      src={item.url}
                      alt={item.name}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                    <button
                      type="button"
                      onClick={() => setActiveImageMenuId(isMenuOpen ? null : item.id)}
                      style={{
                        position: "absolute",
                        top: 4,
                        right: 4,
                        width: 24,
                        height: 24,
                        borderRadius: "50%",
                        background: "rgba(0,0,0,0.65)",
                        border: "none",
                        color: "#fff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        cursor: "pointer",
                        fontSize: 12,
                      }}
                      title={lang === "ru" ? "Опции" : "Options"}
                    >
                      ⋮
                    </button>
                  </div>
                  <div style={{ padding: "6px 8px", fontSize: 11, color: "var(--text)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                    {item.name}
                  </div>

                  {isMenuOpen && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        background: "rgba(0,0,0,0.88)",
                        padding: 8,
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                        justifyContent: "center",
                        zIndex: 10,
                      }}
                    >
                      <button
                        type="button"
                        className="sett-token-action-btn submit"
                        style={{ width: "100%", padding: "4px 6px", fontSize: 11, textAlign: "center" }}
                        onClick={() => {
                          setCustomTrackArt(item.url);
                          setActiveImageMenuId(null);
                          showToast(lang === "ru" ? "Обложка трека обновлена!" : "Track artwork updated!");
                        }}
                      >
                        {lang === "ru" ? "Как обложку" : "As Artwork"}
                      </button>
                      <button
                        type="button"
                        className="sett-token-action-btn"
                        style={{ width: "100%", padding: "4px 6px", fontSize: 11, textAlign: "center" }}
                        onClick={() => {
                          setWallpaperData(item.url);
                          setActiveImageMenuId(null);
                          showToast(lang === "ru" ? "Фон приложения обновлен!" : "Wallpaper updated!");
                        }}
                      >
                        {lang === "ru" ? "Как фон" : "As Wallpaper"}
                      </button>
                      <button
                        type="button"
                        className="sett-token-action-btn"
                        style={{ width: "100%", padding: "4px 6px", fontSize: 11, textAlign: "center", color: "#f87171" }}
                        onClick={() => {
                          removeFromImageLibrary(item.id);
                          setActiveImageMenuId(null);
                          showToast(lang === "ru" ? "Удалено из библиотеки" : "Removed from library");
                        }}
                      >
                        {lang === "ru" ? "Удалить" : "Delete"}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="sett-section-title">
        {lang === "ru" ? "ЗАТЕМНЕНИЕ И РАЗМЫТИЕ ОБОЕВ" : "WALLPAPER DIM & BLUR"}
      </div>
      <div className="sett-card">
        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span className="sett-card-title">{lang === "ru" ? "Затемнение подложки" : "Dimming"}</span>
              <span style={{ fontWeight: 700, color: "var(--accent)" }}>{config.theme?.wallpaperDim ?? 45}%</span>
            </div>
            <input
              type="range"
              min="0"
              max="90"
              value={config.theme?.wallpaperDim ?? 45}
              onChange={(e) => updateThemeDirectly({ wallpaperDim: Number(e.target.value) })}
              style={{ width: "100%", accentColor: "var(--accent)" }}
            />
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
              <span className="sett-card-title">{lang === "ru" ? "Размытие фона (Blur)" : "Backdrop Blur"}</span>
              <span style={{ fontWeight: 700, color: "var(--accent)" }}>{config.theme?.wallpaperBlur ?? 14}px</span>
            </div>
            <input
              type="range"
              min="0"
              max="40"
              value={config.theme?.wallpaperBlur ?? 14}
              onChange={(e) => updateThemeDirectly({ wallpaperBlur: Number(e.target.value) })}
              style={{ width: "100%", accentColor: "var(--accent)" }}
            />
          </div>
        </div>
      </div>

      <div className="sett-section-title">
        {lang === "ru" ? "СТИЛЬ И ПЛОТНОСТЬ СТРОК ТРЕКОВ" : "TRACK ROW STYLE & DENSITY"}
      </div>

      {/* CARD 1: Normal Inactive Track Row */}
      <div className="sett-card">
        <div className="sett-card-info" style={{ marginBottom: 12 }}>
          <div className="sett-card-title">
            {lang === "ru" ? "Подложка обычной (неактивной) строки" : "Inactive Track Row Background"}
          </div>
          <div className="sett-card-desc">
            {lang === "ru"
              ? "Регулировка фона под всеми строками треков для идеальной читаемости на ярких или детальных обоях (0% — полностью прозрачно)"
              : "Adjust row background for optimal readability on bright wallpapers (0% — transparent)"}
          </div>
        </div>

        {/* Normal Track Row Preview */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            height: 52,
            padding: "0 16px",
            borderRadius: 8,
            background: (config.theme?.trackRowOpacity ?? 0) > 0
              ? hexToRgba(config.theme?.cardBgColor || "#000000", (config.theme?.trackRowOpacity ?? 0) * 0.95)
              : "transparent",
            border: (config.theme?.trackRowOpacity ?? 0) > 0
              ? `1px solid rgba(255, 255, 255, ${(config.theme?.trackRowOpacity ?? 0) * 0.08})`
              : "1px solid transparent",
            backdropFilter: (config.theme?.trackRowOpacity ?? 0) > 0 ? "blur(12px)" : "none",
            WebkitBackdropFilter: (config.theme?.trackRowOpacity ?? 0) > 0 ? "blur(12px)" : "none",
            boxShadow: (config.theme?.trackRowOpacity ?? 0) > 0.1 ? "0 4px 16px rgba(0,0,0,0.2)" : "none",
            transition: "all 0.15s ease",
            marginBottom: 16,
          }}
        >
          <span style={{ width: 20, fontSize: 13, color: "var(--text3)", fontVariantNumeric: "tabular-nums" }}>
            1
          </span>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 6,
            background: "rgba(255, 255, 255, 0.06)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            color: "var(--text3)",
            flexShrink: 0,
          }}>
            <IconDisc size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              FE!N (feat. Playboi Carti)
            </div>
            <div style={{ fontSize: 11.5, color: "var(--text3)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
              Travis Scott — {lang === "ru" ? "Обычная строка трека" : "Normal track row"}
            </div>
          </div>
          <span style={{ fontSize: 11.5, color: "var(--text3)", fontVariantNumeric: "tabular-nums" }}>
            3:11
          </span>
        </div>

        {/* Slider directly below normal preview */}
        <div style={{ paddingTop: 10, borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
            <span className="sett-card-title">{lang === "ru" ? "Плотность фона обычной строки" : "Normal Row Background Density"}</span>
            <span style={{ fontWeight: 700, color: "var(--accent)", minWidth: 36, textAlign: "right" }}>
                {Math.round((config.theme?.trackRowOpacity ?? 0) * 100)}%
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={Math.round((config.theme?.trackRowOpacity ?? 0) * 100)}
            onChange={(e) => updateThemeDirectly({ trackRowOpacity: Number(e.target.value) / 100 })}
            className="sett-range-input sett-slider-input"
            style={{ width: "100%", accentColor: "var(--accent)" }}
          />
        </div>
      </div>

      {/* CARD 2: Active Playing Track Row */}
      <div className="sett-card">
        <div className="sett-card-info" style={{ marginBottom: 12 }}>
          <div className="sett-card-title">{lang === "ru" ? "Подложка активного (играющего) трека" : "Active Track Row Background"}</div>
          <div className="sett-card-desc">
            {lang === "ru"
              ? "Настройка стиля и плотности выделения текущего играющего трека во всех списках и плеере"
              : "Style and highlight density for now-playing track row across all views"}
          </div>
        </div>

        {/* Active Playing Track Row Preview */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            height: 52,
            padding: "0 16px",
            borderRadius: 8,
            background: "var(--trow-now-bg, rgba(255, 255, 255, 0.08))",
            border: "1px solid var(--trow-now-border, transparent)",
            transition: "all 0.15s ease",
            marginBottom: 16,
          }}
        >
          <span style={{
            width: 20,
            fontSize: 12,
            color: (config.theme?.trackRowActiveStyle || "glass") === "accent" ? "var(--accent)" : "#ffffff",
          }}>
            ▶
          </span>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 6,
            background: "rgba(255, 255, 255, 0.12)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 14,
            color: "#fff",
            flexShrink: 0,
            fontWeight: 700,
          }}>
            <IconPlay size={18} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 13,
              fontWeight: 600,
              color: (config.theme?.trackRowActiveStyle || "glass") === "accent" ? "var(--accent)" : "#ffffff",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}>
              POP OUT
            </div>
            <div style={{
              fontSize: 11.5,
              color: "rgba(255, 255, 255, 0.65)",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}>
              Playboi Carti — {lang === "ru" ? "Активная играющая строка" : "Now playing row"}
            </div>
          </div>
          <span style={{
            fontSize: 11.5,
            color: "rgba(255, 255, 255, 0.6)",
            fontVariantNumeric: "tabular-nums",
          }}>
            2:42
          </span>
        </div>

        {/* Style selector & density directly below active preview */}
        <div style={{ paddingTop: 10, borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
              {lang === "ru" ? "Стиль подложки" : "Background Style"}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {[
                {
                  id: "glass",
                  label: lang === "ru" ? "Прозрачное стекло" : "Acrylic Glass",
                  desc: lang === "ru" ? "Мягкое полупрозрачное дымчатое стекло без рамки" : "Soft smoky glass without border",
                },
                {
                  id: "accent",
                  label: lang === "ru" ? "Цвет темы" : "Theme Accent",
                  desc: lang === "ru" ? "Тонирование цветом выбранного акцента темы" : "Tinted with selected theme accent",
                },
                {
                  id: "dark",
                  label: lang === "ru" ? "Тёмный контраст" : "Dark Contrast",
                  desc: lang === "ru" ? "Глубокая тёмная плашка под текст без рамки" : "Deep contrast plate without border",
                },
              ].map((st) => {
                const isSel = (config.theme?.trackRowActiveStyle || "glass") === st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => updateThemeDirectly({ trackRowActiveStyle: st.id as any })}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "flex-start",
                      textAlign: "left",
                      gap: 4,
                      padding: "10px 12px",
                      borderRadius: 10,
                      border: isSel ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                      background: isSel ? "var(--elev2, rgba(255, 255, 255, 0.08))" : "var(--elev, rgba(255, 255, 255, 0.03))",
                      cursor: "pointer",
                      transition: "all 0.15s ease",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6, width: "100%" }}>
                      <span style={{ fontSize: 13, fontWeight: isSel ? 700 : 600, color: isSel ? "var(--accent)" : "var(--text)" }}>
                        {st.label}
                      </span>
                      {isSel && (
                        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--accent)", fontWeight: 700 }}>
                          ✓
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: "var(--text3)", lineHeight: 1.3 }}>
                      {st.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <span className="sett-card-title">{lang === "ru" ? "Плотность активной строки" : "Active Row Density"}</span>
              <span style={{ fontWeight: 700, color: "var(--accent)", minWidth: 36, textAlign: "right" }}>
                {Math.round((config.theme?.trackRowActiveOpacity ?? 0.08) * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={Math.round((config.theme?.trackRowActiveOpacity ?? 0.08) * 100)}
              onChange={(e) => updateThemeDirectly({ trackRowActiveOpacity: Number(e.target.value) / 100 })}
              className="sett-range-input sett-slider-input"
              style={{ width: "100%", accentColor: "var(--accent)" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
