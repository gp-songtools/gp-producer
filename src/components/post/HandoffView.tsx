import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { parseStopTags, parseVocalMap, stopTagSignature, vocalOverlaps } from '../../lib/brief';
import { buildHandoff } from '../../lib/export/handoff';
import { fmtPrecise } from '../../lib/ledger/format';
import { useProjectStore } from '../../store/projectStore';
import CopyButton from '../ui/CopyButton';
import LipSyncSceneRow from './LipSyncSceneRow';

export const HANDOFF_FILENAME = 'lipsync-handoff.txt';

/** The lip-sync handoff sheet: LIP-SYNC scenes only, with lyric blocks and a "checked by ear" gate for the stop tags. */
export default function HandoffView() {
  const project = useProjectStore((s) => s.project!);
  const scenes = useProjectStore((s) => s.scenes);
  const patch = useProjectStore((s) => s.patch);

  const tags = useMemo(() => parseStopTags(project.audioBrief), [project.audioBrief]);
  const vocalMap = useMemo(() => parseVocalMap(project.audioBrief), [project.audioBrief]);
  const sig = stopTagSignature(tags);
  const checked = tags.length > 0 && project.stopTagsChecked === sig;
  const lip = useMemo(() => scenes.filter((s) => s.lip_sync).sort((a, b) => a.scene - b.scene), [scenes]);
  const text = useMemo(() => buildHandoff({ projectName: project.name, scenes, lrc: project.lrcLines, tags, tagsChecked: checked }), [project.name, scenes, project.lrcLines, tags, checked]);

  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = HANDOFF_FILENAME;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (scenes.length === 0)
    return (
      <div className="mx-auto max-w-xl rounded border border-neutral-800 p-6 text-center">
        <p className="text-neutral-300">There is no blueprint yet, so there is nothing to hand off.</p>
        <Link to={`/p/${project.id}/blueprint`} className="mt-3 inline-block rounded bg-amber-400 px-3 py-2 text-sm font-medium text-black">Go to Blueprint</Link>
      </div>
    );

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Lip-sync handoff</h2>
          <p className="mt-0.5 text-sm text-neutral-400">{lip.length} of {scenes.length} scenes are LIP-SYNC. This is what goes to your lip-sync step, with the file tags to find the clips.</p>
        </div>
        <div className="no-print flex gap-2">
          <CopyButton text={text} label="Copy handoff text" />
          <button type="button" onClick={download} className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800">Download {HANDOFF_FILENAME}</button>
        </div>
      </header>

      <section aria-label="Singing stop tags" className="rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
        <h3 className="text-sm font-semibold">Singing stop tags</h3>
        {tags.length === 0 ? (
          <p className="mt-1 text-xs text-neutral-500">
            {project.audioBrief.trim() ? 'The audio brief has no singing stop tags.' : 'No Gemini audio brief yet.'} They're optional: they only mark where the lead singer stops while the music goes on.{' '}
            <Link to={`/p/${project.id}/setup`} className="underline hover:text-neutral-300">Setup</Link>
          </p>
        ) : (
          <>
            <p className="mt-1 text-xs text-neutral-400">From the Gemini brief. Gemini can be a few seconds off, so these are drafts. They stay out of the handoff text until you've listened.</p>
            <ul className="mt-2 flex flex-wrap gap-1.5 font-mono text-xs" data-stop-tags>
              {tags.map((t, i) => <li key={i} className="rounded border border-neutral-700 px-1.5 py-0.5 text-neutral-300">[{fmtPrecise(t.t)}] [{t.tag}]</li>)}
            </ul>
            <label className="mt-2 flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" checked={checked} onChange={(e) => patch({ stopTagsChecked: e.target.checked ? sig : undefined })} className="h-4 w-4 accent-amber-400" />
              I've checked these by ear
            </label>
          </>
        )}
      </section>

      {lip.length === 0 ? (
        <p className="rounded border border-neutral-800 p-6 text-center text-neutral-400">No scene is marked LIP-SYNC. Claude marks close-up singing scenes when it writes the blueprint.</p>
      ) : (
        lip.map((s) => (
          <LipSyncSceneRow key={s.scene} scene={s} projectId={project.id} lrc={project.lrcLines} tags={tags} tagsChecked={checked} overlaps={vocalOverlaps(vocalMap, s.lip_sync!.vocal_start_sec, s.lip_sync!.vocal_end_sec)} />
        ))
      )}

      <details className="rounded border border-neutral-800 p-2">
        <summary className="cursor-pointer text-xs text-neutral-400">Preview {HANDOFF_FILENAME}</summary>
        <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap text-xs text-neutral-300">{text}</pre>
      </details>
    </div>
  );
}
