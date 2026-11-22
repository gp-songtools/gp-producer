import { diffWords } from '../../lib/diff';

/** Inline word diff: removed words struck through in red, added words highlighted in green. */
export default function DiffText({ before, after }: { before: string; after: string }) {
  if (before === after) return <p className="whitespace-pre-wrap text-sm text-neutral-400">{after || '(empty)'} <span className="text-xs italic text-neutral-600">(unchanged)</span></p>;
  return (
    <p className="whitespace-pre-wrap text-sm leading-relaxed" data-diff>
      {diffWords(before, after).map((p, i) =>
        p.type === 'same' ? (
          <span key={i} className="text-neutral-300">{p.text}</span>
        ) : p.type === 'add' ? (
          <ins key={i} className="rounded bg-emerald-500/20 text-emerald-200 no-underline">{p.text}</ins>
        ) : (
          <del key={i} className="rounded bg-red-500/20 text-red-300">{p.text}</del>
        ),
      )}
    </p>
  );
}
