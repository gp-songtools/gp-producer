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
import { anchorOwner, type StoredAnchor } from '../../types/project';
import CopyButton from '../ui/CopyButton';
import ImageError from './ImageError';

const btn = 'rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40';
const ROLE_LABEL: Record<keyof ModelRoles, string> = { workhorse: 'Workhorse', hero: 'Hero', draft: 'Draft' };

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

  return (
    <article data-anchor={anchor.id} className="rounded border border-neutral-800 bg-neutral-950/60 p-3">
      <div className="flex items-start justify-between gap-2">
        <h4 className="font-medium">{anchor.name}</h4>
        <CopyButton text={anchor.prompt} label="Copy prompt" />
      </div>

      <div className="relative mt-2 aspect-video overflow-hidden rounded border border-neutral-800 bg-black">
        {url ? (
          <button
            type="button"
            aria-label={`Enlarge ${anchor.name}`}
            className="h-full w-full cursor-zoom-in"
            onClick={() => {
              const { items, index } = anchorLightbox(siblings, all, anchor.id);
              openLightbox(items, index);
            }}
          >
            <img src={url} alt={`${anchor.name} reference`} className="h-full w-full object-contain" />
          </button>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-neutral-600">{running ? '' : 'No image yet'}</div>
        )}
        {running && (
          <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 text-xs text-neutral-200">
            Generating…
            <button type="button" onClick={() => cancelJob(owner)} className={btn}>Cancel</button>
          </div>
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
        {current && url && (
          <a href={url} download={`${anchor.id}.${extForMime(current.mime)}`} className={btn}>Download</a>
        )}
        {current && <button type="button" disabled={running} onClick={() => void removeCurrent(projectId, owner)} className={btn} title={older.length ? 'Remove this image and go back to the previous one' : 'Remove this image'}>Remove</button>}
      </div>

      {job?.status === 'error' && <ImageError job={job} onRetry={() => run(role)} onDismiss={() => clearJob(owner)} />}

      <ImageHistory older={older} onUse={(id) => void promote(projectId, id)} />

      <p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-neutral-300">{anchor.prompt}</p>
    </article>
  );
}
