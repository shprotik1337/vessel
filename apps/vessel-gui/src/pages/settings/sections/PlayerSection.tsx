import { useApp } from "../../../store";
import { useCustomization } from "../../../customization";
import {
  IconPlayer,
  IconSparkles,
  IconBackground,
  IconInterface,
  IconDisc,
  IconLayoutBottom,
  IconLayoutTop,
  IconLayoutLeft,
  IconLayoutRight,
  IconShapeCapsule,
  IconShapeRect,
  IconWaveStream,
} from "../../../components/Icons";

export function PlayerSection() {
  const { lang } = useApp();
  const {
    config,
    setPlayerPosition,
    setPlayerStyle,
    setQueuePosition,
    setShowMiniPlayer,
    setMiniPlayerBg,
    setMiniPlayerShape,
    setPlayerOptions,
    setFullscreenLyricsPosition,
  } = useCustomization();

  return (
    <div>
      <div className="sett-page-header">
        <h1 className="sett-page-title">
          {lang === "ru" ? "Настройки плеера" : "Player Settings"}
        </h1>
        <p className="sett-page-sub">
          {lang === "ru"
            ? "Расположение, стиль, оформление мини-плеера и очередь треков"
            : "Layout, style, mini-player appearance and track queue"}
        </p>
      </div>

      <div className="sett-section-title">
        {lang === "ru" ? "ПОЛОЖЕНИЕ ПЛЕЕРА" : "PLAYER POSITION"}
      </div>
      <div className="sett-card">
        <div className="sett-card-row" style={{ alignItems: "center" }}>
          <div className="sett-card-info">
            <div className="sett-card-title">
              {lang === "ru" ? "Положение панели плеера" : "Player Bar Position"}
            </div>
            <div className="sett-card-desc">
              {lang === "ru" ? "Выберите позицию плеера на экране" : "Select player position on screen"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {[
              { id: "bottom", icon: <IconLayoutBottom size={16} />, label: lang === "ru" ? "Снизу" : "Bottom" },
              { id: "top", icon: <IconLayoutTop size={16} />, label: lang === "ru" ? "Сверху" : "Top" },
              { id: "left", icon: <IconLayoutLeft size={16} />, label: lang === "ru" ? "Слева" : "Left" },
              { id: "right", icon: <IconLayoutRight size={16} />, label: lang === "ru" ? "Справа" : "Right" },
            ].map((pos) => {
              const isSel = (config.player?.position || "bottom") === pos.id;
              return (
                <button
                  key={pos.id}
                  type="button"
                  onClick={() => setPlayerPosition(pos.id as any)}
                  title={pos.label}
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: "50%",
                    border: isSel ? "none" : "1px solid var(--border2)",
                    background: isSel ? "var(--accent, #e11d48)" : "var(--elev, rgba(255,255,255,0.04))",
                    color: isSel ? "var(--accent-contrast-text, #fff)" : "var(--text3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                  }}
                >
                  {pos.icon}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="sett-section-title">
        {lang === "ru" ? "СТИЛЬ ПЛЕЕРА" : "PLAYER STYLE"}
      </div>
      <div className="sett-card">
        <div className="sett-card-info">
          <div className="sett-card-title">
            {lang === "ru" ? "Тип отображения" : "Display Type"}
          </div>
          <div className="sett-card-desc">
            {lang === "ru" ? "Прикрепленная к краю панель или плавающий островок" : "Docked to edge panel or floating island"}
          </div>
        </div>
        <div className="sett-segmented-group">
          <button
            type="button"
            className={`sett-segmented-btn ${config.player?.style === "floating" || !config.player?.style ? "active" : ""}`}
            onClick={() => setPlayerStyle("floating")}
          >
            <span className="sett-segmented-btn-icon"><IconSparkles size={15} /></span>
            <span className="sett-segmented-btn-label">
              {lang === "ru" ? "Плавающий остров" : "Floating Island"}
            </span>
          </button>
          <button
            type="button"
            className={`sett-segmented-btn ${config.player?.style === "dock" ? "active" : ""}`}
            onClick={() => setPlayerStyle("dock")}
          >
            <span className="sett-segmented-btn-icon"><IconPlayer size={15} /></span>
            <span className="sett-segmented-btn-label">
              {lang === "ru" ? "Прикрепленный (Док)" : "Docked"}
            </span>
          </button>
          <button
            type="button"
            className={`sett-segmented-btn ${config.player?.style === "progress_fill" ? "active" : ""}`}
            onClick={() => setPlayerStyle("progress_fill")}
          >
            <span className="sett-segmented-btn-icon"><IconWaveStream size={15} /></span>
            <span className="sett-segmented-btn-label">
              {lang === "ru" ? "Заполнение прогрессом" : "Progress Fill"}
            </span>
          </button>
        </div>
      </div>

      <div className="sett-section-title">
        {lang === "ru" ? "ОЧЕРЕДЬ ВОСПРОИЗВЕДЕНИЯ" : "PLAYBACK QUEUE"}
      </div>
      <div className="sett-card">
        <div className="sett-card-info">
          <div className="sett-card-title">
            {lang === "ru" ? "Положение панели очереди" : "Queue Drawer Position"}
          </div>
          <div className="sett-card-desc">
            {lang === "ru"
              ? "Выберите, с какой стороны экрана выдвигается панель следующих треков"
              : "Choose which side of the screen the queue drawer slides out from"}
          </div>
        </div>
        <div className="sett-segmented-group">
          <button
            type="button"
            className={`sett-segmented-btn ${config.player?.queuePosition === "bottom" ? "active" : ""}`}
            onClick={() => setQueuePosition("bottom")}
          >
            <span className="sett-segmented-btn-icon"><IconLayoutBottom size={15} /></span>
            <span className="sett-segmented-btn-label">{lang === "ru" ? "Снизу" : "Bottom"}</span>
          </button>
          <button
            type="button"
            className={`sett-segmented-btn ${config.player?.queuePosition === "left" ? "active" : ""}`}
            onClick={() => setQueuePosition("left")}
          >
            <span className="sett-segmented-btn-icon"><IconLayoutLeft size={15} /></span>
            <span className="sett-segmented-btn-label">{lang === "ru" ? "Слева" : "Left"}</span>
          </button>
          <button
            type="button"
            className={`sett-segmented-btn ${config.player?.queuePosition === "right" || !config.player?.queuePosition ? "active" : ""}`}
            onClick={() => setQueuePosition("right")}
          >
            <span className="sett-segmented-btn-icon"><IconLayoutRight size={15} /></span>
            <span className="sett-segmented-btn-label">{lang === "ru" ? "Справа" : "Right"}</span>
          </button>
        </div>
      </div>

      <div className="sett-section-title">
        {lang === "ru" ? "МИНИ-ПЛЕЕР" : "MINI-PLAYER"}
      </div>
      <div className="sett-card">
        <div className="sett-card-row">
          <div className="sett-card-info">
            <div className="sett-card-title">
              {lang === "ru" ? "Отображать мини-плеер" : "Show Mini-Player"}
            </div>
            <div className="sett-card-desc">
              {lang === "ru"
                ? "Показывать компактный виджет мини-плеера при сворачивании главного окна"
                : "Show compact mini-player widget when main window is minimized"}
            </div>
          </div>
          <label className="sett-switch">
            <input
              type="checkbox"
              checked={config.player?.showMiniPlayer ?? true}
              onChange={(e) => setShowMiniPlayer(e.target.checked)}
            />
            <span className="sett-slider" />
          </label>
        </div>
      </div>

      <div className="sett-card">
        <div className="sett-card-info" style={{ marginBottom: 12 }}>
          <div className="sett-card-title">
            {lang === "ru" ? "Фон мини-плеера" : "Mini-Player Background"}
          </div>
          <div className="sett-card-desc">
            {lang === "ru" ? "Выберите источник фона мини-плеера" : "Select mini-player background source"}
          </div>
        </div>
        <div className="sett-segmented-group">
          <button
            type="button"
            className={`sett-segmented-btn ${config.player?.miniPlayerBg === "theme" || !config.player?.miniPlayerBg ? "active" : ""}`}
            onClick={() => setMiniPlayerBg("theme")}
          >
            <span className="sett-segmented-btn-icon"><IconInterface size={14} /></span>
            <span className="sett-segmented-btn-label">{lang === "ru" ? "Тема" : "Theme"}</span>
          </button>
          <button
            type="button"
            className={`sett-segmented-btn ${config.player?.miniPlayerBg === "artwork" ? "active" : ""}`}
            onClick={() => setMiniPlayerBg("artwork")}
          >
            <span className="sett-segmented-btn-icon"><IconBackground size={14} /></span>
            <span className="sett-segmented-btn-label">{lang === "ru" ? "Обложка" : "Artwork"}</span>
          </button>
          <button
            type="button"
            className={`sett-segmented-btn ${config.player?.miniPlayerBg === "dominant" ? "active" : ""}`}
            onClick={() => setMiniPlayerBg("dominant")}
          >
            <span className="sett-segmented-btn-icon"><IconDisc size={14} /></span>
            <span className="sett-segmented-btn-label">{lang === "ru" ? "Цвет обложки" : "Dominant"}</span>
          </button>
        </div>
      </div>

      <div className="sett-card">
        <div className="sett-card-info" style={{ marginBottom: 12 }}>
          <div className="sett-card-title">
            {lang === "ru" ? "Форма мини-плеера" : "Mini-Player Shape"}
          </div>
          <div className="sett-card-desc">
            {lang === "ru"
              ? "Капсульная закруглённая форма или стандартный прямоугольник"
              : "Capsule rounded shape or standard rectangle"}
          </div>
        </div>
        <div className="sett-segmented-group">
          <button
            type="button"
            className={`sett-segmented-btn ${(config.player?.miniPlayerShape || "capsule") === "capsule" ? "active" : ""}`}
            onClick={() => setMiniPlayerShape("capsule")}
          >
            <span className="sett-segmented-btn-icon"><IconShapeCapsule size={15} /></span>
            <span className="sett-segmented-btn-label">{lang === "ru" ? "Капсула" : "Capsule"}</span>
          </button>
          <button
            type="button"
            className={`sett-segmented-btn ${(config.player?.miniPlayerShape || "capsule") === "default" ? "active" : ""}`}
            onClick={() => setMiniPlayerShape("default")}
          >
            <span className="sett-segmented-btn-icon"><IconShapeRect size={15} /></span>
            <span className="sett-segmented-btn-label">{lang === "ru" ? "Стандартный" : "Standard"}</span>
          </button>
        </div>
      </div>

      <div className="sett-card">
        <div className="sett-card-row">
          <div className="sett-card-info">
            <div className="sett-card-title">
              {lang === "ru" ? "Крупные значки управления" : "Large Control Icons"}
            </div>
            <div className="sett-card-desc">
              {lang === "ru"
                ? "Увеличить размер кнопок Play, Next и Previous для удобного нажатия"
                : "Enlarge Play, Next and Previous buttons for easier clicking"}
            </div>
          </div>
          <label className="sett-switch">
            <input
              type="checkbox"
              checked={config.player?.largeIcons ?? false}
              onChange={(e) => setPlayerOptions({ largeIcons: e.target.checked })}
            />
            <span className="sett-slider" />
          </label>
        </div>
      </div>

      <div className="sett-section-title">
        {lang === "ru" ? "НАСТРОЙКИ БОЛЬШОГО (ПОЛНОЭКРАННОГО) ПЛЕЕРА" : "FULLSCREEN PLAYER SETTINGS"}
      </div>

      <div className="sett-card">
        <div className="sett-card-info">
          <div className="sett-card-title">
            {lang === "ru" ? "Положение текста песни (Lyrics)" : "Lyrics Column Position"}
          </div>
          <div className="sett-card-desc">
            {lang === "ru"
              ? "Расположение колонки караоке-текста в полноэкранном плеере"
              : "Placement of karaoke lyrics column in fullscreen player"}
          </div>
        </div>
        <div className="sett-segmented-group">
          <button
            type="button"
            className={`sett-segmented-btn ${config.player?.fullscreenLyricsPosition === "right" || !config.player?.fullscreenLyricsPosition ? "active" : ""}`}
            onClick={() => setFullscreenLyricsPosition("right")}
          >
            <span className="sett-segmented-btn-icon"><IconLayoutRight size={14} /></span>
            <span className="sett-segmented-btn-label">{lang === "ru" ? "Справа" : "Right"}</span>
          </button>
          <button
            type="button"
            className={`sett-segmented-btn ${config.player?.fullscreenLyricsPosition === "left" ? "active" : ""}`}
            onClick={() => setFullscreenLyricsPosition("left")}
          >
            <span className="sett-segmented-btn-icon"><IconLayoutLeft size={14} /></span>
            <span className="sett-segmented-btn-label">{lang === "ru" ? "Слева" : "Left"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
