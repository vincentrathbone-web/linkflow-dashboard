import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { LinkSection, LinkItem } from '../types';
import { LinkTile } from './LinkTile';
import { DailyInspirationBubble } from './DailyInspirationBubble';

interface DashboardViewProps {
  sections: LinkSection[];
  links: LinkItem[];
  onToggleSection: (id: string) => void;
  onEditSection: (section: LinkSection) => void;
  onDeleteSection: (id: string) => void;
  onOpenAddLinkForSection: (sectionId: string) => void;
  onOpenAddSection: () => void;
  onEditLink: (link: LinkItem) => void;
  onToggleFavorite: (id: string) => void;
  onArchiveLink: (id: string) => void;
  onIncrementClick: (id: string) => void;
  onOpenSort: () => void;
  searchQuery: string;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  sections,
  links,
  onToggleSection,
  onEditSection,
  onDeleteSection,
  onOpenAddLinkForSection,
  onOpenAddSection,
  onEditLink,
  onToggleFavorite,
  onArchiveLink,
  onIncrementClick,
  onOpenSort,
  searchQuery,
}) => {
  const activeLinks = links.filter((l) => !l.isArchived);

  return (
    <div className="pt-22 pb-16 px-4 sm:px-8 md:px-10 max-w-7xl mx-auto w-full">
      {/* Header */}
      <header className="mb-8 text-left flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl md:text-3xl font-bold text-text-main tracking-tight mb-1">
            Dashboard
          </h1>
          <p className="text-xs md:text-sm text-text-muted font-normal">
            Manage and access your vital client portals, worksheets, and online tools.
          </p>
        </div>

        <div className="flex flex-col items-start md:items-end gap-2 self-start md:self-auto">
          <DailyInspirationBubble />

          {/* Quick Filter Info if Search Query Active */}
          {searchQuery && (
          <div className="bg-brand-subtle border border-brand/30 text-brand-text px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-2">
            <span>Filtering: "{searchQuery}"</span>
          </div>
          )}
        </div>
      </header>

      {/* Sections Container */}
      <div className="flex flex-col gap-6">
        {sections.length === 0 ? (
          <div className="glass-card rounded-2xl p-12 text-center flex flex-col items-center justify-center border border-dashed border-border-main">
            <span className="material-symbols-outlined text-4xl text-brand-text mb-3">folder_open</span>
            <h3 className="text-base font-bold text-text-main mb-1">
              No Sections Created Yet
            </h3>
            <p className="text-xs text-text-muted mb-4 max-w-md">
              Organize your portals, spreadsheets, and resources into collapsible canvas sections.
            </p>
            <button
              onClick={onOpenAddSection}
              className="bg-brand text-text-inverse font-semibold text-xs px-4 py-2 rounded-lg hover:bg-brand-hover shadow-xs transition-colors"
            >
              + Create First Section
            </button>
          </div>
        ) : (
          sections.map((section, sectionIdx) => {
            let sectionLinks = activeLinks.filter((l) => l.sectionId === section.id);

            // Filter if searchQuery exists
            if (searchQuery.trim()) {
              const q = searchQuery.toLowerCase();
              sectionLinks = sectionLinks.filter(
                (l) =>
                  l.name.toLowerCase().includes(q) ||
                  l.url.toLowerCase().includes(q) ||
                  (l.description && l.description.toLowerCase().includes(q)) ||
                  (l.category && l.category.toLowerCase().includes(q))
              );
            }

            const isExpanded = section.isExpanded;

            return (
              <motion.section
                key={section.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  duration: 0.35,
                  delay: sectionIdx * 0.06,
                  ease: [0.215, 0.61, 0.355, 1],
                }}
                className={`glass-card rounded-xl overflow-hidden transition-all duration-300 ${
                  !isExpanded ? 'collapsed-parent' : ''
                }`}
                data-state={isExpanded ? 'expanded' : 'collapsed'}
                data-cat-perch="true"
                data-cat-perch-id={section.id}
              >
                {/* Section Header */}
                <div className="w-full flex justify-between items-center px-4 py-3 border-b border-border-subtle bg-surface/50 hover:bg-surface/80 transition-colors">
                  <button
                    type="button"
                    onClick={() => onToggleSection(section.id)}
                    className="flex-1 flex items-center gap-3 text-left focus:outline-none"
                  >
                    <div className="w-8 h-8 rounded-lg bg-surface-subtle border border-border-subtle flex items-center justify-center text-text-muted">
                      <span className="material-symbols-outlined text-lg">{section.icon || 'folder'}</span>
                    </div>
                    <h2 className="font-heading text-sm sm:text-base font-bold text-text-main tracking-tight">
                      {section.name}
                    </h2>
                    <span className="bg-surface-subtle border border-border-subtle text-text-muted font-mono text-[11px] px-2 py-0.5 rounded-md font-semibold">
                      {sectionLinks.length}
                    </span>
                  </button>

                  {/* Header Trailing Controls */}
                  <div className="flex items-center gap-1 ml-2">
                    <button
                      type="button"
                      onClick={() => onOpenAddLinkForSection(section.id)}
                      className="px-2 py-1 rounded-md text-text-muted hover:text-text-main hover:bg-surface-subtle transition-colors text-xs font-medium flex items-center gap-1"
                      title="Add Link to this section"
                    >
                      <span className="material-symbols-outlined text-base">add</span>
                      <span className="hidden sm:inline text-xs">Add Link</span>
                    </button>

                    <button
                      type="button"
                      onClick={onOpenSort}
                      className="px-2 py-1 rounded-md text-text-muted hover:text-text-main hover:bg-surface-subtle transition-colors text-xs font-medium flex items-center gap-1"
                      title="Sort links across sections"
                    >
                      <span className="material-symbols-outlined text-base">swap_vert</span>
                      <span className="hidden sm:inline text-xs">Sort</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onEditSection(section)}
                      className="p-1 rounded-md text-text-subtle hover:text-text-main hover:bg-surface-subtle transition-colors"
                      title="Section Settings"
                    >
                      <span className="material-symbols-outlined text-base">edit</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => onDeleteSection(section.id)}
                      className="p-1 rounded-md text-text-subtle hover:text-danger hover:bg-surface-subtle transition-colors"
                      title="Delete Section"
                    >
                      <span className="material-symbols-outlined text-base">delete</span>
                    </button>

                    {section.allowCollapse && (
                      <button
                        type="button"
                        onClick={() => onToggleSection(section.id)}
                        className="p-1 rounded-md text-text-subtle hover:text-text-main transition-colors ml-1"
                        title={isExpanded ? 'Collapse section' : 'Expand section'}
                      >
                        <span className="material-symbols-outlined chevron text-xl">
                          expand_less
                        </span>
                      </button>
                    )}
                  </div>
                </div>

                {/* Section Content */}
                <div
                  className={`section-content p-3 sm:p-5 bg-canvas/50 ${
                    !isExpanded ? 'collapsed' : ''
                  }`}
                >
                  {sectionLinks.length === 0 ? (
                    <div className="py-8 text-center flex flex-col items-center justify-center border border-dashed border-border-subtle rounded-lg bg-surface/40">
                      <p className="text-xs text-text-muted mb-2 font-medium">
                        No links in {section.name}.
                      </p>
                      <button
                        onClick={() => onOpenAddLinkForSection(section.id)}
                        className="text-xs text-brand-text font-semibold hover:underline flex items-center gap-1"
                      >
                        <span className="material-symbols-outlined text-sm">add_circle</span>
                        Add a link
                      </button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3 sm:gap-4">
                      {sectionLinks.map((link, linkIdx) => (
                        <LinkTile
                          key={link.id}
                          link={link}
                          index={linkIdx}
                          onEdit={onEditLink}
                          onToggleFavorite={onToggleFavorite}
                          onArchive={onArchiveLink}
                          onIncrementClick={onIncrementClick}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </motion.section>
            );
          })
        )}

        {/* Add Section Launcher Bar */}
        <div className="mt-1 text-center">
          <button
            onClick={onOpenAddSection}
            className="w-full py-3 border border-dashed border-border-main hover:border-border-focus rounded-xl bg-surface/40 text-text-muted hover:text-text-main transition-all flex items-center justify-center gap-2 font-semibold text-xs group shadow-2xs"
          >
            <div className="w-5 h-5 rounded-full bg-surface-subtle text-text-muted flex items-center justify-center group-hover:bg-brand group-hover:text-text-inverse transition-colors">
              <span className="material-symbols-outlined text-xs">add</span>
            </div>
            <span>Add New Section</span>
          </button>
        </div>
      </div>
    </div>
  );
};
