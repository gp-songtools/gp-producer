import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { goodLedger } from '../../lib/ledger/__tests__/helpers';
import { IMAGE_QUOTA_MESSAGE } from '../../lib/storageErrors';
import { DEFAULT_SETTINGS } from '../../lib/settings';

// A switch that makes chosen writes fail the way a full disk does.
const full = vi.hoisted(() => ({ on: false, getProjectFails: false }));
vi.mock('../../lib/db', async (orig) => {
  const real = await orig<typeof import('../../lib/db')>();
  const quota = () => Promise.reject(new DOMException('The quota has been exceeded.', 'QuotaExceededError'));
  const guard = <A extends unknown[], R>(fn: (...a: A) => Promise<R>) => (...a: A): Promise<R> => (full.on ? quota() : fn(...a));
  return {
    ...real,
    putProject: guard(real.putProject),
    putScene: guard(real.putScene),
    putAnchor: guard(real.putAnchor),
    replaceBlueprint: guard(real.replaceBlueprint),
    replaceScenes: guard(real.replaceScenes),
    putImage: guard(real.putImage),
    getProject: (id: string) => (full.getProjectFails ? Promise.reject(new Error('The database connection is closing.')) : real.getProject(id)),
  };
});
vi.mock('../../lib/api/gemini', async (orig) => ({ ...(await orig<typeof import('../../lib/api/gemini')>()), generateImage: async () => ({ blob: new Blob(['x'], { type: 'image/png' }), mimeType: 'image/png', text: '' }) }));
vi.mock('../../lib/image', async (orig) => ({ ...(await orig<typeof import('../../lib/image')>()), imageDimensions: async () => ({ width: 1376, height: 768 }) }));

import * as db from '../../lib/db';
import { importProjectArchive, ImportError } from '../../lib/import';
import { exportProjectArchive } from '../../lib/projectArchive';
import { useImageStore } from '../imageStore';
import { useProjectStore } from '../projectStore';
import { useSettingsStore } from '../settingsStore';
import { useStorageStore } from '../storageStore';

const treatment = { title: 't', paragraphs: ['a'], facets: { narrative_metaphor: '', visual_symbolism: '', pacing_arc: '', camera_language: '', color_progression: '' } };

beforeEach(async () => {
  await useProjectStore.getState().unload();
  await db._resetDbForTests();
  globalThis.indexedDB = new IDBFactory();
  full.on = false;
  full.getProjectFails = false;
  useStorageStore.setState({ problem: null, usage: null, usageDismissed: false });
  useSettingsStore.setState({ geminiKey: 'K', settings: DEFAULT_SETTINGS });
  useImageStore.setState({ projectId: null, images: [], jobs: {}, batch: null, frameBatch: null, usage: {} });
});

const open = async () => {
  const p = await db.createProject('P');
  await db.replaceBlueprint(p.id, [{ id: 'character', name: 'Character', category: 'character', prompt: 'x' }], goodLedger());
  await useProjectStore.getState().load(p.id);
  return p.id;
};

describe('saving the project when storage is full', () => {
  it('keeps a typed edit on screen, reports the failure, and writes it when retried', async () => {
    const id = await open();
    const st = useProjectStore.getState();
    full.on = true;
    st.patch({ name: 'Renamed' });
    await st.flush();
    expect(useProjectStore.getState().project?.name).toBe('Renamed'); // still there, only in memory
    expect(useStorageStore.getState().problem).toMatchObject({ kind: 'quota' });
    expect((await db.getProject(id))?.name).toBe('P'); // not saved

    full.on = false;
    await useProjectStore.getState().retrySave();
    expect(useStorageStore.getState().problem).toBeNull();
    expect((await db.getProject(id))?.name).toBe('Renamed');
  });

  it('does not throw from the debounced save, so nothing becomes an unhandled error', async () => {
    await open();
    full.on = true;
    useProjectStore.getState().patch({ name: 'X' });
    await expect(useProjectStore.getState().flush()).resolves.toBeUndefined();
  });

  it('a later edit is not lost just because an earlier save failed', async () => {
    const id = await open();
    full.on = true;
    useProjectStore.getState().patch({ name: 'One' });
    await useProjectStore.getState().flush();
    full.on = false;
    useProjectStore.getState().patch({ runtimeSec: 123 });
    await useProjectStore.getState().flush();
    const saved = await db.getProject(id);
    expect(saved).toMatchObject({ name: 'One', runtimeSec: 123 });
    expect(useStorageStore.getState().problem).toBeNull();
  });

  it('keeps checklist ticks, revisions and anchor choices on screen when their save fails, and re-saves them', async () => {
    const id = await open();
    const st = useProjectStore.getState();
    full.on = true;
    await st.setChecklist(1, 'tagged', true);
    await st.setAnchorUseSheet('character', true);
    expect(useProjectStore.getState().scenes[0].checklist).toEqual({ tagged: true });
    expect(useProjectStore.getState().anchors[0].useSheet).toBe(true);
    expect(useStorageStore.getState().problem?.kind).toBe('quota');
    expect((await db.getScenes(id))[0].checklist).toBeUndefined();

    full.on = false;
    await useProjectStore.getState().retrySave();
    expect((await db.getScenes(id))[0].checklist).toEqual({ tagged: true });
    expect((await db.getAnchors(id))[0].useSheet).toBe(true);
  });

  it('keeps a freshly paid-for blueprint on screen when it cannot be saved, instead of throwing it away', async () => {
    const id = await open();
    full.on = true;
    await expect(useProjectStore.getState().setBlueprint({ treatment, anchors: [{ id: 'new', name: 'New', category: 'prop', prompt: 'p' }], scenes: goodLedger() })).resolves.toBeUndefined();
    expect(useProjectStore.getState().anchors.map((a) => a.id)).toEqual(['new']);
    expect(useProjectStore.getState().project?.treatment?.title).toBe('t');
    expect(useStorageStore.getState().problem?.kind).toBe('quota');
    full.on = false;
    await useProjectStore.getState().retrySave();
    expect((await db.getAnchors(id)).map((a) => a.id)).toEqual(['new']);
    expect((await db.getProject(id))?.treatment?.title).toBe('t');
  });
});

describe('opening a project fails', () => {
  it('says so, as a read failure, not as "not found"', async () => {
    const id = await open();
    await useProjectStore.getState().unload();
    full.getProjectFails = true;
    await useProjectStore.getState().load(id);
    const s = useProjectStore.getState();
    expect(s.loadError).toBe('The database connection is closing.');
    expect(s.notFound).toBe(false);
    expect(s.loading).toBe(false);
    full.getProjectFails = false;
    await useProjectStore.getState().load(id);
    expect(useProjectStore.getState().loadError).toBeNull();
    expect(useProjectStore.getState().project?.id).toBe(id);
  });
});

describe('saving an image when storage is full', () => {
  it('tells the card that the image was made but not kept, and raises the banner', async () => {
    const id = await open();
    await useImageStore.getState().load(id);
    full.on = true;
    await useImageStore.getState().generateAnchor(id, { id: 'character', prompt: 'x' }, 'workhorse');
    expect(useImageStore.getState().jobs['anchor:character']).toMatchObject({ status: 'error', message: IMAGE_QUOTA_MESSAGE });
    expect(useImageStore.getState().images).toEqual([]);
    expect(useStorageStore.getState().problem?.kind).toBe('quota');
    full.on = false;
    await useImageStore.getState().generateAnchor(id, { id: 'character', prompt: 'x' }, 'workhorse');
    expect(useImageStore.getState().images).toHaveLength(1);
  });
});

describe('importing when storage is full', () => {
  it('refuses with a clear message and leaves no half-made project behind', async () => {
    const id = await open();
    await db.putImage({ id: 'i1', projectId: id, ownerKey: 'anchor:character', kind: 'anchor', blob: new Blob([Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4])], { type: 'image/png' }), mime: 'image/png', width: 10, height: 10, model: 'm', prompt: 'p', source: 'generated', createdAt: 1 });
    const { blob } = await exportProjectArchive(id);
    const before = (await db.listProjects()).length;
    full.on = true;
    const e = await importProjectArchive(blob).catch((x) => x);
    expect(e).toBeInstanceOf(ImportError);
    expect(e.message).toMatch(/doesn't have room for this project/);
    expect(e.message).toMatch(/Nothing was imported/);
    full.on = false;
    expect((await db.listProjects()).length).toBe(before);
  });
});
