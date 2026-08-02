import React, { useState } from 'react';
import { LinkItem } from '../types';
import { LinkTile } from './LinkTile';

interface CollectionsViewProps {
  links: LinkItem[];
  onEditLink: (link: LinkItem) => void;
  onToggleFavorite: (id: string) => void;
  onArchiveLink: (id: string) => void;
  onIncrementClick: (id: string) => void;
  onOpenAddLink: () => void;
  searchQuery: string;
}

export const CollectionsView: React.FC<CollectionsViewProps> = ({
  links,
  onEditLink,
  onToggleFavorite,
  onArchiveLink,
  onIncrementClick,
  onOpenAddLink,
  searchQuery,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const activeLinks = links.filter((l) => !l.isArchived);

  // Extract unique categories
  const categories = ['All', 'Favorites', ...Array.from(new Set(activeLinks.map((l) => l.category || 'General')))];

  let filteredLinks = activeLinks;
  if (selectedCategory === 'Favorites') {
    filteredLinks = filteredLinks.filter((l) => l.isFavorite);
  } else if (selectedCategory !== 'All') {
    filteredLinks = filteredLinks.filter((l) => (l.category || 'General') === selectedCategory);
  }

  if (searchQuery.trim()) {
    const q = searchQuery.toLowerCase();
    filteredLinks = filteredLinks.filter(
      (l) =>
        l.name.toLowerCase().includes(q) ||
        l.url.toLowerCase().includes(q) ||
        (l.description && l.description.toLowerCase().includes(q))
    );
  }

  return (
    <div className="pt-22 pb-16 px-4 sm:px-8 md:px-10 max-w-7xl mx-auto w-full">
      {/* Header */}
      <header className="mb-6">
        <h1 className="font-heading text-2xl md:text-3xl font-bold text-text-main tracking-tight mb-1">
          Collections
        </h1>
        <p className="text-xs md:text-sm text-text-muted">
          Browse links by topic, project category, or starred favorites.
        </p>
      </header>

      {/* Category Filter Pills */}
      <div className="flex items-center gap-2 overflow-x-auto pb-3 mb-6 scrollbar-none">
        {categories.map((cat) => {
          const isActive = selectedCategory === cat;
          return (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-4 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                isActive
                  ? 'bg-brand text-text-inverse shadow-2xs'
                  : 'bg-surface text-text-muted hover:bg-surface-hover border border-border-main'
              }`}
            >
              {cat === 'Favorites' ? '⭐ Favorites' : cat}
            </button>
          );
        })}
      </div>

      {/* Content Grid */}
      {filteredLinks.length === 0 ? (
        <div className="glass-card rounded-2xl p-12 text-center flex flex-col items-center justify-center border border-dashed border-border-main">
          <span className="material-symbols-outlined text-4xl text-brand-text mb-2">collections_bookmark</span>
          <p className="text-sm font-semibold text-text-main mb-1">
            No links in "{selectedCategory}" collection.
          </p>
          <button
            onClick={onOpenAddLink}
            className="mt-3 text-xs font-semibold text-brand-text hover:underline"
          >
            + Add New Link
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3.5">
          {filteredLinks.map((link, idx) => (
            <LinkTile
              key={link.id}
              link={link}
              index={idx}
              onEdit={onEditLink}
              onToggleFavorite={onToggleFavorite}
              onArchive={onArchiveLink}
              onIncrementClick={onIncrementClick}
            />
          ))}
        </div>
      )}
    </div>
  );
};
