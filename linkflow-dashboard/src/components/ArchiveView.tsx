import React from 'react';
import { LinkItem } from '../types';

interface ArchiveViewProps {
  links: LinkItem[];
  onRestoreLink: (id: string) => void;
  onDeletePermanently: (id: string) => void;
  onClearArchive: () => void;
}

export const ArchiveView: React.FC<ArchiveViewProps> = ({
  links,
  onRestoreLink,
  onDeletePermanently,
  onClearArchive,
}) => {
  const archivedLinks = links.filter((l) => l.isArchived);

  return (
    <div className="pt-22 pb-16 px-4 sm:px-8 md:px-10 max-w-7xl mx-auto w-full">
      {/* Header */}
      <header className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-bold text-text-main tracking-tight mb-1">
            Archive
          </h1>
          <p className="text-xs md:text-sm text-text-muted">
            Archived links recede from your dashboard without losing their statistics or configurations.
          </p>
        </div>

        {archivedLinks.length > 0 && (
          <button
            onClick={() => {
              if (confirm('Permanently delete all archived links? This cannot be undone.')) {
                onClearArchive();
              }
            }}
            className="px-3.5 py-2 rounded-xl text-xs font-semibold border border-danger/30 text-danger hover:bg-danger-subtle transition-colors self-start md:self-auto"
          >
            Empty Archive
          </button>
        )}
      </header>

      {/* List */}
      {archivedLinks.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center flex flex-col items-center justify-center border border-dashed border-border-main">
          <span className="material-symbols-outlined text-4xl text-text-subtle mb-2">archive</span>
          <p className="text-sm font-semibold text-text-main mb-1">
            Archive is empty
          </p>
          <p className="text-xs text-text-muted">
            Links you archive from your dashboard tiles will appear here for easy recovery.
          </p>
        </div>
      ) : (
        <div className="glass-card rounded-2xl border border-border-main divide-y divide-border-subtle overflow-hidden">
          {archivedLinks.map((link) => (
            <div
              key={link.id}
              className="p-4 flex items-center justify-between gap-4 hover:bg-surface/80 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-surface-subtle border border-border-subtle flex items-center justify-center text-brand-text">
                  <span className="material-symbols-outlined">{link.icon || 'link'}</span>
                </div>
                <div>
                  <h4 className="text-xs md:text-sm font-bold text-text-main">
                    {link.name}
                  </h4>
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs text-brand-text hover:underline font-mono"
                  >
                    {link.url}
                  </a>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => onRestoreLink(link.id)}
                  className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-brand-subtle text-brand-text border border-brand/30 hover:bg-brand-subtle/70 transition-colors flex items-center gap-1"
                  title="Restore to Dashboard"
                >
                  <span className="material-symbols-outlined text-xs">unarchive</span>
                  <span>Restore</span>
                </button>

                <button
                  onClick={() => onDeletePermanently(link.id)}
                  className="p-1.5 rounded-lg text-danger hover:bg-danger-subtle transition-colors"
                  title="Delete Permanently"
                >
                  <span className="material-symbols-outlined text-base">delete_forever</span>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
