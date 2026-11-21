import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import { generateAnchorImage, imagesForOwner, isStale, KEEP_VERSIONS, MAX_UPLOAD_BYTES, saveUploadedImage, UploadError } from '../anchorImages';
import * as db from '../db';
import { anchorOwner, type ImageRecord } from '../../types/project';

beforeEach(async () => {
  await db._resetDbForTests();
  globalThis.indexedDB = new IDBFactory();
});

const generate = (mime = 'image/png') => vi.fn(async () => ({ blob: new Blob(['img'], { type: mime }), mimeType: mime, text: '' }));
const dims = async () => ({ width: 1376, height: 768 });
const anchor = { id: 'character', prompt: 'A weathered keeper' };

describe('generateAnchorImage', () => {
  it('sends the key, model, suffixed prompt and 16:9, then stores the result as a generated anchor image', async () => {
    const p = await db.createProject();
    const gen = generate();
    const rec = await generateAnchorImage({ projectId: p.id, anchor, model: 'gemini-x', apiKey: 'K', generate: gen as never, dims });
    const call = (gen.mock.calls[0] as unknown[])[0] as Record<string, unknown>;
    expect(call).toMatchObject({ apiKey: 'K', model: 'gemini-x', aspectRatio: '16:9' });
    expect(String(call.prompt)).toMatch(/^A weathered keeper\n\n.*16:9 widescreen/s);
    expect(rec).toMatchObject({ projectId: p.id, ownerKey: 'anchor:character', kind: 'anchor', model: 'gemini-x', source: 'generated', width: 1376, height: 768, mime: 'image/png' });
    expect(rec.prompt).toBe('A weathered keeper'); // raw anchor text, not the suffixed one
    expect((await db.getImage(rec.id))!.ownerKey).toBe('anchor:character');
  });

  it('keeps only the newest versions', async () => {
    const p = await db.createProject();
    for (let i = 0; i < KEEP_VERSIONS + 2; i++) {
      await generateAnchorImage({ projectId: p.id, anchor, model: `m${i}`, apiKey: 'K', generate: generate() as never, dims });
      await new Promise((r) => setTimeout(r, 2));
    }
    const rows = await db.listImages(p.id, anchorOwner('character'));
    expect(rows).toHaveLength(KEEP_VERSIONS);
    expect(rows[0].model).toBe(`m${KEEP_VERSIONS + 1}`);
  });

  it('saves nothing when generation fails', async () => {
    const p = await db.createProject();
    const gen = vi.fn(async () => { throw new ApiError('nope', 429, 'x'); });
    await expect(generateAnchorImage({ projectId: p.id, anchor, model: 'm', apiKey: 'K', generate: gen as never, dims })).rejects.toThrow('nope');
    expect(await db.listProjectImages(p.id)).toEqual([]);
  });
});

describe('saveUploadedImage', () => {
  const file = (type: string, size = 10, name = 'mine.png') => new File([new Uint8Array(size)], name, { type });

  it('stores an upload with no model or prompt, without the file name', async () => {
    const p = await db.createProject();
    const rec = await saveUploadedImage({ projectId: p.id, owner: anchorOwner('character'), kind: 'anchor', file: file('image/jpeg'), dims });
    expect(rec).toMatchObject({ source: 'uploaded', model: null, prompt: null, mime: 'image/jpeg', ownerKey: 'anchor:character', width: 1376 });
    expect((rec.blob as File).name).toBeUndefined();
    expect(rec.blob.type).toBe('image/jpeg');
  });

  it.each(['image/gif', 'application/pdf', 'text/plain', ''])('rejects type %j', async (type) => {
    const p = await db.createProject();
    await expect(saveUploadedImage({ projectId: p.id, owner: anchorOwner('a'), kind: 'anchor', file: file(type), dims })).rejects.toThrow(/PNG, JPEG or WebP/);
    expect(await db.listProjectImages(p.id)).toEqual([]);
  });

  it('rejects an oversized file', async () => {
    const p = await db.createProject();
    const e = await saveUploadedImage({ projectId: p.id, owner: anchorOwner('a'), kind: 'anchor', file: file('image/png', MAX_UPLOAD_BYTES + 1), dims }).catch((x) => x);
    expect(e).toBeInstanceOf(UploadError);
    expect(e.message).toMatch(/limit is 20 MB/);
  });

  it('rejects a file that is not really an image', async () => {
    const p = await db.createProject();
    const bad = async () => { throw new Error('decode failed'); };
    await expect(saveUploadedImage({ projectId: p.id, owner: anchorOwner('a'), kind: 'anchor', file: file('image/png'), dims: bad })).rejects.toThrow(/couldn't be read as an image/);
    expect(await db.listProjectImages(p.id)).toEqual([]);
  });
});

describe('history and staleness', () => {
  it('promoteImage makes an older version current again', async () => {
    const p = await db.createProject();
    const a = await generateAnchorImage({ projectId: p.id, anchor, model: 'old', apiKey: 'K', generate: generate() as never, dims });
    await new Promise((r) => setTimeout(r, 3));
    await generateAnchorImage({ projectId: p.id, anchor, model: 'new', apiKey: 'K', generate: generate() as never, dims });
    expect((await db.listImages(p.id, anchorOwner('character')))[0].model).toBe('new');
    await db.promoteImage(a.id);
    const rows = await db.listImages(p.id, anchorOwner('character'));
    expect(rows[0].model).toBe('old');
    expect(rows).toHaveLength(2);
  });

  it('promoteImage on a missing id does nothing', async () => {
    await expect(db.promoteImage('nope')).resolves.toBeUndefined();
  });

  it('imagesForOwner filters and sorts newest first', () => {
    const mk = (owner: string, t: number) => ({ ownerKey: owner, createdAt: t }) as ImageRecord;
    expect(imagesForOwner([mk('anchor:a', 1), mk('anchor:b', 9), mk('anchor:a', 5)], 'anchor:a').map((r) => r.createdAt)).toEqual([5, 1]);
  });

  it('flags a generated image whose anchor prompt has since changed, but never an upload', () => {
    const gen = { source: 'generated', prompt: 'old text' } as ImageRecord;
    expect(isStale(gen, 'old text')).toBe(false);
    expect(isStale(gen, '  old text \n')).toBe(false);
    expect(isStale(gen, 'new text')).toBe(true);
    expect(isStale({ source: 'uploaded', prompt: null } as ImageRecord, 'anything')).toBe(false);
    expect(isStale(undefined, 'x')).toBe(false);
  });
});
