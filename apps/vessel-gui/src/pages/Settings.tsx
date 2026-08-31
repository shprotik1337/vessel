import { useEffect, useState } from "react";

import { useApp } from "../store";
import type { ProviderStatus } from "../api/types";
import * as api from "../api/commands";

type Tab = "services" | "playback" | "storage";

type ConfirmTarget = "settings" | "data" | null;

const SERVICE_META: Record<string, { key: string; hint: string; logo: string; bg: string }> = {
  soundcloud: {
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
};

function ServiceRow({ status }: { status: ProviderStatus }) {
  const { showToast, refresh } = useApp();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<"ok" | "fail" | null>(null);
  const meta = SERVICE_META[status.kind];

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

  return (
    <div className="svc-row">
      <div className="svc-logo" style={{ background: meta.bg, color: "#0B0B0C" }}>
        {meta.logo}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{status.label}</div>
        <div className="set-desc" style={{ marginTop: 2 }}>
          {status.connected
            ? "Connected"
            : status.has_credentials
              ? "Key saved but not connected"
              : "Not connected"}
        </div>
      </div>
      {status.connected ? (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <span className="badge ok">
            <span className="bdot" />
            Connected
          </span>
          <button className="btn btn-outline btn-sm" onClick={disconnect}>
            Disconnect
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
            {busy ? "…" : "Connect"}
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => setEditing(false)}>
            Cancel
          </button>
        </div>
      ) : (
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {status.has_credentials && (
            <span className="badge warn">
              <span className="bdot" />
              Key invalid
            </span>
          )}
          <button className="btn btn-outline btn-sm" onClick={() => setEditing(true)}>
            Connect
          </button>
        </div>
      )}
      {result === "ok" && (
        <span style={{ color: "var(--text)", fontSize: 12 }}>✓ Valid key</span>
      )}
      {result === "fail" && (
        <span style={{ color: "var(--red)", fontSize: 12 }}>✗ Invalid key</span>
      )}
    </div>
  );
}

export function Settings() {
  const { state, showToast, refresh } = useApp();
  const [tab, setTab] = useState<Tab>("services");
  const [confirm, setConfirm] = useState<ConfirmTarget>(null);
  const [downloadDir, setDownloadDir] = useState("");
  const [savedDir, setSavedDir] = useState("");
  const [cacheDir, setCacheDir] = useState("");
  const [savedCacheDir, setSavedCacheDir] = useState("");
  const [spotifyProxy, setSpotifyProxy] = useState("");
  const [savedSpotifyProxy, setSavedSpotifyProxy] = useState("");

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

  const changeDownloadDir = async () => {
    const next = window.prompt("Папка для скачанных треков:", downloadDir);
    if (next === null) return;
    const value = next.trim();
    try {
      await api.setDownloadDir(value || null);
      setDownloadDir(value);
      showToast(value ? `Папка загрузок: ${value}` : "Папка сброшена по умолчанию");
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

  const changeCacheDir = async () => {
    const next = window.prompt("Папка для кэша треков:", cacheDir);
    if (next === null) return;
    const value = next.trim();
    try {
      await api.setCacheDir(value || null);
      setCacheDir(value);
      showToast(value ? `Папка кэша: ${value}` : "Кэш сброшен по умолчанию");
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

  const changeSpotifyProxy = async () => {
    const next = window.prompt("Прокси для Spotify (например socks5://127.0.0.1:1080):", spotifyProxy);
    if (next === null) return;
    const value = next.trim();
    try {
      await api.setSpotifyProxy(value || null);
      setSpotifyProxy(value);
      showToast(value ? `Прокси Spotify: ${value}` : "Прокси Spotify сброшен");
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
          <div className="view-title">Settings</div>
          <div className="view-sub">Configure services, playback and storage.</div>
        </div>
      </div>

      <div className="sett-wrap">
        <div className="sett-nav">
          <span className="nav-label">Settings</span>
          <button
            className={`sett-item ${tab === "services" ? "active" : ""}`}
            onClick={() => setTab("services")}
          >
            <span>Services</span>
            {state.providers.some((p) => !p.connected && p.has_credentials) && (
              <span className="sett-dot" />
            )}
          </button>
          <button
            className={`sett-item ${tab === "playback" ? "active" : ""}`}
            onClick={() => setTab("playback")}
          >
            <span>Playback</span>
          </button>
          <button
            className={`sett-item ${tab === "storage" ? "active" : ""}`}
            onClick={() => setTab("storage")}
          >
            <span>Storage</span>
          </button>
        </div>

        <div className="sett-body">
          {tab === "services" && (
            <>
              <div className="sett-hd">
                <div className="sett-title">Services</div>
                <div className="sett-sub">Connect your music sources. Keys are validated and stored locally.</div>
              </div>
              <div className="group">
                <div className="group-hd">
                  <span className="group-title">Connected accounts</span>
                </div>
                <div className="panel">
                  {state.providers.map((p) => (
                    <ServiceRow key={p.kind} status={p} />
                  ))}
                </div>
              </div>
              <div className="group">
                <div className="group-hd">
                  <span className="group-title">Spotify proxy</span>
                </div>
                <div className="panel">
                  <div className="set-row">
                    <div className="set-cell">
                      <div className="set-title">Прокси</div>
                      <div className="set-desc" style={{ wordBreak: "break-all" }}>
                        {spotifyProxy || "Не задан (прямое соединение)"}
                      </div>
                    </div>
                    <div className="btns">
                      <button className="btn btn-ghost btn-sm" onClick={changeSpotifyProxy}>
                        Изменить
                      </button>
                      {spotifyProxyChanged && (
                        <button className="btn btn-outline btn-sm" onClick={resetSpotifyProxy}>
                          Сбросить
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          {tab === "playback" && (
            <>
              <div className="sett-hd">
                <div className="sett-title">Playback</div>
                <div className="sett-sub">Repeat behavior.</div>
              </div>
              <div className="group">
                <div className="group-hd">
                  <span className="group-title">Repeat</span>
                </div>
                <div className="panel">
                  <div className="set-row">
                    <div className="set-cell">
                      <div className="set-title">Repeat mode</div>
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
                        <option value="off">Off</option>
                        <option value="all">All</option>
                        <option value="one">One</option>
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
                <div className="sett-title">Storage</div>
                <div className="sett-sub">Downloads and local data.</div>
              </div>
              <div className="group">
                <div className="group-hd">
                  <span className="group-title">Downloads</span>
                </div>
                <div className="panel">
                  <div className="set-row">
                    <div className="set-cell">
                      <div className="set-title">Папка загрузок</div>
                      <div className="set-desc" style={{ wordBreak: "break-all" }}>
                        {downloadDir || "Загрузка…"}
                      </div>
                    </div>
                    <div className="btns">
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={changeDownloadDir}
                      >
                        Изменить
                      </button>
                      {downloadDirChanged && (
                        <button className="btn btn-outline btn-sm" onClick={resetDownloadDir}>
                          Сбросить
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="set-row">
                    <div className="set-cell">
                      <div className="set-title">Папка кэша треков</div>
                      <div className="set-desc" style={{ wordBreak: "break-all" }}>
                        {cacheDir || "Загрузка…"}
                      </div>
                    </div>
                    <div className="btns">
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={changeCacheDir}
                      >
                        Изменить
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
                  <span className="group-title">Reset</span>
                </div>
                <div className="panel">
                  <div className="set-row">
                    <div className="set-cell">
                      <div className="set-title">Reset settings</div>
                      <div className="set-desc">Restore default volume and server URL.</div>
                    </div>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => setConfirm("settings")}
                    >
                      Reset settings
                    </button>
                  </div>
                  <div className="set-row">
                    <div className="set-cell">
                      <div className="set-title">Reset application data</div>
                      <div className="set-desc">
                        Wipe library, playlists, queue and history. Credentials stay.
                      </div>
                    </div>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => setConfirm("data")}
                    >
                      Wipe data
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

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
                ? "Wipe application data?"
                : "Reset settings?"}
            </div>
            <div className="set-desc">
              {confirm === "data"
                ? "This will permanently delete all your playlists, queue, history and library. Credentials stay. Are you sure?"
                : "This will restore default settings (volume, server URL). Are you sure?"}
            </div>
            <div className="btns" style={{ justifyContent: "flex-end", marginTop: 4 }}>
              <button className="btn btn-outline" onClick={() => setConfirm(null)}>
                Cancel
              </button>
              <button className="btn btn-danger" onClick={doConfirm}>
                Yes, do it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
