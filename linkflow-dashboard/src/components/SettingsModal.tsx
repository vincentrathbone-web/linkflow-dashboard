import React from 'react';
import { LinkSection, LinkItem, ThemeConfig } from '../types';
import { isDesktopApp } from '../lib/linkflowApi';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  sections: LinkSection[];
  links: LinkItem[];
  theme: ThemeConfig;
  onImportData: (sections: LinkSection[], links: LinkItem[]) => void;
  onImportTheme: (theme: ThemeConfig) => void;
  onResetToDefaults: () => void;
  onExpandAllSections: () => void;
  onCollapseAllSections: () => void;
  catEnabled: boolean;
  onSetCatEnabled: (value: boolean) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  sections,
  links,
  theme,
  onImportData,
  onImportTheme,
  onResetToDefaults,
  onExpandAllSections,
  onCollapseAllSections,
  catEnabled,
  onSetCatEnabled,
}) => {
  if (!isOpen) return null;

  const handleExport = async () => {
    const data = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      sections,
      links,
      theme,
    };
    const contents = JSON.stringify(data, null, 2);
    const fileName = `linkflow-backup-${new Date().toISOString().slice(0, 10)}.json`;

    if (isDesktopApp()) {
      // A plain `<a download>` click on a data: URI (the approach that works
      // in a real browser) does not reliably trigger a save dialog inside the
      // Tauri/WebView2 shell, so desktop saves the file directly instead: a
      // native "Save As" dialog followed by a Rust-side file write.
      const { save } = await import('@tauri-apps/plugin-dialog');
      const { invoke } = await import('@tauri-apps/api/core');
      const path = await save({
        defaultPath: fileName,
        filters: [{ name: 'LinkFlow Backup', extensions: ['json'] }],
      });
      if (!path) return;
      await invoke('write_text_file', { path, contents });
      return;
    }

    const jsonString = `data:text/json;charset=utf-8,${encodeURIComponent(contents)}`;
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', jsonString);
    downloadAnchor.setAttribute('download', fileName);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileReader = new FileReader();
    if (e.target.files && e.target.files[0]) {
      fileReader.readAsText(e.target.files[0], 'UTF-8');
      fileReader.onload = (event) => {
        try {
          const parsed = JSON.parse(event.target?.result as string);
          const hasValidSections = Array.isArray(parsed.sections) && parsed.sections.every(
            (section: unknown) =>
              typeof section === 'object' && section !== null &&
              typeof (section as LinkSection).id === 'string' &&
              typeof (section as LinkSection).name === 'string'
          );
          const hasValidLinks = Array.isArray(parsed.links) && parsed.links.every(
            (link: unknown) =>
              typeof link === 'object' && link !== null &&
              typeof (link as LinkItem).id === 'string' &&
              typeof (link as LinkItem).name === 'string' &&
              typeof (link as LinkItem).url === 'string' &&
              typeof (link as LinkItem).sectionId === 'string'
          );

          if (hasValidSections && hasValidLinks) {
            onImportData(parsed.sections, parsed.links);
            if (isThemeConfig(parsed.theme)) {
              onImportTheme(parsed.theme);
            }
            alert('Successfully imported LinkFlow workspace data!');
            onClose();
          } else {
            alert('Invalid file format. Must contain valid sections and links arrays.');
          }
        } catch (err) {
          alert('Failed to parse JSON file.');
        }
      };
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-lg rounded-2xl bg-surface-elevated shadow-xl border border-border-main flex flex-col overflow-hidden animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-border-subtle flex justify-between items-center bg-surface-subtle">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-brand-text text-xl">settings</span>
            <h2 className="font-heading text-base font-bold text-text-main m-0">
              Workspace Settings
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-text-subtle hover:text-text-main transition-colors p-1 rounded-lg hover:bg-surface-hover"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-6">
          {/* Quick View Controls */}
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
              Section Visibility Quick Controls
            </label>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  onExpandAllSections();
                  onClose();
                }}
                className="flex-1 py-2 px-3 rounded-xl border border-border-subtle bg-surface-subtle hover:bg-surface-hover text-xs font-semibold text-text-main transition-colors flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-base text-brand-text">unfold_more</span>
                Expand All Sections
              </button>
              <button
                type="button"
                onClick={() => {
                  onCollapseAllSections();
                  onClose();
                }}
                className="flex-1 py-2 px-3 rounded-xl border border-border-subtle bg-surface-subtle hover:bg-surface-hover text-xs font-semibold text-text-main transition-colors flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-base text-brand-text">unfold_less</span>
                Collapse All Sections
              </button>
            </div>
          </div>

          {/* Cat Companion */}
          <div className="flex items-center justify-between gap-4 pt-4 border-t border-border-subtle">
            <div className="flex flex-col gap-0.5">
              <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
                Cat Companion
              </label>
              <span className="text-xs text-text-muted">
                A small animated cat that wanders the dashboard and can climb onto section cards.
              </span>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={catEnabled}
              onClick={() => onSetCatEnabled(!catEnabled)}
              className={`relative shrink-0 w-11 h-6 rounded-full transition-colors ${
                catEnabled ? 'bg-brand' : 'bg-surface-active'
              }`}
            >
              <span
                className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  catEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Backup & Data Management */}
          <div className="flex flex-col gap-3 pt-4 border-t border-border-subtle">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
              Backup & Synchronization
            </label>
            <p className="text-xs text-text-muted">
              Export your portal links & custom layout as JSON or import an existing configuration file.
            </p>

            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={handleExport}
                className="flex-1 py-2.5 px-3 rounded-xl bg-brand text-text-inverse hover:bg-brand-hover text-xs font-semibold transition-colors flex items-center justify-center gap-2 shadow-2xs"
              >
                <span className="material-symbols-outlined text-base">download</span>
                Export Workspace JSON
              </button>

              <label className="flex-1 py-2.5 px-3 rounded-xl border border-border-main text-text-main hover:bg-surface-hover text-xs font-semibold transition-colors flex items-center justify-center gap-2 cursor-pointer">
                <span className="material-symbols-outlined text-base">upload</span>
                Import Backup File
                <input
                  type="file"
                  accept=".json"
                  onChange={handleFileUpload}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          {/* Reset Workspace Data */}
          <div className="flex flex-col gap-2 pt-4 border-t border-border-subtle">
            <label className="text-[11px] font-bold text-danger uppercase tracking-wider">
              Reset Workspace
            </label>
            <div className="flex items-center justify-between gap-4">
              <span className="text-xs text-text-muted">
                Restore sample sections and default client portals.
              </span>
              <button
                type="button"
                onClick={() => {
                  if (confirm('Are you sure you want to reset all links and sections to default sample data?')) {
                    onResetToDefaults();
                    onClose();
                  }
                }}
                className="px-3 py-1.5 rounded-xl border border-danger/40 text-danger hover:bg-danger-subtle text-xs font-semibold transition-colors whitespace-nowrap"
              >
                Reset Data
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border-subtle bg-surface-subtle flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-surface-active text-text-main hover:bg-surface-hover transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

function isThemeConfig(value: unknown): value is ThemeConfig {
  if (typeof value !== 'object' || value === null) return false;

  const theme = value as ThemeConfig;
  return (
    ['light', 'dark', 'glass'].includes(theme.preset) &&
    typeof theme.accentColor === 'string' &&
    typeof theme.bgBlur === 'number' &&
    typeof theme.showCanvasImage === 'boolean' &&
    typeof theme.canvasImageUrl === 'string' &&
    typeof theme.cardOpacity === 'number'
  );
}
