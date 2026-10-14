import React from "react";

/**
 * Normalizes and formats error messages from Vessel authentication server.
 */
export function formatAuthError(err: any, mode: "login" | "register"): string {
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

export function IconRefresh({ size = 16, color = "currentColor" }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
    </svg>
  );
}

export function IconEye({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconEyeOff({ size = 16 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}

export const SYMBOL_SVGS: Record<string, React.ReactNode> = {
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
