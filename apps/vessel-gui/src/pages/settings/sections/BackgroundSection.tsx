import { useState, useRef } from "react";
import { useApp } from "../../../store";
import { useCustomization, hexToRgba } from "../../../customization";
import {
  IconSparkles,
  IconCustomization,
  IconSolid,
  IconDisc,
  IconPlay,
  IconBackground,
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
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const processImageFile = async (file: File): Promise<{ url: string; name: string } | null> => {
    if (!file || !file.type.startsWith("image/")) {
      return null;
    }

    const name = file.name || `Изображение ${Date.now()}`;

    // Для GIF-анимаций сохраняем оригинальный DataURL без canvas, чтобы не терять кадры анимации
    if (file.type === "image/gif") {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(new Error("Failed to read GIF"));
        reader.readAsDataURL(file);
      });
      return { url: dataUrl, name };
    }

    // Для статичных изображений: если разрешение слишком большое (>2560px), масштабируем для экономии памяти
    return new Promise<{ url: string; name: string }>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          let { width, height } = img;
          const maxDim = 2560;
          if (width > maxDim || height > maxDim) {
            const ratio = Math.min(maxDim / width, maxDim / height);
            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            resolve({ url: reader.result as string, name });
            return;
          }
          ctx.drawImage(img, 0, 0, width, height);
          try {
            const webp = canvas.toDataURL("image/webp", 0.88);
            if (webp.startsWith("data:image/webp")) {
              resolve({ url: webp, name });
              return;
            }
          } catch {}
          try {
            const jpeg = canvas.toDataURL("image/jpeg", 0.88);
            resolve({ url: jpeg, name });
          } catch {
            resolve({ url: reader.result as string, name });
          }
        };
        img.onerror = () => resolve({ url: reader.result as string, name });
        img.src = reader.result as string;
      };
      reader.onerror = () => reject(new Error("Failed to read file"));
      reader.readAsDataURL(file);
    });
  };

  const handleFilesSelect = async (files: FileList | File[]) => {
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) {
      showToast(lang === "ru" ? "Пожалуйста, выберите файл(ы) изображения" : "Please select image file(s)", true);
      return;
    }

    let addedCount = 0;
    for (const file of list) {
      try {
        const item = await processImageFile(file);
        if (item) {
          addToImageLibrary(item);
          addedCount++;
        }
      } catch (err) {
        console.error("Failed to add image from file:", file.name, err);
      }
    }

    if (addedCount > 0) {
      showToast(
        lang === "ru"
          ? (addedCount === 1 ? "Изображение добавлено в библиотеку!" : `Добавлено изображений: ${addedCount}`)
          : (addedCount === 1 ? "Image added to library!" : `Added images: ${addedCount}`)
      );
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isDragOver) setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      void handleFilesSelect(e.dataTransfer.files);
    }
  };

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
      <div
        className="sett-card"
        style={{
          marginBottom: 20,
          border: isDragOver ? "1.5px dashed var(--accent, #3b82f6)" : "1px solid var(--border)",
          transition: "border-color 0.15s ease",
        }}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
          <div>
            <div className="sett-card-title">{lang === "ru" ? "Библиотека изображений" : "Image Library"}</div>
            <div className="sett-card-desc">
              {lang === "ru"
                ? "Сохранённые обложки и фоны для быстрого переключения (можно перетащить файл сюда)"
                : "Saved artwork and backgrounds for fast switching (or drag and drop files here)"}
            </div>
          </div>
        </div>

        {/* Скрытый инпут для выбора файлов с диска */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          style={{ display: "none" }}
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              void handleFilesSelect(e.target.files);
            }
            e.target.value = "";
          }}
        />

        {/* Input для добавления по URL + кнопка выбора файла с ПК */}
        <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
          <div style={{ position: "relative", flex: 1, display: "flex", alignItems: "center" }}>
            <input
              type="text"
              className="sett-token-input"
              style={{ width: "100%", paddingRight: 38 }}
              placeholder={
                lang === "ru"
                  ? "Вставьте прямую ссылку на изображение или выберите файл с ПК..."
                  : "Paste direct image URL or choose file from PC..."
              }
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
              onClick={() => fileInputRef.current?.click()}
              title={lang === "ru" ? "Выбрать изображение с компьютера" : "Choose image from computer"}
              style={{
                position: "absolute",
                right: 6,
                top: "50%",
                transform: "translateY(-50%)",
                background: "transparent",
                border: "none",
                color: "var(--text3)",
                cursor: "pointer",
                padding: 6,
                borderRadius: 6,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transition: "color 0.15s ease, background 0.15s ease",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--text)";
                e.currentTarget.style.background = "var(--elev)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--text3)";
                e.currentTarget.style.background = "transparent";
              }}
            >
              <IconBackground size={16} />
            </button>
          </div>

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

          <button
            type="button"
            className="sett-token-action-btn"
            onClick={() => fileInputRef.current?.click()}
            title={lang === "ru" ? "Выбрать изображения с компьютера" : "Choose images from computer"}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              whiteSpace: "nowrap",
              cursor: "pointer",
            }}
          >
            <IconBackground size={15} />
            <span>{lang === "ru" ? "С компьютера" : "From PC"}</span>
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
              ? "Регулировка стиля и плотности фона под всеми строками треков"
              : "Adjust row style and background density for track rows"}
          </div>
        </div>

        {/* Normal Track Row Preview */}
        {(() => {
          const rowStyle = config.theme?.trackRowStyle ?? ((config.theme?.trackRowOpacity ?? 0) > 0 ? "glass" : "none");
          const isRowNone = rowStyle === "none";
          const rowOpacity = isRowNone ? 0 : (config.theme?.trackRowOpacity ?? 0.08);

          return (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                height: 52,
                padding: "0 16px",
                borderRadius: 8,
                background: !isRowNone && rowOpacity > 0
                  ? hexToRgba(config.theme?.cardBgColor || "#000000", rowOpacity * 0.95)
                  : "transparent",
                border: !isRowNone && rowOpacity > 0
                  ? `1px solid rgba(255, 255, 255, ${Math.max(0.04, rowOpacity * 0.08)})`
                  : "none",
                backdropFilter: !isRowNone && rowOpacity > 0 ? "blur(12px)" : "none",
                WebkitBackdropFilter: !isRowNone && rowOpacity > 0 ? "blur(12px)" : "none",
                boxShadow: !isRowNone && rowOpacity > 0.1 ? "0 4px 16px rgba(0,0,0,0.2)" : "none",
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
                  Travis Scott — {lang === "ru" ? (isRowNone ? "Без подложки (нулевая обводка)" : "Обычная строка трека") : "Normal track row"}
                </div>
              </div>
              <span style={{ fontSize: 11.5, color: "var(--text3)", fontVariantNumeric: "tabular-nums" }}>
                3:11
              </span>
            </div>
          );
        })()}

        {/* Buttons: Без подложки vs С подложкой */}
        <div style={{ paddingTop: 10, borderTop: "1px solid rgba(255, 255, 255, 0.06)" }}>
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: "var(--text)", marginBottom: 8 }}>
              {lang === "ru" ? "Стиль подложки" : "Background Style"}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 8 }}>
              {[
                {
                  id: "none",
                  label: lang === "ru" ? "Без подложки" : "No Background",
                  desc: lang === "ru" ? "Чистые строки без фона и без обводки (нулевая рамка)" : "Clean rows without background or border outline",
                },
                {
                  id: "glass",
                  label: lang === "ru" ? "С подложкой" : "With Background",
                  desc: lang === "ru" ? "Полупрозрачное дымчатое стекло с регулировкой" : "Translucent glass plate with adjustable opacity",
                },
              ].map((opt) => {
                const currentStyle = config.theme?.trackRowStyle ?? ((config.theme?.trackRowOpacity ?? 0) > 0 ? "glass" : "none");
                const isSel = currentStyle === opt.id;

                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      if (opt.id === "none") {
                        updateThemeDirectly({ trackRowStyle: "none", trackRowOpacity: 0 });
                      } else {
                        const nextOpacity = (config.theme?.trackRowOpacity ?? 0) > 0 ? config.theme!.trackRowOpacity! : 0.08;
                        updateThemeDirectly({ trackRowStyle: "glass", trackRowOpacity: nextOpacity });
                      }
                    }}
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
                        {opt.label}
                      </span>
                      {isSel && (
                        <span style={{ marginLeft: "auto", fontSize: 11, color: "var(--accent)", fontWeight: 700 }}>
                          ✓
                        </span>
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: "var(--text3)", lineHeight: 1.3 }}>
                      {opt.desc}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Density slider only when "С подложкой" is selected */}
          {(config.theme?.trackRowStyle ?? ((config.theme?.trackRowOpacity ?? 0) > 0 ? "glass" : "none")) === "glass" && (
            <div>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                <span className="sett-card-title">{lang === "ru" ? "Плотность фона обычной строки" : "Normal Row Background Density"}</span>
                <span style={{ fontWeight: 700, color: "var(--accent)", minWidth: 36, textAlign: "right" }}>
                  {Math.round((config.theme?.trackRowOpacity ?? 0.08) * 100)}%
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="100"
                value={Math.round((config.theme?.trackRowOpacity ?? 0.08) * 100)}
                onChange={(e) => updateThemeDirectly({ trackRowOpacity: Number(e.target.value) / 100, trackRowStyle: "glass" })}
                className="sett-range-input sett-slider-input"
                style={{ width: "100%", accentColor: "var(--accent)" }}
              />
            </div>
          )}
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
