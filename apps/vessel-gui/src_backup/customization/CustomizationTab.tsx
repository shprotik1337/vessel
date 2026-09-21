import React, { useState, useRef, useEffect } from "react";
import {
  useCustomization,
  BUILTIN_THEMES,
  type BorderRadiusPreset,
} from "./CustomizationContext";
import { useApp } from "../store";
import * as api from "../api/commands";

interface ColorPickerItemProps {
  label: string;
  description: string;
  value: string;
  onChange: (hex: string) => void;
}

function ColorPickerItem({ label, description, value, onChange }: ColorPickerItemProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [textVal, setTextVal] = useState(value);

  useEffect(() => {
    setTextVal(value);
  }, [value]);

  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTextVal(val);
    if (/^#[0-9A-Fa-f]{6}$/.test(val)) {
      onChange(val);
    }
  };

  const handleColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setTextVal(e.target.value);
    onChange(e.target.value);
  };

  return (
    <div className="custom-color-item">
      <div className="custom-color-info">
        <span className="custom-color-label">{label}</span>
        <span className="custom-color-desc">{description}</span>
      </div>
      <div className="custom-color-controls">
        <button
          type="button"
          className="custom-color-swatch-btn"
          style={{ backgroundColor: value }}
          onClick={() => inputRef.current?.click()}
          title="Нажмите для открытия палитры"
        >
          <span className="swatch-pip" />
        </button>
        <input
          ref={inputRef}
          type="color"
          value={value.startsWith("#") && value.length === 7 ? value : "#3b82f6"}
          onChange={handleColorChange}
          style={{ display: "none" }}
        />
        <input
          type="text"
          value={textVal}
          onChange={handleTextChange}
          className="custom-color-text-input"
          placeholder="#000000"
          maxLength={7}
        />
      </div>
    </div>
  );
}

export function CustomizationTab() {
  const {
    config,
    enterEditMode,
    updateThemeDirectly,
    setSidebarStyle,
    setPlayerStyle,
    setPlayerOptions,
    setBorderRadius,
    applyPreset,
    userPresets,
    saveToUserSlot,
    loadFromUserSlot,
    resetToDefaults,
  } = useCustomization();

  const { navigateTo, showToast } = useApp();
  const [subTab, setSubTab] = useState<"colors" | "wallpaper" | "style" | "presets">("colors");
  const [loadingWallpaper, setLoadingWallpaper] = useState(false);
  const [savingSlot, setSavingSlot] = useState<number | null>(null);
  const [slotNameInput, setSlotNameInput] = useState("");

  const { theme, sidebar, player, borderRadius } = config;

  const handlePickWallpaper = async () => {
    try {
      setLoadingWallpaper(true);
      const filePath = await api.pickFile(["png", "jpg", "jpeg", "webp", "gif", "bmp"]);
      if (!filePath) return;
      const dataUrl = await api.loadImageAsDataUrl(filePath);
      updateThemeDirectly({ wallpaperData: dataUrl });
      showToast("Обои успешно установлены!");
    } catch (err) {
      showToast(`Ошибка загрузки обоев: ${err}`, true);
    } finally {
      setLoadingWallpaper(false);
    }
  };

  const handleEnterVisualMode = () => {
    enterEditMode();
    navigateTo("home");
  };

  const RADIUS_OPTIONS: { key: BorderRadiusPreset; name: string; desc: string; px: string }[] = [
    { key: "sharp", name: "Квадратные", desc: "Строгие прямые углы", px: "0px" },
    { key: "small", name: "Небольшое", desc: "Легкое скругление", px: "6px" },
    { key: "medium", name: "Среднее", desc: "Сбалансированное (стандарт)", px: "14px" },
    { key: "round", name: "Полностью круглые", desc: "Мягкие круглые капсулы", px: "26px" },
  ];

  return (
    <div className="customization-tab-content">
      <div className="custom-tab-header">
        <div>
          <h2 className="custom-tab-title">Кастомизация интерфейса</h2>
          <p className="custom-tab-subtitle">
            Настройте форму, стили, цветовую палитру, матовое стекло и фоновые обои
          </p>
        </div>

        <button className="btn-enter-edit-mode" onClick={handleEnterVisualMode}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" />
            <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
          Войти в режим Drag & Drop
        </button>
      </div>

      {/* Live Preview Widget */}
      <div className="live-preview-box">
        <div className="live-preview-head">
          <span className="live-preview-tag">
            <span className="live-preview-pulse" /> Живой предпросмотр (Live Preview)
          </span>
          <span className="live-preview-coords">
            Сайдбар: {sidebar.position === "left" ? "Слева" : sidebar.position === "right" ? "Справа" : sidebar.position === "top" ? "Сверху" : "Снизу"} ({sidebar.style === "floating" ? "Островок" : "Док"}) · Плеер: {player.position === "bottom" ? "Снизу" : player.position === "top" ? "Сверху" : player.position === "left" ? "Слева" : "Справа"} ({player.style === "floating" ? "Островок" : "Док"})
          </span>
        </div>

        <div className="live-preview-window">
          {theme.wallpaperData && (
            <div
              className="preview-wallpaper"
              style={{
                backgroundImage: `url(${theme.wallpaperData})`,
                filter: `blur(${theme.wallpaperBlur / 4}px)`,
                opacity: 1 - theme.wallpaperDim / 100,
              }}
            />
          )}

          {/* Mini App Window */}
          <div
            className="preview-shell"
            style={{
              backgroundColor: theme.wallpaperData && theme.glassMode ? "transparent" : theme.appBgColor,
              flexDirection: player.position === "top" ? "column-reverse" : "column",
            }}
          >
            {/* Main Area */}
            <div
              className="preview-middle"
              style={{
                flexDirection:
                  sidebar.position === "top"
                    ? "column"
                    : sidebar.position === "bottom"
                    ? "column-reverse"
                    : sidebar.position === "right"
                    ? "row-reverse"
                    : "row",
              }}
            >
              {/* Mini Sidebar */}
              <div
                className={`preview-sidebar ${sidebar.position === "top" || sidebar.position === "bottom" ? "horizontal" : ""} ${sidebar.style === "floating" ? "preview-floating" : ""}`}
                style={{
                  backgroundColor:
                    theme.glassMode
                      ? "rgba(20, 20, 24, 0.7)"
                      : theme.sidebarBgColor,
                  borderColor: theme.accentColor,
                  borderRadius: borderRadius === "sharp" ? "0px" : borderRadius === "small" ? "4px" : borderRadius === "round" ? "14px" : "8px",
                }}
              >
                <div className="preview-nav-item active" style={{ backgroundColor: theme.accentColor }} />
                <div className="preview-nav-item" />
                <div className="preview-nav-item" />
              </div>

              {/* Mini Content */}
              <div className="preview-content">
                <div className="preview-header-mock">
                  <div className="preview-title-mock" style={{ color: theme.textColor }}>
                    Добрый вечер
                  </div>
                  <div className="preview-pill-mock" style={{ borderColor: theme.accentColor }} />
                </div>
                <div className="preview-cards-row">
                  <div
                    className="preview-card"
                    style={{
                      backgroundColor:
                        theme.glassMode
                          ? "rgba(28, 28, 34, 0.75)"
                          : theme.cardBgColor,
                      borderRadius: borderRadius === "sharp" ? "0px" : borderRadius === "small" ? "4px" : borderRadius === "round" ? "12px" : "8px",
                    }}
                  >
                    <div className="preview-card-art" style={{ backgroundColor: theme.accentColor }} />
                    <div className="preview-card-line" style={{ backgroundColor: theme.textColor }} />
                  </div>
                  <div
                    className="preview-card"
                    style={{
                      backgroundColor:
                        theme.glassMode
                          ? "rgba(28, 28, 34, 0.75)"
                          : theme.cardBgColor,
                      borderRadius: borderRadius === "sharp" ? "0px" : borderRadius === "small" ? "4px" : borderRadius === "round" ? "12px" : "8px",
                    }}
                  >
                    <div className="preview-card-art" style={{ backgroundColor: theme.accentColor }} />
                    <div className="preview-card-line" style={{ backgroundColor: theme.textColor }} />
                  </div>
                </div>
              </div>
            </div>

            {/* Mini Player */}
            <div
              className={`preview-player ${player.style === "floating" ? "preview-floating" : ""}`}
              style={{
                backgroundColor:
                  theme.glassMode
                    ? "rgba(20, 20, 24, 0.75)"
                    : theme.playerBgColor,
                borderRadius: borderRadius === "sharp" ? "0px" : borderRadius === "small" ? "4px" : borderRadius === "round" ? "14px" : "8px",
              }}
            >
              <div className="preview-track-art" style={{ backgroundColor: theme.accentColor }} />
              <div className="preview-player-bar">
                <div className="preview-play-btn" style={{ backgroundColor: theme.accentColor }} />
                <div className="preview-seek-line">
                  <div className="preview-seek-fill" style={{ width: "45%", backgroundColor: theme.accentColor }} />
                </div>
              </div>
              <div className="preview-vol-pip" />
            </div>
          </div>
        </div>
      </div>

      {/* Subcategory Navigation without emojis */}
      <div className="custom-subtabs">
        <button
          className={`custom-subtab-btn ${subTab === "colors" ? "active" : ""}`}
          onClick={() => setSubTab("colors")}
        >
          Цветовая палитра
        </button>
        <button
          className={`custom-subtab-btn ${subTab === "wallpaper" ? "active" : ""}`}
          onClick={() => setSubTab("wallpaper")}
        >
          Обои и стекло
        </button>
        <button
          className={`custom-subtab-btn ${subTab === "style" ? "active" : ""}`}
          onClick={() => setSubTab("style")}
        >
          Форма и стиль
        </button>
        <button
          className={`custom-subtab-btn ${subTab === "presets" ? "active" : ""}`}
          onClick={() => setSubTab("presets")}
        >
          Темы и пресеты
        </button>
      </div>

      {/* Subtab 1: Colors */}
      {subTab === "colors" && (
        <div className="subtab-panel">
          <p className="subtab-desc">
            Настройте цвета для каждого элемента интерфейса. Изменения мгновенно применяются ко всем разделам (Главная, Поиск, Избранное, Плейлисты).
          </p>

          <div className="color-pickers-list">
            <ColorPickerItem
              label="Основной акцентный цвет"
              description="Цвет кнопки Play, ползунков громкости и прогресса, активных пунктов меню"
              value={theme.accentColor}
              onChange={(c) => updateThemeDirectly({ accentColor: c })}
            />

            <ColorPickerItem
              label="Фон приложения (Canvas)"
              description="Базовый цвет подложки всего интерфейса"
              value={theme.appBgColor}
              onChange={(c) => updateThemeDirectly({ appBgColor: c })}
            />

            <ColorPickerItem
              label="Фон сайдбара"
              description="Цвет фона левой/правой/верхней панели навигации"
              value={theme.sidebarBgColor}
              onChange={(c) => updateThemeDirectly({ sidebarBgColor: c })}
            />

            <ColorPickerItem
              label="Фон плеера"
              description="Цвет полосы воспроизведения"
              value={theme.playerBgColor}
              onChange={(c) => updateThemeDirectly({ playerBgColor: c })}
            />

            <ColorPickerItem
              label="Фон карточек и панелей"
              description="Цвет карточек треков, плейлистов и списков"
              value={theme.cardBgColor}
              onChange={(c) => updateThemeDirectly({ cardBgColor: c })}
            />

            <ColorPickerItem
              label="Основной цвет текста"
              description="Цвет заголовков и основных надписей"
              value={theme.textColor}
              onChange={(c) => updateThemeDirectly({ textColor: c })}
            />
          </div>
        </div>
      )}

      {/* Subtab 2: Wallpaper & Glass */}
      {subTab === "wallpaper" && (
        <div className="subtab-panel">
          <div className="custom-group">
            <h3 className="custom-group-title">Фоновое изображение (Обои)</h3>
            <div className="wallpaper-settings-wrap">
              {theme.wallpaperData ? (
                <div
                  className="wallpaper-preview-hero"
                  style={{ backgroundImage: `url(${theme.wallpaperData})` }}
                >
                  <div
                    className="wallpaper-preview-hero-scrim"
                    style={{
                      backdropFilter: `blur(${theme.wallpaperBlur / 4}px)`,
                      opacity: theme.wallpaperDim / 100,
                    }}
                  />
                  <div className="wallpaper-badge">Обои активны</div>
                </div>
              ) : (
                <div className="wallpaper-placeholder-hero">
                  <span>Фон не выбран (используется сплошной цвет темы)</span>
                </div>
              )}

              <div className="wallpaper-btn-row">
                <button
                  className="btn-theme-action primary"
                  onClick={handlePickWallpaper}
                  disabled={loadingWallpaper}
                >
                  {loadingWallpaper ? "Загрузка..." : "Выбрать картинку с компьютера"}
                </button>
                {theme.wallpaperData && (
                  <button
                    className="btn-theme-action danger"
                    onClick={() => updateThemeDirectly({ wallpaperData: null })}
                  >
                    Удалить обои
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="custom-group">
            <h3 className="custom-group-title">Настройки стекла и эффектов</h3>
            <p className="custom-group-subtitle">
              Эффект матового стекла (Glassmorphism) работает как с пользовательскими обоями, так и со стандартным фоном
            </p>

            <div className="sliders-column">
              <label className="checkbox-row-label">
                <input
                  type="checkbox"
                  checked={theme.glassMode}
                  onChange={(e) => updateThemeDirectly({ glassMode: e.target.checked })}
                />
                <div>
                  <div className="checkbox-title">Эффект матового стекла (Glassmorphism)</div>
                  <div className="checkbox-desc">Панели и карточки становятся полупрозрачными с размытием заднего плана</div>
                </div>
              </label>

              {theme.glassMode && (
                <div className="slider-row-wrap">
                  <div className="slider-row-labels">
                    <span>Прозрачность панелей:</span>
                    <span className="slider-val">{Math.round((1 - theme.glassOpacity) * 100)}%</span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="0.9"
                    step="0.05"
                    value={theme.glassOpacity}
                    onChange={(e) => updateThemeDirectly({ glassOpacity: parseFloat(e.target.value) })}
                    className="theme-slider"
                  />
                </div>
              )}

              <div className="slider-row-wrap">
                <div className="slider-row-labels">
                  <span>Размытие фона (Blur):</span>
                  <span className="slider-val">{theme.wallpaperBlur}px</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="40"
                  step="1"
                  value={theme.wallpaperBlur}
                  onChange={(e) => updateThemeDirectly({ wallpaperBlur: parseInt(e.target.value, 10) })}
                  className="theme-slider"
                />
              </div>

              <div className="slider-row-wrap">
                <div className="slider-row-labels">
                  <span>Затемнение (Dimming):</span>
                  <span className="slider-val">{theme.wallpaperDim}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="90"
                  step="1"
                  value={theme.wallpaperDim}
                  onChange={(e) => updateThemeDirectly({ wallpaperDim: parseInt(e.target.value, 10) })}
                  className="theme-slider"
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Subtab 3: Form & Style */}
      {subTab === "style" && (
        <div className="subtab-panel">
          <div className="custom-group">
            <h3 className="custom-group-title">Скругление углов элементов</h3>
            <p className="custom-group-subtitle">
              Определяет форму карточек, кнопок, меню и плеера
            </p>
            <div className="radius-options-grid">
              {RADIUS_OPTIONS.map((opt) => (
                <button
                  key={opt.key}
                  type="button"
                  className={`radius-preset-card ${borderRadius === opt.key ? "active" : ""}`}
                  onClick={() => setBorderRadius(opt.key)}
                >
                  <div
                    className="radius-preview-sample"
                    style={{
                      borderRadius: opt.key === "sharp" ? "0px" : opt.key === "small" ? "4px" : opt.key === "round" ? "18px" : "10px",
                    }}
                  />
                  <div className="radius-card-title">{opt.name}</div>
                  <div className="radius-card-desc">{opt.desc} ({opt.px})</div>
                </button>
              ))}
            </div>
          </div>

          <div className="custom-group">
            <h3 className="custom-group-title">Стиль панелей</h3>
            <div className="style-panels-grid">
              <div className="style-panel-card">
                <div className="style-card-title">Сайдбар (Меню навигации)</div>
                <div className="style-card-desc">Внешний вид боковой панели</div>
                <div className="style-btn-toggle-row">
                  <button
                    type="button"
                    className={`style-choice-btn ${sidebar.style === "floating" ? "active" : ""}`}
                    onClick={() => setSidebarStyle("floating")}
                  >
                    Островок (Плавающий)
                  </button>
                  <button
                    type="button"
                    className={`style-choice-btn ${sidebar.style === "dock" ? "active" : ""}`}
                    onClick={() => setSidebarStyle("dock")}
                  >
                    На весь экран (Док)
                  </button>
                </div>
              </div>

              <div className="style-panel-card">
                <div className="style-card-title">Плеер</div>
                <div className="style-card-desc">Внешний вид нижней полосы воспроизведения</div>
                <div className="style-btn-toggle-row">
                  <button
                    type="button"
                    className={`style-choice-btn ${player.style === "floating" ? "active" : ""}`}
                    onClick={() => setPlayerStyle("floating")}
                  >
                    Островок (Плавающий)
                  </button>
                  <button
                    type="button"
                    className={`style-choice-btn ${player.style === "dock" ? "active" : ""}`}
                    onClick={() => setPlayerStyle("dock")}
                  >
                    На всю ширину (Док)
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="custom-group">
            <h3 className="custom-group-title">Параметры плеера</h3>
            <div className="checkbox-options-list">
              <label className="checkbox-row-label">
                <input
                  type="checkbox"
                  checked={player.largeIcons}
                  onChange={(e) => setPlayerOptions({ largeIcons: e.target.checked })}
                />
                <div>
                  <div className="checkbox-title">Крупные кнопки управления (Large Icons)</div>
                  <div className="checkbox-desc">Увеличивает размер Play/Pause, Next и Prev</div>
                </div>
              </label>

              <label className="checkbox-row-label">
                <input
                  type="checkbox"
                  checked={player.hideDetails}
                  onChange={(e) => setPlayerOptions({ hideDetails: e.target.checked })}
                />
                <div>
                  <div className="checkbox-title">Компактный режим плеера</div>
                  <div className="checkbox-desc">Скрывает обложку и название трека для максимальной компактности</div>
                </div>
              </label>
            </div>
          </div>
        </div>
      )}

      {/* Subtab 4: Presets */}
      {subTab === "presets" && (
        <div className="subtab-panel">
          <div className="custom-group">
            <h3 className="custom-group-title">Встроенные темы</h3>
            <div className="presets-grid">
              {BUILTIN_THEMES.map((preset) => (
                <div key={preset.id} className="preset-card">
                  <div className="preset-card-head">
                    <div className="preset-name">{preset.name}</div>
                    <div className="preset-desc">{preset.desc}</div>
                  </div>
                  <div className="preset-palette-row">
                    <span className="preset-dot" style={{ backgroundColor: preset.accentColor }} title="Акцент" />
                    <span className="preset-dot" style={{ backgroundColor: preset.appBgColor }} title="Фон" />
                    <span className="preset-dot" style={{ backgroundColor: preset.sidebarBgColor }} title="Сайдбар" />
                    <span className="preset-dot" style={{ backgroundColor: preset.cardBgColor }} title="Карточки" />
                  </div>
                  <button className="btn-apply-preset" onClick={() => applyPreset(preset)}>
                    Применить тему
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="custom-group">
            <h3 className="custom-group-title">Пользовательские пресеты (Слоты сохранения)</h3>
            <p className="custom-group-subtitle">
              Сохраняйте свои уникальные комбинации цветов и макетов в персональные слоты
            </p>

            <div className="user-slots-grid">
              {[0, 1, 2].map((idx) => {
                const p = userPresets[idx];
                const isSavingThis = savingSlot === idx;

                return (
                  <div key={idx} className={`user-slot-card ${p ? "filled" : "empty"}`}>
                    <div className="slot-number">СЛОТ {idx + 1}</div>

                    {p ? (
                      <>
                        <div className="slot-title">{p.name}</div>
                        <div className="slot-meta">{p.desc}</div>
                        <div className="preset-palette-row" style={{ margin: "8px 0" }}>
                          <span className="preset-dot" style={{ backgroundColor: p.accentColor }} />
                          <span className="preset-dot" style={{ backgroundColor: p.appBgColor }} />
                          <span className="preset-dot" style={{ backgroundColor: p.sidebarBgColor }} />
                          <span className="preset-dot" style={{ backgroundColor: p.cardBgColor }} />
                        </div>
                        <div className="slot-actions">
                          <button className="btn-slot-use" onClick={() => loadFromUserSlot(idx)}>
                            Загрузить
                          </button>
                          <button className="btn-slot-resave" onClick={() => saveToUserSlot(idx)}>
                            Перезаписать
                          </button>
                        </div>
                      </>
                    ) : isSavingThis ? (
                      <div className="slot-saving-form">
                        <input
                          type="text"
                          placeholder="Название пресета..."
                          value={slotNameInput}
                          onChange={(e) => setSlotNameInput(e.target.value)}
                          className="slot-name-input"
                          autoFocus
                        />
                        <div className="slot-form-btn-row">
                          <button
                            className="btn-slot-save-confirm"
                            onClick={() => {
                              saveToUserSlot(idx, slotNameInput);
                              setSavingSlot(null);
                              setSlotNameInput("");
                            }}
                          >
                            Сохранить
                          </button>
                          <button className="btn-slot-cancel" onClick={() => setSavingSlot(null)}>
                            Отмена
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="slot-empty-state">
                        <span className="slot-empty-text">Слот свободен</span>
                        <button
                          className="btn-slot-save-new"
                          onClick={() => {
                            setSavingSlot(idx);
                            setSlotNameInput(`Мой пресет ${idx + 1}`);
                          }}
                        >
                          + Сохранить текущие
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="custom-group reset-group">
            <button className="btn-reset-all" onClick={resetToDefaults}>
              Сбросить кастомизацию к заводским настройкам
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
