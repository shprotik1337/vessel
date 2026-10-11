import React, { useEffect, useState, useCallback, useMemo } from "react";
import * as api from "../api/commands";
import type { CaptchaChallenge } from "../api/types";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (hasLocalData: boolean) => void;
  onContinueGuest: () => void;
}

const SYMBOL_SVGS: Record<string, React.ReactNode> = {
  cloud: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
      <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
    </svg>
  ),
  diamond: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
      <path d="M12 2L2 12l10 10 10-10L12 2z" />
    </svg>
  ),
  note: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
    </svg>
  ),
  crown: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
      <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .55-.45 1-1 1H6c-.55 0-1-.45-1-1v-1h14v1z" />
    </svg>
  ),
  star: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
    </svg>
  ),
  bolt: (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="currentColor">
      <path d="M11 21h-1l1-7H7.5c-.88 0-.33-.75-.31-.78C8.48 10.94 10.42 7.54 13 3h1l-1 7h3.5c.49 0 .56.33.47.51l-.07.13-5.9 10.36z" />
    </svg>
  ),
};

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onContinueGuest,
}) => {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [challenge, setChallenge] = useState<CaptchaChallenge | null>(null);
  const [selectedClicks, setSelectedClicks] = useState<number[]>([]);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchCaptcha = useCallback(async () => {
    try {
      const cap = await api.authGetCaptcha();
      setChallenge(cap);
      setSelectedClicks([]);
      setErrorMsg(null);
    } catch (e) {
      console.error("Failed to load captcha", e);
      setErrorMsg("Не удалось загрузить капчу с сервера");
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      void fetchCaptcha();
      setErrorMsg(null);
    }
  }, [isOpen, fetchCaptcha]);

  const handleSymbolClick = (itemId: number) => {
    if (selectedClicks.includes(itemId)) {
      // Remove it and subsequent
      const idx = selectedClicks.indexOf(itemId);
      setSelectedClicks((prev) => prev.slice(0, idx));
      return;
    }
    if (challenge && selectedClicks.length < challenge.targets.length) {
      setSelectedClicks((prev) => [...prev, itemId]);
    }
  };

  const handleResetClicks = () => {
    setSelectedClicks([]);
  };

  const isCaptchaSolved = useMemo(() => {
    return challenge ? selectedClicks.length === challenge.targets.length : false;
  }, [challenge, selectedClicks]);

  const canSubmit = useMemo(() => {
    return (
      username.trim().length > 0 &&
      password.length >= 8 &&
      (mode === "login" ? true : isCaptchaSolved) &&
      !loading
    );
  }, [username, password, mode, isCaptchaSolved, loading]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      if (mode === "register") {
        if (!challenge) {
          setErrorMsg("Пройдите проверку");
          setLoading(false);
          return;
        }
        const res = await api.authRegister({
          username: username.trim(),
          password,
          captcha_id: challenge.id,
          captcha_clicks: selectedClicks,
        });
        onSuccess(res.has_local_data);
      } else {
        const res = await api.authLogin({
          username: username.trim(),
          password,
          captcha_id: challenge?.id,
          captcha_clicks: selectedClicks.length > 0 ? selectedClicks : undefined,
        });
        onSuccess(res.has_local_data);
      }
    } catch (err: any) {
      console.error("Auth error", err);
      const msg = typeof err === "string" ? err : err?.message || "Ошибка авторизации";
      setErrorMsg(msg);
      // Reload captcha on failure
      void fetchCaptcha();
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 60000,
        background: "rgba(0, 0, 0, 0.82)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "480px",
          background: "#000000",
          border: "1px solid rgba(255, 255, 255, 0.08)",
          borderRadius: "20px",
          padding: "28px 32px",
          boxShadow: "0 24px 64px rgba(0, 0, 0, 0.95)",
          color: "#ffffff",
          fontFamily: "inherit",
          display: "flex",
          flexDirection: "column",
          gap: "18px",
          position: "relative",
          boxSizing: "border-box",
        }}
      >
        {/* Top Header: Badge + Tabs */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
            <div
              style={{
                width: "36px",
                height: "36px",
                borderRadius: "10px",
                background: "rgba(255, 255, 255, 0.06)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                color: "#ffffff",
              }}
            >
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              </svg>
            </div>
            <div>
              <div style={{ fontSize: "15px", fontWeight: 700, letterSpacing: "-0.01em" }}>Vessel</div>
              <div style={{ fontSize: "10px", fontWeight: 600, color: "rgba(255, 255, 255, 0.4)", letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Аккаунт
              </div>
            </div>
          </div>

          <div
            style={{
              display: "flex",
              background: "rgba(255, 255, 255, 0.04)",
              borderRadius: "10px",
              padding: "3px",
              border: "1px solid rgba(255, 255, 255, 0.06)",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setErrorMsg(null);
              }}
              style={{
                background: mode === "login" ? "rgba(255, 255, 255, 0.14)" : "transparent",
                color: mode === "login" ? "#ffffff" : "rgba(255, 255, 255, 0.5)",
                border: "none",
                borderRadius: "8px",
                padding: "6px 14px",
                fontSize: "12.5px",
                fontWeight: mode === "login" ? 700 : 500,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              Вход
            </button>
            <button
              type="button"
              onClick={() => {
                setMode("register");
                setErrorMsg(null);
              }}
              style={{
                background: mode === "register" ? "rgba(255, 255, 255, 0.14)" : "transparent",
                color: mode === "register" ? "#ffffff" : "rgba(255, 255, 255, 0.5)",
                border: "none",
                borderRadius: "8px",
                padding: "6px 14px",
                fontSize: "12.5px",
                fontWeight: mode === "register" ? 700 : 500,
                cursor: "pointer",
                transition: "all 0.15s ease",
              }}
            >
              Регистрация
            </button>
          </div>
        </div>

        {/* Title & Subtitle */}
        <div>
          <h2 style={{ margin: "4px 0 6px", fontSize: "24px", fontWeight: 700, letterSpacing: "-0.02em" }}>
            {mode === "login" ? "Вход" : "Регистрация"}
          </h2>
          <p style={{ margin: 0, fontSize: "13px", color: "rgba(255, 255, 255, 0.5)", lineHeight: 1.4 }}>
            {mode === "login"
              ? "Войди в профиль или продолжи гостем для локального режима."
              : "Создай профиль или продолжи гостем для локального режима."}
          </p>
        </div>

        {/* Error notification if any */}
        {errorMsg && (
          <div
            style={{
              padding: "10px 14px",
              borderRadius: "10px",
              background: "rgba(239, 68, 68, 0.1)",
              border: "1px solid rgba(239, 68, 68, 0.3)",
              color: "#f87171",
              fontSize: "12.5px",
              lineHeight: 1.4,
            }}
          >
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Username */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label
              style={{
                fontSize: "10.5px",
                fontWeight: 700,
                color: "rgba(255, 255, 255, 0.4)",
                letterSpacing: "0.06em",
                display: "flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <span>👤</span> НИК
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Имя пользователя"
              autoFocus
              style={{
                background: "rgba(255, 255, 255, 0.04)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "10px",
                padding: "11px 14px",
                color: "#ffffff",
                fontSize: "13.5px",
                outline: "none",
                transition: "border 0.15s ease",
              }}
            />
          </div>

          {/* Password */}
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label
              style={{
                fontSize: "10.5px",
                fontWeight: 700,
                color: "rgba(255, 255, 255, 0.4)",
                letterSpacing: "0.06em",
                display: "flex",
                alignItems: "center",
                gap: "5px",
              }}
            >
              <span>🔑</span> ПАРОЛЬ
            </label>
            <div style={{ position: "relative" }}>
              <input
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Минимум 8 символов"
                style={{
                  width: "100%",
                  boxSizing: "border-box",
                  background: "rgba(255, 255, 255, 0.04)",
                  border: "1px solid rgba(255, 255, 255, 0.08)",
                  borderRadius: "10px",
                  padding: "11px 40px 11px 14px",
                  color: "#ffffff",
                  fontSize: "13.5px",
                  outline: "none",
                }}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                style={{
                  position: "absolute",
                  right: "10px",
                  top: "50%",
                  transform: "translateY(-50%)",
                  background: "none",
                  border: "none",
                  color: "rgba(255, 255, 255, 0.4)",
                  cursor: "pointer",
                  padding: "4px",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M12 7c2.76 0 5 2.24 5 5 0 .65-.13 1.26-.36 1.83l2.92 2.92c1.51-1.26 2.7-2.89 3.43-4.75-1.73-4.39-6-7.5-11-7.5-1.4 0-2.74.25-3.98.7l2.16 2.16C10.74 7.13 11.35 7 12 7zM2 4.27l2.28 2.28.46.46C3.08 8.3 1.78 10.02 1 12c1.73 4.39 6 7.5 11 7.5 1.55 0 3.03-.3 4.38-.84l.42.42L19.73 22 21 20.73 3.27 3 2 4.27zM7.53 9.8l1.55 1.55c-.05.21-.08.43-.08.65 0 1.66 1.34 3 3 3 .22 0 .44-.03.65-.08l1.55 1.55c-.67.33-1.41.53-2.2.53-2.76 0-5-2.24-5-5 0-.79.2-1.53.53-2.2zm4.31-.78l3.15 3.15.02-.16c0-1.66-1.34-3-3-3l-.17.01z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor">
                    <path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {/* Interactive CAPTCHA */}
          <div
            style={{
              background: "#050505",
              border: "1px solid rgba(255, 255, 255, 0.08)",
              borderRadius: "14px",
              padding: "14px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            {/* Captcha Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                <span style={{ fontSize: "14px", color: "rgba(255, 255, 255, 0.7)" }}>🛡️</span>
                <div>
                  <div style={{ fontSize: "12px", fontWeight: 700, color: "#ffffff" }}>Проверка</div>
                  <div style={{ fontSize: "10.5px", color: "rgba(255, 255, 255, 0.4)" }}>Нажмите символы по порядку</div>
                </div>
              </div>
              <button
                type="button"
                onClick={fetchCaptcha}
                title="Обновить капчу"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(255, 255, 255, 0.5)",
                  cursor: "pointer",
                  padding: "4px",
                  display: "flex",
                  alignItems: "center",
                  fontSize: "14px",
                }}
              >
                🔄
              </button>
            </div>

            {/* Target Sequence Bar */}
            {challenge && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "8px",
                  background: "rgba(255, 255, 255, 0.03)",
                  padding: "8px 12px",
                  borderRadius: "10px",
                  border: "1px solid rgba(255, 255, 255, 0.04)",
                }}
              >
                {challenge.targets.map((tgt, i) => {
                  const isDone = selectedClicks.length > i;
                  return (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        background: isDone ? "rgba(255, 255, 255, 0.12)" : "rgba(255, 255, 255, 0.04)",
                        border: isDone ? "1px solid rgba(255, 255, 255, 0.25)" : "1px solid rgba(255, 255, 255, 0.06)",
                        padding: "4px 8px",
                        borderRadius: "8px",
                        transition: "all 0.15s ease",
                      }}
                    >
                      <span
                        style={{
                          width: "16px",
                          height: "16px",
                          borderRadius: "50%",
                          background: isDone ? "#ffffff" : "rgba(255, 255, 255, 0.2)",
                          color: isDone ? "#000000" : "#ffffff",
                          fontSize: "10px",
                          fontWeight: 800,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {i + 1}
                      </span>
                      <span style={{ color: "#ffffff", display: "flex", alignItems: "center" }}>
                        {SYMBOL_SVGS[tgt] ?? tgt}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Playground Area */}
            <div
              style={{
                position: "relative",
                width: "100%",
                height: "120px",
                background: "#030303",
                borderRadius: "10px",
                border: "1px solid rgba(255, 255, 255, 0.04)",
                overflow: "hidden",
                userSelect: "none",
              }}
            >
              {/* Subtle background noise lines */}
              <svg
                width="100%"
                height="100%"
                style={{
                  position: "absolute",
                  inset: 0,
                  pointerEvents: "none",
                  opacity: 0.1,
                }}
              >
                <line x1="10%" y1="20%" x2="90%" y2="80%" stroke="#ffffff" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="20%" y1="90%" x2="80%" y2="10%" stroke="#ffffff" strokeWidth="1" strokeDasharray="4 2" />
                <line x1="5%" y1="50%" x2="95%" y2="45%" stroke="#ffffff" strokeWidth="1" />
              </svg>

              {challenge?.items.map((item) => {
                const clickOrder = selectedClicks.indexOf(item.id);
                const isSelected = clickOrder !== -1;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSymbolClick(item.id)}
                    style={{
                      position: "absolute",
                      left: `${item.x}%`,
                      top: `${item.y}%`,
                      transform: "translate(-50%, -50%)",
                      background: isSelected ? "rgba(255, 255, 255, 0.16)" : "transparent",
                      border: isSelected ? "1.5px solid #ffffff" : "1px solid rgba(255, 255, 255, 0.1)",
                      borderRadius: "10px",
                      width: "38px",
                      height: "38px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      color: isSelected ? "#ffffff" : "rgba(255, 255, 255, 0.8)",
                      boxShadow: isSelected ? "0 0 12px rgba(255, 255, 255, 0.3)" : "none",
                      transition: "transform 0.1s ease, border 0.15s ease",
                    }}
                  >
                    {isSelected && (
                      <span
                        style={{
                          position: "absolute",
                          top: "-6px",
                          right: "-6px",
                          width: "16px",
                          height: "16px",
                          borderRadius: "50%",
                          background: "#ffffff",
                          color: "#000000",
                          fontSize: "10px",
                          fontWeight: 800,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                        }}
                      >
                        {clickOrder + 1}
                      </span>
                    )}
                    {SYMBOL_SVGS[item.symbol] ?? item.symbol}
                  </button>
                );
              })}
            </div>

            {/* Captcha Footer: Count & Reset */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: "11px",
                color: "rgba(255, 255, 255, 0.45)",
                padding: "0 4px",
              }}
            >
              <span>
                Выбрано {selectedClicks.length} из {challenge?.targets.length ?? 4}
              </span>
              <button
                type="button"
                onClick={handleResetClicks}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "rgba(255, 255, 255, 0.6)",
                  cursor: "pointer",
                  fontSize: "11px",
                  padding: 0,
                  textDecoration: "underline",
                }}
              >
                Сбросить выбор
              </button>
            </div>
          </div>

          {/* Primary Submit Button */}
          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              width: "100%",
              padding: "13px",
              background: canSubmit ? "#ffffff" : "rgba(255, 255, 255, 0.15)",
              color: canSubmit ? "#000000" : "rgba(255, 255, 255, 0.3)",
              border: "none",
              borderRadius: "12px",
              fontSize: "14px",
              fontWeight: 700,
              cursor: canSubmit ? "pointer" : "not-allowed",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
              transition: "all 0.15s ease",
            }}
          >
            {loading ? "Загрузка…" : mode === "login" ? "➔  Войти" : "➔  Создать аккаунт"}
          </button>

          {/* Secondary Buttons Row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px" }}>
            <button
              type="button"
              onClick={onContinueGuest}
              style={{
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "11px",
                padding: "11px",
                color: "rgba(255, 255, 255, 0.8)",
                fontSize: "12.5px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "background 0.15s ease",
              }}
            >
              Продолжить гостем
            </button>
            <button
              type="button"
              onClick={() => {
                setMode(mode === "login" ? "register" : "login");
                setErrorMsg(null);
              }}
              style={{
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid rgba(255, 255, 255, 0.08)",
                borderRadius: "11px",
                padding: "11px",
                color: "rgba(255, 255, 255, 0.8)",
                fontSize: "12.5px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "background 0.15s ease",
              }}
            >
              {mode === "login" ? "Нет профиля? Создать" : "Есть профиль? Войти"}
            </button>
          </div>

          <div
            style={{
              textAlign: "center",
              fontSize: "11px",
              color: "rgba(255, 255, 255, 0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "4px",
            }}
          >
            <span>✓</span> Защищённый вход Vessel Server
          </div>
        </form>
      </div>
    </div>
  );
};
