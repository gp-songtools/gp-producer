import { useState } from 'react';
import { buildBundle, HANDOFF_FILENAME, LYRICS_FILENAME } from '../../lib/export/bundle';
import { BACKING_MODE_LABEL, countBacking, TAG_SPELLING_LABEL } from '../../lib/export/lyricsFile';
import * as db from '../../lib/db';
import { downloadBlob, downloadText } from '../../lib/download';
import type { StopTag } from '../../lib/brief';
import { useProjectStore } from '../../store/projectStore';
import type { BackingMode, TagSpelling } from '../../types/project';
import CopyButton from '../ui/CopyButton';

const btn = 'rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40';

/** The three outputs: the lyrics file for the lip-sync notebook, the per-scene handoff, and the zip with everything. */
export default function ExportPanel({ lyricsText, handoffText, tags, withheld, backing, onBacking, spelling, onSpelling }: { lyricsText: string; handoffText: string; tags: StopTag[]; withheld: number; backing: BackingMode; onBacking: (m: BackingMode) => void; spelling: TagSpelling; onSpelling: (s: TagSpelling) => void }) {
  const project = useProjectStore((s) => s.project!);
  const anchors = useProjectStore((s) => s.anchors);
  const scenes = useProjectStore((s) => s.scenes);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const nBacking = countBacking(project.lrcLines);

  const exportZip = async () => {
    setBusy(true);
    setError(null);
    setSummary(null);
    try {
      await useProjectStore.getState().flush();
      const images = await db.latestImages(project.id);
      const b = await buildBundle({ project, anchors, scenes, images, tags, withheld, backing, spelling });
      downloadBlob(b.blob, b.filename);
      const pics = b.files.filter((f) => /\/(anchors|keyframes)\//.test(f)).length;
      setSummary(`Downloaded ${b.filename}: ${b.files.length} files (${pics} image${pics === 1 ? '' : 's'}).`);
    } catch (e) {
      setError(`Couldn't build the zip: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Exports" className="no-print rounded-lg border border-neutral-800 bg-neutral-900/50 p-3">
      <h3 className="text-sm font-semibold">Files for your lip-sync notebook</h3>

      <div className="mt-2">
        <p className="text-sm text-neutral-200">{LYRICS_FILENAME} <span className="text-xs text-neutral-500">whole song, .lrc style: timed lines are singing, bracketed tags are not</span></p>
        <label className="mt-1 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
          Backing vocals ({nBacking} line{nBacking === 1 ? '' : 's'} in your lyrics)
          <select value={backing} onChange={(e) => onBacking(e.target.value as BackingMode)} className="rounded border border-neutral-700 bg-neutral-950 px-1.5 py-1 text-xs text-neutral-200" aria-label="Backing vocals in the lyrics file">
            {(Object.keys(BACKING_MODE_LABEL) as BackingMode[]).map((m) => <option key={m} value={m}>{BACKING_MODE_LABEL[m]}</option>)}
          </select>
        </label>
        <p className="mt-1 text-xs text-neutral-500">The lip-sync step redraws one face per shot, so it can't give a second vocalist their own mouth. Keeping backing lines as sung lines would make the lead mouth them.</p>
        <label className="mt-2 flex flex-wrap items-center gap-2 text-xs text-neutral-400">
          Write narrator and backing no-singing tags as
          <select value={spelling} onChange={(e) => onSpelling(e.target.value as TagSpelling)} className="rounded border border-neutral-700 bg-neutral-950 px-1.5 py-1 text-xs text-neutral-200" aria-label="How narrator and backing tags are written">
            {(Object.keys(TAG_SPELLING_LABEL) as TagSpelling[]).map((m) => <option key={m} value={m}>{TAG_SPELLING_LABEL[m]}</option>)}
          </select>
        </label>
        <p className="mt-1 text-xs text-neutral-500">The app keeps the NARRATOR and BACKING labels on this page and in the handoff sheet. Your own tags such as ECHO are always written as typed.</p>
        {withheld > 0 && <p className="mt-1 text-xs text-amber-300">{withheld} brief tag{withheld === 1 ? ' is' : 's are'} left out until you check them by ear.</p>}
        <div className="mt-2 flex flex-wrap gap-2">
          <CopyButton text={lyricsText} label="Copy lyrics file" />
          <button type="button" disabled={!lyricsText} onClick={() => downloadText(lyricsText, LYRICS_FILENAME)} className={btn}>Download {LYRICS_FILENAME}</button>
        </div>
        <details className="mt-2">
          <summary className="cursor-pointer text-xs text-neutral-400">Preview</summary>
          <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap rounded border border-neutral-800 bg-neutral-950 p-2 font-mono text-xs text-neutral-300" data-lyrics-preview>{lyricsText || '(no lyrics)'}</pre>
        </details>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-neutral-800 pt-3">
        <button type="button" onClick={() => downloadText(handoffText, HANDOFF_FILENAME)} className={btn}>Download {HANDOFF_FILENAME}</button>
        <button type="button" disabled={busy} onClick={() => void exportZip()} className="rounded border border-amber-400 bg-amber-400 px-3 py-1.5 text-sm font-medium text-black disabled:opacity-40">
          {busy ? 'Building zip…' : 'Download export bundle (.zip)'}
        </button>
        <span className="text-xs text-neutral-500">anchors, keyframes, ledger.json, ledger.md and both text files</span>
      </div>
      {summary && <p role="status" className="mt-2 text-xs text-emerald-300">{summary}</p>}
      {error && <p role="alert" className="mt-2 text-xs text-red-300">{error}</p>}
    </section>
  );
}
