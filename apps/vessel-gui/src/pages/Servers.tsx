import { useEffect, useState } from "react";

import { useApp } from "../store";
import * as api from "../api/commands";
import { t } from "../i18n";

type ServerView = api.VesselServerView;

export function ServersTab() {
  const { showToast, lang } = useApp();
  const [servers, setServers] = useState<ServerView[]>([]);
  const [routes, setRoutes] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState<Record<string, string>>({});

  const load = async () => {
    try {
      const [sv, rt] = await Promise.all([api.vesselServers(), api.vesselRoutes()]);
      setServers(sv);
      setRoutes(rt);
    } catch (error) {
      showToast(String(error), true);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const add = async () => {
    if (!url.trim()) return;
    setBusy(true);
    try {
      await api.vesselServerAdd(name || url, url, token);
      setValueClear();
      await load();
      showToast(t(lang, "server.addedToast"));
    } catch (error) {
      showToast(String(error), true);
    } finally {
      setBusy(false);
    }
  };

  const setValueClear = () => {
    setName("");
    setUrl("");
    setToken("");
  };

  const test = async (id: string, label: string) => {
    setTesting((m) => ({ ...m, [id]: "…" }));
    try {
      const probe = await api.vesselServerProbe({ id });
      setTesting((m) => ({
        ...m,
        [id]: `${probe.name} · v${probe.version} · ${probe.providers.length}`,
      }));
    } catch (error) {
      setTesting((m) => ({ ...m, [id]: String(error) }));
    }
    void label;
  };

  const remove = async (id: string) => {
    try {
      await api.vesselServerRemove(id);
      await load();
      showToast(t(lang, "server.removedToast"));
    } catch (error) {
      showToast(String(error), true);
    }
  };

  const setRoute = async (providerKind: string, target: string) => {
    const segment = api.PROVIDER_SEGMENT[providerKind] ?? providerKind;
    try {
      await api.vesselRouteSet(segment, target);
      await load();
    } catch (error) {
      showToast(String(error), true);
      await load();
    }
  };

  return (
    <>
      <div className="sett-hd">
        <div className="sett-title">{t(lang, "server.title")}</div>
        <div className="sett-sub">{t(lang, "server.sub")}</div>
      </div>

      <div className="group">
        <div className="group-hd">
          <span className="group-title">{t(lang, "server.myServers")}</span>
        </div>
        <div className="panel">
          {servers.length === 0 && (
            <div className="set-desc" style={{ padding: 12 }}>
              {t(lang, "server.noServers")}
            </div>
          )}
          {servers.map((s) => (
            <div key={s.id} className="svc-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                  {s.name}
                  <span className={`badge ${s.has_token ? "ok" : "warn"}`}>
                    <span className="bdot" />
                    token
                  </span>
                  {s.providers.map((p) => (
                    <span key={p} className="chip" style={{ padding: "2px 8px", fontSize: 11 }}>
                      {p}
                    </span>
                  ))}
                </div>
                <div className="set-desc" style={{ marginTop: 2, wordBreak: "break-all" }}>
                  {s.url}
                  {testing[s.id] ? ` — ${testing[s.id]}` : ""}
                </div>
              </div>
              <div className="btns">
                <button className="btn btn-ghost btn-sm" onClick={() => void test(s.id, s.name)}>
                  {t(lang, "server.test")}
                </button>
                <button className="btn btn-outline btn-sm" onClick={() => void remove(s.id)}>
                  {t(lang, "server.remove")}
                </button>
              </div>
            </div>
          ))}

          <div
            className="input-row"
            style={{ padding: "12px 20px 16px", borderTop: "1px solid var(--border)" }}
          >
            <input type="text" placeholder={t(lang, "server.name")} value={name} onChange={(e) => setName(e.target.value)} style={{ minWidth: 0, flex: 0.8 }} />
            <input type="text" placeholder="https://my-vps.example.com:7700" value={url} onChange={(e) => setUrl(e.target.value)} style={{ minWidth: 0, flex: 1.6 }} autoFocus />
            <input type="password" placeholder={t(lang, "server.token")} value={token} onChange={(e) => setToken(e.target.value)} style={{ minWidth: 0, flex: 1 }} />
            <button className="btn btn-primary btn-sm" onClick={() => void add()} disabled={busy || !url.trim()}>
              {busy ? "…" : t(lang, "server.add")}
            </button>
          </div>
        </div>
      </div>

      <div className="group">
        <div className="group-hd">
          <span className="group-title">{t(lang, "server.routesTitle")}</span>
          <span className="group-note">{t(lang, "server.routesSub")}</span>
        </div>
        <div className="panel">
          {Object.entries(api.PROVIDER_SEGMENT).map(([kind, segment]) => {
            const target = routes[segment] ?? "local";
            const server = servers.find((s) => `server:${s.id}` === target);
            return (
              <div key={kind} className="set-row" style={{ alignItems: "center" }}>
                <div className="set-cell">
                  <div className="set-title">{api_LABEL(kind)}</div>
                  <div className="set-desc">
                    {server ? `→ ${server.name}` : t(lang, "server.local")}
                  </div>
                </div>
                <div className="select">
                  <select
                    value={target === "local" ? "local" : target}
                    onChange={(e) => void setRoute(kind, e.target.value)}
                  >
                    <option value="local">{t(lang, "server.thisComputer")}</option>
                    {servers.map((s) => (
                      <option key={s.id} value={`server:${s.id}`}>
                        {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </>
  );
}

function api_LABEL(kind: string): string {
  const names: Record<string, string> = {
    soundcloud: "SoundCloud",
    yandex: "Yandex Music",
    deezer: "Deezer",
    spotify: "Spotify",
    youtube_music: "YouTube Music",
  };
  return names[kind] ?? kind;
}
