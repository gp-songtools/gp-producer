import { NavLink } from 'react-router-dom';

const TABS = [
  { to: 'setup', n: '0', label: 'Setup' },
  { to: 'blueprint', n: '1', label: 'Blueprint' },
  { to: 'production', n: '2', label: 'Production' },
  { to: 'post', n: '3', label: 'Post' },
];

export default function TabBar() {
  return (
    <nav className="no-print flex gap-1 overflow-x-auto whitespace-nowrap border-b border-neutral-800 px-2 sm:px-4" aria-label="Workspace phases">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          className={({ isActive }) =>
            `border-b-2 px-2 py-2 text-sm sm:px-3 ${isActive ? 'border-amber-400 text-white' : 'border-transparent text-neutral-400 hover:text-neutral-200'}`
          }
        >
          <span className="hidden sm:inline">{t.n} · </span>
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
