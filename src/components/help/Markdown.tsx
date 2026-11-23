import { Link } from 'react-router-dom';
import type { Block, Inline } from '../../lib/markdown';

/** Where a guide link goes: `#section` stays inside Help, http(s) opens in a new tab, anything else is shown as plain text. */
export function linkTarget(href: string): { kind: 'help'; to: string } | { kind: 'external'; href: string } | null {
  if (href.startsWith('#') && href.length > 1) return { kind: 'help', to: `/help/${href.slice(1)}` };
  if (/^https?:\/\//i.test(href)) return { kind: 'external', href };
  return null;
}

function Inlines({ items }: { items: Inline[] }) {
  return (
    <>
      {items.map((n, i) => {
        switch (n.type) {
          case 'text': return <span key={i}>{n.text}</span>;
          case 'code': return <code key={i} className="rounded bg-neutral-800 px-1 py-0.5 text-[0.85em] text-accent">{n.text}</code>;
          case 'bold': return <strong key={i} className="font-semibold text-neutral-100"><Inlines items={n.children} /></strong>;
          case 'italic': return <em key={i}><Inlines items={n.children} /></em>;
          case 'link': {
            const t = linkTarget(n.href);
            if (!t) return <span key={i}><Inlines items={n.children} /></span>;
            return t.kind === 'help' ? (
              <Link key={i} to={t.to} className="text-accent underline hover:brightness-125"><Inlines items={n.children} /></Link>
            ) : (
              <a key={i} href={t.href} target="_blank" rel="noopener noreferrer" className="text-accent underline hover:brightness-125"><Inlines items={n.children} /></a>
            );
          }
        }
      })}
    </>
  );
}

const HEAD = {
  1: 'mt-2 text-2xl font-semibold',
  2: 'mt-10 border-b border-neutral-800 pb-1 text-xl font-semibold',
  3: 'mt-6 text-base font-semibold text-neutral-100',
  4: 'mt-4 text-sm font-semibold',
} as const;

/** Renders parsed guide blocks. Headings get ids so links and the contents list can scroll to them. */
export default function Markdown({ blocks }: { blocks: Block[] }) {
  return (
    <div className="space-y-3 text-sm leading-relaxed text-neutral-300">
      {blocks.map((b, i) => {
        switch (b.type) {
          case 'heading': {
            const Tag = `h${b.level}` as 'h1' | 'h2' | 'h3' | 'h4';
            return <Tag key={i} id={b.slug} className={`${HEAD[b.level]} scroll-mt-4 text-neutral-50`}><Inlines items={b.inline} /></Tag>;
          }
          case 'paragraph': return <p key={i}><Inlines items={b.inline} /></p>;
          case 'list': {
            const L = b.ordered ? 'ol' : 'ul';
            return (
              <L key={i} className={`${b.ordered ? 'list-decimal' : 'list-disc'} space-y-1.5 pl-6`}>
                {b.items.map((it, k) => <li key={k}><Inlines items={it} /></li>)}
              </L>
            );
          }
          case 'code': return <pre key={i} className="overflow-x-auto rounded border border-neutral-800 bg-neutral-950 p-3 font-mono text-xs text-neutral-200">{b.text}</pre>;
          case 'quote': return <blockquote key={i} className="rounded border-l-4 border-amber-500/60 bg-amber-950/20 px-3 py-2 text-amber-100"><Inlines items={b.inline} /></blockquote>;
          case 'rule': return <hr key={i} className="border-neutral-800" />;
          case 'table':
            return (
              <div key={i} className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-xs">
                  <thead><tr>{b.header.map((h, k) => <th key={k} className="border-b border-neutral-700 px-2 py-1.5 font-semibold text-neutral-200"><Inlines items={h} /></th>)}</tr></thead>
                  <tbody>{b.rows.map((r, k) => <tr key={k} className="border-b border-neutral-800 align-top">{r.map((c, j) => <td key={j} className="px-2 py-1.5"><Inlines items={c} /></td>)}</tr>)}</tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
}
