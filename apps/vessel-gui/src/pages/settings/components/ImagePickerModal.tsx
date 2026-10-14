import type { ImageLibraryItem } from "../../../customization";

interface ImagePickerModalProps {
  pickerTarget: "trackArt" | "wallpaper" | null;
  onClose: () => void;
  imageLibrary: ImageLibraryItem[];
  onSelectTrackArt: (url: string) => void;
  onSelectWallpaper: (url: string) => void;
}

export function ImagePickerModal({
  pickerTarget,
  onClose,
  imageLibrary,
  onSelectTrackArt,
  onSelectWallpaper,
}: ImagePickerModalProps) {
  if (pickerTarget === null) return null;

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
            {pickerTarget === "trackArt" ? "Выбрать обложку трека" : "Выбрать фон приложения"}
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
              В библиотеке пока нет сохранённых картинок. Сначала добавьте их в блоке «Библиотека изображений».
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

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <button
            type="button"
            className="sett-token-action-btn"
            onClick={onClose}
          >
            Закрыть
          </button>
        </div>
      </div>
    </div>
  );
}
