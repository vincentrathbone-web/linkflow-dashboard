import React, { useState, useEffect, useRef } from 'react';
import {
  LinkSection,
  LinkItem,
  ThemeConfig,
  NavTab,
  TodoItem,
  TimesheetState,
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
import { Cat } from './cat/Cat';
import { describeWorkspace, logSync, textFingerprint } from './lib/syncDiagnostics';

const ONBOARDING_KEY = 'linkflow_onboarding_done';

function hasCompletedOnboarding(userId: number): boolean {
  return localStorage.getItem(ONBOARDING_KEY) === String(userId);
}

function markOnboardingComplete(userId: number): void {
  localStorage.setItem(ONBOARDING_KEY, String(userId));
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
      const value = saved ? JSON.parse(saved) : DEFAULT_PANEL_LAYOUT;
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
          setPanelLayout(workspace.panelLayout ?? DEFAULT_PANEL_LAYOUT);
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

  // Timesheet Handlers
  const handleStartClock = () => {
    setTimesheet((prev) =>
      prev.currentSessionStart ? prev : { ...prev, currentSessionStart: new Date().toISOString() }
    );
  };

  const handleStopClock = () => {
    const newSessionId = 'session-' + Date.now();
    let didStop = false;
    setTimesheet((prev) => {
      if (!prev.currentSessionStart) return prev;
      didStop = true;
      const end = new Date().toISOString();
      const durationSeconds = Math.round((Date.parse(end) - Date.parse(prev.currentSessionStart)) / 1000);
      return {
        ...prev,
        currentSessionStart: null,
        sessions: [
          ...prev.sessions,
          { id: newSessionId, start: prev.currentSessionStart, end, durationSeconds },
        ],
      };
    });
    if (didStop) {
      setLoggingSessionId(newSessionId);
      setIsLogActivityOpen(true);
    }
  };

  const handleSaveSessionActivity = (sessionId: string, activity: string) => {
    setTimesheet((prev) => ({
      ...prev,
      sessions: prev.sessions.map((s) => (s.id === sessionId ? { ...s, activity } : s)),
    }));
  };

  const handleAddManualSession = (entry: { activity: string; start: string; end: string; durationSeconds: number }) => {
    setTimesheet((prev) => ({
      ...prev,
      sessions: [...prev.sessions, { id: 'session-' + Date.now(), ...entry }],
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
                    onStartClock={handleStartClock}
                    onStopClock={handleStopClock}
                    onOpenManualEntry={() => setIsManualEntryOpen(true)}
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
        onClose={() => setIsManualEntryOpen(false)}
        onSave={(entry) => {
          handleAddManualSession(entry);
          setIsManualEntryOpen(false);
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
    </div>
  );
}
