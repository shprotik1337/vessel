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
        background: "rgba(0, 0, 0, 0.78)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: "24px 16px",
        boxSizing: "border-box",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "920px",
          height: "min(620px, 90vh)",
          borderRadius: "24px",
          overflow: "hidden",
          boxShadow: "0 30px 90px rgba(0, 0, 0, 0.95)",
          position: "relative",
          background: "#000000",
        }}
      >
        <AuthForm
          onSuccess={(hasLocalData, isRegister) => {
            onSuccess(hasLocalData, isRegister);
            onClose();
          }}
          onContinueGuest={() => {
            onContinueGuest();
            onClose();
          }}
          requireCaptchaForLogin={false}
        />
      </div>
    </div>
  );
};
