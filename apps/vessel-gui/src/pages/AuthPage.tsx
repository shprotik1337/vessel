import React from "react";
import { AuthForm } from "../components/auth";

export interface AuthPageProps {
  onSuccess: (hasLocalData: boolean, isRegister: boolean) => void;
  onContinueGuest: () => void;
}

export const AuthPage: React.FC<AuthPageProps> = ({
  onSuccess,
  onContinueGuest,
}) => {
  return (
    <div
      style={{
        width: "100%",
        minHeight: "calc(100vh - 36px)",
        height: "calc(100vh - 36px)",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        background: "transparent",
        padding: "24px 16px",
        boxSizing: "border-box",
        overflowY: "auto",
        position: "relative",
        zIndex: 10,
      }}
    >
      <AuthForm
        onSuccess={onSuccess}
        onContinueGuest={onContinueGuest}
        requireCaptchaForLogin={true}
      />
    </div>
  );
};
