import { useApp } from "../../../store";
import { useCustomization, PresetCard } from "../../../customization";

export function CustomizationSection() {
  const { lang, showToast, navigateTo } = useApp();
  const {
    config,
    userPresets,
    saveToUserSlot,
    applyPreset,
    startPreview,
    deleteUserSlot,
  } = useCustomization();

  return (
    <div>
      <div className="sett-page-header">
        <h1 className="sett-page-title">
          {lang === "ru" ? "Кастомизация" : "Customization"}
        </h1>
        <p className="sett-page-sub">
          {lang === "ru"
            ? "Пресеты оформления и внешний вид приложения"
            : "Style presets and application appearance"}
        </p>
      </div>

      <div className="sett-section-title">
        {lang === "ru" ? "ПОЛЬЗОВАТЕЛЬСКИЕ ПРЕСЕТЫ" : "USER PRESETS"}
      </div>
      <div className="sett-presets-grid">
        {userPresets.map((preset, slotIdx) => {
          if (!preset) {
            return (
              <div
                key={`empty-slot-${slotIdx}`}
                className="sett-preset-card"
                style={{
                  height: 180,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  border: "1px dashed var(--border2)",
                  background: "transparent",
                  cursor: "pointer",
                }}
                onClick={() => {
                  saveToUserSlot(slotIdx);
                  showToast(lang === "ru" ? `Слот ${slotIdx + 1} сохранён!` : `Slot ${slotIdx + 1} saved!`);
                }}
              >
                <div style={{ textAlign: "center", color: "var(--text3)" }}>
                  <div style={{ fontSize: 24, marginBottom: 4 }}>+</div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>
                    {lang === "ru" ? "Сохранить текущую тему" : "Save Current Theme"}
                  </div>
                  <div style={{ fontSize: 11, marginTop: 2 }}>
                    {lang === "ru" ? `Слот ${slotIdx + 1}` : `Slot ${slotIdx + 1}`}
                  </div>
                </div>
              </div>
            );
          }

          return (
            <PresetCard
              key={preset.id}
              preset={preset}
              isActive={config.theme?.accentColor === preset.accentColor}
              onApply={() => {
                applyPreset(preset);
                showToast(lang === "ru" ? `Применен пресет ${preset.name}` : `Preset ${preset.name} applied`);
              }}
              onPreview={() => {
                startPreview(preset);
                navigateTo("home");
              }}
              onDelete={() => {
                deleteUserSlot(slotIdx);
                showToast(lang === "ru" ? "Пресет удален" : "Preset deleted");
              }}
            />
          );
        })}
      </div>
    </div>
  );
}
