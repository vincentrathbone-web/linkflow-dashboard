import React, { useState, useEffect } from 'react';
import { LinkItem, LinkSection } from '../types';
import { AVAILABLE_ICONS } from '../data/initialData';

interface AddLinkModalProps {
  isOpen: boolean;
  onClose: () => void;
  sections: LinkSection[];
  onSaveLink: (link: Omit<LinkItem, 'id' | 'createdAt'>, editingId?: string) => void;
  editingLink?: LinkItem | null;
  defaultSectionId?: string;
}

export const AddLinkModal: React.FC<AddLinkModalProps> = ({
  isOpen,
  onClose,
  sections,
  onSaveLink,
  editingLink,
  defaultSectionId,
}) => {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [sectionId, setSectionId] = useState('');
  const [icon, setIcon] = useState('link');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');

  useEffect(() => {
    if (editingLink) {
      setName(editingLink.name);
      setUrl(editingLink.url);
      setSectionId(editingLink.sectionId);
      setIcon(editingLink.icon || 'link');
      setDescription(editingLink.description || '');
      setCategory(editingLink.category || '');
    } else {
      setName('');
      setUrl('');
      setSectionId(defaultSectionId || (sections[0]?.id || ''));
      setIcon('link');
      setDescription('');
      setCategory('');
    }
  }, [editingLink, defaultSectionId, sections, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !url.trim() || !sectionId) return;

    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = 'https://' + formattedUrl;
    }

    onSaveLink(
      {
        name: name.trim(),
        url: formattedUrl,
        sectionId,
        icon,
        description: description.trim(),
        category: category.trim() || 'General',
        isFavorite: editingLink ? editingLink.isFavorite : false,
        isArchived: editingLink ? editingLink.isArchived : false,
      },
      editingLink?.id
    );

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="relative w-full max-w-md bg-surface-elevated rounded-2xl shadow-xl border border-border-main flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border-subtle bg-surface-subtle">
          <h2 className="font-heading text-base font-bold text-text-main">
            {editingLink ? 'Edit Link' : 'Add New Link'}
          </h2>
          <button
            onClick={onClose}
            type="button"
            className="text-text-subtle hover:text-text-main transition-colors rounded-lg p-1 hover:bg-surface-hover focus:outline-none"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Modal Body / Form */}
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          {/* Link Name Input */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="link-name" className="text-xs font-semibold text-text-main">
              Link Name <span className="text-danger">*</span>
            </label>
            <input
              id="link-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Q3 Marketing Assets"
              className="w-full px-3.5 py-2.5 bg-surface rounded-xl border border-border-main text-text-main placeholder:text-text-subtle text-xs focus:border-border-focus focus:ring-2 focus:ring-border-focus/20 focus:outline-none transition-colors"
            />
          </div>

          {/* Destination URL Input */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="dest-url" className="text-xs font-semibold text-text-main">
              Destination URL <span className="text-danger">*</span>
            </label>
            <input
              id="dest-url"
              type="url"
              required
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="w-full px-3.5 py-2.5 bg-surface rounded-xl border border-border-main text-text-main placeholder:text-text-subtle text-xs focus:border-border-focus focus:ring-2 focus:ring-border-focus/20 focus:outline-none transition-colors font-mono"
            />
          </div>

          {/* Section Dropdown */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="section-select" className="text-xs font-semibold text-text-main">
              Section <span className="text-danger">*</span>
            </label>
            <div className="relative">
              <select
                id="section-select"
                required
                value={sectionId}
                onChange={(e) => setSectionId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-surface rounded-xl border border-border-main text-text-main appearance-none focus:border-border-focus focus:ring-2 focus:ring-border-focus/20 focus:outline-none transition-colors text-xs pr-10"
              >
                <option value="" disabled>Select a section</option>
                {sections.map((sec) => (
                  <option key={sec.id} value={sec.id}>
                    {sec.name}
                  </option>
                ))}
              </select>
              <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-text-subtle">
                <span className="material-symbols-outlined text-lg">expand_more</span>
              </div>
            </div>
          </div>

          {/* Icon Picker */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-text-main">
              Tile Icon
            </label>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 rounded-xl border border-border-subtle bg-surface-subtle">
              {AVAILABLE_ICONS.map((ic) => {
                const isSelected = icon === ic;
                return (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => setIcon(ic)}
                    className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${
                      isSelected
                        ? 'bg-brand text-text-inverse font-bold shadow-2xs'
                        : 'bg-surface border border-border-main text-text-muted hover:bg-surface-hover hover:text-text-main'
                    }`}
                  >
                    <span className="material-symbols-outlined text-base">{ic}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Description Optional Input */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="link-desc" className="text-xs font-semibold text-text-main">
              Description (Optional)
            </label>
            <input
              id="link-desc"
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Brief summary or notes"
              className="w-full px-3.5 py-2 bg-surface rounded-xl border border-border-main text-text-main placeholder:text-text-subtle text-xs focus:border-border-focus focus:ring-2 focus:ring-border-focus/20 focus:outline-none transition-colors"
            />
          </div>

          {/* Modal Footer */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-border-subtle mt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-text-muted hover:bg-surface-hover hover:text-text-main transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-brand text-text-inverse hover:bg-brand-hover shadow-xs transition-colors active:scale-95"
            >
              {editingLink ? 'Save Changes' : 'Add Link'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
