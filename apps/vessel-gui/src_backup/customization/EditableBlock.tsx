import React, { useRef, useState, createContext, useContext } from "react";
import {
  useCustomization,
  type BlockWidth,
  type BlockAlign,
  setGlobalDraggingPanelId,
  setGlobalDragStartX,
} from "./CustomizationContext";

export const BlockWidthContext = createContext<BlockWidth>("full");
export const useBlockWidth = () => useContext(BlockWidthContext);

interface EditableBlockProps {
  id: string;
  title: string;
  children: React.ReactNode;
  allowGridResize?: boolean;
  allowMove?: boolean;
  onHeightChange?: (id: string, height: number) => void;
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
  allowMove: _allowMove = true,
}: EditableBlockProps) {
  const {
    isEditMode,
    config,
    setBlockWidth,
    setBlockAlign,
    toggleBlockVisibility,
    deleteBlock,
    setBlockCanvasPos,
  } = useCustomization();

  const [resizingWidth, setResizingWidth] = useState<BlockWidth | null>(null);

  const blockRef = useRef<HTMLDivElement>(null);

  const isHidden = (config.home?.hiddenBlocks || []).includes(id);
  const currentWidth: BlockWidth = resizingWidth || config.home?.blockWidths?.[id] || "full";
  const currentAlign: BlockAlign = config.home?.blockAligns?.[id] || "left";

  const currentSectionIndex = (config.home?.rows || []).findIndex((r) => r.includes(id));
  const isFreeLayout = config.home?.freeLayoutSections?.includes(currentSectionIndex) ?? false;
  const canvasPos = config.home?.canvasPositions?.[id];

  const transformStyle: React.CSSProperties = isFreeLayout && canvasPos?.offsetX ? {
    transform: `translateX(${canvasPos.offsetX}px)`,
    position: 'relative',
    zIndex: 2,
  } : {};

  // Horizontal resizing handle
  const onResizeHandlePointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const handleEl = e.currentTarget as HTMLElement;
    handleEl.setPointerCapture(e.pointerId);

    const blockEl = blockRef.current;
    const parentRow = blockEl?.parentElement;
    const parentW = parentRow?.getBoundingClientRect().width || window.innerWidth;
    const blockStartLeft = blockEl?.getBoundingClientRect().left || 0;

    const onPointerMove = (ev: PointerEvent) => {
      const currentPointerX = ev.clientX;
      const effectiveW = currentPointerX - blockStartLeft;
      const ratio = effectiveW / parentW;

      let nextPreset: BlockWidth = "full";
      if (ratio < 0.40) nextPreset = "third";
      else if (ratio < 0.58) nextPreset = "half";
      else if (ratio < 0.80) nextPreset = "two-thirds";
      else nextPreset = "full";

      setResizingWidth(nextPreset);
    };

    const onPointerUp = (ev: PointerEvent) => {
      try {
        handleEl.releasePointerCapture(ev.pointerId);
      } catch {}
      handleEl.removeEventListener("pointermove", onPointerMove);
      handleEl.removeEventListener("pointerup", onPointerUp);

      const effectiveW = ev.clientX - blockStartLeft;
      const ratio = effectiveW / parentW;

      let nextPreset: BlockWidth = "full";
      if (ratio < 0.40) nextPreset = "third";
      else if (ratio < 0.58) nextPreset = "half";
      else if (ratio < 0.80) nextPreset = "two-thirds";
      else nextPreset = "full";

      setResizingWidth(null);
      setBlockWidth(id, nextPreset);
    };

    handleEl.addEventListener("pointermove", onPointerMove);
    handleEl.addEventListener("pointerup", onPointerUp);
  };


  const onFreeHorizontalPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest(".editable-block-widths, .editable-block-tools, button, .editable-block-drag-icon")) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();

    const startX = e.clientX;
    const initialOffset = canvasPos?.offsetX || 0;
    const blockEl = blockRef.current;

    const onPointerMove = (ev: PointerEvent) => {
      const delta = ev.clientX - startX;
      const newOffset = initialOffset + delta;
      if (blockEl) {
        blockEl.style.transform = `translateX(${newOffset}px)`;
        blockEl.style.position = "relative";
        blockEl.style.zIndex = "10";
      }
    };

    const onPointerUp = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      const delta = ev.clientX - startX;
      const newOffset = Math.round(initialOffset + delta);
      setBlockCanvasPos(id, { offsetX: newOffset });
    };

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  };

  if (isHidden && !isEditMode) {
    return null;
  }

  if (!isEditMode) {
    return (
      <div
        ref={blockRef}
        className={`home-block-wrapper ${isFreeLayout ? "free-layout-item" : ""}`}
        data-block-id={id}
        data-width={currentWidth}
        data-align={currentAlign}
        style={transformStyle}
      >
        <BlockWidthContext.Provider value={currentWidth}>
          {children}
        </BlockWidthContext.Provider>
      </div>
    );
  }

  return (
    <div
      ref={blockRef}
      className={`editable-block-wrapper ${isHidden ? "hidden-block" : ""} ${isFreeLayout ? "free-layout-item" : ""}`}
      data-block-id={id}
      data-width={currentWidth}
      data-align={currentAlign}
      style={transformStyle}
    >
      <div className="editable-block-outline">
        <div
          className={`editable-block-bar top-bar ${isFreeLayout ? "free-drag-active" : ""}`}
          draggable={!isFreeLayout}
          onPointerDown={isFreeLayout ? onFreeHorizontalPointerDown : undefined}
          onDragStart={!isFreeLayout ? (e) => {
            setGlobalDraggingPanelId(id);
            setGlobalDragStartX(e.clientX);
            try {
              e.dataTransfer.setData("text/plain", id);
              e.dataTransfer.setData("application/vessel-panel", id);
            } catch {}
            e.dataTransfer.effectAllowed = "move";
            document.body.classList.add("vessel-block-dragging");
          } : undefined}
          onDragEnd={!isFreeLayout ? () => {
            setGlobalDraggingPanelId(null);
            setGlobalDragStartX(null);
            document.body.classList.remove("vessel-block-dragging");
          } : undefined}
          title={isFreeLayout ? "Зажмите мышь на плашке и двигайте влево/вправо для изменения отступа" : "Зажмите мышкой для перемещения панели"}
        >
          <div className="editable-block-title">
            <span
              className="editable-block-drag-icon"
              draggable={true}
              onDragStart={(e) => {
                e.stopPropagation();
                setGlobalDraggingPanelId(id);
                setGlobalDragStartX(e.clientX);
                try {
                  e.dataTransfer.setData("text/plain", id);
                  e.dataTransfer.setData("application/vessel-panel", id);
                } catch {}
                e.dataTransfer.effectAllowed = "move";
                document.body.classList.add("vessel-block-dragging");
              }}
              onDragEnd={() => {
                setGlobalDraggingPanelId(null);
                setGlobalDragStartX(null);
                document.body.classList.remove("vessel-block-dragging");
              }}
              title="Перетащить панель в другую секцию"
            >
              ⠿
            </span>
            <span className="editable-block-name">{title}</span>
            {isHidden && <span className="block-hidden-tag">(Скрыто)</span>}
          </div>


          {/* Width Selector Chips */}
          <div
            className="editable-block-widths"
            onClick={(e) => e.stopPropagation()}
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
          >
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
                draggable={false}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Alignment Selector Chips (when not full width) */}
          {currentWidth !== "full" && (
            <div
              className="editable-block-aligns"
              onClick={(e) => e.stopPropagation()}
              draggable={false}
              onDragStart={(e) => e.preventDefault()}
            >
              <button
                type="button"
                className={`align-chip ${currentAlign === "left" ? "active" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setBlockAlign(id, "left");
                }}
                title="Выровнять по левому краю"
                draggable={false}
              >
                ◧
              </button>
              <button
                type="button"
                className={`align-chip ${currentAlign === "center" ? "active" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setBlockAlign(id, "center");
                }}
                title="Выровнять по центру"
                draggable={false}
              >
                ▥
              </button>
              <button
                type="button"
                className={`align-chip ${currentAlign === "right" ? "active" : ""}`}
                onClick={(e) => {
                  e.stopPropagation();
                  setBlockAlign(id, "right");
                }}
                title="Выровнять по правому краю"
                draggable={false}
              >
                ◨
              </button>
            </div>
          )}

          {/* Tools: Hide, Delete */}
          <div
            className="editable-block-tools"
            onClick={(e) => e.stopPropagation()}
            draggable={false}
            onDragStart={(e) => e.preventDefault()}
          >
            <button
              type="button"
              className="editable-tool-btn"
              title={isHidden ? "Показать блок" : "Скрыть блок"}
              onClick={(e) => {
                e.stopPropagation();
                toggleBlockVisibility(id);
              }}
              draggable={false}
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

            <button
              type="button"
              className="editable-tool-btn danger"
              title="Удалить этот блок с Главной страницы"
              onClick={(e) => {
                e.stopPropagation();
                deleteBlock(id);
              }}
              draggable={false}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polyline points="3 6 5 6 21 6" />
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
              </svg>
            </button>
          </div>
        </div>

        {/* The Section Content */}
        <div className="editable-block-content">
          <BlockWidthContext.Provider value={currentWidth}>
            {children}
          </BlockWidthContext.Provider>
        </div>

          {allowGridResize && (
            <div
              className="editable-block-resize-handle right"
              onPointerDown={onResizeHandlePointerDown}
              draggable={false}
              title="Потяните, чтобы изменить ширину панели"
            >
              <div className="resize-handle-line"></div>
            </div>
          )}
        </div>
      </div>
    );
  }
