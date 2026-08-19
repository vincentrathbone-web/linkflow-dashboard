import React, { useEffect, useRef, useState } from 'react';
import { formatElapsed } from '../lib/time';

const PlayIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="currentColor" className="text-text-inverse">
    <path d="M7 5l12 7-12 7V5z" />
  </svg>
);

const StopIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor" className="text-text-inverse">
    <rect x="5" y="5" width="14" height="14" rx="2" />
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

/** The standalone view rendered in the always-on-top floating widget window
 * (see `openTimerWidget()` in App.tsx and the `#timer-widget` hash check in
 * main.tsx). Runs in its own webview with no access to the main window's React
 * state, so it only ever knows `currentSessionStart` via the
 * `linkflow://timesheet-state` event the main window emits on every Start/Stop
 * (and once more whenever this window (re)opens) — ticking itself locally from
 * that single value, the same computation TimesheetPanel.tsx already does. */
export const TimerWidget: React.FC = () => {
  const [currentSessionStart, setCurrentSessionStart] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const isRunning = currentSessionStart !== null;
  const unlistenRef = useRef<(() => void) | null>(null);

  // index.css's base layer sets `body { background-color: var(--bg-canvas) }`
  // app-wide — without overriding it here, this window's own `transparent: true`
  // setting (see openTimerWidget() in App.tsx) would be masked by that solid
  // color, showing an opaque box instead of the real desktop behind it.
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
    void (async () => {
      const { listen, emit } = await import('@tauri-apps/api/event');
      const unlisten = await listen<{ currentSessionStart: string | null }>('linkflow://timesheet-state', (event) => {
        setCurrentSessionStart(event.payload.currentSessionStart);
      });
      if (cancelled) {
        unlisten();
        return;
      }
      unlistenRef.current = unlisten;
      // Ask the main window for the current state — it may already be running
      // when this widget window opens (or reopens), and the next state change
      // could be a while away.
      void emit('linkflow://timer-widget-ready');
    })();

    return () => {
      cancelled = true;
      unlistenRef.current?.();
    };
  }, []);

  useEffect(() => {
    if (!isRunning) return undefined;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [isRunning]);

  const liveElapsedMs = isRunning ? now - Date.parse(currentSessionStart as string) : 0;

  const handleToggle = () => {
    void import('@tauri-apps/api/event').then(({ emit }) => emit('linkflow://timer-toggle'));
  };

  return (
    <div
      className="group"
      style={{
        width: '100%',
        height: '100%',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        background: 'transparent',
        userSelect: 'none',
      }}
    >
      {/* A 72x72 positioning box holds both the button (bottom-center, its
          natural 56x56 size) and the drag grip (top-right, 16x16) — both
          anchored with *non-negative* offsets so neither ever needs to render
          outside this box's own bounds. Earlier this used negative offsets to
          push the grip out past a 56x56 box sized exactly to the button, which
          left it clipped depending on ancestor/window sizing; sizing the box
          to fit both from the start removes that risk entirely. The button is
          horizontally centered *within* the box (not flush to its left edge)
          so its own center lines up with the box's center — and therefore
          with the elapsed-time text below, which is centered on the box via
          the outer flex column, not on the button directly. There's still a
          real gap between the grip and the button's circular hit area, so a
          click near the button's edge still can't be misread as a
          window-drag attempt, and vice versa. Grip is invisible until the box
          is hovered. */}
      <div style={{ position: 'relative', width: 72, height: 72 }}>
        <button
          type="button"
          onClick={handleToggle}
          aria-label={isRunning ? 'Stop the clock' : 'Start the clock'}
          className={`absolute bottom-0 left-1/2 -translate-x-1/2 w-14 h-14 rounded-full border-none flex items-center justify-center cursor-pointer shadow-lg transition-colors ${
            isRunning ? 'bg-danger' : 'bg-brand'
          }`}
        >
          {isRunning ? <StopIcon /> : <PlayIcon />}
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
