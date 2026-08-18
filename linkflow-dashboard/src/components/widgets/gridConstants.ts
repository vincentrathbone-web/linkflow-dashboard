/** The vertical snap grid every widget height resize rounds to. Mirrored
 * server-side as the clamp bounds in sanitize_workspace() — keep in sync. */
export const WIDGET_ROW_UNIT_PX = 24;
export const WIDGET_MIN_ROWS = 6;
export const WIDGET_MAX_ROWS = 60;

export function clampRows(rows: number): number {
  return Math.min(WIDGET_MAX_ROWS, Math.max(WIDGET_MIN_ROWS, rows));
}
