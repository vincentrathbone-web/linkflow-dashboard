export interface WizardLinkDraft {
  id: string;
  url: string;
  name: string;
  sectionId: string;
  order: number;
}

const URL_PATTERN = /(https?:\/\/[^\s]+)|(\b[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}(\/[^\s]*)?\b)/i;

function normalizeUrl(raw: string): string {
  const trimmed = raw.trim().replace(/[,.;)\]]+$/, '');
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function hostnameOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function titleCase(value: string): string {
  return value
    .split(/[\s._-]+/)
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Parse a freeform pasted blob into link drafts. Accepts one link per line,
 * optionally prefixed with a name ("Name - url", "Name: url", "Name | url",
 * tab/comma separated), or a bare URL/domain on its own. Lines without
 * anything URL-shaped are skipped.
 */
export function parseBulkLinks(text: string, unsortedSectionId: string): WizardLinkDraft[] {
  const lines = text.split(/\r?\n/);
  const drafts: WizardLinkDraft[] = [];
  let order = 0;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const match = line.match(URL_PATTERN);
    if (!match) continue;

    const urlText = match[0];
    const url = normalizeUrl(urlText);
    const before = line.slice(0, match.index).trim().replace(/[-:|,]+$/, '').trim();
    const after = line.slice((match.index ?? 0) + urlText.length).trim().replace(/^[-:|,]+/, '').trim();
    const name = before || after || titleCase(hostnameOf(url).split('.')[0] || hostnameOf(url));

    drafts.push({
      id: `link-${Date.now()}-${order}-${Math.random().toString(36).slice(2, 7)}`,
      url,
      name,
      sectionId: unsortedSectionId,
      order: order++,
    });
  }

  return drafts;
}
