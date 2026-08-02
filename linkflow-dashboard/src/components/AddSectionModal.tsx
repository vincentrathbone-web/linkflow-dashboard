import React, { useState, useEffect } from 'react';
import { LinkSection } from '../types';

interface AddSectionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaveSection: (section: Omit<LinkSection, 'id' | 'order'>, editingId?: string) => void;
  editingSection?: LinkSection | null;
}

const SECTION_ICONS = [
  'folder_shared',
  'table_chart',
  'campaign',
  'folder',
  'description',
  'inventory_2',
  'group',
  'business',
  'dataset',
  'link',
];

export const AddSectionModal: React.FC<AddSectionModalProps> = ({
  isOpen,
  onClose,
  onSaveSection,
  editingSection,
}) => {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('folder_shared');
  const [defaultState, setDefaultState] = useState<'expanded' | 'collapsed'>('expanded');
  const [allowCollapse, setAllowCollapse] = useState(true);

  useEffect(() => {
    if (editingSection) {
      setName(editingSection.name);
      setIcon(editingSection.icon);
      setDefaultState(editingSection.defaultState || 'expanded');
      setAllowCollapse(editingSection.allowCollapse);
    } else {
      setName('');
      setIcon('folder_shared');
      setDefaultState('expanded');
      setAllowCollapse(true);
    }
  }, [editingSection, isOpen]);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    onSaveSection(
      {
        name: name.trim(),
        icon,
        defaultState,
        isExpanded: defaultState === 'expanded',
        allowCollapse,
      },
      editingSection?.id
    );

    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-[500px] rounded-2xl bg-surface-elevated shadow-xl border border-border-main flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-border-subtle flex justify-between items-center bg-surface-subtle">
          <h2 className="font-heading text-base font-bold text-text-main m-0">
            {editingSection ? 'Edit Section' : 'Add New Section'}
          </h2>
          <button
            onClick={onClose}
            type="button"
            className="text-text-subtle hover:text-text-main transition-colors p-1 rounded-lg hover:bg-surface-hover focus:outline-none"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Modal Body / Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 flex-1">
          {/* Section Name Input */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="section-name" className="text-xs font-semibold text-text-main">
              Section Name <span className="text-danger">*</span>
            </label>
            <input
              id="section-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Internal Docs, Project X"
              className="w-full bg-surface border border-border-main rounded-xl px-3.5 py-2.5 text-xs text-text-main placeholder:text-text-subtle focus:outline-none focus:border-border-focus focus:ring-2 focus:ring-border-focus/20 transition-colors"
            />
          </div>

          {/* Icon Selection */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-text-main">
              Section Icon
            </label>
            <div className="flex flex-wrap gap-2">
              {SECTION_ICONS.map((ic) => {
                const isSelected = icon === ic;
                return (
                  <button
                    key={ic}
                    type="button"
                    onClick={() => setIcon(ic)}
                    className={`w-9 h-9 rounded-lg flex items-center justify-center border transition-all ${
                      isSelected
                        ? 'bg-brand text-text-inverse border-brand shadow-2xs'
                        : 'bg-surface text-text-muted border-border-main hover:bg-surface-hover hover:text-text-main'
                    }`}
                  >
                    <span className="material-symbols-outlined text-lg">{ic}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Default State Segmented Control */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-text-main">
              Default State
            </label>
            <div className="flex bg-surface-subtle p-1 rounded-xl border border-border-subtle">
              <button
                type="button"
                onClick={() => setDefaultState('expanded')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold text-center transition-colors ${
                  defaultState === 'expanded'
                    ? 'bg-surface text-text-main shadow-2xs'
                    : 'text-text-muted hover:text-text-main'
                }`}
              >
                Expanded
              </button>
              <button
                type="button"
                onClick={() => setDefaultState('collapsed')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold text-center transition-colors ${
                  defaultState === 'collapsed'
                    ? 'bg-surface text-text-main shadow-2xs'
                    : 'text-text-muted hover:text-text-main'
                }`}
              >
                Collapsed
              </button>
            </div>
          </div>

          {/* Allow Collapse Checkbox */}
          <label className="flex items-center gap-2.5 cursor-pointer group mt-2 w-max select-none">
            <input
              type="checkbox"
              checked={allowCollapse}
              onChange={(e) => setAllowCollapse(e.target.checked)}
              className="w-4 h-4 rounded text-brand focus:ring-border-focus border-border-main"
            />
            <span className="text-xs font-medium text-text-main group-hover:text-text-main transition-colors">
              Allow users to collapse
            </span>
          </label>

          {/* Modal Footer */}
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
              className="px-4 py-2 rounded-xl text-xs font-semibold bg-brand text-text-inverse hover:bg-brand-hover shadow-xs transition-colors active:scale-95"
            >
              {editingSection ? 'Save Section' : 'Create Section'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
