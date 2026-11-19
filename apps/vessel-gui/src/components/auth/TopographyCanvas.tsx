import { useEffect, useRef, useImperativeHandle, forwardRef } from "react";

export interface TopographyCanvasHandle {
  triggerPulse: (direction: number, strength: number) => void;
}

export const TopographyCanvas = forwardRef<TopographyCanvasHandle, {}>((_, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Mutable animation state
  const stateRef = useRef({
    width: 1,
    height: 1,
    dpr: 1,
    noiseZ: 0,
    driftX: 0,
    driftY: 0,
    impulse: 0,
    impulseDir: 1,
    rippleRadius: 0,
    rippleEnergy: 0,
  });

  useImperativeHandle(ref, () => ({
    triggerPulse: (direction: number, strength: number) => {
      const s = stateRef.current;
      s.impulseDir = direction;
      s.impulse = Math.min(1.5, Math.max(s.impulse, strength));
      s.rippleRadius = 0;
      s.rippleEnergy = Math.min(1.4, Math.max(s.rippleEnergy, strength));
    },
  }));

  useEffect(() => {
    const container = containerRef.current;
    const canvas = canvasRef.current;
    if (!container || !canvas) return;

    const ctx = canvas.getContext("2d", { alpha: false });
    if (!ctx) return;

    // 1. Perlin noise tables
    const perm = new Uint8Array(512);
    const grads3 = [
      [1, 1, 0], [-1, 1, 0], [1, -1, 0], [-1, -1, 0],
      [1, 0, 1], [-1, 0, 1], [1, 0, -1], [-1, 0, -1],
      [0, 1, 1], [0, -1, 1], [0, 1, -1], [0, -1, -1],
    ];

    (function initPermutation() {
      const p = new Uint8Array(256);
      for (let i = 0; i < 256; i++) p[i] = i;
      let seed = 133742;
      for (let i = 255; i > 0; i--) {
        seed = (seed * 16807) % 2147483647;
        const j = seed % (i + 1);
        const tmp = p[i];
        p[i] = p[j];
        p[j] = tmp;
      }
      for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
    })();

    function fade(t: number) {
      return t * t * t * (t * (t * 6 - 15) + 10);
    }

    function lerp(a: number, b: number, t: number) {
      return a + t * (b - a);
    }

    function gradDot(hash: number, x: number, y: number, z: number) {
      const g = grads3[hash % 12];
      return g[0] * x + g[1] * y + g[2] * z;
    }

    function noise3D(x: number, y: number, z: number) {
      const xi = Math.floor(x);
      const yi = Math.floor(y);
      const zi = Math.floor(z);

      const xf = x - xi;
      const yf = y - yi;
      const zf = z - zi;

      const X = xi & 255;
      const Y = yi & 255;
      const Z = zi & 255;

      const u = fade(xf);
      const v = fade(yf);
      const w = fade(zf);

      const A = perm[X] + Y;
      const AA = perm[A] + Z;
      const AB = perm[A + 1] + Z;
      const B = perm[X + 1] + Y;
      const BA = perm[B] + Z;
      const BB = perm[B + 1] + Z;

      const x1 = lerp(gradDot(perm[AA], xf, yf, zf), gradDot(perm[BA], xf - 1, yf, zf), u);
      const x2 = lerp(gradDot(perm[AB], xf, yf - 1, zf), gradDot(perm[BB], xf - 1, yf - 1, zf), u);
      const y1 = lerp(x1, x2, v);

      const x3 = lerp(gradDot(perm[AA + 1], xf, yf, zf - 1), gradDot(perm[BA + 1], xf - 1, yf, zf - 1), u);
      const x4 = lerp(gradDot(perm[AB + 1], xf, yf - 1, zf - 1), gradDot(perm[BB + 1], xf - 1, yf - 1, zf - 1), u);
      const y2 = lerp(x3, x4, v);

      return lerp(y1, y2, w);
    }

    // Marching squares edge lookup
    const MS_TABLE: number[][] = [
      [], [3, 2], [2, 1], [3, 1],
      [0, 1], [0, 3, 2, 1], [0, 2], [0, 3],
      [0, 3], [0, 2], [0, 1, 3, 2], [0, 1],
      [3, 1], [2, 1], [3, 2], [],
    ];

    let cols = 76;
    let rows = 58;
    let field = new Float32Array((cols + 1) * (rows + 1));

    function resizeCanvas() {
      if (!container || !canvas || !ctx) return;
      const rect = container.getBoundingClientRect();
      const w = Math.max(1, Math.floor(rect.width));
      const h = Math.max(1, Math.floor(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 2);

      const s = stateRef.current;
      s.width = w;
      s.height = h;
      s.dpr = dpr;

      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    function renderTopography(dt: number) {
      const s = stateRef.current;
      const w = s.width;
      const h = s.height;
      if (w <= 1 || h <= 1 || !ctx) return;

      // Pure black canvas clear
      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, w, h);

      // Noise drift + impulse evolution
      s.noiseZ += dt * (0.085 + s.impulse * s.impulseDir * 0.68);
      s.driftX += dt * (0.018 + s.impulse * s.impulseDir * 0.11);
      s.driftY += dt * 0.008;

      if (s.rippleEnergy > 0.003) {
        s.rippleRadius += dt * 1.05;
        s.rippleEnergy *= Math.pow(0.06, dt);
      } else {
        s.rippleEnergy = 0;
        s.rippleRadius = 0;
      }

      cols = w > 720 ? 78 : 50;
      rows = Math.max(36, Math.round(cols * (h / w)));
      const nodeCount = (cols + 1) * (rows + 1);
      if (field.length !== nodeCount) {
        field = new Float32Array(nodeCount);
      }

      const cellW = w / cols;
      const cellH = h / rows;
      const aspect = w / h;

      const scaleBreath = 1 - s.impulse * 0.075;
      const scaleX = 2.55 * Math.min(1.3, Math.max(0.85, aspect)) * scaleBreath;
      const scaleY = 2.55 * scaleBreath;

      const zPhase = s.noiseZ;
      const dxShift = s.driftX;
      const dyShift = s.driftY;

      const hasRipple = s.rippleEnergy > 0.003;
      const ripR = s.rippleRadius;
      const ripAmp = s.rippleEnergy * 0.28;

      const stride = cols + 1;
      for (let j = 0; j <= rows; j++) {
        const vNorm = j / rows;
        const ny = (vNorm - 0.5) * scaleY + dyShift;
        const dy = vNorm - 0.5;
        const rowStart = j * stride;

        for (let i = 0; i <= cols; i++) {
          const uNorm = i / cols;
          const nx = (uNorm - 0.5) * scaleX + dxShift;

          let val =
            noise3D(nx, ny, zPhase) * 0.74 +
            noise3D(nx * 2.06 + 9.7, ny * 2.06 - 6.3, zPhase * 1.32 + 3.4) * 0.26;

          if (hasRipple) {
            const dx = (uNorm - 0.52) * aspect;
            const dist = Math.hypot(dx, dy);
            const delta = dist - ripR;
            const envelope = Math.exp(-(delta * delta) * 16.0);
            val += Math.cos(delta * 13.0) * envelope * ripAmp;
          }

          field[rowStart + i] = val;
        }
      }

      // Render 14 levels of isolines
      const levels = 14;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      for (let lv = 0; lv < levels; lv++) {
        const t = lv / (levels - 1);
        const iso = -0.64 + t * 1.28;
        const isMajor = lv % 3 === 1;

        ctx.beginPath();

        for (let j = 0; j < rows; j++) {
          const r0 = j * stride;
          const r1 = r0 + stride;
          const y0 = j * cellH;

          for (let i = 0; i < cols; i++) {
            const v0 = field[r0 + i];
            const v1 = field[r0 + i + 1];
            const v2 = field[r1 + i + 1];
            const v3 = field[r1 + i];

            const idx =
              (v0 > iso ? 8 : 0) |
              (v1 > iso ? 4 : 0) |
              (v2 > iso ? 2 : 0) |
              (v3 > iso ? 1 : 0);

            if (idx === 0 || idx === 15) continue;

            let segs = MS_TABLE[idx];
            if (idx === 5 || idx === 10) {
              const center = (v0 + v1 + v2 + v3) * 0.25;
              if (idx === 5) segs = center > iso ? [0, 1, 2, 3] : [0, 3, 2, 1];
              else segs = center > iso ? [0, 3, 2, 1] : [0, 1, 3, 2];
            }

            const x0 = i * cellW;

            for (let sIdx = 0; sIdx < segs.length; sIdx += 2) {
              const eA = segs[sIdx];
              const eB = segs[sIdx + 1];

              let ax = 0, ay = 0, bx = 0, by = 0, denom = 0, frac = 0;

              if (eA === 0) {
                denom = v1 - v0;
                frac = Math.abs(denom) < 1e-5 ? 0.5 : (iso - v0) / denom;
                ax = x0 + frac * cellW;
                ay = y0;
              } else if (eA === 1) {
                denom = v2 - v1;
                frac = Math.abs(denom) < 1e-5 ? 0.5 : (iso - v1) / denom;
                ax = x0 + cellW;
                ay = y0 + frac * cellH;
              } else if (eA === 2) {
                denom = v2 - v3;
                frac = Math.abs(denom) < 1e-5 ? 0.5 : (iso - v3) / denom;
                ax = x0 + frac * cellW;
                ay = y0 + cellH;
              } else {
                denom = v3 - v0;
                frac = Math.abs(denom) < 1e-5 ? 0.5 : (iso - v0) / denom;
                ax = x0;
                ay = y0 + frac * cellH;
              }

              if (eB === 0) {
                denom = v1 - v0;
                frac = Math.abs(denom) < 1e-5 ? 0.5 : (iso - v0) / denom;
                bx = x0 + frac * cellW;
                by = y0;
              } else if (eB === 1) {
                denom = v2 - v1;
                frac = Math.abs(denom) < 1e-5 ? 0.5 : (iso - v1) / denom;
                bx = x0 + cellW;
                by = y0 + frac * cellH;
              } else if (eB === 2) {
                denom = v2 - v3;
                frac = Math.abs(denom) < 1e-5 ? 0.5 : (iso - v3) / denom;
                bx = x0 + frac * cellW;
                by = y0 + cellH;
              } else {
                denom = v3 - v0;
                frac = Math.abs(denom) < 1e-5 ? 0.5 : (iso - v0) / denom;
                bx = x0;
                by = y0 + frac * cellH;
              }

              ctx.moveTo(ax, ay);
              ctx.lineTo(bx, by);
            }
          }
        }

        if (isMajor) {
          const glowAlpha = Math.min(0.24, 0.08 + s.impulse * 0.14);
          ctx.strokeStyle = `rgba(255, 255, 255, ${glowAlpha.toFixed(3)})`;
          ctx.lineWidth = 3.8 + s.impulse * 1.1;
          ctx.stroke();

          const mainAlpha = Math.min(0.92, 0.34 + t * 0.18 + s.impulse * 0.34);
          ctx.strokeStyle = `rgba(255, 255, 255, ${mainAlpha.toFixed(3)})`;
          ctx.lineWidth = 1.35 + s.impulse * 0.25;
          ctx.stroke();
        } else {
          const minorAlpha = Math.min(0.32, 0.11 + t * 0.06 + s.impulse * 0.09);
          ctx.strokeStyle = `rgba(255, 255, 255, ${minorAlpha.toFixed(3)})`;
          ctx.lineWidth = 0.75;
          ctx.stroke();
        }
      }

      // Vignette
      const cx = w * 0.55;
      const cy = h * 0.5;
      const vig = ctx.createRadialGradient(
        cx,
        cy,
        Math.min(w, h) * 0.18,
        cx,
        cy,
        Math.max(w, h) * 0.74
      );
      vig.addColorStop(0, "rgba(0, 0, 0, 0)");
      vig.addColorStop(0.76, "rgba(0, 0, 0, 0.28)");
      vig.addColorStop(1, "rgba(0, 0, 0, 0.8)");
      ctx.fillStyle = vig;
      ctx.fillRect(0, 0, w, h);
    }

    let lastTimestamp = performance.now();
    let animId: number;

    function animate(now: number) {
      const s = stateRef.current;
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTimestamp) / 1000));
      lastTimestamp = now;

      s.impulse *= Math.pow(0.045, dt);
      if (s.impulse < 0.001) s.impulse = 0;

      renderTopography(dt);
      animId = requestAnimationFrame(animate);
    }

    resizeCanvas();
    animId = requestAnimationFrame(animate);

    window.addEventListener("resize", resizeCanvas);
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(resizeCanvas) : null;
    if (ro) ro.observe(container);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener("resize", resizeCanvas);
      if (ro) ro.disconnect();
    };
  }, []);

  return (
    <section ref={containerRef} id="visual-panel" className="auth-right" aria-hidden="true">
      <canvas ref={canvasRef} id="topo-canvas" />

      {/* Film grain SVG overlay */}
      <svg className="film-grain" aria-hidden="true">
        <filter id="grain-filter">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.82"
            numOctaves={3}
            stitchTiles="stitch"
          />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain-filter)" />
      </svg>

      {/* Seamless transition gradients */}
      <div className="edge-fade-left" />
      <div className="mobile-vignette" />
    </section>
  );
});

TopographyCanvas.displayName = "TopographyCanvas";
