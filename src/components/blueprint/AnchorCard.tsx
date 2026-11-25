import { useRef, useState } from 'react';
import { extForMime, useBlobUrl } from '../../hooks/useBlobUrl';
import { anchorLightbox } from '../../lib/lightboxItems';
import { useLightboxStore } from '../../store/lightboxStore';
import ImageHistory from './ImageHistory';
import { imagesForOwner, isStale } from '../../lib/anchorImages';
import { isWidescreen } from '../../lib/image';
import { resolveRole, type ModelRoles } from '../../lib/settings';
import { useImageStore } from '../../store/imageStore';
import { useSettingsStore } from '../../store/settingsStore';
import { anchorOwner, sheetOwner, type ImageRecord, type StoredAnchor } from '../../types/project';
import { sheetOutdated } from '../../lib/characterSheet';
import { useProjectStore } from '../../store/projectStore';
import CopyButton from '../ui/CopyButton';
import ImageError from './ImageError';

const btn = 'rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40';
const ROLE_LABEL: Record<keyof ModelRoles, string> = { workhorse: 'Workhorse', hero: 'Hero', draft: 'Draft' };

/** One image in a 16:9 frame with its spinner overlay; click to enlarge. */
function Figure({ url, alt, enlargeLabel, onZoom, running, onCancel, empty }: { url: string | null; alt: string; enlargeLabel: string; onZoom: () => void; running: boolean; onCancel: () => void; empty: string }) {
  return (
    <div className="relative aspect-video overflow-hidden rounded border border-neutral-800 bg-black">
      {url ? (
        <button type="button" aria-label={enlargeLabel} className="h-full w-full cursor-zoom-in" onClick={onZoom}>
          <img src={url} alt={alt} className="h-full w-full object-contain" />
        </button>
      ) : (
        <div className="flex h-full items-center justify-center text-xs text-neutral-600">{running ? '' : empty}</div>
      )}
      {running && (
        <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 text-xs text-neutral-200">
          Generating…
          <button type="button" onClick={onCancel} className={btn}>Cancel</button>
        </div>
      )}
    </div>
  );
}

const meta = (img: ImageRecord) => (img.source === 'uploaded' ? 'Uploaded' : img.model);

export default function AnchorCard({ anchor, projectId, siblings }: { anchor: StoredAnchor; projectId: string; siblings: StoredAnchor[] }) {
  const owner = anchorOwner(anchor.id);
  const all = useImageStore((s) => s.images);
  const job = useImageStore((s) => s.jobs[owner]);
  const { generateAnchor, uploadAnchor, promote, removeCurrent, cancelJob, clearJob } = useImageStore.getState();
  const geminiKey = useSettingsStore((s) => s.geminiKey);
  const models = useSettingsStore((s) => s.settings.models);
  const draftMode = useSettingsStore((s) => s.settings.draftMode);
  const [role, setRole] = useState<keyof ModelRoles>('workhorse');
  const fileRef = useRef<HTMLInputElement>(null);
  const openLightbox = useLightboxStore((s) => s.open);

  const [current, ...older] = imagesForOwner(all, owner);
  const url = useBlobUrl(current?.blob, current?.id);
  const running = job?.status === 'running';
  const stale = isStale(current, anchor.prompt);
  const canUpgrade = !!current && current.source === 'generated' && current.model !== models.hero && !running && !!geminiKey;
  const effective = models[resolveRole(role, draftMode)];
  const run = (r: keyof ModelRoles) => void generateAnchor(projectId, { id: anchor.id, prompt: anchor.prompt }, r);

  // Character sheet (character anchors only): kept beside the anchor image, never replacing it.
  const isCharacter = anchor.category === 'character';
  const sOwner = sheetOwner(anchor.id);
  const [sheet, ...olderSheets] = imagesForOwner(all, sOwner);
  const sheetUrl = useBlobUrl(sheet?.blob, sheet?.id);
  const sheetJob = useImageStore((s) => s.jobs[sOwner]);
  const sheetRunning = sheetJob?.status === 'running';
  const outdated = sheetOutdated(sheet, current);
  const [sheetRole, setSheetRole] = useState<keyof ModelRoles>('workhorse');
  const [labels, setLabels] = useState(false);
  const { generateSheet } = useImageStore.getState();
  const sheetModel = models[resolveRole(sheetRole, draftMode)];
  const makeSheet = () => void generateSheet(projectId, { id: anchor.id, name: anchor.name }, sheetRole, labels);
  const zoomSheet = () => sheet && openLightbox([{ id: sheet.id, blob: sheet.blob, title: `${anchor.name}: character sheet`, caption: `${meta(sheet)} · ${sheet.width}×${sheet.height}` }], 0);
  const zoomAnchor = () => {
    const { items, index } = anchorLightbox(siblings, all, anchor.id);
    openLightbox(items, index);
  };

  return (
    <article data-anchor={anchor.id} className={`rounded border border-neutral-800 bg-neutral-950/60 p-3 ${sheet ? 'md:col-span-2' : ''}`}>
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-medium">{anchor.name}</h4>
        <CopyButton text={anchor.prompt} label="Copy prompt" />
      </div>

      <div className={`mt-2 grid gap-3 ${sheet || sheetRunning ? 'sm:grid-cols-2' : ''}`} data-compare={sheet ? '' : undefined}>
        <figure>
          <Figure url={url} alt={`${anchor.name} reference`} enlargeLabel={`Enlarge ${anchor.name}`} onZoom={zoomAnchor} running={running} onCancel={() => cancelJob(owner)} empty="No image yet" />
          {(sheet || sheetRunning) && (
            <figcaption className="mt-1 flex items-center justify-between gap-2 text-[11px] text-neutral-400">
              <span>Anchor image</span>
              {current && url && <a href={url} download={`${anchor.id}.${extForMime(current.mime)}`} className={btn}>Download anchor</a>}
            </figcaption>
          )}
        </figure>
        {(sheet || sheetRunning) && (
          <figure data-sheet>
            <Figure url={sheetUrl} alt={`${anchor.name} character sheet`} enlargeLabel={`Enlarge ${anchor.name} character sheet`} onZoom={zoomSheet} running={sheetRunning} onCancel={() => cancelJob(sOwner)} empty="" />
            <figcaption className="mt-1 flex items-center justify-between gap-2 text-[11px] text-neutral-400">
              <span>Character sheet{sheet ? ` · ${meta(sheet)} · ${sheet.width}×${sheet.height}` : ''}{outdated && <span className="ml-2 text-amber-300" title="The anchor image has changed since this sheet was made">anchor changed ⚠</span>}</span>
              {sheet && sheetUrl && <a href={sheetUrl} download={`${anchor.id}_sheet.${extForMime(sheet.mime)}`} className={btn}>Download sheet</a>}
            </figcaption>
          </figure>
        )}
      </div>

      {current && (
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-neutral-500">
          <span>{current.source === 'uploaded' ? 'Uploaded' : current.model}</span>
          <span>{current.width}×{current.height}</span>
          {!isWidescreen(current) && <span className="text-amber-300">not 16:9 ⚠</span>}
          {stale && <span className="text-amber-300" title="The anchor's prompt has changed since this image was generated">prompt changed ⚠</span>}
        </p>
      )}

      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <select
          aria-label={`Model for ${anchor.name}`}
          value={role}
          onChange={(e) => setRole(e.target.value as keyof ModelRoles)}
          disabled={running}
          title={effective}
          className="rounded border border-neutral-700 bg-neutral-950 px-1.5 py-1 text-xs"
        >
          {(Object.keys(ROLE_LABEL) as (keyof ModelRoles)[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}{r === 'workhorse' && draftMode ? ' → Draft' : ''}</option>)}
        </select>
        <button
          type="button"
          disabled={running || !geminiKey}
          title={geminiKey ? effective : 'Add a Gemini API key in Settings'}
          onClick={() => run(role)}
          className="rounded border border-amber-400 bg-amber-400 px-2 py-1 text-xs font-medium text-black disabled:cursor-not-allowed disabled:opacity-40"
        >
          {current ? 'Regenerate' : 'Generate'}
        </button>
        {canUpgrade && <button type="button" onClick={() => run('hero')} className={btn} title={`Re-render with ${models.hero}; the current image stays in history`}>Upgrade to Hero</button>}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          hidden
          aria-label={`Upload image for ${anchor.name}`}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void uploadAnchor(projectId, anchor.id, f);
            e.target.value = '';
          }}
        />
        <button type="button" disabled={running} onClick={() => fileRef.current?.click()} className={btn}>Upload</button>
        {current && url && !sheet && !sheetRunning && (
          <a href={url} download={`${anchor.id}.${extForMime(current.mime)}`} className={btn}>Download</a>
        )}
        {current && <button type="button" disabled={running} onClick={() => void removeCurrent(projectId, owner)} className={btn} title={older.length ? 'Remove this image and go back to the previous one' : 'Remove this image'}>Remove</button>}
      </div>

      {job?.status === 'error' && <ImageError job={job} onRetry={() => run(role)} onDismiss={() => clearJob(owner)} />}

      <ImageHistory older={older} onUse={(id) => void promote(projectId, id)} />

      {isCharacter && current && (
        <section aria-label={`Character sheet for ${anchor.name}`} className="mt-3 rounded border border-neutral-800 p-2">
          <h5 className="text-xs font-semibold text-neutral-200">Character sheet</h5>
          <p className="mt-0.5 text-[11px] text-neutral-500">
            Front, side, back and face views of this character, made from the anchor image, so Flow and the storyboard frames have every angle. Costs one image. The anchor image is kept as it is.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <select aria-label={`Model for ${anchor.name} character sheet`} value={sheetRole} onChange={(e) => setSheetRole(e.target.value as keyof ModelRoles)} disabled={sheetRunning} title={sheetModel} className="rounded border border-neutral-700 bg-neutral-950 px-1.5 py-1 text-xs">
              {(Object.keys(ROLE_LABEL) as (keyof ModelRoles)[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}{r === 'workhorse' && draftMode ? ' → Draft' : ''}</option>)}
            </select>
            <button type="button" disabled={sheetRunning || running || !geminiKey} title={geminiKey ? sheetModel : 'Add a Gemini API key in Settings'} onClick={makeSheet} className="rounded border border-amber-400 bg-amber-400 px-2 py-1 text-xs font-medium text-black disabled:cursor-not-allowed disabled:opacity-40">
              {sheet ? 'Regenerate character sheet' : 'Make character sheet'}
            </button>
            <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-neutral-400" title="Text on a reference can end up in your clips, so this is off by default">
              <input type="checkbox" checked={labels} onChange={(e) => setLabels(e.target.checked)} disabled={sheetRunning} />
              Add name and colour swatches
            </label>
            {sheet && <button type="button" disabled={sheetRunning} onClick={() => void useImageStore.getState().removeCurrent(projectId, sOwner)} className={btn}>Remove sheet</button>}
          </div>
          {sheet && (
            <label className="mt-2 flex cursor-pointer items-start gap-2 text-xs text-neutral-300">
              <input type="checkbox" className="mt-0.5" checked={!!anchor.useSheet} onChange={(e) => void useProjectStore.getState().setAnchorUseSheet(anchor.id, e.target.checked)} />
              <span>
                Use the character sheet as this character's reference in storyboard frames
                <span className="block text-[11px] text-neutral-500">Off: frames use the anchor image. Frames made earlier will show "references changed".</span>
              </span>
            </label>
          )}
          {sheetJob?.status === 'error' && <ImageError job={sheetJob} onRetry={makeSheet} onDismiss={() => useImageStore.getState().clearJob(sOwner)} />}
          <ImageHistory older={olderSheets} onUse={(id) => void promote(projectId, id)} />
        </section>
      )}

      <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-neutral-300">{anchor.prompt}</p>
    </article>
  );
}
