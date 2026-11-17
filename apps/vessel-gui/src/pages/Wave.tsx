import { PageAmbientBackdrop } from "../components/PageAmbientBackdrop";
import { useEffect, useState } from "react";

import { useApp } from "../store";
import { TrackRow } from "../components/TrackRow";
import { trackKey, artistLabel } from "../lib/utils";
import { t } from "../i18n";
import type { TrackRef } from "../api/types";
import * as api from "../api/commands";

type SortMode = "custom" | "title" | "artist";
type SortDir = "asc" | "desc";

const WAVE_PROVIDER_OPTIONS = [
  { key: "youtube_music", label: "YouTube Music", color: "#FF0000" },
  { key: "soundcloud", label: "SoundCloud", color: "#FF5500" },
  { key: "yandex", label: "Yandex Music", color: "#FFCC00" },
  { key: "deezer", label: "Deezer", color: "#A238FF" },
];

export function WavePage() {
  const {
    state,
    playTracks,
    showToast,
    refresh,
    navigateTo,
    goBack,
    lang,
    waveTracks,
    waveLoading,
    regenerateWave,
    setIsWaveActive,
  } = useApp();
  const [providers, setProviders] = useState<string>("all");
  const [sort, setSort] = useState<SortMode>("custom");
  const [dir, setDir] = useState<SortDir>("desc");
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);

  useEffect(() => {
    void api
      .getRecommendationProviders()
      .catch(() => api.getWaveProviders().catch(() => "all"))
      .then(setProviders)
      .catch(() => {});
    const onProvidersChanged = (e: any) => {
      setProviders(e.detail || "all");
    };
    window.addEventListener("vessel:providers-changed", onProvidersChanged);
    window.addEventListener("vessel:wave-providers-changed", onProvidersChanged);
    return () => {
      window.removeEventListener("vessel:providers-changed", onProvidersChanged);
      window.removeEventListener("vessel:wave-providers-changed", onProvidersChanged);
    };
  }, []);

  useEffect(() => {
    if (!sortDropdownOpen) return;
    const close = () => setSortDropdownOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [sortDropdownOpen]);

  if (!state) return null;

  const building = waveLoading;
  const nowKey = state.now_playing ? trackKey(state.now_playing) : null;
  const waveNow = state?.now_playing
    ? waveTracks.some((t) => trackKey(t) === trackKey(state.now_playing!))
    : false;
  const isLive =
    state?.player.status === "playing" || state?.player.status === "buffering";
  const playing = waveNow && isLive;

  const allKeys = WAVE_PROVIDER_OPTIONS.map((o) => o.key);
  const activeProviders =
    providers === "all" ? allKeys : !providers ? [] : providers.split(",").filter(Boolean);

  const handleLaunchWave = async () => {
    if (activeProviders.length === 0) {
      showToast(
        lang === "ru"
          ? "Выберите хотя бы один сервис в Настройках → Общие"
          : "Please select at least one service in Settings → General",
        true,
      );
      return;
    }
    if (waveTracks.length > 0) {
      if (waveNow) {
        await api.togglePlayback();
      } else {
        setIsWaveActive(true);
        await playTracks(waveTracks, 0);
      }
    } else {
      await regenerateWave({ force: true, autoplay: true });
      await refresh();
    }
  };

  const handleRefreshWave = async () => {
    await regenerateWave({ force: true, autoplay: false });
    await refresh();
  };

  const playOne = (track: TrackRef) => {
    const idx = waveTracks.findIndex((t) => trackKey(t) === trackKey(track));
    setIsWaveActive(true);
    void playTracks(waveTracks, idx < 0 ? 0 : idx);
  };

  const sortTracks = (tracks: TrackRef[]): TrackRef[] => {
    if (sort === "custom") return tracks;
    const arr = [...tracks];
    const mult = dir === "asc" ? 1 : -1;
    arr.sort((a, b) => {
      switch (sort) {
        case "title":
          return a.title.localeCompare(b.title) * mult;
        case "artist":
          return artistLabel(a.artists).localeCompare(artistLabel(b.artists)) * mult;
        default:
          return 0;
      }
    });
    return arr;
  };

  const visible = sortTracks(waveTracks);

  const sortOptions: { mode: SortMode; label: string }[] = [
    { mode: "custom", label: t(lang, "playlist.customOrder") },
    { mode: "title", label: t(lang, "playlist.titleSort") },
    { mode: "artist", label: t(lang, "playlist.artistSort") },
  ];

  const toggleSort = (mode: SortMode) => {
    if (sort === mode) {
      setDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSort(mode);
      setDir("desc");
    }
  };

  const glowArt = waveTracks[0]?.artwork_url || state.now_playing?.artwork_url;

  return (
    <div className="view">
      <div style={{ marginBottom: 18 }}>
        <button className="btn-back-pill" onClick={goBack} title={t(lang, "common.back")}>
          {t(lang, "common.back")}
        </button>
      </div>

      <div className="page-panel">
        <PageAmbientBackdrop url={glowArt} />

        <div className="page-panel-header" style={{ borderBottom: "none", paddingBottom: 0 }}>
          <div className="wave-hero-card">
            <div className="wave-hero-left">
              <div className="wave-hero-tag">
                <span>{lang === "ru" ? "МОЯ ВОЛНА" : "MY WAVE"}</span>
              </div>
              <div className="wave-hero-title">
                {lang === "ru"
                  ? "Персональный поток без лишнего шума"
                  : "Personal stream without extra noise"}
              </div>
              <div className="wave-hero-desc">
                {(() => {
                  const activeLabels = activeProviders
                    .map((k) => WAVE_PROVIDER_OPTIONS.find((o) => o.key === k)?.label)
                    .filter(Boolean) as string[];
                  if (activeLabels.length === 0) {
                    return lang === "ru"
                      ? "Сервисы не выбраны. Выберите платформы в Настройках → Общие."
                      : "No services selected. Choose platforms in Settings → General.";
                  }
                  const servicesStr =
                    activeLabels.length === 1
                      ? activeLabels[0]
                      : `${activeLabels.slice(0, -1).join(", ")} ${lang === "ru" ? "и" : "and"} ${activeLabels[activeLabels.length - 1]}`;
                  return lang === "ru"
                    ? `Очередь собирается из ${servicesStr}. Выбрать платформы можно в Настройках → Общие.`
                    : `The queue is assembled from ${servicesStr}. You can change platforms in Settings → General.`;
                })()}
              </div>

              <div className="wave-hero-actions">
                <button
                  type="button"
                  className="btn-wave-primary"
                  onClick={handleLaunchWave}
                  disabled={building || activeProviders.length === 0}
                  title={
                    activeProviders.length === 0
                      ? lang === "ru"
                        ? "Выберите хотя бы один сервис"
                        : "Select at least one service"
                      : undefined
                  }
                >
                  {building ? (
                    <span className="spinner" style={{ width: 13, height: 13, borderWidth: 2 }} />
                  ) : playing ? (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                      <rect x="6" y="4" width="4" height="16" />
                      <rect x="14" y="4" width="4" height="16" />
                    </svg>
                  ) : (
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                      <polygon points="5 3 19 12 5 21 5 3" />
                    </svg>
                  )}
                  <span>
                    {building
                      ? lang === "ru"
                        ? "Сборка…"
                        : "Building…"
                      : playing
                        ? lang === "ru"
                          ? "Пауза"
                          : "Pause"
                        : waveNow
                          ? lang === "ru"
                            ? "Продолжить"
                            : "Resume"
                          : lang === "ru"
                            ? "Запустить волну"
                            : "Launch Wave"}
                  </span>
                </button>

                <button
                  type="button"
                  className="btn-wave-icon"
                  onClick={handleRefreshWave}
                  disabled={building || activeProviders.length === 0}
                  title={t(lang, "wave.refresh")}
                >
                  <svg
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <polyline points="23 4 23 10 17 10" />
                    <polyline points="1 20 1 14 7 14" />
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
                  </svg>
                </button>

                {waveTracks.length > 0 && (
                  <div className="sort-dropdown-wrap" onClick={(e) => e.stopPropagation()}>
                    <button
                      className={`btn-pill ${sort !== "custom" ? "btn-pill-active" : ""}`}
                      onClick={() => setSortDropdownOpen((v) => !v)}
                      style={{ height: 40 }}
                    >
                      <svg
                        width="12"
                        height="12"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M7 15l5 5 5-5M7 9l5-5 5 5" />
                      </svg>
                      <span>
                        {sort === "custom"
                          ? lang === "ru"
                            ? "Сортировка"
                            : "Sort"
                          : (sortOptions.find((o) => o.mode === sort)?.label ?? "")}
                        {sort !== "custom" && (dir === "asc" ? " ↑" : " ↓")}
                      </span>
                      <span style={{ fontSize: 9, opacity: 0.7, marginLeft: 2 }}>▾</span>
                    </button>
                    {sortDropdownOpen && (
                      <div className="sort-dropdown-menu">
                        {sortOptions.map((opt) => (
                          <div
                            key={opt.mode}
                            className={`sort-dropdown-item ${sort === opt.mode ? "active" : ""}`}
                            onClick={() => {
                              toggleSort(opt.mode);
                              setSortDropdownOpen(false);
                            }}
                          >
                            <span>{opt.label}</span>
                            {sort === opt.mode && opt.mode !== "custom" && (
                              <span className="sort-dropdown-badge">
                                {dir === "asc" ? "↑" : "↓"}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            <div className="wave-hero-right">
              <div className={`wave-visualizer ${playing ? "playing" : "paused"}`}>
                {[
                  25, 38, 55, 72, 88, 62, 45, 30, 48, 70, 92, 100, 84, 65, 42, 58, 80, 95, 88, 70,
                  52, 35, 45, 68, 85, 96, 78, 60, 40, 55, 75, 90, 82, 64, 46, 32, 50, 72, 94, 86,
                  68, 50, 36, 48, 70, 85, 65, 40,
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
        </div>

        <div className="page-panel-body">
          {waveTracks.length === 0 ? (
            <div className="empty">
              <div className="t1">{t(lang, "wave.emptyTrack")}</div>
            </div>
          ) : (
            <div className="tracklist">
              {visible.map((track, i) => (
                <TrackRow
                  key={`${track.provider}:${track.id}`}
                  track={track}
                  index={i}
                  nowKey={nowKey}
                  onPlay={playOne}
                  onArtistClick={(name, provider) =>
                    navigateTo("artist", { artist: name, provider })
                  }
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
