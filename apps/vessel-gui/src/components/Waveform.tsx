import type { CSSProperties } from "react";

type WfStyle = CSSProperties & { [key: `--${string}`]: string | number };

interface WaveformProps {
  state: "idle" | "hover" | "playing";
  barCount?: number;
  height?: number;
}

export function Waveform({ state, barCount = 80, height = 64 }: WaveformProps) {
  // Детерминированная псевдо-волна: высоты баров меняются от индекса.
  // Анимация через transform: scaleY (не height) — не вызывает reflow и бары не мерцают.
  const bars = Array.from({ length: barCount }, (_, i) => {
    const base =
      45 +
      Math.sin(i * 0.8) * 22 +
      Math.sin(i * 0.35 + 2) * 14 +
      Math.cos(i * 1.3 + 1) * 10;
    const low = Math.max(22, Math.round(base * 0.45));
    const high = Math.min(96, Math.round(base + (state === "playing" ? 14 : 6)));
    const dur =
      state === "playing"
        ? 1.1 + (i % 5) * 0.07
        : state === "hover"
          ? 1.9 + (i % 5) * 0.1
          : 3.2 + (i % 6) * 0.18;
    return {
      low: low / 100,
      high: high / 100,
      dur,
      delay: (i % 9) * 0.22,
    };
  });

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 2,
        height,
        overflow: "hidden",
        flex: 1,
        width: "100%",
        minWidth: 0,
      }}
      className="waveform"
    >
      {bars.map((bar, i) => (
        <span
          key={i}
          className="wf-bar"
          style={
            {
              display: "block",
              flex: "1 1 0",
              minWidth: 3,
              height: "100%",
              borderRadius: 2,
              background: "var(--text2)",
              transform: `scaleY(${bar.low})`,
              transformOrigin: "bottom",
              animation: `wf-pulse ${bar.dur}s ease-in-out ${bar.delay}s infinite`,
              "--wf-low": `${bar.low}`,
              "--wf-high": `${bar.high}`,
            } as WfStyle
          }
        />
      ))}
      <style>{`
        @keyframes wf-pulse {
          0%, 100% { transform: scaleY(var(--wf-low)); }
          50% { transform: scaleY(var(--wf-high)); }
        }
        .waveform span { opacity: 0.55; }
        .waveform:hover span { opacity: 0.85; }
      `}</style>
    </div>
  );
}