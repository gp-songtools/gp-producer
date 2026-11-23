import { useEffect, useRef, useState } from 'react';
import { useSceneRevision } from '../../hooks/useSceneRevision';
import { buildFileTag } from '../../lib/ledger/fileTag';
import { fmt, fmtPrecise } from '../../lib/ledger/format';
import { promptsChanged } from '../../lib/revision';
import { useImageStore } from '../../store/imageStore';
import { useProjectStore } from '../../store/projectStore';
import { useSettingsStore } from '../../store/settingsStore';
import type { Scene } from '../../types/blueprint';
import type { StoredAnchor } from '../../types/project';
import DiffText from './DiffText';

const btn = 'rounded border border-neutral-700 px-2.5 py-1 text-xs hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40';

function Locked({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-neutral-800/70 py-1 last:border-0">
      <dt className="text-neutral-500">{label}</dt>
      <dd className="truncate text-right font-mono text-neutral-300">{value}</dd>
    </div>
  );
}

/** Slide-over to revise one scene's prompts with Claude. Timing, length and the file tag are shown read-only. */
export default function ReviseDrawer({ scene, anchors, projectId, onClose }: { scene: Scene; anchors: StoredAnchor[]; projectId: string; onClose: () => void }) {
  const { phase, result, request, error, ask, cancel, clear } = useSceneRevision(scene);
  const hasAnthropic = useSettingsStore((s) => !!s.anthropicKey);
  const hasGemini = useSettingsStore((s) => !!s.geminiKey);
  const [text, setText] = useState('');
  const [rerender, setRerender] = useState(false);
  const [applied, setApplied] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const asking = phase === 'asking';
  const revisions = scene.revisions ?? [];
  const proposal = result?.proposal;
  const changed = proposal ? promptsChanged(scene, proposal) : false;

  useEffect(() => {
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const accept = async () => {
    if (!proposal) return;
    const next = await useProjectStore.getState().acceptRevision(scene.scene, proposal, request);
    clear();
    setText('');
    if (!next) return;
    setApplied('Revision applied. Undo it below if it isn\'t right.');
    if (rerender)
      void useImageStore.getState().generateFrame(projectId, { scene: next.scene, keyframe_prompt: next.keyframe_prompt, anchor_ids: next.anchor_ids }, anchors, 'workhorse');
  };

  const undo = async () => {
    await useProjectStore.getState().undoRevision(scene.scene);
    setApplied('Last revision undone. The storyboard frame was not changed.');
  };

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-black/50 no-print" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panel} tabIndex={-1} role="dialog" aria-modal="true" aria-label={`Revise scene ${scene.scene} with Claude`} className="flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-neutral-800 bg-neutral-950 p-4 outline-none">
        <header className="flex items-start justify-between gap-2">
          <div>
            <h2 className="text-base font-semibold">Revise scene {String(scene.scene).padStart(2, '0')} with Claude</h2>
            <p className="mt-0.5 text-xs text-neutral-400">Claude rewrites the prompts only. You review the changes before anything is applied.</p>
          </div>
          <button type="button" onClick={onClose} className={btn} aria-label="Close revise drawer">Close</button>
        </header>

        <section aria-label="Locked fields" className="mt-3 rounded border border-neutral-800 bg-neutral-900/50 p-2 text-xs">
          <h3 className="mb-1 font-semibold text-neutral-200">🔒 Locked (cannot change)</h3>
          <dl data-locked>
            <Locked label="Section" value={scene.section} />
            <Locked label="Song time" value={`${fmt(scene.start_sec)} – ${fmt(scene.end_sec)}`} />
            <Locked label="Length" value={scene.extension_sec ? `${scene.base_sec}s base + ${scene.extension_sec}s extension = ${scene.duration_sec}s` : `${scene.duration_sec}s base only`} />
            {scene.lip_sync && <Locked label="Vocals" value={`${fmtPrecise(scene.lip_sync.vocal_start_sec)} – ${fmtPrecise(scene.lip_sync.vocal_end_sec)}`} />}
            <Locked label="File tag" value={buildFileTag(scene)} />
          </dl>
        </section>

        <section aria-label="What went wrong" className="mt-3">
          <label htmlFor="revise-request" className="text-sm font-medium text-neutral-200">What went wrong?</label>
          <textarea
            id="revise-request"
            value={text}
            onChange={(e) => setText(e.target.value)}
            disabled={asking}
            rows={4}
            placeholder="e.g. Flow made the singer turn away from camera; the dolly move is too fast for 12s; the kitchen looks nothing like the anchor."
            className="mt-1 w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
          />
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={asking || !hasAnthropic || !text.trim()}
              onClick={() => { setApplied(null); void ask(text); }}
              title={hasAnthropic ? undefined : 'Add an Anthropic API key in Settings'}
              className="rounded border border-accent bg-accent px-3 py-1.5 text-sm font-medium text-accent-fg disabled:cursor-not-allowed disabled:opacity-40"
            >
              {asking ? 'Asking Claude…' : result ? 'Ask again' : 'Ask Claude to revise'}
            </button>
            {asking && <button type="button" onClick={cancel} className={btn}>Cancel</button>}
            {!hasAnthropic && <span className="text-xs text-amber-300">Add an Anthropic key in Settings first.</span>}
          </div>
        </section>

        {error && (
          <div role="alert" className="mt-3 rounded border border-red-700/60 bg-red-950/30 p-2 text-sm text-red-100">
            <p>{error.message}</p>
            {error.problems.length > 0 && <ul className="mt-1 list-disc pl-5 font-mono text-xs text-red-200/80">{error.problems.map((p, i) => <li key={i}>{p}</li>)}</ul>}
          </div>
        )}

        {applied && !proposal && <p role="status" className="mt-3 rounded border border-emerald-700/60 bg-emerald-950/30 p-2 text-sm text-emerald-100">{applied}</p>}

        {proposal && (
          <section aria-label="Proposed revision" className="mt-3 space-y-3 rounded border border-neutral-700 p-3">
            <h3 className="text-sm font-semibold text-neutral-100">Proposed changes</h3>
            {proposal.notes && <p className="text-sm text-neutral-300">{proposal.notes}</p>}
            {!changed && <p className="text-sm text-amber-300">Claude returned the same prompts. Try describing the problem more specifically.</p>}
            <div><h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">Base prompt</h4><DiffText before={scene.base_prompt} after={proposal.base_prompt} /></div>
            {scene.extension_sec ? (
              <div><h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">Extension prompt</h4><DiffText before={scene.extension_prompt ?? ''} after={proposal.extension_prompt ?? scene.extension_prompt ?? ''} /></div>
            ) : null}
            <div><h4 className="mb-1 text-xs font-medium uppercase tracking-wide text-neutral-500">Keyframe prompt</h4><DiffText before={scene.keyframe_prompt} after={proposal.keyframe_prompt} /></div>

            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" checked={rerender} onChange={(e) => setRerender(e.target.checked)} disabled={!hasGemini} className="mt-0.5 h-4 w-4 accent-accent" />
              <span>
                Re-render the storyboard frame after accepting
                <span className="block text-xs text-neutral-500">{hasGemini ? 'Uses the Workhorse model; the current frame stays in the frame history.' : 'Add a Gemini key in Settings to enable.'}</span>
              </span>
            </label>

            <div className="flex gap-2">
              <button type="button" onClick={() => void accept()} disabled={!changed} className="rounded border border-emerald-500 bg-emerald-500 px-3 py-1.5 text-sm font-medium text-black disabled:cursor-not-allowed disabled:opacity-40">Accept revision</button>
              <button type="button" onClick={clear} className={btn}>Discard</button>
            </div>
          </section>
        )}

        {revisions.length > 0 && (
          <section aria-label="Revision history" className="mt-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-neutral-200">Applied revisions ({revisions.length})</h3>
              <button type="button" onClick={() => void undo()} className={btn}>Undo last revision</button>
            </div>
            <ol className="mt-2 space-y-1.5 text-xs text-neutral-400">
              {[...revisions].reverse().map((r) => (
                <li key={r.at} className="rounded border border-neutral-800 p-2">
                  <span className="text-neutral-500">{new Date(r.at).toLocaleString()}</span>
                  <p className="mt-0.5 text-neutral-300">“{r.request}”</p>
                  {r.notes && <p className="mt-0.5">{r.notes}</p>}
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  );
}
