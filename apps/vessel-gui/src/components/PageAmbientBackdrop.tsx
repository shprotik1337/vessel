import { useEffect, useState, useRef, memo } from "react";
import { createPortal } from "react-dom";
import { useCustomization } from "../customization/CustomizationContext";

export const LIBRARY_AMBIENT_SVG = `data:image/svg+xml;utf8,${encodeURIComponent(
  `<svg width="1000" height="1000" viewBox="0 0 1000 1000" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect width="1000" height="1000" fill="#090c1b"/>
    <circle cx="260" cy="220" r="360" fill="#2546a8" fill-opacity="0.45"/>
    <circle cx="760" cy="280" r="380" fill="#4f46e5" fill-opacity="0.4"/>
    <circle cx="500" cy="620" r="340" fill="#1e1b4b" fill-opacity="0.55"/>
  </svg>`
)}`;

interface PageAmbientBackdropProps {
  url?: string | null;
  fallbackClass?: string;
  className?: string;
}

interface Layer {
  id: number;
  src: string | null;
  isTheme?: boolean;
}

const FADE_MS = 380;
let nextLayerId = 1;

export const PageAmbientBackdrop = memo(function PageAmbientBackdrop({
  url,
  fallbackClass,
}: PageAmbientBackdropProps) {
  const { config } = useCustomization();
  const [mounted, setMounted] = useState(false);

  const hasWallpaper = Boolean(config.theme?.wallpaperData);
  const ambientMode = config.theme?.ambientMode ?? "dynamic";
  const isOff = hasWallpaper || ambientMode === "off";
  const isTheme = ambientMode === "theme";

  const effectiveSrc = isTheme
    ? null
    : (url || (fallbackClass === "page-ambient-glow-fav" ? LIBRARY_AMBIENT_SVG : null));

  const [layers, setLayers] = useState<Layer[]>(() =>
    isOff
      ? []
      : [{ id: nextLayerId++, src: effectiveSrc, isTheme }]
  );
  const [visibleId, setVisibleId] = useState<number | null>(layers[0]?.id ?? null);
  const cleanupTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (isOff) {
      setVisibleId(null);
      if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);
      cleanupTimerRef.current = window.setTimeout(() => {
        cleanupTimerRef.current = null;
        setLayers([]);
      }, FADE_MS + 50);
      return;
    }

    const current = layers[layers.length - 1];
    if (current && current.src === effectiveSrc && current.isTheme === isTheme) {
      setVisibleId(current.id);
      return;
    }

    const newLayer: Layer = {
      id: nextLayerId++,
      src: effectiveSrc,
      isTheme,
    };

    setLayers((prev) => [...prev.slice(-1), newLayer]);
    setVisibleId(newLayer.id);

    if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);
    cleanupTimerRef.current = window.setTimeout(() => {
      cleanupTimerRef.current = null;
      setLayers([newLayer]);
    }, FADE_MS + 50);

    return () => {
      if (cleanupTimerRef.current) clearTimeout(cleanupTimerRef.current);
    };
  }, [effectiveSrc, isOff, isTheme]);

  if (!mounted || typeof document === "undefined" || isOff) return null;
  const container = document.getElementById("vessel-glow-root");
  if (!container) return null;

  return createPortal(
    <div className="page-ambient-container" aria-hidden="true">
      <div className="page-ambient-mask-area">
        {layers.map((layer) => {
          const isVisible = visibleId === layer.id;
          if (layer.isTheme) {
            return (
              <div
                key={layer.id}
                className="page-ambient-layer-theme"
                style={{
                  opacity: isVisible ? 0.6 : 0,
                  transition: `opacity ${FADE_MS}ms ease-out`,
                }}
              />
            );
          }
          if (!layer.src) return null;
          return (
            <img
              key={layer.id}
              src={layer.src}
              alt=""
              draggable={false}
              decoding="async"
              className={`page-ambient-layer-img ${isVisible ? "visible" : ""}`}
              style={{
                transition: `opacity ${FADE_MS}ms ease-out`,
              }}
            />
          );
        })}
      </div>
    </div>,
    container
  );
});
