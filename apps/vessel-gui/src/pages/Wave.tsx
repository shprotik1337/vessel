import { useEffect, useState } from "react";

import { useApp } from "../store";
import { TrackRow } from "../components/TrackRow";
import { PlatformIcon } from "../components/PlatformIcon";
import { trackKey, artistLabel } from "../lib/utils";
import { t } from "../i18n";
import type { TrackRef } from "../api/types";
import * as api from "../api/commands";

type SortMode = "custom" | "title" | "artist";
type SortDir = "asc" | "desc";

const WAVE_PROVIDER_OPTIONS = [
  { key: "youtube_music", label: "YouTube Music", color: "#FF0000" },
  { key: "soundcloud", label: "SoundCloud", color: "#FF5500" },
  { key: "spotify", label: "Spotify", color: "#1DB954" },
  { key: "yandex", label: "Yandex Music", color: "#FFCC00" },
  { key: "deezer", label: "Deezer", color: "#A238FF" },
];

export function WavePage() {
  const { state, playTracks, showToast, refresh, navigateTo, goBack, lang, waveTracks, setWaveTracks, setIsWaveActive } = useApp();
  const [building, setBuilding] = useState(false);
  const [providers, setProviders] = useState<string>("all");
  const [sort, setSort] = useState<SortMode>("custom");
  const [dir, setDir] = useState<SortDir>("desc");
  const [sortDropdownOpen, setSortDropdownOpen] = useState(false);

  useEffect(() => {
    void api.getWaveProviders().then(setProviders).catch(() => {});
    const onProvidersChanged = (e: any) => {
      setProviders(e.detail || "all");
    };
    window.addEventListener("vessel:wave-providers-changed", onProvidersChanged);
    return () => window.removeEventListener("vessel:wave-providers-changed", onProvidersChanged);
  }, []);

  useEffect(() => {
    if (!sortDropdownOpen) return;
    const close = () => setSortDropdownOpen(false);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [sortDropdownOpen]);

  if (!state) return null;

  const nowKey = state.now_playing ? trackKey(state.now_playing) : null;
  const waveNow = state?.now_playing
    ? waveTracks.some((t) => trackKey(t) === trackKey(state.now_playing!))
    : false;
  const isLive =
    state?.player.status === "playing" || state?.player.status === "buffering";
  const playing = waveNow && isLive;

  const buildWave = async (source: "favorites" | "playlists", playlistId: string | null, autoplay = true) => {
    if (building) return;
    setBuilding(true);
    try {
      const tracks = await api.getWaveRecommendations(source, 50, playlistId, providers);
      setWaveTracks(tracks);
      if (tracks.length > 0) {
        if (autoplay) {
          setIsWaveActive(true);
          await api.playTracks(tracks, 0);
        } else {
          showToast(lang === "ru" ? `Собрано ${tracks.length} треков` : `Loaded ${tracks.length} tracks`);
        }
      } else {
        showToast(t(lang, "wave.empty1"), true);
      }
      await refresh();
    } catch (error) {
      showToast(String(error), true);
    } finally {
      setBuilding(false);
    }
  };

  const allKeys = WAVE_PROVIDER_OPTIONS.map((o) => o.key);
  const activeProviders = providers === "all" ? allKeys : !providers ? [] : providers.split(",").filter(Boolean);

  const handleToggleProvider = async (key: string) => {
    let next: string[];
    if (activeProviders.includes(key)) {
      next = activeProviders.filter((k) => k !== key);
    } else {
      next = [...activeProviders, key];
    }
    const val = next.length === allKeys.length ? "all" : next.join(",");
    setProviders(val);
    try {
      await api.setWaveProviders(val);
    } catch {}
    window.dispatchEvent(new CustomEvent("vessel:wave-providers-changed", { detail: val }));
  };

  const handleLaunchWave = async () => {
    if (activeProviders.length === 0) {
      showToast(lang === "ru" ? "Выберите хотя бы один сервис для Моей волны" : "Please select at least one service", true);
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
      await buildWave("favorites", null, true);
    }
  };

  const handleRefreshWave = async () => {
    await buildWave("favorites", null, false);
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
        <button className="btn btn-outline btn-sm" onClick={goBack} title={t(lang, "common.back")}>
          {t(lang, "common.back")}
        </button>
      </div>

      <div className="page-panel">
        {glowArt ? (
          <div
            className="page-ambient-glow"
            style={{ backgroundImage: `url("${glowArt}")` }}
          />
        ) : (
          <div className="page-ambient-glow-fallback" />
        )}

        <div className="page-panel-header" style={{ borderBottom: "none", paddingBottom: 0 }}>
          <div className="wave-hero-card">
            <div className="wave-hero-left">
              <div className="wave-hero-tag">
                <span>{lang === "ru" ? "МОЯ ВОЛНА" : "MY WAVE"}</span>
              </div>
              <div className="wave-hero-title">
                {lang === "ru" ? "Персональный поток без лишнего шума" : "Personal stream without extra noise"}
              </div>
              <div className="wave-hero-desc">
                {(() => {
                  const activeLabels = activeProviders
                    .map((k) => WAVE_PROVIDER_OPTIONS.find((o) => o.key === k)?.label)
                    .filter(Boolean) as string[];
                  if (activeLabels.length === 0) {
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
                <button
                  type="button"
                  className="btn-wave-primary"
                  onClick={handleLaunchWave}
                  disabled={building || activeProviders.length === 0}
                  title={activeProviders.length === 0 ? (lang === "ru" ? "Выберите хотя бы один сервис" : "Select at least one service") : undefined}
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
                  onClick={handleRefreshWave}
                  disabled={building || activeProviders.length === 0}
                  title={t(lang, "wave.refresh")}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="23 4 23 10 17 10"/>
                    <polyline points="1 20 1 14 7 14"/>
                    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
                  </svg>
                </button>

                {waveTracks.length > 0 && (
                  <div className="sort-dropdown-wrap" onClick={(e) => e.stopPropagation()}>
                    <button
                      className={`btn-pill ${sort !== "custom" ? "btn-pill-active" : ""}`}
                      onClick={() => setSortDropdownOpen((v) => !v)}
                      style={{ height: 40 }}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M7 15l5 5 5-5M7 9l5-5 5 5"/></svg>
                      <span>
                        {sort === "custom"
                          ? (lang === "ru" ? "Сортировка" : "Sort")
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

              {/* Multi-select Service Chips (colored brand icons, rounded rectangles) */}
              <div className="wave-services-row">
                {WAVE_PROVIDER_OPTIONS.map((p) => {
                  const isSelected = activeProviders.includes(p.key);
                  return (
                    <div
                      key={p.key}
                      className={`wave-service-chip ${isSelected ? "active" : ""}`}
                      onClick={() => void handleToggleProvider(p.key)}
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
        </div>

        <div className="page-panel-body">
          {waveTracks.length === 0 ? (
            <div className="empty">
              <div className="ico">≈</div>
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
                  onArtistClick={(name, provider) => navigateTo("artist", { artist: name, provider })}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}