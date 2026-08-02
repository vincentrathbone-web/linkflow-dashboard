export interface LinkItem {
  id: string;
  name: string;
  url: string;
  sectionId: string;
  icon: string;
  description?: string;
  category?: string;
  isFavorite?: boolean;
  isArchived?: boolean;
  clickCount?: number;
  createdAt: string;
}

export interface LinkSection {
  id: string;
  name: string;
  icon: string;
  isExpanded: boolean;
  allowCollapse: boolean;
  defaultState: 'expanded' | 'collapsed';
  order: number;
}

export type ThemePreset = 'light' | 'dark' | 'glass';

export interface ThemeConfig {
  preset: ThemePreset;
  accentColor: string;
  bgBlur: number; // 0 to 100
  showCanvasImage: boolean;
  canvasImageUrl: string;
  cardOpacity: number; // 0.2 to 1.0
  /** id from src/data/fontPairs.ts. Optional for backward compatibility with saved workspaces predating font theming. */
  fontPairId?: string;
}

export type NavTab = 'dashboard' | 'collections' | 'archive';
