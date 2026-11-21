import { fmt } from './ledger/format';
import { imagesForOwner } from './anchorImages';
import { anchorOwner, sceneOwner, type ImageRecord } from '../types/project';
import type { Scene } from '../types/blueprint';

export interface LightboxItem {
  /** Image record id, so the viewer keeps its object URL stable. */
  id: string;
  blob: Blob;
  title: string;
  caption: string;
}

const caption = (img: ImageRecord) => `${img.source === 'uploaded' ? 'Uploaded' : img.model} · ${img.width}×${img.height}`;

/** Current image of every anchor that has one, in gallery order. `index` is the entry for `focusId` (or 0). */
export function anchorLightbox(anchors: { id: string; name: string }[], images: ImageRecord[], focusId?: string) {
  const items: LightboxItem[] = [];
  let index = 0;
  for (const a of anchors) {
    const [img] = imagesForOwner(images, anchorOwner(a.id));
    if (!img) continue;
    if (a.id === focusId) index = items.length;
    items.push({ id: img.id, blob: img.blob, title: a.name, caption: caption(img) });
  }
  return { items, index };
}

/** Current frame of every scene that has one, in scene order. */
export function sceneLightbox(scenes: Scene[], images: ImageRecord[], focusScene?: number) {
  const items: LightboxItem[] = [];
  let index = 0;
  for (const s of [...scenes].sort((a, b) => a.scene - b.scene)) {
    const [img] = imagesForOwner(images, sceneOwner(s.scene));
    if (!img) continue;
    if (s.scene === focusScene) index = items.length;
    items.push({
      id: img.id,
      blob: img.blob,
      title: `Scene ${String(s.scene).padStart(2, '0')}: ${s.section}`,
      caption: `${fmt(s.start_sec)} – ${fmt(s.end_sec)} · ${caption(img)}`,
    });
  }
  return { items, index };
}
