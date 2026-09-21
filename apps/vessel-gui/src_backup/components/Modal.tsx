import { useEffect, useState } from "react";

import * as api from "../api/commands";
import { t, type Lang } from "../i18n";

type ModalBase = {
  lang: Lang;
  onClose: () => void;
};

function stop(e: React.MouseEvent) {
  e.stopPropagation();
}

export function TextInputModal({
  lang,
  title,
  hint,
  placeholder,
  initial = "",
  confirmText,
  onSubmit,
  onClose,
}: ModalBase & {
  title: string;
  hint?: string;
  placeholder?: string;
  initial?: string;
  confirmText: string;
  onSubmit: (value: string) => void | Promise<void>;
}) {
  const [value, setValue] = useState(initial);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="ov show" onMouseDown={stop}>
      <div className="ov-card" style={{ width: 440, height: "auto", padding: 24, gap: 14 }} onClick={stop}>
        <div className="sett-title" style={{ fontSize: 18 }}>{title}</div>
        {hint && <div className="set-desc">{hint}</div>}
        <div className="input-row">
          <input
            type="text"
            placeholder={placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void onSubmit(value);
            }}
            autoFocus
          />
        </div>
        <div className="btns" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn-outline" onClick={onClose}>
            {t(lang, "common.cancel")}
          </button>
          <button className="btn btn-primary" onClick={() => void onSubmit(value)}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export function ConfirmModal({
  lang,
  title,
  text,
  confirmText,
  onConfirm,
  onClose,
}: ModalBase & {
  title: string;
  text?: string;
  confirmText: string;
  onConfirm: () => void | Promise<void>;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="ov show" onMouseDown={stop}>
      <div className="ov-card" style={{ width: 420, height: "auto", padding: 24, gap: 16 }} onClick={stop}>
        <div className="sett-title" style={{ fontSize: 18 }}>{title}</div>
        {text && <div className="set-desc">{text}</div>}
        <div className="btns" style={{ justifyContent: "flex-end", marginTop: 4 }}>
          <button className="btn btn-outline" onClick={onClose}>
            {t(lang, "common.cancel")}
          </button>
          <button
            className="btn btn-danger"
            onClick={() => {
              void onConfirm();
            }}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

export function PathModal({
  lang,
  title,
  hint,
  initial = "",
  placeholder,
  browseMode,
  extensions,
  confirmText,
  onSubmit,
  onClose,
}: ModalBase & {
  title: string;
  hint?: string;
  initial?: string;
  placeholder?: string;
  browseMode: "folder" | "open";
  extensions?: string[];
  confirmText: string;
  onSubmit: (value: string) => void | Promise<void>;
}) {
  const [value, setValue] = useState(initial);
  const [browsing, setBrowsing] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const browse = async () => {
    setBrowsing(true);
    try {
      const picked =
        browseMode === "folder"
          ? await api.pickFolder()
          : await api.pickFile(extensions);
      if (picked) setValue(picked);
    } catch {
      // диалог мог не открыться — молча продолжаем
    } finally {
      setBrowsing(false);
    }
  };

  return (
    <div className="ov show" onMouseDown={stop}>
      <div className="ov-card" style={{ width: 480, height: "auto", padding: 24, gap: 14 }} onClick={stop}>
        <div className="sett-title" style={{ fontSize: 18 }}>{title}</div>
        {hint && <div className="set-desc">{hint}</div>}
        <div className="input-row">
          <input
            type="text"
            placeholder={placeholder}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void onSubmit(value);
            }}
            style={{ minWidth: 0, flex: 1 }}
          />
          <button className="btn btn-outline btn-sm" onClick={browse} disabled={browsing}>
            {browsing ? "…" : t(lang, "common.browse")}
          </button>
        </div>
        <div className="btns" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn-outline" onClick={onClose}>
            {t(lang, "common.cancel")}
          </button>
          <button className="btn btn-primary" onClick={() => void onSubmit(value)}>
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
