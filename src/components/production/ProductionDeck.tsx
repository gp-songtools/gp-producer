import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { buildFileTag } from '../../lib/ledger/fileTag';
import { fmt, fmtPrecise } from '../../lib/ledger/format';
import { backingLinesInWindow, LIPSYNC_REMINDERS } from '../../lib/ledger/lipsync';
import { isBackingVocal, lyricsInRange } from '../../lib/lrc';
import { extensionMarkText, extensionTarget, isDeckKey, neighbours } from '../../lib/production';
import type { LrcLine, Scene } from '../../types/blueprint';
import type { StoredAnchor } from '../../types/project';
import SceneFrame from '../blueprint/SceneFrame';
import CopyButton from '../ui/CopyButton';
import CompletionChecklist from './CompletionChecklist';
import AnchorDownloads from './AnchorDownloads';
import PromptPanel from './PromptPanel';
import ReviseDrawer from './ReviseDrawer';
import SceneStepper from './SceneStepper';

const badge = 'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide';

/** One scene at a time: everything needed to build it in Google Flow, with copy buttons. */
export default function ProductionDeck({ scene: s, scenes, anchors, lrc, projectId }: { scene: Scene; scenes: Scene[]; anchors: StoredAnchor[]; lrc: LrcLine[]; projectId: string }) {
  const navigate = useNavigate();
  const lyrics = lyricsInRange(lrc, s.start_sec, s.end_sec);
  const backing = s.lip_sync ? backingLinesInWindow(lrc, s.lip_sync) : [];
  const tag = buildFileTag(s);
  const target = extensionTarget(s);
  const { prev, next } = neighbours(scenes, s.scene);
  const [revising, setRevising] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (revising || !isDeckKey(e)) return;
      const to = e.key === 'ArrowLeft' ? prev : next;
      if (to !== null) {
        e.preventDefault();
        navigate(`/p/${projectId}/production/${to}`);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next, navigate, projectId, revising]);

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <SceneStepper projectId={projectId} scenes={scenes} current={s.scene} />

      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Scene {String(s.scene).padStart(2, '0')}: {s.section}</h2>
          <p className="mt-0.5 font-mono text-sm text-neutral-400">
            {fmt(s.start_sec)} – {fmt(s.end_sec)} · {s.extension_sec ? `${s.base_sec}s + ${s.extension_sec}s` : `${s.duration_sec}s`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {s.extension_sec && <span className={`${badge} bg-amber-500/20 text-amber-300`}>Extended</span>}
          {s.lip_sync && <span className={`${badge} bg-sky-500/20 text-sky-300`}>LIP-SYNC</span>}
          {s.revisions?.length ? <span className={`${badge} bg-violet-500/20 text-violet-300`}>Revised ×{s.revisions.length}</span> : null}
          {s.needs_review && <span className={`${badge} bg-red-500/20 text-red-300`}>Needs review</span>}
        </div>
      </header>

      <div className="no-print">
        <button type="button" onClick={() => setRevising(true)} className="rounded border border-violet-500/60 px-3 py-1.5 text-sm text-violet-200 hover:bg-violet-500/10">Revise scene with Claude</button>
      </div>
      {revising && <ReviseDrawer scene={s} anchors={anchors} projectId={projectId} onClose={() => setRevising(false)} />}

      <SceneFrame scene={s} anchors={anchors} allScenes={scenes} projectId={projectId} />

      <AnchorDownloads anchorIds={s.anchor_ids} anchors={anchors} />

      <section aria-label="Lyrics" className="rounded border border-neutral-800 bg-neutral-950/60 p-2 text-sm">
        {lyrics.length ? (
          <ul className="space-y-0.5">
            {lyrics.map((l, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-mono text-xs text-neutral-500">{fmtPrecise(l.t)}</span>
                <span className={isBackingVocal(l.text) ? 'italic text-neutral-400' : ''}>{l.text}</span>
              </li>
            ))}
          </ul>
        ) : (
          <span className="italic text-neutral-500">(instrumental)</span>
        )}
      </section>

      <CompletionChecklist scene={s} />

      <PromptPanel id="base-prompt" title="Google Flow base prompt" note={`${s.base_sec}s clip, starts at ${fmt(s.start_sec)}`} text={s.base_prompt} />

      {s.extension_sec && target ? (
        <>
          <p className="px-1 text-xs text-amber-300/90">Why extended: {s.extension_reason || '(no reason given)'}</p>
          <PromptPanel
            id="extension-prompt"
            title="Extension prompt"
            note={`+${s.extension_sec}s: extend from ${target.baseEndLabel} to ${target.targetLabel} on the song timeline`}
            text={s.extension_prompt ?? ''}
            extra={<CopyButton text={extensionMarkText(s)} label="Copy timeline mark" />}
          />
        </>
      ) : (
        <p className="px-1 text-xs text-neutral-500">Base clip only: no extension for this scene.</p>
      )}

      {s.lip_sync && (
        <section aria-label="Lip-sync" className="rounded border border-sky-800/60 bg-sky-950/20 p-2 text-xs text-sky-100">
          <p className="font-medium">Vocals {fmtPrecise(s.lip_sync.vocal_start_sec)} – {fmtPrecise(s.lip_sync.vocal_end_sec)}</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sky-200/90">
            {LIPSYNC_REMINDERS.map((r) => <li key={r}>{r}</li>)}
            {s.lip_sync.camera_note && <li>{s.lip_sync.camera_note}</li>}
          </ul>
          {backing.length > 0 && <p className="mt-2 text-amber-300">Backing vocal in this window: {backing.map((l) => l.text).join(' ')}. The on-screen singer shouldn't mouth it.</p>}
        </section>
      )}

      <section aria-label="File tag" className="flex items-center justify-between gap-2 rounded-lg border border-neutral-800 bg-neutral-900/50 p-3 text-sm">
        <div className="min-w-0">
          <p className="text-xs text-neutral-400">Name the downloaded clip</p>
          <code className="mt-0.5 block truncate text-neutral-100">{tag}</code>
        </div>
        <CopyButton text={tag} label="Copy file tag" />
      </section>
    </div>
  );
}
