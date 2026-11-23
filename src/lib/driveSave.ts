// Saves a project's clips, latest images and project .zip into the song's GP Song Tools folder on Google Drive.
// Everything outside this function (Drive library, shared spec store, dialogs) is injected so it can be tested.
import { extForMime } from '../hooks/useBlobUrl';
import type { Scene } from '../types/blueprint';
import { anchorOwner, sceneOwner, type ImageRecord } from '../types/project';
import type { SongSpecApi, SongSpecDoc } from '../vendor/songspec';
import type { SongDriveApi } from '../vendor/songdrive';
import { imagesForOwner } from './anchorImages';
import { slugName } from './download';
import { buildFileTag, slugSection } from './ledger/fileTag';

export interface DriveSaveOptions {
  projectName: string;
  scenes: Scene[];
  /** Clip files held in this session, by scene number. */
  files: Map<number, File>;
  anchors: { id: string; name: string }[];
  /** Every stored image version; only the newest per owner is uploaded. */
  images: ImageRecord[];
  /** Builds the project .zip when it is time to upload it (omit to skip). */
  archive?: () => Promise<Blob>;
  drive: SongDriveApi;
  spec: { load(): string; update(fn: (doc: SongSpecDoc) => unknown): string };
  specLib: Pick<SongSpecApi, 'parse' | 'setting' | 'setSetting'>;
  confirm: (message: string) => boolean;
  prompt: (message: string, initial: string) => string | null;
  onProgress?: (text: string) => void;
  /** A clip is on Drive (uploaded now, or already there with the same size). */
  onClipSaved?: (scene: number, drive: { driveFileId: string; driveName: string; savedAt: string }) => void;
  signal?: AbortSignal;
}

export interface DriveSaveSummary {
  /** Drive folder name, when it got that far. */
  folder?: string;
  uploaded: string[];
  skipped: string[];
  failed: { name: string; message: string }[];
  /** Set when the run ended early: a reason in plain words. */
  stopped?: string;
}

type Job = {
  name: string;
  kind: 'clip' | 'image' | 'project';
  folderId: string;
  fileId?: string;
  mimeType: string;
  blob: () => Promise<Blob>;
  scene?: number;
};

const errCode = (e: unknown): string => (e && typeof e === 'object' && 'code' in e ? String((e as { code: unknown }).code) : '');
const errText = (e: unknown): string => (e instanceof Error ? e.message : 'Google Drive failed.');
const sameSize = (f: { size?: string }, n: number) => f.size !== undefined && Number(f.size) === n;
const pad2 = (n: number) => String(n).padStart(2, '0');

/** What the user is told for an error that ends the run. */
export function stopMessage(e: unknown): string {
  const code = errCode(e);
  if (code === 'auth') return 'Google sign-in expired. Click Save clips to Drive again.';
  if (code === 'cancelled') return 'Cancelled.';
  return errText(e);
}

/** The file names images get on Drive: the newest image per anchor, then per scene keyframe. */
export function imageNames(images: ImageRecord[], anchors: { id: string; name: string }[], scenes: Scene[]): { name: string; image: ImageRecord }[] {
  const out: { name: string; image: ImageRecord }[] = [];
  for (const a of anchors) {
    const [img] = imagesForOwner(images, anchorOwner(a.id));
    if (img) out.push({ name: `anchor_${slugName(a.name, slugName(a.id, 'anchor'))}.${extForMime(img.mime)}`, image: img });
  }
  for (const s of [...scenes].sort((x, y) => x.scene - y.scene)) {
    const [img] = imagesForOwner(images, sceneOwner(s.scene));
    if (img) out.push({ name: `keyframe_${pad2(s.scene)}_${slugSection(s.section)}.${extForMime(img.mime)}`, image: img });
  }
  return out;
}

export async function saveProjectToDrive(o: DriveSaveOptions): Promise<DriveSaveSummary> {
  const { drive, specLib } = o;
  const sum: DriveSaveSummary = { uploaded: [], skipped: [], failed: [] };
  const say = (t: string) => o.onProgress?.(t);
  const checkCancel = () => {
    if (o.signal?.aborted) throw new drive.SongDriveError('Cancelled.', { code: 'cancelled' });
  };

  try {
    // 1. The song needs a title: its Drive folder is named after it.
    let doc = specLib.parse(o.spec.load());
    if (!specLib.setting(doc, 'title').trim()) {
      const t = (o.prompt('Song title for the Drive folder', o.projectName) ?? '').trim();
      if (!t) {
        sum.stopped = 'Cancelled: a song needs a title for its Drive folder.';
        return sum;
      }
      o.spec.update((d) => specLib.setSetting(d, 'title', t, { by: 'person' }));
      doc = specLib.parse(o.spec.load());
    }

    // 2. The song folder; remember its id in the spec when the spec had none.
    say('Finding the song folder on Google Drive…');
    const folder = await drive.songFolder(doc, {
      create: true,
      confirm: (name) => o.confirm(`A Drive folder named "${name}" already exists in GP Song Tools. Use it for this song? Cancel makes a new folder instead.`),
    });
    if (!folder) throw new drive.SongDriveError("Couldn't find or make the song folder.", { code: 'http' });
    sum.folder = folder.name;
    if (!specLib.setting(doc, 'drive_folder')) o.spec.update((d) => specLib.setSetting(d, 'drive_folder', folder.id, { by: 'gp-producer' }));
    checkCancel();

    const jobs: Job[] = [];

    // 3. Clips: skip same name and size; ask once before replacing different ones.
    const clipScenes = o.scenes.filter((s) => o.files.has(s.scene)).sort((a, b) => a.scene - b.scene);
    if (clipScenes.length) {
      say('Checking clips/ on Google Drive…');
      const clips = (await drive.subfolder(folder.id, 'clips'))!;
      const have = new Map((await drive.list(clips.id)).map((f) => [f.name, f]));
      const replace: Job[] = [];
      for (const s of clipScenes) {
        const file = o.files.get(s.scene)!;
        const name = buildFileTag(s);
        const there = have.get(name);
        const job: Job = { name, kind: 'clip', folderId: clips.id, mimeType: file.type || 'video/mp4', blob: async () => file, scene: s.scene };
        if (!there) jobs.push(job);
        else if (sameSize(there, file.size)) {
          sum.skipped.push(`${name} (already on Drive)`);
          o.onClipSaved?.(s.scene, { driveFileId: there.id, driveName: there.name, savedAt: new Date().toISOString() });
        } else replace.push({ ...job, fileId: there.id });
      }
      if (replace.length) {
        if (o.confirm(`Replace ${replace.length} clip${replace.length === 1 ? '' : 's'} already on Drive?`)) jobs.push(...replace);
        else for (const j of replace) sum.skipped.push(`${j.name} (different file on Drive, kept)`);
      }
    }

    // 4. Images: newest version of each anchor and keyframe; a different size is replaced without asking.
    const imgs = imageNames(o.images, o.anchors, o.scenes);
    if (imgs.length) {
      say('Checking images/ on Google Drive…');
      const dir = (await drive.subfolder(folder.id, 'images'))!;
      const have = new Map((await drive.list(dir.id)).map((f) => [f.name, f]));
      for (const { name, image } of imgs) {
        const there = have.get(name);
        if (there && sameSize(there, image.blob.size)) sum.skipped.push(`${name} (already on Drive)`);
        else jobs.push({ name, kind: 'image', folderId: dir.id, fileId: there?.id, mimeType: image.mime, blob: async () => image.blob });
      }
    }

    // 5. The project .zip: updated in place when one with that name is there.
    if (o.archive) {
      const dir = (await drive.subfolder(folder.id, 'projects'))!;
      const name = `${drive.folderName(o.projectName) || 'project'}.zip`;
      const there = (await drive.list(dir.id)).find((f) => f.name === name);
      jobs.push({ name, kind: 'project', folderId: dir.id, fileId: there?.id, mimeType: 'application/zip', blob: o.archive });
    }

    // Upload.
    let n = 0;
    for (const j of jobs) {
      checkCancel();
      n++;
      const label = `Uploading ${n} of ${jobs.length}: ${j.name}`;
      say(j.kind === 'project' ? `${label} (building the project file…)` : label);
      try {
        const blob = await j.blob();
        const rec = await drive.upload(j.folderId, j.name, blob, {
          mimeType: j.mimeType,
          fileId: j.fileId,
          signal: o.signal,
          onProgress: (sent, total) => say(`${label} — ${total ? Math.round((sent / total) * 100) : 100}%`),
        });
        sum.uploaded.push(j.name);
        if (j.kind === 'clip' && j.scene !== undefined) {
          o.onClipSaved?.(j.scene, { driveFileId: rec.id, driveName: rec.name || j.name, savedAt: new Date().toISOString() });
        }
      } catch (e) {
        if (errCode(e) === 'auth' || errCode(e) === 'cancelled') throw e;
        sum.failed.push({ name: j.name, message: errText(e) });
      }
    }
  } catch (e) {
    sum.stopped = stopMessage(e);
  }
  return sum;
}

/** One or two plain sentences for the end of a run. */
export function summaryText(s: DriveSaveSummary): string {
  const parts = [`Uploaded ${s.uploaded.length}`, `skipped ${s.skipped.length}`, `failed ${s.failed.length}`];
  const where = s.folder ? ` (GP Song Tools / ${s.folder})` : '';
  return `${s.stopped ? `${s.stopped} ` : ''}${parts.join(', ')}${where}.`;
}
