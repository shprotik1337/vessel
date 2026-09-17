import React, { useEffect, useState } from "react";
import { useApp } from "../store";
import { t } from "../i18n";
import * as api from "../api/commands";

const APP_VERSION = "1.3.16";

export function Titlebar() {
  const { lang } = useApp();
  const [isMaximized, setIsMaximized] = useState(false);

  useEffect(() => {
    void api.windowIsMaximized().then(setIsMaximized).catch(() => {});

    const onResize = () => {
      void api.windowIsMaximized().then(setIsMaximized).catch(() => {});
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const handleMinimize = (e: React.MouseEvent) => {
    e.stopPropagation();
    void api.windowMinimize();
  };

  const handleToggleMaximize = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    void api.windowToggleMaximize().then(() => {
      void api.windowIsMaximized().then(setIsMaximized).catch(() => {});
    });
  };

  const handleClose = (e: React.MouseEvent) => {
    e.stopPropagation();
    void api.windowClose();
  };

  const handleDoubleClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    handleToggleMaximize();
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    // Only primary mouse button (left-click) starts window dragging
    if (e.button === 0 && !(e.target as HTMLElement).closest("button")) {
      void api.windowStartDragging();
    }
  };

  return (
    <header
      className="titlebar"
      data-tauri-drag-region
      onMouseDown={handleMouseDown}
      onDoubleClick={handleDoubleClick}
    >
      <div className="titlebar-brand" data-tauri-drag-region>
        <span className="titlebar-app-name" data-tauri-drag-region>
          Vessel
        </span>
        <span className="titlebar-app-version" data-tauri-drag-region>
          {APP_VERSION}
        </span>
      </div>

      <div className="titlebar-drag-space" data-tauri-drag-region />

      <div className="titlebar-right" data-tauri-drag-region="false">
        <button
          className="titlebar-btn minimize"
          onClick={handleMinimize}
          title={t(lang, "titlebar.minimize")}
          aria-label="Minimize"
        >
          <svg width="10" height="1" viewBox="0 0 10 1">
            <line
              x1="0"
              y1="0.5"
              x2="10"
              y2="0.5"
              stroke="currentColor"
              strokeWidth="1"
            />
          </svg>
        </button>

        <button
          className="titlebar-btn maximize"
          onClick={handleToggleMaximize}
          title={
            isMaximized
              ? t(lang, "titlebar.restore")
              : t(lang, "titlebar.maximize")
          }
          aria-label="Maximize"
        >
          {isMaximized ? (
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
            >
              <path d="M2.5 1.5h6v6" />
              <rect x="1.5" y="2.5" width="6" height="6" />
            </svg>
          ) : (
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1"
            >
              <rect x="1" y="1" width="8" height="8" />
            </svg>
          )}
        </button>

        <button
          className="titlebar-btn close"
          onClick={handleClose}
          title={t(lang, "titlebar.close")}
          aria-label="Close"
        >
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            stroke="currentColor"
            strokeWidth="1.2"
          >
            <line x1="1" y1="1" x2="9" y2="9" />
            <line x1="9" y1="1" x2="1" y2="9" />
          </svg>
        </button>
      </div>
    </header>
  );
}