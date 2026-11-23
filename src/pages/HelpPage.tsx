import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import guideMd from '../../docs/USER_GUIDE.md?raw';
import Markdown from '../components/help/Markdown';
import { parseMarkdown, searchSections, sectionsOf } from '../lib/markdown';

/** The user guide, rendered in the app, with a contents list and search. `/help/:section` scrolls to a heading. */
export default function HelpPage() {
  const { section } = useParams();
  const navigate = useNavigate();
  const blocks = useMemo(() => parseMarkdown(guideMd), []);
  const sections = useMemo(() => sectionsOf(blocks), [blocks]);
  const [query, setQuery] = useState('');
  const hits = useMemo(() => searchSections(sections, query), [sections, query]);
  const known = section ? sections.some((s) => s.slug === section) : true;

  useEffect(() => {
    // No return value: an effect may only return a cleanup function.
    if (!section) window.scrollTo({ top: 0 });
    else document.getElementById(section)?.scrollIntoView({ block: 'start' });
  }, [section]);

  const toc = sections.filter((s) => s.level === 2 || s.level === 3);

  return (
    <div className="mx-auto grid max-w-6xl gap-6 p-4 lg:grid-cols-[16rem_minmax(0,1fr)]">
      <aside className="no-print lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto" aria-label="Help contents">
        <button type="button" onClick={() => navigate(-1)} className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800">← Back</button>
        <label htmlFor="help-search" className="mt-3 block text-xs font-medium text-neutral-400">Search the guide</label>
        <input id="help-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. narrator, 401, backup" className="mt-1 w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1.5 text-sm outline-none focus:border-accent" />
        {query.trim() ? (
          <div className="mt-3" role="region" aria-label="Search results">
            {hits.length === 0 ? <p className="text-xs text-neutral-500">Nothing found. Try fewer or different words.</p> : (
              <ul className="space-y-2">
                {hits.map((h) => (
                  <li key={h.slug}>
                    <Link to={`/help/${h.slug}`} onClick={() => setQuery('')} className="text-sm font-medium text-accent hover:underline">{h.title}</Link>
                    <p className="text-xs text-neutral-500">{h.snippet}</p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <nav className="mt-3" aria-label="Guide sections">
            <ul className="space-y-0.5 text-sm">
              {toc.map((s) => (
                <li key={s.slug} className={s.level === 3 ? 'pl-3' : 'mt-2 font-medium'}>
                  <Link to={`/help/${s.slug}`} className={`block rounded px-1 py-0.5 hover:bg-neutral-800 ${section === s.slug ? 'text-accent' : s.level === 3 ? 'text-neutral-400' : 'text-neutral-200'}`}>{s.title}</Link>
                </li>
              ))}
            </ul>
          </nav>
        )}
      </aside>
      <article className="min-w-0" aria-label="User guide">
        {!known && (
          <p role="alert" className="mb-4 rounded border border-amber-700/50 bg-amber-950/30 p-3 text-sm text-amber-100">
            That section doesn't exist. Use the contents list or search. <Link to="/help" className="underline">Start of the guide</Link>
          </p>
        )}
        <Markdown blocks={blocks} />
      </article>
    </div>
  );
}
