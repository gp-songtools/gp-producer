import { useBlobUrl, extForMime } from '../../hooks/useBlobUrl';
import { imagesForOwner, isStale } from '../../lib/anchorImages';
import { buildFileTag } from '../../lib/ledger/fileTag';
import { isWidescreen } from '../../lib/image';
import { sceneLightbox } from '../../lib/lightboxItems';
import { pickReferences, refsChanged } from '../../lib/sceneImages';
import type { ModelRoles } from '../../lib/settings';
import { useImageStore } from '../../store/imageStore';
import { useLightboxStore } from '../../store/lightboxStore';
import { useSettingsStore } from '../../store/settingsStore';
import type { Scene } from '../../types/blueprint';
import { sceneOwner, type StoredAnchor } from '../../types/project';
import { useState } from 'react';
import AnchorChip from './AnchorChip';
import ImageHistory from './ImageHistory';

const btn = 'rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40';
const ROLE_LABEL: Record<keyof ModelRoles, string> = { workhorse: 'Workhorse', hero: 'Hero', draft: 'Draft' };

export default function SceneFrame({ scene, anchors, allScenes, projectId }: { scene: Scene; anchors: StoredAnchor[]; allScenes: Scene[]; projectId: string }) {
  const owner = sceneOwner(scene.scene);
  const images = useImageStore((s) => s.images);
  const job = useImageStore((s) => s.jobs[owner]);
  const { generateFrame, promote, removeCurrent, cancelJob, clearJob } = useImageStore.getState();
  const geminiKey = useSettingsStore((s) => s.geminiKey);
  const { models, maxAnchorsPerScene } = useSettingsStore((s) => s.settings);
  const openLightbox = useLightboxStore((s) => s.open);
  const [role, setRole] = useState<keyof ModelRoles>('workhorse');

  const sel = pickReferences(scene, anchors, images, maxAnchorsPerScene);
  const [current, ...older] = imagesForOwner(images, owner);
  const url = useBlobUrl(current?.blob, current?.id);
  const running = job?.status === 'running';
  const stale = isStale(current, scene.keyframe_prompt);
  const outdatedRefs = refsChanged(current, sel.used);
  const canUpgrade = !!current && current.source === 'generated' && current.model !== models.hero && !running && !!geminiKey;
  const state = (id: string): 'used' | 'missing' | 'dropped' | 'unknown' =>
    sel.used.some((u) => u.anchor.id === id) ? 'used' : sel.missing.some((a) => a.id === id) ? 'missing' : sel.dropped.some((a) => a.id === id) ? 'dropped' : 'unknown';
  const run = (r: keyof ModelRoles) => void generateFrame(projectId, { scene: scene.scene, keyframe_prompt: scene.keyframe_prompt, anchor_ids: scene.anchor_ids }, anchors, r);
  const zoom = () => {
    const { items, index } = sceneLightbox(allScenes, images, scene.scene);
    openLightbox(items, index);
  };

  return (
    <section aria-label="Storyboard frame" className="mt-3 max-w-2xl">
      <div className="relative aspect-video overflow-hidden rounded border border-neutral-800 bg-black">
        {url ? (
          <button type="button" onClick={zoom} aria-label={`Enlarge scene ${scene.scene} frame`} className="h-full w-full cursor-zoom-in">
            <img src={url} alt={`Scene ${scene.scene} storyboard frame`} className="h-full w-full object-contain" />
          </button>
        ) : (
          <div className="flex h-full items-center justify-center text-xs text-neutral-600">{running ? '' : 'No storyboard frame yet'}</div>
        )}
        {running && (
          <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/70 text-xs text-neutral-200">
            Generating…
            <button type="button" onClick={() => cancelJob(owner)} className={btn}>Cancel</button>
          </div>
        )}
      </div>

      {current && (
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-neutral-500" data-frame-meta>
          <span>{current.source === 'uploaded' ? 'Uploaded' : current.model}</span>
          <span>{current.width}×{current.height}</span>
          {!isWidescreen(current) && <span className="text-amber-300">not 16:9 ⚠</span>}
          {stale && <span className="text-amber-300" title="The keyframe prompt has changed since this frame was generated">prompt changed ⚠</span>}
          {outdatedRefs && <span className="text-amber-300" title="The anchor images sent as references have changed since this frame was generated">references changed ⚠</span>}
        </p>
      )}

      <div className="mt-2 flex flex-wrap gap-1.5" aria-label="Attached reference anchors">
        {scene.anchor_ids.map((id) => {
          const a = anchors.find((x) => x.id === id);
          const [img] = imagesForOwner(images, `anchor:${id}`);
          return <AnchorChip key={id} name={a?.name ?? id} image={img} state={state(id)} />;
        })}
      </div>
      {sel.missing.length > 0 && (
        <p className="mt-1 text-[11px] text-amber-300/90">No image yet for {sel.missing.map((a) => a.name).join(', ')}: not sent as a reference. Generate the anchors first for better continuity.</p>
      )}
      {sel.dropped.length > 0 && (
        <p className="mt-1 text-[11px] text-neutral-500">Not sent (limit of {maxAnchorsPerScene} per scene, see Settings): {sel.dropped.map((a) => a.name).join(', ')}.</p>
      )}

      <div className="no-print mt-2 flex flex-wrap items-center gap-1.5">
        <select aria-label={`Model for scene ${scene.scene} frame`} value={role} onChange={(e) => setRole(e.target.value as keyof ModelRoles)} disabled={running} title={models[role]} className="rounded border border-neutral-700 bg-neutral-950 px-1.5 py-1 text-xs">
          {(Object.keys(ROLE_LABEL) as (keyof ModelRoles)[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
        </select>
        <button type="button" disabled={running || !geminiKey} title={geminiKey ? models[role] : 'Add a Gemini API key in Settings'} onClick={() => run(role)} className="rounded border border-amber-400 bg-amber-400 px-2 py-1 text-xs font-medium text-black disabled:cursor-not-allowed disabled:opacity-40">
          {current ? 'Regenerate frame' : 'Generate frame'}
        </button>
        {canUpgrade && <button type="button" onClick={() => run('hero')} className={btn} title={`Re-render with ${models.hero}; the current frame stays in history`}>Upgrade to Hero</button>}
        {current && url && <a href={url} download={`${buildFileTag(scene).replace(/\.mp4$/, '')}.${extForMime(current.mime)}`} className={btn}>Download</a>}
        {current && <button type="button" disabled={running} onClick={() => void removeCurrent(projectId, owner)} className={btn}>Remove</button>}
      </div>

      {job?.status === 'error' && (
        <p role="alert" className="mt-2 text-xs text-red-300">{job.message} <button type="button" onClick={() => clearJob(owner)} className="underline">Dismiss</button></p>
      )}
      <ImageHistory older={older} onUse={(id) => void promote(projectId, id)} />
    </section>
  );
}
