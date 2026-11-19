import { useState, useCallback, useMemo } from "react";
import * as api from "../api/commands";
import { formatAuthError } from "../components/auth/authUtils";

export interface UseAuthFormOptions {
  onSuccess: (hasLocalData: boolean, isRegister: boolean) => void;
  requireCaptchaForLogin?: boolean;
}

export function useAuthForm({ onSuccess }: UseAuthFormOptions) {
  const [mode, setModeState] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const setMode = useCallback((newMode: "login" | "register") => {
    setModeState(newMode);
    setErrorMsg(null);
  }, []);

  const toggleMode = useCallback(() => {
    setModeState((prev) => (prev === "login" ? "register" : "login"));
    setErrorMsg(null);
  }, []);

  const toggleShowPassword = useCallback(() => {
    setShowPassword((prev) => !prev);
  }, []);

  const canSubmit = useMemo(() => {
    const hasUser = username.trim().length > 0;
    const hasPass = password.length >= 8;
    return hasUser && hasPass && !loading;
  }, [username, password, loading]);

  const handleSubmit = async (e?: React.FormEvent): Promise<boolean> => {
    if (e) e.preventDefault();
    setErrorMsg(null);

    const cleanUsername = username.trim().replace(/^@+/, "");
    if (!cleanUsername) {
      setErrorMsg("Введите имя пользователя");
      return false;
    }

    if (!password || password.length < 8) {
      setErrorMsg("Пароль должен содержать не менее 8 символов");
      return false;
    }

    setLoading(true);
    try {
      if (mode === "register") {
        const res = await api.authRegister({
          username: cleanUsername,
          password,
        });
        onSuccess(res.has_local_data, true);
      } else {
        const res = await api.authLogin({
          username: cleanUsername,
          password,
        });
        onSuccess(res.has_local_data, false);
      }
      return true;
    } catch (err: any) {
      console.error("Auth error", err);
      const msg = formatAuthError(err, mode);
      setErrorMsg(msg);
      return false;
    } finally {
      setLoading(false);
    }
  };

  return {
    mode,
    setMode,
    toggleMode,
    username,
    setUsername,
    nickname,
    setNickname,
    password,
    setPassword,
    showPassword,
    setShowPassword,
    toggleShowPassword,
    loading,
    errorMsg,
    setErrorMsg,
    canSubmit,
    handleSubmit,
    // Compatibility stubs for any legacy callers
    challenge: null,
    selectedClicks: [],
    fetchCaptcha: async () => {},
    handleSymbolClick: () => {},
    handleResetClicks: () => {},
    isCaptchaSolved: true,
  };
}
