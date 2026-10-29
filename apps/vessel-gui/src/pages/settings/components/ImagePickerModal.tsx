import { useRef } from "react";
import type { ImageLibraryItem } from "../../../customization";
import { IconBackground } from "../../../components/Icons";

interface ImagePickerModalProps {
  pickerTarget: "trackArt" | "wallpaper" | null;
  onClose: () => void;
  imageLibrary: ImageLibraryItem[];
  onSelectTrackArt: (url: string) => void;
  onSelectWallpaper: (url: string) => void;
  onAddToLibrary?: (item: { url: string; name: string }) => void;
  lang?: string;
}

export function ImagePickerModal({
  pickerTarget,
  onClose,
  imageLibrary,
  onSelectTrackArt,
  onSelectWallpaper,
  onAddToLibrary,
  lang = "ru",
}: ImagePickerModalProps) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  if (pickerTarget === null) return null;

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) return;

    const name = file.name || `Изображение ${Date.now()}`;

    try {
      let dataUrl: string;

      if (file.type === "image/gif") {
        dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = () => reject(new Error("Failed to read GIF"));
          reader.readAsDataURL(file);
        });
      } else {
        dataUrl = await new Promise<string>((resolve, reject) => {
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
                resolve(reader.result as string);
                return;
              }
              ctx.drawImage(img, 0, 0, width, height);
              try {
                const webp = canvas.toDataURL("image/webp", 0.88);
                if (webp.startsWith("data:image/webp")) {
                  resolve(webp);
                  return;
                }
              } catch {}
              try {
                resolve(canvas.toDataURL("image/jpeg", 0.88));
              } catch {
                resolve(reader.result as string);
              }
            };
            img.onerror = () => resolve(reader.result as string);
            img.src = reader.result as string;
          };
          reader.onerror = () => reject(new Error("Failed to read file"));
          reader.readAsDataURL(file);
        });
      }

      onAddToLibrary?.({ url: dataUrl, name });

      if (pickerTarget === "trackArt") {
        onSelectTrackArt(dataUrl);
      } else {
        onSelectWallpaper(dataUrl);
      }
      onClose();
    } catch (err) {
      console.error("Failed to process picked image file:", err);
    } finally {
      e.target.value = "";
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0, 0, 0, 0.75)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 20,
      }}
      onClick={onClose}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
      <div
        style={{
          width: "100%",
          maxWidth: 520,
          maxHeight: "80vh",
          background: "var(--card-bg)",
          border: "1px solid var(--border)",
          borderRadius: 14,
          padding: 20,
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 24px 64px rgba(0, 0, 0, 0.8)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: "var(--text)" }}>
            {pickerTarget === "trackArt" ? (lang === "ru" ? "Выбрать обложку трека" : "Choose track artwork") : (lang === "ru" ? "Выбрать фон приложения" : "Choose application background")}
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text3)",
              cursor: "pointer",
              padding: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        <div style={{ flex: 1, overflowY: "auto", minHeight: 180, marginBottom: 16 }}>
          {imageLibrary.length === 0 ? (
            <div style={{ textAlign: "center", color: "var(--text3)", padding: "40px 10px", fontSize: 13 }}>
              {lang === "ru"
                ? "В библиотеке пока нет сохранённых картинок. Можно загрузить с компьютера кнопкой ниже."
                : "No saved images in the library. You can upload from computer using the button below."}
            </div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: 10 }}>
              {imageLibrary.map((item) => (
                <div
                  key={item.id}
                  onClick={() => {
                    if (pickerTarget === "trackArt") {
                      onSelectTrackArt(item.url);
                    } else {
                      onSelectWallpaper(item.url);
                    }
                    onClose();
                  }}
                  style={{
                    borderRadius: 8,
                    overflow: "hidden",
                    border: "1px solid var(--border)",
                    background: "var(--elev)",
                    cursor: "pointer",
                    transition: "transform 0.15s ease, border-color 0.15s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.borderColor = "var(--accent)";
                    e.currentTarget.style.transform = "scale(1.02)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = "var(--border)";
                    e.currentTarget.style.transform = "scale(1)";
                  }}
                >
                  <div style={{ height: 80, overflow: "hidden" }}>
                    <img src={item.url} alt={item.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                  </div>
                  <div style={{ padding: "4px 6px", fontSize: 11, color: "var(--text)", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                    {item.name}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <button
            type="button"
            className="sett-token-action-btn"
            onClick={() => fileInputRef.current?.click()}
            style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}
            title={lang === "ru" ? "Выбрать файл изображения с компьютера" : "Choose image file from computer"}
          >
            <IconBackground size={15} />
            <span>{lang === "ru" ? "С компьютера" : "From computer"}</span>
          </button>
          <button
            type="button"
            className="sett-token-action-btn"
            onClick={onClose}
          >
            {lang === "ru" ? "Закрыть" : "Close"}
          </button>
        </div>
      </div>
    </div>
  );
}
