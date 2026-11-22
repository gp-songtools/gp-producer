import { blockLine, type BlockItem } from '../../lib/export/handoff';

/** The scene's lyric lines in the handoff format. Stop tags show dimmed until they've been checked by ear. */
export default function LyricBlock({ items, tagsChecked }: { items: BlockItem[]; tagsChecked: boolean }) {
  if (items.length === 0) return <p className="text-sm italic text-neutral-500">(no lyrics in this scene)</p>;
  return (
    <ul className="space-y-0.5 font-mono text-xs" aria-label="Lyric block">
      {items.map((i, k) => (
        <li key={k} data-kind={i.kind} className={i.kind === 'tag' ? (tagsChecked ? 'text-sky-300' : 'text-neutral-600 line-through decoration-neutral-700') : i.backing ? 'italic text-amber-300' : 'text-neutral-200'}>
          {blockLine(i)}
          {i.kind === 'tag' && !tagsChecked && <span className="ml-2 not-italic text-amber-300/80 no-underline" style={{ textDecoration: 'none' }}>unverified, left out of the text</span>}
          {i.backing && <span className="ml-2 not-italic text-amber-300/90">backing vocal: the on-screen singer shouldn't mouth this</span>}
        </li>
      ))}
    </ul>
  );
}
