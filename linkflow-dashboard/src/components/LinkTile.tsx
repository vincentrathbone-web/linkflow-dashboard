import React, { useState } from 'react';
import { motion } from 'motion/react';
import { LinkItem } from '../types';
import { isDesktopApp } from '../lib/linkflowApi';

interface LinkTileProps {
  link: LinkItem;
  index?: number;
  onEdit: (link: LinkItem) => void;
  onToggleFavorite: (id: string) => void;
  onArchive: (id: string) => void;
  onIncrementClick: (id: string) => void;
}

export const LinkTile: React.FC<LinkTileProps> = ({
  link,
  index = 0,
  onEdit,
  onToggleFavorite,
  onArchive,
  onIncrementClick,
}) => {
  const [copied, setCopied] = useState(false);

  const handleLaunch = async (e: React.MouseEvent) => {
    e.stopPropagation();
    onIncrementClick(link.id);

    if (isDesktopApp()) {
      // window.open() does not hand off to the OS default browser inside the
      // Tauri/WebView2 shell (the same class of bug as the old export
      // button) — use the opener plugin, which does.
      const { openUrl } = await import('@tauri-apps/plugin-opener');
      await openUrl(link.url);
      return;
    }

    window.open(link.url, '_blank', 'noopener,noreferrer');
  };

  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(link.url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{
        duration: 0.28,
        delay: Math.min(index * 0.03, 0.25),
        ease: [0.215, 0.61, 0.355, 1],
      }}
      whileHover={{ y: -3, transition: { duration: 0.15 } }}
      whileTap={{ scale: 0.97 }}
      onClick={handleLaunch}
      className="relative flex flex-col items-center justify-center p-4 bg-surface border border-border-main rounded-xl hover:border-border-focus hover:shadow-md transition-colors duration-200 group cursor-pointer text-center min-h-[124px] select-none"
    >
      {/* Top Quick Actions (Shown on hover) */}
      <div className="absolute top-2 right-2 flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity duration-200 z-10 bg-surface-elevated rounded-lg px-1 py-0.5 shadow-sm border border-border-main">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onToggleFavorite(link.id);
          }}
          className={`p-1 rounded-md hover:bg-surface-hover transition-colors ${
            link.isFavorite ? 'text-star' : 'text-text-subtle hover:text-text-main'
          }`}
          title={link.isFavorite ? 'Remove Favorite' : 'Mark Favorite'}
        >
          <span className={`material-symbols-outlined text-xs ${link.isFavorite ? 'filled' : ''}`}>
            star
          </span>
        </button>

        <button
          type="button"
          onClick={handleCopy}
          className="p-1 rounded-md text-text-subtle hover:text-brand-text hover:bg-surface-hover transition-colors"
          title={copied ? 'Copied!' : 'Copy Link URL'}
        >
          <span className="material-symbols-outlined text-xs">
            {copied ? 'check' : 'content_copy'}
          </span>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(link);
          }}
          className="p-1 rounded-md text-text-subtle hover:text-brand-text hover:bg-surface-hover transition-colors"
          title="Edit Link"
        >
          <span className="material-symbols-outlined text-xs">edit</span>
        </button>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onArchive(link.id);
          }}
          className="p-1 rounded-md text-text-subtle hover:text-danger hover:bg-surface-hover transition-colors"
          title="Archive Link"
        >
          <span className="material-symbols-outlined text-xs">archive</span>
        </button>
      </div>

      {/* Favorite Star Badge (Persistent if favorited) */}
      {link.isFavorite && (
        <span className="absolute top-2.5 left-2.5 material-symbols-outlined text-star text-xs filled opacity-90 group-hover:opacity-100">
          star
        </span>
      )}

      {/* Icon Badge */}
      <div className="w-11 h-11 rounded-xl bg-surface-subtle border border-border-subtle flex items-center justify-center mb-2 group-hover:bg-brand group-hover:text-text-inverse transition-colors duration-200 shadow-2xs">
        <span className="material-symbols-outlined text-brand-text group-hover:text-text-inverse transition-colors text-xl">
          {link.icon || 'link'}
        </span>
      </div>

      {/* Link Title */}
      <span className="text-xs font-semibold text-text-main line-clamp-1 max-w-[90%] tracking-tight">
        {link.name}
      </span>

      {/* Description or Domain subtitle */}
      {link.description && (
        <span className="text-[11px] text-text-muted line-clamp-1 mt-0.5 max-w-[95%] font-normal">
          {link.description}
        </span>
      )}
    </motion.div>
  );
};
