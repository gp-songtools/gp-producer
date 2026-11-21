import { anchorImagePrompt } from '../prompts/imagePrompts';
import { anchorOwner, type ImageOwner, type ImageRecord } from '../types/project';
import { generateImage, type ImageSize } from './api/gemini';
import * as db from './db';
import { imageDimensions, type Dimensions } from './image';

/** How many versions of an image are kept per owner (the newest is the one in use). */
export const KEEP_VERSIONS = 3;
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
const UPLOAD_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export class UploadError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UploadError';
  }
}

export interface Deps {
  generate?: typeof generateImage;
  dims?: (b: Blob) => Promise<Dimensions>;
}

export interface GenerateAnchorOptions extends Deps {
  projectId: string;
  anchor: { id: string; prompt: string };
  model: string;
  apiKey: string;
  imageSize?: ImageSize;
  signal?: AbortSignal;
}

/** Renders an anchor's image, stores it as the newest version and trims old ones. Nothing is saved on failure. */
export async function generateAnchorImage(o: GenerateAnchorOptions): Promise<ImageRecord> {
  const generate = o.generate ?? generateImage;
  const dims = o.dims ?? imageDimensions;
  const img = await generate({
    apiKey: o.apiKey,
    model: o.model,
    prompt: anchorImagePrompt(o.anchor.prompt),
    aspectRatio: '16:9',
    imageSize: o.imageSize,
    signal: o.signal,
  });
  const { width, height } = await dims(img.blob);
  const owner = anchorOwner(o.anchor.id);
  const rec: ImageRecord = {
    id: crypto.randomUUID(),
    projectId: o.projectId,
    ownerKey: owner,
    kind: 'anchor',
    blob: img.blob,
    mime: img.mimeType,
    width,
    height,
    model: o.model,
    // The anchor's own text, so a later edit to it can be detected.
    prompt: o.anchor.prompt,
    source: 'generated',
    createdAt: Date.now(),
  };
  await db.putImage(rec);
  await db.pruneImages(o.projectId, owner, KEEP_VERSIONS);
  return rec;
}

export interface UploadOptions {
  projectId: string;
  owner: ImageOwner;
  kind: ImageRecord['kind'];
  file: File;
  dims?: Deps['dims'];
}

/** Stores a user-supplied image as the newest version for its owner. */
export async function saveUploadedImage(o: UploadOptions): Promise<ImageRecord> {
  if (!UPLOAD_TYPES.includes(o.file.type)) throw new UploadError('Use a PNG, JPEG or WebP image.');
  if (o.file.size > MAX_UPLOAD_BYTES) throw new UploadError(`That image is ${(o.file.size / 1048576).toFixed(1)} MB; the limit is ${MAX_UPLOAD_BYTES / 1048576} MB.`);
  const blob = o.file.slice(0, o.file.size, o.file.type); // drop the File wrapper (and its name)
  let size: Dimensions;
  try {
    size = await (o.dims ?? imageDimensions)(blob);
  } catch {
    throw new UploadError("That file couldn't be read as an image.");
  }
  const rec: ImageRecord = {
    id: crypto.randomUUID(),
    projectId: o.projectId,
    ownerKey: o.owner,
    kind: o.kind,
    blob,
    mime: o.file.type,
    width: size.width,
    height: size.height,
    model: null,
    prompt: null,
    source: 'uploaded',
    createdAt: Date.now(),
  };
  await db.putImage(rec);
  await db.pruneImages(o.projectId, o.owner, KEEP_VERSIONS);
  return rec;
}

/** Images for one owner from an in-memory list, newest first. */
export const imagesForOwner = (all: ImageRecord[], owner: ImageOwner): ImageRecord[] =>
  all.filter((r) => r.ownerKey === owner).sort((a, b) => b.createdAt - a.createdAt);

/** True when a generated image was made from different prompt text than the anchor has now. */
export const isStale = (img: ImageRecord | undefined, currentPrompt: string): boolean =>
  !!img && img.source === 'generated' && img.prompt !== null && img.prompt.trim() !== currentPrompt.trim();
