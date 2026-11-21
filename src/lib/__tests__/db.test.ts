import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import * as db from '../db';
import type { BlueprintAnchor } from '../../types/blueprint';
import { anchorOwner, sceneOwner, type ImageOwner, type ImageRecord } from '../../types/project';
import { goodLedger } from '../ledger/__tests__/helpers';

const anchor = (id: string): BlueprintAnchor => ({ id, name: id.toUpperCase(), category: 'character', prompt: `p-${id}` });

beforeEach(async () => {
  await db._resetDbForTests();
  globalThis.indexedDB = new IDBFactory();
});

describe('projects', () => {
  it('creates, reads and lists newest first', async () => {
    const a = await db.createProject('A');
    await new Promise((r) => setTimeout(r, 5));
    const b = await db.createProject('B');
    expect((await db.getProject(a.id))?.name).toBe('A');
    expect((await db.listProjects()).map((p) => p.id)).toEqual([b.id, a.id]);
  });

  it('round-trips edits', async () => {
    const p = await db.createProject('A');
    await db.putProject({ ...p, runtimeSec: 214, lrcRaw: '[00:01.00] hi' });
    expect((await db.getProject(p.id))?.runtimeSec).toBe(214);
  });

  it('returns undefined for a missing project', async () => {
    expect(await db.getProject('nope')).toBeUndefined();
  });
});

describe('blueprint storage', () => {
  it('stores anchors in order and scenes by number', async () => {
    const p = await db.createProject();
    await db.replaceBlueprint(p.id, [anchor('b'), anchor('a')], goodLedger());
    expect((await db.getAnchors(p.id)).map((a) => a.id)).toEqual(['b', 'a']);
    expect((await db.getScenes(p.id)).map((s) => s.scene)).toEqual([1, 2, 3, 4]);
  });

  it('replaces, not appends, on a second blueprint', async () => {
    const p = await db.createProject();
    await db.replaceBlueprint(p.id, [anchor('a'), anchor('b')], goodLedger());
    await db.replaceBlueprint(p.id, [anchor('c')], goodLedger().slice(0, 2));
    expect((await db.getAnchors(p.id)).map((a) => a.id)).toEqual(['c']);
    expect(await db.getScenes(p.id)).toHaveLength(2);
  });

  it('keeps projects isolated', async () => {
    const p1 = await db.createProject();
    const p2 = await db.createProject();
    await db.replaceBlueprint(p1.id, [anchor('a')], goodLedger());
    await db.replaceBlueprint(p2.id, [anchor('z')], goodLedger().slice(0, 1));
    expect((await db.getAnchors(p1.id)).map((a) => a.id)).toEqual(['a']);
    expect(await db.getScenes(p2.id)).toHaveLength(1);
  });

  it('replaceScenes swaps scenes and leaves anchors alone', async () => {
    const p = await db.createProject();
    await db.replaceBlueprint(p.id, [anchor('a')], goodLedger());
    await db.replaceScenes(p.id, goodLedger().slice(0, 3));
    expect(await db.getScenes(p.id)).toHaveLength(3);
    expect(await db.getAnchors(p.id)).toHaveLength(1);
  });
});

describe('duplicate and delete', () => {
  it('duplicates with new id and copied children, independent of the original', async () => {
    const p = await db.createProject('Song');
    await db.putProject({ ...p, lrcRaw: 'x' });
    await db.replaceBlueprint(p.id, [anchor('a')], goodLedger());
    const copy = (await db.duplicateProject(p.id))!;
    expect(copy.id).not.toBe(p.id);
    expect(copy.name).toBe('Song (copy)');
    expect(copy.lrcRaw).toBe('x');
    expect(await db.getScenes(copy.id)).toHaveLength(4);
    expect((await db.getAnchors(copy.id))[0].projectId).toBe(copy.id);

    await db.replaceScenes(copy.id, []);
    expect(await db.getScenes(p.id)).toHaveLength(4);
  });

  it('returns undefined when duplicating a missing project', async () => {
    expect(await db.duplicateProject('nope')).toBeUndefined();
  });

  it('deletes a project and cascades only to its own children', async () => {
    const p1 = await db.createProject();
    const p2 = await db.createProject();
    await db.replaceBlueprint(p1.id, [anchor('a')], goodLedger());
    await db.replaceBlueprint(p2.id, [anchor('b')], goodLedger());
    await db.addRun({ id: 'r1', projectId: p1.id, kind: 'blueprint', createdAt: 1, payload: {} });
    await db.deleteProject(p1.id);
    expect(await db.getProject(p1.id)).toBeUndefined();
    expect(await db.getAnchors(p1.id)).toEqual([]);
    expect(await db.getScenes(p1.id)).toEqual([]);
    expect(await db.listRuns(p1.id)).toEqual([]);
    expect(await db.getScenes(p2.id)).toHaveLength(4);
    expect(await db.getAnchors(p2.id)).toHaveLength(1);
  });
});

const img = (projectId: string, ownerKey: ImageOwner, createdAt: number, over: Partial<ImageRecord> = {}): ImageRecord => ({
  id: crypto.randomUUID(),
  projectId,
  ownerKey,
  kind: ownerKey.startsWith('anchor') ? 'anchor' : 'keyframe',
  blob: new Blob([String(createdAt)], { type: 'image/png' }),
  mime: 'image/png',
  width: 16,
  height: 9,
  model: 'm',
  prompt: 'p',
  source: 'generated',
  createdAt,
  ...over,
});

describe('images', () => {
  it('stores and reads a blob back', async () => {
    const p = await db.createProject();
    const rec = img(p.id, anchorOwner('character'), 1);
    await db.putImage(rec);
    const got = (await db.getImage(rec.id))!;
    expect(got.ownerKey).toBe('anchor:character');
    expect(await got.blob.text()).toBe('1');
    expect(got.blob.type).toBe('image/png');
  });

  it('lists an owner newest first and scopes to the project', async () => {
    const a = await db.createProject();
    const b = await db.createProject();
    await db.putImage(img(a.id, sceneOwner(3), 10));
    await db.putImage(img(a.id, sceneOwner(3), 30));
    await db.putImage(img(a.id, sceneOwner(3), 20));
    await db.putImage(img(b.id, sceneOwner(3), 99));
    expect((await db.listImages(a.id, sceneOwner(3))).map((r) => r.createdAt)).toEqual([30, 20, 10]);
    expect((await db.listImages(b.id, sceneOwner(3))).map((r) => r.createdAt)).toEqual([99]);
  });

  it('latestImages picks the newest per owner in one read', async () => {
    const p = await db.createProject();
    await db.putImage(img(p.id, anchorOwner('a'), 1));
    await db.putImage(img(p.id, anchorOwner('a'), 5));
    await db.putImage(img(p.id, sceneOwner(1), 2));
    const m = await db.latestImages(p.id);
    expect(m.size).toBe(2);
    expect(m.get('anchor:a')!.createdAt).toBe(5);
    expect(m.get('scene:1')!.createdAt).toBe(2);
  });

  it('prunes to the newest N for one owner only', async () => {
    const p = await db.createProject();
    for (const t of [1, 2, 3, 4, 5]) await db.putImage(img(p.id, anchorOwner('a'), t));
    await db.putImage(img(p.id, anchorOwner('b'), 1));
    await db.pruneImages(p.id, anchorOwner('a'), 3);
    expect((await db.listImages(p.id, anchorOwner('a'))).map((r) => r.createdAt)).toEqual([5, 4, 3]);
    expect(await db.listImages(p.id, anchorOwner('b'))).toHaveLength(1);
  });

  it('deleteImage and deleteOwnerImages remove only what they should', async () => {
    const p = await db.createProject();
    const keep = img(p.id, sceneOwner(1), 1);
    const gone = img(p.id, sceneOwner(2), 1);
    const gone2 = img(p.id, sceneOwner(2), 2);
    for (const r of [keep, gone, gone2]) await db.putImage(r);
    await db.deleteOwnerImages(p.id, sceneOwner(2));
    expect(await db.listImages(p.id, sceneOwner(2))).toEqual([]);
    expect(await db.getImage(keep.id)).toBeDefined();
    await db.deleteImage(keep.id);
    expect(await db.getImage(keep.id)).toBeUndefined();
  });

  it('duplicating a project copies images under new ids, independent of the original', async () => {
    const p = await db.createProject('Song');
    const orig = img(p.id, anchorOwner('character'), 7);
    await db.putImage(orig);
    const copy = (await db.duplicateProject(p.id))!;
    const copied = await db.listImages(copy.id, anchorOwner('character'));
    expect(copied).toHaveLength(1);
    expect(copied[0].id).not.toBe(orig.id);
    expect(copied[0].projectId).toBe(copy.id);
    expect(await copied[0].blob.text()).toBe('7');
    await db.deleteOwnerImages(copy.id, anchorOwner('character'));
    expect(await db.listImages(p.id, anchorOwner('character'))).toHaveLength(1);
  });

  it('deleting a project removes its images', async () => {
    const p1 = await db.createProject();
    const p2 = await db.createProject();
    await db.putImage(img(p1.id, anchorOwner('a'), 1));
    await db.putImage(img(p2.id, anchorOwner('a'), 1));
    await db.deleteProject(p1.id);
    expect(await db.listProjectImages(p1.id)).toEqual([]);
    expect(await db.listProjectImages(p2.id)).toHaveLength(1);
  });
});
