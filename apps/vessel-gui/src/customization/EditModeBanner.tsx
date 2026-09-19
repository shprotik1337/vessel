import { useCustomization } from "./CustomizationContext";
import { useApp } from "../store";

export function EditModeBanner() {
  const { isEditMode, saveEditMode, cancelEditMode, toggleSidebarPosition, config } = useCustomization();
  const { navigateTo } = useApp();

  if (!isEditMode) return null;

  const sidebarPos =
    config.sidebar?.position === "right"
      ? "Справа"
      : config.sidebar?.position === "top"
      ? "Сверху"
      : "Слева";

  return (
    <div className="edit-mode-floating-banner">
      <div className="edit-banner-header">
        <span className="edit-banner-dot" />
        <span className="edit-banner-title">Режим кастомизации: ВКЛ</span>
      </div>

      <div className="edit-banner-actions">
        <button className="edit-banner-btn save" onClick={saveEditMode}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Готово
        </button>

        <button className="edit-banner-btn cancel" onClick={cancelEditMode}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          Отмена
        </button>

        <div className="edit-banner-divider" />

        <button
          className="edit-banner-btn theme"
          onClick={() => {
            saveEditMode();
            navigateTo("settings");
          }}
          title="Открыть раздел кастомизации в настройках"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
          Палитра и темы
        </button>

        <button
          className="edit-banner-btn side"
          onClick={toggleSidebarPosition}
          title="Сменить положение меню (Слева / Справа / Сверху)"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 16l-4-4m0 0l4-4m-4 4h18m-4 4l4-4m0 0l-4-4" />
          </svg>
          Сайдбар: {sidebarPos}
        </button>
      </div>
    </div>
  );
}
