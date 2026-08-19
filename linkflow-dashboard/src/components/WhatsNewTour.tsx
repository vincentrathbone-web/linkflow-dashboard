import React, { useEffect, useState } from 'react';

export interface TourStep {
  id: string;
  /** Re-queried on every step change, so it always reflects the live DOM
   * rather than a ref captured before the target existed. */
  selector: string;
  title: string;
  body: string;
  /** Runs once when the step becomes active — e.g. opening a modal that
   * hosts the step's own target element. */
  onEnter?: () => void;
  /** Runs once when the step is left (advance, skip, or finish) — e.g.
   * closing whatever `onEnter` opened. */
  onExit?: () => void;
}

interface WhatsNewTourProps {
  steps: TourStep[];
  onFinish: () => void;
}

interface AnchorRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

const SPOTLIGHT_PAD = 6;
const GAP = 14;
const TOOLTIP_WIDTH = 300;
const FIND_TIMEOUT_MS = 1500;

/** A run-once coach-mark tour: a dimmed spotlight around a real DOM element
 * (found live via `selector`, not a screenshot) plus a speech-bubble tooltip
 * pointing at it. Steps whose target never appears (a selector typo, or a
 * later refactor that renamed the element) are skipped automatically after
 * `FIND_TIMEOUT_MS` rather than stranding the tour with no visible anchor. */
export const WhatsNewTour: React.FC<WhatsNewTourProps> = ({ steps, onFinish }) => {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<AnchorRect | null>(null);

  const step = steps[stepIndex];

  useEffect(() => {
    if (!step) return undefined;
    step.onEnter?.();

    let cancelled = false;
    let rafId = 0;
    const startedAt = Date.now();

    const measure = () => {
      if (cancelled) return;
      const el = document.querySelector(step.selector);
      if (el) {
        const domRect = el.getBoundingClientRect();
        setRect((prev) => {
          if (
            prev &&
            prev.top === domRect.top &&
            prev.left === domRect.left &&
            prev.width === domRect.width &&
            prev.height === domRect.height
          ) {
            return prev;
          }
          return { top: domRect.top, left: domRect.left, width: domRect.width, height: domRect.height };
        });
        rafId = window.requestAnimationFrame(measure);
        return;
      }
      if (Date.now() - startedAt > FIND_TIMEOUT_MS) {
        goToStep(stepIndex + 1);
        return;
      }
      rafId = window.requestAnimationFrame(measure);
    };

    setRect(null);
    rafId = window.requestAnimationFrame(measure);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(rafId);
    };
    // Re-run only when the step actually changes — `step` itself is a fresh
    // object every render of the caller, which would otherwise restart the
    // measure loop (and re-fire onEnter) on every unrelated App re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') finish();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stepIndex]);

  const goToStep = (nextIndex: number) => {
    step?.onExit?.();
    if (nextIndex >= steps.length) {
      onFinish();
    } else {
      setStepIndex(nextIndex);
    }
  };

  const finish = () => {
    step?.onExit?.();
    onFinish();
  };

  if (!step || !rect) return null;

  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const spaceBelow = viewportHeight - (rect.top + rect.height);
  const placeBelow = spaceBelow > 160 || spaceBelow > rect.top;

  const idealLeft = rect.left + rect.width / 2 - TOOLTIP_WIDTH / 2;
  const tooltipLeft = Math.min(Math.max(idealLeft, 12), viewportWidth - TOOLTIP_WIDTH - 12);
  const arrowLeft = Math.min(Math.max(rect.left + rect.width / 2 - tooltipLeft, 16), TOOLTIP_WIDTH - 16);

  return (
    <>
      {/* Visual dimming only — a huge box-shadow spread fills everywhere
          outside this element's own box, leaving a "hole" over the real
          target without any clip-path masking. */}
      <div
        aria-hidden
        style={{
          position: 'fixed',
          top: rect.top - SPOTLIGHT_PAD,
          left: rect.left - SPOTLIGHT_PAD,
          width: rect.width + SPOTLIGHT_PAD * 2,
          height: rect.height + SPOTLIGHT_PAD * 2,
          borderRadius: 14,
          boxShadow: '0 0 0 9999px rgba(15, 23, 42, 0.62)',
          pointerEvents: 'none',
          zIndex: 9997,
        }}
      />
      {/* A separate full-viewport layer swallows clicks everywhere,
          including over the spotlighted element itself — the tour asks the
          user to read and click Next/Skip, not to interact with the app
          mid-tour. */}
      <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 9998 }} />
      <div
        role="dialog"
        aria-label={step.title}
        style={{
          position: 'fixed',
          top: placeBelow ? rect.top + rect.height + GAP : undefined,
          bottom: placeBelow ? undefined : viewportHeight - rect.top + GAP,
          left: tooltipLeft,
          width: TOOLTIP_WIDTH,
          zIndex: 9999,
        }}
        className="animate-in fade-in zoom-in-95 duration-150"
      >
        {placeBelow && (
          <div
            style={{ left: arrowLeft }}
            className="absolute -top-[7px] w-3.5 h-3.5 rotate-45 bg-surface-elevated border-l border-t border-border-main"
          />
        )}
        <div className="rounded-2xl bg-surface-elevated shadow-xl border border-border-main p-4">
          <h3 className="font-heading text-sm font-bold text-text-main mb-1">{step.title}</h3>
          <p className="text-xs text-text-muted leading-relaxed mb-3">{step.body}</p>
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-text-subtle font-semibold">
              {stepIndex + 1} of {steps.length}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={finish}
                className="text-[11px] font-semibold text-text-muted hover:text-text-main transition-colors px-2 py-1"
              >
                Skip
              </button>
              <button
                type="button"
                onClick={() => goToStep(stepIndex + 1)}
                className="text-[11px] font-bold text-text-inverse bg-brand hover:bg-brand-hover transition-colors px-3 py-1.5 rounded-lg"
              >
                {stepIndex + 1 >= steps.length ? 'Got it' : 'Next'}
              </button>
            </div>
          </div>
        </div>
        {!placeBelow && (
          <div
            style={{ left: arrowLeft }}
            className="absolute -bottom-[7px] w-3.5 h-3.5 rotate-45 bg-surface-elevated border-r border-b border-border-main"
          />
        )}
      </div>
    </>
  );
};
