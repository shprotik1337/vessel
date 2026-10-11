import { useState, useEffect, useRef, useCallback } from "react";

export function formatDuration(ms: number | null): string {
  if (!ms || ms <= 0) return "--:--";
  const sec = Math.floor(ms / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${s < 10 ? "0" : ""}${s}`;
}

export function getProviderLabel(kind: string): string {
  switch (kind) {
    case "spotify":
      return "Spotify";
    case "soundcloud":
      return "SoundCloud";
    case "yandex":
    case "yandex_music":
      return "Yandex Music";
    case "youtube_music":
    case "you_tube_music":
      return "YouTube Music";
    case "deezer":
      return "Deezer";
    default:
      return kind;
  }
}

export const globalArtistAvatars: Record<string, string> = {};

export function ScrollableCardRow({
  children,
  className = "home-cards-scroll-row",
  onNearEnd,
  hasMore = true,
}: {
  children: React.ReactNode;
  className?: string;
  onNearEnd?: () => void;
  hasMore?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);
  const isFetchingRef = useRef(false);

  const updateArrowVisibility = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setCanScrollLeft(el.scrollLeft > 15);
    const atEnd = el.scrollLeft + el.clientWidth >= el.scrollWidth - 20;
    setCanScrollRight(!atEnd || (hasMore && !!onNearEnd));
  }, [hasMore, onNearEnd]);

  useEffect(() => {
    updateArrowVisibility();
    const t1 = setTimeout(updateArrowVisibility, 100);
    const t2 = setTimeout(updateArrowVisibility, 400);
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(() => updateArrowVisibility());
    observer.observe(el);
    const mutObserver = new MutationObserver(() => updateArrowVisibility());
    mutObserver.observe(el, { childList: true, subtree: true });
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      observer.disconnect();
      mutObserver.disconnect();
    };
  }, [children, updateArrowVisibility]);

  const handleScroll = () => {
    const el = containerRef.current;
    if (!el) return;
    updateArrowVisibility();

    if (
      onNearEnd &&
      hasMore &&
      !isFetchingRef.current &&
      el.scrollLeft >= 50 &&
      el.scrollLeft + el.clientWidth >= el.scrollWidth - 50
    ) {
      isFetchingRef.current = true;
      onNearEnd();
      setTimeout(() => {
        isFetchingRef.current = false;
      }, 1000);
    }
  };

  const handleSideScroll = (direction: "left" | "right") => {
    const el = containerRef.current;
    if (!el) return;
    const isExplore = className?.includes("home-explore-row");
    // For explore rows (3 cards), advance exactly 1 full viewport page (3 cards)
    const scrollAmount = isExplore
      ? el.clientWidth + 14
      : Math.max(el.clientWidth * 0.75, 260);

    if (direction === "left") {
      el.scrollBy({ left: -scrollAmount, behavior: "smooth" });
      return;
    }

    const currentScroll = el.scrollLeft;
    const maxScroll = Math.max(0, el.scrollWidth - el.clientWidth);
    el.scrollBy({ left: scrollAmount, behavior: "smooth" });

    if (onNearEnd && hasMore && !isFetchingRef.current) {
      if (currentScroll + scrollAmount >= maxScroll - 40 || maxScroll <= 20) {
        isFetchingRef.current = true;
        onNearEnd();
        setTimeout(() => {
          isFetchingRef.current = false;
        }, 1000);
      }
    }
  };

  return (
    <div className="home-row-wrapper">
      {canScrollLeft && (
        <button
          type="button"
          className="home-side-arrow left"
          onClick={() => handleSideScroll("left")}
          aria-label="Previous"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
      )}

      <div
        ref={containerRef}
        className={className}
        onScroll={handleScroll}
      >
        {children}
      </div>

      {canScrollRight && (
        <button
          type="button"
          className="home-side-arrow right"
          onClick={() => handleSideScroll("right")}
          aria-label="Next"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="9 18 15 12 9 6" />
          </svg>
        </button>
      )}
    </div>
  );
}
