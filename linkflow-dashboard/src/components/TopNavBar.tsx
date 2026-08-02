import React, { useState, useRef, useEffect } from 'react';
import { NavTab, ThemeConfig } from '../types';
import { ThemeDropdown } from './ThemeDropdown';

interface TopNavBarProps {
  activeTab: NavTab;
  onSelectTab: (tab: NavTab) => void;
  theme: ThemeConfig;
  onUpdateTheme: (updates: Partial<ThemeConfig>) => void;
  onOpenAddLink: () => void;
  onOpenAddSection: () => void;
  onOpenBulkImport: () => void;
  onOpenSettings: () => void;
  onOpenAdvancedTheme: () => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  userDisplayName?: string;
  onSignOut: () => void;
  onOpenDiagnostics: () => void;
  hasSections: boolean;
  catEnabled: boolean;
  onSetCatEnabled: (value: boolean) => void;
}

export const TopNavBar: React.FC<TopNavBarProps> = ({
  activeTab,
  onSelectTab,
  theme,
  onUpdateTheme,
  onOpenAddLink,
  onOpenAddSection,
  onOpenBulkImport,
  onOpenSettings,
  onOpenAdvancedTheme,
  searchQuery,
  onSearchChange,
  userDisplayName,
  onSignOut,
  onOpenDiagnostics,
  hasSections,
  catEnabled,
  onSetCatEnabled,
}) => {
  const [isThemeOpen, setIsThemeOpen] = useState(false);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (addMenuRef.current && !addMenuRef.current.contains(e.target as Node)) {
        setIsAddMenuOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const initials = (userDisplayName ?? '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';

  const navItems: { id: NavTab; label: string }[] = [
    { id: 'dashboard', label: 'Dashboard' },
    { id: 'collections', label: 'Collections' },
    { id: 'archive', label: 'Archive' },
  ];

  return (
    <nav className="fixed top-0 w-full z-40 bg-surface border-b border-border-main shadow-xs transition-colors duration-200">
      <div className="flex justify-between items-center h-16 px-4 md:px-8 max-w-7xl mx-auto">
        {/* Brand & Main Nav */}
        <div className="flex items-center gap-6 md:gap-8">
          <div
            onClick={() => onSelectTab('dashboard')}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-xl bg-brand flex items-center justify-center text-text-inverse shadow-sm group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-xl">hub</span>
            </div>
            <span className="font-heading text-xl md:text-2xl font-bold tracking-tight text-text-main">
              LinkFlow
            </span>
          </div>

          {/* Desktop Navigation Links */}
          <div className="hidden md:flex items-center gap-1 font-medium text-sm">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectTab(item.id)}
                  className={`px-3.5 py-1.5 rounded-lg transition-all duration-200 text-xs font-semibold tracking-wide ${
                    isActive
                      ? 'text-text-main bg-surface-active shadow-2xs'
                      : 'text-text-muted hover:text-text-main hover:bg-surface-hover'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
            <span className="mx-1 h-4 w-px bg-border-subtle" />
            <button
              onClick={onOpenDiagnostics}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold tracking-wide text-text-subtle transition-all duration-200 hover:bg-surface-hover hover:text-text-muted"
              title="Open sync diagnostics in a separate window"
            >
              <span className="material-symbols-outlined text-sm">bug_report</span>
              Sync log
            </button>
          </div>
        </div>

        {/* Search Bar (Mid/Large screens) */}
        <div className="hidden lg:flex items-center relative w-64 xl:w-80 mx-4">
          <span className="material-symbols-outlined absolute left-3 text-text-subtle text-lg pointer-events-none">
            search
          </span>
          <input
            type="text"
            placeholder="Search links, portals & tags..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="w-full pl-9 pr-8 py-1.5 text-xs rounded-lg bg-surface-subtle border border-border-subtle text-text-main placeholder:text-text-subtle focus:outline-none focus:ring-2 focus:ring-border-focus focus:border-border-focus transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => onSearchChange('')}
              className="absolute right-2.5 text-text-subtle hover:text-text-main text-xs"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          )}
        </div>

        {/* Trailing Actions */}
        <div className="flex items-center gap-2 md:gap-3 relative">
          {/* Theme Selector Button */}
          <div className="relative">
            <button
              onClick={() => setIsThemeOpen(!isThemeOpen)}
              className={`hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold tracking-wide transition-all border ${
                isThemeOpen
                  ? 'bg-surface-subtle text-text-main border-border-main'
                  : 'text-text-muted border-border-subtle hover:bg-surface-subtle'
              }`}
              title="Toggle Theme Options"
            >
              <span className="material-symbols-outlined text-base">palette</span>
              <span>Theme</span>
              <span className="material-symbols-outlined text-base">
                {isThemeOpen ? 'expand_less' : 'expand_more'}
              </span>
            </button>

            {/* Quick Palette Icon Button (mobile) */}
            <button
              onClick={() => setIsThemeOpen(!isThemeOpen)}
              className={`sm:hidden p-2 rounded-lg border transition-colors ${
                isThemeOpen
                  ? 'text-text-main bg-surface-subtle border-border-main'
                  : 'text-text-muted border-border-subtle hover:bg-surface-subtle'
              }`}
              title="Theme Settings"
            >
              <span className="material-symbols-outlined text-lg">palette</span>
            </button>

            {/* Theme Dropdown Menu */}
            {isThemeOpen && (
              <ThemeDropdown
                theme={theme}
                onUpdateTheme={onUpdateTheme}
                onOpenAdvanced={onOpenAdvancedTheme}
                onClose={() => setIsThemeOpen(false)}
                catEnabled={catEnabled}
                onSetCatEnabled={onSetCatEnabled}
              />
            )}
          </div>

          {/* Settings Button */}
          <button
            onClick={onOpenSettings}
            className="p-2 rounded-lg text-text-muted border border-border-main hover:bg-surface-hover hover:text-text-main transition-colors"
            title="Workspace Preferences"
          >
            <span className="material-symbols-outlined text-lg">settings</span>
          </button>

          {/* Add Dropdown Menu */}
          <div className="relative" ref={addMenuRef}>
            <button
              onClick={() => setIsAddMenuOpen(!isAddMenuOpen)}
              className="bg-brand hover:bg-brand-hover text-text-inverse font-semibold text-xs px-3.5 py-1.5 rounded-lg flex items-center gap-1.5 transition-colors shadow-xs active:scale-95"
            >
              <span className="material-symbols-outlined text-base">add</span>
              <span>Add</span>
            </button>

            {isAddMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 glass-panel rounded-xl shadow-xl border border-border-main p-1.5 z-50 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-150">
                <button
                  onClick={() => {
                    if (!hasSections) return;
                    setIsAddMenuOpen(false);
                    onOpenAddLink();
                  }}
                  disabled={!hasSections}
                  title={hasSections ? undefined : 'Create a section first'}
                  className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-text-main hover:bg-surface-hover rounded-lg transition-colors text-left disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent"
                >
                  <span className="material-symbols-outlined text-brand-text text-base">add_link</span>
                  <span>Add New Link</span>
                </button>
                <button
                  onClick={() => {
                    setIsAddMenuOpen(false);
                    onOpenAddSection();
                  }}
                  className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-text-main hover:bg-surface-hover rounded-lg transition-colors text-left"
                >
                  <span className="material-symbols-outlined text-brand-text text-base">folder_open</span>
                  <span>Add New Section</span>
                </button>
                <div className="my-1 h-px bg-border-subtle" />
                <button
                  onClick={() => {
                    setIsAddMenuOpen(false);
                    onOpenBulkImport();
                  }}
                  className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-text-main hover:bg-surface-hover rounded-lg transition-colors text-left"
                >
                  <span className="material-symbols-outlined text-brand-text text-base">content_paste_go</span>
                  <span>Bulk Import Links</span>
                </button>
              </div>
            )}
          </div>

          {/* User Menu */}
          <div className="relative ml-1" ref={userMenuRef}>
            <button
              onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
              className="grid size-8 place-items-center rounded-full border border-border-main bg-brand text-xs font-semibold text-text-inverse shadow-2xs cursor-pointer hover:ring-2 hover:ring-border-focus transition-all"
              title={userDisplayName || 'Account'}
            >
              {initials}
            </button>

            {isUserMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 glass-panel rounded-xl shadow-xl border border-border-main p-1.5 z-50 flex flex-col gap-1 animate-in fade-in zoom-in-95 duration-150">
                {userDisplayName && (
                  <div className="px-3 py-2 text-xs font-medium text-text-muted truncate">{userDisplayName}</div>
                )}
                <button
                  onClick={() => {
                    setIsUserMenuOpen(false);
                    onSignOut();
                  }}
                  className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-text-main hover:bg-surface-hover rounded-lg transition-colors text-left"
                >
                  <span className="material-symbols-outlined text-brand-text text-base">logout</span>
                  <span>Sign out</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mobile Nav Subbar */}
      <div className="flex md:hidden items-center justify-around border-t border-border-main py-2 px-2 bg-surface">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectTab(item.id)}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                isActive
                  ? 'bg-brand text-text-inverse font-semibold'
                  : 'text-text-muted hover:text-text-main'
              }`}
            >
              {item.label}
            </button>
          );
        })}
      </div>
    </nav>
  );
};
