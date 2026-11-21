import { useState } from 'react';
import { Link, Outlet } from 'react-router-dom';
import LightboxHost from '../ui/LightboxHost';
import SettingsModal from './SettingsModal';

export default function AppShell() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <div className="min-h-screen flex flex-col">
      <header className="no-print flex items-center justify-between border-b border-neutral-800 px-4 py-3">
        <Link to="/" className="font-semibold tracking-tight">
          <span className="text-amber-400">▶</span> Music Video Director
        </Link>
        <button
          onClick={() => setSettingsOpen(true)}
          className="rounded border border-neutral-700 px-3 py-1 text-sm hover:bg-neutral-900"
        >
          Settings
        </button>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <LightboxHost />
    </div>
  );
}
