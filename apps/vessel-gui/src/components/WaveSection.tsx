import { useEffect, useRef, useState } from "react";

import { useApp } from "../store";
import { PlatformIcon } from "./PlatformIcon";
import { t } from "../i18n";
import { trackKey } from "../lib/utils";
import * as api from "../api/commands";

interface ProviderOption {
  key: string;
  label: string;
  color: string;
}

const PROVIDER_OPTIONS: ProviderOption[] = [
  { key: "youtube_music", label: "YouTube Music", color: "#FF0000" },
  { key: "soundcloud", label: "SoundCloud", color: "#FF5500" },
  { key: "spotify", label: "Spotify", color: "#1DB954" },
  { key: "yandex", label: "Yandex Music", color: "#FFCC00" },
  { key: "deezer", label: "Deezer", color: "#A238FF" },
];

export function WaveSection() {
  const { state, lang, showToast, playTracks, navigateTo, waveTracks, setWaveTracks, setIsWaveActive } = useApp();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [building, setBuilding] = useState(false);
  const [showPlatformBar, setShowPlatformBar] = useState(false);
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
        if (val === "all") {
          setAllProviders(true);
          setSelectedProviders(PROVIDER_OPTIONS.map((o) => o.key));
        } else if (!val) {
          setAllProviders(false);
          setSelectedProviders([]);
        } else {
          const list = val.split(",").filter((k) => PROVIDER_OPTIONS.some((o) => o.key === k));
          setAllProviders(list.length === PROVIDER_OPTIONS.length);
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

  const providerFilter = () => {
    if (allProviders) return "all";
    if (!selectedProviders || selectedProviders.length === 0) return "";
    return selectedProviders.join(",");
  };

  const buildWave = async (source: "favorites" | "playlists", playlistId: string | null) => {
    if (building) return;
    setBuilding(true);
    try {
      const tracks = await api.getWaveRecommendations(source, 50, playlistId, providerFilter());
      setWaveTracks(tracks);
      if (tracks.length > 0) {
        setIsWaveActive(true);
        playTracks(tracks, 0);
        navigateTo("player");
      } else {
        showToast(t(lang, "wave.empty1"), true);
      }
    } catch (error) {
      showToast(String(error), true);
    } finally {
      setBuilding(false);
    }
  };

  const playWave = () => {
    const currentKeys = (allProviders || !selectedProviders) ? PROVIDER_OPTIONS.map(o => o.key) : selectedProviders;
    if (currentKeys.length === 0) {
      showToast(lang === "ru" ? "Выберите хотя бы один сервис для Моей волны" : "Please select at least one service", true);
      return;
    }
    if (waveTracks.length === 0) {
      void buildWave("favorites", null);
      return;
    }
    // Если сейчас играет именно трек из волны — переключаем паузу/плей.
    // Иначе — заменяем очередь волной (не продолжаем избранное/плейлист).
    if (waveNow) {
      void api.togglePlayback().catch(() => {});
      navigateTo("player");
    } else {
      setIsWaveActive(true);
      playTracks(waveTracks, 0);
      navigateTo("player");
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

  const handleTogglePlatform = async (key: string) => {
    const allKeys = PROVIDER_OPTIONS.map((o) => o.key);
    const current = selectedProviders ?? (allProviders ? allKeys : []);
    const next = current.includes(key)
      ? current.filter((k) => k !== key)
      : [...current, key];

    const isAll = next.length === allKeys.length;
    setAllProviders(isAll);
    setSelectedProviders(next);

    const filter = isAll ? "all" : next.join(",");
    try {
      await api.setWaveProviders(filter);
    } catch {}

    window.dispatchEvent(new CustomEvent("vessel:providers-changed", { detail: filter }));
  };

  const applyProviderSettings = async () => {
    setSettingsOpen(false);
    const filter = providerFilter();
    try {
      await api.setWaveProviders(filter);
    } catch {}
    window.dispatchEvent(new CustomEvent("vessel:providers-changed", { detail: filter }));
    if (waveTracks.length > 0) {
      await buildWave("favorites", null);
    }
  };

  const isMini = false;

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
              className={`btn btn-ghost btn-mini-tool ${showPlatformBar ? "active" : ""}`}
              onClick={() => setShowPlatformBar((v) => !v)}
              title="Платформы волны"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="4" y1="8" x2="20" y2="8" />
                <circle cx="8" cy="8" r="3" fill="currentColor" />
                <line x1="4" y1="16" x2="20" y2="16" />
                <circle cx="16" cy="16" r="3" fill="currentColor" />
              </svg>
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
        <div className="wave-hero-card" style={{ cursor: "default" }}>
          <div className="wave-hero-left">
            <div className="wave-hero-tag">
              <span>{lang === "ru" ? "МОЯ ВОЛНА" : "MY WAVE"}</span>
            </div>
            <div className="wave-hero-title">
              {lang === "ru" ? "Персональный поток без лишнего шума" : "Personal stream without extra noise"}
            </div>
            <div className="wave-hero-desc">
              {(() => {
                const currentKeys = (allProviders || !selectedProviders) ? PROVIDER_OPTIONS.map(o => o.key) : selectedProviders;
                const activeLabels = currentKeys
                  .map((k) => PROVIDER_OPTIONS.find((o) => o.key === k)?.label)
                  .filter(Boolean) as string[];
                if (currentKeys.length === 0) {
                  return lang === "ru"
                    ? "Сервисы не выбраны. Выберите одну или несколько платформ ниже для запуска волны."
                    : "No services selected. Select one or more platforms below to launch wave.";
                }
                const servicesStr =
                  activeLabels.length === 1
                    ? activeLabels[0]
                    : `${activeLabels.slice(0, -1).join(", ")} ${lang === "ru" ? "и" : "and"} ${activeLabels[activeLabels.length - 1]}`;
                return lang === "ru"
                  ? `Очередь собирается из ${servicesStr}, а активный сервис задает стартовую точку поиска.`
                  : `The queue is assembled from ${servicesStr}, and the active service sets the starting point.`;
              })()}
            </div>

            <div className="wave-hero-actions">
              {(() => {
                const currentKeys = (allProviders || !selectedProviders) ? PROVIDER_OPTIONS.map(o => o.key) : selectedProviders;
                const noService = currentKeys.length === 0;
                return (
                  <>
                    <button
                      type="button"
                      className="btn-wave-primary"
                      onClick={playWave}
                      disabled={building || noService}
                      title={noService ? (lang === "ru" ? "Выберите хотя бы один сервис" : "Select at least one service") : undefined}
                    >
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                        {playing ? (
                          <>
                            <rect x="6" y="4" width="4" height="16" rx="1" />
                            <rect x="14" y="4" width="4" height="16" rx="1" />
                          </>
                        ) : (
                          <polygon points="5 3 19 12 5 21 5 3"/>
                        )}
                      </svg>
                      <span>
                        {building
                          ? (lang === "ru" ? "Сборка…" : "Building…")
                          : playing
                          ? (lang === "ru" ? "Пауза" : "Pause")
                          : waveNow
                          ? (lang === "ru" ? "Продолжить" : "Resume")
                          : (lang === "ru" ? "Запустить волну" : "Launch Wave")}
                      </span>
                    </button>

                    <button
                      type="button"
                      className="btn-wave-icon"
                      onClick={() => buildWave(chosenSource.current || "favorites", null)}
                      disabled={building || noService}
                      title={t(lang, "wave.refresh")}
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="23 4 23 10 17 10"/>
                        <polyline points="1 20 1 14 7 14"/>
                        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                      </svg>
                    </button>
                  </>
                );
              })()}
            </div>

            {/* Platform Selection Chips */}
            <div className="wave-services-row">
              {PROVIDER_OPTIONS.map((p) => {
                const currentKeys = selectedProviders ?? (allProviders ? PROVIDER_OPTIONS.map(o => o.key) : []);
                const isSelected = currentKeys.includes(p.key);
                return (
                  <div
                    key={p.key}
                    className={`wave-service-chip ${isSelected ? "active" : ""}`}
                    onClick={() => void handleTogglePlatform(p.key)}
                    title={`${p.label} (${isSelected ? (lang === "ru" ? "Активен" : "Active") : (lang === "ru" ? "Выключен" : "Disabled")})`}
                  >
                    <PlatformIcon kind={p.key as any} size={15} color={p.color} />
                    <span>{p.label}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="wave-hero-right">
            <div className={`wave-visualizer ${playing ? "playing" : "paused"}`}>
              {[
                25, 38, 55, 72, 88, 62, 45, 30, 48, 70, 92, 100, 84, 65, 42, 58, 80, 95, 88, 70,
                52, 35, 45, 68, 85, 96, 78, 60, 40, 55, 75, 90, 82, 64, 46, 32, 50, 72, 94, 86,
                68, 50, 36, 48, 70, 85, 65, 40
              ].map((h, i) => (
                <div
                  key={i}
                  className="wave-visualizer-bar"
                  style={{
                    height: `${h}%`,
                    animationDelay: `${(i * 0.045).toFixed(3)}s`,
                  }}
                />
              ))}
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
                <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
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
                return (
                  <div key={opt.key} className="svc-row" style={{ borderBottom: "none" }}>
                    <div style={{ width: 36, height: 36, borderRadius: 8, background: "rgba(255,255,255,0.05)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: colors[opt.key] }}>
                      <PlatformIcon kind={opt.key as "soundcloud"|"deezer"|"yandex"|"spotify"|"you_tube_music"} size={22} />
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