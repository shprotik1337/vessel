import { useCallback, useState } from "react";

let toastTimer: number | undefined;

export function useToastState() {
  const [toast, setToast] = useState<string | null>(null);
  const [toastError, setToastError] = useState(false);

  const showToast = useCallback((message: string, error = false, durationMs = 3500) => {
    setToast(message);
    setToastError(error);
    if (toastTimer) window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => setToast(null), durationMs);
  }, []);

  return {
    toast,
    toastError,
    showToast,
  };
}
