import { useRef, useState } from 'react';
import { SongDrive } from '../../lib/drive';
import { saveProjectToDrive, stopMessage, summaryText, type DriveSaveSummary } from '../../lib/driveSave';
import { CLIP_STATE_TEXT, clipState, matchClipFiles } from '../../lib/clipFiles';
import * as db from '../../lib/db';
import { buildFileTag } from '../../lib/ledger/fileTag';
import { exportProjectArchive } from '../../lib/projectArchive';
import { SongSpec } from '../../lib/songSpec';
import { useClipStore } from '../../store/clipStore';
import { useProjectStore } from '../../store/projectStore';
import type { Scene } from '../../types/blueprint';

const btn = 'rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent';

/** The clip's state for one scene, in plain words (also used on the scene card). */
export function useClipStateText(scene: Scene, projectId: string): string {
  const inMemory = useClipStore((s) => s.files.has(`${projectId}:${scene.scene}`));
  return CLIP_STATE_TEXT[clipState(scene, inMemory)];
}

/** Add the downloaded clips, match them to scenes by file tag, and save clips, images and the project file to Google Drive. */
export default function ClipFilesCard({ scenes, projectId }: { scenes: Scene[]; projectId: string }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const files = useClipStore((s) => s.files);
  const [note, setNote] = useState<{ matched: number; unmatched: string[]; byNumber: string[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState('');
  const [result, setResult] = useState<{ text: string; ok: boolean; sum?: DriveSaveSummary } | null>(null);

  const onPick = async (list: FileList | null) => {
    const picked = Array.from(list ?? []);
    if (inputRef.current) inputRef.current.value = '';
    if (!picked.length) return;
    const { matches, unmatched } = matchClipFiles(scenes, picked);
    const { setClip } = useProjectStore.getState();
    const byNumber: string[] = [];
    await Promise.all(
      matches.map((m) => {
        const f = picked[m.file];
        useClipStore.getState().set(projectId, m.scene, f);
        if (m.how === 'number') byNumber.push(`${f.name} (scene ${m.scene})`);
        // A clip that is already on Drive under another file is a new file now: forget the old Drive link.
        return setClip(m.scene, { name: f.name, size: f.size }, m.how === 'tag' ? ['downloaded', 'tagged'] : ['downloaded']);
      }),
    );
    setNote({ matched: matches.length, unmatched: unmatched.map((i) => picked[i].name), byNumber });
    setResult(null);
  };

  const save = () => {
    const signing = SongDrive.signIn(); // straight from the click, before anything is awaited
    const ctl = new AbortController();
    abortRef.current = ctl;
    setBusy(true);
    setResult(null);
    setProgress('Signing in to Google…');
    void (async () => {
      try {
        await signing;
        await useProjectStore.getState().flush();
        const st = useProjectStore.getState();
        const project = st.project;
        if (!project) return;
        const images = await db.listProjectImages(project.id);
        const sum = await saveProjectToDrive({
          projectName: project.name,
          scenes: st.scenes,
          files: useClipStore.getState().forProject(project.id),
          anchors: st.anchors,
          images,
          archive: async () => (await exportProjectArchive(project.id)).blob,
          drive: SongDrive,
          spec: SongSpec.store,
          specLib: SongSpec,
          confirm: (m) => window.confirm(m),
          prompt: (m, initial) => window.prompt(m, initial),
          onProgress: setProgress,
          onClipSaved: (scene, d) => {
            const cur = useProjectStore.getState().scenes.find((x) => x.scene === scene);
            const f = useClipStore.getState().get(project.id, scene);
            const base = cur?.clip ?? { name: f?.name ?? buildFileTag(cur ?? { scene, section: '', start_sec: 0, end_sec: 0 }), size: f?.size ?? 0 };
            void useProjectStore.getState().setClip(scene, { ...base, ...d }, ['tagged']);
          },
          signal: ctl.signal,
        });
        setResult({ text: summaryText(sum), ok: !sum.stopped && sum.failed.length === 0, sum });
      } catch (e) {
        setResult({ text: stopMessage(e), ok: false });
      } finally {
        setBusy(false);
        setProgress('');
        abortRef.current = null;
      }
    })();
  };

  const inMemory = (n: number) => files.has(`${projectId}:${n}`);

  return (
    <section aria-label="Clip files" className="mb-4 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3" data-testid="clip-files">
      <h2 className="text-sm font-semibold">Clip files</h2>
      <p className="mt-1 text-xs text-neutral-400">
        Add the clips you downloaded from Flow. They are matched to scenes by file tag (or scene number) and ticked off below. The videos stay in this tab until you save them to Google Drive; only their names are remembered.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input ref={inputRef} type="file" multiple accept="video/*,.mp4,.mov,.webm" className="hidden" data-testid="clip-input" onChange={(e) => void onPick(e.target.files)} />
        <button type="button" onClick={() => inputRef.current?.click()} disabled={busy} className={btn}>Add clip files…</button>
        <button type="button" onClick={save} disabled={busy} className={btn}>Save clips to Drive</button>
        {busy && <button type="button" onClick={() => abortRef.current?.abort()} className={btn}>Cancel</button>}
      </div>
      {progress && <p role="status" className="mt-2 break-words text-xs text-neutral-300">{progress}</p>}
      {note && (
        <div role="status" className="mt-2 space-y-1 text-xs text-neutral-300">
          <p>Matched {note.matched} clip{note.matched === 1 ? '' : 's'}.</p>
          {note.byNumber.length > 0 && <p className="text-amber-300">Matched by scene number only: {note.byNumber.join(', ')}. Save clips to Drive renames it to the file tag.</p>}
          {note.unmatched.length > 0 && <p className="break-words text-amber-300">Not matched: {note.unmatched.join(', ')}</p>}
        </div>
      )}
      {result && (
        <div role="status" className={`mt-2 text-xs ${result.ok ? 'text-emerald-300' : 'text-amber-300'}`} data-testid="drive-result">
          <p className="break-words">{result.text}</p>
          {result.sum?.failed.map((f) => <p key={f.name} className="break-words">Failed {f.name}: {f.message}</p>)}
        </div>
      )}
      <ul className="mt-2 space-y-0.5 text-xs" data-testid="clip-list">
        {scenes.map((s) => (
          <li key={s.scene} className="flex flex-wrap items-baseline justify-between gap-x-3">
            <code className="break-all text-neutral-300">{buildFileTag(s)}</code>
            <span className={clipState(s, inMemory(s.scene)) === 'drive' ? 'text-emerald-300' : 'text-neutral-500'}>{CLIP_STATE_TEXT[clipState(s, inMemory(s.scene))]}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
