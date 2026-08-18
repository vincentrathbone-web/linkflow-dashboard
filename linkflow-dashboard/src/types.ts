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
  /** CSS font-weight for headings (h1-h4, .font-heading). 300-900. Optional for backward compatibility. */
  headingWeight?: number;
  /** Visual scale multiplier for headings, applied via CSS transform. 0.85-1.2. Optional for backward compatibility. */
  headingScale?: number;
  /** Visual scale multiplier for link tile text, applied via CSS transform. 0.85-1.2. Optional for backward compatibility. */
  linkTextScale?: number;
  /** Opacity of the tint overlay drawn on top of the canvas background image. 0-1. Optional for backward compatibility. */
  bgOverlayOpacity?: number;
}

export type NavTab = 'dashboard' | 'collections' | 'archive';

export type TodoPriority = 'low' | 'medium' | 'high';

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  priority?: TodoPriority;
  /** ISO date (yyyy-mm-dd) or ISO datetime. Drives the Today/This Week grouping — never stored as a separate group field, since that would go stale as dates pass. */
  dueDate?: string;
  createdAt: string;
}

export interface TimesheetSession {
  id: string;
  start: string; // ISO datetime
  end: string; // ISO datetime
  durationSeconds: number;
  /** What was worked on, logged via the prompt shown right after clocking out. Optional — the prompt can be skipped. */
  activity?: string;
}

export interface TimesheetState {
  /** ISO datetime the clock was started; null when clocked out. Elapsed time is always computed from this, never stored as a running counter. */
  currentSessionStart: string | null;
  sessions: TimesheetSession[];
  /** Hours per week, used for the weekly progress bar. */
  weeklyTargetHours: number;
}

export type WidgetId = 'todo' | 'timesheet';
export type WidgetColumn = 'left' | 'right';

export interface WidgetPlacement {
  id: WidgetId;
  column: WidgetColumn;
  /** Stack position within its column. */
  order: number;
  /** Grid row units tall; null means auto/content-sized (the default, unresized state). */
  heightUnits: number | null;
}

export interface PanelLayoutState {
  widgets: WidgetPlacement[];
}
