import { useEffect, useRef } from "react";

type Point = readonly [number, number];

// Координаты плавного SVG-морфинга Play <-> Pause (режим split, оптически отцентровано)
const PLAY_A: readonly Point[] = [
  [9.05, 5.4],
  [14.15, 8.81],
  [14.15, 15.19],
  [9.05, 18.6],
];
const PLAY_B: readonly Point[] = [
  [13.75, 8.54],
  [18.85, 11.95],
  [18.85, 12.05],
  [13.75, 15.46],
];

const PAUSE_A: readonly Point[] = [
  [6.8, 5.4],
  [9.2, 5.4],
  [9.2, 18.6],
  [6.8, 18.6],
];
const PAUSE_B: readonly Point[] = [
  [14.8, 5.4],
  [17.2, 5.4],
  [17.2, 18.6],
  [14.8, 18.6],
];

const MORPH_DURATION_MS = 290;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeOutCubic(p: number): number {
  return 1 - Math.pow(1 - p, 3);
}

function buildPolyPath(
  fromPts: readonly Point[],
  toPts: readonly Point[],
  t: number,
  preventTipCross: boolean
): string {
  const pts: [number, number][] = [];
  for (let i = 0; i < 4; i++) {
    pts.push([
      lerp(fromPts[i][0], toPts[i][0], t),
      lerp(fromPts[i][1], toPts[i][1], t),
    ]);
  }
  if (preventTipCross && pts[1][1] > pts[2][1]) {
    const midY = (pts[1][1] + pts[2][1]) * 0.5;
    pts[1][1] = midY - 0.05;
    pts[2][1] = midY + 0.05;
  }
  let d = "";
  for (let i = 0; i < 4; i++) {
    d += (i === 0 ? "M" : "L") + pts[i][0].toFixed(2) + " " + pts[i][1].toFixed(2);
  }
  return d + "Z";
}

interface MorphPlayIconProps {
  playing: boolean;
  size: number;
}

/**
 * Плавный SVG-морфинг иконки Play <-> Pause на 60fps без перерендеров React.
 */
export function MorphPlayIcon({ playing, size }: MorphPlayIconProps) {
  const pathARef = useRef<SVGPathElement | null>(null);
  const pathBRef = useRef<SVGPathElement | null>(null);
  const currentTRef = useRef<number>(playing ? 1 : 0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const targetT = playing ? 1 : 0;
    const startT = currentTRef.current;

    if (Math.abs(targetT - startT) < 0.0001) {
      if (pathARef.current && pathBRef.current) {
        pathARef.current.setAttribute("d", buildPolyPath(PLAY_A, PAUSE_A, targetT, false));
        pathBRef.current.setAttribute("d", buildPolyPath(PLAY_B, PAUSE_B, targetT, true));
      }
      return;
    }

    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const startTime = performance.now();

    const step = (now: number) => {
      const rawP = Math.min(1, Math.max(0, (now - startTime) / MORPH_DURATION_MS));
      const easedP = easeOutCubic(rawP);
      const t = startT + (targetT - startT) * easedP;
      currentTRef.current = t;

      if (pathARef.current && pathBRef.current) {
        pathARef.current.setAttribute("d", buildPolyPath(PLAY_A, PAUSE_A, t, false));
        pathBRef.current.setAttribute("d", buildPolyPath(PLAY_B, PAUSE_B, t, true));
      }

      if (rawP < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        currentTRef.current = targetT;
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [playing]);

  const initialT = currentTRef.current;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={{ display: "block", pointerEvents: "none" }}
    >
      <g>
        <path
          ref={pathARef}
          fill="currentColor"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinejoin="round"
          strokeLinecap="round"
          d={buildPolyPath(PLAY_A, PAUSE_A, initialT, false)}
        />
        <path
          ref={pathBRef}
          fill="currentColor"
          stroke="currentColor"
          strokeWidth={2.2}
          strokeLinejoin="round"
          strokeLinecap="round"
          d={buildPolyPath(PLAY_B, PAUSE_B, initialT, true)}
        />
      </g>
    </svg>
  );
}
