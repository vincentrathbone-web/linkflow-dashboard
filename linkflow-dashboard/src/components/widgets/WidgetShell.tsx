import React from 'react';
import { WIDGET_ROW_UNIT_PX } from './gridConstants';

export const GripIcon: React.FC = () => (
  <svg viewBox="0 0 16 16" width="14" height="14" fill="currentColor">
    <circle cx="5" cy="3" r="1.3" />
    <circle cx="11" cy="3" r="1.3" />
    <circle cx="5" cy="8" r="1.3" />
    <circle cx="11" cy="8" r="1.3" />
    <circle cx="5" cy="13" r="1.3" />
    <circle cx="11" cy="13" r="1.3" />
  </svg>
);

interface WidgetShellProps {
  children: React.ReactNode;
  heightUnits: number | null;
  isResizing: boolean;
  onGripPointerDown: (event: React.PointerEvent) => void;
  onResizePointerDown: (event: React.PointerEvent) => void;
  setRef: (node: HTMLDivElement | null) => void;
}

/** Wraps a widget's own rendered content (TodoPanel/TimesheetPanel, untouched
 * internally) with the drag grip and resize handle chrome. When heightUnits is
 * set, the OUTER element gets the fixed height, but overflow/scroll lives on a
 * separate INNER wrapper around just `children` — not on the outer element
 * itself. The resize handle is deliberately positioned a few px outside the
 * card's bottom edge (so it reads as a handle on the border, not inside the
 * content); if overflow:auto were on the same box as that handle, the handle's
 * own overflow would count as scrollable content and force a permanent
 * scrollbar even when the widget's actual content doesn't need one. The widget's
 * own root element (its `glass-card`) also sizes to its content by default, so
 * it's stretched to fill the inner wrapper via `min-h-full` on the direct child
 * — otherwise a widget resized taller than its content just grows the
 * (transparent) wrapper while the actual card stays its natural shorter height. */
export const WidgetShell: React.FC<WidgetShellProps> = ({
  children,
  heightUnits,
  isResizing,
  onGripPointerDown,
  onResizePointerDown,
  setRef,
}) => {
  const heightPx = heightUnits !== null ? heightUnits * WIDGET_ROW_UNIT_PX : undefined;
  const fixedHeight = heightPx !== undefined;

  return (
    <div ref={setRef} className="group relative" style={{ height: heightPx }}>
      <div className={`h-full ${fixedHeight ? 'overflow-y-auto [&>:first-child]:min-h-full' : ''}`}>{children}</div>

      <button
        type="button"
        onPointerDown={onGripPointerDown}
        aria-label="Drag to move this widget"
        title="Drag to move"
        className="absolute top-2 right-2 p-1 rounded-md text-text-subtle bg-surface/70 opacity-0 group-hover:opacity-100 hover:text-text-main hover:bg-surface-hover transition-opacity cursor-grab active:cursor-grabbing"
        style={{ touchAction: 'none' }}
      >
        <GripIcon />
      </button>

      <div
        onPointerDown={onResizePointerDown}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Drag to resize this widget's height"
        title="Drag to resize"
        className={`absolute left-1/2 -translate-x-1/2 -bottom-1.5 w-10 h-3 flex items-center justify-center cursor-ns-resize opacity-0 group-hover:opacity-100 transition-opacity ${
          isResizing ? 'opacity-100' : ''
        }`}
        style={{ touchAction: 'none' }}
      >
        <div className="w-8 h-1 rounded-full bg-border-main" />
      </div>
    </div>
  );
};
