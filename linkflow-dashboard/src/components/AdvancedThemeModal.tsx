import React, { useEffect, useRef, useState } from 'react';
import { ThemeConfig } from '../types';
import { FONT_PAIRS, getFontPair } from '../data/fontPairs';
import { ACCENT_COLORS } from '../data/accentColors';
import { isDesktopApp } from '../lib/linkflowApi';

const PREVIEW_FONT_LINK_ID = 'linkflow-font-preview-link';

interface AdvancedThemeModalProps {
  isOpen: boolean;
  onClose: () => void;
  theme: ThemeConfig;
  onUpdateTheme: (updates: Partial<ThemeConfig>) => void;
  onResetTheme: () => void;
  localBgImage: string | null;
  onSetLocalBgImage: (dataUrl: string | null) => void;
}

const SAMPLE_CANVAS_WALLPAPERS = [
  {
    name: 'Sunlit Office',
    url: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDI6TsunvrSXD3JaQKURKOHhEzhps-ml3zmQQRxI-j2wdojd65ujx86eVBU0WwEi4CcTjc7vRmAzqFnAp-OutozPwOk-GwPnVa4-o41xkv1p_v7eHbZMnxCNVAlAvUBEBD6Bh1Fo13u4eacnlHSHe8GeOZ-Ea-AIY7CFvlwBNT3ZEog5wLdTIvFVxTHtmAQ-b2zANVBySZJhurkGXzqr91vtu5TYIhR3PqQgu0aMuI6YAbmBe5fEtF1',
  },
  {
    name: 'Minimal Gradient',
    url: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?q=80&w=1200&auto=format&fit=crop',
  },
  {
    name: 'Modern Architecture',
    url: 'https://images.unsplash.com/photo-1513694203232-719a280e022f?q=80&w=1200&auto=format&fit=crop',
  },
  {
    name: 'Dark Cosmic Mesh',
    url: 'https://images.unsplash.com/photo-1550684848-fac1c5b4e853?q=80&w=1200&auto=format&fit=crop',
  },
];

export const AdvancedThemeModal: React.FC<AdvancedThemeModalProps> = ({
  isOpen,
  onClose,
  theme,
  onUpdateTheme,
  onResetTheme,
  localBgImage,
  onSetLocalBgImage,
}) => {
  const [customHex, setCustomHex] = useState(theme.accentColor);
  const [customBgUrl, setCustomBgUrl] = useState(theme.canvasImageUrl || '');
  const [isBrowsingImage, setIsBrowsingImage] = useState(false);
  const webFileInputRef = useRef<HTMLInputElement>(null);

  // The font-pair picker previews every option's real typeface, not just the
  // active one, so load all of them once the modal is open (the active
  // pair's own stylesheet is already loaded separately by App.tsx).
  useEffect(() => {
    if (!isOpen) return;
    const allParams = Array.from(new Set(FONT_PAIRS.flatMap((pair) => pair.googleFontsParams)));
    const href = `https://fonts.googleapis.com/css2?${allParams.map((p) => `family=${p}`).join('&')}&display=swap`;
    let link = document.getElementById(PREVIEW_FONT_LINK_ID) as HTMLLinkElement | null;
    if (!link) {
      link = document.createElement('link');
      link.id = PREVIEW_FONT_LINK_ID;
      link.rel = 'stylesheet';
      document.head.appendChild(link);
    }
    if (link.href !== href) link.href = href;
  }, [isOpen]);

  if (!isOpen) return null;

  const handleApplyCustomHex = () => {
    if (customHex) {
      onUpdateTheme({ accentColor: customHex });
    }
  };

  const handleApplyCustomBg = () => {
    if (customBgUrl) {
      onSetLocalBgImage(null); // an online URL replaces any locally-picked file
      onUpdateTheme({ canvasImageUrl: customBgUrl, showCanvasImage: true });
    }
  };

  const applyPickedImageFile = (dataUrl: string) => {
    onSetLocalBgImage(dataUrl);
    onUpdateTheme({ showCanvasImage: true });
  };

  const readFileAsDataUrl = (file: File | Blob): Promise<string> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });

  const handleBrowseImage = async () => {
    if (!isDesktopApp()) {
      webFileInputRef.current?.click();
      return;
    }

    setIsBrowsingImage(true);
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const { readFile } = await import('@tauri-apps/plugin-fs');
      const path = await open({
        multiple: false,
        filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }],
      });
      if (!path || Array.isArray(path)) return;

      const bytes = await readFile(path);
      const extension = path.split('.').pop()?.toLowerCase() || 'png';
      const mime = extension === 'jpg' ? 'jpeg' : extension;
      const blob = new Blob([bytes], { type: `image/${mime}` });
      const dataUrl = await readFileAsDataUrl(blob);
      applyPickedImageFile(dataUrl);
    } finally {
      setIsBrowsingImage(false);
    }
  };

  const handleWebFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const dataUrl = await readFileAsDataUrl(file);
    applyPickedImageFile(dataUrl);
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
            <span className="material-symbols-outlined text-brand-text text-xl">palette</span>
            <h2 className="font-heading text-base font-bold text-text-main m-0">
              Advanced Customization
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
        <div className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
          {/* Preset Accent Colors */}
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
              Preset Accent Colors
            </label>
            <div className="grid grid-cols-5 gap-2.5">
              {ACCENT_COLORS.map((color) => {
                const isSelected = theme.accentColor.toLowerCase() === color.value.toLowerCase();
                return (
                  <button
                    key={color.value}
                    type="button"
                    onClick={() => {
                      setCustomHex(color.value);
                      onUpdateTheme({ accentColor: color.value });
                    }}
                    title={color.name}
                    className="flex flex-col items-center gap-1"
                  >
                    <span
                      style={{ backgroundColor: color.value }}
                      className={`w-8 h-8 rounded-full transition-transform hover:scale-110 flex items-center justify-center ${
                        isSelected ? 'ring-2 ring-offset-2 ring-border-focus scale-105' : ''
                      }`}
                    >
                      {isSelected && <span className="material-symbols-outlined text-white text-sm font-bold">check</span>}
                    </span>
                    <span className="text-[9.5px] text-text-muted">{color.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Accent Color */}
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
              Custom Accent Color (HEX)
            </label>
            <div className="flex gap-2">
              <input
                type="color"
                value={customHex}
                onChange={(e) => {
                  setCustomHex(e.target.value);
                  onUpdateTheme({ accentColor: e.target.value });
                }}
                className="w-10 h-10 rounded-xl cursor-pointer border border-border-main p-0.5 bg-surface"
              />
              <input
                type="text"
                value={customHex}
                onChange={(e) => setCustomHex(e.target.value)}
                placeholder="#0052cc"
                className="flex-1 px-3 py-2 bg-surface border border-border-main rounded-xl text-xs font-mono text-text-main"
              />
              <button
                type="button"
                onClick={handleApplyCustomHex}
                className="px-3 py-2 bg-brand text-text-inverse text-xs font-semibold rounded-xl hover:bg-brand-hover transition-colors"
              >
                Apply
              </button>
            </div>
          </div>

          {/* Font Pair */}
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
              Font Pair
            </label>
            <div className="grid grid-cols-2 gap-2">
              {FONT_PAIRS.map((pair) => {
                const isSelected = (theme.fontPairId ?? getFontPair(undefined).id) === pair.id;
                return (
                  <button
                    key={pair.id}
                    type="button"
                    onClick={() => onUpdateTheme({ fontPairId: pair.id })}
                    className={`rounded-xl border p-2.5 text-left transition-all ${
                      isSelected
                        ? 'border-border-focus bg-brand-subtle shadow-2xs'
                        : 'border-border-subtle bg-surface hover:bg-surface-hover'
                    }`}
                  >
                    <div style={{ fontFamily: pair.heading }} className="text-sm font-semibold text-text-main">
                      Aa
                    </div>
                    <div style={{ fontFamily: pair.body }} className="mt-0.5 text-[10.5px] text-text-muted">
                      {pair.name}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Typography & Background Fine-Tuning */}
          <div className="grid grid-cols-2 gap-x-4 gap-y-3 pt-2 border-t border-border-subtle">
            <SliderControl
              label="Heading Boldness"
              value={theme.headingWeight ?? 700}
              display={String(theme.headingWeight ?? 700)}
              min={300}
              max={900}
              step={100}
              lowLabel="Lighter"
              highLabel="Bolder"
              onChange={(v) => onUpdateTheme({ headingWeight: v })}
            />
            <SliderControl
              label="Heading Size"
              value={theme.headingScale ?? 1}
              display={`${Math.round((theme.headingScale ?? 1) * 100)}%`}
              min={0.85}
              max={1.2}
              step={0.01}
              lowLabel="Smaller"
              highLabel="Larger"
              onChange={(v) => onUpdateTheme({ headingScale: v })}
            />
            <SliderControl
              label="Link Text Size"
              value={theme.linkTextScale ?? 1}
              display={`${Math.round((theme.linkTextScale ?? 1) * 100)}%`}
              min={0.85}
              max={1.2}
              step={0.01}
              lowLabel="Smaller"
              highLabel="Larger"
              onChange={(v) => onUpdateTheme({ linkTextScale: v })}
            />
            <SliderControl
              label="Background Overlay"
              value={theme.bgOverlayOpacity ?? 0.65}
              display={`${Math.round((theme.bgOverlayOpacity ?? 0.65) * 100)}%`}
              min={0}
              max={1}
              step={0.05}
              lowLabel="Transparent"
              highLabel="Solid"
              onChange={(v) => onUpdateTheme({ bgOverlayOpacity: v })}
            />
          </div>

          {/* Preset Wallpapers */}
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
              Preset Canvas Wallpapers
            </label>
            <div className="grid grid-cols-2 gap-2.5">
              {SAMPLE_CANVAS_WALLPAPERS.map((wp) => {
                const isSelected = !localBgImage && theme.canvasImageUrl === wp.url;
                return (
                  <button
                    key={wp.name}
                    type="button"
                    onClick={() => {
                      onSetLocalBgImage(null);
                      onUpdateTheme({ canvasImageUrl: wp.url, showCanvasImage: true });
                    }}
                    className={`relative h-20 rounded-xl overflow-hidden border-2 transition-all text-left p-2 flex flex-col justify-end ${
                      isSelected ? 'border-border-focus ring-2 ring-border-focus/30 shadow-xs' : 'border-border-subtle opacity-80 hover:opacity-100'
                    }`}
                  >
                    <img src={wp.url} alt={wp.name} className="absolute inset-0 w-full h-full object-cover" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent" />
                    <span className="relative z-10 text-white font-medium text-xs drop-shadow-xs">
                      {wp.name}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Canvas Image: online URL or a local file */}
          <div className="flex flex-col gap-2">
            <label className="text-[11px] font-bold text-text-muted uppercase tracking-wider">
              Custom Wallpaper Image
            </label>
            <div className="flex gap-2">
              <input
                type="url"
                value={customBgUrl}
                onChange={(e) => setCustomBgUrl(e.target.value)}
                placeholder="Paste an image URL…"
                className="flex-1 px-3 py-2 bg-surface border border-border-main rounded-xl text-xs text-text-main"
              />
              <button
                type="button"
                onClick={handleApplyCustomBg}
                className="px-3 py-2 bg-brand text-text-inverse text-xs font-semibold rounded-xl hover:bg-brand-hover transition-colors whitespace-nowrap"
              >
                Set Image
              </button>
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleBrowseImage}
                disabled={isBrowsingImage}
                className="flex-1 py-2 px-3 rounded-xl border border-border-main text-text-main hover:bg-surface-hover text-xs font-semibold transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60"
              >
                <span className="material-symbols-outlined text-sm">folder_open</span>
                {isBrowsingImage ? 'Opening…' : 'Browse for a local image…'}
              </button>
              {localBgImage && (
                <button
                  type="button"
                  onClick={() => onSetLocalBgImage(null)}
                  title="Remove local image"
                  className="p-2 rounded-xl border border-border-main text-text-subtle hover:text-danger hover:bg-surface-hover transition-colors"
                >
                  <span className="material-symbols-outlined text-sm">close</span>
                </button>
              )}
              <input
                ref={webFileInputRef}
                type="file"
                accept="image/*"
                onChange={handleWebFileSelected}
                className="hidden"
              />
            </div>
            {localBgImage && (
              <p className="text-[10.5px] text-text-muted">
                Using a local image on this device. It won't sync to your other devices.
              </p>
            )}
          </div>

          {/* Glass Card Opacity */}
          <div className="flex flex-col gap-2 pt-2 border-t border-border-subtle">
            <div className="flex justify-between items-center text-xs font-semibold">
              <span className="text-text-main">Card Glass Opacity</span>
              <span className="font-mono text-text-muted">{Math.round((theme.cardOpacity || 0.85) * 100)}%</span>
            </div>
            <input
              type="range"
              min="0.2"
              max="1.0"
              step="0.05"
              value={theme.cardOpacity || 0.85}
              onChange={(e) => onUpdateTheme({ cardOpacity: Number(e.target.value) })}
              className="w-full accent-brand cursor-pointer"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-border-subtle bg-surface-subtle flex justify-between items-center">
          <button
            type="button"
            onClick={onResetTheme}
            className="text-xs font-semibold text-danger hover:underline transition-colors"
          >
            Reset Theme to Default
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl text-xs font-semibold bg-brand text-text-inverse hover:bg-brand-hover shadow-2xs transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

interface SliderControlProps {
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  lowLabel: string;
  highLabel: string;
  onChange: (value: number) => void;
}

const SliderControl: React.FC<SliderControlProps> = ({
  label,
  value,
  display,
  min,
  max,
  step,
  lowLabel,
  highLabel,
  onChange,
}) => (
  <div className="flex flex-col gap-1.5">
    <div className="flex justify-between items-center text-xs font-semibold">
      <span className="text-text-main">{label}</span>
      <span className="font-mono text-text-muted">{display}</span>
    </div>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(Number(e.target.value))}
      className="w-full accent-brand cursor-pointer"
    />
    <div className="flex justify-between text-[10px] text-text-muted">
      <span>{lowLabel}</span>
      <span>{highLabel}</span>
    </div>
  </div>
);
