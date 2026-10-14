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
          {lang === "ru" ? "Настройки вкладок" : "Tab Settings"}
        </h1>
        <p className="sett-page-sub">
          {lang === "ru"
            ? "Положение, стиль и поведение навигационной панели приложения"
            : "Position, style and behavior of application navigation bar"}
        </p>
      </div>

      <div className="sett-section-title">
        {lang === "ru" ? "ПОЗИЦИЯ ВКЛАДОК" : "TABS POSITION"}
      </div>
      <div className="sett-card">
        <div className="sett-card-row" style={{ alignItems: "center" }}>
          <div className="sett-card-info">
            <div className="sett-card-title">
              {lang === "ru" ? "Позиция вкладок" : "Tabs Position"}
            </div>
            <div className="sett-card-desc">
              {lang === "ru" ? "Выберите расположение панели вкладок" : "Choose navigation bar placement"}
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
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
                  className={`sett-platform-pill ${isSel ? "active" : ""}`}
                >
                  {pos.icon}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="sett-section-title">
        {lang === "ru" ? "СТИЛЬ ВКЛАДОК" : "TABS STYLE"}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 18 }}>
        {[
          { id: "dock", title: lang === "ru" ? "По умолчанию" : "Default", desc: lang === "ru" ? "Классическая панель" : "Classic bar", icon: <IconLayoutTop size={18} /> },
          { id: "compact", title: lang === "ru" ? "Компактный" : "Compact", desc: lang === "ru" ? "Минимум места" : "Minimal space", icon: <IconDevice size={18} /> },
          { id: "round", title: lang === "ru" ? "Круглый" : "Round", desc: lang === "ru" ? "Круглые иконки" : "Round icons", icon: <IconDisc size={18} /> },
          { id: "island", title: lang === "ru" ? "Плавающий" : "Floating", desc: lang === "ru" ? "Парящий островок" : "Floating island", icon: <IconShapeCapsule size={18} /> },
        ].map((st) => {
          const isSel = (config.sidebar?.style || "dock") === st.id || (st.id === "island" && config.sidebar?.style === "floating");
          return (
            <div
              key={st.id}
              className={`sett-style-card ${isSel ? "active" : ""}`}
              onClick={() => setSidebarStyle(st.id as any)}
            >
              <div className="sett-style-card-icon">{st.icon}</div>
              <div style={{ flex: 1 }}>
                <div className="sett-style-card-title">{st.title}</div>
                <div className="sett-style-card-desc">{st.desc}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="sett-section-title">
        {lang === "ru" ? "СКРЫТИЕ ЭЛЕМЕНТОВ" : "AUTO-HIDE ELEMENTS"}
      </div>
      <div className="sett-card">
        <div className="sett-card-info" style={{ marginBottom: 12 }}>
          <div className="sett-card-title">
            {lang === "ru" ? "Скрытие элементов" : "Auto-Hide"}
          </div>
          <div className="sett-card-desc">
            {lang === "ru" ? "Автоскрытие неактивных панелей" : "Auto-hide inactive navigation panels"}
          </div>
        </div>
        <div className="sett-segmented-group" style={{ marginTop: 0 }}>
          <button
            type="button"
            className={`sett-segmented-btn ${!config.sidebar?.autoHide ? "active" : ""}`}
            onClick={() => setSidebarAutoHide(false)}
          >
            <span className="sett-segmented-btn-icon">⃠</span>
            <span className="sett-segmented-btn-label">{lang === "ru" ? "Ничего" : "None"}</span>
          </button>
          <button
            type="button"
            className={`sett-segmented-btn ${config.sidebar?.autoHide ? "active" : ""}`}
            onClick={() => setSidebarAutoHide(true)}
          >
            <span className="sett-segmented-btn-icon"><IconTabs size={14} /></span>
            <span className="sett-segmented-btn-label">{lang === "ru" ? "Вкладки" : "Tabs"}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
