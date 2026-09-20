import { useCustomization, ALL_HOME_BLOCKS } from "./CustomizationContext";

const BLOCK_PREVIEWS: Record<
  string,
  {
    title: string;
    desc: string;
    icon: string;
    previewNode: React.ReactNode;
  }
> = {
  wave: {
    title: "Моя волна",
    desc: "Бесконечный поток музыки под ваше настроение и предпочтения",
    icon: "🌊",
    previewNode: (
      <div className="real-preview-wave">
        <div className="preview-wave-orb" />
        <div className="preview-wave-info">
          <div className="preview-wave-title">Моя волна</div>
          <div className="preview-wave-sub">Бесконечный поток музыки</div>
        </div>
        <div className="preview-wave-bars">
          <span style={{ height: "45%" }} />
          <span style={{ height: "85%" }} />
          <span style={{ height: "65%" }} />
          <span style={{ height: "100%" }} />
          <span style={{ height: "55%" }} />
        </div>
      </div>
    ),
  },
  recent: {
    title: "Продолжить прослушивание",
    desc: "Быстрый доступ к недавно прослушанным трекам и альбомам",
    icon: "⏱",
    previewNode: (
      <div className="real-preview-recent">
        <div className="preview-rc-card">
          <div className="preview-rc-art art-1">
            <span className="rc-play-btn">▶</span>
          </div>
          <div className="preview-rc-meta">
            <div className="preview-rc-title">Starboy</div>
            <div className="preview-rc-artist">The Weeknd</div>
          </div>
        </div>
        <div className="preview-rc-card">
          <div className="preview-rc-art art-2">
            <span className="rc-play-btn">▶</span>
          </div>
          <div className="preview-rc-meta">
            <div className="preview-rc-title">Лесник</div>
            <div className="preview-rc-artist">Король и Шут</div>
          </div>
        </div>
      </div>
    ),
  },
  playlists: {
    title: "Ваши плейлисты",
    desc: "Сетка ваших коллекций и плейлистов для быстрого старта",
    icon: "📁",
    previewNode: (
      <div className="real-preview-playlists">
        <div className="preview-pl-card">
          <div className="preview-pl-art pl-1">♫</div>
          <div className="preview-pl-name">Любимые треки</div>
          <div className="preview-pl-count">48 треков</div>
        </div>
        <div className="preview-pl-card">
          <div className="preview-pl-art pl-2">★</div>
          <div className="preview-pl-name">Рок 2000-х</div>
          <div className="preview-pl-count">24 трека</div>
        </div>
      </div>
    ),
  },
  library: {
    title: "Из вашей библиотеки",
    desc: "Список треков из локальной фонотеки и сохраненной музыки",
    icon: "♫",
    previewNode: (
      <div className="real-preview-library">
        <div className="preview-lib-row">
          <div className="preview-lib-num">1</div>
          <div className="preview-lib-art lib-art-1">♫</div>
          <div className="preview-lib-meta">
            <div className="preview-lib-title">Believer</div>
            <div className="preview-lib-artist">Imagine Dragons</div>
          </div>
          <div className="preview-lib-badge yandex">Яндекс</div>
          <div className="preview-lib-time">3:24</div>
        </div>
        <div className="preview-lib-row">
          <div className="preview-lib-num">2</div>
          <div className="preview-lib-art lib-art-2">♫</div>
          <div className="preview-lib-meta">
            <div className="preview-lib-title">In The End</div>
            <div className="preview-lib-artist">Linkin Park</div>
          </div>
          <div className="preview-lib-badge vk">VK</div>
          <div className="preview-lib-time">3:36</div>
        </div>
      </div>
    ),
  },
  header: {
    title: "Приветствие и заголовок",
    desc: "Крупная шапка с приветствием пользователя и статусом",
    icon: "✦",
    previewNode: (
      <div className="real-preview-header">
        <div className="preview-hd-greeting">Добрый день 👋</div>
        <div className="preview-hd-sub">Что послушаем сегодня?</div>
      </div>
    ),
  },
};

export function EditModeBanner() {
  const {
    isEditMode,
    saveEditMode,
    cancelEditMode,
    resetToDefaults,
    config,
    addBlock,
    isAddModalOpen,
    setIsAddModalOpen,
    setSidebarTopVariant,
  } = useCustomization();

  if (!isEditMode) return null;

  const isHorizSidebar = config.sidebar?.position === "top" || config.sidebar?.position === "bottom";
  const topVariant = config.sidebar?.topVariant || "full";

  return (
    <>
      <div className="edit-mode-floating-banner">
        <div className="edit-banner-actions">
          <button
            type="button"
            className="edit-banner-btn add"
            onClick={() => setIsAddModalOpen(true)}
            title="Открыть каталог панелей для добавления на Главную"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Добавить панель
          </button>

          {isHorizSidebar && (
            <button
              type="button"
              className="edit-banner-btn variant-toggle"
              onClick={() => setSidebarTopVariant(topVariant === "compact" ? "full" : "compact")}
              title="Переключить вид меню: компактные иконки по центру или полноразмерное меню с текстом"
            >
              {topVariant === "compact" ? "✦ Меню с надписями" : "❖ Иконки по центру"}
            </button>
          )}

          <button
            type="button"
            className="edit-banner-btn reset"
            onClick={resetToDefaults}
            title="Сбросить все секции и блоки к стандартным настройкам"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
              <path d="M3 3v5h5" />
            </svg>
            Сброс к дефолту
          </button>

          <button
            type="button"
            className="edit-banner-btn save"
            onClick={saveEditMode}
            title="Применить и сохранить изменения"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            Готово
          </button>

          <button
            type="button"
            className="edit-banner-btn cancel"
            onClick={cancelEditMode}
            title="Отменить изменения и вернуться"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
            Отмена
          </button>
        </div>
      </div>

      {isAddModalOpen && (
        <div className="add-block-modal-backdrop" onClick={() => setIsAddModalOpen(false)}>
          <div
            className="add-block-modal-dialog"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="add-block-modal-header">
              <div className="add-modal-title-wrap">
                <span className="add-modal-icon">⊞</span>
                <h3 className="add-block-modal-title">Добавить панель на главную</h3>
              </div>
              <button
                type="button"
                className="add-block-modal-close"
                onClick={() => setIsAddModalOpen(false)}
                title="Закрыть"
              >
                ✕
              </button>
            </div>

            <p className="add-block-modal-sub">
              Выберите панель, чтобы разместить её в секцию на Главной странице. Вы сможете перемещать панели между секциями мышкой и менять их ширину.
            </p>

            <div className="add-block-cards-grid">
              {ALL_HOME_BLOCKS.map((block) => {
                const info = BLOCK_PREVIEWS[block.id] || {
                  title: block.title,
                  desc: "Виджет для Главной страницы",
                  icon: "❖",
                  previewNode: <div className="add-card-mock" />,
                };

                const isAlreadyPresent =
                  config.home.blockOrder.includes(block.id) &&
                  !config.home.hiddenBlocks.includes(block.id);
                const isHidden = config.home.hiddenBlocks.includes(block.id);

                return (
                  <div
                    key={block.id}
                    className={`add-block-card ${isAlreadyPresent ? "already-added" : ""}`}
                  >
                    <div className="add-card-preview-area">
                      {info.previewNode}
                    </div>
                    <div className="add-card-body">
                      <div className="add-card-title-row">
                        <span className="add-card-icon">{info.icon}</span>
                        <span className="add-card-title">{info.title}</span>
                      </div>
                      <p className="add-card-desc">{info.desc}</p>
                    </div>
                    <div className="add-card-footer">
                      {isAlreadyPresent ? (
                        <div className="add-card-status added">
                          <span>✓ Уже на странице</span>
                        </div>
                      ) : isHidden ? (
                        <button
                          type="button"
                          className="add-card-btn restore"
                          onClick={() => {
                            addBlock(block.id);
                            setIsAddModalOpen(false);
                          }}
                        >
                          Показать панель
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="add-card-btn add"
                          onClick={() => {
                            addBlock(block.id);
                            setIsAddModalOpen(false);
                          }}
                        >
                          + Добавить в секцию
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
