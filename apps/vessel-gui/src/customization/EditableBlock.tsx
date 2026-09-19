import React, { useRef, useEffect, useState } from "react";
import { useCustomization, type BlockWidth } from "./CustomizationContext";

interface EditableBlockProps {
  id: string;
  title: string;
  children: React.ReactNode;
  allowGridResize?: boolean;
  allowMove?: boolean;
}

const WIDTH_OPTIONS: { key: BlockWidth; label: string }[] = [
  { key: "third", label: "1/3" },
  { key: "half", label: "1/2" },
  { key: "two-thirds", label: "2/3" },
  { key: "full", label: "100%" },
];

export function EditableBlock({
  id,
  title,
  children,
  allowGridResize = false,
  allowMove = true,
}: EditableBlockProps) {
  const {
    isEditMode,
    config,
    reorderBlocks,
    toggleBlockVisibility,
    setBlockGridColumns,
    setBlockWidth,
  } = useCustomization();

  const [isDragging, setIsDragging] = useState(false);
  const [isDropTarget, setIsDropTarget] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  const isHidden = (config.home?.hiddenBlocks || []).includes(id);
  const gridCols = config.home?.gridColumns?.[id] || 4;
  const currentWidth: BlockWidth = config.home?.blockWidths?.[id] || "full";

  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        if (isSettingsOpen) setIsSettingsOpen(false);
      }
    }
    if (isSettingsOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isSettingsOpen]);

  // Listen for global drag hover events across blocks
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail && detail.targetId === id && detail.sourceId !== id) {
        setIsDropTarget(true);
      } else {
        setIsDropTarget(false);
      }
    };
    window.addEventListener("vessel-block-drag-hover", handler);
    return () => window.removeEventListener("vessel-block-drag-hover", handler);
  }, [id]);

  if (isHidden && !isEditMode) {
    return null;
  }

  if (!isEditMode) {
    return (
      <div className="home-block-wrapper" data-width={currentWidth}>
        {children}
      </div>
    );
  }

  // Pointer events drag and drop for reliable WebView2 / mouse dragging
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!allowMove) return;
    const target = e.target as HTMLElement;
    if (target.closest("button, input, select, .width-chip, .editable-block-popover")) {
      return;
    }

    e.preventDefault();
    const handleEl = e.currentTarget;
    handleEl.setPointerCapture(e.pointerId);
    setIsDragging(true);
    document.body.classList.add("vessel-block-dragging");

    const onPointerMove = (ev: PointerEvent) => {
      ev.preventDefault();
      const elements = document.elementsFromPoint(ev.clientX, ev.clientY);
      const targetWrapper = elements.find(
        (el) => el.hasAttribute("data-block-id") && el.getAttribute("data-block-id") !== id
      );
      const targetId = targetWrapper ? targetWrapper.getAttribute("data-block-id") : null;

      window.dispatchEvent(
        new CustomEvent("vessel-block-drag-hover", {
          detail: { targetId, sourceId: id },
        })
      );
    };

    const onPointerUp = (ev: PointerEvent) => {
      try {
        handleEl.releasePointerCapture(ev.pointerId);
      } catch {}
      handleEl.removeEventListener("pointermove", onPointerMove);
      handleEl.removeEventListener("pointerup", onPointerUp);
      setIsDragging(false);
      document.body.classList.remove("vessel-block-dragging");

      const elements = document.elementsFromPoint(ev.clientX, ev.clientY);
      const targetWrapper = elements.find(
        (el) => el.hasAttribute("data-block-id") && el.getAttribute("data-block-id") !== id
      );
      const targetId = targetWrapper ? targetWrapper.getAttribute("data-block-id") : null;

      window.dispatchEvent(
        new CustomEvent("vessel-block-drag-hover", {
          detail: { targetId: null, sourceId: null },
        })
      );

      if (targetId && targetId !== id) {
        reorderBlocks(id, targetId);
      }
    };

    handleEl.addEventListener("pointermove", onPointerMove);
    handleEl.addEventListener("pointerup", onPointerUp);
  };

  return (
    <div
      className={`editable-block-wrapper ${isHidden ? "hidden-block" : ""} ${
        isDragging ? "is-dragging" : ""
      } ${isDropTarget ? "is-drag-over" : ""}`}
      data-block-id={id}
      data-width={currentWidth}
    >
      {isDropTarget && <div className="block-drop-line-indicator" />}

      <div className="editable-block-outline">
        <div
          className="editable-block-bar top-bar"
          onPointerDown={handlePointerDown}
          title="Зажмите и перетащите мышкой для смены порядка блоков"
        >
          <span className="editable-block-title">
            <span className="editable-block-drag-icon">⠿</span>
            {title} {isHidden && <span className="block-hidden-tag">(Скрыто)</span>}
          </span>

          {/* Width Selector Chips */}
          <div className="editable-block-widths" onClick={(e) => e.stopPropagation()}>
            {WIDTH_OPTIONS.map((opt) => (
              <button
                key={opt.key}
                type="button"
                className={`width-chip ${currentWidth === opt.key ? "active" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setBlockWidth(id, opt.key);
                }}
                title={`Ширина блока: ${opt.label}`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <div className="editable-block-tools" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              className={`editable-tool-btn ${isSettingsOpen ? "active" : ""}`}
              title="Настройки сетки секции"
              onClick={(e) => {
                e.stopPropagation();
                setIsSettingsOpen(!isSettingsOpen);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>

            <button
              type="button"
              className="editable-tool-btn"
              title={isHidden ? "Показать блок" : "Скрыть блок"}
              onClick={(e) => {
                e.stopPropagation();
                toggleBlockVisibility(id);
              }}
            >
              {isHidden ? (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                  <circle cx="12" cy="12" r="3" />
                </svg>
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                  <line x1="1" y1="1" x2="23" y2="23" />
                </svg>
              )}
            </button>
          </div>

          {isSettingsOpen && (
            <div className="editable-block-popover" ref={popoverRef} onClick={(e) => e.stopPropagation()}>
              <div className="popover-title">Настройки секции</div>

              {allowGridResize && (
                <div className="popover-row">
                  <div className="popover-label">Колонок в карточках ({gridCols}):</div>
                  <input
                    type="range"
                    min="1"
                    max="6"
                    step="1"
                    value={gridCols}
                    onChange={(e) => setBlockGridColumns(id, parseInt(e.target.value, 10))}
                    className="popover-slider"
                  />
                  <div className="popover-slider-ticks">
                    <span>1</span>
                    <span>2</span>
                    <span>3</span>
                    <span>4</span>
                    <span>5</span>
                    <span>6</span>
                  </div>
                </div>
              )}

              <div className="popover-actions">
                <button
                  type="button"
                  className="popover-action-btn"
                  onClick={() => toggleBlockVisibility(id)}
                >
                  {isHidden ? "Показать этот блок" : "Скрыть этот блок"}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="editable-block-content">
          {children}
        </div>
      </div>
    </div>
  );
}
