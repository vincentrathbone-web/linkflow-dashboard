import { FormEvent, useEffect, useState } from 'react';
import { KeyRound, Link as LinkIcon, LockKeyhole } from 'lucide-react';
import { completeGoogleSignIn, isDesktopApp, signInToCloud, signInWithGoogle } from '../lib/linkflowApi';
import { logSync } from '../lib/syncDiagnostics';

interface DesktopSignInProps {
  onSignedIn: () => void;
}

const SAVED_SITE_KEY = 'linkflow_cloud_site';

function GoogleLogo({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.9 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.1 8 3l5.7-5.7C34.6 6.1 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.9 18.9 13 24 13c3.1 0 5.9 1.1 8 3l5.7-5.7C34.6 6.1 29.6 4 24 4 16.3 4 9.6 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.4C29.6 35.4 26.9 36 24 36c-5.3 0-9.7-3.1-11.3-7.9l-6.6 5.1C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.3 4.3-4.2 5.7l6.6 5.4C39.9 37 44 31.5 44 24c0-1.3-.1-2.7-.4-3.5z" />
    </svg>
  );
}

export function DesktopSignIn({ onSignedIn }: DesktopSignInProps) {
  const [siteUrl, setSiteUrl] = useState(() => localStorage.getItem(SAVED_SITE_KEY) || 'https://controll.co.za');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAwaitingGoogle, setIsAwaitingGoogle] = useState(false);

  useEffect(() => {
    if (!isDesktopApp()) return undefined;

    let cancelled = false;
    let unlisten: (() => void) | undefined;

    async function handleCallbackUrls(urls: string[]) {
      const callbackUrl = urls.find((url) => url.startsWith('linkflow://auth-callback'));
      if (!callbackUrl || cancelled) return;

      setIsAwaitingGoogle(true);
      setError(null);
      try {
        await completeGoogleSignIn(callbackUrl);
        if (!cancelled) {
          localStorage.setItem(SAVED_SITE_KEY, siteUrl.trim());
          onSignedIn();
        }
      } catch (reason) {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : 'Unable to complete Google sign-in.');
        }
      } finally {
        if (!cancelled) setIsAwaitingGoogle(false);
      }
    }

    void (async () => {
      const { getCurrent, onOpenUrl } = await import('@tauri-apps/plugin-deep-link');
      unlisten = await onOpenUrl(handleCallbackUrls);

      const startupUrls = await getCurrent();
      if (startupUrls) await handleCallbackUrls(startupUrls);
    })().catch((deepLinkError) => {
      logSync('error', 'authentication', 'Failed to set up the Google sign-in deep-link listener.', { error: deepLinkError });
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await signInToCloud(siteUrl.trim(), username.trim(), password);
      localStorage.setItem(SAVED_SITE_KEY, siteUrl.trim());
      setPassword('');
      onSignedIn();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to sign in to LinkFlow.');
    } finally {
      setIsSubmitting(false);
    }
  }

  async function startGoogleSignIn() {
    setError(null);
    try {
      await signInWithGoogle(siteUrl.trim());
      localStorage.setItem(SAVED_SITE_KEY, siteUrl.trim());
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Unable to start Google sign-in.');
    }
  }

  const isBusy = isSubmitting || isAwaitingGoogle;

  return (
    <main className="min-h-screen grid place-items-center bg-slate-950 p-6 text-slate-100">
      <section className="w-full max-w-md rounded-3xl border border-slate-700 bg-slate-900 p-8 shadow-2xl">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid size-11 place-items-center rounded-2xl bg-brand text-white"><LinkIcon size={22} /></div>
          <div><h1 className="text-xl font-bold">LinkFlow</h1><p className="text-sm text-slate-400">Your private cloud workspace</p></div>
        </div>

        <label className="block text-sm font-medium">WordPress site
          <input className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-brand" type="url" value={siteUrl} onChange={(event) => setSiteUrl(event.target.value)} placeholder="https://your-site.com" required />
        </label>

        <button
          type="button"
          onClick={startGoogleSignIn}
          disabled={isBusy}
          className="mt-5 flex w-full items-center justify-center gap-3 rounded-xl border border-slate-600 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-100 disabled:opacity-60"
        >
          <GoogleLogo size={18} />
          {isAwaitingGoogle ? 'Waiting for Google sign-in in your browser…' : 'Continue with Google'}
        </button>

        <div className="my-6 flex items-center gap-3 text-xs font-medium uppercase tracking-wide text-slate-500">
          <span className="h-px flex-1 bg-slate-700" />or sign in with email<span className="h-px flex-1 bg-slate-700" />
        </div>

        <form className="space-y-5" onSubmit={submit}>
          <label className="block text-sm font-medium">Username or email
            <input className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-brand" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required />
          </label>
          <label className="block text-sm font-medium">WordPress password
            <input className="mt-2 w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-brand" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
          </label>
          {error && <p className="rounded-xl border border-red-900 bg-red-950/60 px-3 py-2 text-sm text-red-200">{error}</p>}
          <button className="flex w-full items-center justify-center gap-2 rounded-xl bg-brand px-4 py-3 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-60" disabled={isBusy} type="submit"><KeyRound size={17} />{isSubmitting ? 'Signing in…' : 'Sign in'}</button>
        </form>

        <p className="mt-6 flex gap-2 text-xs leading-5 text-slate-400"><LockKeyhole className="mt-0.5 shrink-0" size={15} />Your password (or Google account) is used only to create a LinkFlow-only device token. The token is saved in Windows Credential Manager and can be revoked from LinkFlow without changing your WordPress password.</p>
      </section>
    </main>
  );
}
