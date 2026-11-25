import { keyframeImagePrompt } from '../prompts/imagePrompts';
import { sceneOwner, sheetOwner, type ImageRecord } from '../types/project';
import { generateImage, type ImageSize, type ReferenceImage } from './api/gemini';
import { imagesForOwner, isStale, KEEP_VERSIONS, type Deps } from './anchorImages';
import * as db from './db';
import { imageDimensions, prepareReference, type PreparedImage } from './image';
import { anchorOwner } from '../types/project';

export interface AnchorLite {
  id: string;
  name: string;
  /** Use the anchor's character sheet, when it has one, as the reference instead of its single image. */
  useSheet?: boolean;
}

export interface SceneRef {
  scene: number;
  keyframe_prompt: string;
  anchor_ids: string[];
}

export interface RefPick {
  anchor: AnchorLite;
  image: ImageRecord;
  /** The image is the anchor's character sheet. */
  viaSheet?: boolean;
}

export interface RefSelection {
  /** Sent as references, in the scene's order. */
  used: RefPick[];
  /** Attached to the scene but with no image yet. */
  missing: AnchorLite[];
  /** Have an image but are over the per-scene cap, so not sent. */
  dropped: AnchorLite[];
  /** Ids the scene mentions that aren't anchors at all. */
  unknown: string[];
}

/** Decides which anchor images go with a scene: its attached anchors, in order, newest image each, up to `maxRefs`. */
export function pickReferences(scene: Pick<SceneRef, 'anchor_ids'>, anchors: AnchorLite[], images: ImageRecord[], maxRefs: number): RefSelection {
  const byId = new Map(anchors.map((a) => [a.id, a]));
  const out: RefSelection = { used: [], missing: [], dropped: [], unknown: [] };
  for (const id of new Set(scene.anchor_ids)) {
    const a = byId.get(id);
    if (!a) {
      out.unknown.push(id);
      continue;
    }
    const [sheet] = a.useSheet ? imagesForOwner(images, sheetOwner(id)) : [];
    const [img] = imagesForOwner(images, anchorOwner(id));
    const pick = sheet ?? img;
    if (!pick) out.missing.push(a);
    else if (out.used.length < maxRefs) out.used.push({ anchor: a, image: pick, ...(sheet ? { viaSheet: true } : {}) });
    else out.dropped.push(a);
  }
  return out;
}

/** True when a generated frame was made with different reference images than the scene would send now. */
export function refsChanged(frame: ImageRecord | undefined, used: RefPick[]): boolean {
  if (!frame || frame.source !== 'generated' || !frame.refImageIds) return false;
  const now = used.map((u) => u.image.id).sort().join('|');
  return frame.refImageIds.slice().sort().join('|') !== now;
}

/** Prepared (downscaled, base64) reference images, by image id: preparing is the slow part and images never change. */
const prepared = new Map<string, Promise<PreparedImage>>();
export const _resetPreparedCacheForTests = () => prepared.clear();

function prepareCached(img: ImageRecord, prepare: (b: Blob) => Promise<PreparedImage>): Promise<PreparedImage> {
  let p = prepared.get(img.id);
  if (!p) {
    p = prepare(img.blob);
    prepared.set(img.id, p);
    p.catch(() => prepared.delete(img.id));
  }
  return p;
}

export interface GenerateFrameOptions extends Deps {
  projectId: string;
  scene: SceneRef;
  refs: RefPick[];
  model: string;
  apiKey: string;
  imageSize?: ImageSize;
  signal?: AbortSignal;
  prepare?: (b: Blob) => Promise<PreparedImage>;
}

/** Renders a scene's storyboard frame from its keyframe prompt and reference anchors. Nothing is saved on failure. */
export async function generateSceneFrame(o: GenerateFrameOptions): Promise<ImageRecord> {
  const generate = o.generate ?? generateImage;
  const dims = o.dims ?? imageDimensions;
  const prepare = o.prepare ?? prepareReference;

  const references: ReferenceImage[] = await Promise.all(
    o.refs.map(async (r) => {
      const p = await prepareCached(r.image, prepare);
      return { label: r.viaSheet ? `${r.anchor.name} (character sheet: front, side, back and face views of the same character)` : r.anchor.name, mimeType: p.mimeType, data: p.data };
    }),
  );
  const img = await generate({
    apiKey: o.apiKey,
    model: o.model,
    prompt: keyframeImagePrompt(o.scene.keyframe_prompt, references.length > 0),
    references,
    aspectRatio: '16:9',
    imageSize: o.imageSize,
    signal: o.signal,
  });
  const { width, height } = await dims(img.blob);
  const owner = sceneOwner(o.scene.scene);
  const rec: ImageRecord = {
    id: crypto.randomUUID(),
    projectId: o.projectId,
    ownerKey: owner,
    kind: 'keyframe',
    blob: img.blob,
    mime: img.mimeType,
    width,
    height,
    model: o.model,
    prompt: o.scene.keyframe_prompt,
    source: 'generated',
    refImageIds: o.refs.map((r) => r.image.id),
    createdAt: Date.now(),
  };
  await db.putImage(rec);
  await db.pruneImages(o.projectId, owner, KEEP_VERSIONS);
  return rec;
}

export type FrameMode = 'missing' | 'outdated';

/** Scenes a batch should render: those with no frame yet, or those whose frame no longer matches the scene. */
export function scenesNeedingFrames(
  scenes: SceneRef[],
  anchors: AnchorLite[],
  images: ImageRecord[],
  maxRefs: number,
  mode: FrameMode,
): SceneRef[] {
  return scenes.filter((s) => {
    const [frame] = imagesForOwner(images, sceneOwner(s.scene));
    if (mode === 'missing') return !frame;
    if (!frame) return false;
    return isStale(frame, s.keyframe_prompt) || refsChanged(frame, pickReferences(s, anchors, images, maxRefs).used);
  });
}
