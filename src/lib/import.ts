import JSZip from 'jszip';
import { extForMime } from '../hooks/useBlobUrl';
import { archiveSchema, type Archive } from '../schemas/archive';
import type { ImageRecord, Project, RunRecord } from '../types/project';
import * as db from './db';
import { isQuotaError } from './storageErrors';
import { parseLrc } from './lrc';

/** Why a file couldn't be imported. The message is meant to be shown to the user as is. */
export class ImportError extends Error {
  constructor(message: string, readonly problems: string[] = []) {
    super(message);
    this.name = 'ImportError';
  }
}

export const MAX_ARCHIVE_ENTRIES = 3000;
export const MAX_IMAGE_BYTES = 30 * 1024 * 1024;
export const MAX_TOTAL_IMAGE_BYTES = 600 * 1024 * 1024;
export const MAX_PROJECT_JSON_BYTES = 40 * 1024 * 1024;

/** The real type of an image from its first bytes, so a file can't claim to be a PNG and be something else. */
export function sniffImageMime(b: Uint8Array): 'image/png' | 'image/jpeg' | 'image/webp' | null {
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b.length >= 12 && String.fromCharCode(...b.subarray(0, 4)) === 'RIFF' && String.fromCharCode(...b.subarray(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

/** Declared uncompressed size, when the zip library exposes it, so a zip bomb is refused before it is inflated. */
const declaredSize = (f: JSZip.JSZipObject): number | undefined => (f as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize;

async function readLimited(f: JSZip.JSZipObject, limit: number, what: string): Promise<Uint8Array> {
  const size = declaredSize(f);
  if (size !== undefined && size > limit) throw new ImportError(`${what} is too large (${(size / 1048576).toFixed(0)} MB; the limit is ${limit / 1048576} MB).`);
  const bytes = await f.async('uint8array');
  if (bytes.length > limit) throw new ImportError(`${what} is too large (the limit is ${limit / 1048576} MB).`);
  return bytes;
}

/**
 * Restores a project from a full-project archive as a NEW project (new ids; nothing existing is touched). Checks the file
 * before writing anything, and removes the half-made project if a write fails.
 */
export async function importProjectArchive(file: Blob): Promise<Project> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch {
    throw new ImportError("That file isn't a zip archive.");
  }
  const entries = Object.values(zip.files).filter((f) => !f.dir);
  if (entries.length > MAX_ARCHIVE_ENTRIES) throw new ImportError(`That archive has too many files (${entries.length}).`);

  const metaFile = entries.find((f) => /^(?:[^/]+\/)?project\.json$/.test(f.name));
  if (!metaFile) throw new ImportError("That zip isn't a project file from this app (no project.json). The export bundle can't be imported; use \"Export project\" instead.");
  const prefix = metaFile.name.slice(0, metaFile.name.length - 'project.json'.length);

  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(await readLimited(metaFile, MAX_PROJECT_JSON_BYTES, 'project.json')));
  } catch (e) {
    if (e instanceof ImportError) throw e;
    throw new ImportError('project.json is not valid JSON.');
  }
  const parsed = archiveSchema.safeParse(raw);
  if (!parsed.success) {
    const problems = parsed.error.issues.slice(0, 8).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
    const format = (raw as { format?: unknown } | null)?.format;
    throw new ImportError(format === 'gp-producer-project' ? 'This project file is damaged or from a newer version of the app.' : "That isn't a project file from this app.", problems);
  }
  const a: Archive = parsed.data;

  // Read and verify every image before writing anything.
  const blobs = new Map<string, Blob>();
  let total = 0;
  for (const im of a.images) {
    const f = zip.file(`${prefix}images/${im.id}.${extForMime(im.mime)}`);
    if (!f) throw new ImportError(`An image listed in the project is missing from the zip (${im.id}).`);
    const bytes = await readLimited(f, MAX_IMAGE_BYTES, `Image ${im.id}`);
    total += bytes.length;
    if (total > MAX_TOTAL_IMAGE_BYTES) throw new ImportError(`The images add up to more than ${MAX_TOTAL_IMAGE_BYTES / 1048576} MB.`);
    const real = sniffImageMime(bytes);
    if (real !== im.mime) throw new ImportError(`Image ${im.id} isn't really a ${im.mime.replace('image/', '').toUpperCase()}.`);
    blobs.set(im.id, new Blob([bytes as BlobPart], { type: im.mime }));
  }

  const now = Date.now();
  const id = crypto.randomUUID();
  const project: Project = {
    id,
    name: `${a.project.name} (imported)`,
    createdAt: now,
    updatedAt: now,
    runtimeSec: a.project.runtimeSec,
    lrcRaw: a.project.lrcRaw,
    lrcLines: parseLrc(a.project.lrcRaw).lines,
    ...(a.project.audioFileName ? { audioFileName: a.project.audioFileName } : {}),
    vision: a.project.vision,
    audioBrief: a.project.audioBrief,
    treatment: a.project.treatment,
    ...(a.project.stopTagsChecked ? { stopTagsChecked: a.project.stopTagsChecked } : {}),
    ...(a.project.manualTags ? { manualTags: a.project.manualTags } : {}),
    ...(a.project.backingMode ? { backingMode: a.project.backingMode } : {}),
    ...(a.project.tagSpelling ? { tagSpelling: a.project.tagSpelling } : {}),
  };

  const idMap = new Map<string, string>(a.images.map((im) => [im.id, crypto.randomUUID()]));
  const images: ImageRecord[] = a.images.map((im) => ({
    id: idMap.get(im.id)!,
    projectId: id,
    ownerKey: im.ownerKey as ImageRecord['ownerKey'],
    kind: im.kind,
    blob: blobs.get(im.id)!,
    mime: im.mime,
    width: im.width,
    height: im.height,
    model: im.model,
    prompt: im.prompt,
    source: im.source,
    ...(im.refImageIds ? { refImageIds: im.refImageIds.map((r) => idMap.get(r)).filter((r): r is string => !!r) } : {}),
    createdAt: im.createdAt,
  }));
  const runs: RunRecord[] = a.runs.map((r) => ({ id: crypto.randomUUID(), projectId: id, kind: r.kind, createdAt: r.createdAt, payload: r.payload, ...(r.usage !== undefined ? { usage: r.usage } : {}) }));

  try {
    await db.putProject(project);
    await db.replaceBlueprint(id, a.anchors.map(({ order: _o, ...x }) => (void _o, x)), a.scenes);
    for (const im of images) await db.putImage(im);
    for (const r of runs) await db.addRun(r);
  } catch (e) {
    await db.deleteProject(id).catch(() => undefined);
    if (isQuotaError(e)) throw new ImportError(`Your browser doesn't have room for this project (the images alone are about ${(total / 1048576).toFixed(0)} MB). Nothing was imported. Free some space (Settings, Storage) or delete a project you no longer need, then try again.`);
    throw new ImportError(`Couldn't save the imported project: ${e instanceof Error ? e.message : String(e)}`);
  }
  return project;
}
