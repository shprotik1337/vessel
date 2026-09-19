import { useState } from "react";
import { useCustomization } from "./CustomizationContext";
import * as api from "../api/commands";

const ACCENT_PRESETS = [
  { name: "Синий", color: "#3b82f6" },
  { name: "Фиолетовый", color: "#a855f7" },
  { name: "Изумрудный", color: "#10b981" },
  { name: "Розовый", color: "#f43f5e" },
  { name: "Янтарный", color: "#f59e0b" },
  { name: "Циан", color: "#06b6d4" },
  { name: "Красный", color: "#ef4444" },
];

export function ThemeSettingsModal() {
  const {
    isThemeModalOpen,
    closeThemeModal,
    config,
    updateThemeDirectly,
  } = useCustomization();

  const [loadingFile, setLoadingFile] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isThemeModalOpen) return null;

  const theme = config.theme || {
    accentColor: "#3b82f6",
    wallpaperData: null,
    wallpaperBlur: 14,
    wallpaperDim: 45,
    glassMode: true,
    glassOpacity: 0.72,
  };

  const handlePickWallpaper = async () => {
    try {
      setLoadingFile(true);
      setErrorMsg(null);
      const filePath = await api.pickFile(["png", "jpg", "jpeg", "webp", "gif", "bmp"]);
      if (!filePath) {
        setLoadingFile(false);
        return;
      }
      const dataUrl = await api.loadImageAsDataUrl(filePath);
      updateThemeDirectly((prev) => ({
        ...prev,
        wallpaperData: dataUrl,
      }));
    } catch (err) {
      console.error("Error loading wallpaper:", err);
      setErrorMsg(String(err));
    } finally {
      setLoadingFile(false);
    }
  };

  const handleRemoveWallpaper = () => {
    updateThemeDirectly((prev) => ({
      ...prev,
      wallpaperData: null,
    }));
  };

  return (
    <div className="modal-overlay theme-modal-overlay" onClick={closeThemeModal}>
      <div className="modal theme-settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 8 }}>
              <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
              <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
              <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
              <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
              <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
            </svg>
            Тема и оформление
          </div>
          <button className="modal-close-btn" onClick={closeThemeModal}>✕</button>
        </div>

        <div className="modal-body">
          {errorMsg && <div className="theme-error-banner">{errorMsg}</div>}

          <div className="theme-section">
            <div className="theme-section-title">Фоновое изображение (Обои)</div>
            <div className="wallpaper-preview-box">
              {theme.wallpaperData ? (
                <div className="wallpaper-preview" style={{ backgroundImage: `url(${theme.wallpaperData})` }}>
                  <div className="wallpaper-preview-overlay" style={{ backdropFilter: `blur(${theme.wallpaperBlur / 4}px)`, opacity: theme.wallpaperDim / 100 }} />
                </div>
              ) : (
                <div className="wallpaper-preview placeholder">
                  <span>Фон не выбран (используется стандартная темная тема)</span>
                </div>
              )}

              <div className="wallpaper-actions">
                <button className="theme-action-btn primary" onClick={handlePickWallpaper} disabled={loadingFile}>
                  {loadingFile ? "Загрузка..." : "📁 Выбрать картинку с ПК"}
                </button>
                {theme.wallpaperData && (
                  <button className="theme-action-btn danger" onClick={handleRemoveWallpaper}>
                    Удалить фон
                  </button>
                )}
              </div>
            </div>

            {theme.wallpaperData && (
              <div className="theme-controls-group">
                <div className="theme-control-row">
                  <div className="control-label-row">
                    <span>Размытие фона (Blur):</span>
                    <span className="control-val">{theme.wallpaperBlur}px</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="40"
                    step="1"
                    value={theme.wallpaperBlur}
                    onChange={(e) => updateThemeDirectly((prev) => ({ ...prev, wallpaperBlur: parseInt(e.target.value, 10) }))}
                    className="theme-slider"
                  />
                </div>

                <div className="theme-control-row">
                  <div className="control-label-row">
                    <span>Затемнение (Dimming):</span>
                    <span className="control-val">{theme.wallpaperDim}%</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="90"
                    step="1"
                    value={theme.wallpaperDim}
                    onChange={(e) => updateThemeDirectly((prev) => ({ ...prev, wallpaperDim: parseInt(e.target.value, 10) }))}
                    className="theme-slider"
                  />
                </div>

                <div className="theme-control-row checkbox-row">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={theme.glassMode}
                      onChange={(e) => updateThemeDirectly((prev) => ({ ...prev, glassMode: e.target.checked }))}
                    />
                    <span>Эффект матового стекла (Glassmorphism для панелей)</span>
                  </label>
                </div>

                {theme.glassMode && (
                  <div className="theme-control-row">
                    <div className="control-label-row">
                      <span>Прозрачность панелей:</span>
                      <span className="control-val">{Math.round((1 - theme.glassOpacity) * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.2"
                      max="0.9"
                      step="0.05"
                      value={theme.glassOpacity}
                      onChange={(e) => updateThemeDirectly((prev) => ({ ...prev, glassOpacity: parseFloat(e.target.value) }))}
                      className="theme-slider"
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="theme-section">
            <div className="theme-section-title">Акцентный цвет</div>
            <div className="color-presets-row">
              {ACCENT_PRESETS.map((preset) => (
                <button
                  key={preset.color}
                  className={`color-preset-btn ${theme.accentColor === preset.color ? "active" : ""}`}
                  style={{ backgroundColor: preset.color }}
                  title={preset.name}
                  onClick={() => updateThemeDirectly((prev) => ({ ...prev, accentColor: preset.color }))}
                >
                  {theme.accentColor === preset.color && <span>✓</span>}
                </button>
              ))}

              <div className="custom-color-picker-wrap" title="Пользовательский цвет">
                <input
                  type="color"
                  value={theme.accentColor}
                  onChange={(e) => updateThemeDirectly((prev) => ({ ...prev, accentColor: e.target.value }))}
                  className="custom-color-input"
                />
              </div>
            </div>
          </div>
        </div>

        <div className="modal-footer">
          <button className="theme-action-btn primary" onClick={closeThemeModal}>
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
