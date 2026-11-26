import { useEffect, useRef, useState } from "react";
import { useApp } from "../../../store";
import { PlatformIcon } from "../../../components/PlatformIcon";
import { resolveArtworkUrl } from "../../../lib/utils";
import type { DiscordRpcSettings, DiscordStatusFormat } from "../../../api/types";
import * as api from "../../../api/commands";

const DEFAULT_SETTINGS: DiscordRpcSettings = {
  status_format: "app",
  show_time: true,
  show_artwork: true,
  custom_artwork_url: "",
  show_small_icon: true,
  show_paused: true,
  show_download_button: true,
};

const FORMAT_OPTIONS: Array<{
  value: DiscordStatusFormat;
  ru: string;
  en: string;
}> = [
  { value: "app", ru: "Название приложения", en: "App name" },
  { value: "artist", ru: "Исполнитель", en: "Artist" },
  { value: "title", ru: "Название трека", en: "Track title" },
  { value: "artist_title", ru: "Исполнитель — Трек", en: "Artist — Track" },
  { value: "title_artist", ru: "Трек — Исполнитель", en: "Track — Artist" },
];

export function DiscordSection() {
  const { state, lang, showToast } = useApp();
  const [discordRpc, setDiscordRpc] = useState(false);
  const [settings, setSettings] = useState<DiscordRpcSettings>(DEFAULT_SETTINGS);
  const [customArtInput, setCustomArtInput] = useState("");
  const [formatMenuOpen, setFormatMenuOpen] = useState(false);
  const [customArtError, setCustomArtError] = useState(false);
  const formatDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.getDiscordRpc().then(setDiscordRpc).catch(() => false);
    api
      .getDiscordRpcSettings()
      .then((loaded) => {
        setSettings(loaded);
        setCustomArtInput(loaded.custom_artwork_url || "");
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (
        formatDropdownRef.current &&
        !formatDropdownRef.current.contains(e.target as Node)
      ) {
        setFormatMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, []);

  useEffect(() => {
    setCustomArtError(false);
  }, [settings.custom_artwork_url]);

  const persistSettings = async (
    next: DiscordRpcSettings,
    toastMsg?: string,
  ): Promise<boolean> => {
    const prev = settings;
    setSettings(next);
    try {
      const saved = await api.setDiscordRpcSettings(next);
      setSettings(saved);
      setCustomArtInput(saved.custom_artwork_url);
      if (toastMsg) {
        showToast(toastMsg);
      }
      return true;
    } catch (e) {
      setSettings(prev);
      showToast(String(e), true);
      return false;
    }
  };

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

  const handleSelectFormat = async (value: DiscordStatusFormat) => {
    setFormatMenuOpen(false);
    await persistSettings({
      ...settings,
      status_format: value,
    });
  };

  const handleSaveCustomArtwork = async () => {
    const trimmed = customArtInput.trim();
    if (trimmed) {
      if (!trimmed.startsWith("https://")) {
        showToast(
          lang === "ru"
            ? "Нужна прямая https://-ссылка на картинку или GIF (локальные файлы Discord не принимает)."
            : "Please use a direct https:// image or GIF URL (Discord does not support local files).",
          true,
        );
        return;
      }
      if (trimmed.length > 256) {
        showToast(
          lang === "ru"
            ? "Ссылка слишком длинная — Discord принимает до 256 символов."
            : "URL is too long — Discord allows up to 256 characters.",
          true,
        );
        return;
      }
    }
    await persistSettings(
      {
        ...settings,
        custom_artwork_url: trimmed,
      },
      trimmed
        ? (lang === "ru" ? "Своя обложка для Discord сохранена" : "Custom Discord cover saved")
        : (lang === "ru" ? "Своя обложка сброшена" : "Custom Discord cover reset"),
    );
  };

  const handleResetCustomArtwork = async () => {
    setCustomArtInput("");
    await persistSettings(
      {
        ...settings,
        custom_artwork_url: "",
      },
      lang === "ru" ? "Используется обложка трека" : "Using track artwork",
    );
  };

  const isRu = lang === "ru";
  const track = state?.now_playing;
  const trackTitle = track?.title || "False Direction";
  const trackArtist = track?.artists?.length ? track.artists.join(", ") : "Dayglow";
  const previewProvider = track?.provider || "spotify";
  const isPaused = state?.player?.status === "paused";
  const pausedSuffix = isPaused ? (isRu ? " (Пауза)" : " (Paused)") : "";

  let previewListeningTarget = "Vessel";
  let previewDetails = trackTitle;
  let previewState = `${trackArtist}${pausedSuffix}`;

  switch (settings.status_format) {
    case "title":
      previewListeningTarget = trackTitle;
      previewDetails = `${trackTitle}${pausedSuffix}`;
      previewState = trackArtist;
      break;
    case "artist_title":
      previewListeningTarget = `${trackArtist} — ${trackTitle}`;
      previewDetails = trackTitle;
      previewState = `${trackArtist} — ${trackTitle}${pausedSuffix}`;
      break;
    case "title_artist":
      previewListeningTarget = `${trackTitle} — ${trackArtist}`;
      previewDetails = `${trackTitle} — ${trackArtist}${pausedSuffix}`;
      previewState = trackArtist;
      break;
    case "artist":
      previewListeningTarget = trackArtist;
      previewDetails = trackTitle;
      previewState = `${trackArtist}${pausedSuffix}`;
      break;
    case "app":
    default:
      previewListeningTarget = "Vessel";
      previewDetails = trackTitle;
      previewState = `${trackArtist}${pausedSuffix}`;
      break;
  }

  const resolvedTrackArtwork = resolveArtworkUrl(track?.artwork_url);
  const previewArtworkUrl = settings.show_artwork
    ? (settings.custom_artwork_url.trim() && !customArtError
        ? settings.custom_artwork_url.trim()
        : resolvedTrackArtwork || null)
    : null;

  const activeFormatOption =
    FORMAT_OPTIONS.find((opt) => opt.value === settings.status_format) ||
    FORMAT_OPTIONS[0];

  const hiddenByPause = isPaused && !settings.show_paused;

  return (
    <div>
      <div className="sett-page-header">
        <h1 className="sett-page-title">Discord RPC</h1>
        <p className="sett-page-sub">
          {isRu
            ? "Настройте, как играющий трек, обложка и профиль отображаются в Discord."
            : "Customize how your playing track, artwork and profile appear in Discord."}
        </p>
      </div>

      {/* Main toggle & live preview */}
      <div className="sett-group-card">
        <div className="sett-row">
          <div className="sett-row-info">
            <div className="sett-row-title">
              {isRu ? "Включить Discord RPC" : "Enable Discord RPC"}
            </div>
            <div className="sett-row-desc">
              {isRu
                ? "Передавать текущий статус прослушивания в карточку профиля Discord."
                : "Broadcast your live listening status to your Discord profile card."}
            </div>
          </div>
          <label className="sett-switch">
            <input
              type="checkbox"
              checked={discordRpc}
              onChange={(e) => void handleDiscordRpcToggle(e.target.checked)}
            />
            <span className="sett-slider" />
          </label>
        </div>

        {discordRpc && (
          <div className="sett-row-col">
            <div className="sett-row-title" style={{ marginBottom: 10 }}>
              {isRu ? "Предпросмотр карточки" : "Card Preview"}
            </div>
            <div className={`sett-discord-preview-card ${hiddenByPause ? "is-hidden-pause" : ""}`}>
              <div className="sett-discord-preview-head">
                <span>
                  {hiddenByPause
                    ? (isRu ? "Статус скрыт на паузе" : "Hidden while paused")
                    : (isRu
                        ? `Слушает ${previewListeningTarget}`
                        : `Listening to ${previewListeningTarget}`)}
                </span>
              </div>

              <div className="sett-discord-preview-body">
                <div className="sett-discord-art-wrap">
                  <div className="sett-discord-art">
                    {previewArtworkUrl ? (
                      <img src={previewArtworkUrl} alt="Discord RPC artwork" />
                    ) : settings.show_artwork ? (
                      <span style={{ fontWeight: 800, fontSize: 18 }}>V</span>
                    ) : (
                      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.55 }}>
                        <path d="M9 18V5l12-2v13" />
                        <circle cx="6" cy="18" r="3" />
                        <circle cx="18" cy="16" r="3" />
                      </svg>
                    )}
                  </div>
                  {settings.show_small_icon && (
                    <div className="sett-discord-small-badge" title={previewProvider}>
                      <PlatformIcon kind={previewProvider} size={13} />
                    </div>
                  )}
                </div>

                <div className="sett-discord-meta">
                  <div className="sett-discord-track">{previewDetails}</div>
                  <div className="sett-discord-artist">{previewState}</div>
                  {settings.show_time && !isPaused && (
                    <div className="sett-discord-bar">
                      <div className="sett-discord-bar-fill" />
                    </div>
                  )}
                </div>
              </div>

              {settings.show_download_button && (
                <div className="sett-discord-preview-btn">
                  {isRu ? "Скачать Vessel" : "Download Vessel"}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Display parameters */}
      <div className="sett-section-title">
        {isRu ? "Настройки карточки" : "Activity Appearance"}
      </div>
      <div className="sett-group-card">
        {/* Status format dropdown */}
        <div className="sett-row">
          <div className="sett-row-info">
            <div className="sett-row-title">
              {isRu ? "Заголовок" : "Heading"}
            </div>
            <div className="sett-row-desc">
              {isRu
                ? "Какая строка попадёт в заголовок активности в списке друзей."
                : "Choose what appears as the listening title in Discord."}
            </div>
          </div>

          <div className="sett-dropdown-wrap sett-discord-dropdown" ref={formatDropdownRef}>
            <button
              type="button"
              className="sett-dropdown-trigger"
              onClick={() => setFormatMenuOpen((v) => !v)}
            >
              <span>{isRu ? activeFormatOption.ru : activeFormatOption.en}</span>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="6 9 12 15 18 9" />
              </svg>
            </button>
            {formatMenuOpen && (
              <div className="sett-dropdown-menu">
                {FORMAT_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    className={`sett-dropdown-option ${settings.status_format === opt.value ? "active" : ""}`}
                    onClick={() => void handleSelectFormat(opt.value)}
                  >
                    <span>{isRu ? opt.ru : opt.en}</span>
                    {settings.status_format === opt.value && <span>✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Track timeline */}
        <div className="sett-row">
          <div className="sett-row-info">
            <div className="sett-row-title">
              {isRu ? "Шкала времени трека" : "Track timeline"}
            </div>
            <div className="sett-row-desc">
              {isRu
                ? "Показывать прошедшее время и полоску длительности трека."
                : "Show elapsed time and playback progress bar."}
            </div>
          </div>
          <label className="sett-switch">
            <input
              type="checkbox"
              checked={settings.show_time}
              onChange={(e) =>
                void persistSettings({ ...settings, show_time: e.target.checked })
              }
            />
            <span className="sett-slider" />
          </label>
        </div>

        {/* Track artwork toggle */}
        <div className="sett-row">
          <div className="sett-row-info">
            <div className="sett-row-title">
              {isRu ? "Обложка трека" : "Track artwork"}
            </div>
            <div className="sett-row-desc">
              {isRu
                ? "Отображать обложку композиции или свою картинку в карточке Discord."
                : "Display track cover art or a custom image in your Discord card."}
            </div>
          </div>
          <label className="sett-switch">
            <input
              type="checkbox"
              checked={settings.show_artwork}
              onChange={(e) =>
                void persistSettings({ ...settings, show_artwork: e.target.checked })
              }
            />
            <span className="sett-slider" />
          </label>
        </div>

        {/* Custom artwork URL */}
        {settings.show_artwork && (
          <div className="sett-row-col">
            <div className="sett-row-info" style={{ marginBottom: 10 }}>
              <div className="sett-row-title">
                {isRu ? "Своя обложка для Discord" : "Custom Discord artwork"}
              </div>
              <div className="sett-row-desc">
                {isRu
                  ? "Вставьте прямую https://-ссылку на картинку или GIF (до 256 символов). Если оставить пустым, используется обложка трека."
                  : "Paste a direct https:// image or GIF URL (up to 256 chars). Leave empty to use track artwork."}
              </div>
            </div>
            <div className="sett-inline-form">
              <div className="sett-discord-custom-thumb">
                {settings.custom_artwork_url && !customArtError ? (
                  <img
                    src={settings.custom_artwork_url}
                    alt="Custom Discord cover"
                    onError={() => setCustomArtError(true)}
                  />
                ) : (
                  <span>URL</span>
                )}
              </div>
              <input
                type="url"
                className="sett-input"
                maxLength={256}
                placeholder="https://example.com/cover.gif"
                value={customArtInput}
                onChange={(e) => setCustomArtInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    void handleSaveCustomArtwork();
                  }
                }}
              />
              <button
                type="button"
                className="sett-btn-primary"
                onClick={() => void handleSaveCustomArtwork()}
              >
                {isRu ? "Сохранить" : "Save"}
              </button>
              {settings.custom_artwork_url && (
                <button
                  type="button"
                  className="sett-btn-secondary"
                  onClick={() => void handleResetCustomArtwork()}
                >
                  {isRu ? "Сбросить" : "Reset"}
                </button>
              )}
            </div>
          </div>
        )}

        {/* Small service badge toggle */}
        <div className="sett-row">
          <div className="sett-row-info">
            <div className="sett-row-title">
              {isRu ? "Значок сервиса на обложке" : "Service badge on cover"}
            </div>
            <div className="sett-row-desc">
              {isRu
                ? "Показывать иконку платформы (Spotify, YouTube и др.) в углу обложки."
                : "Show the streaming platform icon in the corner of the cover."}
            </div>
          </div>
          <label className="sett-switch">
            <input
              type="checkbox"
              checked={settings.show_small_icon}
              onChange={(e) =>
                void persistSettings({
                  ...settings,
                  show_small_icon: e.target.checked,
                })
              }
            />
            <span className="sett-slider" />
          </label>
        </div>

        {/* Show while paused */}
        <div className="sett-row">
          <div className="sett-row-info">
            <div className="sett-row-title">
              {isRu ? "Показывать на паузе" : "Show while paused"}
            </div>
            <div className="sett-row-desc">
              {isRu
                ? "Оставлять карточку в Discord с пометкой паузы, когда музыка остановлена."
                : "Keep the Discord card visible with a paused indicator when music is paused."}
            </div>
          </div>
          <label className="sett-switch">
            <input
              type="checkbox"
              checked={settings.show_paused}
              onChange={(e) =>
                void persistSettings({ ...settings, show_paused: e.target.checked })
              }
            />
            <span className="sett-slider" />
          </label>
        </div>
      </div>

      {/* Profile button */}
      <div className="sett-section-title">
        {isRu ? "Кнопка в профиле" : "Profile Button"}
      </div>
      <div className="sett-group-card">
        <div className="sett-row">
          <div className="sett-row-info">
            <div className="sett-row-title">
              {isRu ? "Кнопка «Скачать Vessel»" : "«Download Vessel» button"}
            </div>
            <div className="sett-row-desc">
              {isRu
                ? "Добавляет в карточку Discord кнопку со ссылкой на последний релиз Vessel на GitHub."
                : "Adds a button to your Discord card linking to the latest Vessel release on GitHub."}
            </div>
          </div>
          <label className="sett-switch">
            <input
              type="checkbox"
              checked={settings.show_download_button}
              onChange={(e) =>
                void persistSettings({
                  ...settings,
                  show_download_button: e.target.checked,
                })
              }
            />
            <span className="sett-slider" />
          </label>
        </div>
      </div>
    </div>
  );
}
