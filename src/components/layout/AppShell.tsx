import { useEffect } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { isQuotaError } from '../../lib/storageErrors';
import { useStorageStore } from '../../store/storageStore';
import { useUiStore } from '../../store/uiStore';
import LightboxHost from '../ui/LightboxHost';
import ErrorBoundary from './ErrorBoundary';
import SettingsModal from './SettingsModal';
import StorageBanner from './StorageBanner';

export default function AppShell() {
  const settingsOpen = useUiStore((s) => s.settingsOpen);
  const { openSettings, closeSettings } = useUiStore.getState();
  const { pathname } = useLocation();

  // How full is the browser's storage? Re-measured when the page changes.
  useEffect(() => void useStorageStore.getState().refresh(), [pathname]);

  // A save that fails far from any button (a background write) must not vanish: show it in the banner.
  useEffect(() => {
    const onReject = (e: PromiseRejectionEvent) => {
      if (!isQuotaError(e.reason)) return;
      useStorageStore.getState().report(e.reason);
      e.preventDefault();
    };
    window.addEventListener('unhandledrejection', onReject);
    return () => window.removeEventListener('unhandledrejection', onReject);
  }, []);

  // Collapsed <details> print closed, which would hide the keyframe prompts. Open them for the print and put them back.
  useEffect(() => {
    let reopened: HTMLDetailsElement[] = [];
    const before = () => {
      reopened = [...document.querySelectorAll<HTMLDetailsElement>('main details:not([open])')];
      reopened.forEach((d) => (d.open = true));
    };
    const after = () => {
      reopened.forEach((d) => (d.open = false));
      reopened = [];
    };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);
  return (
    <div className="min-h-screen flex flex-col">
      <header className="no-print flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <Link to="/" className="font-semibold tracking-tight">
          <span className="text-amber-400">▶</span> Music Video Director
        </Link>
        <div className="flex items-center gap-2">
          <Link to="/help" className="rounded border border-neutral-700 px-3 py-1 text-sm hover:bg-neutral-900">Help</Link>
          <button
            onClick={openSettings}
            className="rounded border border-neutral-700 px-3 py-1 text-sm hover:bg-neutral-900"
          >
            Settings
          </button>
        </div>
      </header>
      <StorageBanner onOpenSettings={openSettings} />
      <main className="flex-1">
        <ErrorBoundary resetKey={pathname}>
          <Outlet />
        </ErrorBoundary>
      </main>
      <SettingsModal open={settingsOpen} onClose={closeSettings} />
      <LightboxHost />
    </div>
  );
}
