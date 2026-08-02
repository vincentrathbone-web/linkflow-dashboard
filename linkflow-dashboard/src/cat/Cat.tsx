import { useEffect, useRef, useState } from 'react';
import {
  CAT_HEIGHT,
  CAT_WIDTH,
  PAW_OFFSET,
  SCRUFF_POINT,
  createInitialCatState,
  resolveDrop,
  stepCat,
  type CatExpression,
  type CatState,
  type PerchTarget,
} from './catEngine';
import { KawaiiCat } from './sprites/KawaiiCat';

/**
 * Perch targets are any element in the document carrying data-cat-perch="true".
 * Rects are re-measured on scroll/resize and every couple of seconds to catch
 * layout changes (content reflow, collapsed sections) without needing a
 * MutationObserver for this prototype.
 */
function usePerchTargets(): PerchTarget[] {
  const [perches, setPerches] = useState<PerchTarget[]>([]);

  useEffect(() => {
    const measure = () => {
      const nodes = Array.from(document.querySelectorAll<HTMLElement>('[data-cat-perch]'));
      setPerches(
        nodes.map((node, index) => {
          const rect = node.getBoundingClientRect();
          return { id: node.dataset.catPerchId || `perch-${index}`, left: rect.left, top: rect.top, width: rect.width, height: rect.height };
        }),
      );
    };
    measure();
    const interval = window.setInterval(measure, 1500);
    window.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, []);

  return perches;
}

/**
 * Occasionally pulls a face. Kept on its own timer rather than in the
 * movement state machine, so the cat can smile or yawn regardless of what
 * it's currently doing.
 */
function useExpression(enabled: boolean): CatExpression {
  const [expression, setExpression] = useState<CatExpression>('neutral');

  useEffect(() => {
    if (!enabled) return;
    let holdTimer: number | undefined;

    const schedule = (): number =>
      window.setTimeout(() => {
        const next: CatExpression = Math.random() < 0.55 ? 'smile' : 'yawn';
        setExpression(next);
        holdTimer = window.setTimeout(() => {
          setExpression('neutral');
          nextTimer = schedule();
        }, next === 'yawn' ? 1800 : 1300);
      }, 5000 + Math.random() * 9000);

    let nextTimer = schedule();
    return () => {
      window.clearTimeout(nextTimer);
      if (holdTimer) window.clearTimeout(holdTimer);
    };
  }, [enabled]);

  return expression;
}

export function Cat({ enabled }: { enabled: boolean }) {
  const expression = useExpression(enabled);
  const perches = usePerchTargets();
  const [state, setState] = useState<CatState>(() => createInitialCatState(window.innerWidth));
  const stateRef = useRef(state);
  stateRef.current = state;
  const perchesRef = useRef(perches);
  perchesRef.current = perches;
  const lastFrame = useRef<number | null>(null);
  const rafId = useRef<number | null>(null);

  // Dragging is handled entirely outside the stepCat simulation: picking the
  // cat up freezes its simulated state (see the isDraggingRef check in the
  // tick loop below) and the sprite instead follows the pointer directly.
  // Only on release does resolveDrop() decide where the cat actually ends up
  // and hand a fresh CatState back to the simulation.
  const [isDragging, setIsDragging] = useState(false);
  const [dragPos, setDragPos] = useState({ x: 0, y: 0 });
  const isDraggingRef = useRef(false);
  isDraggingRef.current = isDragging;

  useEffect(() => {
    if (!enabled) return;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) return; // stay put entirely; see README note in App.tsx

    const tick = (now: number) => {
      if (document.hidden) {
        lastFrame.current = now;
        rafId.current = requestAnimationFrame(tick);
        return;
      }
      const last = lastFrame.current ?? now;
      const dt = Math.min(80, now - last); // clamp so a tab-switch pause doesn't teleport the cat
      lastFrame.current = now;
      if (!isDraggingRef.current) {
        const next = stepCat(stateRef.current, dt, window.innerWidth, perchesRef.current);
        stateRef.current = next;
        setState(next);
      }
      rafId.current = requestAnimationFrame(tick);
    };
    rafId.current = requestAnimationFrame(tick);
    return () => {
      if (rafId.current) cancelAnimationFrame(rafId.current);
    };
  }, [enabled]);

  // Pointer listeners live on window (not the sprite element) so a fast
  // drag that outruns the cat's small hitbox doesn't drop the gesture.
  useEffect(() => {
    if (!isDragging) return;

    const handleMove = (e: PointerEvent) => {
      setDragPos({ x: e.clientX, y: e.clientY });
    };
    const handleUp = (e: PointerEvent) => {
      const next = resolveDrop(stateRef.current, e.clientX, e.clientY, window.innerWidth, perchesRef.current);
      stateRef.current = next;
      setState(next);
      setIsDragging(false);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, [isDragging]);

  if (!enabled) return null;

  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 9000,
      }}
    >
      <div
        onPointerDown={(e) => {
          e.preventDefault();
          setDragPos({ x: e.clientX, y: e.clientY });
          setIsDragging(true);
        }}
        style={
          isDragging
            ? {
                position: 'absolute',
                // Anchor the scruff (not the box center) under the pointer,
                // so the body visibly hangs below/behind the grip rather
                // than the sprite just being centered on the cursor. The
                // flip is CSS scaleX around the box's own center, so the
                // scruff's effective local x mirrors along with it.
                left: dragPos.x - (state.facing === 1 ? SCRUFF_POINT.x : CAT_WIDTH - SCRUFF_POINT.x),
                top: dragPos.y - SCRUFF_POINT.y,
                width: CAT_WIDTH,
                height: CAT_HEIGHT,
                transform: `scaleX(${state.facing})`,
                transformOrigin: 'center',
                pointerEvents: 'auto',
                touchAction: 'none',
                cursor: 'grabbing',
              }
            : {
                position: 'absolute',
                left: state.x - CAT_WIDTH / 2,
                // state.y is where the paws should land; the sprite has empty space
                // below them, so shift down by that much to sit flush on a surface.
                bottom: state.y - PAW_OFFSET,
                width: CAT_WIDTH,
                height: CAT_HEIGHT,
                transform: `scaleX(${state.facing})`,
                transformOrigin: 'center',
                transition: 'transform 120ms ease-out',
                pointerEvents: 'auto',
                touchAction: 'none',
                cursor: 'grab',
              }
        }
      >
        <KawaiiCat activity={state.activity} facing={state.facing} expression={expression} isDragging={isDragging} />
      </div>
    </div>
  );
}
