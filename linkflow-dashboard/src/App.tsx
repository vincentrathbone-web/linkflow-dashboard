import React, { useState, useEffect, useRef } from 'react';
import {
  LinkSection,
  LinkItem,
  ThemeConfig,
  NavTab,
  TodoItem,
  TimesheetState,
  TimesheetSession,
  PanelLayoutState,
} from './types';
import {
  DEFAULT_THEME,
  DEFAULT_TIMESHEET,
  DEFAULT_PANEL_LAYOUT,
  INITIAL_SECTIONS,
  INITIAL_LINKS,
} from './data/initialData';
import { buildGoogleFontsUrl, getFontPair } from './data/fontPairs';
import { formatElapsed, getTimerPhase, getLiveElapsedMs } from './lib/time';
import { TopNavBar } from './components/TopNavBar';
import { DashboardView } from './components/DashboardView';
import { CollectionsView } from './components/CollectionsView';
import { ArchiveView } from './components/ArchiveView';
import { AddLinkModal } from './components/AddLinkModal';
import { AddSectionModal } from './components/AddSectionModal';
import { AddTaskModal } from './components/AddTaskModal';
import { LogActivityModal } from './components/LogActivityModal';
import { ManualTimeEntryModal } from './components/ManualTimeEntryModal';
import { TodoPanel } from './components/TodoPanel';
import { TimesheetPanel } from './components/TimesheetPanel';
import { WidgetGrid } from './components/widgets/WidgetGrid';
import { SettingsModal } from './components/SettingsModal';
import { AdvancedThemeModal } from './components/AdvancedThemeModal';
import { hasCloudBackend, loadWorkspace, saveWorkspace, WorkspaceDocument } from './lib/linkflowApi';
import { currentUser, isDesktopApp, restoreDesktopSession, signOut } from './lib/linkflowApi';
import { DesktopSignIn } from './components/DesktopSignIn';
import { OnboardingWizard } from './components/onboarding/OnboardingWizard';
import { SortBoard } from './components/onboarding/SortBoard';
import { WizardLinkDraft } from './lib/parseBulkLinks';
import { UpdateBanner } from './components/UpdateBanner';
import { WhatsNewTour, TourStep } from './components/WhatsNewTour';
import { Cat } from './cat/Cat';
import { describeWorkspace, logSync, textFingerprint } from './lib/syncDiagnostics';

const ONBOARDING_KEY = 'linkflow_onboarding_done';

function hasCompletedOnboarding(userId: number): boolean {
  return localStorage.getItem(ONBOARDING_KEY) === String(userId);
}

function markOnboardingComplete(userId: number): void {
  localStorage.setItem(ONBOARDING_KEY, String(userId));
}

// Bump this string whenever a new "what's new" tour should show again to
// everyone who already completed onboarding — a fresh feature batch, not
// every release. Stored per-account (mirrors ONBOARDING_KEY's own pattern)
// so a second account signing in on this device isn't skipped just because
// a different account already saw this version's tour.
const WHATS_NEW_VERSION = '2026-08-19-timer-widget-v2';
const WHATS_NEW_KEY = 'linkflow_whatsnew_seen_version';

function hasSeenWhatsNew(userId: number): boolean {
  return localStorage.getItem(WHATS_NEW_KEY) === `${userId}:${WHATS_NEW_VERSION}`;
}

function markWhatsNewSeen(userId: number): void {
  localStorage.setItem(WHATS_NEW_KEY, `${userId}:${WHATS_NEW_VERSION}`);
}

// Self-heals a panel layout loaded from local cache or the cloud: any widget
// this build knows about (DEFAULT_PANEL_LAYOUT) that is missing from the
// loaded layout gets appended onto its default column, rather than staying
// hidden forever. Without this, `workspace.panelLayout ?? DEFAULT_PANEL_LAYOUT`
// is all-or-nothing — a *stored* layout that predates a widget (an old
// client's save, or one that round-tripped through one) permanently hides
// that widget for this account, even after upgrading, because the stored
// value is never null/undefined so the default never kicks in. There is no
// UI to remove a widget from the layout, so any widget id missing here can
// only mean "this layout predates it," never a deliberate user choice. See
// HANDOVER.md 2026-08-19 "Known residual gap, not yet closed" for the
// incident this closes. A widget already present is left exactly as the
// user arranged it.
function reconcilePanelLayout(loaded: PanelLayoutState | null | undefined): PanelLayoutState {
  const widgets = loaded?.widgets ? loaded.widgets.map((w) => ({ ...w })) : [];
  const present = new Set(widgets.map((w) => w.id));
  DEFAULT_PANEL_LAYOUT.widgets.forEach((defaultWidget) => {
    if (present.has(defaultWidget.id)) return;
    const columnCount = widgets.filter((w) => w.column === defaultWidget.column).length;
    widgets.push({ ...defaultWidget, order: columnCount });
  });
  return { widgets };
}

/** Open the sync diagnostics view in its own window instead of overlaying the app. */
async function openDiagnosticsWindow(): Promise<void> {
  const url = `${window.location.pathname}${window.location.search}#diagnostics`;

  if (isDesktopApp()) {
    const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
    const existing = await WebviewWindow.getByLabel('diagnostics');
    if (existing) {
      await existing.setFocus();
      return;
    }
    new WebviewWindow('diagnostics', {
      url,
      title: 'LinkFlow — Sync Diagnostics',
      width: 760,
      height: 640,
      minWidth: 420,
      minHeight: 320,
    });
    return;
  }

  window.open(url, 'linkflow-diagnostics', 'width=760,height=680');
}

const TIMER_WIDGET_WIDTH = 100;
// Tall enough that the hover-revealed drag grip at the top never overlaps the
// button below it, even though the button is vertically centered.
const TIMER_WIDGET_HEIGHT = 132;
const TIMER_WIDGET_MARGIN = 24;

/** Opens the always-on-top floating timer widget (desktop only). Defaults to
 * the bottom-right corner of the primary monitor; falls back to Tauri's own
 * default placement if monitor info isn't available for any reason. */
async function openTimerWidget(): Promise<void> {
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  const existing = await WebviewWindow.getByLabel('timer-widget');
  if (existing) return;

  const url = `${window.location.pathname}${window.location.search}#timer-widget`;
  let x: number | undefined;
  let y: number | undefined;
  try {
    const { primaryMonitor } = await import('@tauri-apps/api/window');
    const monitor = await primaryMonitor();
    if (monitor) {
      const position = monitor.position.toLogical(monitor.scaleFactor);
      const size = monitor.size.toLogical(monitor.scaleFactor);
      x = Math.round(position.x + size.width - TIMER_WIDGET_WIDTH - TIMER_WIDGET_MARGIN);
      y = Math.round(position.y + size.height - TIMER_WIDGET_HEIGHT - TIMER_WIDGET_MARGIN);
    }
  } catch {
    // Fall back to Tauri's default window placement.
  }

  new WebviewWindow('timer-widget', {
    url,
    width: TIMER_WIDGET_WIDTH,
    height: TIMER_WIDGET_HEIGHT,
    x,
    y,
    decorations: false,
    transparent: true,
    shadow: false,
    alwaysOnTop: true,
    resizable: false,
    skipTaskbar: true,
    focus: false,
  });
}

async function closeTimerWidget(): Promise<void> {
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  const existing = await WebviewWindow.getByLabel('timer-widget');
  await existing?.close();
}

const LOG_ACTIVITY_WIDTH = 440;
const LOG_ACTIVITY_HEIGHT = 300;

/** Opens the "what did you work on?" prompt as its own always-on-top,
 * chromeless window — used for every stop (in-app Stop button, floating
 * widget, tray icon) so there's exactly one place this prompt appears,
 * rather than a modal buried inside the main window's React tree that's
 * invisible whenever that window is minimized/hidden (the bug this exists
 * to fix — see HANDOVER.md). Mirrors openTimerWidget()'s shape: transparent
 * + shadow:false + decorations:false so the window itself has no square
 * native frame or shadow fighting the card's own rounded corners. */
async function openLogActivityPrompt(sessionId: string): Promise<void> {
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow');
  const existing = await WebviewWindow.getByLabel('log-activity');
  if (existing) {
    // A session can't stop twice without starting again, so this shouldn't
    // normally happen — but if it does, just bring the existing prompt
    // forward rather than opening a second one for a different session.
    await existing.setFocus();
    return;
  }

  const url = `${window.location.pathname}${window.location.search}#log-activity?session=${encodeURIComponent(sessionId)}`;
  new WebviewWindow('log-activity', {
    url,
    width: LOG_ACTIVITY_WIDTH,
    height: LOG_ACTIVITY_HEIGHT,
    resizable: false,
    decorations: false,
    transparent: true,
    shadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    center: true,
    focus: true,
  });
}

export default function App() {
  const [desktopSessionReady, setDesktopSessionReady] = useState(() => !isDesktopApp() || hasCloudBackend());
  const [isRestoringDesktopSession, setIsRestoringDesktopSession] = useState(isDesktopApp() && !hasCloudBackend());
  const [signedInUser, setSignedInUser] = useState(() => currentUser());
  const [isSigningOut, setIsSigningOut] = useState(false);
  const [isBulkImportOpen, setIsBulkImportOpen] = useState(false);
  const [isDashboardSortOpen, setIsDashboardSortOpen] = useState(false);

  const handleSignOut = async () => {
    if (isSigningOut) return;
    setIsSigningOut(true);
    logSync('info', 'authentication', 'User requested sign-out.');
    try {
      await signOut();
    } finally {
      setSignedInUser(null);
      setDesktopSessionReady(!isDesktopApp());
      setIsSigningOut(false);
    }
  };

  useEffect(() => {
    logSync('info', 'lifecycle', 'LinkFlow application mounted.', {
      environment: isDesktopApp() ? 'Tauri desktop' : 'WordPress hosted web app',
      location: window.location.href,
      online: navigator.onLine,
      cloudBackendPresentAtMount: hasCloudBackend(),
      desktopSessionReady,
      isRestoringDesktopSession,
      note: 'Server workspace is pulled during initialization. Continuous server polling is not currently active.',
    });
    const online = () => logSync('success', 'network', 'Browser reported that network connectivity is online.');
    const offline = () => logSync('warning', 'network', 'Browser reported that network connectivity is offline.');
    window.addEventListener('online', online);
    window.addEventListener('offline', offline);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('offline', offline);
      logSync('debug', 'lifecycle', 'LinkFlow application effect unmounted. React Strict Mode may intentionally remount it during diagnostics.');
    };
  }, []);

  useEffect(() => {
    if (!isRestoringDesktopSession) {
      logSync('debug', 'authentication', 'Saved-session restoration effect skipped.', {
        reason: 'restoration flag is false',
        desktopSessionReady,
        cloudBackendPresent: hasCloudBackend(),
      });
      return;
    }
    logSync('info', 'authentication', 'Saved-session restoration effect started.');
    void restoreDesktopSession()
      .then((restored) => {
        logSync(restored ? 'success' : 'warning', 'authentication', restored ? 'Saved desktop session restored.' : 'No usable saved desktop session was restored.');
        if (restored) setSignedInUser(currentUser());
        setDesktopSessionReady(restored);
      })
      .catch((error) => {
        logSync('error', 'authentication', 'Saved desktop session restoration failed.', { error });
        setDesktopSessionReady(false);
      })
      .finally(() => {
        logSync('debug', 'authentication', 'Saved-session restoration effect finished.');
        setIsRestoringDesktopSession(false);
      });
  }, [isRestoringDesktopSession]);
  // Navigation State
  const [activeTab, setActiveTab] = useState<NavTab>('dashboard');
  const [searchQuery, setSearchQuery] = useState('');

  // LocalStorage Persistence - Sections
  const [sections, setSections] = useState<LinkSection[]>(() => {
    try {
      const saved = localStorage.getItem('linkflow_sections');
      const value = saved ? JSON.parse(saved) : [];
      logSync('info', 'local-cache', saved ? 'Sections loaded from local cache.' : 'No cached sections found; starting with an empty workspace.', {
        storageKey: 'linkflow_sections',
        serializedBytes: saved?.length ?? 0,
        sectionCount: value.length,
      });
      return value;
    } catch (error) {
      logSync('error', 'local-cache', 'Cached sections could not be parsed; starting with an empty workspace.', { storageKey: 'linkflow_sections', error });
      return [];
    }
  });

  // LocalStorage Persistence - Links
  const [links, setLinks] = useState<LinkItem[]>(() => {
    try {
      const saved = localStorage.getItem('linkflow_links');
      const value = saved ? JSON.parse(saved) : [];
      logSync('info', 'local-cache', saved ? 'Links loaded from local cache.' : 'No cached links found; starting with an empty workspace.', {
        storageKey: 'linkflow_links',
        serializedBytes: saved?.length ?? 0,
        linkCount: value.length,
      });
      return value;
    } catch (error) {
      logSync('error', 'local-cache', 'Cached links could not be parsed; starting with an empty workspace.', { storageKey: 'linkflow_links', error });
      return [];
    }
  });

  // LocalStorage Persistence - Theme
  const [theme, setTheme] = useState<ThemeConfig>(() => {
    try {
      const saved = localStorage.getItem('linkflow_theme');
      const value = saved ? JSON.parse(saved) : DEFAULT_THEME;
      logSync('info', 'local-cache', saved ? 'Theme loaded from local cache.' : 'No cached theme found; using the built-in theme.', {
        storageKey: 'linkflow_theme',
        serializedBytes: saved?.length ?? 0,
        preset: value.preset,
      });
      return value;
    } catch (error) {
      logSync('error', 'local-cache', 'Cached theme could not be parsed; using the built-in theme.', { storageKey: 'linkflow_theme', error });
      return DEFAULT_THEME;
    }
  });

  // LocalStorage Persistence - Todos
  const [todos, setTodos] = useState<TodoItem[]>(() => {
    try {
      const saved = localStorage.getItem('linkflow_todos');
      const value = saved ? JSON.parse(saved) : [];
      logSync('info', 'local-cache', saved ? 'Todos loaded from local cache.' : 'No cached todos found; starting with an empty list.', {
        storageKey: 'linkflow_todos',
        serializedBytes: saved?.length ?? 0,
        todoCount: value.length,
      });
      return value;
    } catch (error) {
      logSync('error', 'local-cache', 'Cached todos could not be parsed; starting with an empty list.', { storageKey: 'linkflow_todos', error });
      return [];
    }
  });

  // LocalStorage Persistence - Timesheet
  const [timesheet, setTimesheet] = useState<TimesheetState>(() => {
    try {
      const saved = localStorage.getItem('linkflow_timesheet');
      const value = saved ? JSON.parse(saved) : DEFAULT_TIMESHEET;
      logSync('info', 'local-cache', saved ? 'Timesheet loaded from local cache.' : 'No cached timesheet found; using defaults.', {
        storageKey: 'linkflow_timesheet',
        serializedBytes: saved?.length ?? 0,
      });
      return value;
    } catch (error) {
      logSync('error', 'local-cache', 'Cached timesheet could not be parsed; using defaults.', { storageKey: 'linkflow_timesheet', error });
      return DEFAULT_TIMESHEET;
    }
  });

  // LocalStorage Persistence - Panel Layout
  const [panelLayout, setPanelLayout] = useState<PanelLayoutState>(() => {
    try {
      const saved = localStorage.getItem('linkflow_panel_layout');
      const value = reconcilePanelLayout(saved ? JSON.parse(saved) : DEFAULT_PANEL_LAYOUT);
      logSync('info', 'local-cache', saved ? 'Panel layout loaded from local cache.' : 'No cached panel layout found; using defaults.', {
        storageKey: 'linkflow_panel_layout',
        serializedBytes: saved?.length ?? 0,
      });
      return value;
    } catch (error) {
      logSync('error', 'local-cache', 'Cached panel layout could not be parsed; using defaults.', { storageKey: 'linkflow_panel_layout', error });
      return DEFAULT_PANEL_LAYOUT;
    }
  });

  const [isWorkspaceReady, setIsWorkspaceReady] = useState(() => !isDesktopApp());
  const [workspaceVersion, setWorkspaceVersion] = useState(0);
  const [syncError, setSyncError] = useState<string | null>(null);
  const lastSavedWorkspace = useRef('');

  // Local cache is not scoped per account. If a different LinkFlow account
  // signs in on this same device/browser (e.g. a Google account distinct
  // from the previous password-login account), the previous account's
  // cached links must not leak into the new one or get pushed to its
  // (empty) server workspace.
  useEffect(() => {
    if (!signedInUser) return;

    const OWNER_KEY = 'linkflow_cache_owner';
    const previousOwner = localStorage.getItem(OWNER_KEY);
    const currentOwner = String(signedInUser.id);

    if (previousOwner && previousOwner !== currentOwner) {
      logSync('warning', 'local-cache', "This device's local cache belongs to a different LinkFlow account; clearing it to avoid cross-account data leakage.", {
        previousOwner,
        currentOwner,
      });
      localStorage.removeItem('linkflow_sections');
      localStorage.removeItem('linkflow_links');
      localStorage.removeItem('linkflow_theme');
      localStorage.removeItem('linkflow_todos');
      localStorage.removeItem('linkflow_timesheet');
      localStorage.removeItem('linkflow_panel_layout');
      setSections([]);
      setLinks([]);
      setTheme(DEFAULT_THEME);
      setTodos([]);
      setTimesheet(DEFAULT_TIMESHEET);
      setPanelLayout(DEFAULT_PANEL_LAYOUT);
      lastSavedWorkspace.current = '';
    }

    localStorage.setItem(OWNER_KEY, currentOwner);
  }, [signedInUser]);

  // Modals state
  const [isAddLinkOpen, setIsAddLinkOpen] = useState(false);
  const [editingLink, setEditingLink] = useState<LinkItem | null>(null);
  const [defaultSectionForAddLink, setDefaultSectionForAddLink] = useState<string>('');

  const [isAddSectionOpen, setIsAddSectionOpen] = useState(false);
  const [editingSection, setEditingSection] = useState<LinkSection | null>(null);

  const [isAddTaskOpen, setIsAddTaskOpen] = useState(false);
  const [editingTodo, setEditingTodo] = useState<TodoItem | null>(null);

  const [isLogActivityOpen, setIsLogActivityOpen] = useState(false);
  const [loggingSessionId, setLoggingSessionId] = useState<string | null>(null);

  const [isManualEntryOpen, setIsManualEntryOpen] = useState(false);
  const [editingSession, setEditingSession] = useState<TimesheetSession | null>(null);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isAdvancedThemeOpen, setIsAdvancedThemeOpen] = useState(false);

  // A locally-picked background image (Browse... in Advanced Customization).
  // This never syncs to the cloud: a data: URI can't survive the server's
  // URL sanitizer, and a local file path only makes sense on this one
  // device anyway. Kept in localStorage, separate from theme.canvasImageUrl.
  const [localBgImage, setLocalBgImageState] = useState<string | null>(() => localStorage.getItem('linkflow_local_bg_image'));

  // The cat companion is a per-device display preference (like the Daily
  // Inspiration bubble's mode), not workspace content — it has no reason to
  // sync across devices, so it lives in localStorage rather than ThemeConfig.
  const [catEnabled, setCatEnabled] = useState<boolean>(() => localStorage.getItem('linkflow_cat_enabled') !== 'false');
  const handleSetCatEnabled = (value: boolean) => {
    setCatEnabled(value);
    localStorage.setItem('linkflow_cat_enabled', String(value));
  };

  // Same per-device, not-synced-to-the-cloud pattern as the cat toggle above —
  // whether the always-on-top timer widget / tray icon are shown is a display
  // preference for this machine, not workspace content.
  const [timerWidgetEnabled, setTimerWidgetEnabled] = useState<boolean>(() => localStorage.getItem('linkflow_timer_widget_enabled') === 'true');
  const handleSetTimerWidgetEnabled = (value: boolean) => {
    setTimerWidgetEnabled(value);
    localStorage.setItem('linkflow_timer_widget_enabled', String(value));
  };
  const [trayTimerEnabled, setTrayTimerEnabled] = useState<boolean>(() => localStorage.getItem('linkflow_tray_timer_enabled') === 'true');
  const handleSetTrayTimerEnabled = (value: boolean) => {
    setTrayTimerEnabled(value);
    localStorage.setItem('linkflow_tray_timer_enabled', String(value));
  };

  const [showWhatsNewTour, setShowWhatsNewTour] = useState(false);
  // Fires once the real app is on screen for a returning user (not someone
  // still going through first-run onboarding, who gets these features
  // explained as part of that flow instead — see markWhatsNewSeen in the
  // onboarding onComplete handler below). isWorkspaceReady is included so
  // this doesn't race the initial cloud/localStorage load.
  useEffect(() => {
    if (!signedInUser || !isWorkspaceReady) return;
    if (!hasCompletedOnboarding(signedInUser.id)) return;
    if (hasSeenWhatsNew(signedInUser.id)) return;
    setShowWhatsNewTour(true);
  }, [signedInUser, isWorkspaceReady]);
  const handleSetLocalBgImage = (dataUrl: string | null) => {
    setLocalBgImageState(dataUrl);
    try {
      if (dataUrl) {
        localStorage.setItem('linkflow_local_bg_image', dataUrl);
      } else {
        localStorage.removeItem('linkflow_local_bg_image');
      }
    } catch {
      // Image too large for localStorage's quota. It still applies for this
      // session (state is already set above); it just won't persist across
      // a reload.
    }
  };

  // Sync state to localStorage
  useEffect(() => {
    const serialized = JSON.stringify(sections);
    localStorage.setItem('linkflow_sections', serialized);
    logSync('debug', 'local-cache', 'Sections written to local cache.', {
      storageKey: 'linkflow_sections',
      sectionCount: sections.length,
      serializedBytes: serialized.length,
      fingerprint: textFingerprint(serialized),
    });
  }, [sections]);

  useEffect(() => {
    const serialized = JSON.stringify(links);
    localStorage.setItem('linkflow_links', serialized);
    logSync('debug', 'local-cache', 'Links written to local cache.', {
      storageKey: 'linkflow_links',
      linkCount: links.length,
      serializedBytes: serialized.length,
      fingerprint: textFingerprint(serialized),
    });
  }, [links]);

  useEffect(() => {
    const serialized = JSON.stringify(theme);
    localStorage.setItem('linkflow_theme', serialized);
    logSync('debug', 'local-cache', 'Theme written to local cache.', {
      storageKey: 'linkflow_theme',
      preset: theme.preset,
      serializedBytes: serialized.length,
      fingerprint: textFingerprint(serialized),
    });

    // Update document class for dark mode
    if (theme.preset === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }

    // Set accent color and card opacity variables
    document.documentElement.style.setProperty('--accent-color', theme.accentColor);
    if (theme.cardOpacity !== undefined) {
      document.documentElement.style.setProperty('--card-opacity', theme.cardOpacity.toString());
    }

    // Apply the selected font pair: set the CSS variables the base layer
    // reads, and load the matching Google Fonts stylesheet at runtime (the
    // WordPress-hosted build never renders index.html's <head>, so a static
    // <link> there can't be relied on — this works in both environments and
    // for switching pairs mid-session).
    const fontPair = getFontPair(theme.fontPairId);
    document.documentElement.style.setProperty('--font-heading', fontPair.heading);
    document.documentElement.style.setProperty('--font-body', fontPair.body);
    document.documentElement.style.setProperty('--font-weight-heading', String(theme.headingWeight ?? 700));
    document.documentElement.style.setProperty('--heading-scale', String(theme.headingScale ?? 1));
    document.documentElement.style.setProperty('--link-text-scale', String(theme.linkTextScale ?? 1));
    const fontHref = buildGoogleFontsUrl(fontPair);
    let fontLink = document.getElementById('linkflow-font-link') as HTMLLinkElement | null;
    if (!fontLink) {
      fontLink = document.createElement('link');
      fontLink.id = 'linkflow-font-link';
      fontLink.rel = 'stylesheet';
      document.head.appendChild(fontLink);
    }
    if (fontLink.href !== fontHref) fontLink.href = fontHref;
  }, [theme]);

  useEffect(() => {
    const serialized = JSON.stringify(todos);
    localStorage.setItem('linkflow_todos', serialized);
    logSync('debug', 'local-cache', 'Todos written to local cache.', {
      storageKey: 'linkflow_todos',
      todoCount: todos.length,
      serializedBytes: serialized.length,
      fingerprint: textFingerprint(serialized),
    });
  }, [todos]);

  useEffect(() => {
    const serialized = JSON.stringify(timesheet);
    localStorage.setItem('linkflow_timesheet', serialized);
    logSync('debug', 'local-cache', 'Timesheet written to local cache.', {
      storageKey: 'linkflow_timesheet',
      serializedBytes: serialized.length,
      fingerprint: textFingerprint(serialized),
    });
  }, [timesheet]);

  useEffect(() => {
    const serialized = JSON.stringify(panelLayout);
    localStorage.setItem('linkflow_panel_layout', serialized);
    logSync('debug', 'local-cache', 'Panel layout written to local cache.', {
      storageKey: 'linkflow_panel_layout',
      serializedBytes: serialized.length,
      fingerprint: textFingerprint(serialized),
    });
  }, [panelLayout]);

  // The hosted WordPress app uses cloud storage as the source of truth. Local storage
  // remains only as a fast offline cache and migration source for standalone/Tauri use.
  useEffect(() => {
    let isMounted = true;

    if (!hasCloudBackend()) {
      logSync('warning', 'workspace', 'Initial cloud pull skipped because no cloud backend is configured.', {
        desktopSessionReady,
        environment: isDesktopApp() ? 'Tauri desktop' : 'WordPress hosted web app',
      });
      setIsWorkspaceReady(true);
      return undefined;
    }

    logSync('info', 'workspace', 'Initial cloud pull effect started.', {
      desktopSessionReady,
      cachedWorkspace: describeWorkspace({ sections, links, theme, todos, timesheet, panelLayout }),
    });
    setIsWorkspaceReady(false);

    void loadWorkspace()
      .then(({ workspace, version, updatedAt, diagnostics }) => {
        if (!isMounted) {
          logSync('warning', 'workspace', 'Initial cloud pull result ignored because the effect was unmounted.', { version, updatedAt, diagnostics });
          return;
        }

        if (workspace) {
          lastSavedWorkspace.current = JSON.stringify(workspace);
          logSync('success', 'workspace', 'Applying pulled cloud workspace to React state and local cache.', {
            version,
            updatedAt,
            workspace: describeWorkspace(workspace),
            serverDiagnostics: diagnostics,
          });
          setSections(workspace.sections);
          setLinks(workspace.links);
          setTheme(workspace.theme);
          // Defensive defaults: workspaces saved before this feature shipped
          // won't carry todos/timesheet at all.
          setTodos(workspace.todos ?? []);
          setTimesheet(workspace.timesheet ?? DEFAULT_TIMESHEET);
          setPanelLayout(reconcilePanelLayout(workspace.panelLayout));
        } else {
          logSync('warning', 'workspace', 'Server returned no workspace row; cached data remains active and will become the first cloud save.', {
            version,
            updatedAt,
            serverDiagnostics: diagnostics,
          });
        }
        setWorkspaceVersion(version);
      })
      .catch((error) => {
        if (isMounted) {
          logSync('error', 'workspace', 'Initial cloud pull failed; cached workspace remains active.', { error });
          setSyncError('Cloud workspace could not be loaded. Your cached workspace remains available.');
        } else {
          logSync('warning', 'workspace', 'Initial cloud pull failed after its effect had unmounted.', { error });
        }
      })
      .finally(() => {
        if (isMounted) {
          logSync('debug', 'workspace', 'Initial cloud pull effect marked the workspace ready.');
          setIsWorkspaceReady(true);
        }
      });

    return () => {
      isMounted = false;
      logSync('debug', 'workspace', 'Initial cloud pull effect cleanup ran.');
    };
  }, [desktopSessionReady]);

  useEffect(() => {
    if (!isWorkspaceReady || !hasCloudBackend()) {
      logSync('debug', 'workspace', 'Cloud push evaluation skipped.', {
        isWorkspaceReady,
        cloudBackendPresent: hasCloudBackend(),
        workspaceVersion,
      });
      return undefined;
    }

    const workspace: WorkspaceDocument = { sections, links, theme, todos, timesheet, panelLayout };
    const serializedWorkspace = JSON.stringify(workspace);
    if (serializedWorkspace === lastSavedWorkspace.current) {
      logSync('debug', 'workspace', 'Cloud push skipped because local state matches the last confirmed server workspace.', {
        workspaceVersion,
        fingerprint: textFingerprint(serializedWorkspace),
      });
      return undefined;
    }

    logSync('info', 'workspace', 'Local state differs from the last confirmed server workspace; scheduling POST in 800 ms.', {
      workspaceVersion,
      lastConfirmedFingerprint: lastSavedWorkspace.current ? textFingerprint(lastSavedWorkspace.current) : null,
      pendingWorkspace: describeWorkspace(workspace),
    });

    const saveTimer = window.setTimeout(() => {
      logSync('info', 'workspace', 'The 800 ms debounce completed; starting cloud POST now.', {
        expectedServerVersion: workspaceVersion,
        workspace: describeWorkspace(workspace),
      });
      void saveWorkspace(workspace, workspaceVersion)
        .then(({ version, updatedAt, diagnostics }) => {
          lastSavedWorkspace.current = serializedWorkspace;
          setWorkspaceVersion(version);
          setSyncError(null);
          logSync('success', 'workspace', 'POST was accepted; local state is now marked as confirmed by the server.', {
            previousVersion: workspaceVersion,
            returnedVersion: version,
            updatedAt,
            serverDiagnostics: diagnostics,
            confirmedFingerprint: textFingerprint(serializedWorkspace),
          });
        })
        .catch((error: Error & { status?: number; code?: string; responseBody?: unknown; requestId?: string }) => {
          const diagnostic = [error.status, error.code].filter(Boolean).join(' / ');
          logSync('error', 'workspace', 'POST failed or was refused; local cache remains changed but server confirmation was not recorded.', {
            expectedServerVersion: workspaceVersion,
            diagnostic,
            pendingWorkspace: describeWorkspace(workspace),
            error,
          });
          setSyncError(
            error.status === 409
              ? 'This workspace changed on another device. Reload the page before continuing.'
              : `Cloud workspace could not be saved${diagnostic ? ` (${diagnostic})` : ''}: ${error.message}`
          );
        });
    }, 800);

    return () => {
      window.clearTimeout(saveTimer);
      logSync('debug', 'workspace', 'Pending cloud POST debounce was cleared because state/version changed or the effect unmounted.', {
        expectedServerVersion: workspaceVersion,
        pendingFingerprint: textFingerprint(serializedWorkspace),
      });
    };
  }, [isWorkspaceReady, sections, links, theme, todos, timesheet, panelLayout, workspaceVersion]);

  // Section Handlers
  const handleToggleSection = (id: string) => {
    setSections((prev) =>
      prev.map((sec) =>
        sec.id === id ? { ...sec, isExpanded: !sec.isExpanded } : sec
      )
    );
  };

  const handleSaveSection = (
    sectionData: Omit<LinkSection, 'id' | 'order'>,
    editingId?: string
  ) => {
    if (editingId) {
      setSections((prev) =>
        prev.map((sec) =>
          sec.id === editingId ? { ...sec, ...sectionData } : sec
        )
      );
    } else {
      const newSection: LinkSection = {
        ...sectionData,
        id: 'section-' + Date.now(),
        order: sections.length + 1,
      };
      setSections((prev) => [...prev, newSection]);
    }
  };

  const handleDeleteSection = (id: string) => {
    if (confirm('Are you sure you want to delete this section? Links inside will remain available.')) {
      const unassignedSectionId = 'unassigned-links';

      setSections((prev) => {
        const remainingSections = prev.filter((sec) => sec.id !== id);
        const hasLinksToMove = links.some((link) => link.sectionId === id);

        if (!hasLinksToMove || remainingSections.some((sec) => sec.id === unassignedSectionId)) {
          return remainingSections;
        }

        return [
          ...remainingSections,
          {
            id: unassignedSectionId,
            name: 'Unassigned Links',
            icon: 'link',
            isExpanded: true,
            allowCollapse: true,
            defaultState: 'expanded',
            order: Math.max(0, ...remainingSections.map((sec) => sec.order)) + 1,
          },
        ];
      });

      setLinks((prev) =>
        prev.map((link) =>
          link.sectionId === id ? { ...link, sectionId: unassignedSectionId } : link
        )
      );
    }
  };

  // Link Handlers
  const handleSaveLink = (
    linkData: Omit<LinkItem, 'id' | 'createdAt'>,
    editingId?: string
  ) => {
    if (editingId) {
      setLinks((prev) =>
        prev.map((link) =>
          link.id === editingId ? { ...link, ...linkData } : link
        )
      );
    } else {
      const newLink: LinkItem = {
        ...linkData,
        id: 'link-' + Date.now(),
        clickCount: 0,
        createdAt: new Date().toISOString(),
      };
      setLinks((prev) => [...prev, newLink]);
    }
  };

  const handleToggleFavorite = (id: string) => {
    setLinks((prev) =>
      prev.map((link) =>
        link.id === id ? { ...link, isFavorite: !link.isFavorite } : link
      )
    );
  };

  // Todo Handlers
  const handleSaveTask = (
    taskData: Omit<TodoItem, 'id' | 'createdAt' | 'done'>,
    editingId?: string
  ) => {
    if (editingId) {
      setTodos((prev) =>
        prev.map((todo) => (todo.id === editingId ? { ...todo, ...taskData } : todo))
      );
    } else {
      const newTodo: TodoItem = {
        ...taskData,
        id: 'todo-' + Date.now(),
        done: false,
        createdAt: new Date().toISOString(),
      };
      setTodos((prev) => [...prev, newTodo]);
    }
  };

  const handleToggleTodoDone = (id: string) => {
    setTodos((prev) =>
      prev.map((todo) => (todo.id === id ? { ...todo, done: !todo.done } : todo))
    );
  };

  const handleDeleteTodo = (id: string) => {
    setTodos((prev) => prev.filter((todo) => todo.id !== id));
  };

  // Timesheet handlers. The button has one short-press action and one
  // long-press (hold-to-stop) action; a short press means "start" when idle,
  // "resume" when paused, and "pause" when running — decided here in one
  // atomic functional update rather than as separate exposed actions, so a
  // rapid double-press can never race itself into an inconsistent state.
  const handleTimerShortPress = () => {
    setTimesheet((prev) => {
      if (prev.currentSessionStart) {
        // Running -> pause: bank this run segment's elapsed time and stop
        // ticking, but keep sessionStartedAt so the session can still be
        // resumed or later finalized by a long-press.
        const bankedMs = (prev.pausedElapsedMs || 0) + (Date.now() - Date.parse(prev.currentSessionStart));
        return { ...prev, currentSessionStart: null, pausedElapsedMs: bankedMs };
      }
      // Idle or paused -> start/resume. sessionStartedAt is set once, on the
      // very first start, and left untouched across any later pause/resume —
      // it becomes the logged session's `start` time on Stop.
      const nowIso = new Date().toISOString();
      return { ...prev, currentSessionStart: nowIso, sessionStartedAt: prev.sessionStartedAt ?? nowIso };
    });
  };

  // Long-press completion: finalizes and logs the session, whether it was
  // actively running or paused at the moment the hold finished — a paused
  // session still has time worth logging, not just a running one.
  const handleTimerHoldComplete = () => {
    const newSessionId = 'session-' + Date.now();
    let didStop = false;
    setTimesheet((prev) => {
      if (!prev.sessionStartedAt) return prev;
      didStop = true;
      const end = new Date().toISOString();
      const liveSegmentMs = prev.currentSessionStart ? Date.parse(end) - Date.parse(prev.currentSessionStart) : 0;
      const durationSeconds = Math.round(((prev.pausedElapsedMs || 0) + liveSegmentMs) / 1000);
      return {
        ...prev,
        currentSessionStart: null,
        sessionStartedAt: null,
        pausedElapsedMs: 0,
        sessions: [
          ...prev.sessions,
          { id: newSessionId, start: prev.sessionStartedAt, end, durationSeconds },
        ],
      };
    });
    if (didStop) {
      // Desktop always uses the standalone always-on-top prompt window (see
      // openLogActivityPrompt) — for every trigger (this in-app Stop button,
      // the floating widget, or the tray icon), not just the ones that fire
      // via a Tauri event — so there's one consistent place this prompt
      // appears, never a competing in-window modal that's invisible whenever
      // the main window happens to be minimized/hidden. The hosted web page
      // has no window-management API to open a separate window with, so it
      // keeps the original in-page modal as its only option.
      if (isDesktopApp()) {
        void openLogActivityPrompt(newSessionId);
      } else {
        setLoggingSessionId(newSessionId);
        setIsLogActivityOpen(true);
      }
    }
  };

  const handleSaveSessionActivity = (sessionId: string, activity: string) => {
    setTimesheet((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) => (s.id === sessionId ? { ...s, activity } : s)),
    }));
  };

  // Always-on-top timer widget: open/close its window as the Settings toggle
  // changes. Desktop only — the concept doesn't exist on the hosted web page.
  useEffect(() => {
    if (!isDesktopApp()) return;
    if (timerWidgetEnabled) {
      void openTimerWidget();
    } else {
      void closeTimerWidget();
    }
  }, [timerWidgetEnabled]);

  // Tray icon: tell Rust to show/hide the one tray icon it built at startup.
  useEffect(() => {
    if (!isDesktopApp()) return;
    void import('@tauri-apps/api/core').then(({ invoke }) =>
      invoke('set_tray_visible', { visible: trayTimerEnabled }).catch(() => {})
    );
  }, [trayTimerEnabled]);

  // Broadcasts the running/paused/idle state to the floating widget window
  // (which has no access to this component's React state) and answers its
  // "I just opened, what's the current state?" ping — the widget then
  // computes its own live elapsed time and phase locally from these values,
  // the same way TimesheetPanel.tsx already does, rather than needing a
  // per-second event.
  useEffect(() => {
    if (!isDesktopApp()) return undefined;
    let unlistenReady: (() => void) | undefined;
    void (async () => {
      const { emit, listen } = await import('@tauri-apps/api/event');
      const broadcast = () =>
        void emit('linkflow://timesheet-state', {
          currentSessionStart: timesheet.currentSessionStart,
          sessionStartedAt: timesheet.sessionStartedAt,
          pausedElapsedMs: timesheet.pausedElapsedMs,
        });
      broadcast();
      unlistenReady = await listen('linkflow://timer-widget-ready', broadcast);
    })();
    return () => unlistenReady?.();
  }, [timesheet.currentSessionStart, timesheet.sessionStartedAt, timesheet.pausedElapsedMs]);

  // The floating widget's short press, the tray's short click, and the tray
  // menu's "Start / Pause Clock" item all funnel into this one event —
  // `handleTimerShortPress` itself decides start/resume/pause from the
  // current state, so this listener (subscribed once for the app's
  // lifetime) never needs to read state itself.
  useEffect(() => {
    if (!isDesktopApp()) return undefined;
    let unlistenToggle: (() => void) | undefined;
    let unlistenStop: (() => void) | undefined;
    void (async () => {
      const { listen } = await import('@tauri-apps/api/event');
      unlistenToggle = await listen('linkflow://timer-toggle', handleTimerShortPress);
      unlistenStop = await listen('linkflow://timer-stop', handleTimerHoldComplete);
    })();
    return () => {
      unlistenToggle?.();
      unlistenStop?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Answers the standalone "what did you work on?" prompt window (see
  // openLogActivityPrompt above and LogActivityWindow.tsx) — it has no access
  // to this component's state, so it emits the activity text back as an
  // event rather than calling handleSaveSessionActivity directly.
  useEffect(() => {
    if (!isDesktopApp()) return undefined;
    let unlisten: (() => void) | undefined;
    void (async () => {
      const { listen } = await import('@tauri-apps/api/event');
      unlisten = await listen<{ sessionId: string; activity: string }>('linkflow://log-activity-save', (event) => {
        handleSaveSessionActivity(event.payload.sessionId, event.payload.activity);
      });
    })();
    return () => unlisten?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pushes the live elapsed time into the tray icon's tooltip once a second
  // while a session is running or paused and the tray timer is enabled —
  // matches the same tick TimesheetPanel.tsx already runs for its own
  // display, just also forwarded to Rust since the tray has no view of React
  // state on its own.
  useEffect(() => {
    if (!isDesktopApp() || !trayTimerEnabled) return undefined;

    const pushTooltip = (text: string) =>
      void import('@tauri-apps/api/core').then(({ invoke }) => invoke('set_tray_tooltip', { text }).catch(() => {}));

    const phase = getTimerPhase(timesheet);
    if (phase === 'idle') {
      pushTooltip('LinkFlow — clocked out');
      return undefined;
    }

    const tick = () => {
      const label = formatElapsed(getLiveElapsedMs(timesheet, Date.now()));
      pushTooltip(`LinkFlow — ${phase === 'paused' ? 'paused' : 'running'} — ${label}`);
    };
    tick();
    if (phase !== 'running') return undefined;
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, [trayTimerEnabled, timesheet]);

  // Swaps the tray icon itself between the green/blue/black glyphs, drawn
  // natively in Rust (see tray_icon_image() in lib.rs) — only on phase
  // transitions, not every tick, since the icon doesn't show elapsed time.
  useEffect(() => {
    if (!isDesktopApp() || !trayTimerEnabled) return;
    void import('@tauri-apps/api/core').then(({ invoke }) =>
      invoke('set_tray_phase', { phase: getTimerPhase(timesheet) }).catch(() => {})
    );
  }, [trayTimerEnabled, timesheet]);

  const handleAddManualSession = (entry: { activity: string; start: string; end: string; durationSeconds: number }) => {
    setTimesheet((prev) => ({
      ...prev,
      sessions: [...prev.sessions, { id: 'session-' + Date.now(), ...entry }],
    }));
  };

  const handleUpdateSession = (sessionId: string, entry: { activity: string; start: string; end: string; durationSeconds: number }) => {
    setTimesheet((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) => (s.id === sessionId ? { ...s, ...entry } : s)),
    }));
  };

  const handleDeleteSession = (sessionId: string) => {
    setTimesheet((prev) => ({
      ...prev,
      sessions: prev.sessions.filter((s) => s.id !== sessionId),
    }));
  };

  const handleSetWeeklyTargetHours = (hours: number) => {
    setTimesheet((prev) => ({ ...prev, weeklyTargetHours: hours }));
  };

  const handleArchiveLink = (id: string) => {
    setLinks((prev) =>
      prev.map((link) => (link.id === id ? { ...link, isArchived: true } : link))
    );
  };

  const handleRestoreLink = (id: string) => {
    setLinks((prev) =>
      prev.map((link) => (link.id === id ? { ...link, isArchived: false } : link))
    );
  };

  const handleDeletePermanently = (id: string) => {
    setLinks((prev) => prev.filter((link) => link.id !== id));
  };

  const handleClearArchive = () => {
    setLinks((prev) => prev.filter((link) => !link.isArchived));
  };

  const handleIncrementClick = (id: string) => {
    setLinks((prev) =>
      prev.map((link) =>
        link.id === id ? { ...link, clickCount: (link.clickCount || 0) + 1 } : link
      )
    );
  };

  const handleUpdateTheme = (updates: Partial<ThemeConfig>) => {
    setTheme((prev) => ({ ...prev, ...updates }));
  };

  const handleResetTheme = () => {
    setTheme(DEFAULT_THEME);
  };

  const handleResetToDefaults = () => {
    setSections(INITIAL_SECTIONS);
    setLinks(INITIAL_LINKS);
    setTheme(DEFAULT_THEME);
  };

  const handleExpandAllSections = () => {
    setSections((prev) => prev.map((s) => ({ ...s, isExpanded: true })));
  };

  const handleCollapseAllSections = () => {
    setSections((prev) => prev.map((s) => ({ ...s, isExpanded: false })));
  };

  // Background styling based on theme settings
  const isDark = theme.preset === 'dark';
  const bgStyle = theme.showCanvasImage
    ? {
        backgroundImage: `url('${localBgImage || theme.canvasImageUrl}')`,
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundAttachment: 'fixed',
      }
    : isDark
    ? {
        background: 'radial-gradient(circle at 50% 0%, #0f172a 0%, #020617 100%)',
      }
    : {
        background: 'radial-gradient(circle at 50% 0%, #f8fafc 0%, #f1f5f9 60%, #e2e8f0 100%)',
      };

  // Walks new users through the whole recent Dashboard-panel batch in a
  // deliberate order: introduce each panel as a whole first, then its most
  // load-bearing control, before moving on to the next panel — rather than
  // jumping straight to controls with no framing. Steps 5-6 (desktop-only)
  // then cover the newer timer-widget/tray-icon Settings toggles, which need
  // Settings opened first since neither has an on-screen element of its own
  // to point at (a system tray icon and a second OS window are both outside
  // the DOM). Both toggle steps open Settings on `onEnter` (harmless if
  // already open, so the tour still lands correctly even if a step is
  // auto-skipped); only the *second* toggle step closes it again on
  // `onExit` — closing on every step would flash the modal shut and back
  // open between them.
  const whatsNewSteps: TourStep[] = [
    {
      id: 'timesheet-panel-intro',
      selector: '[data-tour="timesheet-panel"]',
      title: 'Track your time',
      body: 'The Timesheet panel logs a start/stop clock for your day, with a running progress bar against your weekly target.',
      onEnter: () => setActiveTab('dashboard'),
    },
    {
      id: 'timesheet-start-stop',
      selector: '[data-tour="timesheet-start-stop"]',
      title: 'Start or stop the clock',
      body: 'Press here to start timing, and again to stop and log the session. You can also add or edit an entry by hand.',
      onEnter: () => setActiveTab('dashboard'),
    },
    {
      id: 'todo-panel-intro',
      selector: '[data-tour="todo-panel"]',
      title: 'Keep a running task list',
      body: 'The To-Do List panel groups your tasks into Today and This Week, with optional priority flags and due dates.',
      onEnter: () => setActiveTab('dashboard'),
    },
    {
      id: 'todo-add-task',
      selector: '[data-tour="todo-add-task"]',
      title: 'Add a task',
      body: 'Add a new task here any time — set a priority or due date if you like, or leave them off for a simple checklist item.',
      onEnter: () => setActiveTab('dashboard'),
    },
    ...(isDesktopApp()
      ? [
          {
            id: 'timer-widget-toggle',
            selector: '[data-tour="timer-widget-toggle"]',
            title: 'Keep the timer visible anywhere',
            body: 'Turn on a floating always-on-top Play/Stop widget, so the running clock stays visible even while LinkFlow is minimized.',
            onEnter: () => setIsSettingsOpen(true),
          },
          {
            id: 'tray-timer-toggle',
            selector: '[data-tour="tray-timer-toggle"]',
            title: 'Or use the tray icon',
            body: 'This one shows the running time in the system tray instead, with a right-click menu to start or stop the clock.',
            onEnter: () => setIsSettingsOpen(true),
            onExit: () => setIsSettingsOpen(false),
          },
        ]
      : []),
  ];

  if (isRestoringDesktopSession) {
    return <div className="min-h-screen grid place-items-center bg-slate-950 text-sm text-slate-300">Restoring your LinkFlow session…</div>;
  }

  if (isDesktopApp() && !desktopSessionReady) {
    return <DesktopSignIn onSignedIn={() => {
      logSync('success', 'authentication', 'Sign-in component reported success; enabling the cloud workspace.');
      setSignedInUser(currentUser());
      setDesktopSessionReady(true);
    }} />;
  }

  if (!isWorkspaceReady) {
    return <div className="min-h-screen grid place-items-center bg-slate-50 text-slate-600 text-sm">Loading your LinkFlow workspace…</div>;
  }

  if (sections.length === 0 && links.length === 0 && signedInUser && !hasCompletedOnboarding(signedInUser.id)) {
    return (
      <OnboardingWizard
        onComplete={(newSections, newLinks) => {
          logSync('info', 'lifecycle', 'Onboarding wizard completed.', {
            sectionCount: newSections.length,
            linkCount: newLinks.length,
          });
          markOnboardingComplete(signedInUser.id);
          // A brand-new account already has these features from day one, so
          // the "what's new" tour (aimed at existing users catching up on a
          // later release) would just be redundant right after onboarding.
          markWhatsNewSeen(signedInUser.id);
          setSections((prev) => [...prev, ...newSections]);
          setLinks((prev) => [...prev, ...newLinks]);
        }}
      />
    );
  }

  if (isBulkImportOpen) {
    return (
      <OnboardingWizard
        existingSections={sections}
        onCancel={() => setIsBulkImportOpen(false)}
        onComplete={(newSections, newLinks) => {
          logSync('info', 'lifecycle', 'Bulk import completed.', {
            sectionCount: newSections.length,
            linkCount: newLinks.length,
          });
          setSections((prev) => [...prev, ...newSections]);
          setLinks((prev) => [...prev, ...newLinks]);
          setIsBulkImportOpen(false);
        }}
      />
    );
  }

  if (isDashboardSortOpen) {
    // SortBoard only knows a link's id/url/name/sectionId/order (WizardLinkDraft),
    // so it hands back fresh LinkItem objects with every other field reset to
    // defaults on completion. Re-hydrate from the real links by id afterward
    // so favorites, archive state, click counts, etc. survive the round trip —
    // only sectionId (and array order) actually changed.
    const activeLinks = links.filter((l) => !l.isArchived);
    const draftsBySection = new Map<string, LinkItem[]>();
    activeLinks.forEach((link) => {
      const bucket = draftsBySection.get(link.sectionId) ?? [];
      bucket.push(link);
      draftsBySection.set(link.sectionId, bucket);
    });
    const initialDrafts: WizardLinkDraft[] = activeLinks.map((link) => ({
      id: link.id,
      url: link.url,
      name: link.name,
      sectionId: link.sectionId,
      order: draftsBySection.get(link.sectionId)!.indexOf(link),
    }));

    return (
      <SortBoard
        initialLinks={initialDrafts}
        existingSections={sections}
        title="Sort your links"
        subtitle="Drag links between sections, or reorder them within one."
        doneLabel="Done"
        onCancel={() => setIsDashboardSortOpen(false)}
        onDone={(newSections, returnedLinks, orderedSectionIds) => {
          const originalById = new Map(links.map((l) => [l.id, l]));
          const merged = returnedLinks.map((rl) => {
            const original = originalById.get(rl.id);
            return original ? { ...original, sectionId: rl.sectionId } : rl;
          });
          const mergedIds = new Set(merged.map((l) => l.id));
          const untouched = links.filter((l) => !mergedIds.has(l.id));

          // Rebuild the sections array to match the board's final column
          // order (including any brand-new sections created during this
          // session), and keep the `order` field consistent with it.
          const allSectionsById = new Map([...sections, ...newSections].map((s) => [s.id, s]));
          const reorderedSections = orderedSectionIds
            .map((id) => allSectionsById.get(id))
            .filter((s): s is LinkSection => Boolean(s))
            .map((s, index) => ({ ...s, order: index + 1 }));

          logSync('info', 'lifecycle', 'Dashboard sort mode completed.', {
            newSectionCount: newSections.length,
            reorderedLinkCount: merged.length,
            sectionOrderChanged: reorderedSections.map((s) => s.id).join(',') !== sections.map((s) => s.id).join(','),
          });
          setSections(reorderedSections);
          setLinks([...merged, ...untouched]);
          setIsDashboardSortOpen(false);
        }}
      />
    );
  }

  return (
    <div className={`min-h-screen relative text-text-main ${isDark ? 'dark' : ''}`}>
      <UpdateBanner />
      <Cat enabled={catEnabled} />

      {/* Background Canvas Layer */}
      <div
        className="fixed inset-0 z-[-1] pointer-events-none transition-all duration-300"
        style={bgStyle}
      />

      {/* Blur Overlay if Canvas Image is active */}
      {theme.showCanvasImage && (
        <div
          className="fixed inset-0 z-[-1] pointer-events-none transition-all duration-300"
          style={{
            backdropFilter: `blur(${theme.bgBlur * 0.4}px)`,
            WebkitBackdropFilter: `blur(${theme.bgBlur * 0.4}px)`,
            backgroundColor: isDark
              ? `rgba(15, 23, 42, ${theme.bgOverlayOpacity ?? 0.65})`
              : `rgba(248, 250, 252, ${theme.bgOverlayOpacity ?? 0.65})`,
          }}
        />
      )}

      {/* Navigation Top Bar */}
      <TopNavBar
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        theme={theme}
        onUpdateTheme={handleUpdateTheme}
        onOpenAddLink={() => {
          setEditingLink(null);
          setDefaultSectionForAddLink(sections[0]?.id || '');
          setIsAddLinkOpen(true);
        }}
        onOpenAddSection={() => {
          setEditingSection(null);
          setIsAddSectionOpen(true);
        }}
        onOpenBulkImport={() => setIsBulkImportOpen(true)}
        onOpenSettings={() => setIsSettingsOpen(true)}
        onOpenAdvancedTheme={() => setIsAdvancedThemeOpen(true)}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        userDisplayName={signedInUser?.displayName}
        userEmail={signedInUser?.email}
        userAvatarUrl={signedInUser?.avatarUrl}
        onSignOut={handleSignOut}
        onOpenDiagnostics={() => void openDiagnosticsWindow()}
        hasSections={sections.length > 0}
        catEnabled={catEnabled}
        onSetCatEnabled={handleSetCatEnabled}
      />

      {/* Main Screen Views */}
      <main className="min-h-screen flex flex-col" style={{ paddingTop: 'var(--host-chrome-offset, 0px)' }}>
        {syncError && (
          <div className="fixed bottom-4 right-4 z-50 max-w-sm rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-medium text-amber-900 shadow-lg">
            {syncError}
          </div>
        )}
        {activeTab === 'dashboard' && (
          <div className="flex flex-1 items-start max-w-[1880px] mx-auto w-full">
            <WidgetGrid
              layout={panelLayout}
              onLayoutChange={setPanelLayout}
              renderWidget={(id) =>
                id === 'todo' ? (
                  <TodoPanel
                    todos={todos}
                    onToggleDone={handleToggleTodoDone}
                    onOpenAddTask={() => {
                      setEditingTodo(null);
                      setIsAddTaskOpen(true);
                    }}
                    onEditTask={(todo) => {
                      setEditingTodo(todo);
                      setIsAddTaskOpen(true);
                    }}
                    onDeleteTask={handleDeleteTodo}
                  />
                ) : (
                  <TimesheetPanel
                    timesheet={timesheet}
                    onShortPress={handleTimerShortPress}
                    onHoldComplete={handleTimerHoldComplete}
                    onOpenManualEntry={() => {
                      setEditingSession(null);
                      setIsManualEntryOpen(true);
                    }}
                    onEditSession={(session) => {
                      setEditingSession(session);
                      setIsManualEntryOpen(true);
                    }}
                    onDeleteSession={handleDeleteSession}
                  />
                )
              }
            >
              <div className="flex-1 min-w-0">
                <DashboardView
                  sections={sections}
                  links={links}
                  onToggleSection={handleToggleSection}
                  onEditSection={(section) => {
                    setEditingSection(section);
                    setIsAddSectionOpen(true);
                  }}
                  onDeleteSection={handleDeleteSection}
                  onOpenAddLinkForSection={(secId) => {
                    setEditingLink(null);
                    setDefaultSectionForAddLink(secId);
                    setIsAddLinkOpen(true);
                  }}
                  onOpenAddSection={() => {
                    setEditingSection(null);
                    setIsAddSectionOpen(true);
                  }}
                  onEditLink={(link) => {
                    setEditingLink(link);
                    setIsAddLinkOpen(true);
                  }}
                  onToggleFavorite={handleToggleFavorite}
                  onArchiveLink={handleArchiveLink}
                  onIncrementClick={handleIncrementClick}
                  onOpenSort={() => setIsDashboardSortOpen(true)}
                  searchQuery={searchQuery}
                />
              </div>
            </WidgetGrid>
          </div>
        )}

        {activeTab === 'collections' && (
          <CollectionsView
            links={links}
            onEditLink={(link) => {
              setEditingLink(link);
              setIsAddLinkOpen(true);
            }}
            onToggleFavorite={handleToggleFavorite}
            onArchiveLink={handleArchiveLink}
            onIncrementClick={handleIncrementClick}
            onOpenAddLink={() => {
              setEditingLink(null);
              setDefaultSectionForAddLink(sections[0]?.id || '');
              setIsAddLinkOpen(true);
            }}
            searchQuery={searchQuery}
          />
        )}


        {activeTab === 'archive' && (
          <ArchiveView
            links={links}
            onRestoreLink={handleRestoreLink}
            onDeletePermanently={handleDeletePermanently}
            onClearArchive={handleClearArchive}
          />
        )}
      </main>

      {/* Modals */}
      <AddLinkModal
        isOpen={isAddLinkOpen}
        onClose={() => {
          setIsAddLinkOpen(false);
          setEditingLink(null);
        }}
        sections={sections}
        onSaveLink={handleSaveLink}
        editingLink={editingLink}
        defaultSectionId={defaultSectionForAddLink}
      />

      <AddSectionModal
        isOpen={isAddSectionOpen}
        onClose={() => {
          setIsAddSectionOpen(false);
          setEditingSection(null);
        }}
        onSaveSection={handleSaveSection}
        editingSection={editingSection}
      />

      <AddTaskModal
        isOpen={isAddTaskOpen}
        onClose={() => {
          setIsAddTaskOpen(false);
          setEditingTodo(null);
        }}
        onSaveTask={handleSaveTask}
        editingTask={editingTodo}
      />

      <LogActivityModal
        isOpen={isLogActivityOpen}
        onClose={() => {
          setIsLogActivityOpen(false);
          setLoggingSessionId(null);
        }}
        onSave={(activity) => {
          if (loggingSessionId) handleSaveSessionActivity(loggingSessionId, activity);
          setIsLogActivityOpen(false);
          setLoggingSessionId(null);
        }}
      />

      <ManualTimeEntryModal
        isOpen={isManualEntryOpen}
        editingSession={editingSession}
        onClose={() => {
          setIsManualEntryOpen(false);
          setEditingSession(null);
        }}
        onSave={(entry) => {
          if (editingSession) {
            handleUpdateSession(editingSession.id, entry);
          } else {
            handleAddManualSession(entry);
          }
          setIsManualEntryOpen(false);
          setEditingSession(null);
        }}
      />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        sections={sections}
        links={links}
        onImportData={(newSections, newLinks) => {
          setSections(newSections);
          setLinks(newLinks);
        }}
        theme={theme}
        onImportTheme={setTheme}
        onResetToDefaults={handleResetToDefaults}
        onExpandAllSections={handleExpandAllSections}
        onCollapseAllSections={handleCollapseAllSections}
        catEnabled={catEnabled}
        onSetCatEnabled={handleSetCatEnabled}
        weeklyTargetHours={timesheet.weeklyTargetHours}
        onSetWeeklyTargetHours={handleSetWeeklyTargetHours}
        timerWidgetEnabled={timerWidgetEnabled}
        onSetTimerWidgetEnabled={handleSetTimerWidgetEnabled}
        trayTimerEnabled={trayTimerEnabled}
        onSetTrayTimerEnabled={handleSetTrayTimerEnabled}
      />

      <AdvancedThemeModal
        isOpen={isAdvancedThemeOpen}
        onClose={() => setIsAdvancedThemeOpen(false)}
        theme={theme}
        onUpdateTheme={handleUpdateTheme}
        onResetTheme={handleResetTheme}
        localBgImage={localBgImage}
        onSetLocalBgImage={handleSetLocalBgImage}
      />

      {showWhatsNewTour && signedInUser && (
        <WhatsNewTour
          steps={whatsNewSteps}
          onFinish={() => {
            // Belt-and-braces: also closes Settings if the tour is skipped
            // while still on the first toggle step, which has no `onExit`
            // of its own (only the second toggle step's `onExit` normally
            // closes it — see the comment above whatsNewSteps).
            setIsSettingsOpen(false);
            markWhatsNewSeen(signedInUser.id);
            setShowWhatsNewTour(false);
          }}
        />
      )}
    </div>
  );
}
