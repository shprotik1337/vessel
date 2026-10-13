import { useEffect } from "react";
import { UpdateInfo, openExternal } from "../services/updater";

interface UpdateModalProps {
  isOpen: boolean;
  updateInfo: UpdateInfo | null;
  onClose: () => void;
}

const CLOSE_ICON = (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" />
    <line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

const GITHUB_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
  </svg>
);

const DOWNLOAD_ICON = (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

/**
 * Простой и безопасный рендерер для Markdown заметок релиза
 */
function renderMarkdownNotes(rawNotes: string) {
  if (!rawNotes || !rawNotes.trim()) {
    return <p className="update-notes-empty">Описание изменений пока не добавлено.</p>;
  }

  const lines = rawNotes.split(/\r?\n/);
  return lines.map((line, idx) => {
    const trimmed = line.trim();
    if (!trimmed) {
      return <div key={idx} className="update-notes-space" />;
    }

    if (trimmed.startsWith("### ")) {
      return (
        <h4 key={idx} className="update-notes-h3">
          {trimmed.slice(4)}
        </h4>
      );
    }
    if (trimmed.startsWith("## ")) {
      return (
        <h3 key={idx} className="update-notes-h2">
          {trimmed.slice(3)}
        </h3>
      );
    }
    if (trimmed.startsWith("# ")) {
      return (
        <h2 key={idx} className="update-notes-h1">
          {trimmed.slice(2)}
        </h2>
      );
    }

    if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
      const text = trimmed.slice(2);
      return (
        <div key={idx} className="update-notes-li">
          <span className="update-notes-bullet">•</span>
          <span>{renderFormattedText(text)}</span>
        </div>
      );
    }

    return (
      <p key={idx} className="update-notes-p">
        {renderFormattedText(trimmed)}
      </p>
    );
  });
}

function renderFormattedText(text: string) {
  // Разделение по **жирному тексту**
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

export function UpdateModal({ isOpen, updateInfo, onClose }: UpdateModalProps) {
  // Закрытие по Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !updateInfo) return null;

  const handleDownload = () => {
    if (updateInfo.downloadUrl) {
      void openExternal(updateInfo.downloadUrl);
    } else {
      void openExternal(updateInfo.releaseUrl);
    }
  };

  const handleOpenReleasePage = () => {
    void openExternal(updateInfo.releaseUrl);
  };

  return (
    <div className="update-modal-backdrop" onClick={onClose}>
      <div className="update-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Кнопка закрытия */}
        <button
          className="update-modal-close"
          onClick={onClose}
          title="Закрыть"
          aria-label="Закрыть"
        >
          {CLOSE_ICON}
        </button>

        {/* Верхний блок заголовка */}
        <div className="update-modal-header">
          <div className="update-modal-title-row">
            <span className="update-modal-app-name">Vessel {updateInfo.latestVersion}</span>
            <span className="update-modal-old-version">(v{updateInfo.currentVersion})</span>
          </div>
          <p className="update-modal-subtitle">
            Доступна новая версия Vessel с улучшениями и исправлениями.
          </p>
        </div>

        {/* Блок «ЧТО НОВОГО» */}
        <div className="update-changelog-box">
          <div className="update-changelog-header">ЧТО НОВОГО</div>
          <div className="update-changelog-content">
            {renderMarkdownNotes(updateInfo.releaseNotes)}
          </div>
        </div>

        {/* Нижний ряд кнопок */}
        <div className="update-modal-actions">
          <button className="update-modal-btn-primary" onClick={handleDownload}>
            {DOWNLOAD_ICON}
            <span>Обновить</span>
          </button>

          <button
            className="update-modal-btn-secondary"
            onClick={handleOpenReleasePage}
            title="Открыть страницу релиза на GitHub"
          >
            {GITHUB_ICON}
            <span>Подробнее на GitHub</span>
          </button>
        </div>
      </div>
    </div>
  );
}
