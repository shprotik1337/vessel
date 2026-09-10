import { useEffect, useState } from "react";

import { useApp } from "../store";
import type { UserProfile } from "../api/types";
import * as api from "../api/commands";
import { t } from "../i18n";

export function UserSelector() {
  const { showToast, refresh, lang } = useApp();
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const known = await api.getKnownUsers();
      setUsers(known);
    } catch (error) {
      showToast(String(error), true);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const choose = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await api.selectUser(selected, remember);
      await refresh();
    } catch (error) {
      showToast(String(error), true);
      setBusy(false);
    }
  };

  const createAndChoose = async () => {
    const name = window.prompt("Имя нового пользователя:", "");
    if (!name || !name.trim()) return;
    setBusy(true);
    try {
      await api.createUser(name.trim());
      await api.selectUser(name.trim(), remember);
      await refresh();
    } catch (error) {
      showToast(String(error), true);
      setBusy(false);
    }
  };

  const colors = ["#E1332D", "#4361EE", "#7209B7", "#F72585", "#1DB954", "#FF6B35", "#06D6A0", "#118AB2"];

  return (
    <div className="ov show">
      <div
        className="ov-card"
        style={{
          width: 480,
          height: "auto",
          maxHeight: "90vh",
          padding: 0,
          gap: 0,
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ padding: "32px 32px 20px", textAlign: "center" }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 12,
              background: "var(--text)",
              color: "#0B0B0C",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 22,
              fontWeight: 700,
              margin: "0 auto 16px",
            }}
          >
            V
          </div>
          <div className="sett-title" style={{ fontSize: 22, marginBottom: 6 }}>
            {t(lang, "selector.welcome")}
          </div>
          <div className="set-desc" style={{ fontSize: 14, margin: 0 }}>
            {t(lang, "selector.sub")}
          </div>
        </div>

        <div
          style={{
            maxHeight: 320,
            overflowY: "auto",
            padding: "0 16px",
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          {users.map((u, i) => {
            const isSelected = selected === u.display_name;
            return (
              <button
                key={u.id}
                onClick={() => setSelected(u.display_name)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 14,
                  padding: "14px 16px",
                  borderRadius: 10,
                  border: `1.5px solid ${isSelected ? "var(--text)" : "var(--border)"}`,
                  background: isSelected ? "var(--track)" : "transparent",
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                  transition: "border-color .15s, background .15s",
                }}
              >
                <div
                  style={{
                    width: 42,
                    height: 42,
                    borderRadius: 10,
                    background: colors[i % colors.length],
                    color: "#fff",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 15,
                    fontWeight: 700,
                    flexShrink: 0,
                  }}
                >
                  {u.display_name.slice(0, 1).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 15, fontWeight: 600 }}>{u.display_name}</div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "var(--text3)",
                      marginTop: 2,
                    }}
                  >
                    Создан {new Date(u.created_at_ms).toLocaleDateString()}
                  </div>
                </div>
                {isSelected && (
                  <span style={{ color: "var(--text)", fontSize: 18 }}>✓</span>
                )}
              </button>
            );
          })}
          {users.length === 0 && (
            <div
              style={{
                padding: 24,
                textAlign: "center",
                color: "var(--text3)",
                fontSize: 14,
              }}
            >
              {t(lang, "selector.none")}
            </div>
          )}
        </div>

        <div
          style={{
            padding: "16px 24px 24px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              cursor: "pointer",
              userSelect: "none",
            }}
          >
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              style={{ width: 16, height: 16, accentColor: "var(--text)" }}
            />
            <span style={{ fontSize: 13, color: "var(--text2)" }}>
              {t(lang, "selector.remember")}
            </span>
          </label>

          <div style={{ display: "flex", gap: 10 }}>
            <button
              className="btn btn-outline"
              style={{ flex: 1 }}
              onClick={createAndChoose}
              disabled={busy}
            >
              {t(lang, "selector.create")}
            </button>
            <button
              className="btn btn-primary"
              style={{ flex: 1 }}
              onClick={choose}
              disabled={busy || !selected}
            >
              {busy ? "…" : t(lang, "selector.continue")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}