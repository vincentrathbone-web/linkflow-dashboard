import React, { useEffect, useState } from 'react';
import { TimesheetSession, TimesheetState } from '../types';

interface TimesheetPanelProps {
  timesheet: TimesheetState;
  onStartClock: () => void;
  onStopClock: () => void;
  onOpenManualEntry: () => void;
}

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
  <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" className="text-text-inverse">
    <path d="M7 5l12 7-12 7V5z" />
  </svg>
);

const StopIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor" className="text-text-inverse">
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

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':');
}

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

export const TimesheetPanel: React.FC<TimesheetPanelProps> = ({ timesheet, onStartClock, onStopClock, onOpenManualEntry }) => {
  const [now, setNow] = useState(() => Date.now());
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const isRunning = timesheet.currentSessionStart !== null;

  // Local-only tick, purely for the live display — never written into synced
  // state, so it never touches the debounced cloud save.
  useEffect(() => {
    if (!isRunning) return undefined;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [isRunning]);

  const liveElapsedMs = isRunning ? now - Date.parse(timesheet.currentSessionStart as string) : 0;

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
    <div className="glass-card rounded-xl p-4">
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
            isRunning ? 'bg-brand-subtle text-brand-text' : 'bg-surface-subtle text-text-muted'
          }`}
        >
          <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? 'bg-brand' : 'bg-text-subtle'}`} />
          {isRunning ? `Timer Started — ${formatTime(timesheet.currentSessionStart as string)}` : 'Timer Stopped'}
        </span>
        <span className="font-mono text-[34px] font-bold tabular-nums text-text-main tracking-tight">
          {formatElapsed(liveElapsedMs)}
        </span>
      </div>

      <button
        type="button"
        onClick={isRunning ? onStopClock : onStartClock}
        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-full text-text-inverse text-[13px] font-bold transition-colors ${
          isRunning ? 'bg-danger hover:bg-danger/90' : 'bg-brand hover:bg-brand-hover'
        }`}
      >
        {isRunning ? <StopIcon /> : <PlayIcon />}
        {isRunning ? 'Stop' : 'Start'}
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
              <div key={session.id} className="flex flex-col gap-0.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-text-main font-semibold truncate" title={session.activity || undefined}>
                    {session.activity || 'No description'}
                  </span>
                  <span className="font-bold text-text-main shrink-0">{formatElapsed(session.durationSeconds * 1000)}</span>
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
