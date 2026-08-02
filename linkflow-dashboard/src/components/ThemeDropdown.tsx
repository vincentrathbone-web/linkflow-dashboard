import React from 'react';
import { ThemeConfig, ThemePreset } from '../types';
import { QUICK_ACCENT_COLORS } from '../data/accentColors';

interface ThemeDropdownProps {
  theme: ThemeConfig;
  onUpdateTheme: (updates: Partial<ThemeConfig>) => void;
  onOpenAdvanced: () => void;
  onClose: () => void;
}

export const ThemeDropdown: React.FC<ThemeDropdownProps> = ({
  theme,
  onUpdateTheme,
  onOpenAdvanced,
  onClose,
}) => {
  return (
    <div
      className="absolute top-14 right-0 w-80 glass-panel rounded-2xl shadow-xl p-5 flex flex-col gap-4 z-50 origin-top-right animate-in fade-in zoom-in-95 duration-150 border border-border-main"
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className="flex justify-between items-center pb-2 border-b border-border-subtle">
        <h3 className="font-heading text-sm font-bold text-text-main">
          Theme Customization
        </h3>
        <button
          onClick={onClose}
          className="text-text-subtle hover:text-text-main rounded-lg p-1 hover:bg-surface-hover transition-colors"
          title="Close theme menu"
        >
          <span className="material-symbols-outlined text-base">close</span>
        </button>
      </div>

      {/* Presets */}
      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
          Presets
        </span>
        <div className="grid grid-cols-3 gap-2">
          {/* Light Preset */}
          <button
            onClick={() => onUpdateTheme({ preset: 'light', showCanvasImage: false })}
            className={`flex flex-col items-center justify-center p-2.5 rounded-xl border transition-all text-xs font-semibold ${
              theme.preset === 'light' && !theme.showCanvasImage
                ? 'border-border-focus bg-brand-subtle text-brand-text shadow-2xs'
                : 'border-border-subtle bg-surface text-text-muted hover:bg-surface-hover hover:text-text-main'
            }`}
          >
            <span className="material-symbols-outlined mb-1 text-lg">light_mode</span>
            <span>Light</span>
          </button>

          {/* Dark Preset */}
          <button
            onClick={() => onUpdateTheme({ preset: 'dark', showCanvasImage: false })}
            className={`flex flex-col items-center justify-center p-2.5 rounded-xl border transition-all text-xs font-semibold ${
              theme.preset === 'dark'
                ? 'border-border-focus bg-surface-active text-text-main shadow-2xs'
                : 'border-border-subtle bg-surface text-text-muted hover:bg-surface-hover hover:text-text-main'
            }`}
          >
            <span className="material-symbols-outlined mb-1 text-lg">dark_mode</span>
            <span>Dark</span>
          </button>

          {/* Glass Desktop Preset */}
          <button
            onClick={() => onUpdateTheme({ preset: 'glass', showCanvasImage: true })}
            className={`flex flex-col items-center justify-center p-2.5 rounded-xl border transition-all text-xs font-semibold ${
              theme.preset === 'glass' || theme.showCanvasImage
                ? 'border-border-focus bg-brand-subtle text-brand-text shadow-2xs'
                : 'border-border-subtle bg-surface text-text-muted hover:bg-surface-hover hover:text-text-main'
            }`}
          >
            <span className="material-symbols-outlined mb-1 text-lg">blur_on</span>
            <span>Glass</span>
          </button>
        </div>
      </div>

      {/* Accent Color */}
      <div className="flex flex-col gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
          Accent Color
        </span>
        <div className="flex items-center gap-2.5">
          {QUICK_ACCENT_COLORS.map((color) => {
            const isSelected = theme.accentColor === color.value;
            return (
              <button
                key={color.value}
                onClick={() => onUpdateTheme({ accentColor: color.value })}
                style={{ backgroundColor: color.value }}
                title={color.name}
                className={`w-7 h-7 rounded-full transition-transform hover:scale-110 flex items-center justify-center ${
                  isSelected ? 'ring-2 ring-offset-2 ring-border-focus scale-105' : 'opacity-85 hover:opacity-100'
                }`}
              >
                {isSelected && (
                  <span className="material-symbols-outlined text-white text-xs font-bold">check</span>
                )}
              </button>
            );
          })}
          <button
            onClick={onOpenAdvanced}
            className="w-7 h-7 rounded-full bg-surface-subtle border border-border-subtle flex items-center justify-center hover:bg-surface-hover transition-colors text-text-muted hover:text-text-main"
            title="Custom Accent Color"
          >
            <span className="material-symbols-outlined text-xs">add</span>
          </button>
        </div>
      </div>

      {/* Appearance Options */}
      <div className="flex flex-col gap-3 border-t border-border-subtle pt-3">
        <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">
          Appearance
        </span>

        {/* Background Blur Slider */}
        <div className="flex flex-col gap-1.5">
          <div className="flex justify-between items-center text-xs font-medium text-text-main">
            <span>Background Blur</span>
            <span className="text-text-muted font-mono">{theme.bgBlur}%</span>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            value={theme.bgBlur}
            onChange={(e) => onUpdateTheme({ bgBlur: Number(e.target.value) })}
            className="w-full cursor-pointer accent-brand"
          />
        </div>

        {/* Show Canvas Image Toggle */}
        <div className="flex justify-between items-center mt-1">
          <span className="text-xs text-text-main font-medium">
            Show Canvas Image
          </span>
          <button
            type="button"
            onClick={() => onUpdateTheme({ showCanvasImage: !theme.showCanvasImage })}
            className={`w-10 h-5 rounded-full relative transition-colors duration-200 focus:outline-none p-0.5 ${
              theme.showCanvasImage ? 'bg-brand' : 'bg-surface-active'
            }`}
          >
            <span
              className={`block w-4 h-4 bg-white rounded-full shadow transition-transform duration-200 ${
                theme.showCanvasImage ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Custom Action Button */}
      <button
        onClick={() => {
          onClose();
          onOpenAdvanced();
        }}
        className="w-full py-2 px-3 rounded-lg border border-border-main text-text-main hover:bg-surface-hover transition-colors text-xs font-semibold text-center mt-1"
      >
        Advanced Customization
      </button>
    </div>
  );
};
