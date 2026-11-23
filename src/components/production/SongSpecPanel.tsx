import { useEffect, useState } from 'react';
import { SongSpec, buildVideoSequence, getOpenedSpec, loadShared, saveVideoSequenceToShared, videoSequenceDownload } from '../../lib/songSpec';
import type { Scene } from '../../types/blueprint';

const btn = 'rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent';

/** Writes the clip names and start times to the Song Spec's Video sequence section (this tool's own section). */
export default function SongSpecPanel({ scenes }: { scenes: Scene[] }) {
  const [hasShared, setHasShared] = useState(() => !!loadShared());
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => SongSpec.store.onChange((t) => setHasShared(!!t)), []);

  const none = scenes.length === 0;
  const lines = none ? '' : buildVideoSequence(scenes);

  const update = () => {
    const r = saveVideoSequenceToShared(scenes, (reason) => window.confirm(`${reason}\n\nReplace it with the video sequence from this project?`));
    setMsg(
      r.status === 'saved' ? { ok: true, text: 'Updated the shared Song Spec. Other GP Song Tools in this browser see it now.' }
      : r.status === 'cancelled' ? { ok: false, text: 'Nothing changed.' }
      : r.status === 'no-shared' ? { ok: false, text: 'There is no shared Song Spec in this browser yet.' }
      : { ok: false, text: 'The browser blocked saving the shared Song Spec. Use Download instead.' },
    );
  };

  const download = () => {
    const d = videoSequenceDownload(scenes, getOpenedSpec());
    if (d.confirm && !window.confirm(`${d.confirm}\n\nReplace it with the video sequence from this project?`)) return setMsg({ ok: false, text: 'Nothing changed.' });
    SongSpec.download(d.text, d.name);
    setMsg({ ok: true, text: `Downloaded ${d.name}.` });
  };

  return (
    <details className="mb-4 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3" data-testid="songspec-panel">
      <summary className="cursor-pointer text-sm font-semibold">Save video sequence to Song Spec</summary>
      <p className="mt-2 text-xs text-neutral-400">
        Writes one line per scene (start time and clip name) to the Video sequence section of the Song Spec. Nothing else in the spec is changed.
      </p>
      {none ? (
        <p className="mt-2 text-xs text-neutral-500">Generate a blueprint first: there are no scenes to save.</p>
      ) : (
        <pre className="mt-2 max-h-40 overflow-auto rounded bg-neutral-950 p-2 font-mono text-xs text-neutral-300">{lines}</pre>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" disabled={none || !hasShared} onClick={update} className={btn} title={hasShared ? undefined : 'No shared Song Spec in this browser. Use Download instead.'}>
          Update shared Song Spec
        </button>
        <button type="button" disabled={none} onClick={download} className={btn}>Download .songspec.md</button>
      </div>
      {msg && <p role="status" className={`mt-2 text-xs ${msg.ok ? 'text-emerald-300' : 'text-amber-300'}`}>{msg.text}</p>}
    </details>
  );
}
