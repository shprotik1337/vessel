import React, { useState, useRef } from "react";
import { useAuthForm } from "../../hooks/useAuthForm";
import { TopographyCanvas, TopographyCanvasHandle } from "./TopographyCanvas";
import "./auth.css";

export interface AuthFormProps {
  onSuccess: (hasLocalData: boolean, isRegister: boolean) => void;
  onContinueGuest?: () => void;
  requireCaptchaForLogin?: boolean;
}

interface ToastMessage {
  id: number;
  text: string;
  isWarn: boolean;
  isVisible: boolean;
}

export const AuthForm: React.FC<AuthFormProps> = ({
  onSuccess,
}) => {
  const topoRef = useRef<TopographyCanvasHandle>(null);

  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const nextToastId = useRef(1);

  // Field error shake states
  const [invalidFields, setInvalidFields] = useState<Record<string, boolean>>({});

  const showToast = (text: string, isWarn = false) => {
    const id = nextToastId.current++;
    setToasts((prev) => [...prev, { id, text, isWarn, isVisible: false }]);

    requestAnimationFrame(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, isVisible: true } : t))
      );
    });

    setTimeout(() => {
      setToasts((prev) =>
        prev.map((t) => (t.id === id ? { ...t, isVisible: false } : t))
      );
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 300);
    }, 3200);
  };

  const {
    mode,
    setMode,
    username,
    setUsername,
    nickname,
    setNickname,
    password,
    setPassword,
    showPassword,
    toggleShowPassword,
    loading,
    handleSubmit,
  } = useAuthForm({
    onSuccess: (hasLocalData, isRegister) => {
      topoRef.current?.triggerPulse(1, 0.9);
      onSuccess(hasLocalData, isRegister);
    },
  });

  const handleTabSwitch = (newMode: "login" | "register") => {
    if (mode === newMode) return;
    setMode(newMode);
    setInvalidFields({});
    topoRef.current?.triggerPulse(newMode === "register" ? 1 : -1, 1.15);
  };

  const clearInvalid = (fieldKey: string) => {
    if (invalidFields[fieldKey]) {
      setInvalidFields((prev) => ({ ...prev, [fieldKey]: false }));
    }
  };

  const onSubmitLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = username.trim();
    const newInvalid: Record<string, boolean> = {};

    if (!cleanUser) newInvalid.loginUser = true;
    if (!password) newInvalid.loginPass = true;

    if (Object.keys(newInvalid).length > 0) {
      setInvalidFields(newInvalid);
      showToast("Заполните все поля", true);
      return;
    }

    if (password.length < 8) {
      setInvalidFields({ loginPass: true });
      showToast("Пароль должен содержать не менее 8 символов", true);
      return;
    }

    const ok = await handleSubmit();
    if (!ok) {
      showToast("Неверное имя пользователя или пароль", true);
    }
  };

  const onSubmitRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanUser = username.trim();
    const cleanNick = nickname.trim();
    const newInvalid: Record<string, boolean> = {};

    if (!cleanNick) newInvalid.regNick = true;
    if (!cleanUser) newInvalid.regUser = true;
    if (!password) newInvalid.regPass = true;

    if (Object.keys(newInvalid).length > 0) {
      setInvalidFields(newInvalid);
      showToast("Заполните все поля", true);
      return;
    }

    if (password.length < 8) {
      setInvalidFields({ regPass: true });
      showToast("Пароль должен содержать не менее 8 символов", true);
      return;
    }

    const ok = await handleSubmit();
    if (!ok) {
      showToast("Ошибка регистрации. Попробуйте другой юзернейм", true);
    }
  };

  return (
    <div className="auth-layout-root">
      {/* Toast Notification Stack in bottom-left */}
      <div id="toast-stack" className="toast-stack" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast-item${t.isWarn ? " is-warn" : ""}${
              t.isVisible ? " is-visible" : ""
            }`}
          >
            <span className="toast-dot" />
            <span>{t.text}</span>
          </div>
        ))}
      </div>

      {/* LEFT PANEL: AUTH FORM (44%) */}
      <section className="auth-left">
        <div className="auth-card">
          {/* Segmented Pill Tab Switcher */}
          <div
            id="tab-switcher"
            className="tab-switcher"
            role="tablist"
            aria-label="Переключение между входом и регистрацией"
            data-active={mode}
          >
            <div className="tab-pill" aria-hidden="true" />
            <button
              id="tab-login"
              className={`tab-btn${mode === "login" ? " is-active" : ""}`}
              type="button"
              role="tab"
              aria-selected={mode === "login"}
              aria-controls="panel-login"
              onClick={() => handleTabSwitch("login")}
            >
              Вход
            </button>
            <button
              id="tab-register"
              className={`tab-btn${mode === "register" ? " is-active" : ""}`}
              type="button"
              role="tab"
              aria-selected={mode === "register"}
              aria-controls="panel-register"
              onClick={() => handleTabSwitch("register")}
            >
              Регистрация
            </button>
          </div>

          {/* Form Viewport with smooth transitions */}
          <div id="form-viewport" className="form-viewport">
            {/* TAB 1: LOGIN */}
            {mode === "login" && (
              <div
                id="panel-login"
                className="form-panel is-entering"
                role="tabpanel"
                aria-labelledby="tab-login"
              >
                <h1 className="form-title">С возвращением!</h1>
                <p className="form-subtitle">
                  Введите свои данные для входа в аккаунт
                </p>

                <form
                  id="login-form"
                  className="auth-form"
                  noValidate
                  onSubmit={onSubmitLogin}
                >
                  {/* Username */}
                  <div
                    className={`auth-field${
                      invalidFields.loginUser ? " is-invalid" : ""
                    }`}
                  >
                    <svg
                      className="auth-field-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <path d="M20 21a8 8 0 0 0-16 0" />
                      <circle cx="12" cy="8" r="4" />
                    </svg>
                    <input
                      id="login-username"
                      className="auth-field-input"
                      type="text"
                      name="username"
                      autoComplete="username"
                      placeholder="Юзернейм"
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value);
                        clearInvalid("loginUser");
                      }}
                      required
                    />
                  </div>

                  {/* Password */}
                  <div
                    className={`auth-field${
                      invalidFields.loginPass ? " is-invalid" : ""
                    }`}
                  >
                    <svg
                      className="auth-field-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <rect x="4" y="11" width="16" height="10" rx="2.5" />
                      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                    </svg>
                    <input
                      id="login-password"
                      className="auth-field-input has-toggle"
                      type={showPassword ? "text" : "password"}
                      name="password"
                      autoComplete="current-password"
                      placeholder="Пароль"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        clearInvalid("loginPass");
                      }}
                      required
                    />
                    <button
                      type="button"
                      className="toggle-pass-btn"
                      onClick={toggleShowPassword}
                      aria-label="Показать или скрыть пароль"
                    >
                      {!showPassword ? (
                        <svg
                          className="eye-open"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7-10-7-10-7Z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      ) : (
                        <svg
                          className="eye-closed"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c6.2 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19" />
                          <path d="M6.61 6.61A18.5 18.5 0 0 0 2 12s3.8 8 10 8a10.7 10.7 0 0 0 5.39-1.61" />
                          <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                          <line x1="2" y1="2" x2="22" y2="22" />
                        </svg>
                      )}
                    </button>
                  </div>

                  <button
                    type="submit"
                    className="auth-submit-btn"
                    disabled={loading}
                  >
                    {loading ? "Вход..." : "Войти"}
                  </button>


                </form>
              </div>
            )}

            {/* TAB 2: REGISTER */}
            {mode === "register" && (
              <div
                id="panel-register"
                className="form-panel is-entering"
                role="tabpanel"
                aria-labelledby="tab-register"
              >
                <h1 className="form-title">Регистрация</h1>
                <p className="form-subtitle">
                  Введите свои данные для создания аккаунта
                </p>

                <form
                  id="register-form"
                  className="auth-form"
                  noValidate
                  onSubmit={onSubmitRegister}
                >
                  {/* Nickname & Username Row */}
                  <div className="input-row-2">
                    <div
                      className={`auth-field${
                        invalidFields.regNick ? " is-invalid" : ""
                      }`}
                    >
                      <svg
                        className="auth-field-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <path d="M20 21a8 8 0 0 0-16 0" />
                        <circle cx="12" cy="8" r="4" />
                      </svg>
                      <input
                        id="reg-nickname"
                        className="auth-field-input"
                        type="text"
                        name="nickname"
                        autoComplete="nickname"
                        placeholder="Ваш никнейм"
                        value={nickname}
                        onChange={(e) => {
                          setNickname(e.target.value);
                          clearInvalid("regNick");
                        }}
                        required
                      />
                    </div>

                    <div
                      className={`auth-field${
                        invalidFields.regUser ? " is-invalid" : ""
                      }`}
                    >
                      <svg
                        className="auth-field-icon"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        aria-hidden="true"
                      >
                        <circle cx="12" cy="12" r="4" />
                        <path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94" />
                      </svg>
                      <input
                        id="reg-username"
                        className="auth-field-input"
                        type="text"
                        name="reg_username"
                        autoComplete="username"
                        placeholder="Ваш юзернейм"
                        value={username}
                        onChange={(e) => {
                          setUsername(e.target.value);
                          clearInvalid("regUser");
                        }}
                        required
                      />
                    </div>
                  </div>

                  {/* Password */}
                  <div
                    className={`auth-field${
                      invalidFields.regPass ? " is-invalid" : ""
                    }`}
                  >
                    <svg
                      className="auth-field-icon"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.8"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <rect x="4" y="11" width="16" height="10" rx="2.5" />
                      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                    </svg>
                    <input
                      id="reg-password"
                      className="auth-field-input has-toggle"
                      type={showPassword ? "text" : "password"}
                      name="reg_password"
                      autoComplete="new-password"
                      placeholder="Пароль"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        clearInvalid("regPass");
                      }}
                      required
                    />
                    <button
                      type="button"
                      className="toggle-pass-btn"
                      onClick={toggleShowPassword}
                      aria-label="Показать или скрыть пароль"
                    >
                      {!showPassword ? (
                        <svg
                          className="eye-open"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M2 12s3.8-7 10-7 10 7 10 7-3.8 7-10 7-10-7-10-7Z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                      ) : (
                        <svg
                          className="eye-closed"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.8"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          aria-hidden="true"
                        >
                          <path d="M9.9 4.24A10.94 10.94 0 0 1 12 4c6.2 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19" />
                          <path d="M6.61 6.61A18.5 18.5 0 0 0 2 12s3.8 8 10 8a10.7 10.7 0 0 0 5.39-1.61" />
                          <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                          <line x1="2" y1="2" x2="22" y2="22" />
                        </svg>
                      )}
                    </button>
                  </div>

                  <button
                    type="submit"
                    className="auth-submit-btn"
                    disabled={loading}
                  >
                    {loading ? "Создание..." : "Создать"}
                  </button>


                </form>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* RIGHT PANEL: GENERATIVE 3D TOPOGRAPHY (56%) */}
      <TopographyCanvas ref={topoRef} />
    </div>
  );
};
