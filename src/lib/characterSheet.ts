import { characterSheetPrompt } from '../prompts/imagePrompts';
import { sheetOwner, type ImageRecord } from '../types/project';
import { generateImage, type ImageSize, type ReferenceImage } from './api/gemini';
import { KEEP_VERSIONS, type Deps } from './anchorImages';
import * as db from './db';
import { imageDimensions, prepareReference, type PreparedImage } from './image';

export interface GenerateSheetOptions extends Deps {
  projectId: string;
  anchor: { id: string; name: string };
  /** The anchor's current image: the source of truth for the character. */
  source: ImageRecord;
  model: string;
  apiKey: string;
  /** Name heading and colour swatches on the sheet. Default off. */
  labels?: boolean;
  imageSize?: ImageSize;
  signal?: AbortSignal;
  prepare?: (b: Blob) => Promise<PreparedImage>;
}

/**
 * Renders a multi-view character sheet from the anchor's image and saves it as the newest sheet for that anchor.
 * The anchor's own image is never touched. Nothing is saved on failure.
 */
export async function generateCharacterSheet(o: GenerateSheetOptions): Promise<ImageRecord> {
  const generate = o.generate ?? generateImage;
  const dims = o.dims ?? imageDimensions;
  const prepare = o.prepare ?? prepareReference;

  const p = await prepare(o.source.blob);
  const references: ReferenceImage[] = [{ label: o.anchor.name, mimeType: p.mimeType, data: p.data }];
  const prompt = characterSheetPrompt({ name: o.anchor.name, labels: o.labels });
  const img = await generate({ apiKey: o.apiKey, model: o.model, prompt, references, aspectRatio: '16:9', imageSize: o.imageSize, signal: o.signal });
  const { width, height } = await dims(img.blob);
  const owner = sheetOwner(o.anchor.id);
  const rec: ImageRecord = {
    id: crypto.randomUUID(),
    projectId: o.projectId,
    ownerKey: owner,
    kind: 'sheet',
    blob: img.blob,
    mime: img.mimeType,
    width,
    height,
    model: o.model,
    prompt,
    source: 'generated',
    // the anchor image it was made from, so a later change to that image can be flagged
    refImageIds: [o.source.id],
    createdAt: Date.now(),
  };
  await db.putImage(rec);
  await db.pruneImages(o.projectId, owner, KEEP_VERSIONS);
  return rec;
}

/** True when the anchor's image is no longer the one the sheet was made from. */
export const sheetOutdated = (sheet: ImageRecord | undefined, anchorImage: ImageRecord | undefined): boolean =>
  !!sheet && !!anchorImage && !!sheet.refImageIds && sheet.refImageIds[0] !== anchorImage.id;
