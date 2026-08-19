import React, { useEffect, useMemo, useState } from 'react';
import { TimesheetSession } from '../types';

interface ManualTimeEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (entry: { activity: string; start: string; end: string; durationSeconds: number }) => void;
  /** When set, the form is pre-filled from this session and saving updates it
   * in place instead of adding a new one — used by the "edit" hover action on
   * a "Today's sessions" row. */
  editingSession?: TimesheetSession | null;
}

/** ISO datetime -> the local-time string a `datetime-local` input expects
 * (`YYYY-MM-DDTHH:mm`) — the inverse of what `handleSubmit` does with
 * `new Date(value).toISOString()`. */
function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** For a forgotten Start/Stop (or correcting one already recorded): lets the
 * activity, start time, and end time be entered directly, with the duration
 * always derived from start/end rather than typed in separately, so it can
 * never drift out of sync with them. */
export const ManualTimeEntryModal: React.FC<ManualTimeEntryModalProps> = ({ isOpen, onClose, onSave, editingSession }) => {
  const [activity, setActivity] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');

  useEffect(() => {
    if (!isOpen) return;
    if (editingSession) {
      setActivity(editingSession.activity ?? '');
      setStart(toDatetimeLocalValue(editingSession.start));
      setEnd(toDatetimeLocalValue(editingSession.end));
    } else {
      setActivity('');
      setStart('');
      setEnd('');
    }
  }, [isOpen, editingSession]);

  const durationSeconds = useMemo(() => {
    if (!start || !end) return null;
    const startMs = new Date(start).getTime();
    const endMs = new Date(end).getTime();
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) return null;
    return Math.round((endMs - startMs) / 1000);
  }, [start, end]);

  const durationLabel = useMemo(() => {
    if (durationSeconds === null) return null;
    const hours = Math.floor(durationSeconds / 3600);
    const minutes = Math.round((durationSeconds % 3600) / 60);
    return `${hours}h ${minutes}m`;
  }, [durationSeconds]);

  if (!isOpen) return null;

  const hasTimeError = start !== '' && end !== '' && durationSeconds === null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (durationSeconds === null) return;
    onSave({
      activity: activity.trim(),
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      durationSeconds,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-[440px] rounded-2xl bg-surface-elevated shadow-xl border border-border-main flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-border-subtle flex justify-between items-center bg-surface-subtle">
          <h2 className="font-heading text-base font-bold text-text-main m-0">
            {editingSession ? 'Edit Time Entry' : 'Add Time Entry'}
          </h2>
          <button
            onClick={onClose}
            type="button"
            className="text-text-subtle hover:text-text-main transition-colors p-1 rounded-lg hover:bg-surface-hover focus:outline-none"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4 flex-1">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="manual-activity" className="text-xs font-semibold text-text-main">
              What did you work on?
            </label>
            <input
              id="manual-activity"
              type="text"
              autoFocus
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
              placeholder="e.g., Client call, follow-up emails"
              className="w-full bg-surface border border-border-main rounded-xl px-3.5 py-2.5 text-xs text-text-main placeholder:text-text-subtle focus:outline-none focus:border-border-focus focus:ring-2 focus:ring-border-focus/20 transition-colors"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="manual-start" className="text-xs font-semibold text-text-main">
                Start <span className="text-danger">*</span>
              </label>
              <input
                id="manual-start"
                type="datetime-local"
                required
                value={start}
                onChange={(e) => setStart(e.target.value)}
                className="w-full bg-surface border border-border-main rounded-xl px-3 py-2.5 text-xs text-text-main focus:outline-none focus:border-border-focus focus:ring-2 focus:ring-border-focus/20 transition-colors"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="manual-end" className="text-xs font-semibold text-text-main">
                End <span className="text-danger">*</span>
              </label>
              <input
                id="manual-end"
                type="datetime-local"
                required
                value={end}
                onChange={(e) => setEnd(e.target.value)}
                className="w-full bg-surface border border-border-main rounded-xl px-3 py-2.5 text-xs text-text-main focus:outline-none focus:border-border-focus focus:ring-2 focus:ring-border-focus/20 transition-colors"
              />
            </div>
          </div>

          {hasTimeError && <p className="text-xs text-danger -mt-2">End time must be after the start time.</p>}
          {durationLabel && <p className="text-xs text-text-muted -mt-2">Duration: {durationLabel}</p>}

          <div className="pt-3 border-t border-border-subtle flex justify-end gap-3 items-center mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-text-muted hover:bg-surface-hover hover:text-text-main transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={durationSeconds === null}
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-brand text-text-inverse hover:bg-brand-hover shadow-xs transition-colors active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
            >
              {editingSession ? 'Save Changes' : 'Add Entry'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
