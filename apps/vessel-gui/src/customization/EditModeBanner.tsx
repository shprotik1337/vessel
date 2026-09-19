import { useCustomization } from "./CustomizationContext";

export function EditModeBanner() {
  const { isEditMode, saveEditMode, cancelEditMode, openThemeModal, toggleSidebarPosition, config } = useCustomization();

  if (!isEditMode) return null;

  const sidebarPos = config.sidebar?.position === "right" ? "right" : "left";

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

        <button className="edit-banner-btn theme" onClick={openThemeModal} title="Настройки темы, обоев и акцента">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="13.5" cy="6.5" r=".5" fill="currentColor" />
            <circle cx="17.5" cy="10.5" r=".5" fill="currentColor" />
            <circle cx="8.5" cy="7.5" r=".5" fill="currentColor" />
            <circle cx="6.5" cy="12.5" r=".5" fill="currentColor" />
            <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z" />
          </svg>
          Тема и фон
        </button>

        <button
          className="edit-banner-btn side"
          onClick={toggleSidebarPosition}
          title={`Сайдбар: ${sidebarPos === "left" ? "Слева (нажмите для переноса направо)" : "Справа (нажмите для переноса налево)"}`}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M7 16l-4-4m0 0l4-4m-4 4h18m-4 4l4-4m0 0l-4-4" />
          </svg>
          Сайдбар: {sidebarPos === "left" ? "Слева" : "Справа"}
        </button>
      </div>
    </div>
  );
}
