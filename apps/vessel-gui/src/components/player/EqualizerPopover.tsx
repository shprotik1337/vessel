import React, { useRef, useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  EQ_BANDS,
  EQ_MAX_DB,
  EQ_MIN_DB,
  EQ_PRESETS,
  EQ_MAX_CUSTOM_PRESETS,
  EQ_PRESET_NAME_MAX,
  clampEqGain,
  formatDb,
  formatEqFrequency,
  findEqPreset,
  findEqCustomPreset,
  loadStoredEqualizer,
  saveStoredEqualizer,
  type EqCategory,
  type EqCustomPreset,
} from "./equalizerData";
import * as api from "../../api/commands";

interface EqualizerPopoverProps {
  lang: string;
  onClose: () => void;
  anchorRef?: React.RefObject<HTMLElement | null>;
}

interface BandSliderProps {
  frequency: number;
  value: number;
  dimmed: boolean;
  onChange: (db: number) => void;
}

function BandSlider({ frequency, value, dimmed, onChange }: BandSliderProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const label = `${formatEqFrequency(frequency)} Hz`;

  const setFromPointer = (clientY: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.height <= 0) return;
    const ratio = 1 - (clientY - rect.top) / rect.height;
    const db = clampEqGain(EQ_MIN_DB + ratio * (EQ_MAX_DB - EQ_MIN_DB));
    if (db !== value) onChange(db);
  };

  const ratio = (value - EQ_MIN_DB) / (EQ_MAX_DB - EQ_MIN_DB);
  const zero = (0 - EQ_MIN_DB) / (EQ_MAX_DB - EQ_MIN_DB);
  const fillBottom = Math.min(ratio, zero);
  const fillHeight = Math.abs(ratio - zero);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 6,
        userSelect: "none",
      }}
    >
      <span
        style={{
          height: 13,
          fontSize: 10,
          fontWeight: 600,
          fontVariantNumeric: "tabular-nums",
          color: Math.abs(value) > 0.01 ? "var(--text)" : "var(--text3)",
          transition: "color 0.15s ease",
        }}
      >
        {formatDb(value)}
      </span>

      <div
        ref={trackRef}
        role="slider"
        tabIndex={0}
        aria-label={label}
        aria-valuemin={EQ_MIN_DB}
        aria-valuemax={EQ_MAX_DB}
        aria-valuenow={value}
        aria-valuetext={`${formatDb(value)} dB`}
        title={label}
        style={{
          position: "relative",
          height: 110,
          width: 22,
          cursor: "ns-resize",
          touchAction: "none",
          outline: "none",
          opacity: dimmed ? 0.45 : 1,
          transition: "opacity 0.2s ease",
        }}
        onPointerDown={(e) => {
          e.stopPropagation();
          e.currentTarget.setPointerCapture(e.pointerId);
          setFromPointer(e.clientY);
        }}
        onPointerMove={(e) => {
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            setFromPointer(e.clientY);
          }
        }}
        onDoubleClick={() => onChange(0)}
        onWheel={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onChange(clampEqGain(value + (e.deltaY < 0 ? 0.5 : -0.5)));
        }}
        onKeyDown={(e) => {
          const delta = e.key === "ArrowUp" ? 0.5 : e.key === "ArrowDown" ? -0.5 : 0;
          if (delta !== 0) {
            e.preventDefault();
            onChange(clampEqGain(value + delta));
          }
        }}
      >
        {/* Track center rail */}
        <div
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            left: "50%",
            width: 4,
            transform: "translateX(-50%)",
            borderRadius: 9999,
            background: "var(--elev)",
          }}
        />

        {/* 0 dB center line marker */}
        <div
          style={{
            position: "absolute",
            bottom: "50%",
            left: "50%",
            width: 10,
            height: 1,
            transform: "translateX(-50%)",
            background: "var(--border2, rgba(255,255,255,0.2))",
          }}
        />

        {/* Fill from 0 dB line */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            width: 4,
            transform: "translateX(-50%)",
            borderRadius: 9999,
            background: "var(--accent, var(--text))",
            bottom: `${fillBottom * 100}%`,
            height: `${fillHeight * 100}%`,
          }}
        />

        {/* Knob handle */}
        <div
          style={{
            position: "absolute",
            left: "50%",
            width: 14,
            height: 10,
            transform: "translate(-50%, 50%)",
            borderRadius: 3,
            background: "var(--text)",
            boxShadow: "0 1px 4px rgba(0,0,0,0.4)",
            bottom: `${ratio * 100}%`,
          }}
        />
      </div>

      <span
        style={{
          fontSize: 10,
          fontWeight: 500,
          color: "var(--text3)",
        }}
      >
        {formatEqFrequency(frequency)}
      </span>
    </div>
  );
}

export function EqualizerPopover({ lang, onClose, anchorRef }: EqualizerPopoverProps) {
  const [eqState, setEqState] = useState(() => loadStoredEqualizer());
  const [tab, setTab] = useState<EqCategory>(() => {
    const initial = loadStoredEqualizer();
    const custom = findEqCustomPreset(initial.customPresets, initial.gains);
    if (custom) return "custom";
    const preset = findEqPreset(initial.gains);
    return preset?.category ?? "enhance";
  });

  const [isNaming, setIsNaming] = useState(false);
  const [draftName, setDraftName] = useState("");
  const [pos, setPos] = useState<{ bottom: number; right: number }>({ bottom: 92, right: 32 });

  useEffect(() => {
    if (anchorRef?.current) {
      const rect = anchorRef.current.getBoundingClientRect();
      const right = Math.max(16, window.innerWidth - rect.right - 12);
      const bottom = Math.max(80, window.innerHeight - rect.top + 12);
      setPos({ bottom, right });
    }
  }, [anchorRef]);

  const isEnabled = eqState.enabled;
  const gains = eqState.gains;
  const customPresets = eqState.customPresets;

  const activePreset = findEqPreset(gains);
  const activeCustom = activePreset ? null : findEqCustomPreset(customPresets, gains);

  // Sync state to Rust DSP & LocalStorage whenever enabled or gains change
  const applyState = (newEnabled: boolean, newGains: number[], newCustom?: EqCustomPreset[]) => {
    const updated = {
      enabled: newEnabled,
      gains: newGains,
      customPresets: newCustom ?? customPresets,
    };
    setEqState(updated);
    saveStoredEqualizer(updated);
    void api.setEqualizer(newEnabled, newGains).catch(() => {});
  };

  // Sync on initial mount
  useEffect(() => {
    void api.setEqualizer(isEnabled, gains).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const toggleEnabled = () => {
    applyState(!isEnabled, gains);
  };

  const setBandGain = (index: number, db: number) => {
    const nextGains = [...gains];
    nextGains[index] = db;
    // Touching any band automatically activates EQ
    applyState(true, nextGains);
  };

  const applyPresetGains = (presetGains: number[]) => {
    applyState(true, presetGains);
  };

  const handleSaveCustom = (e: React.FormEvent) => {
    e.preventDefault();
    const name = draftName.trim();
    if (!name) return;

    const id = `custom_${Date.now()}`;
    const newCustom: EqCustomPreset = {
      id,
      name: name.slice(0, EQ_PRESET_NAME_MAX),
      gains: [...gains],
    };

    const nextCustomList = [newCustom, ...customPresets].slice(0, EQ_MAX_CUSTOM_PRESETS);
    applyState(true, gains, nextCustomList);
    setDraftName("");
    setIsNaming(false);
  };

  const handleDeleteCustom = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextCustomList = customPresets.filter((p) => p.id !== id);
    applyState(isEnabled, gains, nextCustomList);
  };

  const canSaveMore = customPresets.length < EQ_MAX_CUSTOM_PRESETS;

  if (typeof document === "undefined") return null;

  return createPortal(
    <>
      <div
        className="equalizer-popover-backdrop"
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 9998,
          background: "transparent",
        }}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
        onPointerDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onTouchStart={(e) => {
          e.preventDefault();
          e.stopPropagation();
          onClose();
        }}
      />
      <div
        className="equalizer-popover"
        style={{
          position: "fixed",
          bottom: pos.bottom,
          right: pos.right,
          zIndex: 9999,
          width: 320,
          background: "var(--card-bg)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-panel, 14px)",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          boxShadow: "0 16px 48px rgba(0, 0, 0, 0.75)",
          backdropFilter: "blur(24px) saturate(160%)",
          WebkitBackdropFilter: "blur(24px) saturate(160%)",
          userSelect: "none",
        }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
      {/* Header with Switch */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14, color: "var(--text)" }}>
            {lang === "ru" ? "Эквалайзер" : "Equalizer"}
          </div>
          <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 1 }}>
            {lang === "ru" ? "Настройка звука по частотам" : "Frequency sound adjustments"}
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Toggle switch */}
          <label
            style={{
              position: "relative",
              display: "inline-block",
              width: 36,
              height: 20,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              checked={isEnabled}
              onChange={toggleEnabled}
              style={{ opacity: 0, width: 0, height: 0 }}
            />
            <span
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: 9999,
                background: isEnabled ? "var(--accent)" : "var(--elev)",
                border: "1px solid var(--border)",
                transition: "background 0.2s ease",
              }}
            >
              <span
                style={{
                  position: "absolute",
                  top: 2,
                  left: isEnabled ? 18 : 2,
                  width: 14,
                  height: 14,
                  borderRadius: "50%",
                  background: "var(--text)",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
                  transition: "left 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
                }}
              />
            </span>
          </label>

          {/* Close button */}
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text3)",
              cursor: "pointer",
              padding: 4,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              borderRadius: "50%",
            }}
            title={lang === "ru" ? "Закрыть" : "Close"}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 2,
            background: "var(--elev)",
            padding: 2,
            borderRadius: 8,
          }}
        >
          {(
            [
              { id: "enhance", label: lang === "ru" ? "Улучшение" : "Enhance" },
              { id: "genre", label: lang === "ru" ? "Жанры" : "Genres" },
              { id: "accent", label: lang === "ru" ? "Акценты" : "Accents" },
              { id: "custom", label: lang === "ru" ? "Мои" : "Custom" },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              style={{
                height: 24,
                borderRadius: 6,
                border: "none",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
                background: tab === t.id ? "var(--card-bg)" : "transparent",
                color: tab === t.id ? "var(--text)" : "var(--text3)",
                boxShadow: tab === t.id ? "0 1px 3px rgba(0,0,0,0.2)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* Preset chips for current category */}
        {tab !== "custom" ? (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 4,
            }}
          >
            {EQ_PRESETS.filter((p) => p.category === tab).map((p) => {
              const active = isEnabled && activePreset?.id === p.id;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => applyPresetGains(p.gains)}
                  title={p.hint}
                  style={{
                    height: 26,
                    padding: "0 6px",
                    borderRadius: 6,
                    border: "none",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: "pointer",
                    textOverflow: "ellipsis",
                    overflow: "hidden",
                    whiteSpace: "nowrap",
                    background: active
                      ? "var(--accent)"
                      : "var(--elev)",
                    color: active
                      ? "var(--accent-contrast-text, #ffffff)"
                      : "var(--text2)",
                    transition: "all 0.15s ease",
                  }}
                >
                  {p.name}
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {customPresets.length > 0 && (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: 4,
                }}
              >
                {customPresets.map((p) => {
                  const active = isEnabled && activeCustom?.id === p.id;
                  return (
                    <div
                      key={p.id}
                      style={{ position: "relative", minWidth: 0 }}
                    >
                      <button
                        type="button"
                        onClick={() => applyPresetGains(p.gains)}
                        style={{
                          width: "100%",
                          height: 26,
                          padding: "0 6px",
                          borderRadius: 6,
                          border: "none",
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: "pointer",
                          textOverflow: "ellipsis",
                          overflow: "hidden",
                          whiteSpace: "nowrap",
                          background: active ? "var(--accent)" : "var(--elev)",
                          color: active ? "var(--accent-contrast-text, #ffffff)" : "var(--text2)",
                          transition: "all 0.15s ease",
                        }}
                      >
                        {p.name}
                      </button>
                      <button
                        type="button"
                        onClick={(e) => handleDeleteCustom(p.id, e)}
                        title={lang === "ru" ? "Удалить пресет" : "Delete preset"}
                        style={{
                          position: "absolute",
                          top: -3,
                          right: -3,
                          width: 14,
                          height: 14,
                          borderRadius: "50%",
                          border: "none",
                          background: "var(--red, #ef4444)",
                          color: "#ffffff",
                          fontSize: 9,
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          cursor: "pointer",
                          padding: 0,
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {isNaming ? (
              <form onSubmit={handleSaveCustom} style={{ display: "flex", gap: 4 }}>
                <input
                  autoFocus
                  value={draftName}
                  maxLength={EQ_PRESET_NAME_MAX}
                  placeholder={lang === "ru" ? "Название пресета" : "Preset name"}
                  onChange={(e) => setDraftName(e.target.value)}
                  onBlur={() => {
                    if (!draftName.trim()) setIsNaming(false);
                  }}
                  style={{
                    flex: 1,
                    height: 26,
                    padding: "0 8px",
                    borderRadius: 6,
                    border: "1px solid var(--border)",
                    background: "var(--elev)",
                    color: "var(--text)",
                    fontSize: 11,
                    outline: "none",
                  }}
                />
                <button
                  type="submit"
                  disabled={!draftName.trim()}
                  style={{
                    height: 26,
                    padding: "0 10px",
                    borderRadius: 6,
                    border: "none",
                    background: "var(--accent)",
                    color: "var(--accent-contrast-text, #ffffff)",
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: draftName.trim() ? "pointer" : "not-allowed",
                    opacity: draftName.trim() ? 1 : 0.5,
                  }}
                >
                  ✓
                </button>
              </form>
            ) : (
              <button
                type="button"
                disabled={!canSaveMore}
                onClick={() => setIsNaming(true)}
                style={{
                  height: 26,
                  borderRadius: 6,
                  border: "1px dashed var(--border)",
                  background: "transparent",
                  color: "var(--text2)",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: canSaveMore ? "pointer" : "not-allowed",
                  opacity: canSaveMore ? 1 : 0.5,
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                }}
              >
                <span>+</span>
                <span>
                  {canSaveMore
                    ? lang === "ru"
                      ? "Сохранить текущий"
                      : "Save current curve"
                    : lang === "ru"
                    ? "Достигнут лимит пресетов"
                    : "Presets limit reached"}
                </span>
              </button>
            )}

            {customPresets.length === 0 && !isNaming && (
              <span style={{ fontSize: 11, color: "var(--text3)", lineHeight: 1.35, textAlign: "center" }}>
                {lang === "ru"
                  ? "Настройте полосы и сохраните кривую, чтобы вернуться к ней позже"
                  : "Tune the bands and save your curve to use later"}
              </span>
            )}
          </div>
        )}
      </div>

      {/* 10 Band Sliders Grid */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(10, 1fr)",
          gap: 2,
          padding: "4px 0",
        }}
      >
        {EQ_BANDS.map((frequency, i) => (
          <BandSlider
            key={frequency}
            frequency={frequency}
            value={gains[i] ?? 0}
            dimmed={!isEnabled}
            onChange={(db) => setBandGain(i, db)}
          />
        ))}
      </div>
    </div>
    </>,
    document.body
  );
}
