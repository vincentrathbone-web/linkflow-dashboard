import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { PanelLayoutState, WidgetColumn, WidgetId, WidgetPlacement } from '../../types';
import { GripIcon, WidgetShell } from './WidgetShell';
import { WIDGET_ROW_UNIT_PX, WIDGET_MIN_ROWS, WIDGET_MAX_ROWS, clampRows } from './gridConstants';

// Same technique as the link-sort kanban board (src/components/onboarding/SortBoard.tsx):
// a layout snapshot taken once at pointerdown (never re-measured mid-drag), a
// position:fixed overlay transformed via direct DOM writes, velocity-derived
// tilt, and a WAAPI landing tween into a drop-hole placeholder. Written fresh
// here rather than extracted into a shared hook — see the plan notes for why.
const LAND_EASE = 'cubic-bezier(.25,.7,.2,1)';

const WIDGET_TITLE: Record<WidgetId, string> = {
  todo: 'To-Do List',
  timesheet: 'Timesheet',
};

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

function rectOf(rect: DOMRect): Rect {
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
}

interface WidgetDragSession {
  widgetId: WidgetId;
  from: WidgetColumn;
  fromIndex: number;
  target: { column: WidgetColumn; index: number };
  pointerId: number;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  lastAt: number;
  velocityX: number;
  moved: boolean;
  sourceRect: Rect;
  translateX: number;
  translateY: number;
  tilt: number;
  snapshot: {
    columns: Map<WidgetColumn, Rect>;
    widgets: Map<WidgetId, Rect>;
  };
}

interface WidgetGridProps {
  layout: PanelLayoutState;
  onLayoutChange: (next: PanelLayoutState) => void;
  renderWidget: (id: WidgetId) => React.ReactNode;
  children: React.ReactNode;
}

const LEFT_COLUMN_CLASS = 'hidden lg:flex lg:flex-col gap-4 w-72 shrink-0 pt-22 pb-16 pl-4 xl:pl-6';
const RIGHT_COLUMN_CLASS = 'hidden lg:flex lg:flex-col gap-4 w-72 shrink-0 pt-22 pb-16 pr-4 xl:pr-6';

export const WidgetGrid: React.FC<WidgetGridProps> = ({ layout, onLayoutChange, renderWidget, children }) => {
  const [dragView, setDragView] = useState<WidgetDragSession | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [resizingId, setResizingId] = useState<WidgetId | null>(null);

  const columnRefs = useRef(new Map<WidgetColumn, HTMLElement>());
  const widgetRefs = useRef(new Map<WidgetId, HTMLDivElement>());
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<WidgetDragSession | null>(null);
  const levelTimerRef = useRef<number | null>(null);
  const resizingRef = useRef<WidgetId | null>(null);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  const widgetsByColumn = useMemo(() => {
    const result: Record<WidgetColumn, WidgetPlacement[]> = { left: [], right: [] };
    layout.widgets.forEach((w) => result[w.column].push(w));
    (['left', 'right'] as WidgetColumn[]).forEach((c) => result[c].sort((a, b) => a.order - b.order));
    return result;
  }, [layout]);

  const applyOverlayTransform = useCallback(
    (session: WidgetDragSession) => {
      if (!overlayRef.current) return;
      overlayRef.current.style.transform = `translate3d(${session.translateX}px, ${session.translateY}px, 0) rotate(${
        reducedMotion ? 0 : session.tilt
      }deg) scale(1.02)`;
    },
    [reducedMotion],
  );

  const targetAt = useCallback(
    (session: WidgetDragSession, clientX: number, clientY: number) => {
      let targetColumn = session.target.column;
      let nearestDistance = Number.POSITIVE_INFINITY;
      session.snapshot.columns.forEach((rect, column) => {
        const inside = clientX >= rect.left && clientX <= rect.right;
        const distance = inside ? 0 : Math.min(Math.abs(clientX - rect.left), Math.abs(clientX - rect.right));
        if (distance < nearestDistance) {
          nearestDistance = distance;
          targetColumn = column;
        }
      });

      const otherIds = widgetsByColumn[targetColumn].map((w) => w.id).filter((id) => id !== session.widgetId);
      let index = 0;
      for (const id of otherIds) {
        const rect = session.snapshot.widgets.get(id);
        if (!rect) continue;
        if (clientY > rect.top + rect.height / 2) index += 1;
      }
      return { column: targetColumn, index: Math.max(0, Math.min(index, otherIds.length)) };
    },
    [widgetsByColumn],
  );

  const handleGripPointerDown = useCallback(
    (widgetId: WidgetId, column: WidgetColumn, event: React.PointerEvent) => {
      if (event.button !== 0 || dragRef.current || resizingRef.current) return;
      event.preventDefault();
      const source = widgetRefs.current.get(widgetId);
      if (!source) return;

      const sourceRect = rectOf(source.getBoundingClientRect());
      const columnRects = new Map<WidgetColumn, Rect>();
      columnRefs.current.forEach((node, col) => columnRects.set(col, rectOf(node.getBoundingClientRect())));
      const widgetRects = new Map<WidgetId, Rect>();
      widgetRefs.current.forEach((node, id) => widgetRects.set(id, rectOf(node.getBoundingClientRect())));

      const fromIndex = Math.max(0, widgetsByColumn[column].findIndex((w) => w.id === widgetId));

      const session: WidgetDragSession = {
        widgetId,
        from: column,
        fromIndex,
        target: { column, index: fromIndex },
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        lastX: event.clientX,
        lastY: event.clientY,
        lastAt: performance.now(),
        velocityX: 0,
        moved: false,
        sourceRect,
        translateX: 0,
        translateY: 0,
        tilt: 0,
        snapshot: { columns: columnRects, widgets: widgetRects },
      };
      dragRef.current = session;
      setDragView({ ...session });
      requestAnimationFrame(() => applyOverlayTransform(session));
    },
    [applyOverlayTransform, widgetsByColumn],
  );

  useEffect(() => {
    if (!dragView) return;

    const onMove = (event: PointerEvent) => {
      const session = dragRef.current;
      if (!session || event.pointerId !== session.pointerId) return;
      event.preventDefault();

      const now = performance.now();
      const elapsed = Math.max(8, now - session.lastAt);
      const instantVelocity = ((event.clientX - session.lastX) / elapsed) * 1000;
      session.velocityX = session.velocityX * 0.65 + instantVelocity * 0.35;
      session.lastX = event.clientX;
      session.lastY = event.clientY;
      session.lastAt = now;
      session.translateX = event.clientX - session.startX;
      session.translateY = event.clientY - session.startY;
      session.moved ||= Math.hypot(session.translateX, session.translateY) > 4;
      session.tilt = Math.max(-5, Math.min(5, session.velocityX / 170));

      const target = targetAt(session, event.clientX, event.clientY);
      if (target.column !== session.target.column || target.index !== session.target.index) {
        session.target = target;
        setDragView({ ...session });
      }
      applyOverlayTransform(session);

      if (levelTimerRef.current) window.clearTimeout(levelTimerRef.current);
      levelTimerRef.current = window.setTimeout(() => {
        const current = dragRef.current;
        if (!current) return;
        current.tilt = 0;
        if (overlayRef.current) {
          overlayRef.current.style.transition = reducedMotion ? 'none' : 'transform 110ms ease-out';
          applyOverlayTransform(current);
          window.setTimeout(() => {
            if (overlayRef.current) overlayRef.current.style.transition = 'none';
          }, 120);
        }
      }, 70);
    };

    const finish = (event: PointerEvent, cancelled = false) => {
      const session = dragRef.current;
      if (!session || event.pointerId !== session.pointerId) return;
      if (levelTimerRef.current) window.clearTimeout(levelTimerRef.current);

      if (cancelled || !session.moved) {
        dragRef.current = null;
        setDragView(null);
        return;
      }

      const next: WidgetPlacement[] = layout.widgets.map((w) => ({ ...w }));
      const moved = next.find((w) => w.id === session.widgetId);
      if (moved) {
        const destination = next
          .filter((w) => w.column === session.target.column && w.id !== session.widgetId)
          .sort((a, b) => a.order - b.order);
        moved.column = session.target.column;
        destination.splice(session.target.index, 0, moved);
        destination.forEach((w, index) => {
          w.order = index;
        });
        if (session.from !== session.target.column) {
          next
            .filter((w) => w.column === session.from && w.id !== session.widgetId)
            .sort((a, b) => a.order - b.order)
            .forEach((w, index) => {
              w.order = index;
            });
        }
        onLayoutChange({ widgets: next });
      }

      const overlay = overlayRef.current;
      const hole = document.querySelector<HTMLElement>('[data-widget-drop-hole="true"]');
      const targetRect = hole?.getBoundingClientRect();
      const distance = targetRect
        ? Math.hypot(
            targetRect.left - (session.sourceRect.left + session.translateX),
            targetRect.top - (session.sourceRect.top + session.translateY),
          )
        : 0;
      const duration = reducedMotion ? 0 : Math.min(320, 180 + distance / 2.4);
      const targetTransform = targetRect
        ? `translate3d(${targetRect.left - session.sourceRect.left}px, ${targetRect.top - session.sourceRect.top}px, 0) rotate(0deg) scale(1)`
        : `translate3d(${session.translateX}px, ${session.translateY}px, 0) rotate(0deg) scale(1)`;

      const completeLanding = () => {
        dragRef.current = null;
        setDragView(null);
      };
      if (overlay && duration > 0) {
        const animation = overlay.animate(
          [
            { transform: overlay.style.transform, boxShadow: '0 12px 28px rgba(15,23,42,.18)' },
            { transform: targetTransform, boxShadow: '0 1px 2px rgba(15,23,42,.06)' },
          ],
          { duration, easing: LAND_EASE, fill: 'forwards' },
        );
        animation.finished.then(completeLanding).catch(completeLanding);
      } else {
        completeLanding();
      }
    };

    const onUp = (event: PointerEvent) => finish(event);
    const onCancel = (event: PointerEvent) => finish(event, true);
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [applyOverlayTransform, dragView, layout, onLayoutChange, reducedMotion, targetAt]);

  // Height resize is a separate, simpler pointer interaction: no snapshot/hit-testing
  // needed since it only ever affects the one widget being resized. Live height is
  // written directly to the DOM node (no re-render per pixel); the row-unit snap and
  // the single layout-state commit both happen on release.
  const handleResizePointerDown = useCallback(
    (widgetId: WidgetId, event: React.PointerEvent) => {
      if (event.button !== 0 || dragRef.current) return;
      event.preventDefault();
      const node = widgetRefs.current.get(widgetId);
      if (!node) return;

      const startHeight = node.getBoundingClientRect().height;
      const startY = event.clientY;
      const pointerId = event.pointerId;
      resizingRef.current = widgetId;
      setResizingId(widgetId);
      node.style.transition = 'none';
      // WidgetShell's overflow/min-height classes on the inner wrapper and the
      // widget's own root only take effect after release, once heightUnits is
      // committed and React re-renders — set the same styles imperatively here
      // so the live drag preview (before that commit) looks right too. `node`
      // itself must stay overflow:visible (its default) so the resize handle,
      // positioned a few px outside the bottom edge, never becomes scrollable
      // content and forces a permanent scrollbar.
      const innerWrapper = node.firstElementChild as HTMLElement | null;
      if (innerWrapper) {
        innerWrapper.style.overflowY = 'auto';
        const content = innerWrapper.firstElementChild as HTMLElement | null;
        if (content) content.style.minHeight = '100%';
      }

      const onMove = (moveEvent: PointerEvent) => {
        if (moveEvent.pointerId !== pointerId) return;
        const raw = startHeight + (moveEvent.clientY - startY);
        const clamped = Math.min(WIDGET_MAX_ROWS * WIDGET_ROW_UNIT_PX, Math.max(WIDGET_MIN_ROWS * WIDGET_ROW_UNIT_PX, raw));
        node.style.height = `${clamped}px`;
      };

      const onUp = (upEvent: PointerEvent) => {
        if (upEvent.pointerId !== pointerId) return;
        window.removeEventListener('pointermove', onMove);
        window.removeEventListener('pointerup', onUp);
        window.removeEventListener('pointercancel', onUp);
        resizingRef.current = null;
        setResizingId(null);

        const finalHeight = node.getBoundingClientRect().height;
        const snappedRows = clampRows(Math.round(finalHeight / WIDGET_ROW_UNIT_PX));
        node.style.transition = reducedMotion ? 'none' : 'height 150ms ease';
        node.style.height = `${snappedRows * WIDGET_ROW_UNIT_PX}px`;
        window.setTimeout(() => {
          node.style.transition = 'none';
        }, 170);

        const next = layout.widgets.map((w) => (w.id === widgetId ? { ...w, heightUnits: snappedRows } : w));
        onLayoutChange({ widgets: next });
      };

      window.addEventListener('pointermove', onMove, { passive: false });
      window.addEventListener('pointerup', onUp);
      window.addEventListener('pointercancel', onUp);
    },
    [layout, onLayoutChange, reducedMotion],
  );

  const renderColumn = (column: WidgetColumn, className: string) => {
    const items = widgetsByColumn[column].filter((w) => w.id !== dragView?.widgetId);
    const holeAt = dragView?.target.column === column ? dragView.target.index : null;
    const holeHeight = dragView?.sourceRect.height ?? 120;

    const hole = (key: string) => (
      <div
        key={key}
        data-widget-drop-hole="true"
        className="rounded-xl border-[1.5px] border-dashed border-border-focus bg-brand-subtle"
        style={{ height: holeHeight }}
      />
    );

    return (
      <aside
        ref={(node) => {
          if (node) columnRefs.current.set(column, node);
          else columnRefs.current.delete(column);
        }}
        className={className}
      >
        {items.flatMap((widget, index) => {
          const nodes: React.ReactNode[] = [];
          if (holeAt === index) nodes.push(hole(`hole-${column}-${index}`));
          nodes.push(
            <WidgetShell
              key={widget.id}
              setRef={(node) => {
                if (node) widgetRefs.current.set(widget.id, node);
                else widgetRefs.current.delete(widget.id);
              }}
              heightUnits={widget.heightUnits}
              isResizing={resizingId === widget.id}
              onGripPointerDown={(e) => handleGripPointerDown(widget.id, column, e)}
              onResizePointerDown={(e) => handleResizePointerDown(widget.id, e)}
            >
              {renderWidget(widget.id)}
            </WidgetShell>,
          );
          return nodes;
        })}
        {holeAt === items.length && hole(`hole-${column}-end`)}
      </aside>
    );
  };

  return (
    <>
      {renderColumn('left', LEFT_COLUMN_CLASS)}
      {children}
      {renderColumn('right', RIGHT_COLUMN_CLASS)}

      {dragView && (
        <div
          ref={overlayRef}
          aria-hidden="true"
          style={{
            position: 'fixed',
            zIndex: 900,
            pointerEvents: 'none',
            left: dragView.sourceRect.left,
            top: dragView.sourceRect.top,
            width: dragView.sourceRect.width,
            height: dragView.sourceRect.height,
            transformOrigin: '50% 50%',
            willChange: 'transform',
          }}
        >
          <div className="glass-card rounded-xl h-full w-full flex items-center gap-2.5 px-4">
            <GripIcon />
            <span className="font-heading text-sm font-bold text-text-main">{WIDGET_TITLE[dragView.widgetId]}</span>
          </div>
        </div>
      )}
    </>
  );
};
