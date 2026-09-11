import { useEffect, useState } from "react";

import { useApp } from "../store";
import * as api from "../api/commands";
import type { VpnProfile, VpnStatus } from "../api/commands";
import { t } from "../i18n";

const POLL_INTERVAL = 1500;

export function VpnTab() {
  const { showToast, lang } = useApp();
  const [status, setStatus] = useState<VpnStatus | null>(null);
  const [profiles, setProfiles] = useState<VpnProfile[]>([]);
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [externalIp, setExternalIp] = useState<string | null>(null);

  const load = async () => {
    try {
      const [status, profiles] = await Promise.all([api.vpnStatus(), api.vpnProfiles()]);
      setStatus(status);
      setProfiles(profiles);
    } catch (error) {
      showToast(String(error), true);
    }
  };

  useEffect(() => {
    void load();
    const timer = setInterval(() => void load(), POLL_INTERVAL);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async (id: string) => {
    setBusy(true);
    try {
      await api.vpnConnect(id);
      await load();
    } catch (error) {
      showToast(String(error), true);
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    setBusy(true);
    try {
      await api.vpnDisconnect();
      setExternalIp(null);
      await load();
    } catch (error) {
      showToast(String(error), true);
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    setBusy(true);
    try {
      await api.vpnRemoveProfile(id);
      await load();
    } catch (error) {
      showToast(String(error), true);
    } finally {
      setBusy(false);
    }
  };

  const check = async () => {
    setBusy(true);
    try {
      const ip = await api.vpnCheck();
      setExternalIp(ip);
      if (ip) showToast(`${t(lang, "vpn.externalIp")}: ${ip}`);
    } catch (error) {
      showToast(String(error), true);
    } finally {
      setBusy(false);
    }
  };

  const showLogs = async () => {
    try {
      setLogs(await api.vpnLogs(60));
      setLogsOpen((v) => !v);
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const connected = status?.status === "connected";
  const transitioning =
    status?.status === "connecting" || status?.status === "disconnecting" || status?.status === "reconnecting";

  return (
    <>
      <div className="sett-hd">
        <div className="sett-title">{t(lang, "vpn.title")}</div>
        <div className="sett-sub">{t(lang, "vpn.sub")}</div>
      </div>

      <div className="group">
        <div className="group-hd">
          <span className="group-title">{t(lang, "vpn.connection")}</span>
        </div>
        <div className="panel">
          <div className="svc-row">
            <div
              className="svc-logo"
              style={{ background: "var(--elev)", width: 52, height: 52, borderRadius: 6 }}
            >
              <span style={{ fontSize: 22 }}>🛡</span>
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                <span
                  className="src-dot"
                  style={{
                    background:
                      status?.status === "connected"
                        ? "#9A9BA1"
                        : status?.status === "error"
                          ? "var(--red)"
                          : "var(--text3)",
                  }}
                />
                {status ? t(lang, `vpn.state.${status.status}` as Parameters<typeof t>[1]) : "…"}
                {transitioning && "…"}
              </div>
              <div className="set-desc" style={{ marginTop: 2 }}>
                {status?.status === "error" && status.error
                  ? status.error
                  : status?.profile_name
                    ? `${status.profile_name}${status.proxy_port ? ` · :${status.proxy_port}` : ""}`
                    : t(lang, "vpn.disconnectedHint")}
              </div>
            </div>
            <div className="btns">
              {connected ? (
                <button className="btn btn-outline btn-sm" onClick={disconnect} disabled={busy}>
                  {t(lang, "vpn.disconnect")}
                </button>
              ) : (
                status?.profile_id && (
                  <button
                    className="btn btn-primary btn-sm"
                    onClick={() => void connect(status.profile_id!)}
                    disabled={busy || transitioning || !status.core_present}
                  >
                    {t(lang, "vpn.connect")}
                  </button>
                )
              )}
              {connected && (
                <button className="btn btn-ghost btn-sm" onClick={check} disabled={busy}>
                  {t(lang, "vpn.check")}
                </button>
              )}
            </div>
          </div>
          {!status?.core_present && (
            <div className="set-desc" style={{ padding: "0 20px 14px", color: "var(--red)" }}>
              {t(lang, "vpn.coreMissing")}
            </div>
          )}
        </div>
      </div>

      <div className="group">
        <div className="group-hd">
          <span className="group-title">{t(lang, "vpn.profiles")}</span>
          <button className="btn btn-primary btn-sm" onClick={() => setAddOpen(true)}>
            {t(lang, "vpn.add")}
          </button>
        </div>
        <div className="panel">
          {profiles.map((profile) => {
            const isActive = status?.profile_id === profile.id;
            return (
              <div key={profile.id} className="svc-row">
                <div
                  className="svc-logo"
                  style={{ background: "var(--elev)", width: 44, height: 44, borderRadius: 6 }}
                >
                  <span style={{ fontSize: 16, fontWeight: 700 }}>
                    {profile.kind === "vless" ? "VL" : "AW"}
                  </span>
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                    {profile.name}
                    {isActive && connected && (
                      <span className="badge ok">
                        <span className="bdot" />
                        {t(lang, "vpn.state.connected")}
                      </span>
                    )}
                  </div>
                  <div className="set-desc" style={{ marginTop: 2 }}>
                    {profile.kind === "vless"
                      ? `VLESS · ${profile.transport}`
                      : `Amnezia · ${profile.transport}`}{" "}
                    · {profile.server}:{profile.port}
                  </div>
                </div>
                <div className="btns">
                  {isActive && connected ? (
                    <button className="btn btn-outline btn-sm" onClick={disconnect} disabled={busy}>
                      {t(lang, "vpn.disconnect")}
                    </button>
                  ) : (
                    <button
                      className="btn btn-outline btn-sm"
                      onClick={() => void connect(profile.id)}
                      disabled={busy || transitioning || !status?.core_present}
                    >
                      {t(lang, "vpn.connect")}
                    </button>
                  )}
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => void remove(profile.id)}
                    disabled={busy || (isActive && connected)}
                  >
                    {t(lang, "users.delete")}
                  </button>
                </div>
              </div>
            );
          })}
          {profiles.length === 0 && (
            <div className="set-desc" style={{ padding: 12 }}>
              {t(lang, "vpn.noProfiles")}
            </div>
          )}
        </div>
      </div>

      <div className="group">
        <div className="group-hd">
          <span className="group-title">{t(lang, "vpn.diagnostics")}</span>
        </div>
        <div className="panel">
          <div className="set-row">
            <div className="set-cell">
              <div className="set-title">{t(lang, "vpn.logs")}</div>
              <div className="set-desc">
                {externalIp ? `${t(lang, "vpn.externalIp")}: ${externalIp}` : t(lang, "vpn.logsDesc")}
              </div>
            </div>
            <div className="btns">
              <button className="btn btn-ghost btn-sm" onClick={showLogs}>
                {logsOpen ? t(lang, "common.cancel") : t(lang, "vpn.showLogs")}
              </button>
            </div>
          </div>
          {logsOpen && (
            <pre
              style={{
                margin: "0 20px 16px",
                padding: 12,
                background: "var(--elev)",
                borderRadius: 6,
                fontSize: 11,
                lineHeight: 1.5,
                maxHeight: 220,
                overflow: "auto",
                whiteSpace: "pre-wrap",
              }}
            >
              {logs.length > 0 ? logs.join("\n") : t(lang, "vpn.logsEmpty")}
            </pre>
          )}
        </div>
      </div>

      {addOpen && <AddProfileModal onClose={() => setAddOpen(false)} onAdded={load} />}
    </>
  );
}

function AddProfileModal({
  onClose,
  onAdded,
}: {
  onClose: () => void;
  onAdded: () => Promise<void>;
}) {
  const { showToast, lang } = useApp();
  const [kind, setKind] = useState<"vless" | "amnezia">("vless");
  const [name, setName] = useState("");
  const [payload, setPayload] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      if (kind === "vless") {
        await api.vpnAddVless(name, payload.trim());
      } else {
        await api.vpnAddAmnezia(name, payload);
      }
      await onAdded();
      onClose();
      showToast(t(lang, "vpn.added"));
    } catch (error) {
      showToast(String(error), true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="ov show" onMouseDown={(e) => e.stopPropagation()}>
      <div
        className="ov-card"
        style={{ width: 480, height: "auto", padding: 24, gap: 14 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sett-title" style={{ fontSize: 18 }}>{t(lang, "vpn.addTitle")}</div>

        <div className="chips">
          <button
            className={`chip ${kind === "vless" ? "active" : ""}`}
            style={kind === "vless" ? { borderColor: "var(--border3)", color: "var(--text)" } : undefined}
            onClick={() => setKind("vless")}
          >
            VLESS
          </button>
          <button
            className={`chip ${kind === "amnezia" ? "active" : ""}`}
            style={kind === "amnezia" ? { borderColor: "var(--border3)", color: "var(--text)" } : undefined}
            onClick={() => setKind("amnezia")}
          >
            Amnezia
          </button>
        </div>

        <div className="input-row">
          <input
            type="text"
            placeholder={t(lang, "vpn.profileName")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {kind === "vless" ? (
          <div className="input-row">
            <input
              type="text"
              placeholder="vless://…"
              value={payload}
              onChange={(e) => setPayload(e.target.value)}
              style={{ minWidth: 0, flex: 1, fontFamily: "monospace" }}
              autoFocus
            />
          </div>
        ) : (
          <textarea
            placeholder={t(lang, "vpn.amneziaPlaceholder")}
            value={payload}
            onChange={(e) => setPayload(e.target.value)}
            rows={8}
            style={{
              background: "var(--elev)",
              border: "1px solid var(--border)",
              borderRadius: 6,
              color: "var(--text)",
              padding: 10,
              fontSize: 12,
              fontFamily: "monospace",
              resize: "vertical",
            }}
          />
        )}

        <div className="btns" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn-outline" onClick={onClose}>
            {t(lang, "common.cancel")}
          </button>
          <button
            className="btn btn-primary"
            onClick={() => void submit()}
            disabled={busy || !payload.trim()}
          >
            {busy ? "…" : t(lang, "common.create")}
          </button>
        </div>
      </div>
    </div>
  );
}
