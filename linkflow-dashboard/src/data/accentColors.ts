export interface AccentColor {
  name: string;
  value: string;
}

/**
 * Solid/step-9 hex values sourced directly from Radix Colors
 * (https://www.radix-ui.com/colors), the accessible 12-step color system
 * used by Linear, WorkOS, and most modern SaaS design systems — each scale
 * is contrast-checked, not picked freehand. "Action Blue" and "Emerald" are
 * this app's pre-existing brand defaults, kept as-is; everything else below
 * is a verified Radix step-9 value.
 */
export const ACCENT_COLORS: AccentColor[] = [
  { name: 'Action Blue', value: '#0052cc' },
  { name: 'Emerald', value: '#10b981' },
  { name: 'Iris', value: '#5b5bd6' },
  { name: 'Violet', value: '#6e56cf' },
  { name: 'Plum', value: '#ab4aba' },
  { name: 'Pink', value: '#d6409f' },
  { name: 'Crimson', value: '#e93d82' },
  { name: 'Ruby', value: '#e54666' },
  { name: 'Amber', value: '#ffc53d' },
  { name: 'Teal', value: '#12a594' },
];

/** A compact spread for the quick theme dropdown; the full set lives in Advanced Customization. */
export const QUICK_ACCENT_COLORS: AccentColor[] = ACCENT_COLORS.filter((c) =>
  ['Action Blue', 'Emerald', 'Violet', 'Pink', 'Crimson', 'Teal'].includes(c.name),
);
