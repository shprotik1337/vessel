import { useRef, useEffect } from "react";
import { useCustomization } from "./CustomizationContext";

interface EditableBlockProps {
  id: string;
  title: string;
  children: React.ReactNode;
  allowGridResize?: boolean;
  allowMove?: boolean;
}

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
    moveBlock,
    toggleBlockVisibility,
    setBlockGridColumns,
    activeBlockSettings,
    setActiveBlockSettings,
  } = useCustomization();

  const isSettingsOpen = activeBlockSettings === id;
  const isHidden = config.home.hiddenBlocks.includes(id);
  const gridCols = config.home.gridColumns[id] || 4;

  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        if (isSettingsOpen) setActiveBlockSettings(null);
      }
    }
    if (isSettingsOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [isSettingsOpen, setActiveBlockSettings]);

  if (isHidden && !isEditMode) {
    return null;
  }

  if (!isEditMode) {
    return <>{children}</>;
  }

  return (
    <div className={`editable-block-wrapper ${isHidden ? "hidden-block" : ""}`}>
      <div className="editable-block-outline">
        <div className="editable-block-bar top-bar">
          <span className="editable-block-title">
            <span className="editable-block-drag-icon">??</span>
            {title} {isHidden && <span className="block-hidden-tag">(?????)</span>}
          </span>

          <div className="editable-block-tools">
            {allowMove && (
              <div className="move-btn-group">
                <button
                  className="editable-tool-btn"
                  title="??????????? ????"
                  onClick={(e) => {
                    e.stopPropagation();
                    moveBlock(id, "up");
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="18 15 12 9 6 15" />
                  </svg>
                  Move ?
                </button>
                <button
                  className="editable-tool-btn"
                  title="??????????? ????"
                  onClick={(e) => {
                    e.stopPropagation();
                    moveBlock(id, "down");
                  }}
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                  Move ?
                </button>
              </div>
            )}

            <button
              className={`editable-tool-btn ${isSettingsOpen ? "active" : ""}`}
              title="????????? ?????"
              onClick={(e) => {
                e.stopPropagation();
                setActiveBlockSettings(isSettingsOpen ? null : id);
              }}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>

            <button
              className="editable-tool-btn"
              title={isHidden ? "???????? ????" : "?????? ????"}
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
              <div className="popover-title">????????? ??????</div>

              {allowGridResize && (
                <div className="popover-row">
                  <div className="popover-label">?????? ????? ({gridCols}):</div>
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
                  className="popover-action-btn"
                  onClick={() => toggleBlockVisibility(id)}
                >
                  {isHidden ? "???????? ???? ????" : "?????? ???? ????"}
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
