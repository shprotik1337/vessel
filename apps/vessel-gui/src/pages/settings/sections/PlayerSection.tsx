import { useApp } from "../../../store";
import { useCustomization } from "../../../customization";
import {
  IconPlayer,
  IconSparkles,
  IconLayoutBottom,
  IconLayoutTop,
  IconWaveStream,
} from "../../../components/Icons";

export function PlayerSection() {
  const { lang } = useApp();
  const {
    config,
    setPlayerPosition,
    setPlayerStyle,
  } = useCustomization();

  return (
    <div>
      <div className="sett-page-header">
        <h1 className="sett-page-title">
          {lang === "ru" ? "Плеер" : "Player"}
        </h1>
        <p className="sett-page-sub">
          {lang === "ru"
            ? "Расположение и стиль панели управления плеером."
            : "Placement and visual style of the player bar."}
        </p>
      </div>

      <div className="sett-group-card">
        <div className="sett-row">
          <div className="sett-row-info">
            <div className="sett-row-title">
              {lang === "ru" ? "Положение панели плеера" : "Player Bar Position"}
            </div>
            <div className="sett-row-desc">
              {lang === "ru"
                ? "Выберите сторону экрана, где располагается плеер."
                : "Choose which edge of the window holds the player."}
            </div>
          </div>

          <div className="sett-icon-pills">
            {[
              { id: "bottom", icon: <IconLayoutBottom size={16} />, label: lang === "ru" ? "Снизу" : "Bottom" },
              { id: "top", icon: <IconLayoutTop size={16} />, label: lang === "ru" ? "Сверху" : "Top" },
            ].map((pos) => {
              const isSel = (config.player?.position === "top" ? "top" : "bottom") === pos.id;
              return (
                <button
                  key={pos.id}
                  type="button"
                  onClick={() => setPlayerPosition(pos.id as any)}
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
              {lang === "ru" ? "Стиль отображения" : "Display Style"}
            </div>
            <div className="sett-row-desc">
              {lang === "ru"
                ? "Прикреплённая к краю панель, плавающий островок или заполнение прогрессом."
                : "Docked edge panel, floating island, or progress fill bar."}
            </div>
          </div>

          <div className="sett-pill-switch full">
            <button
              type="button"
              className={`sett-pill-opt ${config.player?.style === "floating" || !config.player?.style ? "active" : ""}`}
              onClick={() => setPlayerStyle("floating")}
            >
              <IconSparkles size={14} />
              <span>{lang === "ru" ? "Плавающий остров" : "Floating Island"}</span>
            </button>
            <button
              type="button"
              className={`sett-pill-opt ${config.player?.style === "dock" ? "active" : ""}`}
              onClick={() => setPlayerStyle("dock")}
            >
              <IconPlayer size={14} />
              <span>{lang === "ru" ? "Прикреплённый (Док)" : "Docked"}</span>
            </button>
            <button
              type="button"
              className={`sett-pill-opt ${config.player?.style === "progress_fill" ? "active" : ""}`}
              onClick={() => setPlayerStyle("progress_fill")}
            >
              <IconWaveStream size={14} />
              <span>{lang === "ru" ? "Заполнение прогрессом" : "Progress Fill"}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
