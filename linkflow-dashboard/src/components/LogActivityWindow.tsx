import React, { useEffect, useState } from 'react';

/** Reads the session id passed via the window's own URL, e.g.
 * `#log-activity?session=session-1734...` — this window has no access to the
 * main window's React state (same constraint as TimerWidget.tsx), so the id
 * has to travel in via the URL rather than props. */
function getSessionIdFromHash(): string {
  const hash = window.location.hash;
  const queryIndex = hash.indexOf('?');
  if (queryIndex === -1) return '';
  return new URLSearchParams(hash.slice(queryIndex + 1)).get('session') ?? '';
}

/** The standalone, always-on-top "what did you work on?" prompt (see
 * `openLogActivityPrompt()` in App.tsx and the `#log-activity` hash check in
 * main.tsx). Runs in its own chromeless webview so it stays visible and
 * on top of everything — including over the main window while it's
 * minimized/hidden — which a modal painted inside the main window's own
 * React tree can't do. Used for every stop (in-app button, floating widget,
 * tray icon) so there is exactly one place this prompt can appear, never two
 * competing ones. On Save it emits `linkflow://log-activity-save` back to the
 * main window (which owns the actual session data) and closes itself; Skip
 * or the close button just closes it, leaving the session undescribed —
 * same "attaching a description is optional" behavior the old in-app modal
 * had. */
export const LogActivityWindow: React.FC = () => {
  const [sessionId] = useState(getSessionIdFromHash);
  const [activity, setActivity] = useState('');

  // Chromeless + transparent (set on the window itself in openLogActivityPrompt)
  // still needs the document background cleared, or the browser's opaque
  // default paints a rectangle behind the card — same trick TimerWidget.tsx
  // uses to get genuinely transparent corners around a rounded card.
  useEffect(() => {
    const { documentElement, body } = document;
    documentElement.style.background = 'transparent';
    body.style.background = 'transparent';
  }, []);

  const closeSelf = async () => {
    const { getCurrentWindow } = await import('@tauri-apps/api/window');
    await getCurrentWindow().close();
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') void closeSelf();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const { emit } = await import('@tauri-apps/api/event');
    await emit('linkflow://log-activity-save', { sessionId, activity: activity.trim() });
    void closeSelf();
  };

  return (
    <div className="w-full h-full flex items-center justify-center p-3" style={{ background: 'transparent' }}>
      {/* Window shadow is disabled (see openLogActivityPrompt) so this CSS
          box-shadow is the only one drawn — a native shadow behind a
          transparent, rounded, decorations:false window renders as a
          rectangle that clips the rounded corners, the same reason
          TimerWidget.tsx disables it too. */}
      <div
        className="w-full h-full rounded-2xl bg-surface-elevated shadow-xl border border-border-main flex flex-col overflow-hidden"
        style={{ boxShadow: '0 20px 40px -8px rgba(0,0,0,0.45), 0 2px 10px rgba(0,0,0,0.28)' }}
      >
        {/* Bare (non-"deep") data-tauri-drag-region: only a click landing
            exactly on this div (not its h2/button children) starts a
            window drag — see the WidgetGrid grip comment for the same
            distinction. Lets the prompt be moved out of the way without
            a native title bar. */}
        <div data-tauri-drag-region className="px-5 py-3.5 border-b border-border-subtle flex justify-between items-center bg-surface-subtle shrink-0">
          <h2 className="font-heading text-sm font-bold text-text-main m-0">What did you work on?</h2>
          <button
            onClick={() => void closeSelf()}
            type="button"
            className="text-text-subtle hover:text-text-main transition-colors p-1 rounded-lg hover:bg-surface-hover focus:outline-none"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 flex-1 flex flex-col gap-3">
          <textarea
            autoFocus
            rows={4}
            value={activity}
            onChange={(event) => setActivity(event.target.value)}
            placeholder="e.g., Followed up on client invoices, updated onboarding docs"
            className="w-full flex-1 bg-surface border border-border-main rounded-xl px-3.5 py-2.5 text-xs text-text-main placeholder:text-text-subtle focus:outline-none focus:border-border-focus focus:ring-2 focus:ring-border-focus/20 transition-colors resize-none"
          />
          <div className="flex justify-end gap-3 items-center">
            <button
              type="button"
              onClick={() => void closeSelf()}
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
