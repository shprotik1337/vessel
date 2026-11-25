import { useEffect, useState } from "react";
import { useApp } from "../../../store";
import { PlatformIcon } from "../../../components/PlatformIcon";
import { clearExploreCache } from "../../home_sections/ExploreSection";
import { clearPersonalMixesCache } from "../../home_sections/PersonalMixesSection";
import { UNIFIED_PLATFORMS } from "../types";
import * as api from "../../../api/commands";

export function PlaybackSection() {
  const { lang, showToast } = useApp();

  const [autoSimilar, setAutoSimilar] = useState(() => localStorage.getItem("vessel_auto_similar") !== "false");
  const [restoreQueue, setRestoreQueue] = useState(() => localStorage.getItem("vessel_restore_queue") !== "false");
  const [autoplayLast, setAutoplayLast] = useState(() => localStorage.getItem("vessel_autoplay_last") === "true");
  const [audioAgc, setAudioAgc] = useState(() => localStorage.getItem("vessel_audio_agc") === "true");
  const [crossfadeEnabled, setCrossfadeEnabled] = useState(() => localStorage.getItem("vessel_crossfade_enabled") === "true");
  const [crossfadeSec, setCrossfadeSec] = useState(() => Number(localStorage.getItem("vessel_crossfade_sec") || 5));
  const [autoCache, setAutoCache] = useState(() => localStorage.getItem("vessel_auto_cache") !== "false");
  const [autostart, setAutostart] = useState(() => localStorage.getItem("vessel_autostart") === "true");
  const [minimizeToTray, setMinimizeToTray] = useState(() => localStorage.getItem("vessel_tray") !== "false");

  const [selectedRecProviders, setSelectedRecProviders] = useState<string[]>(() => UNIFIED_PLATFORMS.map((p) => p.key));
  const [allSelectedRec, setAllSelectedRec] = useState(true);

  useEffect(() => {
    void api.getAutoCache().then((val) => {
      setAutoCache(val);
      localStorage.setItem("vessel_auto_cache", String(val));
    }).catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const provVal = await api.getRecommendationProviders().catch(() => "all");
        if (cancelled) return;
        if (provVal === "all" || !provVal) {
          setAllSelectedRec(true);
          setSelectedRecProviders(UNIFIED_PLATFORMS.map((p) => p.key));
        } else {
          const list = provVal.split(",").filter((k) => UNIFIED_PLATFORMS.some((p) => p.key === k));
          setAllSelectedRec(list.length === UNIFIED_PLATFORMS.length);
          setSelectedRecProviders(list);
        }
      } catch {}
    })();
    return () => { cancelled = true; };
  }, []);

  const toggleAutoSimilar = (val: boolean) => {
    setAutoSimilar(val);
    localStorage.setItem("vessel_auto_similar", String(val));
  };

  const handleSetRestoreQueue = (val: boolean) => {
    setRestoreQueue(val);
    localStorage.setItem("vessel_restore_queue", String(val));
  };

  const toggleAutoplayLast = (val: boolean) => {
    setAutoplayLast(val);
    localStorage.setItem("vessel_autoplay_last", String(val));
  };

  const toggleAudioAgc = (val: boolean) => {
    setAudioAgc(val);
    localStorage.setItem("vessel_audio_agc", String(val));
    void api.setAudioAgc(val);
    showToast(
      val
        ? (lang === "ru" ? "Нормализация AGC активна" : "AGC normalization active")
        : (lang === "ru" ? "Нормализация отключена" : "Normalization disabled"),
    );
  };

  const toggleCrossfade = (val: boolean) => {
    setCrossfadeEnabled(val);
    localStorage.setItem("vessel_crossfade_enabled", String(val));
    void api.setCrossfade(val ? crossfadeSec * 1000 : 0);
    showToast(
      val
        ? (lang === "ru" ? `Кроссфейд включён (${crossfadeSec} сек)` : `Crossfade enabled (${crossfadeSec}s)`)
        : (lang === "ru" ? "Кроссфейд отключён" : "Crossfade disabled"),
    );
  };

  const changeCrossfadeSec = (sec: number) => {
    setCrossfadeSec(sec);
    localStorage.setItem("vessel_crossfade_sec", String(sec));
    if (crossfadeEnabled) {
      void api.setCrossfade(sec * 1000);
    }
  };

  const toggleAutoCache = (val: boolean) => {
    setAutoCache(val);
    localStorage.setItem("vessel_auto_cache", String(val));
    void api.setAutoCache(val);
  };

  const toggleAutostart = (val: boolean) => {
    setAutostart(val);
    localStorage.setItem("vessel_autostart", String(val));
    showToast(val ? (lang === "ru" ? "Автозапуск включён" : "Autostart enabled") : (lang === "ru" ? "Автозапуск выключен" : "Autostart disabled"));
  };

  const toggleMinimizeToTray = (val: boolean) => {
    setMinimizeToTray(val);
    localStorage.setItem("vessel_tray", String(val));
  };

  const handleToggleAllRec = async () => {
    const nextAll = !allSelectedRec;
    setAllSelectedRec(nextAll);
    const nextList = nextAll ? UNIFIED_PLATFORMS.map((p) => p.key) : [UNIFIED_PLATFORMS[0].key];
    setSelectedRecProviders(nextList);
    try {
      const val = nextAll ? "all" : nextList.join(",");
      await Promise.all([api.setRecommendationProviders(val), api.setWaveProviders(val)]);
      clearExploreCache();
      clearPersonalMixesCache();
      window.dispatchEvent(new CustomEvent("vessel:providers-changed", { detail: val }));
      window.dispatchEvent(new CustomEvent("vessel:wave-providers-changed", { detail: val }));
      showToast(lang === "ru" ? "Платформы обновлены" : "Platforms updated");
    } catch (e) {
      showToast(String(e), true);
    }
  };

  const handleToggleRecPlatform = async (key: string) => {
    const allKeys = UNIFIED_PLATFORMS.map((p) => p.key);
    const current = allSelectedRec ? allKeys : [...selectedRecProviders];
    let next: string[];

    if (!current.includes(key)) {
      next = [...current, key];
    } else if (current.length > 1) {
      next = current.filter((k) => k !== key);
    } else {
      showToast(
        lang === "ru" ? "Должна быть выбрана хотя бы одна платформа" : "At least one platform must be selected",
        true,
      );
      return;
    }

    const isAll = next.length === allKeys.length;
    setAllSelectedRec(isAll);
    setSelectedRecProviders(next);
    try {
      const val = isAll ? "all" : next.join(",");
      await Promise.all([api.setRecommendationProviders(val), api.setWaveProviders(val)]);
      clearExploreCache();
      clearPersonalMixesCache();
      window.dispatchEvent(new CustomEvent("vessel:providers-changed", { detail: val }));
      window.dispatchEvent(new CustomEvent("vessel:wave-providers-changed", { detail: val }));
      showToast(lang === "ru" ? "Платформы обновлены" : "Platforms updated");
    } catch (e) {
      showToast(String(e), true);
    }
  };

  return (
    <div>
      <div className="sett-page-header">
        <h1 className="sett-page-title">
          {lang === "ru" ? "Воспроизведение" : "Playback"}
        </h1>
        <p className="sett-page-sub">
          {lang === "ru"
            ? "Поведение очереди, настройка платформ для рекомендаций и параметры запуска."
            : "Queue behavior, recommendation platforms and startup options."}
        </p>
      </div>

      {/* Group 1: Queue & Playback */}
      <div className="sett-group-card">
        <div className="sett-row">
          <div className="sett-row-info">
            <div className="sett-row-title">
              {lang === "ru" ? "Автовоспроизведение похожих треков" : "Autoplay Similar Tracks"}
            </div>
            <div className="sett-row-desc">
              {lang === "ru"
                ? "Автоматически добавлять похожие песни, когда очередь заканчивается."
                : "Automatically add similar songs when the queue ends."}
            </div>
          </div>
          <label className="sett-switch">
            <input
              type="checkbox"
              checked={autoSimilar}
              onChange={(e) => toggleAutoSimilar(e.target.checked)}
            />
            <span className="sett-slider" />
          </label>
        </div>

        <div className="sett-row">
          <div className="sett-row-info">
            <div className="sett-row-title">
              {lang === "ru" ? "Контекст воспроизведения по умолчанию" : "Default Playback Context"}
            </div>
            <div className="sett-row-desc">
              {lang === "ru"
                ? "Восстанавливать последнюю очередь при запуске или начинать пустым."
                : "Restore the last queue on startup or start empty."}
            </div>
          </div>
          <div className="sett-pill-switch">
            <button
              type="button"
              className={`sett-pill-opt ${restoreQueue ? "active" : ""}`}
              onClick={() => handleSetRestoreQueue(true)}
            >
              {lang === "ru" ? "Восстановить очередь" : "Restore queue"}
            </button>
            <button
              type="button"
              className={`sett-pill-opt ${!restoreQueue ? "active" : ""}`}
              onClick={() => handleSetRestoreQueue(false)}
            >
              {lang === "ru" ? "Начать пустым" : "Start empty"}
            </button>
          </div>
        </div>

        <div className="sett-row">
          <div className="sett-row-info">
            <div className="sett-row-title">
              {lang === "ru" ? "Автовоспроизведение последнего трека" : "Autoplay Last Track"}
            </div>
            <div className="sett-row-desc">
              {lang === "ru"
                ? "Продолжать воспроизведение последней песни сразу после старта программы."
                : "Resume playing the last song right after launching Vessel."}
            </div>
          </div>
          <label className="sett-switch">
            <input
              type="checkbox"
              checked={autoplayLast}
              onChange={(e) => toggleAutoplayLast(e.target.checked)}
            />
            <span className="sett-slider" />
          </label>
        </div>
      </div>

      {/* Group 2: Audio & Cache */}
      <div className="sett-section-label">
        {lang === "ru" ? "Звук и потоковое кэширование" : "Audio & Stream Caching"}
      </div>
      <div className="sett-group-card">
        <div className="sett-row">
          <div className="sett-row-info">
            <div className="sett-row-title">
              {lang === "ru" ? "Нормализация громкости (AGC)" : "Volume Normalization (AGC)"}
            </div>
            <div className="sett-row-desc">
              {lang === "ru"
                ? "Автоматически выравнивать уровень громкости между тихими и громкими треками."
                : "Automatically level volume across quiet and loud tracks."}
            </div>
          </div>
          <label className="sett-switch">
            <input
              type="checkbox"
              checked={audioAgc}
              onChange={(e) => toggleAudioAgc(e.target.checked)}
            />
            <span className="sett-slider" />
          </label>
        </div>

        <div className="sett-row-col">
          <div className="sett-row-top">
            <div className="sett-row-info">
              <div className="sett-row-title">
                {lang === "ru" ? "Плавный переход между треками (Crossfade)" : "Smooth Crossfade"}
              </div>
              <div className="sett-row-desc">
                {lang === "ru"
                  ? "Постепенно затухает текущий трек и плавно нарастает следующий."
                  : "Gradually fade out current track while fading in the next."}
              </div>
            </div>
            <label className="sett-switch">
              <input
                type="checkbox"
                checked={crossfadeEnabled}
                onChange={(e) => toggleCrossfade(e.target.checked)}
              />
              <span className="sett-slider" />
            </label>
          </div>
          {crossfadeEnabled && (
            <div className="sett-sub-slider">
              <span className="sett-sub-slider-label">
                {lang === "ru" ? "Длительность" : "Duration"}
              </span>
              <input
                type="range"
                min="1"
                max="12"
                step="1"
                value={crossfadeSec}
                onChange={(e) => changeCrossfadeSec(Number(e.target.value))}
                className="sett-range-input"
              />
              <span className="sett-sub-slider-val">
                {crossfadeSec} {lang === "ru" ? "сек" : "s"}
              </span>
            </div>
          )}
        </div>

        <div className="sett-row">
          <div className="sett-row-info">
            <div className="sett-row-title">
              {lang === "ru" ? "Кэширование воспроизводимых треков" : "Cache Played Tracks"}
            </div>
            <div className="sett-row-desc">
              {lang === "ru"
                ? "Автоматически сохранять поток на диск во время прослушивания."
                : "Automatically save stream to disk while playing."}
            </div>
          </div>
          <label className="sett-switch">
            <input
              type="checkbox"
              checked={autoCache}
              onChange={(e) => toggleAutoCache(e.target.checked)}
            />
            <span className="sett-slider" />
          </label>
        </div>
      </div>

      {/* Group 3: Platforms & System */}
      <div className="sett-section-label">
        {lang === "ru" ? "Платформы и система" : "Platforms & System"}
      </div>
      <div className="sett-group-card">
        <div className="sett-row">
          <div className="sett-row-info">
            <div className="sett-row-title">
              {lang === "ru" ? "Платформы для рекомендаций и Волны" : "Recommendations & Wave Platforms"}
            </div>
            <div className="sett-row-desc">
              {lang === "ru"
                ? "Источники треков на главной странице и в Моей волне."
                : "Track sources on the Home page and in My Wave."}
            </div>
          </div>
          <div className="sett-platform-circles">
            <button
              type="button"
              onClick={handleToggleAllRec}
              title={lang === "ru" ? "Все платформы" : "All platforms"}
              className={`sett-platform-all-btn ${allSelectedRec ? "active" : ""}`}
            >
              A
            </button>
            {UNIFIED_PLATFORMS.map((p) => {
              const isSel = allSelectedRec || selectedRecProviders.includes(p.key);
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => handleToggleRecPlatform(p.key)}
                  title={p.label}
                  className={`sett-platform-circle ${isSel ? "active" : ""}`}
                >
                  <PlatformIcon
                    kind={p.key}
                    size={17}
                    color={isSel ? p.color : "var(--text3)"}
                    style={{ opacity: isSel ? 1 : 0.45 }}
                  />
                </button>
              );
            })}
          </div>
        </div>

        <div className="sett-row">
          <div className="sett-row-info">
            <div className="sett-row-title">
              {lang === "ru" ? "Автозапуск приложения" : "Launch on Startup"}
            </div>
            <div className="sett-row-desc">
              {lang === "ru"
                ? "Автоматически запускать Vessel при входе в систему Windows."
                : "Automatically launch Vessel on Windows login."}
            </div>
          </div>
          <label className="sett-switch">
            <input
              type="checkbox"
              checked={autostart}
              onChange={(e) => toggleAutostart(e.target.checked)}
            />
            <span className="sett-slider" />
          </label>
        </div>

        <div className="sett-row">
          <div className="sett-row-info">
            <div className="sett-row-title">
              {lang === "ru" ? "Сворачивать в трей" : "Minimize to Tray"}
            </div>
            <div className="sett-row-desc">
              {lang === "ru"
                ? "При закрытии окна сворачивать приложение в системный трей."
                : "Minimize to system tray instead of quitting when closing the window."}
            </div>
          </div>
          <label className="sett-switch">
            <input
              type="checkbox"
              checked={minimizeToTray}
              onChange={(e) => toggleMinimizeToTray(e.target.checked)}
            />
            <span className="sett-slider" />
          </label>
        </div>
      </div>
    </div>
  );
}
