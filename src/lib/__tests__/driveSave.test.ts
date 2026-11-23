import { describe, expect, it, vi } from 'vitest';
import type { ImageRecord } from '../../types/project';
import type { DriveFile, SongDriveApi } from '../../vendor/songdrive';
import { goodLedger } from '../ledger/__tests__/helpers';
import { SongSpec } from '../songSpec';
import { imageNames, saveProjectToDrive, type DriveSaveOptions } from '../driveSave';

class FakeErr extends Error {
  code: string;
  status = 0;
  constructor(message: string, o: { code?: string } = {}) {
    super(message);
    this.code = o.code ?? 'http';
  }
}

/** In-memory Drive: one song folder with subfolders; files are {id,name,size}. */
function fakeDrive(opts: { existing?: Record<string, DriveFile[]>; failUpload?: (name: string) => Error | null } = {}) {
  const files: Record<string, DriveFile[]> = { clips: [], images: [], projects: [], ...(opts.existing ?? {}) };
  const uploads: { folder: string; name: string; size: number; mimeType?: string; fileId?: string }[] = [];
  const songFolder = vi.fn(async (_doc: unknown, o?: { confirm?: (n: string) => boolean | Promise<boolean> }) => {
    await o?.confirm?.('My Song');
    return { id: 'SONG123', name: 'My Song', created: true };
  });
  const drive = {
    SongDriveError: FakeErr,
    folderName: (t: string) => t.replace(/[/\\:*?"<>|]/g, '').trim(),
    songFolder,
    subfolder: async (_id: string, name: string) => ({ id: name, name }),
    list: async (folder: string) => files[folder] ?? [],
    upload: async (folder: string, name: string, blob: Blob, o: { mimeType?: string; fileId?: string; signal?: AbortSignal; onProgress?: (a: number, b: number) => void } = {}) => {
      const err = opts.failUpload?.(name);
      if (err) throw err;
      uploads.push({ folder, name, size: blob.size, mimeType: o.mimeType, fileId: o.fileId });
      o.onProgress?.(blob.size, blob.size);
      return { id: o.fileId ?? `id-${name}`, name };
    },
  } as unknown as SongDriveApi;
  return { drive, uploads, songFolder };
}

function fakeSpec(text: string) {
  let t = text;
  return {
    load: () => t,
    update: (fn: (d: ReturnType<typeof SongSpec.parse>) => unknown) => {
      const d = SongSpec.parse(t);
      fn(d);
      t = SongSpec.serialize(d);
      return t;
    },
    get text() {
      return t;
    },
  };
}

const specWith = (title: string) => SongSpec.serialize(SongSpec.setSetting(SongSpec.parse(SongSpec.create()), 'title', title, { by: 'person' }));
const file = (size: number, type = 'video/mp4') => new File([new Uint8Array(size)], 'x.mp4', { type });
const img = (id: string, ownerKey: ImageRecord['ownerKey'], size: number, createdAt: number, mime = 'image/png'): ImageRecord => ({
  id, projectId: 'p', ownerKey, kind: ownerKey.startsWith('anchor') ? 'anchor' : 'keyframe', blob: new Blob([new Uint8Array(size)]), mime, width: 1, height: 1, model: null, prompt: null, source: 'uploaded', createdAt,
});

const scenes = goodLedger(); // Sec 1..4
const base = (over: Partial<DriveSaveOptions>, d = fakeDrive()): DriveSaveOptions & { f: ReturnType<typeof fakeDrive> } => ({
  projectName: 'My Song',
  scenes,
  files: new Map(),
  anchors: [{ id: 'character', name: 'Character' }],
  images: [],
  drive: d.drive,
  spec: fakeSpec(specWith('My Song')),
  specLib: SongSpec,
  confirm: () => true,
  prompt: () => null,
  f: d,
  ...over,
});

describe('imageNames', () => {
  it('names the newest anchor and keyframe images by type', () => {
    const imgs = [
      img('old', 'anchor:character', 1, 1),
      img('new', 'anchor:character', 2, 2),
      img('k', 'scene:2', 3, 3, 'image/jpeg'),
      img('gone', 'scene:9', 3, 3),
    ];
    const r = imageNames(imgs, [{ id: 'character', name: 'Character' }, { id: 'prop_phone', name: 'Prop: Telephone' }], scenes);
    expect(r.map((x) => x.name)).toEqual(['anchor_Character.png', 'keyframe_02_Sec2.jpg']);
    expect(r[0].image.id).toBe('new');
  });
});

describe('saveProjectToDrive', () => {
  it('uploads clips by file tag, newest images and the project zip, and writes drive_folder', async () => {
    const spec = fakeSpec(specWith('My Song'));
    const saved: [number, string][] = [];
    const o = base({
      spec,
      files: new Map([[1, file(10)], [3, file(30, '')]]),
      images: [img('a1', 'anchor:character', 5, 1), img('k1', 'scene:1', 6, 2, 'image/webp')],
      archive: async () => new Blob([new Uint8Array(40)]),
      onClipSaved: (n, d) => saved.push([n, d.driveFileId]),
    });
    const sum = await saveProjectToDrive(o);
    expect(sum.stopped).toBeUndefined();
    expect(o.f.uploads.map((u) => `${u.folder}/${u.name}`)).toEqual([
      'clips/01_Sec1_00-12.mp4', 'clips/03_Sec3_25-37.mp4', 'images/anchor_Character.png', 'images/keyframe_01_Sec1.webp', 'projects/My Song.zip',
    ]);
    expect(o.f.uploads[1].mimeType).toBe('video/mp4');
    expect(o.f.uploads[4].mimeType).toBe('application/zip');
    expect(saved).toEqual([[1, 'id-01_Sec1_00-12.mp4'], [3, 'id-03_Sec3_25-37.mp4']]);
    expect(SongSpec.setting(SongSpec.parse(spec.text), 'drive_folder')).toBe('SONG123');
    expect(sum.uploaded).toHaveLength(5);
  });

  it('asks for a title when the spec has none and writes it', async () => {
    const spec = fakeSpec(SongSpec.create());
    const prompt = vi.fn(() => ' Night Drive ');
    await saveProjectToDrive(base({ spec, prompt }));
    expect(prompt).toHaveBeenCalledWith('Song title for the Drive folder', 'My Song');
    expect(SongSpec.setting(SongSpec.parse(spec.text), 'title')).toBe('Night Drive');
  });

  it('stops without touching Drive when the title prompt is cancelled', async () => {
    const o = base({ spec: fakeSpec(SongSpec.create()), prompt: () => null });
    const sum = await saveProjectToDrive(o);
    expect(sum.stopped).toMatch(/needs a title/);
    expect(o.f.songFolder).not.toHaveBeenCalled();
  });

  it('does not overwrite an existing drive_folder', async () => {
    const withFolder = fakeSpec(SongSpec.serialize(SongSpec.setSetting(SongSpec.parse(specWith('My Song')), 'drive_folder', 'KEEPME', { by: 'person' })));
    await saveProjectToDrive(base({ spec: withFolder }));
    expect(SongSpec.setting(SongSpec.parse(withFolder.text), 'drive_folder')).toBe('KEEPME');
  });

  it('passes the reuse-folder question through to confirm', async () => {
    const confirm = vi.fn((_m: string) => true);
    await saveProjectToDrive(base({ confirm }));
    expect(confirm.mock.calls[0][0]).toContain('"My Song" already exists in GP Song Tools');
  });

  it('skips clips and images already there with the same size, replaces different images silently', async () => {
    const d = fakeDrive({
      existing: {
        clips: [{ id: 'C1', name: '01_Sec1_00-12.mp4', size: '10' }],
        images: [{ id: 'I1', name: 'anchor_Character.png', size: '5' }, { id: 'I2', name: 'keyframe_01_Sec1.png', size: '1' }],
      },
    });
    const confirm = vi.fn(() => true);
    const saved: [number, string][] = [];
    const o = base({
      confirm,
      files: new Map([[1, file(10)]]),
      images: [img('a1', 'anchor:character', 5, 1), img('k1', 'scene:1', 6, 2)],
      onClipSaved: (n, x) => saved.push([n, x.driveFileId]),
    }, d);
    const sum = await saveProjectToDrive(o);
    expect(o.f.uploads).toEqual([expect.objectContaining({ name: 'keyframe_01_Sec1.png', fileId: 'I2' })]);
    expect(sum.skipped).toHaveLength(2);
    expect(saved).toEqual([[1, 'C1']]); // already on Drive still counts as saved
    expect(confirm).toHaveBeenCalledTimes(1); // only the folder question
  });

  it('asks once before replacing clips with a different size, and honours no', async () => {
    const existing = { clips: [{ id: 'C1', name: '01_Sec1_00-12.mp4', size: '99' }, { id: 'C2', name: '02_Sec2_12-25.mp4', size: '98' }] };
    const files = new Map([[1, file(10)], [2, file(20)], [3, file(30)]]);

    const yes = base({ files, confirm: vi.fn(() => true) }, fakeDrive({ existing }));
    await saveProjectToDrive(yes);
    expect(yes.confirm).toHaveBeenCalledWith('Replace 2 clips already on Drive?');
    expect(yes.f.uploads.map((u) => [u.name, u.fileId])).toEqual([['03_Sec3_25-37.mp4', undefined], ['01_Sec1_00-12.mp4', 'C1'], ['02_Sec2_12-25.mp4', 'C2']]);

    const no = base({ files, confirm: (m) => !m.startsWith('Replace') }, fakeDrive({ existing }));
    const sum = await saveProjectToDrive(no);
    expect(no.f.uploads.map((u) => u.name)).toEqual(['03_Sec3_25-37.mp4']);
    expect(sum.skipped).toHaveLength(2);
  });

  it('updates the project zip in place and sanitizes its name', async () => {
    const d = fakeDrive({ existing: { projects: [{ id: 'Z1', name: 'A B.zip', size: '1' }] } });
    const o = base({ projectName: 'A/B', archive: async () => new Blob(['zip']) }, d);
    // "A/B" -> "AB.zip", which is not there, so it is a new file
    await saveProjectToDrive(o);
    expect(o.f.uploads[0]).toMatchObject({ folder: 'projects', name: 'AB.zip', fileId: undefined });
    const o2 = base({ projectName: 'A: B', archive: async () => new Blob(['zip']) }, fakeDrive({ existing: { projects: [{ id: 'Z1', name: 'A B.zip', size: '1' }] } }));
    await saveProjectToDrive(o2);
    expect(o2.f.uploads[0]).toMatchObject({ name: 'A B.zip', fileId: 'Z1' });
  });

  it('reports a failed upload and carries on with the rest', async () => {
    const d = fakeDrive({ failUpload: (n) => (n.startsWith('01_') ? new FakeErr('Drive said no (500).') : null) });
    const sum = await saveProjectToDrive(base({ files: new Map([[1, file(1)], [2, file(2)]]) }, d));
    expect(sum.failed).toEqual([{ name: '01_Sec1_00-12.mp4', message: 'Drive said no (500).' }]);
    expect(sum.uploaded).toEqual(['02_Sec2_12-25.mp4']);
  });

  it('stops with a sign-in message on an auth error', async () => {
    const d = fakeDrive({ failUpload: () => new FakeErr('x', { code: 'auth' }) });
    const sum = await saveProjectToDrive(base({ files: new Map([[1, file(1)], [2, file(2)]]) }, d));
    expect(sum.stopped).toBe('Google sign-in expired. Click Save clips to Drive again.');
    expect(sum.uploaded).toEqual([]);
  });

  it('stops after the current file when cancelled', async () => {
    const ctl = new AbortController();
    const d = fakeDrive();
    const o = base({
      files: new Map([[1, file(1)], [2, file(2)], [3, file(3)]]),
      signal: ctl.signal,
      onProgress: (t) => { if (t.startsWith('Uploading 1 of')) ctl.abort(); },
    }, d);
    const sum = await saveProjectToDrive(o);
    expect(sum.stopped).toBe('Cancelled.');
    expect(sum.uploaded).toEqual(['01_Sec1_00-12.mp4']);
  });

  it('shows progress with counts and percent', async () => {
    const lines: string[] = [];
    await saveProjectToDrive(base({ files: new Map([[1, file(10)]]), onProgress: (t) => lines.push(t) }));
    expect(lines).toContain('Uploading 1 of 1: 01_Sec1_00-12.mp4 — 100%');
  });
});
