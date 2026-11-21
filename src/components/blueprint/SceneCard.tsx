import { buildFileTag } from '../../lib/ledger/fileTag';
import { fmt, fmtPrecise } from '../../lib/ledger/format';
import { backingLinesInWindow, LIPSYNC_REMINDERS } from '../../lib/ledger/lipsync';
import { isBackingVocal, lyricsInRange } from '../../lib/lrc';
import type { Issue, LrcLine, Scene } from '../../types/blueprint';
import type { StoredAnchor } from '../../types/project';
import CopyButton from '../ui/CopyButton';
import SceneFrame from './SceneFrame';
import { sceneAnchorId } from './SceneTimeline';

const badge = 'rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide';

function PromptBlock({ title, text, note, open }: { title: string; text: string; note?: string; open?: boolean }) {
  return (
    <details open={open} className="rounded border border-neutral-800 bg-neutral-950/60">
      <summary className="flex cursor-pointer items-center justify-between gap-2 px-2 py-1.5 text-xs font-medium text-neutral-300">
        <span>{title}{note && <span className="ml-2 font-normal text-neutral-500">{note}</span>}</span>
        <CopyButton text={text} />
      </summary>
      <p className="whitespace-pre-wrap border-t border-neutral-800 px-2 py-2 text-xs leading-relaxed text-neutral-300">{text || '(empty)'}</p>
    </details>
  );
}

export default function SceneCard({ scene: s, anchors, lrc, issues, projectId, allScenes }: { scene: Scene; anchors: StoredAnchor[]; lrc: LrcLine[]; issues: Issue[]; projectId: string; allScenes: Scene[] }) {
  const lyrics = lyricsInRange(lrc, s.start_sec, s.end_sec);
  const backing = s.lip_sync ? backingLinesInWindow(lrc, s.lip_sync) : [];
  const hasError = issues.some((i) => i.severity === 'error');
  const tag = buildFileTag(s);

  return (
    <article
      id={sceneAnchorId(s.scene)}
      data-scene={s.scene}
      className={`scroll-mt-4 rounded-lg border bg-neutral-900/50 p-4 print:break-inside-avoid ${hasError ? 'border-red-700/70' : 'border-neutral-800'}`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">Scene {String(s.scene).padStart(2, '0')}: {s.section}</h3>
          <p className="mt-0.5 font-mono text-xs text-neutral-400">
            {fmt(s.start_sec)} – {fmt(s.end_sec)} · {s.extension_sec ? `${s.base_sec}s + ${s.extension_sec}s` : `${s.duration_sec}s`}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {s.extension_sec && <span className={`${badge} bg-amber-500/20 text-amber-300`}>Extended</span>}
          {s.lip_sync && <span className={`${badge} bg-sky-500/20 text-sky-300`}>LIP-SYNC</span>}
          {s.needs_review && <span className={`${badge} bg-red-500/20 text-red-300`}>Needs review</span>}
        </div>
      </header>

      <SceneFrame scene={s} anchors={anchors} allScenes={allScenes} projectId={projectId} />

      <div className="mt-3 rounded border border-neutral-800 bg-neutral-950/60 p-2 text-sm">
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
      </div>

      <div className="mt-3 space-y-2">
        <PromptBlock open title={`Google Flow base prompt`} note={`${s.base_sec}s`} text={s.base_prompt} />
        {s.extension_sec ? (
          <>
            <p className="px-1 text-xs text-amber-300/90">Why extended: {s.extension_reason || '(no reason given)'}</p>
            <PromptBlock open title="Extension prompt" note={`+${s.extension_sec}s, extend to ${fmt(s.end_sec)} on the song timeline`} text={s.extension_prompt ?? ''} />
          </>
        ) : null}
        <PromptBlock title="Storyboard keyframe prompt" text={s.keyframe_prompt} />
      </div>

      {s.lip_sync && (
        <div className="mt-3 rounded border border-sky-800/60 bg-sky-950/20 p-2 text-xs text-sky-100">
          <p className="font-medium">
            Vocals {fmtPrecise(s.lip_sync.vocal_start_sec)} – {fmtPrecise(s.lip_sync.vocal_end_sec)}
          </p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sky-200/90">
            {LIPSYNC_REMINDERS.map((r) => <li key={r}>{r}</li>)}
            {s.lip_sync.camera_note && <li>{s.lip_sync.camera_note}</li>}
          </ul>
          {backing.length > 0 && (
            <p className="mt-2 text-amber-300">
              Backing vocal in this window: {backing.map((l) => l.text).join(' ')}. The on-screen singer shouldn't mouth it.
            </p>
          )}
        </div>
      )}

      <footer className="mt-3 flex items-center justify-between gap-2 text-xs">
        <code className="truncate rounded bg-neutral-950 px-1.5 py-1 text-neutral-300">{tag}</code>
        <CopyButton text={tag} label="Copy file tag" />
      </footer>

      {issues.length > 0 && (
        <ul className="mt-2 space-y-0.5 text-xs">
          {issues.map((i, k) => (
            <li key={k} className={i.severity === 'error' ? 'text-red-300' : 'text-amber-300'}>
              <span className="font-mono text-[11px] opacity-70">{i.code}</span> {i.message}
            </li>
          ))}
        </ul>
      )}
    </article>
  );
}
