import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { narratorSuggestions, parseStopTags, parseVocalMap, stopTagSignature, usableTags, vocalOverlaps, type StopTag } from '../../lib/brief';
import { downloadText } from '../../lib/download';
import { buildHandoff } from '../../lib/export/handoff';
import { HANDOFF_FILENAME } from '../../lib/export/bundle';
import { buildLyricsFile } from '../../lib/export/lyricsFile';
import { useProjectStore } from '../../store/projectStore';
import CopyButton from '../ui/CopyButton';
import ExportPanel from './ExportPanel';
import LipSyncSceneRow from './LipSyncSceneRow';
import StopTagsPanel from './StopTagsPanel';

/** The lip-sync handoff: LIP-SYNC scenes, stop tags with a "checked by ear" gate, and the files to take to the lip-sync step. */
export default function HandoffView() {
  const project = useProjectStore((s) => s.project!);
  const scenes = useProjectStore((s) => s.scenes);
  const patch = useProjectStore((s) => s.patch);

  const briefTags = useMemo(() => parseStopTags(project.audioBrief), [project.audioBrief]);
  const vocalMap = useMemo(() => parseVocalMap(project.audioBrief), [project.audioBrief]);
  const manualTags = useMemo<StopTag[]>(() => (project.manualTags ?? []).map((m) => ({ ...m, source: 'manual' })), [project.manualTags]);
  const sig = stopTagSignature(briefTags);
  const checked = briefTags.length > 0 && project.stopTagsChecked === sig;
  const withheld = checked ? 0 : briefTags.length;
  const backing = project.backingMode ?? 'tag';
  const spelling = project.tagSpelling ?? 'instrumental';

  const usable = useMemo(() => usableTags(briefTags, manualTags, checked), [briefTags, manualTags, checked]);
  const shown = useMemo(() => [...briefTags, ...manualTags].sort((a, b) => a.t - b.t), [briefTags, manualTags]);
  const lip = useMemo(() => scenes.filter((s) => s.lip_sync).sort((a, b) => a.scene - b.scene), [scenes]);
  const handoffText = useMemo(() => buildHandoff({ projectName: project.name, scenes, lrc: project.lrcLines, tags: usable, withheld }), [project.name, scenes, project.lrcLines, usable, withheld]);
  const lyricsText = useMemo(() => buildLyricsFile(project.lrcLines, usable, backing, spelling), [project.lrcLines, usable, backing, spelling]);

  if (scenes.length === 0)
    return (
      <div className="mx-auto max-w-xl rounded border border-neutral-800 p-6 text-center">
        <p className="text-neutral-300">There is no blueprint yet, so there is nothing to hand off.</p>
        <Link to={`/p/${project.id}/blueprint`} className="mt-3 inline-block rounded bg-accent px-3 py-2 text-sm font-medium text-accent-fg">Go to Blueprint</Link>
      </div>
    );

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold">Lip-sync handoff</h2>
          <p className="mt-0.5 text-sm text-neutral-400">{lip.length} of {scenes.length} scenes are LIP-SYNC. The sheet below tells you which clips (by file tag) and which moments need syncing.</p>
        </div>
        <div className="no-print flex gap-2">
          <CopyButton text={handoffText} label="Copy handoff text" />
        </div>
      </header>

      <StopTagsPanel
        briefTags={briefTags}
        manualTags={manualTags}
        checked={checked}
        hasBrief={!!project.audioBrief.trim()}
        suggestions={narratorSuggestions(vocalMap)}
        onCheck={(v) => patch({ stopTagsChecked: v ? sig : undefined })}
        onAdd={(t) => patch({ manualTags: [...(project.manualTags ?? []), { t: t.t, tag: t.tag, ...(t.endT !== undefined ? { endT: t.endT } : {}) }].sort((a, b) => a.t - b.t) })}
        onRemove={(i) => patch({ manualTags: (project.manualTags ?? []).filter((_, k) => k !== i) })}
      />

      <ExportPanel lyricsText={lyricsText} handoffText={handoffText} tags={usable} withheld={withheld} backing={backing} onBacking={(m) => patch({ backingMode: m })} spelling={spelling} onSpelling={(v) => patch({ tagSpelling: v })} />

      {lip.length === 0 ? (
        <p className="rounded border border-neutral-800 p-6 text-center text-neutral-400">No scene is marked LIP-SYNC. Claude marks close-up singing scenes when it writes the blueprint.</p>
      ) : (
        lip.map((s) => (
          <LipSyncSceneRow key={s.scene} scene={s} projectId={project.id} lrc={project.lrcLines} tags={shown} tagsChecked={checked} overlaps={vocalOverlaps(vocalMap, s.lip_sync!.vocal_start_sec, s.lip_sync!.vocal_end_sec)} />
        ))
      )}

      <details className="rounded border border-neutral-800 p-2">
        <summary className="cursor-pointer text-xs text-neutral-400">Preview {HANDOFF_FILENAME}</summary>
        <pre className="mt-2 max-h-96 overflow-auto whitespace-pre-wrap text-xs text-neutral-300">{handoffText}</pre>
        <button type="button" onClick={() => downloadText(handoffText, HANDOFF_FILENAME)} className="mt-2 rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800">Download {HANDOFF_FILENAME}</button>
      </details>
    </div>
  );
}
