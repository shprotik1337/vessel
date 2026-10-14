import { useEffect, useState } from "react";
import { useApp } from "../../../store";
import * as api from "../../../api/commands";

export function DiscordSection() {
  const { state, lang, showToast } = useApp();
  const [discordRpc, setDiscordRpc] = useState(false);

  useEffect(() => {
    api.getDiscordRpc().then(setDiscordRpc).catch(() => false);
  }, []);

  const handleDiscordRpcToggle = async (val: boolean) => {
    setDiscordRpc(val);
    try {
      await api.setDiscordRpc(val);
      showToast(val ? (lang === "ru" ? "Discord RPC включен" : "Discord RPC enabled") : (lang === "ru" ? "Discord RPC отключен" : "Discord RPC disabled"));
    } catch (e) {
      showToast(String(e), true);
    }
  };

  return (
    <div>
      <div className="sett-page-header">
        <h1 className="sett-page-title">Discord Rich Presence</h1>
        <p className="sett-page-sub">
          {lang === "ru"
            ? "Трансляция текущего трека в статус профиля Discord"
            : "Broadcast now-playing track to your Discord profile activity"}
        </p>
      </div>

      <div className="sett-card">
        <div className="sett-card-row">
          <div className="sett-card-info">
            <div className="sett-card-title">
              {lang === "ru" ? "Включить Discord RPC" : "Enable Discord RPC"}
            </div>
            <div className="sett-card-desc">
              {lang === "ru"
                ? "Показывать обложку, название трека, исполнителя и таймлайн в Discord"
                : "Show artwork, track title, artist and playback timeline in Discord"}
            </div>
          </div>
          <label className="sett-switch">
            <input
              type="checkbox"
              checked={discordRpc}
              onChange={(e) => handleDiscordRpcToggle(e.target.checked)}
            />
            <span className="sett-slider" />
          </label>
        </div>
      </div>

      {discordRpc && (
        <div className="sett-card">
          <div className="sett-section-title" style={{ marginTop: 0 }}>
            {lang === "ru" ? "ПРЕДПРОСМОТР КАРТОЧКИ В DISCORD" : "DISCORD ACTIVITY PREVIEW"}
          </div>
          <div
            style={{
              background: "#111214",
              borderRadius: 14,
              padding: 16,
              display: "flex",
              gap: 14,
              alignItems: "center",
              maxWidth: 420,
              border: "1px solid rgba(255,255,255,0.08)",
              color: "#fff",
            }}
          >
            <div style={{ width: 64, height: 64, borderRadius: 10, overflow: "hidden", background: "#222" }}>
              <img
                src={state?.now_playing?.artwork_url || "https://cdn.rcd.gg/PreMiD/websites/S/Spotify/assets/logo.png"}
                alt="Discord RPC artwork"
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: "#f2f3f5", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {state?.now_playing?.title || "Vessel Music Desktop"}
              </div>
              <div style={{ fontSize: 12, color: "#b5bac1", marginTop: 2, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {state?.now_playing?.artists.join(", ") || (lang === "ru" ? "Слушает музыку в Vessel" : "Listening to music in Vessel")}
              </div>
              <div style={{ marginTop: 8, height: 4, background: "#4e5058", borderRadius: 2, overflow: "hidden" }}>
                <div style={{ width: "35%", height: "100%", background: "#fff" }} />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
