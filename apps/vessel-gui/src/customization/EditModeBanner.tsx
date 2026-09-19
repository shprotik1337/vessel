import { useCustomization } from "./CustomizationContext";

export function EditModeBanner() {
  const { isEditMode, saveEditMode, cancelEditMode } = useCustomization();

  if (!isEditMode) return null;

  return (
    <div className="edit-mode-floating-banner">
      <div className="edit-banner-actions">
        <button className="edit-banner-btn save" onClick={saveEditMode} title="Применить и сохранить изменения">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="20 6 9 17 4 12" />
          </svg>
          Готово
        </button>

        <button className="edit-banner-btn cancel" onClick={cancelEditMode} title="Отменить изменения и вернуться">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
          Отмена
        </button>
      </div>
    </div>
  );
}
