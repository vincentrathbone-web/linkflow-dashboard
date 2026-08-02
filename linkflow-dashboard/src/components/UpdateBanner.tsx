import React, { useEffect, useState } from 'react';
import { isDesktopApp } from '../lib/linkflowApi';

type Status = 'idle' | 'available' | 'downloading' | 'error';

export const UpdateBanner: React.FC = () => {
  const [status, setStatus] = useState<Status>('idle');
  const [version, setVersion] = useState<string | null>(null);
  const updateRef = React.useRef<Awaited<ReturnType<typeof import('@tauri-apps/plugin-updater').check>> | null>(null);

  useEffect(() => {
    if (!isDesktopApp()) return;
    let cancelled = false;

    (async () => {
      const { check } = await import('@tauri-apps/plugin-updater');
      try {
        const update = await check();
        if (cancelled || !update) return;
        updateRef.current = update;
        setVersion(update.version);
        setStatus('available');
      } catch {
        // No update endpoint reachable, or none configured yet — stay quiet.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleInstall = async () => {
    if (!updateRef.current) return;
    setStatus('downloading');
    try {
      await updateRef.current.downloadAndInstall();
      const { relaunch } = await import('@tauri-apps/plugin-process');
      await relaunch();
    } catch {
      setStatus('error');
    }
  };

  if (!isDesktopApp() || status === 'idle') return null;

  return (
    <button
      type="button"
      onClick={handleInstall}
      disabled={status === 'downloading'}
      className="fixed top-3 left-1/2 -translate-x-1/2 z-[100] flex items-center gap-2 px-4 py-2 rounded-full bg-emerald-500 text-white text-xs font-semibold shadow-lg hover:bg-emerald-600 transition-colors disabled:cursor-wait disabled:opacity-90"
    >
      <span className="material-symbols-outlined text-sm">
        {status === 'downloading' ? 'downloading' : status === 'error' ? 'error' : 'new_releases'}
      </span>
      {status === 'available' && `Update to v${version} available — click to install`}
      {status === 'downloading' && 'Downloading update…'}
      {status === 'error' && 'Update failed — click to retry'}
    </button>
  );
};
