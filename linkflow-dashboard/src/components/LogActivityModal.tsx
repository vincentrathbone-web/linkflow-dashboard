import React, { useEffect, useState } from 'react';

interface LogActivityModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (activity: string) => void;
}

/** Shown right after clocking out to ask what was worked on during that
 * session. The session itself is already recorded by the time this appears
 * (its end time is captured the instant Stop is pressed) — this only ever
 * attaches a description to it, optionally; closing without typing anything
 * leaves the session undescribed rather than blocking the stop. */
export const LogActivityModal: React.FC<LogActivityModalProps> = ({ isOpen, onClose, onSave }) => {
  const [activity, setActivity] = useState('');

  useEffect(() => {
    if (isOpen) setActivity('');
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(activity.trim());
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-[420px] rounded-2xl bg-surface-elevated shadow-xl border border-border-main flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-border-subtle flex justify-between items-center bg-surface-subtle">
          <h2 className="font-heading text-base font-bold text-text-main m-0">What did you work on?</h2>
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
            <label htmlFor="session-activity" className="text-xs font-semibold text-text-main">
              Summary
            </label>
            <textarea
              id="session-activity"
              autoFocus
              rows={3}
              value={activity}
              onChange={(e) => setActivity(e.target.value)}
              placeholder="e.g., Followed up on client invoices, updated onboarding docs"
              className="w-full bg-surface border border-border-main rounded-xl px-3.5 py-2.5 text-xs text-text-main placeholder:text-text-subtle focus:outline-none focus:border-border-focus focus:ring-2 focus:ring-border-focus/20 transition-colors resize-none"
            />
          </div>

          <div className="pt-3 border-t border-border-subtle flex justify-end gap-3 items-center mt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-text-muted hover:bg-surface-hover hover:text-text-main transition-colors"
            >
              Skip
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-brand text-text-inverse hover:bg-brand-hover shadow-xs transition-colors active:scale-95"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
