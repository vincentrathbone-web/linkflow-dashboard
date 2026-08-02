import React, { useEffect, useState } from 'react';
import { getDailyInspiration, hasCloudBackend, DailyInspiration } from '../lib/linkflowApi';

type Mode = 'quote' | 'verse' | 'off';

const STORAGE_KEY = 'linkflow_daily_inspiration_mode';

function loadMode(): Mode {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === 'quote' || stored === 'verse' || stored === 'off' ? stored : 'quote';
}

const NEXT_MODE: Record<Mode, Mode> = { quote: 'verse', verse: 'off', off: 'quote' };
const MODE_LABEL: Record<Mode, string> = { quote: 'Daily quote', verse: 'Daily verse', off: 'Hidden' };
const MODE_ICON: Record<Mode, string> = { quote: 'auto_awesome', verse: 'menu_book', off: 'visibility_off' };

export const DailyInspirationBubble: React.FC = () => {
  const [mode, setMode] = useState<Mode>(loadMode);
  const [data, setData] = useState<DailyInspiration | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'unavailable'>('loading');

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, mode);
    if (mode === 'off') {
      setData(null);
      return;
    }
    if (!hasCloudBackend()) {
      setData(null);
      setStatus('unavailable');
      return;
    }
    let cancelled = false;
    setStatus('loading');
    getDailyInspiration(mode)
      .then((result) => {
        if (cancelled) return;
        if (result?.text) {
          setData(result);
          setStatus('ready');
        } else {
          setData(null);
          setStatus('unavailable');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setData(null);
          setStatus('unavailable');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const cycleMode = () => setMode((current) => NEXT_MODE[current]);

  if (mode === 'off') {
    return (
      <button
        type="button"
        onClick={cycleMode}
        title="Show a daily quote or Bible verse"
        className="self-start md:self-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-dashed border-border-main text-text-muted hover:text-text-main hover:border-border-focus transition-colors text-[11px] font-medium"
      >
        <span className="material-symbols-outlined text-sm">auto_awesome</span>
        Show daily inspiration
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={cycleMode}
      title={
        status === 'ready'
          ? `${MODE_LABEL[mode]} — click to switch (${data?.source ?? ''})`
          : `${MODE_LABEL[mode]} — click to switch`
      }
      className="glass-card group max-w-[90vw] sm:max-w-[50vw] text-left rounded-2xl border border-border-subtle hover:border-border-focus transition-colors overflow-hidden"
    >
      <span className="bg-surface/50 group-hover:bg-surface/80 flex items-start gap-2 px-3.5 py-2 transition-colors">
        <span className="material-symbols-outlined text-brand-text text-base mt-0.5 shrink-0">
          {MODE_ICON[mode]}
        </span>
        {status === 'loading' && (
          <span className="text-xs text-text-muted italic">Loading {MODE_LABEL[mode].toLowerCase()}…</span>
        )}
        {status === 'unavailable' && (
          <span className="text-xs text-text-muted italic">
            {MODE_LABEL[mode]} unavailable right now — click to switch
          </span>
        )}
        {status === 'ready' && data && (
          <span className="min-w-0 flex flex-col">
            <span className="text-xs text-text-main font-medium leading-snug">
              &ldquo;{data.text}&rdquo;
            </span>
            <span className="text-[10.5px] text-text-muted mt-0.5">
              {data.type === 'verse' ? data.reference : `— ${data.author ?? 'Unknown'}`}
            </span>
          </span>
        )}
      </span>
    </button>
  );
};
