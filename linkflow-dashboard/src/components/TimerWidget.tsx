import React, { useEffect, useState } from 'react';
import { formatElapsed, getLiveElapsedMs, getTimerPhase, TimerPhase } from '../lib/time';
import { useHoldToStop } from '../lib/useHoldToStop';

const PlayIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="#ffffff">
    <path d="M8 5.5v13l11-6.5-11-6.5z" />
  </svg>
);

const PauseIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="#ffffff">
    <rect x="6.5" y="5" width="4" height="14" rx="1.2" />
    <rect x="13.5" y="5" width="4" height="14" rx="1.2" />
  </svg>
);

const StopIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="26" height="26" fill="#ffffff">
    <rect x="6" y="6" width="12" height="12" rx="2.2" />
  </svg>
);

const GripIcon: React.FC = () => (
  <svg viewBox="0 0 16 16" width="11" height="11" fill="white">
    <circle cx="5" cy="3" r="1.3" />
    <circle cx="11" cy="3" r="1.3" />
    <circle cx="5" cy="8" r="1.3" />
    <circle cx="11" cy="8" r="1.3" />
    <circle cx="5" cy="13" r="1.3" />
    <circle cx="11" cy="13" r="1.3" />
  </svg>
);

const PHASE_COLOR: Record<TimerPhase, string> = {
  idle: '#22c55e',
  paused: '#22c55e',
  running: '#3b82f6',
};
const STOPPED_COLOR = '#17181c';

/** The standalone view rendered in the always-on-top floating widget window
 * (see `openTimerWidget()` in App.tsx and the `#timer-widget` hash check in
 * main.tsx). Runs in its own webview with no access to the main window's React
 * state, so it only ever knows the timer's phase via the
 * `linkflow://timesheet-state` event the main window emits on every
 * start/pause/resume/stop (and once more whenever this window (re)opens) —
 * ticking itself locally from those values, the same computation
 * TimesheetPanel.tsx already does. A short press emits
 * `linkflow://timer-toggle` (start, resume, or pause — App.tsx decides which
 * from its own current state); completing the 1.5s hold emits
 * `linkflow://timer-stop`, which finalizes and logs the session. */
export const TimerWidget: React.FC = () => {
  const [timerState, setTimerState] = useState<{
    currentSessionStart: string | null;
    sessionStartedAt: string | null;
    pausedElapsedMs: number;
  }>({ currentSessionStart: null, sessionStartedAt: null, pausedElapsedMs: 0 });
  const [now, setNow] = useState(() => Date.now());
  const phase = getTimerPhase(timerState);

  useEffect(() => {
    const { documentElement, body } = document;
    const previousHtmlBg = documentElement.style.background;
    const previousBodyBg = body.style.background;
    documentElement.style.background = 'transparent';
    body.style.background = 'transparent';
    return () => {
      documentElement.style.background = previousHtmlBg;
      body.style.background = previousBodyBg;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void (async () => {
      const { listen, emit } = await import('@tauri-apps/api/event');
      const stop = await listen<{ currentSessionStart: string | null; sessionStartedAt: string | null; pausedElapsedMs: number }>(
        'linkflow://timesheet-state',
        (event) => setTimerState(event.payload)
      );
      if (cancelled) {
        stop();
        return;
      }
      unlisten = stop;
      void emit('linkflow://timer-widget-ready');
    })();
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    if (phase !== 'running') return undefined;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [phase]);

  const liveElapsedMs = getLiveElapsedMs(timerState, now);

  const emitToggle = () => void import('@tauri-apps/api/event').then(({ emit }) => emit('linkflow://timer-toggle'));
  const emitStop = () => void import('@tauri-apps/api/event').then(({ emit }) => emit('linkflow://timer-stop'));

  const { isPressed, holdProgress, onPointerDown, onPointerUp, onPointerLeave } = useHoldToStop(
    emitToggle,
    emitStop,
    phase !== 'idle'
  );

  const isStopped = holdProgress >= 1;
  const btnColor = isStopped ? STOPPED_COLOR : PHASE_COLOR[phase];

  return (
    <div
      className="group"
      style={{
        width: '100%', height: '100%', position: 'relative',
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        gap: 8, background: 'transparent', userSelect: 'none',
      }}
    >
      {/* A 72x72 positioning box holds both the button (bottom-center, its
          natural 56x56 size) and the drag grip (top-right, 16x16) — both
          anchored with *non-negative* offsets so neither ever needs to render
          outside this box's own bounds. The button is horizontally centered
          *within* the box (not flush to its left edge) so its own center
          lines up with the box's center — and therefore with the
          elapsed-time text below, which is centered on the box via the outer
          flex column, not on the button directly. There's still a real gap
          between the grip and the button's circular hit area, so a click
          near the button's edge still can't be misread as a window-drag
          attempt, and vice versa. Grip is invisible until the box is
          hovered. */}
      <div style={{ position: 'relative', width: 72, height: 72 }}>
        <button
          type="button"
          onPointerDown={onPointerDown}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerLeave}
          onPointerCancel={onPointerLeave}
          aria-label={phase === 'running' ? 'Pause the clock (hold to stop)' : 'Start the clock'}
          className="absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full border-none flex items-center justify-center cursor-pointer touch-none select-none"
          style={{
            background: btnColor,
            transition: 'box-shadow 260ms cubic-bezier(0.23, 1.0, 0.32, 1.0), background 260ms ease, transform 180ms ease',
            transform: isPressed ? 'scale(0.965)' : 'scale(1)',
            boxShadow: isPressed
              ? '0 2px 5px -2px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3), inset 0 5px 10px -1px rgba(0,0,0,0.48), inset 0 -4px 8px 0 rgba(255,255,255,0.24), inset 0 0 5px 1px rgba(255,255,255,0.16)'
              : '0 7px 11px -3px rgba(0,0,0,0.5), 0 1px 3px rgba(0,0,0,0.3), inset 0 -2px 3px -1px rgba(0,0,0,0.3), inset 0 1px 2px -1px rgba(255,255,255,0.4), inset 0 0 3px 1px rgba(255,255,255,0.32), inset 0 7px 11px 0 rgba(255,255,255,0.16)',
          }}
        >
          {holdProgress > 0 && (
            <div
              aria-hidden
              className="absolute inset-0 rounded-full pointer-events-none"
              style={{
                background: STOPPED_COLOR,
                WebkitMaskImage: `linear-gradient(90deg, #000 0%, #000 calc(${Math.round(holdProgress * 100)}% - 8px), transparent calc(${Math.round(holdProgress * 100)}%), transparent 100%)`,
                maskImage: `linear-gradient(90deg, #000 0%, #000 calc(${Math.round(holdProgress * 100)}% - 8px), transparent calc(${Math.round(holdProgress * 100)}%), transparent 100%)`,
              }}
            />
          )}
          <div className="relative z-10" style={{ filter: 'drop-shadow(0 2px 3px rgba(0,0,0,0.4))' }}>
            {isStopped ? <StopIcon /> : phase === 'running' ? <PauseIcon /> : <PlayIcon />}
          </div>
        </button>
        <div
          // "deep" (not a bare/true attr) because Tauri's drag script only starts
          // a drag on a bare data-tauri-drag-region element when the raw click
          // *target* (composedPath()[0]) is that exact element — clicking the
          // GripIcon <svg>/<circle> inside it made the target a child instead,
          // so a bare attribute here silently never matched and no drag ever
          // started. "deep" triggers for any click within the subtree.
          data-tauri-drag-region="deep"
          className="absolute top-0 right-0 w-4 h-4 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
          style={{ background: 'rgba(0,0,0,0.45)', cursor: 'move' }}
          title="Drag to move"
        >
          <GripIcon />
        </div>
      </div>
      {/* Deliberately literal white + a fixed dark shadow, not a text-* token: this
          text floats over arbitrary desktop wallpaper, not the app's own themed
          surface, so it needs to stay legible regardless of theme or background. */}
      <span
        className="font-mono text-[15px] font-bold tabular-nums text-white"
        style={{ textShadow: '0 1px 3px rgba(0,0,0,0.75), 0 0 6px rgba(0,0,0,0.5)' }}
      >
        {formatElapsed(liveElapsedMs)}
      </span>
    </div>
  );
};
