import React, { useState } from "react";
import * as api from "../api/commands";

interface MigrationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export const MigrationModal: React.FC<MigrationModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleMigrate = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      await api.authMigrateData();
      onSuccess();
    } catch (err: any) {
      console.error("Migration error", err);
      setErrorMsg(typeof err === "string" ? err : err?.message || "Ошибка при переносе данных");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60000,
        background: "rgba(0, 0, 0, 0.85)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "440px",
          background: "#000000",
          border: "1px solid rgba(255, 255, 255, 0.1)",
          borderRadius: "20px",
          padding: "28px",
          boxShadow: "0 24px 64px rgba(0, 0, 0, 0.95)",
          color: "#ffffff",
          display: "flex",
          flexDirection: "column",
          gap: "16px",
          boxSizing: "border-box",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "42px",
              height: "42px",
              borderRadius: "12px",
              background: "rgba(255, 255, 255, 0.08)",
              border: "1px solid rgba(255, 255, 255, 0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: "20px",
            }}
          >
            ☁️
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: "18px", fontWeight: 700 }}>
              Перенести локальные данные?
            </h3>
            <div style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.4)", marginTop: "2px" }}>
              Облачная синхронизация Vessel
            </div>
          </div>
        </div>

        <p style={{ margin: 0, fontSize: "13.5px", color: "rgba(255, 255, 255, 0.65)", lineHeight: 1.5 }}>
          На вашем устройстве найдены сохранённые треки и плейлисты. Хотите перенести их в ваш облачный аккаунт?
          Они будут объединены с вашей библиотекой на сервере, а локальная копия останется в сохранности.
        </p>

        {errorMsg && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "10px",
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#f87171",
              fontSize: "12.5px",
            }}
          >
            {errorMsg}
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: "10px", marginTop: "8px" }}>
          <button
            type="button"
            disabled={loading}
            onClick={handleMigrate}
            style={{
              width: "100%",
              padding: "12px",
              background: "#ffffff",
              color: "#000000",
              border: "none",
              borderRadius: "12px",
              fontSize: "13.5px",
              fontWeight: 700,
              cursor: loading ? "not-allowed" : "pointer",
              transition: "opacity 0.15s ease",
            }}
          >
            {loading ? "Перенос данных…" : "Перенести в облако"}
          </button>
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            style={{
              width: "100%",
              padding: "11px",
              background: "rgba(255, 255, 255, 0.05)",
              color: "rgba(255, 255, 255, 0.7)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "12px",
              fontSize: "13px",
              fontWeight: 600,
              cursor: loading ? "not-allowed" : "pointer",
            }}
          >
            Оставить только локально
          </button>
        </div>
      </div>
    </div>
  );
};
