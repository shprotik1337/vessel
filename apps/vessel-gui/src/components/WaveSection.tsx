import { useEffect, useRef, useState } from "react";

import { useApp } from "../store";
import { Waveform } from "./Waveform";
import { PlatformIcon } from "./PlatformIcon";
import { useBlockWidth } from "../customization/EditableBlock";
import { t } from "../i18n";
import { trackKey } from "../lib/utils";
import * as api from "../api/commands";

interface ProviderOption {
  key: string;
  label: string;
}

const PROVIDER_OPTIONS: ProviderOption[] = [
  { key: "soundcloud", label: "SoundCloud" },
  { key: "deezer", label: "Deezer" },
  { key: "yandex", label: "Yandex" },
  { key: "spotify", label: "Spotify" },
  { key: "you_tube_music", label: "YouTube Music" },
];

export function WaveSection() {
  const { state, lang, showToast, playTracks, navigateTo, waveTracks, setWaveTracks } = useApp();
  const [sourcePicker, setSourcePicker] = useState(false);
  const [playlistPicker, setPlaylistPicker] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [building, setBuilding] = useState(false);
  const [selectedProviders, setSelectedProviders] = useState<string[] | null>(null);
  const [allProviders, setAllProviders] = useState(true);
  const chosenSource = useRef<"favorites" | "playlists" | null>(null);

  // Загружаем сохранённые настройки волны при монтировании
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const val = await api.getWaveProviders();
        if (cancelled) return;
        if (val === "all" || !val) {
          setAllProviders(true);
          setSelectedProviders(PROVIDER_OPTIONS.map((o) => o.key));
        } else {
          const list = val.split(",").filter((k) => PROVIDER_OPTIONS.some((o) => o.key === k));
          setAllProviders(false);
          setSelectedProviders(list);
        }
      } catch {
        if (!cancelled) setAllProviders(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const waveNow = state?.now_playing
    ? waveTracks.some((t) => trackKey(t) === trackKey(state.now_playing!))
    : false;
  const isLive =
    state?.player.status === "playing" || state?.player.status === "buffering";
  const playing = waveNow && isLive;
  const wfState = playing ? "playing" : "idle";

  const providerFilter = () => {
    if (allProviders || !selectedProviders || selectedProviders.length === 0) return "all";
    return selectedProviders.join(",");
  };

  const openSourcePicker = () => setSourcePicker(true);

  const chooseSource = async (source: "favorites" | "playlists") => {
    chosenSource.current = source;
    setSourcePicker(false);
    if (source === "favorites") {
      await buildWave("favorites", null);
    } else {
      setPlaylistPicker(true);
    }
  };

  const buildWave = async (source: "favorites" | "playlists", playlistId: string | null) => {
    if (building) return;
    setBuilding(true);
    try {
      const tracks = await api.getWaveRecommendations(source, 50, playlistId, providerFilter());
      setWaveTracks(tracks);
      if (tracks.length > 0) {
        playTracks(tracks, 0);
      } else {
        showToast(t(lang, "wave.empty1"), true);
      }
    } catch (error) {
      showToast(String(error), true);
    } finally {
      setBuilding(false);
      setPlaylistPicker(false);
    }
  };

  const playWave = () => {
    if (waveTracks.length === 0) {
      openSourcePicker();
      return;
    }
    // Если сейчас играет именно трек из волны — переключаем паузу/плей.
    // Иначе — заменяем очередь волной (не продолжаем избранное/плейлист).
    if (playing) {
      void api.togglePlayback().catch(() => {});
    } else {
      playTracks(waveTracks, 0);
    }
  };

  const toggleProvider = (key: string) => {
    if (allProviders) {
      // «Всё вместе» активно — галочки на всех, снимать нельзя, только выключить «всё вместе»
      return;
    }
    setSelectedProviders((prev) => {
      const list = prev ?? [];
      const next = list.includes(key)
        ? list.filter((k) => k !== key)
        : [...list, key];
      return next;
    });
  };

  const toggleAllProviders = (checked: boolean) => {
    setAllProviders(checked);
    if (checked) {
      // ставим галочки на все платформы
      setSelectedProviders(PROVIDER_OPTIONS.map((o) => o.key));
    }
  };

  const applyProviderSettings = async () => {
    setSettingsOpen(false);
    await api.setWaveProviders(providerFilter());
    if (waveTracks.length > 0) {
      await buildWave("favorites", null);
    }
  };

  const blockWidth = useBlockWidth();
  const isMini = blockWidth === "third" || blockWidth === "half";

  return (
    <div className="section">
      <div className="sec-head">
        <span className="sec-title">Моя волна</span>
      </div>

      {isMini ? (
        <div
          className="wave-mini-widget"
          onClick={() => navigateTo("wave")}
          title="Перейти к Моей волне"
        >
          <div className="wave-mini-left">
            <div className={`wave-mini-badge ${playing ? "playing" : ""}`}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
                <path d="M2 12h2" />
                <path d="M6 8v8" />
                <path d="M10 4v16" />
                <path d="M14 7v10" />
                <path d="M18 10v4" />
                <path d="M22 12h-2" />
              </svg>
            </div>
            <div className="wave-mini-info">
              <div className="wave-mini-title">Моя волна</div>
              <div className="wave-mini-sub">
                {building ? "Генерация…" : playing ? "Играет сейчас" : "Бесконечный поток"}
              </div>
            </div>
          </div>
          <div className="wave-mini-controls" onClick={(e) => e.stopPropagation()}>
            <button
              className="btn btn-ghost btn-mini-tool"
              onClick={() => setSettingsOpen(true)}
              title={t(lang, "wave.settings")}
            >
              ⚙
            </button>
            <button
              className="btn btn-primary btn-mini-play"
              onClick={(e) => {
                e.stopPropagation();
                playWave();
              }}
              disabled={building}
              title={playing ? "Пауза" : "Играть"}
            >
              {building ? "…" : playing ? "⏸" : "▶"}
            </button>
          </div>
        </div>
      ) : (
        <div
          className="wave-panel"
          style={{
            display: "flex",
            flexDirection: "column",
            height: 150,
            background: "var(--panel)",
            borderRadius: 8,
            border: "1px solid var(--border)",
            overflow: "hidden",
            cursor: "pointer",
            transition: "border-color .12s",
          }}
          onClick={() => navigateTo("wave")}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border2)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLDivElement).style.borderColor = "var(--border)";
          }}
        >
          <div style={{ flex: 1, minHeight: 0 }} />
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              padding: "8px 20px",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button
              className="btn btn-ghost"
              style={{
                width: 36,
                height: 36,
                padding: 0,
                borderRadius: 18,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              onClick={() => setSettingsOpen(true)}
              title={t(lang, "wave.settings")}
            >
              ⚙
            </button>
            <button
              className="btn btn-primary"
              style={{
                width: 40,
                height: 40,
                padding: 0,
                borderRadius: 20,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              onClick={(e) => {
                e.stopPropagation();
                playWave();
              }}
              disabled={building}
            >
              {building ? "…" : playing ? "⏸" : "▶"}
            </button>
            <button
              className="btn btn-ghost"
              style={{
                width: 36,
                height: 36,
                padding: 0,
                borderRadius: 18,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
              onClick={(e) => {
                e.stopPropagation();
                if (waveTracks.length > 0) {
                  void (async () => {
                    setBuilding(true);
                    try {
                      const tracks = await api.getWaveRecommendations("favorites", 50, null, providerFilter());
                      setWaveTracks(tracks);
                      if (tracks.length > 0) playTracks(tracks, 0);
                    } catch (err) {
                      showToast(String(err), true);
                    } finally {
                      setBuilding(false);
                    }
                  })();
                } else {
                  openSourcePicker();
                }
              }}
              disabled={building}
              title={t(lang, "wave.refresh")}
            >
              ↻
            </button>
          </div>
          <div style={{ height: 60, padding: "0 20px 4px" }}>
            <Waveform state={wfState} barCount={80} height={56} />
          </div>
        </div>
      )}

      {sourcePicker && (
        <div className="ov show" onClick={() => setSourcePicker(false)}>
          <div
            className="ov-card"
            style={{ width: 360, height: "auto", maxHeight: "auto", padding: 24, gap: 12 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sett-title" style={{ fontSize: 17 }}>
              {t(lang, "wave.sourceTitle")}
            </div>
            <div className="set-desc">{t(lang, "wave.sourceSub")}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
              <button className="btn btn-primary" onClick={() => chooseSource("favorites")} disabled={building}>
                {t(lang, "nav.favorites")}
              </button>
              <button className="btn btn-outline" onClick={() => chooseSource("playlists")} disabled={building}>
                {t(lang, "nav.playlists")}
              </button>
            </div>
          </div>
        </div>
      )}

      {playlistPicker && (
        <div className="ov show" onClick={() => setPlaylistPicker(false)}>
          <div
            className="ov-card"
            style={{ width: 420, height: "auto", maxHeight: "70vh", padding: 24, gap: 12 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sett-title" style={{ fontSize: 17 }}>
              {t(lang, "wave.choosePlaylist")}
            </div>
            <div className="set-desc">{t(lang, "wave.choosePlaylistSub")}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, overflowY: "auto" }}>
              {state?.playlists.map((p) => (
                <button
                  key={p.id}
                  className="btn btn-outline"
                  style={{ justifyContent: "flex-start", textAlign: "left", height: "auto", padding: "10px 14px" }}
                  onClick={() => buildWave("playlists", p.id)}
                  disabled={building}
                >
                  <span style={{ flex: 1, minWidth: 0, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {p.title}
                  </span>
                  <span style={{ color: "var(--text3)", fontSize: 12, flexShrink: 0 }}>
                    {p.tracks.length}
                  </span>
                </button>
              ))}
              {state && state.playlists.length === 0 && (
                <div className="set-desc" style={{ padding: 12, textAlign: "center" }}>
                  {t(lang, "playlists.empty1")}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {settingsOpen && (
        <div className="ov show" onClick={() => setSettingsOpen(false)}>
          <div
            className="ov-card"
            style={{ width: 420, height: "auto", maxHeight: "auto", padding: 0, gap: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ padding: "18px 20px 14px", borderBottom: "1px solid var(--border)" }}>
              <div className="sett-title" style={{ fontSize: 17 }}>
                {t(lang, "wave.settings")}
              </div>
              <div className="set-desc" style={{ marginTop: 4 }}>
                {t(lang, "wave.settingsSub")}
              </div>
            </div>
            <div>
              <div className="svc-row" style={{ borderBottom: "1px solid var(--border)" }}>
                <div style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                  <span style={{ fontSize: 16 }}>★</span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{t(lang, "wave.allTogether")}</div>
                  <div className="set-desc" style={{ marginTop: 2 }}>
                    {t(lang, "recommendations.allConnected")}
                  </div>
                </div>
                <div className="chips" style={{ gap: 4, flexWrap: "wrap" }}>
                  <button
                    className={`chip ${allProviders ? "active" : ""}`}
                    style={allProviders ? { borderColor: "var(--border3)", color: "var(--text)" } : undefined}
                    onClick={() => toggleAllProviders(true)}
                  >
                    {t(lang, "recommendations.modeAll")}
                  </button>
                  <button
                    className={`chip ${!allProviders ? "active" : ""}`}
                    style={!allProviders ? { borderColor: "var(--border3)", color: "var(--text)" } : undefined}
                    onClick={() => toggleAllProviders(false)}
                  >
                    {t(lang, "recommendations.modeCustom")}
                  </button>
                </div>
              </div>
              {!allProviders && PROVIDER_OPTIONS.map((opt) => {
                const on = selectedProviders?.includes(opt.key) ?? false;
                const colors: Record<string, string> = {
                  soundcloud: "#F50", deezer: "#A238FF", yandex: "#FC0", spotify: "#1DB954", youtube_music: "#FF0000",
                };
                const iconSizes: Record<string, number> = {
                  soundcloud: 40, deezer: 44, yandex: 33, spotify: 59, youtube_music: 32,
                };
                return (
                  <div key={opt.key} className="svc-row" style={{ borderBottom: "none" }}>
                    <div style={{ width: 58, height: 58, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: colors[opt.key] }}>
                      <PlatformIcon kind={opt.key as "soundcloud"|"deezer"|"yandex"|"spotify"|"you_tube_music"} size={iconSizes[opt.key] ?? 40} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 600 }}>{opt.label}</div>
                      <div className="set-desc" style={{ marginTop: 2 }}>
                        {on ? t(lang, "recommendations.on") : t(lang, "recommendations.off")}
                      </div>
                    </div>
                    <button
                      className={`chip ${on ? "active" : ""}`}
                      style={on ? { borderColor: "var(--border3)", color: "var(--text)" } : { opacity: 0.6 }}
                      onClick={() => toggleProvider(opt.key)}
                    >
                      {on ? t(lang, "recommendations.onShort") : t(lang, "recommendations.offShort")}
                    </button>
                  </div>
                );
              })}
            </div>
            <div className="btns" style={{ justifyContent: "flex-end", padding: "12px 20px", borderTop: "1px solid var(--border)" }}>
              <button className="btn btn-outline" onClick={() => setSettingsOpen(false)}>
                {t(lang, "common.cancel")}
              </button>
              <button className="btn btn-primary" onClick={applyProviderSettings} disabled={building}>
                {t(lang, "common.save")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}