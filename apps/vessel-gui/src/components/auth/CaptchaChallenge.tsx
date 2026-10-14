import React from "react";
import type { CaptchaChallenge as CaptchaChallengeType } from "../../api/types";
import { IconRefresh, SYMBOL_SVGS } from "./authUtils";

export interface CaptchaChallengeProps {
  challenge: CaptchaChallengeType | null;
  selectedClicks: number[];
  onSymbolClick: (itemId: number) => void;
  onResetClicks: () => void;
  onRefreshCaptcha: () => void;
  isSolved: boolean;
}

export const CaptchaChallenge: React.FC<CaptchaChallengeProps> = ({
  challenge,
  selectedClicks,
  onSymbolClick,
  onResetClicks,
  onRefreshCaptcha,
  isSolved,
}) => {
  return (
    <div
      style={{
        background: "var(--elev)",
        border: "1px solid var(--border)",
        borderRadius: "14px",
        padding: "14px",
        display: "flex",
        flexDirection: "column",
        gap: "10px",
      }}
    >
      {/* Captcha Header */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: "12px", fontWeight: 700, color: "var(--text)" }}>Проверка</div>
          <div style={{ fontSize: "10.5px", color: "var(--text3)" }}>Нажмите символы по порядку</div>
        </div>
        <button
          type="button"
          onClick={onRefreshCaptcha}
          title="Обновить капчу"
          style={{
            background: "transparent",
            border: "none",
            color: "var(--text3)",
            cursor: "pointer",
            padding: "4px",
            display: "flex",
            alignItems: "center",
          }}
        >
          <IconRefresh size={14} />
        </button>
      </div>

      {/* Target Sequence Bar */}
      {challenge && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            background: "var(--card-bg, #000000)",
            border: "1px dashed var(--border)",
            borderRadius: "10px",
            padding: "10px 14px",
            position: "relative",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              pointerEvents: "none",
              opacity: 0.15,
              backgroundImage:
                "linear-gradient(45deg, rgba(255,255,255,0.2) 25%, transparent 25%, transparent 50%, rgba(255,255,255,0.2) 50%, rgba(255,255,255,0.2) 75%, transparent 75%, transparent)",
              backgroundSize: "16px 16px",
            }}
          />

          <span style={{ fontSize: "11px", fontWeight: 600, color: "var(--text3)", marginRight: "4px" }}>
            Цель:
          </span>

          {challenge.targets.map((tgt, i) => {
            const isDone = selectedClicks.length > i;
            return (
              <div
                key={i}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                }}
              >
                <div
                  style={{
                    width: "32px",
                    height: "32px",
                    borderRadius: "8px",
                    background: "var(--elev)",
                    border: isDone ? "1.5px solid var(--accent)" : "1px solid var(--border)",
                    color: isDone ? "var(--accent)" : "var(--text)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    transition: "all 0.2s ease",
                  }}
                  title={tgt}
                >
                  {SYMBOL_SVGS[tgt] ?? tgt}
                </div>
                {i < challenge.targets.length - 1 && (
                  <span style={{ fontSize: "11px", color: "var(--text3)" }}>→</span>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Clickable Symbols Canvas */}
      <div
        style={{
          position: "relative",
          width: "100%",
          height: "125px",
          background: "var(--card-bg, #000000)",
          borderRadius: "10px",
          border: "1px solid var(--border)",
          overflow: "hidden",
          userSelect: "none",
        }}
      >
        {/* Subtle background noise lines */}
        <svg
          width="100%"
          height="100%"
          style={{
            position: "absolute",
            inset: 0,
            pointerEvents: "none",
            opacity: 0.15,
          }}
        >
          <line x1="10%" y1="20%" x2="90%" y2="80%" stroke="var(--border)" strokeWidth="1" strokeDasharray="4 4" />
          <line x1="20%" y1="90%" x2="80%" y2="10%" stroke="var(--border)" strokeWidth="1" strokeDasharray="3 3" />
          <line x1="5%" y1="50%" x2="95%" y2="45%" stroke="var(--border)" strokeWidth="1" />
        </svg>

        {challenge?.items.map((item) => {
          const clickOrder = selectedClicks.indexOf(item.id);
          const isSelected = clickOrder !== -1;

          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSymbolClick(item.id)}
              style={{
                position: "absolute",
                left: `${item.x}%`,
                top: `${item.y}%`,
                transform: isSelected ? "translate(-50%, -50%) scale(1.08)" : "translate(-50%, -50%)",
                background: isSelected ? "var(--accent)" : "var(--elev)",
                border: isSelected
                  ? "1.5px solid var(--accent-contrast-text, #ffffff)"
                  : "1px solid var(--border)",
                borderRadius: "10px",
                width: "36px",
                height: "36px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "pointer",
                color: isSelected ? "var(--accent-contrast-text, #ffffff)" : "var(--text)",
                boxShadow: isSelected ? "0 4px 12px var(--accent-glow, rgba(0,0,0,0.4))" : "none",
                transition: "transform 0.12s ease, background 0.15s ease",
                zIndex: isSelected ? 10 : 2,
              }}
            >
              {isSelected && (
                <span
                  style={{
                    position: "absolute",
                    top: "-6px",
                    right: "-6px",
                    width: "16px",
                    height: "16px",
                    borderRadius: "50%",
                    background: "var(--accent-contrast-text, #ffffff)",
                    color: "var(--accent, #000000)",
                    fontSize: "10px",
                    fontWeight: 800,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    boxShadow: "0 2px 4px rgba(0,0,0,0.4)",
                  }}
                >
                  {clickOrder + 1}
                </span>
              )}
              {SYMBOL_SVGS[item.symbol] ?? item.symbol}
            </button>
          );
        })}
      </div>

      {/* Captcha Footer: Count & Reset */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          fontSize: "11px",
          padding: "0 4px",
        }}
      >
        <span style={{ color: isSolved ? "var(--accent)" : "var(--text3)" }}>
          Выбрано {selectedClicks.length} из {challenge?.targets.length ?? 4}
        </span>
        {selectedClicks.length > 0 && (
          <button
            type="button"
            onClick={onResetClicks}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text3)",
              cursor: "pointer",
              fontSize: "11px",
              padding: 0,
              textDecoration: "underline",
            }}
          >
            Сбросить выбор
          </button>
        )}
      </div>
    </div>
  );
};
