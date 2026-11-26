import { useState } from "react";
import { useApp } from "../../../store";
import { PlatformIcon } from "../../../components/PlatformIcon";
import {
  SERVICE_META,
  BROWSER_LOGIN,
  type BrowserLoginKind,
  type SettingsTab,
} from "../types";
import * as api from "../../../api/commands";

interface ServicesSectionProps {
  activeTab: SettingsTab;
}

export function ServicesSection({ activeTab }: ServicesSectionProps) {
  const { state, refresh, showToast, lang } = useApp();

  const [tokenInputs, setTokenInputs] = useState<Record<string, string>>({});
  const [savingService, setSavingService] = useState<string | null>(null);

  const serviceKey = activeTab.replace("service_", "");
  const meta = SERVICE_META[serviceKey] || {
    key: serviceKey,
    hint: lang === "ru" ? "Токен авторизации сервиса" : "Service authorization token",
    bg: "var(--accent)",
    brandColor: "var(--accent)",
  };
  const providerStatus = state?.providers.find((p) => p.kind === serviceKey);
  const isYt = serviceKey === "youtube_music";
  const isSpotify = serviceKey === "spotify";
  const isGuest = Boolean(providerStatus?.guest);
  const hasCredentials = Boolean(providerStatus?.has_credentials);
  const hasBrowserLogin = serviceKey in BROWSER_LOGIN;

  const displayName =
    serviceKey === "youtube_music"
      ? "YouTube"
      : providerStatus?.label || serviceKey;

  const statusTitle = hasCredentials
    ? (lang === "ru" ? "Вход выполнен" : "Signed in")
    : isYt || isGuest
    ? (lang === "ru" ? "Гостевой доступ" : "Guest access")
    : (lang === "ru" ? "Вход не выполнен" : "Not signed in");

  const statusSub = hasCredentials
    ? (lang === "ru"
        ? `Аккаунт ${displayName} подключён и активен.`
        : `${displayName} account is connected and active.`)
    : isYt
    ? (lang === "ru"
        ? "Работает без входа. Вход нужен только для переноса лайков."
        : "Works without signing in. Sign-in is only needed to transfer liked tracks.")
    : isGuest
    ? (lang === "ru"
        ? `Доступен гостевой режим. Вход в ${displayName} нужен только для переноса лайков.`
        : `Guest access active. Sign in to ${displayName} only to transfer liked tracks.`)
    : (lang === "ru"
        ? `Вход в ${displayName} нужен только для переноса лайков (плейлисты работают без входа).`
        : `Sign in to ${displayName} only to transfer liked tracks (playlists work without signing in).`);

  const saveServiceToken = async (sKey: string) => {
    const val = tokenInputs[sKey]?.trim() || "";
    setSavingService(sKey);
    try {
      const providerKey = sKey === "youtube_music" ? "you_tube_music" : sKey;
      if (val) {
        try {
          await api.probeCredential(providerKey, val);
          await api.saveCredential(providerKey, val);
          showToast(lang === "ru" ? "Токен сохранён и проверен" : "Token saved and verified");
        } catch (probeErr) {
          await api.saveCredential(providerKey, val);
          showToast(
            lang === "ru"
              ? `Токен сохранён (локальная проверка: ${probeErr})`
              : `Token saved (local probe: ${probeErr})`,
            true,
          );
        }
      } else {
        await api.removeCredential(providerKey);
        showToast(lang === "ru" ? "Данные входа удалены" : "Credentials removed");
      }
      await refresh();
    } catch (e) {
      showToast(String(e), true);
    } finally {
      setSavingService(null);
    }
  };

  const disconnectService = async (sKey: string) => {
    try {
      const providerKey = sKey === "youtube_music" ? "you_tube_music" : sKey;
      await api.removeCredential(providerKey);
      setTokenInputs((prev) => ({ ...prev, [sKey]: "" }));
      await refresh();
      showToast(lang === "ru" ? "Вход отключён" : "Signed out");
    } catch (e) {
      showToast(String(e), true);
    }
  };

  return (
    <div>
      <div className="sett-page-header">
        <h1 className="sett-page-title">{displayName}</h1>
        <p className="sett-page-sub">
          {isSpotify
            ? (lang === "ru"
                ? "Подключение аккаунта Spotify нужно только для переноса лайков — плейлисты и альбомы можно переносить без входа."
                : "Spotify sign-in is only needed to transfer liked tracks — playlists and albums can be transferred without signing in.")
            : isYt
            ? (lang === "ru"
                ? "Подключение аккаунта YouTube нужно только для переноса лайков — поиск, воспроизведение и плейлисты работают без входа."
                : "YouTube sign-in is only needed to transfer liked tracks — search, playback and playlists work without signing in.")
            : (lang === "ru"
                ? `Подключение аккаунта ${displayName} нужно только для переноса лайков — плейлисты работают без входа.`
                : `Connecting your ${displayName} account is only needed to transfer liked tracks — playlists work without signing in.`)}
        </p>
      </div>

      {/* Status Card */}
      <div className="sett-integration-banner">
        <div className="sett-integration-banner-left">
          <div className="sett-integration-icon-box">
            <PlatformIcon kind={serviceKey} size={22} color={meta.brandColor} />
          </div>
          <div className="sett-row-info">
            <div className="sett-row-title">{statusTitle}</div>
            <div className="sett-row-desc">{statusSub}</div>
          </div>
        </div>

        {hasCredentials && (
          <div className="sett-integration-actions">
            <button
              type="button"
              className="sett-btn-secondary"
              onClick={() => void disconnectService(serviceKey)}
            >
              {lang === "ru" ? "Выйти" : "Sign out"}
            </button>
          </div>
        )}
      </div>

      {/* Always visible Login / Token Cards */}
      <div className="sett-group-card" style={{ marginTop: 14 }}>
        {hasBrowserLogin && (
          <div className="sett-row">
            <div className="sett-row-info">
              <div className="sett-row-title">
                {lang === "ru" ? "Войти через браузер" : "Sign in via Browser"}
              </div>
              <div className="sett-row-desc">
                {lang === "ru"
                  ? "Откроет окно авторизации и автоматически сохранит сессию."
                  : "Opens sign-in window and captures session automatically."}
              </div>
            </div>
            <button
              type="button"
              className="sett-btn-primary"
              onClick={async () => {
                try {
                  await BROWSER_LOGIN[serviceKey as BrowserLoginKind].login();
                  showToast(
                    lang === "ru"
                      ? "Окно авторизации открыто. Выполните вход в браузере."
                      : "Login window opened. Sign in via browser.",
                  );
                } catch (e) {
                  showToast(String(e), true);
                }
              }}
            >
              {lang === "ru" ? "Открыть окно входа" : "Open Login"}
            </button>
          </div>
        )}

        <div className="sett-row-col">
          <div className="sett-row-info" style={{ marginBottom: 10 }}>
            <div className="sett-row-title">
              {lang === "ru" ? "Вставить токен / cookies / URL" : "Paste Token / Cookies / URL"}
            </div>
            <div className="sett-row-desc">{meta.hint}</div>
          </div>

          <div className="sett-inline-form">
            <input
              type="password"
              className="sett-input"
              placeholder={
                isYt
                  ? (lang === "ru" ? "Опционально: cookies браузера..." : "Optional: browser cookies...")
                  : (lang === "ru" ? "Вставьте токен, cookie или URL..." : "Paste token, cookie or URL...")
              }
              value={tokenInputs[serviceKey] ?? ""}
              onChange={(e) =>
                setTokenInputs((prev) => ({ ...prev, [serviceKey]: e.target.value }))
              }
            />
            <button
              type="button"
              className="sett-btn-primary"
              disabled={savingService === serviceKey}
              onClick={() => void saveServiceToken(serviceKey)}
            >
              {savingService === serviceKey ? "…" : (lang === "ru" ? "Сохранить" : "Save")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
