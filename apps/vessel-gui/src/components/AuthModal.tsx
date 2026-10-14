import React from "react";
import { AuthForm } from "./auth";

export interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (hasLocalData: boolean, isRegister?: boolean) => void;
  onContinueGuest: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onContinueGuest,
}) => {
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
      <AuthForm
        onSuccess={(hasLocalData, isRegister) => {
          onSuccess(hasLocalData, isRegister);
        }}
        onContinueGuest={onContinueGuest}
        requireCaptchaForLogin={false}
      />
    </div>
  );
};
