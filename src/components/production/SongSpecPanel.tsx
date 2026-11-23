import { useMemo, useState } from 'react';
import { useSharedSpec } from '../../hooks/useSharedSpec';
import { buildVideoSequence, saveVideoSequenceToShared, videoSequenceStatus } from '../../lib/songSpec';
import type { Scene } from '../../types/blueprint';

const btn = 'rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent';

/** Writes the clip names and start times to the Song Spec's Video sequence section (this tool's own section). */
export default function SongSpecPanel({ scenes }: { scenes: Scene[] }) {
  const spec = useSharedSpec();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const none = scenes.length === 0;
  const lines = none ? '' : buildVideoSequence(scenes);
  const st = useMemo(() => videoSequenceStatus(spec, scenes), [spec, scenes]);

  const save = () => {
    const r = saveVideoSequenceToShared(scenes, (reason) => window.confirm(`${reason}\n\nReplace it with the video sequence from this project?`));
    setMsg(
      r.status === 'saved' ? { ok: true, text: 'Saved to the song spec. Other GP Song Tools in this browser see it now.' }
      : r.status === 'cancelled' ? { ok: false, text: 'Nothing changed.' }
      : { ok: false, text: 'The browser blocked saving the song spec. Use Download in the Song spec panel above.' },
    );
  };

  const saved = st.state === 'none' ? '' : (() => {
    const t = Date.parse(st.at);
    return Number.isNaN(t) ? '' : `, saved ${new Date(t).toLocaleString()}`;
  })();

  return (
    <section className="mb-4 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3" data-testid="songspec-panel">
      <h2 className="text-sm font-semibold">Video sequence</h2>
      {st.state === 'none' ? (
        <p className="mt-1 text-xs text-neutral-400">Not in the song spec yet.</p>
      ) : st.state === 'current' ? (
        <p className="mt-1 text-xs text-emerald-300">In song spec: {st.count} clips by {st.tool}{saved}. Up to date.</p>
      ) : (
        <p className="mt-1 text-xs text-amber-300">In song spec: {st.count} clips by {st.tool}{saved}. Out of date: your scenes changed.</p>
      )}
      {none && <p className="mt-2 text-xs text-neutral-500">Generate a blueprint first: there are no scenes to save.</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" disabled={none} onClick={save} className={btn}>Save video sequence to song spec</button>
      </div>
      {!none && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-neutral-400">Preview the lines</summary>
          <pre className="mt-2 max-h-40 overflow-auto rounded bg-neutral-950 p-2 font-mono text-xs text-neutral-300">{lines}</pre>
        </details>
      )}
      <p className="mt-2 text-xs text-neutral-500">Use Download in the Song spec panel above to keep a file.</p>
      {msg && <p role="status" className={`mt-2 text-xs ${msg.ok ? 'text-emerald-300' : 'text-amber-300'}`}>{msg.text}</p>}
    </section>
  );
}
