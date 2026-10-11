import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";

interface VirtualTrackListProps<T> {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  itemHeight?: number;
  overscan?: number;
  className?: string;
  style?: React.CSSProperties;
  onMouseMove?: (e: React.MouseEvent) => void;
  onMouseUp?: (e: React.MouseEvent) => void;
  onMouseLeave?: (e: React.MouseEvent) => void;
}

function findScrollParent(element: HTMLElement | null): HTMLElement | Window {
  if (!element) return window;
  let parent = element.parentElement;
  while (parent) {
    const style = window.getComputedStyle(parent);
    const overflowY = style.overflowY;
    if (overflowY === "auto" || overflowY === "scroll") {
      return parent;
    }
    parent = parent.parentElement;
  }
  return window;
}

export function VirtualTrackList<T>({
  items,
  renderItem,
  itemHeight = 64,
  overscan = 8,
  className = "tracklist",
  style,
  onMouseMove,
  onMouseUp,
  onMouseLeave,
}: VirtualTrackListProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [range, setRange] = useState<{ start: number; end: number }>({
    start: 0,
    end: Math.min(items.length, 30),
  });

  const totalCount = items.length;

  const updateRange = useCallback(() => {
    if (!containerRef.current || totalCount === 0) return;

    // Для списков до 25 элементов виртуализация не требуется — рендерим всё напрямую
    if (totalCount <= 25) {
      setRange((prev) => {
        if (prev.start === 0 && prev.end === totalCount) return prev;
        return { start: 0, end: totalCount };
      });
      return;
    }

    const container = containerRef.current;
    const scrollParent = findScrollParent(container);

    let scrollTop = 0;
    let viewportHeight = window.innerHeight;
    let containerOffsetTop = 0;

    if (scrollParent === window) {
      scrollTop = window.scrollY || window.pageYOffset;
      viewportHeight = window.innerHeight;
      containerOffsetTop = container.getBoundingClientRect().top + scrollTop;
    } else {
      const parentEl = scrollParent as HTMLElement;
      scrollTop = parentEl.scrollTop;
      viewportHeight = parentEl.clientHeight;
      const parentRect = parentEl.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      containerOffsetTop = containerRect.top - parentRect.top + scrollTop;
    }

    const relativeScroll = Math.max(0, scrollTop - containerOffsetTop);

    const start = Math.max(0, Math.floor(relativeScroll / itemHeight) - overscan);
    const end = Math.min(
      totalCount,
      Math.ceil((relativeScroll + viewportHeight) / itemHeight) + overscan
    );

    setRange((prev) => {
      if (prev.start === start && prev.end === end) return prev;
      return { start, end };
    });
  }, [totalCount, itemHeight, overscan]);

  useEffect(() => {
    updateRange();

    const container = containerRef.current;
    if (!container) return;
    const scrollParent = findScrollParent(container);

    let rafId: number | null = null;
    const onScroll = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        updateRange();
      });
    };

    const target: EventTarget = scrollParent;
    target.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    return () => {
      if (rafId !== null) window.cancelAnimationFrame(rafId);
      target.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [updateRange]);

  const { start, end } = range;
  const safeStart = Math.min(start, totalCount);
  const safeEnd = Math.min(Math.max(end, safeStart), totalCount);

  const paddingTop = safeStart * itemHeight;
  const paddingBottom = Math.max(0, (totalCount - safeEnd) * itemHeight);

  const visibleSlice = useMemo(() => {
    return items.slice(safeStart, safeEnd);
  }, [items, safeStart, safeEnd]);

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        boxSizing: "border-box",
        position: "relative",
        ...style,
      }}
      onMouseMove={onMouseMove}
      onMouseUp={onMouseUp}
      onMouseLeave={onMouseLeave}
    >
      {paddingTop > 0 && (
        <div
          aria-hidden="true"
          style={{ height: `${paddingTop}px`, flexShrink: 0, pointerEvents: "none" }}
        />
      )}
      {visibleSlice.map((item, localIndex) => {
        const absoluteIndex = safeStart + localIndex;
        return renderItem(item, absoluteIndex);
      })}
      {paddingBottom > 0 && (
        <div
          aria-hidden="true"
          style={{ height: `${paddingBottom}px`, flexShrink: 0, pointerEvents: "none" }}
        />
      )}
    </div>
  );
}
