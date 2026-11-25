import { useApp } from "../../../store";
import { useCustomization } from "../../../customization";
import {
  IconLayoutTop,
  IconLayoutBottom,
  IconLayoutLeft,
  IconLayoutRight,
  IconDevice,
  IconDisc,
  IconShapeCapsule,
  IconTabs,
} from "../../../components/Icons";

export function TabsSection() {
  const { lang } = useApp();
  const {
    config,
    setSidebarPosition,
    setSidebarStyle,
    setSidebarAutoHide,
  } = useCustomization();

  return (
    <div>
      <div className="sett-page-header">
        <h1 className="sett-page-title">
          {lang === "ru" ? "Вкладки" : "Tabs"}
        </h1>
        <p className="sett-page-sub">
          {lang === "ru"
            ? "Положение, стиль и поведение навигационной панели приложения."
            : "Position, style and behavior of the navigation bar."}
        </p>
      </div>

      <div className="sett-group-card">
        <div className="sett-row">
          <div className="sett-row-info">
            <div className="sett-row-title">
              {lang === "ru" ? "Позиция вкладок" : "Tabs Position"}
            </div>
            <div className="sett-row-desc">
              {lang === "ru" ? "Выберите расположение панели навигации." : "Choose navigation bar placement."}
            </div>
          </div>

          <div className="sett-icon-pills">
            {[
              { id: "top", icon: <IconLayoutTop size={16} />, label: lang === "ru" ? "Сверху" : "Top" },
              { id: "bottom", icon: <IconLayoutBottom size={16} />, label: lang === "ru" ? "Снизу" : "Bottom" },
              { id: "left", icon: <IconLayoutLeft size={16} />, label: lang === "ru" ? "Слева" : "Left" },
              { id: "right", icon: <IconLayoutRight size={16} />, label: lang === "ru" ? "Справа" : "Right" },
            ].map((pos) => {
              const isSel = (config.sidebar?.position || "left") === pos.id;
              return (
                <button
                  key={pos.id}
                  type="button"
                  onClick={() => setSidebarPosition(pos.id as any)}
                  title={pos.label}
                  className={`sett-icon-pill-btn ${isSel ? "active" : ""}`}
                >
                  {pos.icon}
                </button>
              );
            })}
          </div>
        </div>

        <div className="sett-row-col">
          <div className="sett-row-info" style={{ marginBottom: 12 }}>
            <div className="sett-row-title">
              {lang === "ru" ? "Стиль вкладок" : "Tabs Style"}
            </div>
            <div className="sett-row-desc">
              {lang === "ru" ? "Внешний вид боковой или верхней панели." : "Visual style of the navigation panel."}
            </div>
          </div>

          <div className="sett-tabs-style-grid">
            {[
              { id: "dock", title: lang === "ru" ? "По умолчанию" : "Default", desc: lang === "ru" ? "Классическая панель" : "Classic bar", icon: <IconLayoutTop size={17} /> },
              { id: "compact", title: lang === "ru" ? "Компактный" : "Compact", desc: lang === "ru" ? "Минимум места" : "Minimal space", icon: <IconDevice size={17} /> },
              { id: "round", title: lang === "ru" ? "Круглый" : "Round", desc: lang === "ru" ? "Пилюльная панель" : "Pill panel", icon: <IconDisc size={17} /> },
              { id: "island", title: lang === "ru" ? "Плавающий" : "Floating", desc: lang === "ru" ? "Парящий островок" : "Floating island", icon: <IconShapeCapsule size={17} /> },
            ].map((st) => {
              const isSel =
                (config.sidebar?.style || "dock") === st.id ||
                (st.id === "island" && config.sidebar?.style === "floating");
              return (
                <button
                  key={st.id}
                  type="button"
                  className={`sett-style-option ${isSel ? "active" : ""}`}
                  onClick={() => setSidebarStyle(st.id as any)}
                >
                  <span className="sett-style-option-icon">{st.icon}</span>
                  <span className="sett-style-option-text">
                    <span className="sett-style-option-title">{st.title}</span>
                    <span className="sett-style-option-desc">{st.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="sett-row">
          <div className="sett-row-info">
            <div className="sett-row-title">
              {lang === "ru" ? "Скрытие элементов" : "Auto-Hide Elements"}
            </div>
            <div className="sett-row-desc">
              {lang === "ru"
                ? "Автоматически скрывать панель навигации при бездействии."
                : "Automatically hide navigation panel when inactive."}
            </div>
          </div>

          <div className="sett-pill-switch">
            <button
              type="button"
              className={`sett-pill-opt ${!config.sidebar?.autoHide ? "active" : ""}`}
              onClick={() => setSidebarAutoHide(false)}
            >
              <span>{lang === "ru" ? "Ничего" : "None"}</span>
            </button>
            <button
              type="button"
              className={`sett-pill-opt ${config.sidebar?.autoHide ? "active" : ""}`}
              onClick={() => setSidebarAutoHide(true)}
            >
              <IconTabs size={14} />
              <span>{lang === "ru" ? "Вкладки" : "Tabs"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
