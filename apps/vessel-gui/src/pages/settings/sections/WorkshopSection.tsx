import { useApp } from "../../../store";
import { IconSparkles } from "../../../components/Icons";

export function WorkshopSection() {
  const { lang } = useApp();

  return (
    <div>
      <div className="sett-page-header">
        <h1 className="sett-page-title">
          {lang === "ru" ? "Мастерская тем и плагинов" : "Themes & Plugins Workshop"}
        </h1>
        <p className="sett-page-sub">
          {lang === "ru"
            ? "Каталог стилей оформления, кастомных шейдеров и расширений от сообщества"
            : "Directory of community themes, custom shaders and extensions"}
        </p>
      </div>

      <div className="sett-card" style={{ textAlign: "center", padding: "40px 20px" }}>
        <div style={{
          width: 54,
          height: 54,
          borderRadius: "50%",
          background: "rgba(255, 255, 255, 0.05)",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: "var(--accent)",
          marginBottom: 16
        }}>
          <IconSparkles size={28} />
        </div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--text)", marginBottom: 8 }}>
          {lang === "ru" ? "Каталог Мастерской скоро появится" : "Workshop Catalog Coming Soon"}
        </div>
        <div style={{ fontSize: 13, color: "var(--text3)", maxWidth: 440, margin: "0 auto", lineHeight: 1.5 }}>
          {lang === "ru"
            ? "Здесь можно будет в один клик устанавливать темы оформления, анимации для обложек и кастомные расширения пользователей Vessel."
            : "Here you will be able to install community themes, custom cover animations and extensions in one click."}
        </div>
      </div>
    </div>
  );
}
