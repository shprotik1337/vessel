import { useEffect, useState } from "react";
import { useApp } from "../../../store";
import * as api from "../../../api/commands";

export function ProxySection() {
  const { lang, showToast } = useApp();
  const [spotifyProxy, setSpotifyProxy] = useState("");

  useEffect(() => {
    api.getSpotifyProxy().then(setSpotifyProxy).catch(() => {});
  }, []);

  return (
    <div>
      <div className="sett-page-header">
        <h1 className="sett-page-title">
          {lang === "ru" ? "Прокси-сервер" : "Proxy Server"}
        </h1>
        <p className="sett-page-sub">
          {lang === "ru"
            ? "Настройка сетевого проксирования для обхода блокировок сервисов"
            : "Network proxy configuration to bypass service restrictions"}
        </p>
      </div>

      <div className="sett-card">
        <div className="sett-card-info">
          <div className="sett-card-title">HTTP / SOCKS5 Прокси</div>
          <div className="sett-card-desc">
            {lang === "ru"
              ? "Применяется для сетевых запросов Spotify, SoundCloud и других заблокированных платформ"
              : "Applied to network requests for Spotify, SoundCloud and blocked platforms"}
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <input
            type="text"
            className="sett-token-input"
            placeholder="http://user:pass@host:port или socks5://..."
            value={spotifyProxy}
            onChange={(e) => setSpotifyProxy(e.target.value)}
            style={{ width: "100%", marginBottom: 12 }}
          />
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <button
              type="button"
              className="sett-token-action-btn submit"
              onClick={async () => {
                try {
                  await api.setSpotifyProxy(spotifyProxy.trim() || null);
                  showToast(lang === "ru" ? "Прокси успешно применён" : "Proxy applied successfully");
                } catch (e) {
                  showToast(String(e), true);
                }
              }}
            >
              {lang === "ru" ? "Сохранить прокси" : "Save Proxy"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
