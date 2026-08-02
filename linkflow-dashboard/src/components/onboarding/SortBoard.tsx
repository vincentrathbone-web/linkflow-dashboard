import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, GripVertical, Plus, Trash2, X } from 'lucide-react';
import { LinkItem, LinkSection } from '../../types';
import { WizardLinkDraft } from '../../lib/parseBulkLinks';

const LAND_EASE = 'cubic-bezier(.25,.7,.2,1)';
const UNSORTED_SECTION_ID = 'unsorted';
const COLUMN_DROP_HOLE_ID = '__column_drop_hole__' as const;

interface WizardSectionDraft {
  id: string;
  name: string;
  icon: string;
  color: string;
  tint: string;
  border: string;
}

const PALETTE: Omit<WizardSectionDraft, 'id' | 'name' | 'icon'>[] = [
  { color: '#2563eb', tint: '#eff6ff', border: '#bfdbfe' },
  { color: '#7c3aed', tint: '#f5f3ff', border: '#ddd6fe' },
  { color: '#d97706', tint: '#fffbeb', border: '#fde68a' },
  { color: '#0d9488', tint: '#f0fdfa', border: '#99f6e4' },
  { color: '#db2777', tint: '#fdf2f8', border: '#fbcfe8' },
  { color: '#4f46e5', tint: '#eef2ff', border: '#c7d2fe' },
];

function paletteFor(index: number) {
  return PALETTE[index % PALETTE.length];
}

interface Rect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

interface LayoutSnapshot {
  board: Rect;
  scrollLeft: number;
  columns: Map<string, Rect>;
  cards: Map<string, Rect>;
}

interface DragSession {
  link: WizardLinkDraft;
  from: string;
  fromIndex: number;
  target: { sectionId: string; index: number };
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
  snapshot: LayoutSnapshot;
}

interface ColumnDragSession {
  sectionId: string;
  fromIndex: number;
  targetIndex: number;
  pointerId: number;
  startX: number;
  lastX: number;
  lastAt: number;
  velocityX: number;
  moved: boolean;
  sourceRect: Rect;
  translateX: number;
  tilt: number;
  columnOrder: string[];
  columnRects: Map<string, Rect>;
}

function rectOf(rect: DOMRect): Rect {
  return { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width, height: rect.height };
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function LinkCard({
  link,
  lifted = false,
  onPointerDown,
  setRef,
}: {
  link: WizardLinkDraft;
  lifted?: boolean;
  onPointerDown?: (event: React.PointerEvent<HTMLDivElement>) => void;
  setRef?: (node: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={setRef}
      data-link-card={link.id}
      onPointerDown={onPointerDown}
      style={{
        width: '100%',
        padding: 12,
        borderRadius: 12,
        border: `1px solid ${lifted ? '#93c5fd' : 'var(--border-subtle)'}`,
        background: 'var(--bg-surface)',
        boxShadow: lifted ? '0 12px 28px rgba(15,23,42,.18)' : '0 1px 2px rgba(15,23,42,.06)',
        cursor: lifted ? 'grabbing' : 'grab',
        userSelect: 'none',
        touchAction: 'none',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
      }}
    >
      <div className="grid size-[30px] shrink-0 place-items-center rounded-[9px] bg-surface-subtle text-brand-text">
        <span className="material-symbols-outlined text-base">link</span>
      </div>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[12.5px] font-semibold text-text-main">{link.name}</div>
        <div className="overflow-hidden text-ellipsis whitespace-nowrap text-[10.5px] text-text-subtle">{hostnameOf(link.url)}</div>
      </div>
      <GripVertical size={14} className="shrink-0 text-text-subtle" />
    </div>
  );
}

export function SortBoard({
  initialLinks,
  existingSections = [],
  onDone,
  onCancel,
  title = 'Sort your links into sections',
  subtitle = 'Drag cards from Unsorted into a section, or create new sections.',
  doneLabel = 'Finish setup',
}: {
  initialLinks: WizardLinkDraft[];
  existingSections?: LinkSection[];
  /** orderedSectionIds is every non-"Unsorted" section id (new and existing), in final drag order. */
  onDone: (sections: LinkSection[], links: LinkItem[], orderedSectionIds: string[]) => void;
  onCancel?: () => void;
  title?: string;
  subtitle?: string;
  doneLabel?: string;
}) {
  const [sections, setSections] = useState<WizardSectionDraft[]>(() => [
    { id: UNSORTED_SECTION_ID, name: 'Unsorted', icon: 'inbox', color: '#64748b', tint: 'var(--bg-surface-subtle)', border: 'var(--border-subtle)' },
    ...existingSections
      .slice()
      .sort((a, b) => a.order - b.order)
      .map((section, index) => ({ id: section.id, name: section.name, icon: section.icon, ...paletteFor(index) })),
  ]);
  const [links, setLinks] = useState<WizardLinkDraft[]>(initialLinks);
  const [dragView, setDragView] = useState<DragSession | null>(null);
  const [columnDragView, setColumnDragView] = useState<ColumnDragSession | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionName, setNewSectionName] = useState('');

  const boardRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLDivElement | null>(null);
  const columnOverlayRef = useRef<HTMLDivElement | null>(null);
  const columnRefs = useRef(new Map<string, HTMLElement>());
  const cardRefs = useRef(new Map<string, HTMLDivElement>());
  const dragRef = useRef<DragSession | null>(null);
  const columnDragRef = useRef<ColumnDragSession | null>(null);
  const levelTimerRef = useRef<number | null>(null);
  const columnLevelTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const sync = () => setReducedMotion(media.matches);
    sync();
    media.addEventListener('change', sync);
    return () => media.removeEventListener('change', sync);
  }, []);

  const grouped = useMemo(() => {
    const result: Record<string, WizardLinkDraft[]> = {};
    sections.forEach((s) => (result[s.id] = []));
    links.forEach((link) => {
      (result[link.sectionId] ??= []).push(link);
    });
    Object.keys(result).forEach((id) => result[id].sort((a, b) => a.order - b.order));
    return result;
  }, [links, sections]);

  const addSection = useCallback(() => {
    const name = newSectionName.trim();
    if (!name) {
      setAddingSection(false);
      return;
    }
    setSections((prev) => [...prev, { id: `section-${Date.now()}`, name, icon: 'folder', ...paletteFor(prev.length - 1) }]);
    setNewSectionName('');
    setAddingSection(false);
  }, [newSectionName]);

  const removeSection = useCallback((sectionId: string) => {
    if (sectionId === UNSORTED_SECTION_ID) return;
    setLinks((prev) => prev.map((link) => (link.sectionId === sectionId ? { ...link, sectionId: UNSORTED_SECTION_ID } : link)));
    setSections((prev) => prev.filter((s) => s.id !== sectionId));
  }, []);

  const applyOverlayTransform = useCallback(
    (session: DragSession) => {
      if (!overlayRef.current) return;
      overlayRef.current.style.transform = `translate3d(${session.translateX}px, ${session.translateY}px, 0) rotate(${reducedMotion ? 0 : session.tilt}deg) scale(1.015)`;
    },
    [reducedMotion],
  );

  const targetAt = useCallback(
    (session: DragSession, clientX: number, clientY: number) => {
      const scrollDelta = (boardRef.current?.scrollLeft ?? session.snapshot.scrollLeft) - session.snapshot.scrollLeft;
      let targetSection = session.target.sectionId;
      let nearestDistance = Number.POSITIVE_INFINITY;

      session.snapshot.columns.forEach((column, sectionId) => {
        const left = column.left - scrollDelta;
        const right = column.right - scrollDelta;
        const inside = clientX >= left && clientX <= right && clientY >= column.top && clientY <= column.bottom;
        const distance = inside ? 0 : Math.abs(clientX - Math.max(left, Math.min(clientX, right)));
        if (distance < nearestDistance) {
          nearestDistance = distance;
          targetSection = sectionId;
        }
      });

      const ids = links
        .filter((link) => link.sectionId === targetSection)
        .sort((a, b) => a.order - b.order)
        .map((link) => link.id);
      let index = 0;
      for (const id of ids) {
        const rect = session.snapshot.cards.get(id);
        if (!rect) continue;
        if (clientY > rect.top + rect.height / 2) index += 1;
      }
      if (targetSection === session.from && index > session.fromIndex) index -= 1;
      const max = ids.length - (targetSection === session.from ? 1 : 0);
      return { sectionId: targetSection, index: Math.max(0, Math.min(index, max)) };
    },
    [links],
  );

  const handlePointerDown = useCallback(
    (link: WizardLinkDraft, event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || dragRef.current) return;
      event.preventDefault();
      const source = cardRefs.current.get(link.id);
      const board = boardRef.current;
      if (!source || !board) return;

      const sourceRect = rectOf(source.getBoundingClientRect());
      const columns = new Map<string, Rect>();
      columnRefs.current.forEach((node, sectionId) => columns.set(sectionId, rectOf(node.getBoundingClientRect())));
      const cards = new Map<string, Rect>();
      cardRefs.current.forEach((node, id) => cards.set(id, rectOf(node.getBoundingClientRect())));
      const fromItems = links.filter((item) => item.sectionId === link.sectionId).sort((a, b) => a.order - b.order);
      const fromIndex = Math.max(0, fromItems.findIndex((item) => item.id === link.id));

      const session: DragSession = {
        link,
        from: link.sectionId,
        fromIndex,
        target: { sectionId: link.sectionId, index: fromIndex },
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
        snapshot: { board: rectOf(board.getBoundingClientRect()), scrollLeft: board.scrollLeft, columns, cards },
      };
      dragRef.current = session;
      setDragView({ ...session });
      requestAnimationFrame(() => applyOverlayTransform(session));
    },
    [applyOverlayTransform, links],
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

      const board = boardRef.current;
      if (board) {
        const edge = 72;
        if (event.clientX < session.snapshot.board.left + edge) board.scrollLeft -= 18;
        if (event.clientX > session.snapshot.board.right - edge) board.scrollLeft += 18;
      }

      const target = targetAt(session, event.clientX, event.clientY);
      if (target.sectionId !== session.target.sectionId || target.index !== session.target.index) {
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

      const next = links.map((link) => ({ ...link }));
      const destination = next
        .filter((link) => link.sectionId === session.target.sectionId && link.id !== session.link.id)
        .sort((a, b) => a.order - b.order);
      const moved = next.find((link) => link.id === session.link.id);
      if (!moved) {
        dragRef.current = null;
        setDragView(null);
        return;
      }
      moved.sectionId = session.target.sectionId;
      destination.splice(session.target.index, 0, moved);
      destination.forEach((link, index) => {
        link.order = index;
      });
      if (session.from !== session.target.sectionId) {
        next
          .filter((link) => link.sectionId === session.from)
          .sort((a, b) => a.order - b.order)
          .forEach((link, index) => {
            link.order = index;
          });
      }
      setLinks(next);

      const overlay = overlayRef.current;
      const hole = document.querySelector<HTMLElement>('[data-link-drop-hole="true"]');
      const targetRect = hole?.getBoundingClientRect();
      const distance = targetRect
        ? Math.hypot(targetRect.left - (session.sourceRect.left + session.translateX), targetRect.top - (session.sourceRect.top + session.translateY))
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
  }, [applyOverlayTransform, dragView, links, reducedMotion, targetAt]);

  // Column (section) drag-and-drop — same technique as link cards (overlay
  // clone, layout snapshot taken at pickup, velocity-derived tilt, WAAPI
  // landing tween), applied to horizontal column reordering instead. The
  // "Unsorted" bucket is pinned first and never draggable.
  const applyColumnOverlayTransform = useCallback(
    (session: ColumnDragSession) => {
      if (!columnOverlayRef.current) return;
      columnOverlayRef.current.style.transform = `translate3d(${session.translateX}px, 0, 0) rotate(${reducedMotion ? 0 : session.tilt}deg) scale(1.015)`;
    },
    [reducedMotion],
  );

  const handleColumnPointerDown = useCallback(
    (sectionId: string, event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || dragRef.current || columnDragRef.current) return;
      event.preventDefault();
      const source = columnRefs.current.get(sectionId);
      if (!source) return;

      const draggableIds = sections.filter((s) => s.id !== UNSORTED_SECTION_ID).map((s) => s.id);
      const fromIndex = draggableIds.indexOf(sectionId);
      if (fromIndex === -1) return;

      const columnRects = new Map<string, Rect>();
      columnRefs.current.forEach((node, id) => columnRects.set(id, rectOf(node.getBoundingClientRect())));

      const session: ColumnDragSession = {
        sectionId,
        fromIndex,
        targetIndex: fromIndex,
        pointerId: event.pointerId,
        startX: event.clientX,
        lastX: event.clientX,
        lastAt: performance.now(),
        velocityX: 0,
        moved: false,
        sourceRect: columnRects.get(sectionId)!,
        translateX: 0,
        tilt: 0,
        columnOrder: draggableIds,
        columnRects,
      };
      columnDragRef.current = session;
      setColumnDragView({ ...session });
      requestAnimationFrame(() => applyColumnOverlayTransform(session));
    },
    [applyColumnOverlayTransform, sections],
  );

  useEffect(() => {
    if (!columnDragView) return;

    const onMove = (event: PointerEvent) => {
      const session = columnDragRef.current;
      if (!session || event.pointerId !== session.pointerId) return;
      event.preventDefault();

      const now = performance.now();
      const elapsed = Math.max(8, now - session.lastAt);
      const instantVelocity = ((event.clientX - session.lastX) / elapsed) * 1000;
      session.velocityX = session.velocityX * 0.65 + instantVelocity * 0.35;
      session.lastX = event.clientX;
      session.lastAt = now;
      session.translateX = event.clientX - session.startX;
      session.moved ||= Math.abs(session.translateX) > 4;
      session.tilt = Math.max(-5, Math.min(5, session.velocityX / 170));

      const centerX = session.sourceRect.left + session.sourceRect.width / 2 + session.translateX;
      let targetIndex = session.columnOrder.length - 1;
      for (let i = 0; i < session.columnOrder.length; i++) {
        const rect = session.columnRects.get(session.columnOrder[i]);
        if (!rect) continue;
        if (centerX < rect.left + rect.width / 2) {
          targetIndex = i;
          break;
        }
      }
      if (targetIndex !== session.targetIndex) {
        session.targetIndex = targetIndex;
        setColumnDragView({ ...session });
      }
      applyColumnOverlayTransform(session);

      if (columnLevelTimerRef.current) window.clearTimeout(columnLevelTimerRef.current);
      columnLevelTimerRef.current = window.setTimeout(() => {
        const current = columnDragRef.current;
        if (!current) return;
        current.tilt = 0;
        if (columnOverlayRef.current) {
          columnOverlayRef.current.style.transition = reducedMotion ? 'none' : 'transform 110ms ease-out';
          applyColumnOverlayTransform(current);
          window.setTimeout(() => {
            if (columnOverlayRef.current) columnOverlayRef.current.style.transition = 'none';
          }, 120);
        }
      }, 70);
    };

    const finishColumnDrag = (event: PointerEvent, cancelled = false) => {
      const session = columnDragRef.current;
      if (!session || event.pointerId !== session.pointerId) return;
      if (columnLevelTimerRef.current) window.clearTimeout(columnLevelTimerRef.current);

      if (cancelled || !session.moved || session.targetIndex === session.fromIndex) {
        columnDragRef.current = null;
        setColumnDragView(null);
        return;
      }

      setSections((prev) => {
        const unsorted = prev.filter((s) => s.id === UNSORTED_SECTION_ID);
        const rest = prev.filter((s) => s.id !== UNSORTED_SECTION_ID);
        const byId = new Map(rest.map((s) => [s.id, s]));
        const reordered = session.columnOrder.slice();
        reordered.splice(session.fromIndex, 1);
        reordered.splice(session.targetIndex, 0, session.sectionId);
        return [...unsorted, ...reordered.map((id) => byId.get(id)!).filter(Boolean)];
      });

      const overlay = columnOverlayRef.current;
      const hole = document.querySelector<HTMLElement>('[data-column-drop-hole="true"]');
      const targetRect = hole?.getBoundingClientRect();
      const targetTranslateX = targetRect ? targetRect.left - session.sourceRect.left : session.translateX;
      const duration = reducedMotion ? 0 : Math.min(280, 160 + Math.abs(targetTranslateX) / 3);
      const targetTransform = `translate3d(${targetTranslateX}px, 0, 0) rotate(0deg) scale(1)`;

      const completeLanding = () => {
        columnDragRef.current = null;
        setColumnDragView(null);
      };
      if (overlay && duration > 0) {
        const animation = overlay.animate(
          [
            { transform: overlay.style.transform, boxShadow: '0 16px 32px rgba(15,23,42,.2)' },
            { transform: targetTransform, boxShadow: '0 1px 2px rgba(15,23,42,.06)' },
          ],
          { duration, easing: LAND_EASE, fill: 'forwards' },
        );
        animation.finished.then(completeLanding).catch(completeLanding);
      } else {
        completeLanding();
      }
    };

    const onUp = (event: PointerEvent) => finishColumnDrag(event);
    const onCancel = (event: PointerEvent) => finishColumnDrag(event, true);
    window.addEventListener('pointermove', onMove, { passive: false });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
    };
  }, [applyColumnOverlayTransform, columnDragView, reducedMotion]);

  const finish = useCallback(() => {
    const existingIds = new Set(existingSections.map((s) => s.id));
    const usedSections = sections.filter(
      (s) => s.id !== UNSORTED_SECTION_ID || (grouped[UNSORTED_SECTION_ID]?.length ?? 0) > 0,
    );

    // Only report sections that are new to this session — existing sections
    // (passed in via existingSections) are drop targets, not something to
    // recreate or overwrite.
    const newSections: LinkSection[] = usedSections
      .filter((s) => !existingIds.has(s.id))
      .map((s, index) => ({
        id: s.id,
        name: s.name,
        icon: s.icon,
        isExpanded: true,
        allowCollapse: true,
        defaultState: 'expanded' as const,
        order: existingSections.length + index + 1,
      }));

    // Links can land in either a new section or an existing one, so this
    // walks every used section, not just the new ones.
    const newLinks: LinkItem[] = usedSections.flatMap((section) =>
      (grouped[section.id] ?? []).map((link): LinkItem => ({
        id: link.id,
        name: link.name,
        url: link.url,
        sectionId: link.sectionId,
        icon: 'link',
        isFavorite: false,
        isArchived: false,
        clickCount: 0,
        createdAt: new Date().toISOString(),
      })),
    );

    const orderedSectionIds = usedSections.filter((s) => s.id !== UNSORTED_SECTION_ID).map((s) => s.id);

    onDone(newSections, newLinks, orderedSectionIds);
  }, [sections, grouped, onDone, existingSections]);

  return (
    <div className="flex min-h-screen flex-col bg-surface p-6">
      <div className="mx-auto mb-5 flex w-full max-w-6xl items-center justify-between">
        <div>
          <h1 className="font-heading text-xl font-bold text-text-main">{title}</h1>
          <p className="text-xs text-text-muted">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          {onCancel && (
            <button onClick={onCancel} className="rounded-xl px-4 py-2.5 text-xs font-semibold text-text-muted transition hover:text-text-main">
              Cancel
            </button>
          )}
          <button onClick={finish} className="rounded-xl bg-brand px-4 py-2.5 text-xs font-semibold text-text-inverse transition hover:bg-brand-hover">
            {doneLabel}
          </button>
        </div>
      </div>

      <div ref={boardRef} className="mx-auto w-full max-w-6xl flex-1 overflow-x-auto pb-4">
        <div className="flex h-full min-w-max gap-3">
          {(() => {
            const draggedColumnId = columnDragView?.sectionId;
            const withoutDragged = draggedColumnId ? sections.filter((s) => s.id !== draggedColumnId) : sections;
            const unsorted = withoutDragged.filter((s) => s.id === UNSORTED_SECTION_ID);
            const rest = withoutDragged.filter((s) => s.id !== UNSORTED_SECTION_ID);
            const items: (WizardSectionDraft | { id: typeof COLUMN_DROP_HOLE_ID })[] = [...unsorted, ...rest];
            if (columnDragView) {
              const insertAt = 1 + columnDragView.targetIndex; // +1 to skip the pinned Unsorted column
              items.splice(insertAt, 0, { id: COLUMN_DROP_HOLE_ID });
            }
            return items;
          })().map((section) => {
            if (!('name' in section)) {
              return (
                <div
                  key="column-drop-hole"
                  data-column-drop-hole="true"
                  style={{ width: 260, flexShrink: 0, borderRadius: 14, border: '1.5px dashed var(--border-focus)', background: 'var(--brand-subtle-color, rgba(59,130,246,.08))' }}
                />
              );
            }
            const cards = grouped[section.id]?.filter((link) => link.id !== dragView?.link.id) ?? [];
            const isTarget = dragView?.target.sectionId === section.id;
            const holeAt = isTarget ? dragView!.target.index : null;

            return (
              <section
                key={section.id}
                ref={(node) => {
                  if (node) columnRefs.current.set(section.id, node);
                  else columnRefs.current.delete(section.id);
                }}
                style={{
                  width: 260,
                  flexShrink: 0,
                  display: 'flex',
                  flexDirection: 'column',
                  borderRadius: 14,
                  border: `1px solid ${isTarget ? section.border : 'var(--border-subtle)'}`,
                  background: isTarget ? section.tint : 'var(--bg-surface)',
                  transition: reducedMotion ? 'none' : 'background 140ms ease, border-color 140ms ease',
                }}
              >
                <header style={{ padding: '12px 12px 10px', borderTop: `3px solid ${section.color}`, borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  {section.id !== UNSORTED_SECTION_ID && (
                    <div
                      onPointerDown={(event) => handleColumnPointerDown(section.id, event)}
                      style={{ cursor: 'grab', touchAction: 'none', display: 'flex', alignItems: 'center' }}
                      title="Drag to reorder this section"
                    >
                      <GripVertical size={14} className="shrink-0 text-text-subtle" />
                    </div>
                  )}
                  <div style={{ minWidth: 0, flex: 1 }} className="text-[12.5px] font-semibold text-text-main">
                    {section.name}
                  </div>
                  <span style={{ minWidth: 22, height: 22, borderRadius: 999, display: 'grid', placeItems: 'center', padding: '0 6px', background: section.tint, color: section.color, fontSize: 10, fontWeight: 700 }}>
                    {grouped[section.id]?.length ?? 0}
                  </span>
                  {section.id !== UNSORTED_SECTION_ID && (
                    <button onClick={() => removeSection(section.id)} className="text-text-subtle hover:text-red-500">
                      <Trash2 size={13} />
                    </button>
                  )}
                </header>
                <div style={{ flex: 1, minHeight: 120, overflowY: 'auto', padding: 8 }}>
                  <div style={{ display: 'grid', gap: 7, alignContent: 'start' }}>
                    {cards.flatMap((link, index) => {
                      const nodes: React.ReactNode[] = [];
                      if (holeAt === index) {
                        nodes.push(
                          <div
                            key={`hole-${section.id}-${index}`}
                            data-link-drop-hole="true"
                            style={{ height: dragView?.sourceRect.height ?? 54, borderRadius: 12, border: `1.5px dashed ${section.color}`, background: section.tint }}
                          />,
                        );
                      }
                      nodes.push(
                        <LinkCard
                          key={link.id}
                          link={link}
                          setRef={(node) => {
                            if (node) cardRefs.current.set(link.id, node);
                            else cardRefs.current.delete(link.id);
                          }}
                          onPointerDown={(event) => handlePointerDown(link, event)}
                        />,
                      );
                      return nodes;
                    })}
                    {holeAt === cards.length && (
                      <div
                        data-link-drop-hole="true"
                        style={{ height: dragView?.sourceRect.height ?? 54, borderRadius: 12, border: `1.5px dashed ${section.color}`, background: section.tint }}
                      />
                    )}
                    {cards.length === 0 && holeAt === null && (
                      <div className="p-5 text-center text-[11px] text-text-subtle">Drop links here</div>
                    )}
                  </div>
                </div>
              </section>
            );
          })}

          <div style={{ width: 220, flexShrink: 0 }}>
            {addingSection ? (
              <div className="rounded-2xl border border-border-main bg-surface p-3">
                <input
                  autoFocus
                  value={newSectionName}
                  onChange={(event) => setNewSectionName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') addSection();
                    if (event.key === 'Escape') setAddingSection(false);
                  }}
                  placeholder="Section name"
                  className="w-full rounded-lg border border-border-subtle px-2.5 py-1.5 text-xs text-text-main outline-none focus:border-border-focus"
                />
                <div className="mt-2 flex justify-end gap-1.5">
                  <button onClick={() => setAddingSection(false)} className="rounded-lg p-1.5 text-text-subtle hover:bg-surface-hover">
                    <X size={14} />
                  </button>
                  <button onClick={addSection} className="rounded-lg bg-brand p-1.5 text-text-inverse hover:bg-brand-hover">
                    <Check size={14} />
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAddingSection(true)}
                className="flex h-11 w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-border-main text-xs font-semibold text-text-muted hover:border-border-focus hover:text-brand-text"
              >
                <Plus size={14} /> New section
              </button>
            )}
          </div>
        </div>
      </div>

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
            transformOrigin: '50% 80%',
            willChange: 'transform',
          }}
        >
          <LinkCard link={dragView.link} lifted />
        </div>
      )}

      {columnDragView && (() => {
        const draggedSection = sections.find((s) => s.id === columnDragView.sectionId);
        if (!draggedSection) return null;
        const cards = grouped[draggedSection.id] ?? [];
        return (
          <div
            ref={columnOverlayRef}
            aria-hidden="true"
            style={{
              position: 'fixed',
              zIndex: 900,
              pointerEvents: 'none',
              left: columnDragView.sourceRect.left,
              top: columnDragView.sourceRect.top,
              width: columnDragView.sourceRect.width,
              height: columnDragView.sourceRect.height,
              borderRadius: 14,
              border: '1px solid #93c5fd',
              background: 'var(--bg-surface)',
              boxShadow: '0 16px 32px rgba(15,23,42,.2)',
              overflow: 'hidden',
              transformOrigin: '50% 50%',
              willChange: 'transform',
            }}
          >
            <div style={{ padding: '12px 12px 10px', borderTop: `3px solid ${draggedSection.color}`, borderBottom: '1px solid var(--border-subtle)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <GripVertical size={14} className="shrink-0 text-text-subtle" />
              <div style={{ minWidth: 0, flex: 1 }} className="text-[12.5px] font-semibold text-text-main">
                {draggedSection.name}
              </div>
              <span style={{ minWidth: 22, height: 22, borderRadius: 999, display: 'grid', placeItems: 'center', padding: '0 6px', background: draggedSection.tint, color: draggedSection.color, fontSize: 10, fontWeight: 700 }}>
                {cards.length}
              </span>
            </div>
            <div style={{ padding: 8, display: 'grid', gap: 7 }}>
              {cards.slice(0, 4).map((link) => (
                <LinkCard key={link.id} link={link} />
              ))}
              {cards.length > 4 && (
                <div className="text-center text-[10.5px] text-text-subtle">+{cards.length - 4} more</div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
