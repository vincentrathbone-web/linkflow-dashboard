import React, { useEffect, useState } from 'react';
import { TimesheetSession, TimesheetState } from '../types';
import { formatElapsed, getLiveElapsedMs, getTimerPhase, TimerPhase } from '../lib/time';
import { useHoldToStop } from '../lib/useHoldToStop';

interface TimesheetPanelProps {
  timesheet: TimesheetState;
  /** Short press: starts (idle), resumes (paused), or pauses (running) —
   * which one is decided by the caller from its own current state. */
  onShortPress: () => void;
  /** Completing the 1.5s hold: finalizes and logs the session. */
  onHoldComplete: () => void;
  onOpenManualEntry: () => void;
  onEditSession: (session: TimesheetSession) => void;
  onDeleteSession: (id: string) => void;
}

const PHASE_COLOR: Record<TimerPhase, string> = {
  idle: '#22c55e',
  paused: '#22c55e',
  running: '#3b82f6',
};
const STOPPED_COLOR = '#17181c';

const PlusIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const ClockIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </svg>
);

const PlayIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" className="text-text-inverse">
    <path d="M7 5l12 7-12 7V5z" />
  </svg>
);

const PauseIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" className="text-text-inverse">
    <rect x="5.5" y="4" width="4.5" height="16" rx="1.2" />
    <rect x="14" y="4" width="4.5" height="16" rx="1.2" />
  </svg>
);

const StopIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor" className="text-text-inverse">
    <rect x="5" y="5" width="14" height="14" rx="2" />
  </svg>
);

const CopyIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <rect x="8.5" y="8.5" width="11.5" height="11.5" rx="2" />
    <path d="M15.5 8.5V6.5A2 2 0 0013.5 4.5H6.5a2 2 0 00-2 2v7a2 2 0 002 2h2" />
  </svg>
);

const CheckIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 13l4 4 10-10" />
  </svg>
);

const EditIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
  </svg>
);

const TrashIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
    <path d="M4 7h16" />
    <path d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" />
    <path d="M6 7l1 13a1 1 0 001 1h8a1 1 0 001-1l1-13" />
  </svg>
);

function isSameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Builds both a tab-separated plain-text version (pastes as real columns into
 * Excel/Sheets) and an HTML <table> version (pastes as a formatted grid into
 * email clients/Word) of the same rows, so a single clipboard write covers
 * both destinations the user asked for. */
function buildSessionsClipboard(sessions: TimesheetSession[]): { text: string; html: string } {
  const header = ['Activity', 'Start', 'End', 'Duration'];
  const rows = sessions.map((s) => [
    s.activity || 'No description',
    formatTime(s.start),
    formatTime(s.end),
    formatElapsed(s.durationSeconds * 1000),
  ]);
  const totalSeconds = sessions.reduce((sum, s) => sum + s.durationSeconds, 0);
  const totalRow = ['Total', '', '', formatElapsed(totalSeconds * 1000)];

  const text = [header, ...rows, totalRow].map((row) => row.join('\t')).join('\n');

  const cellStyle = 'border:1px solid #ccc;padding:4px 8px;text-align:left;';
  const htmlRow = (cells: string[], tag: 'th' | 'td', bold = false) =>
    `<tr>${cells
      .map((cell) => `<${tag} style="${cellStyle}${bold ? 'font-weight:bold;' : ''}">${escapeHtml(cell)}</${tag}>`)
      .join('')}</tr>`;
  const html = `<table style="border-collapse:collapse;font-family:sans-serif;font-size:13px;">${htmlRow(
    header,
    'th',
    true
  )}${rows.map((row) => htmlRow(row, 'td')).join('')}${htmlRow(totalRow, 'td', true)}</table>`;

  return { text, html };
}

export const TimesheetPanel: React.FC<TimesheetPanelProps> = ({
  timesheet,
  onShortPress,
  onHoldComplete,
  onOpenManualEntry,
  onEditSession,
  onDeleteSession,
}) => {
  const [now, setNow] = useState(() => Date.now());
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const phase = getTimerPhase(timesheet);

  // Local-only tick, purely for the live display — never written into synced
  // state, so it never touches the debounced cloud save.
  useEffect(() => {
    if (phase !== 'running') return undefined;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [phase]);

  const liveElapsedMs = getLiveElapsedMs(timesheet, now);
  const { isPressed, holdProgress, onPointerDown, onPointerUp, onPointerLeave } = useHoldToStop(
    onShortPress,
    onHoldComplete,
    phase !== 'idle'
  );
  const isStopped = holdProgress >= 1;
  const btnColor = isStopped ? STOPPED_COLOR : PHASE_COLOR[phase];

  const nowDate = new Date(now);
  const todayMs = timesheet.sessions
    .filter((s) => isSameLocalDay(new Date(s.start), nowDate))
    .reduce((sum, s) => sum + s.durationSeconds * 1000, 0) + liveElapsedMs;
  // No separate "daily target" setting exists — Settings only exposes a weekly
  // target, so a 5-day work week is assumed to derive today's slice of it.
  const dailyTargetHours = timesheet.weeklyTargetHours / 5;
  const targetMs = dailyTargetHours * 3600 * 1000;
  const todayProgress = targetMs > 0 ? Math.min(100, Math.round((todayMs / targetMs) * 100)) : 0;

  const todaySessions = timesheet.sessions
    .filter((s) => isSameLocalDay(new Date(s.start), nowDate))
    .slice()
    .sort((a, b) => Date.parse(b.start) - Date.parse(a.start));

  const handleCopyToday = async () => {
    // Chronological order for the export, independent of the on-screen
    // most-recent-first list above.
    const chronological = todaySessions.slice().sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    const { text, html } = buildSessionsClipboard(chronological);

    const copyPlainTextOnly = async () => {
      await navigator.clipboard.writeText(text);
    };

    try {
      if (typeof ClipboardItem !== 'undefined' && navigator.clipboard?.write) {
        await navigator.clipboard.write([
          new ClipboardItem({
            'text/plain': new Blob([text], { type: 'text/plain' }),
            'text/html': new Blob([html], { type: 'text/html' }),
          }),
        ]);
      } else {
        await copyPlainTextOnly();
      }
      setCopyState('copied');
    } catch {
      try {
        await copyPlainTextOnly();
        setCopyState('copied');
      } catch {
        setCopyState('error');
      }
    }
    window.setTimeout(() => setCopyState('idle'), 1800);
  };

  return (
    <div data-tour="timesheet-panel" className="glass-card rounded-xl p-4">
      <div className="flex items-center gap-2.5 mb-3">
        <div className="w-8 h-8 rounded-lg bg-surface-subtle border border-border-subtle flex items-center justify-center text-text-muted">
          <ClockIcon />
        </div>
        <h2 className="font-heading text-sm font-bold text-text-main flex-1">Timesheet</h2>
      </div>

      <div className="flex items-center justify-between text-[11px] text-text-muted mb-1.5">
        <span>Today</span>
        <span className="font-bold text-text-main">
          {(todayMs / 3600000).toFixed(1)}h / {dailyTargetHours.toFixed(1)}h
        </span>
      </div>
      <div className="h-[5px] rounded-full bg-surface-subtle mb-4 overflow-hidden">
        <div className="h-full bg-brand rounded-full transition-all" style={{ width: `${todayProgress}%` }} />
      </div>

      <div className="flex flex-col items-center gap-2.5 py-1 pb-4">
        <span
          className={`inline-flex items-center gap-1.5 text-[11px] font-bold px-2.5 py-1 rounded-full ${
            phase === 'running' ? 'bg-brand-subtle text-brand-text' : 'bg-surface-subtle text-text-muted'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${phase === 'running' ? 'bg-brand' : 'bg-text-subtle'}`} />
          {phase === 'running' && `Timer Started — ${formatTime(timesheet.sessionStartedAt as string)}`}
          {phase === 'paused' && 'Paused'}
          {phase === 'idle' && 'Timer Stopped'}
        </span>
        <span className="font-mono text-[34px] font-bold tabular-nums text-text-main tracking-tight">
          {formatElapsed(liveElapsedMs)}
        </span>
      </div>

      {/* Short press starts/resumes/pauses (whichever applies to the current
          phase); holding for 1.5s sweeps a dark fill left-to-right and, on
          completion, finalizes and logs the session — same interaction and
          colors (green idle/paused, blue running, near-black on a completed
          hold) as the floating widget, just in this panel's pill shape
          rather than a circular puck. */}
      <button
        data-tour="timesheet-start-stop"
        type="button"
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerLeave}
        onPointerCancel={onPointerLeave}
        aria-label={phase === 'running' ? 'Pause the clock (hold to stop)' : phase === 'paused' ? 'Resume the clock (hold to stop)' : 'Start the clock'}
        className="relative w-full flex items-center justify-center gap-2 py-2.5 rounded-full text-text-inverse text-[13px] font-bold overflow-hidden touch-none select-none"
        style={{ background: btnColor, transition: 'background 220ms ease, transform 120ms ease', transform: isPressed ? 'scale(0.985)' : 'scale(1)' }}
      >
        {holdProgress > 0 && (
          <div
            aria-hidden
            className="absolute inset-0 pointer-events-none"
            style={{
              background: STOPPED_COLOR,
              WebkitMaskImage: `linear-gradient(90deg, #000 0%, #000 calc(${Math.round(holdProgress * 100)}% - 8px), transparent calc(${Math.round(holdProgress * 100)}%), transparent 100%)`,
              maskImage: `linear-gradient(90deg, #000 0%, #000 calc(${Math.round(holdProgress * 100)}% - 8px), transparent calc(${Math.round(holdProgress * 100)}%), transparent 100%)`,
            }}
          />
        )}
        <span className="relative z-10 flex items-center gap-2">
          {isStopped ? <StopIcon /> : phase === 'running' ? <PauseIcon /> : <PlayIcon />}
          {isStopped ? 'Stopped' : phase === 'running' ? 'Pause' : phase === 'paused' ? 'Resume' : 'Start'}
        </span>
      </button>

      <button
        type="button"
        onClick={onOpenManualEntry}
        className="w-full mt-2 py-2 rounded-lg border border-dashed border-border-main hover:border-border-focus text-text-muted hover:text-text-main transition-colors flex items-center justify-center gap-1.5 text-xs font-semibold"
      >
        <PlusIcon />
        Add time entry
      </button>

      {todaySessions.length > 0 && (
        <>
          <div className="flex items-center justify-between mt-4 mb-2 pt-4 border-t border-border-subtle">
            <span className="text-[10px] font-extrabold tracking-wider uppercase text-text-subtle">
              Today's sessions
            </span>
            <button
              type="button"
              onClick={() => void handleCopyToday()}
              title="Copy today's sessions as a table"
              className="flex items-center gap-1 text-[11px] font-semibold text-text-muted hover:text-text-main transition-colors"
            >
              {copyState === 'copied' ? <CheckIcon /> : <CopyIcon />}
              {copyState === 'copied' ? 'Copied' : copyState === 'error' ? 'Copy failed' : 'Copy'}
            </button>
          </div>
          <div className="flex flex-col gap-2.5">
            {todaySessions.map((session) => (
              <div key={session.id} className="group flex flex-col gap-0.5 text-xs">
                <div className="relative flex items-center justify-between gap-2">
                  <span className="text-text-main font-semibold truncate" title={session.activity || undefined}>
                    {session.activity || 'No description'}
                  </span>
                  <span className="font-bold text-text-main shrink-0 group-hover:opacity-0 transition-opacity">
                    {formatElapsed(session.durationSeconds * 1000)}
                  </span>
                  {/* Replaces the duration on hover — edit reopens the manual-entry
                      form pre-filled with this session; delete removes it outright
                      (e.g. a test run or an accidental Start). No background here:
                      the duration span above already fades to opacity-0 in step, so
                      nothing needs covering. */}
                  <div className="absolute right-0 flex items-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      type="button"
                      onClick={() => onEditSession(session)}
                      aria-label="Edit this session"
                      title="Edit"
                      className="text-text-subtle hover:text-text-main transition-colors"
                    >
                      <EditIcon />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteSession(session.id)}
                      aria-label="Delete this session"
                      title="Delete"
                      className="text-text-subtle hover:text-danger transition-colors"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </div>
                <span className="text-text-subtle text-[11px]">
                  {formatTime(session.start)} – {formatTime(session.end)}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
