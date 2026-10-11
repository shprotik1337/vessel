import React, { useEffect, useState, useCallback, useMemo } from "react";
import * as api from "../api/commands";
import type { CaptchaChallenge } from "../api/types";
interface AuthPageProps {
  onSuccess: (hasLocalData: boolean, isRegister: boolean) => void;
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

export const AuthPage: React.FC<AuthPageProps> = ({
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
    void fetchCaptcha();
  }, [fetchCaptcha]);

  const handleSymbolClick = (itemId: number) => {
    if (selectedClicks.includes(itemId)) {
      const idx = selectedClicks.indexOf(itemId);
      setSelectedClicks((prev) => prev.slice(0, idx));
      return;
    }
    if (!challenge) return;
    if (selectedClicks.length >= challenge.targets.length) return;
    setSelectedClicks((prev) => [...prev, itemId]);
  };

  const resetSelection = () => {
    setSelectedClicks([]);
  };

  const isCaptchaComplete = useMemo(() => {
    if (!challenge) return false;
    return selectedClicks.length === challenge.targets.length;
  }, [challenge, selectedClicks]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const cleanUsername = username.trim();
    if (!cleanUsername) {
      setErrorMsg("Введите имя пользователя");
      return;
    }

    if (!password || password.length < 8) {
      setErrorMsg("Пароль должен содержать не менее 8 символов");
      return;
    }

    if (!challenge) {
      setErrorMsg("Капча не загружена. Нажмите кнопку обновления капчи.");
      return;
    }

    if (!isCaptchaComplete) {
      setErrorMsg(`Пожалуйста, выберите все ${challenge.targets.length} символа по порядку`);
      return;
    }

    setLoading(true);
    try {
      if (mode === "register") {
        const res = await api.authRegister({
          username: cleanUsername,
          password,
          captcha_id: challenge.id,
          captcha_clicks: selectedClicks,
        });
        onSuccess(res.has_local_data, true);
      } else {
        await api.authLogin({
          username: cleanUsername,
          password,
          captcha_id: challenge.id,
          captcha_clicks: selectedClicks,
        });
        onSuccess(false, false);
      }
    } catch (err: any) {
      const msg = typeof err === "string" ? err : err?.message || "Ошибка авторизации";
      setErrorMsg(msg);
      void fetchCaptcha();
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        width: "100%",
        minHeight: "calc(100vh - 36px)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--app-bg, #000000)",
        padding: "24px 16px",
        boxSizing: "border-box",
        overflowY: "auto",
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "460px",
          background: "var(--card-bg, #000000)",
          border: "1px solid var(--border, rgba(255, 255, 255, 0.08))",
          borderRadius: "20px",
          padding: "28px 32px",
          boxShadow: "0 24px 64px rgba(0, 0, 0, 0.95)",
          color: "var(--text, #ffffff)",
          fontFamily: "inherit",
          display: "flex",
          flexDirection: "column",
          gap: "18px",
          boxSizing: "border-box",
        }}
      >
        {/* Top Header: Vessel text on left, Tabs on right */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div
            style={{
              fontSize: "20px",
              fontWeight: 800,
              letterSpacing: "-0.02em",
              color: "var(--text, #ffffff)",
            }}
          >
            Vessel
          </div>

          <div
            style={{
              display: "flex",
              background: "var(--elev, rgba(255, 255, 255, 0.04))",
              borderRadius: "10px",
              padding: "3px",
              border: "1px solid var(--border, rgba(255, 255, 255, 0.06))",
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
                color: mode === "login" ? "#ffffff" : "var(--text3, rgba(255, 255, 255, 0.5))",
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
                color: mode === "register" ? "#ffffff" : "var(--text3, rgba(255, 255, 255, 0.5))",
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
          <h2
            style={{
              margin: "0 0 6px 0",
              fontSize: "24px",
              fontWeight: 700,
              letterSpacing: "-0.02em",
              color: "var(--text, #ffffff)",
            }}
          >
            {mode === "login" ? "Вход" : "Регистрация"}
          </h2>
          <p style={{ margin: 0, fontSize: "13px", color: "var(--text3, rgba(255, 255, 255, 0.5))", lineHeight: 1.4 }}>
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
                color: "var(--text3, rgba(255, 255, 255, 0.4))",
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
                background: "var(--elev, rgba(255, 255, 255, 0.04))",
                border: "1px solid var(--border, rgba(255, 255, 255, 0.08))",
                borderRadius: "10px",
                padding: "11px 14px",
                color: "var(--text, #ffffff)",
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
                color: "var(--text3, rgba(255, 255, 255, 0.4))",
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
                  background: "var(--elev, rgba(255, 255, 255, 0.04))",
                  border: "1px solid var(--border, rgba(255, 255, 255, 0.08))",
                  borderRadius: "10px",
                  padding: "11px 40px 11px 14px",
                  color: "var(--text, #ffffff)",
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
                  color: "var(--text3, rgba(255, 255, 255, 0.4))",
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
              background: "#050505",
              border: "1px solid var(--border, rgba(255, 255, 255, 0.08))",
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
                <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text, #ffffff)" }}>Проверка</div>
                <div style={{ fontSize: "10.5px", color: "var(--text3, rgba(255, 255, 255, 0.4))" }}>Нажмите символы по порядку</div>
              </div>
              <button
                type="button"
                onClick={fetchCaptcha}
                title="Обновить капчу"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text3, rgba(255, 255, 255, 0.5))",
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
                  background: "rgba(255, 255, 255, 0.03)",
                  border: "1px dashed rgba(255, 255, 255, 0.12)",
                  borderRadius: "10px",
                  padding: "10px 14px",
                  position: "relative",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    inset: 0,
                    pointerEvents: "none",
                    opacity: 0.15,
                    backgroundImage: "linear-gradient(45deg, rgba(255,255,255,0.2) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.2) 75%, transparent 75%, transparent)",
                    backgroundSize: "16px 16px",
                  }}
                />

                <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text3, rgba(255, 255, 255, 0.4))", marginRight: "4px" }}>
                  Цель:
                </span>

                {challenge.targets.map((tgt, i) => (
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
                        background: selectedClicks.length > i ? "rgba(34, 197, 94, 0.15)" : "rgba(255, 255, 255, 0.07)",
                        border: selectedClicks.length > i ? "1px solid rgba(34, 197, 94, 0.5)" : "1px solid rgba(255, 255, 255, 0.12)",
                        color: selectedClicks.length > i ? "#22c55e" : "#ffffff",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        transition: "all 0.2s ease",
                      }}
                      title={tgt}
                    >
                      {SYMBOL_SVGS[tgt] || tgt}
                    </div>
                    {i < challenge.targets.length - 1 && (
                      <span style={{ fontSize: "11px", color: "rgba(255, 255, 255, 0.2)" }}>→</span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Clickable Symbols Canvas */}
            <div
              style={{
                height: "140px",
                background: "rgba(0, 0, 0, 0.6)",
                border: "1px solid rgba(255, 255, 255, 0.06)",
                borderRadius: "10px",
                position: "relative",
                overflow: "hidden",
                userSelect: "none",
              }}
            >
              <svg
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", opacity: 0.15 }}
              >
                <line x1="10%" y1="20%" x2="90%" y2="80%" stroke="#ffffff" strokeDasharray="4 4" strokeWidth="1" />
                <line x1="5%" y1="50%" x2="95%" y2="50%" stroke="#ffffff" strokeWidth="1" />
                <line x1="15%" y1="85%" x2="85%" y2="15%" stroke="#ffffff" strokeDasharray="3 3" strokeWidth="1" />
              </svg>

              {challenge?.items.map((item) => {
                const clickedIdx = selectedClicks.indexOf(item.id);
                const isClicked = clickedIdx !== -1;

                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => handleSymbolClick(item.id)}
                    style={{
                      position: "absolute",
                      left: `calc(${item.x}% - 18px)`,
                      top: `calc(${item.y}% - 18px)`,
                      width: "36px",
                      height: "36px",
                      borderRadius: "10px",
                      background: isClicked ? "var(--accent, #6366f1)" : "rgba(255, 255, 255, 0.08)",
                      border: isClicked ? "1.5px solid #ffffff" : "1px solid rgba(255, 255, 255, 0.15)",
                      color: isClicked ? "var(--accent-contrast-text, #ffffff)" : "#ffffff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      cursor: "pointer",
                      transition: "transform 0.12s ease, background 0.15s ease",
                      transform: isClicked ? "scale(1.08)" : "scale(1)",
                      boxShadow: isClicked ? "0 4px 12px rgba(99, 102, 241, 0.4)" : "none",
                      zIndex: isClicked ? 10 : 2,
                    }}
                  >
                    {SYMBOL_SVGS[item.symbol] || item.symbol}

                    {isClicked && (
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
                          boxShadow: "0 2px 4px rgba(0,0,0,0.4)",
                        }}
                      >
                        {clickedIdx + 1}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Captcha Footer Status */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", fontSize: "11px" }}>
              <span style={{ color: isCaptchaComplete ? "#22c55e" : "var(--text3, rgba(255, 255, 255, 0.4))" }}>
                Выбрано {selectedClicks.length} из {challenge?.targets.length || 4}
              </span>
              {selectedClicks.length > 0 && (
                <button
                  type="button"
                  onClick={resetSelection}
                  style={{
                    background: "none",
                    border: "none",
                    color: "var(--text3, rgba(255, 255, 255, 0.5))",
                    cursor: "pointer",
                    textDecoration: "underline",
                    fontSize: "11px",
                    padding: 0,
                  }}
                >
                  Сбросить выбор
                </button>
              )}
            </div>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading || !isCaptchaComplete}
            style={{
              marginTop: "4px",
              padding: "13px",
              borderRadius: "12px",
              border: "none",
              background: isCaptchaComplete ? "var(--accent, #6366f1)" : "rgba(255, 255, 255, 0.08)",
              color: isCaptchaComplete ? "var(--accent-contrast-text, #ffffff)" : "rgba(255, 255, 255, 0.3)",
              fontSize: "14px",
              fontWeight: 700,
              cursor: isCaptchaComplete && !loading ? "pointer" : "not-allowed",
              transition: "all 0.15s ease",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "8px",
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

          {/* Alternative buttons: Guest & Toggle mode */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px", marginTop: "2px" }}>
            <button
              type="button"
              onClick={onContinueGuest}
              style={{
                background: "rgba(255, 255, 255, 0.05)",
                border: "1px solid var(--border, rgba(255, 255, 255, 0.08))",
                borderRadius: "11px",
                padding: "11px",
                color: "var(--text, rgba(255, 255, 255, 0.8))",
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
                border: "1px solid var(--border, rgba(255, 255, 255, 0.08))",
                borderRadius: "11px",
                padding: "11px",
                color: "var(--text, rgba(255, 255, 255, 0.8))",
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
