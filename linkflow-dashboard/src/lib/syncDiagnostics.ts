import type { WorkspaceDocument } from './linkflowApi';

export type SyncLogLevel = 'debug' | 'info' | 'success' | 'warning' | 'error';

export interface SyncLogEntry {
  id: string;
  timestamp: string;
  level: SyncLogLevel;
  area: string;
  message: string;
  details?: unknown;
}

const STORAGE_KEY = 'linkflow_sync_diagnostics_v1';
const MAX_ENTRIES = 500;
let sequence = 0;
let entries: SyncLogEntry[] = readStoredEntries();
const listeners = new Set<(nextEntries: SyncLogEntry[]) => void>();

function readStoredEntries(): SyncLogEntry[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    const parsed = stored ? JSON.parse(stored) : [];
    return Array.isArray(parsed) ? parsed.slice(-MAX_ENTRIES) : [];
  } catch {
    return [];
  }
}

function tokenDescription(value: unknown): string {
  const text = String(value ?? '');
  return text
    ? `[REDACTED length=${text.length} suffix=${text.slice(-4)}]`
    : '[REDACTED empty]';
}

function redactSensitiveUrlValues(value: string): string {
  if (!/^https?:\/\//i.test(value)) return value;
  try {
    const url = new URL(value);
    for (const key of [...url.searchParams.keys()]) {
      if (/password|token|authorization|secret|nonce|api[-_]?key|signature/i.test(key)) {
        url.searchParams.set(key, '[REDACTED]');
      }
    }
    return url.toString();
  } catch {
    return value;
  }
}

function sanitizeForLog(value: unknown, key = '', seen = new WeakSet<object>()): unknown {
  if (/password|token|authorization|secret|nonce/i.test(key)) {
    return tokenDescription(value);
  }
  if (value === null || value === undefined || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    if (/^Bearer\s+/i.test(value)) return tokenDescription(value.replace(/^Bearer\s+/i, ''));
    const redacted = redactSensitiveUrlValues(value);
    return redacted.length > 20_000 ? `${redacted.slice(0, 20_000)}… [truncated ${redacted.length - 20_000} characters]` : redacted;
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
      ...sanitizeForLog(Object.fromEntries(Object.entries(value)), '', seen) as object,
    };
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeForLog(item, '', seen));
  }
  if (typeof value === 'object') {
    if (seen.has(value)) return '[Circular reference]';
    seen.add(value);
    return Object.fromEntries(
      Object.entries(value).map(([childKey, childValue]) => [childKey, sanitizeForLog(childValue, childKey, seen)])
    );
  }
  return String(value);
}

function persist(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // The on-screen log remains available if storage is full or unavailable.
  }
}

function notify(): void {
  const snapshot = [...entries];
  listeners.forEach((listener) => listener(snapshot));
}

export function logSync(level: SyncLogLevel, area: string, message: string, details?: unknown): SyncLogEntry {
  const entry: SyncLogEntry = {
    id: `${Date.now()}-${++sequence}`,
    timestamp: new Date().toISOString(),
    level,
    area,
    message,
    ...(details === undefined ? {} : { details: sanitizeForLog(details) }),
  };
  entries = [...entries, entry].slice(-MAX_ENTRIES);
  persist();
  notify();

  const consoleMethod = level === 'error' ? console.error : level === 'warning' ? console.warn : console.log;
  consoleMethod(`[LinkFlow Sync][${area}][${level}] ${message}`, entry.details ?? '');
  return entry;
}

export function getSyncLogs(): SyncLogEntry[] {
  return [...entries];
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key !== STORAGE_KEY) return;
    entries = readStoredEntries();
    notify();
  });
}

export function subscribeSyncLogs(listener: (nextEntries: SyncLogEntry[]) => void): () => void {
  listeners.add(listener);
  listener(getSyncLogs());
  return () => listeners.delete(listener);
}

export function clearSyncLogs(): void {
  entries = [];
  persist();
  notify();
  logSync('info', 'diagnostics', 'Diagnostic log cleared by user.');
}

export function exportSyncLogs(): string {
  return JSON.stringify({
    exportedAt: new Date().toISOString(),
    userAgent: navigator.userAgent,
    location: window.location.href,
    entries,
  }, null, 2);
}

export function nextRequestId(): string {
  return `req-${Date.now()}-${++sequence}`;
}

export function textFingerprint(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function describeWorkspace(workspace: WorkspaceDocument): Record<string, unknown> {
  const serialized = JSON.stringify(workspace);
  return {
    fingerprint: textFingerprint(serialized),
    serializedBytes: new Blob([serialized]).size,
    sectionCount: workspace.sections.length,
    sectionIds: workspace.sections.map((section) => section.id),
    linkCount: workspace.links.length,
    linkIds: workspace.links.map((link) => link.id),
    themePreset: workspace.theme.preset,
    todoCount: workspace.todos.length,
    timesheetClockedIn: workspace.timesheet.currentSessionStart !== null,
    panelLayout: workspace.panelLayout.widgets.map((w) => `${w.id}:${w.column}:${w.order}`),
    workspace,
  };
}
