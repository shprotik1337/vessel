import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

import * as api from "./api/commands";

// Restore font and UI scale on application startup
try {
  const savedFont = localStorage.getItem("vessel_font");
  if (savedFont && savedFont !== "Default") {
    document.body.style.fontFamily = `${savedFont}, sans-serif`;
  }
  const savedScale = localStorage.getItem("vessel_scale") || localStorage.getItem("vessel_scale_windowed");
  if (savedScale) {
    const scaleNum = parseInt(savedScale, 10);
    if (scaleNum >= 50 && scaleNum <= 200) {
      void api.windowSetZoom(scaleNum / 100).catch(() => {});
    }
  }
  // Clear any residual CSS zoom if it was set previously
  (document.documentElement.style as any).zoom = "";
  document.documentElement.style.fontSize = "";
} catch {
  // ignore storage errors
}

// Native desktop feel: suppress all browser-like behaviors (context menu, DevTools, reload, print, zoom, image drag)
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || target.isContentEditable;
}

document.addEventListener("contextmenu", (e) => {
  if (isEditableTarget(e.target)) return;
  e.preventDefault();
});

document.addEventListener("keydown", (e) => {
  const key = e.key.toLowerCase();
  const ctrlOrMeta = e.ctrlKey || e.metaKey;

  // Block F5, F3, F7, F12
  if (e.key === "F5" || e.key === "F3" || e.key === "F7" || e.key === "F12") {
    e.preventDefault();
    return;
  }

  // Block browser navigation Alt+Left / Alt+Right
  if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
    e.preventDefault();
    return;
  }

  // Block Backspace browser-back outside editable fields
  if (e.key === "Backspace" && !isEditableTarget(e.target)) {
    e.preventDefault();
    return;
  }

  // Block browser Ctrl/Cmd shortcuts (reload, print, save, view-source, find, devtools, zoom)
  if (ctrlOrMeta) {
    if (
      key === "r" ||
      key === "p" ||
      key === "s" ||
      key === "u" ||
      key === "f" ||
      key === "g" ||
      key === "+" ||
      key === "=" ||
      key === "-" ||
      key === "0"
    ) {
      e.preventDefault();
      return;
    }
    if (e.shiftKey && (key === "i" || key === "j" || key === "c" || key === "r")) {
      e.preventDefault();
      return;
    }
  }
});

// Block Ctrl+Wheel browser zoom (Vessel uses its own UI scale setting)
window.addEventListener(
  "wheel",
  (e) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
    }
  },
  { passive: false }
);

// Prevent ghost image/link dragging like in a web browser
document.addEventListener("dragstart", (e) => {
  const target = e.target;
  if (target instanceof HTMLElement && (target.tagName === "IMG" || target.tagName === "A")) {
    e.preventDefault();
  }
});

// Prevent dropping files/URLs into the window from navigating away from the app
window.addEventListener("dragover", (e) => {
  if (e.dataTransfer?.types.includes("Files")) {
    e.preventDefault();
  }
});
window.addEventListener("drop", (e) => {
  if (e.dataTransfer?.types.includes("Files")) {
    e.preventDefault();
  }
});

// Global error handlers: show raw debug overlay ONLY in dev mode
window.addEventListener("error", (e) => {
  console.error("Window Error:", e);
  if (!import.meta.env.DEV) return;
  let el = document.getElementById("vessel-err-box");
  if (!el) {
    el = document.createElement("div");
    el.id = "vessel-err-box";
    el.style.cssText =
      "position:fixed;top:0;left:0;right:0;bottom:0;background:var(--app-bg,#000);color:#f87171;padding:30px;font-family:monospace;font-size:14px;z-index:9999999;overflow:auto;";
    document.body.appendChild(el);
  }
  el.innerHTML = `<h3 style="color:#ef4444;font-size:16px;">JavaScript Error:</h3><div style="font-weight:bold;margin:10px 0;">${e.message}</div><pre style="color:#fca5a5;background:var(--card-bg,#111);padding:12px;border-radius:6px;overflow:auto;">${e.error?.stack || e.filename + ":" + e.lineno}</pre>`;
});

window.addEventListener("unhandledrejection", (e) => {
  console.error("Unhandled Rejection:", e);
  if (!import.meta.env.DEV) return;
  let el = document.getElementById("vessel-err-box");
  if (!el) {
    el = document.createElement("div");
    el.id = "vessel-err-box";
    el.style.cssText =
      "position:fixed;top:0;left:0;right:0;bottom:0;background:var(--app-bg,#000);color:#f87171;padding:30px;font-family:monospace;font-size:14px;z-index:9999999;overflow:auto;";
    document.body.appendChild(el);
  }
  el.innerHTML = `<h3 style="color:#ef4444;font-size:16px;">Promise Rejection:</h3><div style="font-weight:bold;margin:10px 0;">${e.reason?.message || String(e.reason)}</div><pre style="color:#fca5a5;background:var(--card-bg,#111);padding:12px;border-radius:6px;overflow:auto;">${e.reason?.stack || ""}</pre>`;
});

class RootErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: any }> {
  constructor(props: any) {
    super(props);
    this.state = { error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { error };
  }
  componentDidCatch(error: any, info: any) {
    console.error("ErrorBoundary caught error:", error, info);
  }
  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "var(--app-bg, #000000)",
            color: "var(--text, #ffffff)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: 16,
            padding: 32,
            zIndex: 999999,
            textAlign: "center",
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 700 }}>Произошла ошибка интерфейса</div>
          <div style={{ fontSize: 13, color: "var(--text2, #9a9ba1)", maxWidth: 420 }}>
            Попробуйте перезагрузить окно приложения.
          </div>
          <button
            type="button"
            onClick={() => window.location.reload()}
            style={{
              padding: "10px 20px",
              borderRadius: 999,
              border: "1px solid var(--border, rgba(255,255,255,0.14))",
              background: "var(--card-bg, #000000)",
              color: "var(--text, #ffffff)",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Перезагрузить
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <RootErrorBoundary>
    <App />
  </RootErrorBoundary>
);
