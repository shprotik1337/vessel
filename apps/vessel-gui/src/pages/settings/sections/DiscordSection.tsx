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
      showToast(
        val
          ? (lang === "ru" ? "Discord RPC включён" : "Discord RPC enabled")
          : (lang === "ru" ? "Discord RPC отключён" : "Discord RPC disabled"),
      );
    } catch (e) {
      showToast(String(e), true);
    }
  };

  return (
    <div>
      <div className="sett-page-header">
        <h1 className="sett-page-title">Discord RPC</h1>
        <p className="sett-page-sub">
          {lang === "ru"
            ? "Трансляция текущего трека в статус профиля Discord."
            : "Broadcast your currently playing track to Discord activity."}
        </p>
      </div>

      <div className="sett-group-card">
        <div className="sett-row">
          <div className="sett-row-info">
            <div className="sett-row-title">
              {lang === "ru" ? "Включить Discord RPC" : "Enable Discord RPC"}
            </div>
            <div className="sett-row-desc">
              {lang === "ru"
                ? "Показывать обложку, название трека, исполнителя и таймлайн в Discord."
                : "Show artwork, track title, artist and progress timeline in Discord."}
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

        {discordRpc && (
          <div className="sett-row-col">
            <div className="sett-row-title" style={{ marginBottom: 10 }}>
              {lang === "ru" ? "Предпросмотр активности" : "Activity Preview"}
            </div>
            <div className="sett-discord-preview">
              <div className="sett-discord-art">
                {state?.now_playing?.artwork_url ? (
                  <img src={state.now_playing.artwork_url} alt="Discord RPC artwork" />
                ) : (
                  <span style={{ fontWeight: 800, fontSize: 18 }}>V</span>
                )}
              </div>
              <div className="sett-discord-meta">
                <div className="sett-discord-track">
                  {state?.now_playing?.title || "Vessel Music Desktop"}
                </div>
                <div className="sett-discord-artist">
                  {state?.now_playing?.artists.join(", ") ||
                    (lang === "ru" ? "Слушает музыку в Vessel" : "Listening to music in Vessel")}
                </div>
                <div className="sett-discord-bar">
                  <div className="sett-discord-bar-fill" />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
