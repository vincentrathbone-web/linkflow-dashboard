export interface FontPair {
  id: string;
  name: string;
  /** Used for h1-h4 and .font-heading */
  heading: string;
  /** Used for body text */
  body: string;
  /** Google Fonts css2 family params, e.g. "Outfit:wght@500;600;700" */
  googleFontsParams: string[];
}

export const DEFAULT_FONT_PAIR_ID = 'outfit-jakarta';

export const FONT_PAIRS: FontPair[] = [
  {
    id: 'outfit-jakarta',
    name: 'Outfit / Plus Jakarta Sans',
    heading: "'Outfit', 'Plus Jakarta Sans', sans-serif",
    body: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    googleFontsParams: ['Outfit:wght@500;600;700', 'Plus+Jakarta+Sans:wght@400;500;600;700;800'],
  },
  {
    id: 'sora-inter',
    name: 'Sora / Inter',
    heading: "'Sora', 'Inter', sans-serif",
    body: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    googleFontsParams: ['Sora:wght@500;600;700', 'Inter:wght@400;500;600;700;800'],
  },
  {
    id: 'space-grotesk-ibm-plex',
    name: 'Space Grotesk / IBM Plex Sans',
    heading: "'Space Grotesk', 'IBM Plex Sans', sans-serif",
    body: "'IBM Plex Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    googleFontsParams: ['Space+Grotesk:wght@500;600;700', 'IBM+Plex+Sans:wght@400;500;600;700'],
  },
  {
    id: 'fraunces-karla',
    name: 'Fraunces / Karla',
    heading: "'Fraunces', 'Georgia', serif",
    body: "'Karla', -apple-system, BlinkMacSystemFont, sans-serif",
    googleFontsParams: ['Fraunces:opsz,wght@9..144,500;9..144,600;9..144,700', 'Karla:wght@400;500;600;700'],
  },
  {
    id: 'manrope',
    name: 'Manrope',
    heading: "'Manrope', sans-serif",
    body: "'Manrope', -apple-system, BlinkMacSystemFont, sans-serif",
    googleFontsParams: ['Manrope:wght@400;500;600;700;800'],
  },
  {
    id: 'poppins-inter',
    name: 'Poppins / Inter',
    heading: "'Poppins', 'Inter', sans-serif",
    body: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    googleFontsParams: ['Poppins:wght@500;600;700', 'Inter:wght@400;500;600;700;800'],
  },

  // ── Funkier options — bold/rounded/quirky headings, kept legible in body ──
  {
    id: 'bagel-jakarta',
    name: 'Bagel Fat One / Plus Jakarta Sans',
    heading: "'Bagel Fat One', 'Outfit', sans-serif",
    body: "'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    googleFontsParams: ['Bagel+Fat+One', 'Plus+Jakarta+Sans:wght@400;500;600;700;800'],
  },
  {
    id: 'unbounded-dmsans',
    name: 'Unbounded / DM Sans',
    heading: "'Unbounded', 'Outfit', sans-serif",
    body: "'DM Sans', -apple-system, BlinkMacSystemFont, sans-serif",
    googleFontsParams: ['Unbounded:wght@500;600;700', 'DM+Sans:wght@400;500;600;700'],
  },
  {
    id: 'bricolage-inter',
    name: 'Bricolage Grotesque / Inter',
    heading: "'Bricolage Grotesque', 'Sora', sans-serif",
    body: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    googleFontsParams: ['Bricolage+Grotesque:wght@500;600;700', 'Inter:wght@400;500;600;700;800'],
  },
  {
    id: 'cherrybomb-nunito',
    name: 'Cherry Bomb One / Nunito',
    heading: "'Cherry Bomb One', 'Bagel Fat One', sans-serif",
    body: "'Nunito', -apple-system, BlinkMacSystemFont, sans-serif",
    googleFontsParams: ['Cherry+Bomb+One', 'Nunito:wght@400;500;600;700;800'],
  },
  {
    id: 'josefin-garamond',
    name: 'Josefin Sans / EB Garamond',
    heading: "'Josefin Sans', 'Outfit', sans-serif",
    body: "'EB Garamond', Georgia, serif",
    googleFontsParams: ['Josefin+Sans:wght@500;600;700', 'EB+Garamond:wght@400;500;600;700'],
  },
];

export function getFontPair(id: string | undefined): FontPair {
  return FONT_PAIRS.find((pair) => pair.id === id) ?? FONT_PAIRS[0];
}

/**
 * The WordPress-hosted build doesn't render index.html's <head> at all — the
 * plugin builds its own page shell from the Vite manifest — so a static
 * <link> tag there only ever helps the desktop app. Fonts must be loaded at
 * runtime so both environments (and mid-session font-pair switching) work.
 */
export function buildGoogleFontsUrl(pair: FontPair): string {
  const families = pair.googleFontsParams.map((param) => `family=${param}`).join('&');
  return `https://fonts.googleapis.com/css2?${families}&display=swap`;
}
