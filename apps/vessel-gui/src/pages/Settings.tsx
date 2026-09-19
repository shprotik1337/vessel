import { useEffect, useState } from "react";

import { useApp } from "../store";
import { PlatformIcon } from "../components/PlatformIcon";
import { TextInputModal, ConfirmModal, PathModal } from "../components/Modal";
import { VpnTab } from "../components/VpnTab";
import { ServersTab } from "./Servers";
import type { ProviderStatus, UserProfile } from "../api/types";
import * as api from "../api/commands";
import { t } from "../i18n";
import { CustomizationTab } from "../customization";

type Tab = "customization" | "services" | "servers" | "language" | "playback" | "storage" | "users" | "recommendations" | "vpn";

type ConfirmTarget = "settings" | "data" | null;
type DirTarget = "download" | "cache" | null;

function formatDate(ms: number): string {
  if (!ms) return "—";
  return new Date(ms).toLocaleString();
}

const SERVICE_ICON_SIZE: Record<string, number> = {
  soundcloud: 42, deezer: 44, yandex: 33, spotify: 64, youtube_music: 48,
};

const REC_ICON_SIZE: Record<string, number> = {
  soundcloud: 40, deezer: 44, yandex: 33, spotify: 59, youtube_music: 32,
};

const SERVICE_META: Record<string, { key: string; hint: string; logo: string; bg: string }> = {  soundcloud: {
    key: "soundcloud",
    hint: "client_id — ключ из браузера. Вставь client_id для SoundCloud.",
    logo: "SC",
    bg: "#F50",
  },
  yandex: {
    key: "yandex",
    hint: "OAuth-токен из расширения yandex-music-token. Хранится только локально.",
    logo: "YA",
    bg: "#FC0",
  },
  deezer: {
    key: "deezer",
    hint: "Значение cookie arl или строка arl=...; cookie хранится только локально.",
    logo: "DZ",
    bg: "#A238FF",
  },
  spotify: {
    key: "spotify",
    hint: "Вставь значение cookie sp_dc из браузера. Токен останется только локально.",
    logo: "SP",
    bg: "#1DB954",
  },
  youtube_music: {
    key: "you_tube_music",
    hint: "Вставь cookie из браузера (SID, SSID, HSID, LOGIN_INFO и др.) — полные треки без 60-сек лимита.",
    logo: "YT",
    bg: "#FF0000",
  },
};

type BrowserLoginKind = "spotify" | "soundcloud" | "deezer";

const BROWSER_LOGIN_HINT_KEY: Record<BrowserLoginKind, Parameters<typeof t>[1]> = {
  spotify: "settings.browserHint.spotify",
  soundcloud: "settings.browserHint.soundcloud",
  deezer: "settings.browserHint.deezer",
};

const BROWSER_LOGIN: Record<
  BrowserLoginKind,
  { login: () => Promise<void>; open: () => Promise<boolean>; cancel: () => Promise<void> }
> = {
  spotify: {
    login: api.spotifyBrowserLogin,
    open: api.spotifyLoginWindowOpen,
    cancel: api.spotifyAuthCancel,
  },
  soundcloud: {
    login: api.soundcloudBrowserLogin,
    open: api.soundcloudLoginWindowOpen,
    cancel: api.soundcloudAuthCancel,
  },
  deezer: {
    login: api.deezerBrowserLogin,
    open: api.deezerLoginWindowOpen,
    cancel: api.deezerAuthCancel,
  },
};

function ServiceRow({ status }: { status: ProviderStatus }) {
  const { showToast, refresh, lang } = useApp();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<"ok" | "fail" | null>(null);
  const meta = SERVICE_META[status.kind];
  // Бэкенд сериализует kind в snake_case: "youtube_music" (не "you_tube_music").
  const isYoutubeMusic =
    status.kind === "youtube_music" || status.kind === "you_tube_music";

  const connect = async () => {
    if (!value.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      await api.probeCredential(meta.key, value.trim());
      setResult("ok");
      await api.saveCredential(meta.key, value.trim());
      await refresh();
      setEditing(false);
      setValue("");
      showToast(`${status.label} connected`);
    } catch (error) {
      setResult("fail");
      showToast(`Invalid key: ${error}`, true);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    try {
      await api.removeCredential(meta.key);
      await refresh();
      showToast(`${status.label} disconnected`);
    } catch (error) {
      showToast(String(error), true);
    }
  };

  // Автоматический auth flow: открыли окно → залогинились → приложение само
  // замечает ключ/cookie (sp_dc, arl, client_id), сохраняет и закрывает окно.
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginKind, setLoginKind] = useState<BrowserLoginKind | null>(null);

  const browserLogin = async (kind: BrowserLoginKind) => {
    setLoginBusy(true);
    try {
      await BROWSER_LOGIN[kind].login();
      setLoginKind(kind);
    } catch (error) {
      showToast(String(error), true);
    } finally {
      setLoginBusy(false);
    }
  };

  useEffect(() => {
    if (!loginKind) return;
    let cancelled = false;
    const timer = setInterval(async () => {
      try {
        const [statuses, open] = await Promise.all([
          api.getProviderStatus(),
          BROWSER_LOGIN[loginKind].open(),
        ]);
        if (cancelled) return;
        const provider = statuses.find((s) => s.kind === loginKind);
        if (provider?.connected) {
          setLoginKind(null);
          await refresh();
          showToast(`${provider.label} ${t(lang, "settings.providerConnected")}`);
        } else if (!open) {
          // Окно закрыли: либо вход отменён, либо сохранение уже прошло
          setLoginKind(null);
          await refresh();
        }
      } catch {
        // сеть/окно — продолжаем опрос
      }
    }, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loginKind]);

  const cancelBrowserLogin = async () => {
    if (!loginKind) return;
    const kind = loginKind;
    setLoginKind(null);
    try {
      await BROWSER_LOGIN[kind].cancel();
    } catch {
      // окно могло уже закрыться
    }
  };

  return (
    <div className="svc-row">
      <div className="svc-logo" style={{ background: "var(--elev)", width: 52, height: 52, borderRadius: 6 }}>
        <PlatformIcon
          kind={status.kind as "soundcloud" | "deezer" | "yandex" | "spotify" | "you_tube_music"}
          size={SERVICE_ICON_SIZE[status.kind] ?? 36}
        />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{status.label}</div>
        <div className="set-desc" style={{ marginTop: 2 }}>
          {isYoutubeMusic
            ? t(lang, "settings.connected")
            : status.connected
              ? t(lang, "settings.connected")
              : status.has_credentials
                ? t(lang, "settings.keySavedNotConnected")
                : t(lang, "settings.notConnected")}
        </div>
      </div>
      {isYoutubeMusic ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="badge ok">
            <span className="bdot" />
            {t(lang, "settings.connected")}
          </span>
        </div>
      ) : status.connected ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="badge ok">
            <span className="bdot" />
            {t(lang, "settings.connected")}
          </span>
          <button className="btn btn-outline btn-sm" onClick={disconnect}>
            {t(lang, "settings.disconnect")}
          </button>
        </div>
      ) : editing ? (
        <div className="input-row" style={{ maxWidth: 320 }}>
          <input
            type="text"
            placeholder={meta.hint}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === "Enter") void connect();
              if (e.key === "Escape") setEditing(false);
            }}
          />
          <button className="btn btn-primary btn-sm" onClick={connect} disabled={busy}>
            {busy ? "…" : t(lang, "settings.connect")}
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => setEditing(false)}>
            {t(lang, "common.cancel")}
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {status.has_credentials && (
            <span className="badge warn">
              <span className="bdot" />
              {t(lang, "settings.keyInvalid")}
            </span>
          )}
          <button className="btn btn-outline btn-sm" onClick={() => setEditing(true)}>
            {t(lang, "settings.connect")}
          </button>
          {(status.kind === "spotify" ||
            status.kind === "soundcloud" ||
            status.kind === "deezer") &&
            (loginKind === status.kind ? (
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <span className="badge warn">
                  <span className="bdot" />
                  {t(lang, "settings.youtubeLoginOpen")}
                </span>
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={cancelBrowserLogin}
                >
                  {t(lang, "common.cancel")}
                </button>
              </div>
            ) : (
              <button
                className="btn btn-primary btn-sm"
                onClick={() => void browserLogin(status.kind as BrowserLoginKind)}
                disabled={loginBusy}
                title={t(lang, BROWSER_LOGIN_HINT_KEY[status.kind as BrowserLoginKind])}
              >
                {loginBusy ? t(lang, "settings.oauthBusy") : t(lang, "settings.oauthLogin")}
              </button>
            ))}
        </div>
      )}
      {result === "ok" && (
        <span style={{ color: "var(--text)", fontSize: 12 }}>{t(lang, "settings.validKey")}</span>
      )}
      {result === "fail" && (
        <span style={{ color: "var(--red)", fontSize: 12 }}>{t(lang, "settings.invalidKey")}</span>
      )}
    </div>
  );
}

function UsersTab() {
  const { showToast, refresh, lang } = useApp();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [active, setActive] = useState<UserProfile | null>(null);
  const [autoLogin, setAutoLogin] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const colors = ["#E1332D", "#4361EE", "#7209B7", "#F72585", "#1DB954", "#FF6B35", "#06D6A0", "#118AB2"];

  const load = async () => {
    try {
      const [known, profile, auto] = await Promise.all([
        api.getKnownUsers(),
        api.getUserProfile(),
        api.getAutoLogin(),
      ]);
      setUsers(known);
      setActive(profile);
      setAutoLogin(auto);
    } catch (error) {
      showToast(String(error), true);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doCreate = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setBusy(true);
    try {
      await api.createUser(trimmed);
      await load();
      await refresh();
      setCreateOpen(false);
      showToast(`${t(lang, "toast.createdUser")} ${trimmed}`);
    } catch (error) {
      showToast(String(error), true);
    } finally {
      setBusy(false);
    }
  };

  const switchTo = async (name: string) => {
    if (active?.display_name === name) return;
    setBusy(true);
    try {
      await api.switchUser(name);
      await load();
      await refresh();
      showToast(`${t(lang, "toast.switched")} ${name}`);
    } catch (error) {
      showToast(String(error), true);
    } finally {
      setBusy(false);
    }
  };

  const doRemove = async () => {
    if (!deleteTarget) return;
    const name = deleteTarget;
    setBusy(true);
    try {
      await api.deleteUser(name);
      if (autoLogin === name) setAutoLogin(null);
      await load();
      await refresh();
      showToast(t(lang, "toast.deleted"));
      setDeleteTarget(null);
    } catch (error) {
      showToast(String(error), true);
    } finally {
      setBusy(false);
    }
  };

  const doExport = async (destination: string) => {
    const path = destination.trim();
    if (!path) return;
    setBusy(true);
    try {
      const exported = await api.exportUser(path);
      setExportOpen(false);
      showToast(`${t(lang, "toast.exported")} ${exported}`);
    } catch (error) {
      showToast(String(error), true);
    } finally {
      setBusy(false);
    }
  };

  const doImport = async (source: string) => {
    const path = source.trim();
    if (!path) return;
    setBusy(true);
    try {
      const profile = await api.importUser(path);
      await load();
      await refresh();
      setImportOpen(false);
      showToast(`${t(lang, "toast.imported")} ${profile.display_name}`);
    } catch (error) {
      showToast(String(error), true);
    } finally {
      setBusy(false);
    }
  };

  const openUsersFolder = async () => {
    try {
      const dir = await api.getUsersDir();
      await api.openPath(dir);
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const backup = async () => {
    setBusy(true);
    try {
      const path = await api.backupUser();
      showToast(`${t(lang, "toast.backup")} ${path}`);
    } catch (error) {
      showToast(String(error), true);
    } finally {
      setBusy(false);
    }
  };

  const clearRemember = async () => {
    try {
      await api.clearAutoLogin();
      setAutoLogin(null);
      showToast(t(lang, "toast.autoLoginReset"));
    } catch (error) {
      showToast(String(error), true);
    }
  };

  return (
    <>
      <div className="sett-hd">
        <div className="sett-title">{t(lang, "users.title")}</div>
        <div className="sett-sub">{t(lang, "users.sub")}</div>
      </div>

      <div className="group">
        <div className="group-hd">
          <span className="group-title">{t(lang, "users.list")}</span>
          <button className="btn btn-primary btn-sm" onClick={() => setCreateOpen(true)} disabled={busy}>
            {t(lang, "users.create")}
          </button>
        </div>
        <div className="panel">
          {users.map((u) => {
            const isActive = active?.id === u.id;
            return (
              <div key={u.id} className="svc-row">
                <div className="svc-logo" style={{ background: colors[users.indexOf(u) % colors.length], color: "#fff" }}>
                  {u.display_name.slice(0, 1).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600 }}>{u.display_name}</div>
                  <div className="set-desc" style={{ marginTop: 2 }}>
                    {t(lang, "users.created")}: {formatDate(u.created_at_ms)}
                  </div>
                </div>
                {isActive ? (
                  <span className="badge ok">
                    <span className="bdot" />
                    {t(lang, "users.active")}
                  </span>
                ) : (
                  <div className="btns">
                    <button className="btn btn-outline btn-sm" onClick={() => switchTo(u.display_name)} disabled={busy}>
                      {t(lang, "users.open")}
                    </button>
                    <button className="btn btn-danger btn-sm" onClick={() => setDeleteTarget(u.display_name)} disabled={busy}>
                      {t(lang, "users.delete")}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
          {users.length === 0 && (
            <div className="set-desc" style={{ padding: 12 }}>
              {t(lang, "users.none")}
            </div>
          )}
        </div>
      </div>

      <div className="group">
        <div className="group-hd">
          <span className="group-title">{t(lang, "users.autoLogin")}</span>
        </div>
        <div className="panel">
          <div className="set-row">
            <div className="set-cell">
              <div className="set-title">{t(lang, "users.autoLoginTitle")}</div>
              <div className="set-desc">
                {autoLogin
                  ? `${t(lang, "users.autoLogin.saved")} ${autoLogin}`
                  : t(lang, "users.autoLogin.none")}
              </div>
            </div>
            <div className="btns">
              <button className="btn btn-outline btn-sm" onClick={clearRemember} disabled={!autoLogin}>
                {t(lang, "users.autoLogin.reset")}
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="group">
        <div className="group-hd">
          <span className="group-title">{t(lang, "users.transfer")}</span>
        </div>
        <div className="panel">
          <div className="set-row">
            <div className="set-cell">
              <div className="set-title">{t(lang, "users.export")}</div>
              <div className="set-desc">{t(lang, "users.export.desc")}</div>
            </div>
            <div className="btns">
              <button className="btn btn-ghost btn-sm" onClick={() => setExportOpen(true)} disabled={busy}>
                {t(lang, "users.exportAction")}
              </button>
            </div>
          </div>
          <div className="set-row">
            <div className="set-cell">
              <div className="set-title">{t(lang, "users.import")}</div>
              <div className="set-desc">{t(lang, "users.import.desc")}</div>
            </div>
            <div className="btns">
              <button className="btn btn-ghost btn-sm" onClick={() => setImportOpen(true)} disabled={busy}>
                {t(lang, "users.importAction")}
              </button>
            </div>
          </div>
          <div className="set-row">
            <div className="set-cell">
              <div className="set-title">{t(lang, "users.folder")}</div>
              <div className="set-desc">{t(lang, "users.folder.desc")}</div>
            </div>
            <div className="btns">
              <button className="btn btn-outline btn-sm" onClick={openUsersFolder}>
                {t(lang, "users.folderAction")}
              </button>
            </div>
          </div>
          <div className="set-row">
            <div className="set-cell">
              <div className="set-title">{t(lang, "users.backup")}</div>
              <div className="set-desc">{t(lang, "users.backup.desc")}</div>
            </div>
            <div className="btns">
              <button className="btn btn-outline btn-sm" onClick={backup} disabled={busy}>
                {t(lang, "users.backupAction")}
              </button>
            </div>
          </div>
          {active && (
            <div className="set-row">
              <div className="set-cell">
                <div className="set-title">{t(lang, "users.profile")}</div>
                <div className="set-desc">
                  ID: {active.id} · {t(lang, "users.formatVersion")}: {active.format_version} ·{" "}
                  {t(lang, "users.updated")}: {formatDate(active.updated_at_ms)}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {createOpen && (
        <TextInputModal
          lang={lang}
          title={t(lang, "users.createName")}
          placeholder={t(lang, "users.createName")}
          confirmText={t(lang, "common.create")}
          onSubmit={doCreate}
          onClose={() => setCreateOpen(false)}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          lang={lang}
          title={`${t(lang, "users.deleteConfirm1")} «${deleteTarget}» ${t(lang, "users.deleteConfirm2")}`}
          confirmText={t(lang, "common.delete")}
          onConfirm={doRemove}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {exportOpen && (
        <PathModal
          lang={lang}
          title={t(lang, "users.export")}
          hint={t(lang, "users.exportHint")}
          browseMode="folder"
          confirmText={t(lang, "users.exportAction")}
          onSubmit={doExport}
          onClose={() => setExportOpen(false)}
        />
      )}

      {importOpen && (
        <PathModal
          lang={lang}
          title={t(lang, "users.import")}
          hint={t(lang, "users.importHint")}
          browseMode="folder"
          confirmText={t(lang, "users.importAction")}
          onSubmit={doImport}
          onClose={() => setImportOpen(false)}
        />
      )}
    </>
  );
}

function PlaybackSourceBlock() {
  const { showToast, lang, state } = useApp();
  const [source, setSource] = useState<string>("youtube_music");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void api.getSpotifyPlaybackSource().then(setSource).catch(() => {});
  }, []);

  const isSpotifyConnected = state?.providers.some(
    (p) => p.kind === "spotify" && p.connected,
  );
  const ytAvailable =
    state?.providers.some((p) => p.kind === "youtube_music" && p.connected) ?? true;
  const deezerAvailable =
    state?.providers.some((p) => p.kind === "deezer" && p.connected) ?? false;
  const autoAvailable = deezerAvailable || ytAvailable;

  const choose = async (key: string) => {
    setSaving(true);
    try {
      await api.setSpotifyPlaybackSource(key);
      setSource(key);
      showToast(t(lang, "settings.playbackSource.saved"));
    } catch (error) {
      showToast(String(error), true);
    } finally {
      setSaving(false);
    }
  };

  const options = [
    {
      key: "auto",
      label: t(lang, "settings.playbackSource.auto"),
      badge: "YouTube Music → Deezer",
      available: autoAvailable,
    },
    {
      key: "deezer",
      label: t(lang, "settings.playbackSource.deezer"),
      badge: null,
      available: deezerAvailable,
    },
    {
      key: "youtube_music",
      label: t(lang, "settings.playbackSource.yt"),
      badge: null,
      available: ytAvailable,
    },
  ];

  return (
    <div className="group">
      <div className="group-hd">
        <span className="group-title">{t(lang, "settings.playbackSource")}</span>
      </div>
      <div className="panel">
        <div className="svc-row" style={{ borderBottom: "none" }}>
          <div
            style={{
              width: 36,
              height: 36,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <span style={{ fontSize: 16 }}>♪</span>
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>{t(lang, "settings.playbackSource")}</div>
            <div className="set-desc" style={{ marginTop: 2 }}>
              {isSpotifyConnected
                ? t(lang, "settings.playbackSource.sub")
                : t(lang, "settings.notConnected") + " — Spotify"}
            </div>
          </div>
        </div>
        <div
          style={{ display: "flex", flexDirection: "column", gap: 8, padding: "0 20px 16px" }}
        >
          {options.map((opt) => (
            <button
              key={opt.key}
              className="btn btn-outline btn-sm"
              style={{
                justifyContent: "space-between",
                borderColor: source === opt.key ? "var(--border3)" : undefined,
                color: source === opt.key ? "var(--text)" : undefined,
                opacity: opt.available ? 1 : 0.45,
              }}
              disabled={saving || !opt.available || !isSpotifyConnected}
              onClick={() => void choose(opt.key)}
            >
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {source === opt.key ? "◉" : "○"} {opt.label}
              </span>
              <span style={{ fontSize: 11, color: "var(--text3)" }}>
                {opt.available ? (opt.badge ?? "") : t(lang, "settings.playbackSource.unavailable")}
              </span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

const SERVICE_SWITCHERS = [
  { key: "youtube_music", label: "YouTube Music" },
  { key: "spotify", label: "Spotify" },
  { key: "soundcloud", label: "SoundCloud" },
  { key: "deezer", label: "Deezer" },
  { key: "yandex", label: "Yandex Music" },
] as const;

const SERVICE_FEATURES = [
  "Проверка токена",
  "Поиск треков",
  "Воспроизведение трека",
  "Скачивание треков",
  "Обложки треков",
  "Похожие треки",
  "Информация об исполнителе",
  "Треки исполнителя",
  "Поиск плейлистов",
  "Импорт плейлистов",
  "Генерация волны",
];

function ServiceRoutingPanel() {
  const { showToast, lang, state } = useApp();
  const [selected, setSelected] =
    useState<(typeof SERVICE_SWITCHERS)[number]["key"]>("youtube_music");
  const [servers, setServers] = useState<api.VesselServerView[]>([]);
  const [routes, setRoutes] = useState<Record<string, string>>({});

  const selectedStatus = state?.providers.find((p) => p.kind === selected);
  const segment = api.PROVIDER_SEGMENT[selected] ?? selected;
  const route = routes[segment] ?? "local";

  useEffect(() => {
    void Promise.all([api.vesselServers(), api.vesselRoutes()])
      .then(([serverList, routeMap]) => {
        setServers(serverList);
        setRoutes(routeMap);
      })
      .catch((error) => showToast(String(error), true));
  }, []);

  const setMode = async (mode: "local" | "server") => {
    const target =
      mode === "local"
        ? "local"
        : servers[0]
          ? `server:${servers[0].id}`
          : null;
    if (!target) {
      showToast(t(lang, "server.noServers"), true);
      return;
    }
    try {
      await api.vesselRouteSet(segment, target);
      setRoutes((current) => ({ ...current, [segment]: target }));
    } catch (error) {
      showToast(String(error), true);
    }
  };

  return (
    <div className="service-routing">
      <div className="service-switcher">
        {SERVICE_SWITCHERS.map((service) => (
          <button
            key={service.key}
            className={`service-switcher-item ${selected === service.key ? "active" : ""}`}
            onClick={() => setSelected(service.key)}
          >
            <PlatformIcon
              kind={service.key as "soundcloud" | "deezer" | "spotify" | "yandex" | "you_tube_music"}
              size={service.key === "spotify" ? 44 : service.key === "soundcloud" || service.key === "deezer" || service.key === "yandex" ? 30 : 26}
            />
            <span>{service.label}</span>
          </button>
        ))}
      </div>

      <div className="service-routing-columns">
        <div className="service-routing-panel">
          <div className="group-hd">
            <span className="group-title">Авторизация</span>
          </div>
          <div className="panel">
            {selectedStatus && <ServiceRow status={selectedStatus} />}
          </div>
          {selected === "spotify" && <PlaybackSourceBlock />}
        </div>

        <div className="service-routing-panel">
          <div className="group-hd">
            <span className="group-title">Режим выполнения</span>
          </div>
          <div className="panel service-capabilities">
            <div className="service-mode-switcher">
              <button
                className={`service-mode ${route === "local" ? "active" : ""}`}
                onClick={() => void setMode("local")}
              >
                <LaptopIcon /> Локально
              </button>
              <button
                className={`service-mode ${route !== "local" ? "active" : ""}`}
                onClick={() => void setMode("server")}
              >
                ▤ Сервер
              </button>
            </div>
            {SERVICE_FEATURES.map((label) => (
              <div className="service-capability" key={label}>
                <span>{label}</span>
                <span className="service-executor-icon">
                  {route === "local" ? <LaptopIcon /> : "▤"}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function LaptopIcon() {
  return (
    <svg
      className="laptop-icon"
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3.5" y="4" width="17" height="12" rx="1.5" />
      <line x1="2" y1="20" x2="22" y2="20" />
    </svg>
  );
}

const PROVIDER_OPTIONS = [
  { key: "soundcloud", label: "SoundCloud" },
  { key: "deezer", label: "Deezer" },
  { key: "yandex", label: "Yandex" },
  { key: "spotify", label: "Spotify" },
  { key: "you_tube_music", label: "YouTube Music" },
];

function RecommendationsTab() {
  const { showToast, lang } = useApp();
  const [selected, setSelected] = useState<string[]>([]);
  const [allProviders, setAllProviders] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const val = await api.getRecommendationProviders();
      if (val === "all" || !val) {
        setAllProviders(true);
        setSelected(PROVIDER_OPTIONS.map((o) => o.key));
      } else {
        setAllProviders(false);
        setSelected(val.split(","));
      }
    } catch {
      setAllProviders(true);
      setSelected(PROVIDER_OPTIONS.map((o) => o.key));
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const toggleProvider = (key: string) => {
    if (allProviders) return;
    setSelected((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const save = async () => {
    setSaving(true);
    try {
      const val = allProviders ? "all" : selected.join(",");
      await api.setRecommendationProviders(val);
      showToast(allProviders ? "Все платформы" : selected.join(", "));
    } catch (error) {
      showToast(String(error), true);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="sett-hd">
        <div className="sett-title">{t(lang, "settings.recommendations")}</div>
        <div className="sett-sub">{t(lang, "settings.recommendations.sub")}</div>
      </div>
      <div className="group">
        <div className="group-hd">
          <span className="group-title">{t(lang, "settings.recommendations")}</span>
        </div>
        <div className="panel">
          <div className="svc-row">
            <div style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
              <span style={{ fontSize: 16 }}>★</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600 }}>{t(lang, "recommendations.allTogether")}</div>
              <div className="set-desc" style={{ marginTop: 2 }}>
                {t(lang, "recommendations.allConnected")}
              </div>
            </div>
            <div className="chips" style={{ gap: 4, flexWrap: "wrap" }}>
              <button
                className={`chip ${allProviders ? "active" : ""}`}
                style={allProviders ? { borderColor: "var(--border3)", color: "var(--text)" } : undefined}
                onClick={() => {
                  setAllProviders(true);
                  setSelected(PROVIDER_OPTIONS.map((o) => o.key));
                }}
              >
                {t(lang, "recommendations.modeAll")}
              </button>
              <button
                className={`chip ${!allProviders ? "active" : ""}`}
                style={!allProviders ? { borderColor: "var(--border3)", color: "var(--text)" } : undefined}
                onClick={() => setAllProviders(false)}
              >
                {t(lang, "recommendations.modeCustom")}
              </button>
            </div>
          </div>
          {!allProviders &&
            PROVIDER_OPTIONS.map((opt) => {
              const on = selected.includes(opt.key);
              const colors: Record<string, string> = {
                soundcloud: "#F50", deezer: "#A238FF", yandex: "#FC0", spotify: "#1DB954", youtube_music: "#FF0000",
              };
              return (
                <div key={opt.key} className="svc-row" style={{ borderBottom: "none" }}>
                  <div style={{ width: 58, height: 58, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0, color: colors[opt.key] }}>
                    <PlatformIcon kind={opt.key as "soundcloud"|"deezer"|"yandex"|"spotify"|"you_tube_music"} size={REC_ICON_SIZE[opt.key] ?? 40} />
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
          <div className="btns" style={{ justifyContent: "flex-end", padding: "12px 20px", borderTop: "1px solid var(--border)" }}>
            <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
              {saving ? "…" : t(lang, "common.save")}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

export function Settings() {
  const { state, showToast, refresh, lang } = useApp();
  const [tab, setTab] = useState<Tab>("services");
  const [confirm, setConfirm] = useState<ConfirmTarget>(null);
  const [downloadDir, setDownloadDir] = useState("");
  const [savedDir, setSavedDir] = useState("");
  const [cacheDir, setCacheDir] = useState("");
  const [savedCacheDir, setSavedCacheDir] = useState("");
  const [spotifyProxy, setSpotifyProxy] = useState("");
  const [savedSpotifyProxy, setSavedSpotifyProxy] = useState("");
  const [dirModal, setDirModal] = useState<DirTarget>(null);
  const [proxyOpen, setProxyOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const dir = await api.getDownloadDir();
        setDownloadDir(dir);
        setSavedDir(dir);
      } catch {
        // папка останется пустой
      }
      try {
        const dir = await api.getCacheDir();
        setCacheDir(dir);
        setSavedCacheDir(dir);
      } catch {
        // папка останется пустой
      }
      try {
        const dir = await api.getSpotifyProxy();
        setSpotifyProxy(dir);
        setSavedSpotifyProxy(dir);
      } catch {
        // прокси останется пустым
      }
    })();
  }, []);

  const changeDownloadDir = async (value: string) => {
    const next = value.trim();
    try {
      await api.setDownloadDir(next || null);
      setDownloadDir(next);
      setSavedDir(next);
      setDirModal(null);
      showToast(next ? `Папка загрузок: ${next}` : "Папка сброшена по умолчанию");
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const resetDownloadDir = async () => {
    try {
      await api.setDownloadDir(null);
      const dir = await api.getDownloadDir();
      setDownloadDir(dir);
      setSavedDir(dir);
      showToast("Папка сброшена по умолчанию");
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const downloadDirChanged = downloadDir !== savedDir;
  const cacheDirChanged = cacheDir !== savedCacheDir;

  const changeCacheDir = async (value: string) => {
    const next = value.trim();
    try {
      await api.setCacheDir(next || null);
      setCacheDir(next);
      setSavedCacheDir(next);
      setDirModal(null);
      showToast(next ? `Папка кэша: ${next}` : "Кэш сброшен по умолчанию");
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const resetCacheDir = async () => {
    try {
      await api.setCacheDir(null);
      const dir = await api.getCacheDir();
      setCacheDir(dir);
      setSavedCacheDir(dir);
      showToast("Кэш сброшен по умолчанию");
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const changeSpotifyProxy = async (value: string) => {
    const next = value.trim();
    try {
      await api.setSpotifyProxy(next || null);
      setSpotifyProxy(next);
      setSavedSpotifyProxy(next);
      setProxyOpen(false);
      showToast(next ? `Прокси Spotify: ${next}` : "Прокси Spotify сброшен");
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const resetSpotifyProxy = async () => {
    try {
      await api.setSpotifyProxy(null);
      setSpotifyProxy("");
      setSavedSpotifyProxy("");
      showToast("Прокси Spotify сброшен");
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const spotifyProxyChanged = spotifyProxy !== savedSpotifyProxy;

  const openDir = async (dir: string) => {
    if (!dir) return;
    try {
      await api.openPath(dir);
    } catch (error) {
      showToast(String(error), true);
    }
  };

  if (!state) return null;

  const resetSettings = async () => {
    try {
      await api.resetSettings();
      await refresh();
      showToast("Settings reset to defaults");
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const resetData = async () => {
    try {
      await api.resetData();
      await refresh();
      showToast("Application data wiped");
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const doConfirm = async () => {
    if (confirm === "settings") await resetSettings();
    if (confirm === "data") await resetData();
    setConfirm(null);
  };

  return (
    <div className="view">
      <div className="view-hd">
        <div>
          <div className="view-title">{t(lang, "settings.title")}</div>
          <div className="view-sub">{t(lang, "settings.sub")}</div>
        </div>
      </div>

      <div className="sett-wrap">
        <div className="sett-nav">
          <span className="nav-label">Settings</span>
          <button
            className={`sett-item ${tab === "customization" ? "active" : ""}`}
            onClick={() => setTab("customization")}
          >
            <span>{lang === "ru" ? "Кастомизация" : "Customization"}</span>
          </button>
          <button
            className={`sett-item ${tab === "services" ? "active" : ""}`}
            onClick={() => setTab("services")}
          >
            <span>{t(lang, "settings.services")}</span>
            {state.providers.some((p) => !p.connected && p.has_credentials) && (
              <span className="sett-dot" />
            )}
          </button>
          <button
            className={`sett-item ${tab === "servers" ? "active" : ""}`}
            onClick={() => setTab("servers")}
          >
            <span>{t(lang, "server.title")}</span>
          </button>
          <button
            className={`sett-item ${tab === "language" ? "active" : ""}`}
            onClick={() => setTab("language")}
          >
            <span>{t(lang, "settings.language")}</span>
          </button>
          <button
            className={`sett-item ${tab === "playback" ? "active" : ""}`}
            onClick={() => setTab("playback")}
          >
            <span>{t(lang, "settings.playback")}</span>
          </button>
          <button
            className={`sett-item ${tab === "storage" ? "active" : ""}`}
            onClick={() => setTab("storage")}
          >
            <span>{t(lang, "settings.storage")}</span>
          </button>
          <button
            className={`sett-item ${tab === "users" ? "active" : ""}`}
            onClick={() => setTab("users")}
          >
            <span>{t(lang, "settings.users")}</span>
          </button>
          <button
            className={`sett-item ${tab === "recommendations" ? "active" : ""}`}
            onClick={() => setTab("recommendations")}
          >
            <span>{t(lang, "settings.recommendations")}</span>
          </button>
          <button
            className={`sett-item ${tab === "vpn" ? "active" : ""}`}
            onClick={() => setTab("vpn")}
          >
            <span>VPN</span>
          </button>
        </div>

        <div className="sett-body">
          {tab === "customization" && <CustomizationTab />}

          {tab === "services" && (
            <>
              <div className="sett-hd">
                <div className="sett-title">{t(lang, "settings.services")}</div>
                <div className="sett-sub">{t(lang, "settings.services.sub")}</div>
              </div>
              <ServiceRoutingPanel /></>
          )}

          {tab === "playback" && (
            <>
              <div className="sett-hd">
                <div className="sett-title">{t(lang, "settings.playback.title")}</div>
                <div className="sett-sub">{t(lang, "settings.discordRpc.desc")}</div>
              </div>

              <div className="group">
                <div className="group-hd">
                  <span className="group-title">{t(lang, "settings.discordRpc.title")}</span>
                </div>
                <div className="panel">
                  <div className="set-row">
                    <div className="set-cell">
                      <div className="set-title">{t(lang, "settings.discordRpc.title")}</div>
                      <div className="set-desc">{t(lang, "settings.discordRpc.desc")}</div>
                    </div>
                    <div className="btns">
                      <button
                        className={`btn btn-sm ${state.discord_rpc ? "btn-primary" : "btn-outline"}`}
                        onClick={async () => {
                          try {
                            await api.setDiscordRpc(!state.discord_rpc);
                            await refresh();
                          } catch (error) {
                            showToast(String(error), true);
                          }
                        }}
                      >
                        {state.discord_rpc
                          ? t(lang, "settings.disable")
                          : t(lang, "settings.enable")}
                      </button>
                    </div>
                  </div>

                  {state.discord_rpc && (
                    <div style={{ padding: "14px 18px", borderTop: "1px solid var(--border)" }}>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "8px", fontWeight: 500 }}>
                        {t(lang, "settings.discordRpc.preview")}:
                      </div>
                      <div
                        style={{
                          background: "#111214",
                          borderRadius: "14px",
                          padding: "16px",
                          display: "flex",
                          gap: "14px",
                          alignItems: "center",
                          maxWidth: "400px",
                          border: "1px solid rgba(255,255,255,0.08)",
                          color: "#fff",
                        }}
                      >
                        <div style={{ position: "relative", width: "68px", height: "68px", flexShrink: 0 }}>
                          <img
                            src={
                              state.now_playing?.artwork_url ||
                              "https://cdn.rcd.gg/PreMiD/websites/S/Spotify/assets/logo.png"
                            }
                            alt="Cover"
                            style={{
                              width: "68px",
                              height: "68px",
                              borderRadius: "10px",
                              objectFit: "cover",
                              background: "#222",
                            }}
                          />
                        </div>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div
                            style={{
                              fontSize: "14px",
                              fontWeight: 700,
                              color: "#f2f3f5",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              lineHeight: "1.2",
                            }}
                          >
                            {state.now_playing?.title || "RATHER LIE"}
                          </div>
                          <div
                            style={{
                              fontSize: "12px",
                              color: "#b5bac1",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              marginTop: "3px",
                              lineHeight: "1.2",
                            }}
                          >
                            {state.now_playing
                              ? `${state.now_playing.artists.join(", ") || "Artist"} • ${state.now_playing.provider}`
                              : "Playboi Carti, The Weeknd • Spotify"}
                          </div>

                          <div style={{ marginTop: "8px" }}>
                            <div
                              style={{
                                display: "flex",
                                justifyContent: "space-between",
                                fontSize: "10px",
                                color: "#949ba4",
                                marginBottom: "4px",
                                fontFamily: "monospace",
                              }}
                            >
                              <span>00:19</span>
                              <span>03:29</span>
                            </div>
                            <div
                              style={{
                                width: "100%",
                                height: "4px",
                                background: "#4e5058",
                                borderRadius: "2px",
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  width: "25%",
                                  height: "100%",
                                  background: "#fff",
                                  borderRadius: "2px",
                                }}
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="group">
                <div className="group-hd">
                  <span className="group-title">{t(lang, "settings.repeat")}</span>
                </div>
                <div className="panel">
                  <div className="set-row">
                    <div className="set-cell">
                      <div className="set-title">{t(lang, "settings.repeatMode")}</div>
                      <div className="set-desc">Off / All / One.</div>
                    </div>
                    <div className="select">
                      <select
                        value={state.player.repeat}
                        onChange={async (e) => {
                          const mode = e.target.value as "off" | "all" | "one";
                          try {
                            await api.setRepeat(mode);
                            await refresh();
                          } catch (error) {
                            showToast(String(error), true);
                          }
                        }}
                      >
                        <option value="off">{t(lang, "settings.repeat.off")}</option>
                        <option value="all">{t(lang, "settings.repeat.all")}</option>
                        <option value="one">{t(lang, "settings.repeat.one")}</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === "language" && (
            <>
              <div className="sett-hd">
                <div className="sett-title">{t(lang, "settings.language")}</div>
                <div className="sett-sub">{t(lang, "settings.language.desc")}</div>
              </div>
              <div className="group">
                <div className="panel">
                  <div className="set-row">
                    <div className="set-cell">
                      <div className="set-title">{t(lang, "settings.language")}</div>
                      <div className="set-desc">{t(lang, "settings.language.desc")}</div>
                    </div>
                    <div className="select">
                      <select value={lang} onChange={async (e) => {
                        try {
                          await api.setLanguage(e.target.value);
                          await refresh();
                        } catch (error) {
                          showToast(String(error), true);
                        }
                      }}>
                        <option value="ru">Русский</option>
                        <option value="en">English</option>
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === "storage" && (
            <>
              <div className="sett-hd">
                <div className="sett-title">{t(lang, "settings.storage")}</div>
                <div className="sett-sub">{t(lang, "settings.storage.sub")}</div>
              </div>
              <div className="group">
                <div className="group-hd">
                  <span className="group-title">{t(lang, "settings.downloads")}</span>
                </div>
                <div className="panel">
                  <div className="set-row">
                    <div className="set-cell">
                      <div className="set-title">{t(lang, "settings.downloadDir")}</div>
                      <div className="set-desc" style={{ wordBreak: "break-all" }}>
                        {downloadDir || t(lang, "settings.loading")}
                      </div>
                    </div>
                    <div className="btns">
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => openDir(downloadDir)}
                      >
                        {t(lang, "settings.openFolder")}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setDirModal("download")}
                      >
                        {t(lang, "settings.proxy.change")}
                      </button>
                      {downloadDirChanged && (
                        <button className="btn btn-outline btn-sm" onClick={resetDownloadDir}>
                          {t(lang, "settings.proxy.reset")}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="set-row">
                    <div className="set-cell">
                      <div className="set-title">{t(lang, "settings.cacheDir")}</div>
                      <div className="set-desc" style={{ wordBreak: "break-all" }}>
                        {cacheDir || t(lang, "settings.loading")}
                      </div>
                    </div>
                    <div className="btns">
                      <button
                        className="btn btn-outline btn-sm"
                        onClick={() => openDir(cacheDir)}
                      >
                        {t(lang, "settings.openFolder")}
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => setDirModal("cache")}
                      >
                        {t(lang, "settings.proxy.change")}
                      </button>
                      {cacheDirChanged && (
                        <button className="btn btn-outline btn-sm" onClick={resetCacheDir}>
                          Сбросить
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="group">
                <div className="group-hd">
                  <span className="group-title">{t(lang, "settings.reset")}</span>
                </div>
                <div className="panel">
                  <div className="set-row">
                    <div className="set-cell">
                      <div className="set-title">{t(lang, "settings.resetSettings")}</div>
                      <div className="set-desc">{t(lang, "settings.resetSettingsDesc")}</div>
                    </div>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => setConfirm("settings")}
                    >
                      {t(lang, "settings.resetSettings")}
                    </button>
                  </div>
                  <div className="set-row">
                    <div className="set-cell">
                      <div className="set-title">{t(lang, "settings.wipeData")}</div>
                      <div className="set-desc">{t(lang, "settings.wipeDataDesc")}</div>
                    </div>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => setConfirm("data")}
                    >
                      {t(lang, "settings.wipeData")}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === "users" && <UsersTab />}
          {tab === "vpn" && (
            <>
              <div className="group">
                <div className="group-hd">
                  <span className="group-title">{t(lang, "settings.proxy")}</span>
                </div>
                <div className="panel">
                  <div className="set-row">
                    <div className="set-cell">
                      <div className="set-title">{t(lang, "settings.proxy")}</div>
                      <div className="set-desc" style={{ wordBreak: "break-all" }}>
                        {spotifyProxy || t(lang, "settings.proxy.none")}
                      </div>
                    </div>
                    <div className="btns">
                      <button className="btn btn-ghost btn-sm" onClick={() => setProxyOpen(true)}>
                        {t(lang, "settings.proxy.change")}
                      </button>
                      {spotifyProxyChanged && (
                        <button className="btn btn-outline btn-sm" onClick={resetSpotifyProxy}>
                          {t(lang, "settings.proxy.reset")}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <VpnTab />
            </>
          )}
          {tab === "servers" && <ServersTab />}
          {tab === "recommendations" && <RecommendationsTab />}
        </div>
      </div>

      {dirModal && (
        <PathModal
          lang={lang}
          title={dirModal === "download" ? t(lang, "settings.downloadDirModal") : t(lang, "settings.cacheDirModal")}
          initial={dirModal === "download" ? downloadDir : cacheDir}
          placeholder="C:\Users\…"
          browseMode="folder"
          confirmText={t(lang, "common.save")}
          onSubmit={dirModal === "download" ? changeDownloadDir : changeCacheDir}
          onClose={() => setDirModal(null)}
        />
      )}

      {proxyOpen && (
        <TextInputModal
          lang={lang}
          title={t(lang, "settings.proxyModal")}
          hint={t(lang, "settings.proxyModalHint")}
          initial={spotifyProxy}
          placeholder="socks5://127.0.0.1:1080"
          confirmText={t(lang, "common.save")}
          onSubmit={changeSpotifyProxy}
          onClose={() => setProxyOpen(false)}
        />
      )}

      {confirm && (
        <div className="ov show" onClick={() => setConfirm(null)}>
          <div
            className="ov-card"
            style={{
              width: 420,
              height: "auto",
              maxHeight: "auto",
              padding: 24,
              gap: 16,
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sett-title" style={{ fontSize: 18 }}>
              {confirm === "data"
                ? t(lang, "settings.confirmWipe")
                : t(lang, "settings.confirmReset")}
            </div>
            <div className="set-desc">
              {confirm === "data"
                ? t(lang, "settings.confirmWipeDesc")
                : t(lang, "settings.confirmResetDesc")}
            </div>
            <div className="btns" style={{ justifyContent: "flex-end", marginTop: 4 }}>
              <button className="btn btn-outline" onClick={() => setConfirm(null)}>
                {t(lang, "common.cancel")}
              </button>
              <button className="btn btn-danger" onClick={doConfirm}>
                {t(lang, "settings.yes")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
