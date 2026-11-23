import { useEffect, useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import LightboxHost from '../ui/LightboxHost';
import SettingsModal from './SettingsModal';

export default function AppShell() {
  const [settingsOpen, setSettingsOpen] = useState(false);

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
          <span className="text-accent">▶</span> GP Producer
        </Link>
        <div className="flex items-center gap-2">
          <Link to="/help" className="rounded border border-neutral-700 px-3 py-1 text-sm hover:bg-neutral-900">Help</Link>
          <button
            onClick={() => setSettingsOpen(true)}
            className="rounded border border-neutral-700 px-3 py-1 text-sm hover:bg-neutral-900"
          >
            Settings
          </button>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="no-print flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-t border-neutral-800 px-4 py-3 text-sm text-neutral-400">
        <a href="https://gp-songtools.github.io/toolsmenu/privacy.html" target="_blank" rel="noopener" className="underline hover:text-neutral-100">Privacy &amp; credits</a>
        <a href="https://gp-songtools.github.io/toolsmenu/" target="_blank" rel="noopener" className="underline hover:text-neutral-100">More GP Song Tools</a>
        <a href="https://github.com/gp-songtools/gp-producer" target="_blank" rel="noopener" className="underline hover:text-neutral-100">Source</a>
      </footer>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <LightboxHost />
    </div>
  );
}
