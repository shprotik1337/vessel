import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// Global error handlers so runtime errors are visible on screen
window.addEventListener("error", (e) => {
  console.error("Window Error:", e);
  let el = document.getElementById("vessel-err-box");
  if (!el) {
    el = document.createElement("div");
    el.id = "vessel-err-box";
    el.style.cssText =
      "position:fixed;top:0;left:0;right:0;bottom:0;background:#18181b;color:#f87171;padding:30px;font-family:monospace;font-size:14px;z-index:9999999;overflow:auto;";
    document.body.appendChild(el);
  }
  el.innerHTML = `<h3 style="color:#ef4444;font-size:16px;">JavaScript Error:</h3><div style="font-weight:bold;margin:10px 0;">${e.message}</div><pre style="color:#fca5a5;background:#27272a;padding:12px;border-radius:6px;overflow:auto;">${e.error?.stack || e.filename + ":" + e.lineno}</pre>`;
});

window.addEventListener("unhandledrejection", (e) => {
  console.error("Unhandled Rejection:", e);
  let el = document.getElementById("vessel-err-box");
  if (!el) {
    el = document.createElement("div");
    el.id = "vessel-err-box";
    el.style.cssText =
      "position:fixed;top:0;left:0;right:0;bottom:0;background:#18181b;color:#f87171;padding:30px;font-family:monospace;font-size:14px;z-index:9999999;overflow:auto;";
    document.body.appendChild(el);
  }
  el.innerHTML = `<h3 style="color:#ef4444;font-size:16px;">Promise Rejection:</h3><div style="font-weight:bold;margin:10px 0;">${e.reason?.message || String(e.reason)}</div><pre style="color:#fca5a5;background:#27272a;padding:12px;border-radius:6px;overflow:auto;">${e.reason?.stack || ""}</pre>`;
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
      const err = this.state.error as any;
      return (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "#18181b",
            color: "#f87171",
            padding: 30,
            zIndex: 999999,
            overflow: "auto",
            fontFamily: "monospace",
          }}
        >
          <h3 style={{ color: "#ef4444", fontSize: 16 }}>React Render Error:</h3>
          <div style={{ fontWeight: "bold", margin: "10px 0" }}>{err?.message || String(err)}</div>
          <pre
            style={{
              color: "#fca5a5",
              background: "#27272a",
              padding: 12,
              borderRadius: 6,
              overflow: "auto",
            }}
          >
            {err?.stack || ""}
          </pre>
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