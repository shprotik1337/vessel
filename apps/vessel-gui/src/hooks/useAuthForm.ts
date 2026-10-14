import { useState, useCallback, useEffect, useMemo } from "react";
import * as api from "../api/commands";
import type { CaptchaChallenge } from "../api/types";
import { formatAuthError } from "../components/auth/authUtils";

export interface UseAuthFormOptions {
  onSuccess: (hasLocalData: boolean, isRegister: boolean) => void;
  requireCaptchaForLogin?: boolean;
}

export function useAuthForm({ onSuccess, requireCaptchaForLogin = false }: UseAuthFormOptions) {
  const [mode, setModeState] = useState<"login" | "register">("login");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [challenge, setChallenge] = useState<CaptchaChallenge | null>(null);
  const [selectedClicks, setSelectedClicks] = useState<number[]>([]);
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

  const handleSymbolClick = useCallback((itemId: number) => {
    setSelectedClicks((prev) => {
      if (prev.includes(itemId)) {
        const idx = prev.indexOf(itemId);
        return prev.slice(0, idx);
      }
      if (challenge && prev.length < challenge.targets.length) {
        return [...prev, itemId];
      }
      return prev;
    });
  }, [challenge]);

  const handleResetClicks = useCallback(() => {
    setSelectedClicks([]);
  }, []);

  const isCaptchaSolved = useMemo(() => {
    return challenge ? selectedClicks.length === challenge.targets.length : false;
  }, [challenge, selectedClicks]);

  const isCaptchaRequired = mode === "register" || Boolean(requireCaptchaForLogin);

  const canSubmit = useMemo(() => {
    const hasUser = username.trim().length > 0;
    const hasPass = password.length >= 8;
    const captchaOk = !isCaptchaRequired || isCaptchaSolved;
    return hasUser && hasPass && captchaOk && !loading;
  }, [username, password, isCaptchaRequired, isCaptchaSolved, loading]);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
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

    if (isCaptchaRequired) {
      if (!challenge) {
        setErrorMsg("Капча не загружена. Нажмите кнопку обновления капчи.");
        return;
      }
      if (selectedClicks.length !== challenge.targets.length) {
        setErrorMsg(`Пожалуйста, выберите все ${challenge.targets.length} символа по порядку`);
        return;
      }
    }

    setLoading(true);
    try {
      if (mode === "register") {
        const res = await api.authRegister({
          username: cleanUsername,
          password,
          captcha_id: challenge!.id,
          captcha_clicks: selectedClicks,
        });
        onSuccess(res.has_local_data, true);
      } else {
        const res = await api.authLogin({
          username: cleanUsername,
          password,
          captcha_id: challenge?.id,
          captcha_clicks: selectedClicks.length > 0 ? selectedClicks : undefined,
        });
        onSuccess(res.has_local_data, false);
      }
    } catch (err: any) {
      console.error("Auth error", err);
      setErrorMsg(formatAuthError(err, mode));
      void fetchCaptcha();
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
    password,
    setPassword,
    showPassword,
    setShowPassword,
    toggleShowPassword,
    challenge,
    selectedClicks,
    loading,
    errorMsg,
    setErrorMsg,
    fetchCaptcha,
    handleSymbolClick,
    handleResetClicks,
    isCaptchaSolved,
    canSubmit,
    handleSubmit,
  };
}
