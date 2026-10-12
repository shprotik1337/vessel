import React, { useEffect, useState, useCallback, useMemo } from "react";
import * as api from "../api/commands";
import type { CaptchaChallenge } from "../api/types";

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (hasLocalData: boolean) => void;
  onContinueGuest: () => void;
}

function IconRefresh({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
    </svg>
  );
}

function IconEye({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

function IconEyeOff({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

const SYMBOL_SVGS: Record<string, React.ReactNode> = {
  cloud: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
      <path d="M19.35 10.04C18.67 6.59 15.64 4 12 4 9.11 4 6.6 5.64 5.35 8.04 2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96z" />
    </svg>
  ),
  diamond: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
      <path d="M12 2L2 12l10 10 10-10L12 2z" />
    </svg>
  ),
  note: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
      <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
    </svg>
  ),
  crown: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
      <path d="M5 16L3 5l5.5 5L12 4l3.5 6L21 5l-2 11H5zm14 3c0 .55-.45 1-1 1H6c-.55 0-1-.45-1-1v-1h14v1z" />
    </svg>
  ),
  star: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
      <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
    </svg>
  ),
  bolt: (
    <svg viewBox="0 0 24 24" width="22" height="22" fill="currentColor">
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

function formatAuthError(err: any, mode: "login" | "register"): string {
  const raw = String(typeof err === "string" ? err : err?.message || "").toLowerCase();

  if (raw.includes("captcha") || raw.includes("challenge") || raw.includes("капч")) {
    return "Неверно введены символы проверки. Попробуйте ещё раз.";
  }

  if (
    raw.includes("invalid credential") ||
    raw.includes("unauthorized") ||
    raw.includes("401") ||
    raw.includes("password") ||
    raw.includes("user not found") ||
    raw.includes("not found") ||
    raw.includes("wrong password") ||
    raw.includes("неверный") ||
    raw.includes("bad credentials")
  ) {
    return mode === "login"
      ? "Неверное имя пользователя или пароль"
      : "Проверьте правильность введенных данных";
  }

  if (
    raw.includes("already exist") ||
    raw.includes("taken") ||
    raw.includes("conflict") ||
    raw.includes("409") ||
    raw.includes("уже существует")
  ) {
    return "Пользователь с таким никнеймом уже зарегистрирован";
  }

  if (
    raw.includes("timeout") ||
    raw.includes("network") ||
    raw.includes("connect") ||
    raw.includes("fetch") ||
    raw.includes("502") ||
    raw.includes("503") ||
    raw.includes("504")
  ) {
    return "Не удалось связаться с сервером. Проверьте интернет-соединение.";
  }

  if (raw.includes("username") || raw.includes("ник")) {
    return "Недопустимое имя пользователя";
  }

  if (typeof err === "string") {
    const cleaned = err.replace(/^Vessel Server \[[^\]]+\] [^:]+: */i, "").trim();
    if (cleaned && cleaned.length < 80 && !cleaned.startsWith("{")) {
      return cleaned;
    }
  }

  return mode === "login"
    ? "Неверные данные для входа. Попробуйте снова."
    : "Не удалось создать аккаунт. Попробуйте снова.";
}

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;

    setLoading(true);
    setErrorMsg(null);

    try {
      if (mode === "register") {
        if (!challenge) {
          setErrorMsg("Капча не загружена. Нажмите кнопку обновления капчи.");
          setLoading(false);
          return;
        }
        if (selectedClicks.length !== challenge.targets.length) {
          setErrorMsg(`Пожалуйста, выберите все ${challenge.targets.length} символа по порядку`);
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
      setErrorMsg(formatAuthError(err, mode));
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
        background: "rgba(0, 0, 0, 0.75)",
        backdropFilter: "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        padding: "24px 16px",
        overflowY: "auto",
        boxSizing: "border-box",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "460px",
          margin: "auto 0",
          flexShrink: 0,
          background: "var(--card-bg, #000000)",
          backdropFilter: "blur(24px) saturate(160%)",
          WebkitBackdropFilter: "blur(24px) saturate(160%)",
          border: "1px solid var(--border)",
          borderRadius: "20px",
          padding: "24px 28px",
          boxShadow: "0 24px 64px rgba(0, 0, 0, 0.85)",
          color: "var(--text)",
          fontFamily: "inherit",
          display: "flex",
          flexDirection: "column",
          gap: "14px",
          position: "relative",
          boxSizing: "border-box",
        }}
      >
        {/* Top Header: Vessel text + Tabs */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div
            style={{
              fontSize: "20px",
              fontWeight: 800,
              letterSpacing: "-0.02em",
              color: "var(--text)",
            }}
          >
            Vessel
          </div>

          <div
            style={{
              display: "flex",
              background: "var(--elev)",
              borderRadius: "10px",
              padding: "3px",
              border: "1px solid var(--border)",
            }}
          >
            <button
              type="button"
              onClick={() => {
                setMode("login");
                setErrorMsg(null);
              }}
              style={{
                background: mode === "login" ? "var(--accent)" : "transparent",
                color: mode === "login" ? "var(--accent-contrast-text, #ffffff)" : "var(--text3)",
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
                background: mode === "register" ? "var(--accent)" : "transparent",
                color: mode === "register" ? "var(--accent-contrast-text, #ffffff)" : "var(--text3)",
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
          <h2 style={{ margin: "0 0 6px 0", fontSize: "24px", fontWeight: 700, letterSpacing: "-0.02em", color: "var(--text)" }}>
            {mode === "login" ? "Вход" : "Регистрация"}
          </h2>
          <p style={{ margin: 0, fontSize: "13px", color: "var(--text3)", lineHeight: 1.4 }}>
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
                color: "var(--text3)",
                letterSpacing: "0.06em",
              }}
            >
              <span>НИК</span>
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Имя пользователя"
              autoFocus
              style={{
                background: "var(--elev)",
                border: "1px solid var(--border)",
                borderRadius: "10px",
                padding: "11px 14px",
                color: "var(--text)",
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
                color: "var(--text3)",
                letterSpacing: "0.06em",
              }}
            >
              <span>ПАРОЛЬ</span>
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
                  background: "var(--elev)",
                  border: "1px solid var(--border)",
                  borderRadius: "10px",
                  padding: "11px 40px 11px 14px",
                  color: "var(--text)",
                  fontSize: "13.5px",
                  outline: "none",
                  transition: "border 0.15s ease",
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
                  color: "var(--text3)",
                  cursor: "pointer",
                  padding: "4px",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                {showPassword ? <IconEyeOff size={16} /> : <IconEye size={16} />}
              </button>
            </div>
          </div>

          {/* Interactive CAPTCHA */}
          <div
            style={{
              background: "var(--elev)",
              border: "1px solid var(--border)",
              borderRadius: "14px",
              padding: "14px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            {/* Captcha Header */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div>
                <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text)" }}>Проверка</div>
                <div style={{ fontSize: "10.5px", color: "var(--text3)" }}>Нажмите символы по порядку</div>
              </div>
              <button
                type="button"
                onClick={fetchCaptcha}
                title="Обновить капчу"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text3)",
                  cursor: "pointer",
                  padding: "4px",
                  display: "flex",
                  alignItems: "center",
                }}
              >
                <IconRefresh size={14} />
              </button>
            </div>

            {/* Target Sequence Bar */}
            {challenge && (
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: "10px",
                  background: "var(--card-bg, #000000)",
                  border: "1px dashed var(--border)",
                  borderRadius: "10px",
                  padding: "10px 14px",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text3)", marginRight: "4px" }}>
                  Цель:
                </span>
                {challenge.targets.map((tgt, i) => {
                  const isDone = selectedClicks.length > i;
                  return (
                    <div
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                      }}
                    >
                      <div
                        style={{
                          width: "32px",
                          height: "32px",
                          borderRadius: "8px",
                          background: "var(--elev)",
                          border: isDone ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                          color: isDone ? "var(--accent)" : "var(--text)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          transition: "all 0.2s ease",
                        }}
                        title={tgt}
                      >
                        {SYMBOL_SVGS[tgt] ?? tgt}
                      </div>
                      {i < challenge.targets.length - 1 && (
                        <span style={{ fontSize: "11px", color: "var(--text3)" }}>→</span>
                      )}
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
                height: "125px",
                background: "var(--card-bg, #000000)",
                borderRadius: "10px",
                border: "1px solid var(--border)",
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
                  opacity: 0.15,
                }}
              >
                <line x1="10%" y1="20%" x2="90%" y2="80%" stroke="var(--border)" strokeWidth="1" strokeDasharray="4 4" />
                <line x1="20%" y1="90%" x2="80%" y2="10%" stroke="var(--border)" strokeWidth="1" strokeDasharray="3 3" />
                <line x1="5%" y1="50%" x2="95%" y2="45%" stroke="var(--border)" strokeWidth="1" />
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
                      transform: isSelected ? "translate(-50%, -50%) scale(1.08)" : "translate(-50%, -50%)",
                      background: isSelected ? "var(--accent)" : "var(--elev)",
                      border: isSelected ? "1.5px solid var(--accent-contrast-text, #ffffff)" : "1px solid var(--border)",
                      borderRadius: "10px",
                      width: "36px",
                      height: "36px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      color: isSelected ? "var(--accent-contrast-text, #ffffff)" : "var(--text)",
                      boxShadow: isSelected ? "0 4px 12px var(--accent-glow, rgba(0,0,0,0.4))" : "none",
                      transition: "transform 0.12s ease, background 0.15s ease",
                      zIndex: isSelected ? 10 : 2,
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
                          background: "var(--accent-contrast-text, #ffffff)",
                          color: "var(--accent, #000000)",
                          fontSize: "10px",
                          fontWeight: 800,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: "0 2px 4px rgba(0,0,0,0.4)",
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
                padding: "0 4px",
              }}
            >
              <span style={{ color: isCaptchaSolved ? "var(--accent)" : "var(--text3)" }}>
                Выбрано {selectedClicks.length} из {challenge?.targets.length ?? 4}
              </span>
              {selectedClicks.length > 0 && (
                <button
                  type="button"
                  onClick={handleResetClicks}
                  style={{
                    background: "transparent",
                    border: "none",
                    color: "var(--text3)",
                    cursor: "pointer",
                    fontSize: "11px",
                    padding: 0,
                    textDecoration: "underline",
                  }}
                >
                  Сбросить выбор
                </button>
              )}
            </div>
          </div>

          {/* Primary Submit Button */}
          <button
            type="submit"
            disabled={!canSubmit}
            style={{
              marginTop: "4px",
              width: "100%",
              padding: "13px",
              background: canSubmit ? "var(--accent)" : "var(--elev)",
              color: canSubmit ? "var(--accent-contrast-text, #ffffff)" : "var(--text3)",
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
            {loading ? (
              <span>Обработка...</span>
            ) : mode === "login" ? (
              <>
                <span>Войти в аккаунт</span>
                <span>→</span>
              </>
            ) : (
              <>
                <span>Создать аккаунт</span>
                <span>→</span>
              </>
            )}
          </button>

          {/* Secondary Buttons Row */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "2px" }}>
            <button
              type="button"
              onClick={onContinueGuest}
              style={{
                background: "var(--elev)",
                border: "1px solid var(--border)",
                borderRadius: "11px",
                padding: "11px",
                color: "var(--text)",
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
                background: "var(--elev)",
                border: "1px solid var(--border)",
                borderRadius: "11px",
                padding: "11px",
                color: "var(--text)",
                fontSize: "12.5px",
                fontWeight: 600,
                cursor: "pointer",
                transition: "background 0.15s ease",
              }}
            >
              {mode === "login" ? "Нет профиля? Создать" : "Есть профиль? Войти"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
