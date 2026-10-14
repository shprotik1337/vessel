import React from "react";
import { useAuthForm } from "../../hooks/useAuthForm";
import { CaptchaChallenge } from "./CaptchaChallenge";
import { IconEye, IconEyeOff } from "./authUtils";

export interface AuthFormProps {
  onSuccess: (hasLocalData: boolean, isRegister: boolean) => void;
  onContinueGuest: () => void;
  requireCaptchaForLogin?: boolean;
}

export const AuthForm: React.FC<AuthFormProps> = ({
  onSuccess,
  onContinueGuest,
  requireCaptchaForLogin = false,
}) => {
  const {
    mode,
    setMode,
    toggleMode,
    username,
    setUsername,
    password,
    setPassword,
    showPassword,
    toggleShowPassword,
    challenge,
    selectedClicks,
    loading,
    errorMsg,
    fetchCaptcha,
    handleSymbolClick,
    handleResetClicks,
    isCaptchaSolved,
    canSubmit,
    handleSubmit,
  } = useAuthForm({ onSuccess, requireCaptchaForLogin });

  return (
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
            onClick={() => setMode("login")}
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
            onClick={() => setMode("register")}
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
              onClick={toggleShowPassword}
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
        <CaptchaChallenge
          challenge={challenge}
          selectedClicks={selectedClicks}
          onSymbolClick={handleSymbolClick}
          onResetClicks={handleResetClicks}
          onRefreshCaptcha={fetchCaptcha}
          isSolved={isCaptchaSolved}
        />

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
            onClick={toggleMode}
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
  );
};
