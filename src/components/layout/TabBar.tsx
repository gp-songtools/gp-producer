import { NavLink } from 'react-router-dom';

const TABS = [
  { to: 'setup', label: '0 · Setup' },
  { to: 'blueprint', label: '1 · Blueprint' },
  { to: 'production', label: '2 · Production' },
  { to: 'post', label: '3 · Post' },
];

export default function TabBar() {
  return (
    <nav className="no-print flex gap-1 border-b border-neutral-800 px-4" aria-label="Workspace phases">
      {TABS.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          className={({ isActive }) =>
            `border-b-2 px-3 py-2 text-sm ${isActive ? 'border-amber-400 text-white' : 'border-transparent text-neutral-400 hover:text-neutral-200'}`
          }
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
