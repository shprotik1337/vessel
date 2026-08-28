import { useState } from "react";

import { useApp } from "../store";
import type { ProviderStatus } from "../api/types";
import * as api from "../api/commands";

type Tab = "services" | "playback" | "storage";

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
};

function VolumeSlider() {
  const { state, showToast, refresh } = useApp();
  if (!state) return null;
  const vol = state.player.volume_percent;

  const handleClick = async (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const value = Math.round((x / rect.width) * 100);
    try {
      await api.setVolume(Math.max(0, Math.min(100, value)));
      await refresh();
    } catch (error) {
      showToast(String(error), true);
    }
  };

  return (
    <div className="slider-row">
      <div className="slider" onClick={handleClick} style={{ maxWidth: 200 }}>
        <div className="fill" style={{ width: `${vol}%` }} />
        <div className="knob" style={{ left: `${vol}%` }} />
      </div>
      <span className="slider-num">{vol}%</span>
    </div>
  );
}

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

  if (!state) return null;

  const resetSettings = async () => {
    if (!window.confirm("Reset all settings to defaults?")) return;
    try {
      await api.resetSettings();
      await refresh();
      showToast("Settings reset to defaults");
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const resetData = async () => {
    if (!window.confirm("Wipe all library, playlists, queue and history?")) return;
    try {
      await api.resetData();
      await refresh();
      showToast("Application data wiped");
    } catch (error) {
      showToast(String(error), true);
    }
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
            </>
          )}

          {tab === "playback" && (
            <>
              <div className="sett-hd">
                <div className="sett-title">Playback</div>
                <div className="sett-sub">Volume and repeat behavior.</div>
              </div>
              <div className="group">
                <div className="group-hd">
                  <span className="group-title">Volume</span>
                </div>
                <div className="panel">
                  <div className="set-row">
                    <div className="set-cell">
                      <div className="set-title">Master volume</div>
                      <div className="set-desc">Click or drag on the slider.</div>
                    </div>
                    <VolumeSlider />
                  </div>
                </div>
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
                <div className="sett-sub">Danger zone: reset local data.</div>
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
                    <button className="btn btn-danger btn-sm" onClick={resetSettings}>
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
                    <button className="btn btn-danger btn-sm" onClick={resetData}>
                      Wipe data
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
