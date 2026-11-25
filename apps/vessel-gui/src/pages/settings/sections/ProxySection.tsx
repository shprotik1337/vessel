import { useEffect, useState } from "react";
import { useApp } from "../../../store";
import * as api from "../../../api/commands";

export function ProxySection() {
  const { lang, showToast } = useApp();
  const [spotifyProxy, setSpotifyProxy] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.getSpotifyProxy().then(setSpotifyProxy).catch(() => {});
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.setSpotifyProxy(spotifyProxy.trim() || null);
      showToast(lang === "ru" ? "Прокси успешно применён" : "Proxy applied successfully");
    } catch (e) {
      showToast(String(e), true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="sett-page-header">
        <h1 className="sett-page-title">
          {lang === "ru" ? "Прокси" : "Proxy"}
        </h1>
        <p className="sett-page-sub">
          {lang === "ru"
            ? "Настройка сетевого проксирования для обхода ограничений сервисов."
            : "Network proxy configuration for restricted services."}
        </p>
      </div>

      <div className="sett-group-card">
        <div className="sett-row-col">
          <div className="sett-row-info" style={{ marginBottom: 12 }}>
            <div className="sett-row-title">HTTP / SOCKS5 Прокси</div>
            <div className="sett-row-desc">
              {lang === "ru"
                ? "Применяется к сетевым запросам Spotify, SoundCloud и других платформ."
                : "Applied to network requests for Spotify, SoundCloud and other platforms."}
            </div>
          </div>

          <div className="sett-inline-form">
            <input
              type="text"
              className="sett-input"
              placeholder="http://user:pass@host:port или socks5://..."
              value={spotifyProxy}
              onChange={(e) => setSpotifyProxy(e.target.value)}
            />
            <button
              type="button"
              className="sett-btn-primary"
              disabled={saving}
              onClick={() => void handleSave()}
            >
              {saving ? "…" : (lang === "ru" ? "Сохранить" : "Save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
