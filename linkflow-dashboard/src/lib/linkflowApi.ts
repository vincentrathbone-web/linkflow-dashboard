import { LinkItem, LinkSection, ThemeConfig } from '../types';
import { describeWorkspace, logSync, nextRequestId } from './syncDiagnostics';

export interface WorkspaceDocument {
  sections: LinkSection[];
  links: LinkItem[];
  theme: ThemeConfig;
}

interface LinkFlowUser {
  id: number;
  displayName: string;
  email?: string;
}

interface LinkFlowRuntimeConfig {
  restUrl: string;
  nonce?: string;
  authorization?: string;
  deviceToken?: string;
  user?: LinkFlowUser;
  logoutUrl?: string;
}

interface WorkspaceResponse {
  workspace: WorkspaceDocument | null;
  version: number;
  updatedAt?: string;
  diagnostics?: unknown;
}


declare global {
  interface Window {
    linkflowConfig?: LinkFlowRuntimeConfig;
  }
}

function runtimeConfig(): LinkFlowRuntimeConfig | null {
  const config = window.linkflowConfig;
  return config?.restUrl ? config : null;
}

export function isDesktopApp(): boolean {
  return '__TAURI_INTERNALS__' in window;
}

export function configureCloudBackend(restUrl: string, authorization: string, user?: LinkFlowUser): void {
  const baseUrl = new URL(restUrl);
  window.linkflowConfig = {
    restUrl: baseUrl.toString().replace(/\/?$/, '/'),
    deviceToken: authorization.replace(/^Bearer\s+/i, ''),
    user,
  };
  logSync('success', 'configuration', 'Cloud backend configured.', {
    suppliedRestUrl: restUrl,
    normalizedRestUrl: window.linkflowConfig.restUrl,
    authenticationMode: 'X-LinkFlow-Token',
    tokenPresent: Boolean(window.linkflowConfig.deviceToken),
    tokenLength: window.linkflowConfig.deviceToken?.length ?? 0,
    user,
  });
}

/** The signed-in user's id/display name, if known in this session. */
export function currentUser(): LinkFlowUser | null {
  return window.linkflowConfig?.user ?? null;
}

interface DesktopSession {
  token: string;
  restUrl: string;
  deviceId: number;
  user: LinkFlowUser;
}

export async function signInToCloud(siteUrl: string, username: string, password: string): Promise<LinkFlowUser> {
  const requestId = nextRequestId();
  logSync('info', 'authentication', 'Desktop sign-in started.', {
    requestId,
    siteUrl,
    username,
    passwordPresent: Boolean(password),
    passwordLength: password.length,
  });
  const origin = new URL(siteUrl);
  if (origin.protocol !== 'https:') {
    logSync('error', 'authentication', 'Desktop sign-in blocked because the site is not HTTPS.', { requestId, siteUrl });
    throw new Error('LinkFlow requires an HTTPS WordPress address.');
  }

  const sessionUrl = new URL('/wp-json/linkflow/v1/desktop/session', origin).toString();
  logSync('info', 'authentication', 'Sending credential exchange POST to WordPress.', {
    requestId,
    method: 'POST',
    url: sessionUrl,
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: { username, password, deviceLabel: 'LinkFlow for Windows' },
  });

  const startedAt = performance.now();
  let response: Response;
  try {
    response = await fetch(sessionUrl, {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', 'X-LinkFlow-Request-ID': requestId },
      body: JSON.stringify({ username, password, deviceLabel: 'LinkFlow for Windows' }),
      cache: 'no-store',
    });
  } catch (error) {
    logSync('error', 'authentication', 'Credential exchange failed before an HTTP response was received.', {
      requestId,
      url: sessionUrl,
      durationMs: Math.round(performance.now() - startedAt),
      error,
    });
    throw error;
  }
  const session = await response.json().catch(() => null) as DesktopSession | null;
  logSync(response.ok ? 'success' : 'error', 'authentication', 'WordPress credential exchange responded.', {
    requestId,
    url: sessionUrl,
    status: response.status,
    statusText: response.statusText,
    durationMs: Math.round(performance.now() - startedAt),
    responseHeaders: Object.fromEntries(response.headers.entries()),
    responseBody: session,
  });
  if (!response.ok || !session?.token || !session.restUrl) {
    throw new Error((session as { message?: string } | null)?.message || 'Unable to sign in to LinkFlow.');
  }

  configureCloudBackend(session.restUrl, `Bearer ${session.token}`, session.user);
  try {
    logSync('info', 'authentication', 'Verifying the new device token with GET /me.', { requestId });
    await request<LinkFlowUser>('me');
    logSync('success', 'authentication', 'The server accepted the new device token.', {
      requestId,
      user: session.user,
      deviceId: session.deviceId,
    });
  } catch (error) {
    window.linkflowConfig = undefined;
    logSync('error', 'authentication', 'The new device token was refused during verification; backend configuration was cleared.', { requestId, error });
    throw error;
  }

  if (isDesktopApp()) {
    const { invoke } = await import('@tauri-apps/api/core');
    logSync('info', 'authentication', 'Saving the accepted device session in Windows Credential Manager.', {
      requestId,
      restUrl: session.restUrl,
      tokenPresent: true,
      tokenLength: session.token.length,
    });
    await invoke('save_desktop_session', { restUrl: session.restUrl, token: session.token });
    logSync('success', 'authentication', 'Desktop session saved in Windows Credential Manager.', { requestId });
  }

  return session.user;
}

export async function signInWithGoogle(siteUrl: string): Promise<void> {
  const requestId = nextRequestId();
  const origin = new URL(siteUrl);
  if (origin.protocol !== 'https:') {
    logSync('error', 'authentication', 'Google sign-in blocked because the site is not HTTPS.', { requestId, siteUrl });
    throw new Error('LinkFlow requires an HTTPS WordPress address.');
  }

  const startUrl = new URL('/wp-json/linkflow/v1/desktop/google/start', origin).toString();
  logSync('info', 'authentication', 'Google sign-in started; opening the system browser.', { requestId, startUrl });

  const { openUrl } = await import('@tauri-apps/plugin-opener');
  await openUrl(startUrl);
}

type GoogleCallbackResult = LinkFlowUser;

export async function completeGoogleSignIn(callbackUrl: string): Promise<GoogleCallbackResult> {
  const requestId = nextRequestId();
  const parsed = new URL(callbackUrl);
  const token = parsed.searchParams.get('token');
  const restUrl = parsed.searchParams.get('restUrl');
  const displayName = parsed.searchParams.get('displayName') || '';
  const email = parsed.searchParams.get('email') || undefined;
  const userId = Number(parsed.searchParams.get('userId') || 0);

  logSync('info', 'authentication', 'Google sign-in callback received from the system browser.', {
    requestId,
    tokenPresent: Boolean(token),
    tokenLength: token?.length ?? 0,
    restUrl,
    displayName,
    email,
  });

  if (!token || !restUrl) {
    logSync('error', 'authentication', 'Google sign-in callback was missing the token or REST URL.', { requestId, callbackUrl });
    throw new Error('Google sign-in did not complete correctly. Please try again.');
  }

  configureCloudBackend(restUrl, `Bearer ${token}`, { id: userId, displayName, email });

  try {
    logSync('info', 'authentication', 'Verifying the Google-issued device token with GET /me.', { requestId });
    await request<LinkFlowUser>('me');
    logSync('success', 'authentication', 'The server accepted the Google-issued device token.', { requestId, userId, displayName });
  } catch (error) {
    window.linkflowConfig = undefined;
    logSync('error', 'authentication', 'The Google-issued device token was refused during verification; backend configuration was cleared.', { requestId, error });
    throw error;
  }

  if (isDesktopApp()) {
    const { invoke } = await import('@tauri-apps/api/core');
    logSync('info', 'authentication', 'Saving the Google-issued device session in Windows Credential Manager.', {
      requestId,
      restUrl,
      tokenPresent: true,
      tokenLength: token.length,
    });
    await invoke('save_desktop_session', { restUrl, token });
    logSync('success', 'authentication', 'Desktop session saved in Windows Credential Manager.', { requestId });
  }

  return { id: userId, displayName, email };
}

export async function restoreDesktopSession(): Promise<boolean> {
  if (!isDesktopApp()) {
    logSync('debug', 'authentication', 'Desktop session restore skipped because this is the hosted web app.');
    return false;
  }

  const { invoke } = await import('@tauri-apps/api/core');
  logSync('info', 'authentication', 'Requesting the saved session from Windows Credential Manager.');
  const session = await invoke<{ rest_url: string; token: string } | null>('load_desktop_session');
  if (!session) {
    logSync('warning', 'authentication', 'No saved desktop session was found.');
    return false;
  }
  logSync('success', 'authentication', 'A saved desktop session was returned.', {
    restUrl: session.rest_url,
    tokenPresent: Boolean(session.token),
    tokenLength: session.token.length,
  });
  configureCloudBackend(session.rest_url, `Bearer ${session.token}`);

  try {
    const user = await request<LinkFlowUser>('me');
    if (window.linkflowConfig) window.linkflowConfig.user = user;
  } catch (error) {
    logSync('warning', 'authentication', 'Could not fetch the signed-in user profile after restoring the session.', { error });
  }

  return true;
}

export function hasCloudBackend(): boolean {
  return runtimeConfig() !== null;
}

/**
 * Sign out of the cloud workspace: revoke the device token server-side,
 * clear the saved Windows Credential Manager entry (desktop only), and
 * clear the in-memory backend configuration so the app falls back to the
 * sign-in screen.
 */
export async function signOutOfCloud(): Promise<void> {
  const requestId = nextRequestId();
  logSync('info', 'authentication', 'Sign-out requested.', { requestId, environment: isDesktopApp() ? 'Tauri desktop' : 'WordPress hosted web app' });

  if (hasCloudBackend()) {
    try {
      await request('desktop/session', { method: 'DELETE' });
      logSync('success', 'authentication', 'Device token revoked on the server.', { requestId });
    } catch (error) {
      logSync('warning', 'authentication', 'Could not revoke the device token on the server; clearing the local session anyway.', { requestId, error });
    }
  }

  if (isDesktopApp()) {
    try {
      const { invoke } = await import('@tauri-apps/api/core');
      await invoke('clear_desktop_session');
      logSync('success', 'authentication', 'Cleared the saved session from Windows Credential Manager.', { requestId });
    } catch (error) {
      logSync('error', 'authentication', 'Could not clear the saved session from Windows Credential Manager.', { requestId, error });
    }
  }

  window.linkflowConfig = undefined;
  logSync('success', 'authentication', 'Signed out; cloud backend configuration cleared.', { requestId });
}

/**
 * Sign out and return the caller to a clean, logged-out state.
 *
 * On the desktop app this just clears the local session (there is no
 * WordPress cookie to worry about). On the hosted web app, clearing
 * `window.linkflowConfig` alone would not end the WordPress session — the
 * next page load would just reconfigure the same backend from the still-valid
 * cookie — so it navigates to WordPress's own nonce-verified logout URL
 * instead, which properly clears the auth cookie server-side.
 */
export async function signOut(): Promise<void> {
  const logoutUrl = window.linkflowConfig?.logoutUrl;
  await signOutOfCloud();
  if (logoutUrl) {
    window.location.href = logoutUrl;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const requestId = nextRequestId();
  const config = runtimeConfig();
  if (!config) {
    logSync('error', 'http', 'Cloud request refused locally because no backend is configured.', { requestId, path, init });
    throw new Error('The cloud backend is not configured.');
  }

  const headers = new Headers(init.headers);
  headers.set('Accept', 'application/json');
  headers.set('X-LinkFlow-Request-ID', requestId);
  if (config.nonce) headers.set('X-WP-Nonce', config.nonce);
  if (config.deviceToken) headers.set('X-LinkFlow-Token', config.deviceToken);
  else if (config.authorization) headers.set('Authorization', config.authorization);
  if (init.body) headers.set('Content-Type', 'application/json');

  const method = init.method?.toUpperCase() || 'GET';
  const url = new URL(path, config.restUrl);
  if ('GET' === method) url.searchParams.set('_linkflow_no_cache', `${Date.now()}`);
  const authenticationMode = config.deviceToken
    ? 'X-LinkFlow-Token'
    : config.authorization
      ? 'Authorization'
      : config.nonce
        ? 'WordPress nonce/cookie'
        : 'WordPress cookie';
  const requestBody = typeof init.body === 'string'
    ? (() => { try { return JSON.parse(init.body); } catch { return init.body; } })()
    : init.body;
  const safeHeaders = Object.fromEntries(headers.entries());
  if (safeHeaders['x-linkflow-token']) safeHeaders['x-linkflow-token'] = '[PRESENT AND REDACTED]';
  if (safeHeaders.authorization) safeHeaders.authorization = '[PRESENT AND REDACTED]';
  if (safeHeaders['x-wp-nonce']) safeHeaders['x-wp-nonce'] = '[PRESENT AND REDACTED]';
  const credentials = config.deviceToken || config.authorization ? 'omit' : 'same-origin';

  logSync('info', 'http', `Sending ${method} ${path}.`, {
    requestId,
    method,
    url: url.toString(),
    restBaseUrl: config.restUrl,
    authenticationMode,
    credentials,
    headers: safeHeaders,
    requestBody,
  });

  const startedAt = performance.now();
  let response: Response;
  try {
    response = await fetch(url.toString(), {
      ...init,
      headers,
      credentials,
      cache: 'no-store',
    });
  } catch (error) {
    logSync('error', 'http', `${method} ${path} failed before an HTTP response was received.`, {
      requestId,
      url: url.toString(),
      durationMs: Math.round(performance.now() - startedAt),
      likelyCauses: ['network unavailable', 'DNS/TLS failure', 'CORS refusal', 'server unreachable'],
      error,
    });
    throw error;
  }
  const body = await response.json().catch(() => null);

  logSync(response.ok ? 'success' : 'error', 'http', `${method} ${path} received HTTP ${response.status}.`, {
    requestId,
    url: url.toString(),
    status: response.status,
    statusText: response.statusText,
    ok: response.ok,
    durationMs: Math.round(performance.now() - startedAt),
    responseHeaders: Object.fromEntries(response.headers.entries()),
    responseBody: body,
  });

  if (!response.ok) {
    const error = new Error(body?.message || 'Unable to communicate with LinkFlow cloud storage.');
    Object.assign(error, { status: response.status, code: body?.code, responseBody: body, requestId });
    throw error;
  }

  return body as T;
}

export interface DailyInspiration {
  type: 'quote' | 'verse';
  text: string;
  author: string | null;
  reference: string | null;
  source: string | null;
  sourceUrl: string | null;
}

export async function getDailyInspiration(type: 'quote' | 'verse'): Promise<DailyInspiration> {
  return request<DailyInspiration>(`daily-inspiration?type=${type}`);
}

export async function loadWorkspace(): Promise<WorkspaceResponse> {
  logSync('info', 'workspace', 'Cloud workspace pull requested.');
  const result = await request<WorkspaceResponse>('workspace');
  logSync('success', 'workspace', 'Cloud workspace pull completed.', {
    version: result.version,
    updatedAt: result.updatedAt,
    workspace: result.workspace ? describeWorkspace(result.workspace) : null,
    serverDiagnostics: result.diagnostics,
  });
  return result;
}

export async function saveWorkspace(workspace: WorkspaceDocument, version: number): Promise<{ version: number; updatedAt?: string; diagnostics?: unknown }> {
  logSync('info', 'workspace', 'Cloud workspace push requested.', {
    expectedServerVersion: version,
    workspace: describeWorkspace(workspace),
  });
  const result = await request<{ version: number; updatedAt?: string; diagnostics?: unknown }>('workspace', {
    method: 'POST',
    headers: { 'X-LinkFlow-Version': String(version) },
    body: JSON.stringify(workspace),
  });
  logSync('success', 'workspace', 'Cloud workspace push completed.', {
    expectedServerVersion: version,
    returnedServerVersion: result.version,
    updatedAt: result.updatedAt,
    serverDiagnostics: result.diagnostics,
    workspace: describeWorkspace(workspace),
  });
  return result;
}
