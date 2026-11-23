import { Link, NavLink, useLocation } from 'react-router-dom';

const TABS = [
  { to: 'setup', n: '0', label: 'Setup' },
  { to: 'blueprint', n: '1', label: 'Blueprint' },
  { to: 'production', n: '2', label: 'Production' },
  { to: 'post', n: '3', label: 'Post' },
];

const HELP_SECTION: Record<string, string> = {
  setup: 'setup-tab',
  blueprint: 'blueprint-tab',
  production: 'production-tab',
  post: 'post-lip-sync-files-and-exports',
};

export default function TabBar() {
  const tab = useLocation().pathname.split('/')[3] ?? 'setup';
  return (
    <nav className="no-print flex gap-1 overflow-x-auto whitespace-nowrap border-b border-neutral-800 px-2 sm:px-4" aria-label="Workspace phases">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          className={({ isActive }) =>
            `border-b-2 px-2 py-2 text-sm sm:px-3 ${isActive ? 'border-accent text-neutral-50' : 'border-transparent text-neutral-400 hover:text-neutral-200'}`
          }
        >
          <span className="hidden sm:inline">{t.n} · </span>
          {t.label}
        </NavLink>
      ))}
      <Link to={`/help/${HELP_SECTION[tab] ?? ''}`} className="ml-auto self-center rounded px-2 py-1 text-xs text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200" title="Open the guide at this tab">
        ? Help for this tab
      </Link>
    </nav>
  );
}
