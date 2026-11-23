import { useState } from 'react';
import { KNOWN_TAGS, NARRATOR, parseTagInput, type StopTag } from '../../lib/brief';
import { fmtPrecise } from '../../lib/ledger/format';
import { fieldInput } from '../ui/Card';

const btn = 'rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40';

/** Brief tags (drafts until checked by ear) and the user's own tags (always counted as checked). */
export default function StopTagsPanel({
  briefTags,
  manualTags,
  checked,
  hasBrief,
  suggestions,
  onCheck,
  onAdd,
  onRemove,
}: {
  briefTags: StopTag[];
  manualTags: StopTag[];
  checked: boolean;
  hasBrief: boolean;
  /** SPOKEN stretches from the vocal map, offered as NARRATOR spans. */
  suggestions: { t: number; endT: number }[];
  onCheck: (v: boolean) => void;
  onAdd: (t: StopTag) => void;
  onRemove: (index: number) => void;
}) {
  const [time, setTime] = useState('');
  const [label, setLabel] = useState('INSTRUMENTAL');
  const [endTime, setEndTime] = useState('');
  const [error, setError] = useState<string | null>(null);
  const isNarrator = label.trim().replace(/^\[+|\]+$/g, '').toUpperCase() === NARRATOR;
  const isAdded = (g: { t: number; endT: number }) => manualTags.some((m) => m.tag === NARRATOR && m.t === g.t && m.endT === g.endT);
  const open = suggestions.filter((g) => !isAdded(g));

  const add = () => {
    const r = parseTagInput(time, label, isNarrator ? endTime : '');
    if (!r.ok) return setError(r.message);
    setError(null);
    onAdd(r.tag);
    setTime('');
    setEndTime('');
  };

  return (
    <section aria-label="Singing stop tags" className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
      <h3 className="text-sm font-semibold">Singing stop tags</h3>
      <p className="mt-1 text-xs text-neutral-400">
        A timed tag tells the lip-sync step the singing has stopped (INSTRUMENTAL), that there's an echo and the face shouldn't emote (ECHO), or that an offscreen
        narrator is talking (NARRATOR), so the on-screen face isn't lip-synced to them.
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
            <input type="checkbox" checked={checked} onChange={(e) => onCheck(e.target.checked)} className="h-4 w-4 accent-accent" />
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
              [{fmtPrecise(t.t)}] [{t.tag}]{t.endT !== undefined && <span className="text-sky-300/70"> until {fmtPrecise(t.endT)}</span>}
              <button type="button" onClick={() => onRemove(i)} aria-label={`Remove tag at ${fmtPrecise(t.t)}`} className="text-neutral-400 hover:text-red-300">×</button>
            </li>
          ))}
        </ul>
      )}
      {open.length > 0 && (
        <div className="no-print mt-2" data-narrator-suggestions>
          <p className="text-xs text-neutral-500">Gemini's vocal map marks these stretches as SPOKEN. If the speaker is your offscreen narrator, add them as NARRATOR (on-screen characters talking are not narrator).</p>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {open.map((g) => (
              <button key={`${g.t}-${g.endT}`} type="button" className={btn} onClick={() => onAdd({ t: g.t, tag: NARRATOR, source: 'manual', endT: g.endT })}>
                Add {fmtPrecise(g.t)} – {fmtPrecise(g.endT)} as NARRATOR
              </button>
            ))}
          </div>
        </div>
      )}
      <form className="no-print mt-2 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); add(); }}>
        <label className="text-xs text-neutral-400">
          Time
          <input value={time} onChange={(e) => setTime(e.target.value)} placeholder="01:14.00" className={`${fieldInput} mt-0.5 w-28 font-mono`} aria-label="Tag time" />
        </label>
        <label className="text-xs text-neutral-400">
          Tag
          <input value={label} onChange={(e) => setLabel(e.target.value)} list="stop-tag-labels" className={`${fieldInput} mt-0.5 w-40`} aria-label="Tag label" />
          <datalist id="stop-tag-labels">{KNOWN_TAGS.map((k) => <option key={k} value={k} />)}</datalist>
        </label>
        {isNarrator && (
          <label className="text-xs text-neutral-400">
            Until
            <input value={endTime} onChange={(e) => setEndTime(e.target.value)} placeholder="00:21.00" className={`${fieldInput} mt-0.5 w-28 font-mono`} aria-label="Tag end time" />
          </label>
        )}
        <button type="submit" className={btn}>Add tag</button>
      </form>
      {error && <p role="alert" className="mt-1 text-xs text-red-300">{error}</p>}
    </section>
  );
}
