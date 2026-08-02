import { useMemo, useState } from 'react';
import { ClipboardPaste, ArrowRight } from 'lucide-react';
import { parseBulkLinks } from '../../lib/parseBulkLinks';

const PLACEHOLDER = `Paste your links, one per line. Any of these work:

https://acme.com/portal
Acme Client Portal - https://acme.com/portal
Budget Tracker: https://docs.google.com/spreadsheets/d/budget
linkedin.com/company/controll`;

export function BulkPasteStep({
  unsortedSectionId,
  onContinue,
  onCancel,
}: {
  unsortedSectionId: string;
  onContinue: (raw: string) => void;
  onCancel?: () => void;
}) {
  const [text, setText] = useState('');
  const preview = useMemo(() => parseBulkLinks(text, unsortedSectionId), [text, unsortedSectionId]);

  return (
    <main className="min-h-screen grid place-items-center bg-surface p-6">
      <div className="w-full max-w-2xl">
        <div className="mb-6 text-center">
          <div className="mx-auto mb-4 grid size-12 place-items-center rounded-2xl bg-brand text-text-inverse">
            <ClipboardPaste size={22} />
          </div>
          <h1 className="font-heading text-2xl font-bold text-text-main">Let's get your links in</h1>
          <p className="mt-1.5 text-sm text-text-muted">
            Paste everything at once — we'll sort it into sections next.
          </p>
        </div>

        <div className="rounded-2xl border border-border-main bg-surface-subtle p-5 shadow-sm">
          <textarea
            autoFocus
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={PLACEHOLDER}
            rows={12}
            className="w-full resize-none rounded-xl border border-border-subtle bg-surface p-4 font-mono text-xs leading-relaxed text-text-main outline-none focus:border-border-focus"
          />

          <div className="mt-4 flex items-center justify-between">
            <div className="text-xs font-medium text-text-muted">
              {preview.length === 0
                ? 'No links detected yet'
                : `${preview.length} link${preview.length === 1 ? '' : 's'} detected`}
            </div>

            <div className="flex items-center gap-3">
              <button
                onClick={() => (onCancel ? onCancel() : onContinue(''))}
                className="text-xs font-semibold text-text-muted hover:text-text-main"
              >
                {onCancel ? 'Cancel' : 'Skip for now'}
              </button>
              <button
                onClick={() => onContinue(text)}
                disabled={preview.length === 0}
                className="flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-xs font-semibold text-text-inverse transition hover:bg-brand-hover disabled:cursor-not-allowed disabled:opacity-40"
              >
                Sort {preview.length > 0 ? `${preview.length} link${preview.length === 1 ? '' : 's'}` : 'links'}
                <ArrowRight size={14} />
              </button>
            </div>
          </div>
        </div>

        {preview.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-1.5">
            {preview.slice(0, 8).map((link) => (
              <span
                key={link.id}
                className="rounded-lg border border-border-subtle bg-surface-subtle px-2.5 py-1 text-[11px] font-medium text-text-muted"
              >
                {link.name}
              </span>
            ))}
            {preview.length > 8 && (
              <span className="rounded-lg px-2.5 py-1 text-[11px] font-medium text-text-subtle">
                +{preview.length - 8} more
              </span>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
