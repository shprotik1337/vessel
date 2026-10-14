import { useState } from "react";
import { useApp } from "../../../store";
import * as api from "../../../api/commands";

interface AudioSectionProps {
  downloadDir: string;
  cacheDir: string;
  onOpenDirModal: (target: "download" | "cache") => void;
}

export function AudioSection({
  downloadDir,
  cacheDir,
  onOpenDirModal,
}: AudioSectionProps) {
  const { lang, showToast } = useApp();

  const [autoSimilar, setAutoSimilar] = useState(() => localStorage.getItem("vessel_auto_similar") !== "false");
  const [audioAgc, setAudioAgc] = useState(() => localStorage.getItem("vessel_audio_agc") === "true");
  const [autoplayLast, setAutoplayLast] = useState(() => localStorage.getItem("vessel_autoplay_last") === "true");
  const [crossfadeEnabled, setCrossfadeEnabled] = useState(() => localStorage.getItem("vessel_crossfade_enabled") === "true");
  const [crossfadeSec, setCrossfadeSec] = useState(() => Number(localStorage.getItem("vessel_crossfade_sec") || 5));
  const [autoCache, setAutoCache] = useState(() => localStorage.getItem("vessel_auto_cache") !== "false");

  const toggleAutoSimilar = (val: boolean) => {
    setAutoSimilar(val);
    localStorage.setItem("vessel_auto_similar", String(val));
  };

  const toggleAudioAgc = (val: boolean) => {
    setAudioAgc(val);
    localStorage.setItem("vessel_audio_agc", String(val));
    void api.setAudioAgc(val);
    showToast(val ? (lang === "ru" ? "Нормализация AGC активна" : "AGC normalization active") : (lang === "ru" ? "Нормализация отключена" : "Normalization disabled"));
  };

  const toggleAutoplayLast = (val: boolean) => {
    setAutoplayLast(val);
    localStorage.setItem("vessel_autoplay_last", String(val));
  };

  const toggleCrossfade = (val: boolean) => {
    setCrossfadeEnabled(val);
    localStorage.setItem("vessel_crossfade_enabled", String(val));
    void api.setCrossfade(val ? crossfadeSec * 1000 : 0);
    showToast(val ? (lang === "ru" ? `Кроссфейд включен (${crossfadeSec} сек)` : `Crossfade enabled (${crossfadeSec}s)`) : (lang === "ru" ? "Кроссфейд отключен" : "Crossfade disabled"));
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
  };

  return (
    <div>
      <div className="sett-page-header">
        <h1 className="sett-page-title">
          {lang === "ru" ? "Настройки аудио" : "Audio Settings"}
        </h1>
        <p className="sett-page-sub">
          {lang === "ru"
            ? "Параметры воспроизведения, нормализация и локальный аудиокэш"
            : "Playback parameters, normalization and local audio cache"}
        </p>
      </div>

      <div className="sett-section-title">
        {lang === "ru" ? "ВЫВОД ЗВУКА" : "AUDIO OUTPUT"}
      </div>
      <div className="sett-card">
        <div className="sett-card-info">
          <div className="sett-card-title">
            {lang === "ru" ? "Устройство вывода звука" : "Audio Output Device"}
          </div>
          <div className="sett-card-desc">
            {lang === "ru" ? "Системное устройство воспроизведения по умолчанию" : "Default system output device"}
          </div>
        </div>
        <div style={{ marginTop: 12 }}>
          <select
            className="sett-token-input"
            style={{ width: "100%", cursor: "pointer" }}
            defaultValue="default"
          >
            <option value="default">
              {lang === "ru" ? "По умолчанию (Системный динамик / Наушники)" : "Default (System Speaker / Headphones)"}
            </option>
            <option value="wasapi_exclusive">
              {lang === "ru" ? "WASAPI (Эксклюзивный режим)" : "WASAPI (Exclusive Mode)"}
            </option>
          </select>
        </div>
      </div>

      <div className="sett-section-title">
        {lang === "ru" ? "ОБРАБОТКА ЗВУКА" : "AUDIO PROCESSING"}
      </div>
      <div className="sett-card">
        <div className="sett-card-row">
          <div className="sett-card-info">
            <div className="sett-card-title">
              {lang === "ru" ? "Автопохожие треки (Бесконечное радио)" : "Auto-Similar Tracks (Endless Radio)"}
            </div>
            <div className="sett-card-desc">
              {lang === "ru"
                ? "Автоматически подбирать и проигрывать похожие треки, когда очередь воспроизведения подходит к концу"
                : "Automatically queue similar tracks when the current playback queue ends"}
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
      </div>

      <div className="sett-card">
        <div className="sett-card-row">
          <div className="sett-card-info">
            <div className="sett-card-title">
              {lang === "ru" ? "Нормализация громкости (AGC)" : "Volume Normalization (AGC)"}
            </div>
            <div className="sett-card-desc">
              {lang === "ru"
                ? "Автоматически выравнивать уровень громкости между тихими и громкими треками"
                : "Automatically equalize volume levels across quiet and loud tracks"}
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
      </div>

      <div className="sett-card">
        <div className="sett-card-row">
          <div className="sett-card-info">
            <div className="sett-card-title">
              {lang === "ru" ? "Автовоспроизведение последнего трека" : "Autoplay Last Track"}
            </div>
            <div className="sett-card-desc">
              {lang === "ru"
                ? "Продолжать воспроизведение последней песни сразу после старта программы"
                : "Resume playing the last track immediately after launching Vessel"}
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

      <div className="sett-card">
        <div className="sett-card-row">
          <div className="sett-card-info">
            <div className="sett-card-title">
              {lang === "ru" ? "Плавный переход между треками (Crossfade)" : "Smooth Crossfade"}
            </div>
            <div className="sett-card-desc">
              {lang === "ru"
                ? "Постепенно затухает текущий трек и плавно нарастает следующий"
                : "Gradually fade out current track while fading in next track"}
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
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid rgba(255, 255, 255, 0.05)" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <span className="sett-card-title">
                {lang === "ru" ? "Длительность плавного перехода" : "Crossfade Duration"}
              </span>
              <span style={{ fontWeight: 700, color: "var(--accent)" }}>{crossfadeSec} {lang === "ru" ? "сек" : "s"}</span>
            </div>
            <input
              type="range"
              min="1"
              max="12"
              step="1"
              value={crossfadeSec}
              onChange={(e) => changeCrossfadeSec(Number(e.target.value))}
              style={{ width: "100%", accentColor: "var(--accent)" }}
            />
          </div>
        )}
      </div>

      <div className="sett-card">
        <div className="sett-card-row">
          <div className="sett-card-info">
            <div className="sett-card-title">
              {lang === "ru" ? "Кэширование воспроизводимых треков" : "Cache Played Tracks"}
            </div>
            <div className="sett-card-desc">
              {lang === "ru"
                ? "Автоматически сохранять поток на диск во время прослушивания для экономии трафика"
                : "Automatically save stream to disk while playing to save bandwidth"}
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

      <div className="sett-section-title">
        {lang === "ru" ? "ДИРЕКТОРИИ ХРАНЕНИЯ" : "STORAGE DIRECTORIES"}
      </div>
      <div className="sett-card">
        <div className="sett-card-row">
          <div className="sett-card-info">
            <div className="sett-card-title">
              {lang === "ru" ? "Папка для загрузок" : "Downloads Directory"}
            </div>
            <div className="sett-card-desc" style={{ wordBreak: "break-all" }}>
              {downloadDir || (lang === "ru" ? "По умолчанию (~/Music/Vessel)" : "Default (~/Music/Vessel)")}
            </div>
          </div>
          <button
            type="button"
            className="sett-token-action-btn"
            onClick={() => onOpenDirModal("download")}
          >
            {lang === "ru" ? "Изменить" : "Change"}
          </button>
        </div>
      </div>

      <div className="sett-card">
        <div className="sett-card-row">
          <div className="sett-card-info">
            <div className="sett-card-title">
              {lang === "ru" ? "Папка аудиокэша" : "Audio Cache Directory"}
            </div>
            <div className="sett-card-desc" style={{ wordBreak: "break-all" }}>
              {cacheDir || (lang === "ru" ? "По умолчанию (~/AppData/Local/Vessel/cache)" : "Default (~/AppData/Local/Vessel/cache)")}
            </div>
          </div>
          <button
            type="button"
            className="sett-token-action-btn"
            onClick={() => onOpenDirModal("cache")}
          >
            {lang === "ru" ? "Изменить" : "Change"}
          </button>
        </div>
      </div>
    </div>
  );
}
