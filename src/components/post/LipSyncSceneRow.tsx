import { Link } from 'react-router-dom';
import { segmentLabel, type VocalOverlap } from '../../lib/brief';
import { lyricBlock } from '../../lib/export/handoff';
import { buildFileTag } from '../../lib/ledger/fileTag';
import { fmt, fmtPrecise } from '../../lib/ledger/format';
import { backingLinesInWindow, LIPSYNC_REMINDERS } from '../../lib/ledger/lipsync';
import type { LrcLine, Scene } from '../../types/blueprint';
import type { StopTag } from '../../lib/brief';
import CopyButton from '../ui/CopyButton';
import LyricBlock from './LyricBlock';

export default function LipSyncSceneRow({ scene: s, projectId, lrc, tags, tagsChecked, overlaps }: { scene: Scene; projectId: string; lrc: LrcLine[]; tags: StopTag[]; tagsChecked: boolean; overlaps: VocalOverlap[] }) {
  const ls = s.lip_sync!;
  const tag = buildFileTag(s);
  const backing = backingLinesInWindow(lrc, ls);
  const risky = overlaps.filter((o) => o.risky);

  return (
    <article data-scene={s.scene} className="rounded-lg border border-sky-900/60 bg-neutral-900/50 p-4 print:break-inside-avoid">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-base font-semibold">
            Scene {String(s.scene).padStart(2, '0')}: {s.section}{' '}
            <Link to={`/p/${projectId}/production/${s.scene}`} className="no-print ml-1 text-xs font-normal text-neutral-400 underline hover:text-neutral-200">open in deck</Link>
          </h3>
          <p className="mt-0.5 font-mono text-xs text-neutral-400">
            Scene {fmt(s.start_sec)} – {fmt(s.end_sec)} · Vocals {fmtPrecise(ls.vocal_start_sec)} – {fmtPrecise(ls.vocal_end_sec)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <code className="rounded bg-neutral-950 px-1.5 py-1 text-xs text-neutral-200">{tag}</code>
          <CopyButton text={tag} label="Copy file tag" />
        </div>
      </header>

      <div className="mt-3 rounded border border-neutral-800 bg-neutral-950/60 p-2">
        <LyricBlock items={lyricBlock(lrc, tags, s.start_sec, s.end_sec)} tagsChecked={tagsChecked} />
      </div>

      {backing.length > 0 && (
        <p className="mt-2 text-xs text-amber-300">Backing vocal in this window: {backing.map((l) => l.text).join(' ')}. The on-screen singer shouldn't mouth it.</p>
      )}
      {overlaps.length > 0 && (
        <p className="mt-2 text-xs text-neutral-400" data-vocal-map>
          Gemini's vocal map here: {overlaps.map((o) => segmentLabel(o.segment)).join(' · ')}
        </p>
      )}
      {risky.length > 0 && (
        <p role="note" className="mt-1 text-xs text-amber-300">
          Heads-up: the vocal map marks part of this window as {[...new Set(risky.map((o) => o.segment.type))].join(' / ')}, where the lead may not be singing. Check it by ear.
        </p>
      )}

      <ul className="mt-3 list-disc space-y-0.5 pl-4 text-xs text-sky-200/90">
        {LIPSYNC_REMINDERS.map((r) => <li key={r}>{r}</li>)}
        {ls.camera_note && <li>{ls.camera_note}</li>}
      </ul>
    </article>
  );
}
