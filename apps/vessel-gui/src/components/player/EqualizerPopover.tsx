import React, { useRef, useState, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import {
  EQ_BANDS,
  EQ_MAX_DB,
  EQ_MIN_DB,
  EQ_PRESETS,
  EQ_MAX_CUSTOM_PRESETS,
  EQ_PRESET_NAME_MAX,
  PREAMP_MIN_DB,
  PREAMP_MAX_DB,
  PREAMP_STEP_DB,
  SPEED_MIN,
  SPEED_MAX,
  SPEED_STEP,
  SPEED_PRESETS,
  clampEqGain,
  clampPreampDb,
  clampSpeedRate,
  formatDb,
  formatEqFrequency,
  formatSpeedRate,
  findEqPreset,
  findEqCustomPreset,
  loadStoredEqualizer,
  saveStoredEqualizer,
  type EqCategory,
  type EqCustomPreset,
  type EqualizerStoredState,
  type SpeedMode,
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

interface PopoverPos {
  top?: number;
  bottom?: number;
  right: number;
  placement: "top" | "bottom";
}

function computePopoverPos(anchorRef?: React.RefObject<HTMLElement | null>): PopoverPos {
  if (typeof window !== "undefined" && anchorRef?.current) {
    const rect = anchorRef.current.getBoundingClientRect();
    const right = Math.max(16, Math.min(window.innerWidth - 352, window.innerWidth - rect.right - 12));
    if (rect.top < window.innerHeight / 2) {
      const top = Math.max(16, rect.bottom + 12);
      return { top, right, placement: "top" };
    }
    const bottom = Math.max(80, window.innerHeight - rect.top + 12);
    return { bottom, right, placement: "bottom" };
  }
  return { bottom: 92, right: 32, placement: "bottom" };
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
  const [pos, setPos] = useState<PopoverPos>(() => computePopoverPos(anchorRef));

  useLayoutEffect(() => {
    const update = () => setPos(computePopoverPos(anchorRef));
    update();
    window.addEventListener("resize", update);
    return () => window.removeEventListener("resize", update);
  }, [anchorRef]);

  const isEnabled = eqState.enabled;
  const gains = eqState.gains;
  const customPresets = eqState.customPresets;
  const preampDb = eqState.preampDb;
  const speedMode = eqState.speedMode;
  const playbackRate = eqState.playbackRate;

  const preampTrackRef = useRef<HTMLDivElement>(null);
  const speedTrackRef = useRef<HTMLDivElement>(null);

  const activePreset = findEqPreset(gains);
  const activeCustom = activePreset ? null : findEqCustomPreset(customPresets, gains);

  // Sync full state to Rust DSP & LocalStorage
  const persistState = (
    patch: Partial<EqualizerStoredState>,
    syncFlags: { eq?: boolean; preamp?: boolean; speed?: boolean } = {},
  ) => {
    setEqState((prev) => {
      const updated: EqualizerStoredState = {
        ...prev,
        ...patch,
      };
      saveStoredEqualizer(updated);
      if (syncFlags.eq) {
        void api.setEqualizer(updated.enabled, updated.gains).catch(() => {});
      }
      if (syncFlags.preamp) {
        void api.setAudioPreamp(updated.preampDb).catch(() => {});
      }
      if (syncFlags.speed) {
        void api.setPlaybackSpeed(updated.playbackRate).catch(() => {});
      }
      return updated;
    });
  };

  // Sync EQ, preamp & speed on initial mount
  useEffect(() => {
    void api.setEqualizer(isEnabled, gains).catch(() => {});
    void api.setAudioPreamp(preampDb).catch(() => {});
    void api.setPlaybackSpeed(playbackRate).catch(() => {});
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
    persistState({ enabled: !isEnabled }, { eq: true });
  };

  const setBandGain = (index: number, db: number) => {
    const nextGains = [...gains];
    nextGains[index] = db;
    // Touching any band automatically activates EQ
    persistState({ enabled: true, gains: nextGains }, { eq: true });
  };

  const applyPresetGains = (presetGains: number[]) => {
    persistState({ enabled: true, gains: presetGains }, { eq: true });
  };

  const selectSpeedMode = (mode: SpeedMode) => {
    if (mode === "custom") {
      persistState({ speedMode: "custom" }, { speed: false });
      return;
    }
    const nextRate = SPEED_PRESETS[mode];
    persistState({ speedMode: mode, playbackRate: nextRate }, { speed: true });
  };

  const setCustomSpeed = (rate: number) => {
    const clamped = clampSpeedRate(rate);
    persistState({ speedMode: "custom", playbackRate: clamped }, { speed: true });
  };

  const setPreamp = (db: number) => {
    const clamped = clampPreampDb(db);
    persistState({ preampDb: clamped }, { preamp: true });
  };

  const setPreampFromPointer = (clientX: number) => {
    const rect = preampTrackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setPreamp(PREAMP_MIN_DB + ratio * (PREAMP_MAX_DB - PREAMP_MIN_DB));
  };

  const setSpeedFromPointer = (clientX: number) => {
    const rect = speedTrackRef.current?.getBoundingClientRect();
    if (!rect || rect.width <= 0) return;
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setCustomSpeed(SPEED_MIN + ratio * (SPEED_MAX - SPEED_MIN));
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
    persistState({ enabled: true, gains, customPresets: nextCustomList }, { eq: true });
    setDraftName("");
    setIsNaming(false);
  };

  const handleDeleteCustom = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const nextCustomList = customPresets.filter((p) => p.id !== id);
    persistState({ customPresets: nextCustomList }, { eq: false });
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
        data-placement={pos.placement}
        style={{
          position: "fixed",
          ...(pos.top !== undefined ? { top: pos.top } : { bottom: pos.bottom }),
          right: pos.right,
          zIndex: 9999,
          width: 336,
          maxHeight: "calc(100vh - 32px)",
          overflowY: "auto",
          background: "var(--card-bg)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-panel, 14px)",
          padding: 16,
          display: "flex",
          flexDirection: "column",
          gap: 14,
          boxShadow: "0 16px 48px rgba(0, 0, 0, 0.75)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          userSelect: "none",
        }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onTouchStart={(e) => e.stopPropagation()}
      >
      {/* Speed Section */}
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>
            {lang === "ru" ? "Скорость" : "Speed"}
          </span>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                fontVariantNumeric: "tabular-nums",
                color: Math.abs(playbackRate - 1.0) > 0.01 ? "var(--accent)" : "var(--text3)",
              }}
            >
              {formatSpeedRate(playbackRate)}
            </span>
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

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(4, 1fr)",
            gap: 6,
          }}
        >
          {(
            [
              {
                id: "slowed" as const,
                label: "Slowed",
                icon: (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                  </svg>
                ),
              },
              { id: "default" as const, label: "Default", icon: null },
              {
                id: "speed" as const,
                label: "Speed",
                icon: (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                ),
              },
              {
                id: "custom" as const,
                label: lang === "ru" ? "Своя" : "Custom",
                icon: (
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="4" y1="21" x2="4" y2="14" />
                    <line x1="4" y1="10" x2="4" y2="3" />
                    <line x1="12" y1="21" x2="12" y2="12" />
                    <line x1="12" y1="8" x2="12" y2="3" />
                    <line x1="20" y1="21" x2="20" y2="16" />
                    <line x1="20" y1="12" x2="20" y2="3" />
                    <line x1="1" y1="14" x2="7" y2="14" />
                    <line x1="9" y1="8" x2="15" y2="8" />
                    <line x1="17" y1="16" x2="23" y2="16" />
                  </svg>
                ),
              },
            ]
          ).map((chip) => {
            const active = speedMode === chip.id;
            return (
              <button
                key={chip.id}
                type="button"
                onClick={() => selectSpeedMode(chip.id)}
                style={{
                  height: 30,
                  padding: "0 8px",
                  borderRadius: 9999,
                  border: "none",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  background: active ? "var(--accent)" : "var(--elev)",
                  color: active ? "var(--accent-contrast-text, #ffffff)" : "var(--text2)",
                  transition: "all 0.15s ease",
                  whiteSpace: "nowrap",
                }}
              >
                {chip.icon}
                <span>{chip.label}</span>
              </button>
            );
          })}
        </div>

        {speedMode === "custom" && (
          <div
            ref={speedTrackRef}
            role="slider"
            tabIndex={0}
            aria-label={lang === "ru" ? "Своя скорость" : "Custom speed"}
            aria-valuemin={SPEED_MIN}
            aria-valuemax={SPEED_MAX}
            aria-valuenow={playbackRate}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              setSpeedFromPointer(e.clientX);
            }}
            onPointerMove={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                setSpeedFromPointer(e.clientX);
              }
            }}
            onDoubleClick={() => setCustomSpeed(1.0)}
            onWheel={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setCustomSpeed(playbackRate + (e.deltaY < 0 ? SPEED_STEP : -SPEED_STEP));
            }}
            onKeyDown={(e) => {
              const delta =
                e.key === "ArrowRight" || e.key === "ArrowUp"
                  ? SPEED_STEP
                  : e.key === "ArrowLeft" || e.key === "ArrowDown"
                  ? -SPEED_STEP
                  : 0;
              if (delta !== 0) {
                e.preventDefault();
                setCustomSpeed(playbackRate + delta);
              }
            }}
            style={{
              position: "relative",
              height: 28,
              borderRadius: 9999,
              background: "var(--elev)",
              border: "none",
              overflow: "hidden",
              cursor: "ew-resize",
              touchAction: "none",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0 12px",
              outline: "none",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                width: `${((playbackRate - SPEED_MIN) / (SPEED_MAX - SPEED_MIN)) * 100}%`,
                background: "var(--accent)",
                opacity: 0.25,
                pointerEvents: "none",
              }}
            />
            <span style={{ position: "relative", fontSize: 11, color: "var(--text2)", fontWeight: 500 }}>
              {lang === "ru" ? "Точная скорость" : "Exact speed"}
            </span>
            <span
              style={{
                position: "relative",
                fontSize: 11,
                fontWeight: 700,
                fontVariantNumeric: "tabular-nums",
                color: "var(--text)",
              }}
            >
              {formatSpeedRate(playbackRate)}
            </span>
          </div>
        )}
      </div>

      {/* Equalizer Header with Switch */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 13, color: "var(--text)" }}>
            {lang === "ru" ? "Эквалайзер" : "Equalizer"}
          </div>
          <div style={{ fontSize: 11, color: "var(--text3)", marginTop: 1 }}>
            {lang === "ru" ? "Настройка звука по частотам" : "Frequency sound adjustments"}
          </div>
        </div>

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
                background: isEnabled ? "var(--accent-contrast-text, var(--text))" : "var(--text)",
                boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
                transition: "left 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
              }}
            />
          </span>
        </label>
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

      {/* Sound Gain Boost (Усиление 0 .. +12 дБ) */}
      {(() => {
        const boostPct = ((preampDb - PREAMP_MIN_DB) / (PREAMP_MAX_DB - PREAMP_MIN_DB)) * 100;
        const dbLabel =
          lang === "ru"
            ? `${preampDb > 0 ? "+" : ""}${Number.isInteger(preampDb) ? preampDb : preampDb.toFixed(1)} дБ`
            : `${preampDb > 0 ? "+" : ""}${Number.isInteger(preampDb) ? preampDb : preampDb.toFixed(1)} dB`;
        return (
          <div
            ref={preampTrackRef}
            role="slider"
            tabIndex={0}
            aria-label={lang === "ru" ? "Усиление" : "Gain boost"}
            aria-valuemin={PREAMP_MIN_DB}
            aria-valuemax={PREAMP_MAX_DB}
            aria-valuenow={preampDb}
            aria-valuetext={dbLabel}
            onPointerDown={(e) => {
              e.stopPropagation();
              e.currentTarget.setPointerCapture(e.pointerId);
              setPreampFromPointer(e.clientX);
            }}
            onPointerMove={(e) => {
              if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                setPreampFromPointer(e.clientX);
              }
            }}
            onDoubleClick={() => setPreamp(0)}
            onWheel={(e) => {
              e.stopPropagation();
              e.preventDefault();
              setPreamp(preampDb + (e.deltaY < 0 ? PREAMP_STEP_DB : -PREAMP_STEP_DB));
            }}
            onKeyDown={(e) => {
              const delta =
                e.key === "ArrowRight" || e.key === "ArrowUp"
                  ? PREAMP_STEP_DB
                  : e.key === "ArrowLeft" || e.key === "ArrowDown"
                  ? -PREAMP_STEP_DB
                  : 0;
              if (delta !== 0) {
                e.preventDefault();
                setPreamp(preampDb + delta);
              }
            }}
            style={{
              position: "relative",
              height: 36,
              borderRadius: 9999,
              background: "var(--elev)",
              border: "none",
              overflow: "hidden",
              cursor: "ew-resize",
              touchAction: "none",
              outline: "none",
            }}
          >
            <div
              style={{
                position: "absolute",
                inset: 0,
                width: `${boostPct}%`,
                background: "var(--accent)",
                borderRadius: 9999,
                pointerEvents: "none",
                transition: "width 0.05s linear",
              }}
            />
            <div
              style={{
                position: "relative",
                zIndex: 1,
                height: "100%",
                padding: "0 14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--text)",
                pointerEvents: "none",
              }}
            >
              <span>{lang === "ru" ? "Усиление" : "Gain"}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{dbLabel}</span>
            </div>
            <div
              aria-hidden="true"
              style={{
                position: "absolute",
                inset: 0,
                zIndex: 2,
                padding: "0 14px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                fontSize: 12,
                fontWeight: 600,
                color: "var(--accent-contrast-text, #ffffff)",
                clipPath: `inset(0 ${100 - boostPct}% 0 0)`,
                pointerEvents: "none",
              }}
            >
              <span>{lang === "ru" ? "Усиление" : "Gain"}</span>
              <span style={{ fontVariantNumeric: "tabular-nums" }}>{dbLabel}</span>
            </div>
          </div>
        );
      })()}
    </div>
    </>,
    document.body
  );
}
