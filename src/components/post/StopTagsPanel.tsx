import { useState } from 'react';
import { parseTagInput, type StopTag } from '../../lib/brief';
import { fmtPrecise } from '../../lib/ledger/format';
import { fieldInput } from '../ui/Card';

const btn = 'rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40';

/** Brief tags (drafts until checked by ear) and the user's own tags (always counted as checked). */
export default function StopTagsPanel({
  briefTags,
  manualTags,
  checked,
  hasBrief,
  onCheck,
  onAdd,
  onRemove,
}: {
  briefTags: StopTag[];
  manualTags: StopTag[];
  checked: boolean;
  hasBrief: boolean;
  onCheck: (v: boolean) => void;
  onAdd: (t: StopTag) => void;
  onRemove: (index: number) => void;
}) {
  const [time, setTime] = useState('');
  const [label, setLabel] = useState('INSTRUMENTAL');
  const [error, setError] = useState<string | null>(null);

  const add = () => {
    const r = parseTagInput(time, label);
    if (!r.ok) return setError(r.message);
    setError(null);
    onAdd(r.tag);
    setTime('');
  };

  return (
    <section aria-label="Singing stop tags" className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
      <h3 className="text-sm font-semibold">Singing stop tags</h3>
      <p className="mt-1 text-xs text-neutral-400">
        A timed tag tells the lip-sync step the singing has stopped (INSTRUMENTAL), or that there's an echo and the face shouldn't emote (ECHO).
      </p>

      <h4 className="mt-3 text-xs font-medium uppercase tracking-wide text-neutral-500">From the Gemini brief</h4>
      {briefTags.length === 0 ? (
        <p className="mt-1 text-xs text-neutral-500">{hasBrief ? 'The audio brief has no singing stop tags.' : 'No Gemini audio brief yet.'}</p>
      ) : (
        <>
          <p className="mt-1 text-xs text-neutral-400">Gemini can be a few seconds off, so these are drafts. They stay out of the files until you've listened.</p>
          <ul className="mt-2 flex flex-wrap gap-1.5 font-mono text-xs" data-stop-tags>
            {briefTags.map((t, i) => <li key={i} className="rounded border border-neutral-700 px-1.5 py-0.5 text-neutral-300">[{fmtPrecise(t.t)}] [{t.tag}]</li>)}
          </ul>
          <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" checked={checked} onChange={(e) => onCheck(e.target.checked)} className="h-4 w-4 accent-amber-400" />
            I've checked these by ear
          </label>
        </>
      )}

      <h4 className="mt-4 text-xs font-medium uppercase tracking-wide text-neutral-500">Your own tags</h4>
      <p className="mt-1 text-xs text-neutral-500">Add one where the music carries on with no singing. These count as checked, since you typed them.</p>
      {manualTags.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1.5 font-mono text-xs" data-manual-tags>
          {manualTags.map((t, i) => (
            <li key={`${t.t}-${t.tag}-${i}`} className="flex items-center gap-1 rounded border border-sky-800 px-1.5 py-0.5 text-sky-200">
              [{fmtPrecise(t.t)}] [{t.tag}]
              <button type="button" onClick={() => onRemove(i)} aria-label={`Remove tag at ${fmtPrecise(t.t)}`} className="text-neutral-400 hover:text-red-300">×</button>
            </li>
          ))}
        </ul>
      )}
      <form className="no-print mt-2 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <label className="text-xs text-neutral-400">
          Time
          <input value={time} onChange={(e) => setTime(e.target.value)} placeholder="01:14.00" className={`${fieldInput} mt-0.5 w-28 font-mono`} aria-label="Tag time" />
        </label>
        <label className="text-xs text-neutral-400">
          Tag
          <input value={label} onChange={(e) => setLabel(e.target.value)} list="stop-tag-labels" className={`${fieldInput} mt-0.5 w-40`} aria-label="Tag label" />
          <datalist id="stop-tag-labels"><option value="INSTRUMENTAL" /><option value="ECHO" /></datalist>
        </label>
        <button type="submit" className={btn}>Add tag</button>
      </form>
      {error && <p role="alert" className="mt-1 text-xs text-red-300">{error}</p>}
    </section>
  );
}
