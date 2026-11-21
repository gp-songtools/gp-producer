import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import * as db from '../db';
import type { BlueprintAnchor } from '../../types/blueprint';
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
