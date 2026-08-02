import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronUp, Clipboard, Trash2 } from 'lucide-react';
import {
  clearSyncLogs,
  exportSyncLogs,
  getSyncLogs,
  subscribeSyncLogs,
  type SyncLogEntry,
} from '../lib/syncDiagnostics';

const levelStyles: Record<SyncLogEntry['level'], string> = {
  debug: 'border-slate-700 bg-slate-950 text-slate-300',
  info: 'border-sky-900 bg-sky-950/50 text-sky-100',
  success: 'border-emerald-900 bg-emerald-950/50 text-emerald-100',
  warning: 'border-amber-800 bg-amber-950/50 text-amber-100',
  error: 'border-red-800 bg-red-950/60 text-red-100',
};

export function SyncDiagnosticsPanel({ standalone = false }: { standalone?: boolean } = {}) {
  const [logs, setLogs] = useState(getSyncLogs);
  const [isOpen, setIsOpen] = useState(true);
  const [copyState, setCopyState] = useState('Copy log');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => subscribeSyncLogs(setLogs), []);

  useEffect(() => {
    if (isOpen) scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [isOpen, logs]);

  const errorCount = useMemo(() => logs.filter((entry) => entry.level === 'error').length, [logs]);
  const warningCount = useMemo(() => logs.filter((entry) => entry.level === 'warning').length, [logs]);

  async function copyLogs() {
    try {
      await navigator.clipboard.writeText(exportSyncLogs());
      setCopyState('Copied');
    } catch {
      setCopyState('Copy failed');
    }
    window.setTimeout(() => setCopyState('Copy log'), 1800);
  }

  const containerClass = standalone
    ? 'flex h-screen w-full flex-col overflow-hidden bg-slate-950 text-slate-100'
    : `fixed bottom-3 right-3 z-[10000] overflow-hidden rounded-xl border border-slate-700 bg-slate-950 text-slate-100 shadow-2xl ${isOpen ? 'w-[min(720px,calc(100vw-1.5rem))]' : 'w-auto'}`;

  return (
    <aside className={containerClass}>
      <header className="flex min-h-11 shrink-0 items-center gap-2 border-b border-slate-700 bg-slate-900 px-3 py-2">
        <button className="flex flex-1 items-center gap-2 text-left" onClick={() => setIsOpen((open) => !open)} type="button" disabled={standalone}>
          <span className="size-2.5 animate-pulse rounded-full bg-emerald-400" />
          <span className="text-xs font-bold uppercase tracking-[0.14em]">{standalone ? 'LinkFlow sync diagnostics' : 'Temporary sync diagnostics'}</span>
          <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">{logs.length} events</span>
          {warningCount > 0 && <span className="rounded bg-amber-950 px-1.5 py-0.5 text-[10px] text-amber-200">{warningCount} warnings</span>}
          {errorCount > 0 && <span className="rounded bg-red-950 px-1.5 py-0.5 text-[10px] text-red-200">{errorCount} errors</span>}
        </button>
        {(isOpen || standalone) && (
          <>
            <button className="flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-[11px] hover:bg-slate-800" onClick={copyLogs} type="button"><Clipboard size={12} />{copyState}</button>
            <button className="flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-[11px] hover:bg-slate-800" onClick={clearSyncLogs} type="button"><Trash2 size={12} />Clear</button>
          </>
        )}
        {!standalone && (
          <button aria-label={isOpen ? 'Collapse diagnostics' : 'Open diagnostics'} className="rounded p-1 hover:bg-slate-800" onClick={() => setIsOpen((open) => !open)} type="button">
            {isOpen ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
        )}
      </header>

      {(isOpen || standalone) && (
        <div ref={scrollRef} className={`space-y-2 overflow-y-auto p-2 font-mono text-[11px] leading-relaxed ${standalone ? 'flex-1' : 'max-h-[48vh]'}`}>
          {logs.length === 0 && <p className="p-3 text-slate-400">Waiting for a synchronization event…</p>}
          {logs.map((entry) => (
            <details className={`rounded-lg border px-2.5 py-2 ${levelStyles[entry.level]}`} key={entry.id} open={entry.level === 'error'}>
              <summary className="cursor-pointer select-text list-none">
                <span className="mr-2 opacity-60">{new Date(entry.timestamp).toLocaleTimeString()}</span>
                <span className="mr-2 font-bold uppercase">{entry.level}</span>
                <span className="mr-2 rounded bg-black/25 px-1.5 py-0.5">{entry.area}</span>
                <span>{entry.message}</span>
              </summary>
              {entry.details !== undefined && (
                <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap break-all border-t border-current/20 pt-2 text-[10px] opacity-90">{JSON.stringify(entry.details, null, 2)}</pre>
              )}
            </details>
          ))}
        </div>
      )}
    </aside>
  );
}
