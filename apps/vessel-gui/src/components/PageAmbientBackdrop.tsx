import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";

interface PageAmbientBackdropProps {
  url?: string | null;
  fallbackClass?: string;
  className?: string;
}

export function PageAmbientBackdrop({ url, fallbackClass, className }: PageAmbientBackdropProps) {
  const [mounted, setMounted] = useState(false);
  const glowRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;

    let rafId: number | null = null;
    const scrollEl = document.querySelector(".content");

    const updateGlow = () => {
      if (!glowRef.current) return;
      const top = scrollEl ? scrollEl.scrollTop : 0;
      // Smoothly fade out as the cover scrolls out of view (over 280px)
      const baseOpacity = 0.55;
      const opacity = Math.max(0, baseOpacity * (1 - top / 280));
      glowRef.current.style.transform = `translate3d(0, ${-top}px, 0)`;
      glowRef.current.style.opacity = `${opacity}`;
    };

    const handleScroll = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(updateGlow);
    };

    // Initialize position immediately
    updateGlow();

    scrollEl?.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      scrollEl?.removeEventListener("scroll", handleScroll);
    };
  }, [mounted, url]);

  if (!mounted || typeof document === "undefined") return null;
  const container = document.getElementById("vessel-glow-root");
  if (!container) return null;

  if (url) {
    return createPortal(
      <div
        ref={glowRef}
        className={className || "page-ambient-glow"}
        style={{ backgroundImage: `url("${url}")` }}
      />,
      container
    );
  }

  return createPortal(
    <div
      ref={glowRef}
      className={fallbackClass || "page-ambient-glow-fallback"}
    />,
    container
  );
}
