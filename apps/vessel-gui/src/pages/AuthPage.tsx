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
      className="auth-page-root"
      style={{
        position: "absolute",
        inset: 0,
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "#000000",
        padding: 0,
        margin: 0,
        boxSizing: "border-box",
        overflow: "hidden",
        zIndex: 10,
      }}
    >
      <AuthForm
        onSuccess={onSuccess}
        onContinueGuest={onContinueGuest}
        requireCaptchaForLogin={false}
      />
    </div>
  );
};
