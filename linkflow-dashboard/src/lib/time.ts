export function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':');
}

export type TimerPhase = 'idle' | 'running' | 'paused';

/** A session is "running" the instant `currentSessionStart` is set, "paused"
 * once it has been started at least once (`sessionStartedAt` set) but the
 * current run segment has stopped, and "idle" otherwise — deliberately
 * derived from those two timestamps rather than a separately stored phase
 * enum, so the two can never drift out of sync with each other. */
export function getTimerPhase(t: { currentSessionStart: string | null; sessionStartedAt: string | null }): TimerPhase {
  if (t.currentSessionStart) return 'running';
  if (t.sessionStartedAt) return 'paused';
  return 'idle';
}

/** Total elapsed ms for the in-progress session: time banked from earlier run
 * segments plus the current segment's live tick (zero while paused/idle).
 * `pausedElapsedMs` is coalesced to 0 rather than trusted as always-present:
 * a `timesheet` object loaded from a pre-pause-feature localStorage cache or
 * an unmigrated server response won't have it, and `undefined + n` is `NaN`,
 * which would otherwise render as a literal "NaN:NaN:NaN" instead of just a
 * missing few minutes of banked time. */
export function getLiveElapsedMs(t: { currentSessionStart: string | null; pausedElapsedMs: number }, now: number): number {
  const liveSegmentMs = t.currentSessionStart ? now - Date.parse(t.currentSessionStart) : 0;
  return (t.pausedElapsedMs || 0) + liveSegmentMs;
}

export const HOLD_TO_STOP_MS = 1500;
