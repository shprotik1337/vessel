import { useCallback, useState } from "react";
import type { FullState } from "../api/types";
import * as api from "../api/commands";

interface UseAccountStateProps {
  setView: (view: string) => void;
  setIsSettingsOpen: (open: boolean) => void;
  refresh: () => Promise<void>;
  setState: (state: FullState) => void;
  triggerAutoplayLast: (state: FullState) => void;
  showToast: (message: string, error?: boolean, durationMs?: number) => void;
}

export function useAccountState({
  setView,
  setIsSettingsOpen,
  refresh,
  setState,
  triggerAutoplayLast,
  showToast,
}: UseAccountStateProps) {
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isMigrationModalOpen, setIsMigrationModalOpen] = useState(false);

  const openAuthModal = useCallback(() => {
    setIsSettingsOpen(false);
    setView("auth");
  }, [setIsSettingsOpen, setView]);

  const closeAuthModal = useCallback(() => setIsAuthModalOpen(false), []);

  const logoutAccount = useCallback(async () => {
    try {
      await api.authLogout();
      await refresh();
      setView("auth");
      showToast("Вы вышли из аккаунта");
    } catch (e: any) {
      showToast(String(e), true);
    }
  }, [refresh, setView, showToast]);

  const continueGuest = useCallback(async () => {
    try {
      await api.authContinueGuest();
      setView("home");
      const fresh = await api.getState();
      setState(fresh);
      triggerAutoplayLast(fresh);
      showToast("Продолжен гостевой режим");
    } catch (e: any) {
      showToast(String(e), true);
    }
  }, [showToast, triggerAutoplayLast, setView, setState]);

  return {
    isAuthModalOpen,
    setIsAuthModalOpen,
    isMigrationModalOpen,
    setIsMigrationModalOpen,
    openAuthModal,
    closeAuthModal,
    logoutAccount,
    continueGuest,
  };
}
