import type { ThemePreset } from "./CustomizationContext";

interface PresetCardProps {
  preset: ThemePreset;
  isActive?: boolean;
  onApply: () => void;
  onPreview: () => void;
  onDelete?: () => void;
}

export function PresetCard({
  preset,
  isActive = false,
  onApply,
  onPreview,
  onDelete,
}: PresetCardProps) {
  return (
    <div className={`theme-preset-card ${isActive ? "active" : ""}`}>
      {/* Visual Cover Preview */}
      <div className="preset-card-cover">
        {preset.wallpaperData ? (
          <img
            src={preset.wallpaperData}
            alt={preset.name}
            className="preset-cover-img"
          />
        ) : (
          <div
            className="preset-cover-gradient"
            style={{
              background: `linear-gradient(135deg, ${preset.sidebarBgColor} 0%, ${preset.cardBgColor} 50%, ${preset.accentColor} 100%)`,
            }}
          >
            <div
              className="preset-swatch-pill"
              style={{ backgroundColor: preset.accentColor }}
            />
          </div>
        )}

        {isActive && <div className="preset-active-badge">✓ Активен</div>}

        {/* Floating Quick Action Buttons on Cover */}
        <div className="preset-cover-overlay">
          <button
            type="button"
            className="preset-overlay-btn btn-preview"
            onClick={(e) => {
              e.stopPropagation();
              onPreview();
            }}
            title="Предпросмотр на Главной"
          >
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
              <circle cx="12" cy="12" r="3" />
            </svg>
            <span>Предпросмотр</span>
          </button>
        </div>
      </div>

      {/* Meta Info */}
      <div className="preset-card-body">
        <div className="preset-card-title-row">
          <span className="preset-card-name" title={preset.name}>
            {preset.name}
          </span>
          <div
            className="preset-accent-dot"
            style={{ backgroundColor: preset.accentColor }}
            title={`Акцентный цвет: ${preset.accentColor}`}
          />
        </div>

        {preset.desc && <div className="preset-card-desc">{preset.desc}</div>}

        {/* Actions Row */}
        <div className="preset-card-actions">
          <button
            type="button"
            className={`btn-apply-preset ${isActive ? "active" : ""}`}
            onClick={onApply}
          >
            {isActive ? "Применено" : "Применить"}
          </button>

          {onDelete && (
            <button
              type="button"
              className="btn-delete-preset"
              onClick={(e) => {
                e.stopPropagation();
                onDelete();
              }}
              title="Удалить этот пресет"
            >
              <svg
                width="13"
                height="13"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
