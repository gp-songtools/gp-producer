import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it } from 'vitest';
import * as db from '../../lib/db';
import { goodLedger } from '../../lib/ledger/__tests__/helpers';
import { useProjectStore } from '../projectStore';

beforeEach(async () => {
  await useProjectStore.getState().unload();
  await db._resetDbForTests();
  globalThis.indexedDB = new IDBFactory();
});

const treatment = {
  title: 't',
  paragraphs: ['a', 'b'],
  facets: { narrative_metaphor: '', visual_symbolism: '', pacing_arc: '', camera_language: '', color_progression: '' },
};

describe('projectStore', () => {
  it('flags a missing project', async () => {
    await useProjectStore.getState().load('nope');
    const s = useProjectStore.getState();
    expect(s.notFound).toBe(true);
    expect(s.project).toBeNull();
  });

  it('loads a project with its anchors and scenes', async () => {
    const p = await db.createProject('P');
    await db.replaceBlueprint(p.id, [{ id: 'a', name: 'A', category: 'character', prompt: 'x' }], goodLedger());
    await useProjectStore.getState().load(p.id);
    const s = useProjectStore.getState();
    expect(s.project?.name).toBe('P');
    expect(s.anchors).toHaveLength(1);
    expect(s.scenes).toHaveLength(4);
  });

  it('saves patches on flush', async () => {
    const p = await db.createProject('P');
    const st = useProjectStore.getState();
    await st.load(p.id);
    st.patch({ name: 'Renamed', runtimeSec: 200 });
    expect((await db.getProject(p.id))?.name).toBe('P'); // debounced, not yet written
    await st.flush();
    const saved = await db.getProject(p.id);
    expect(saved?.name).toBe('Renamed');
    expect(saved?.runtimeSec).toBe(200);
    expect(saved!.updatedAt).toBeGreaterThanOrEqual(p.updatedAt);
  });

  it('derives parsed lyric lines when the lrc text changes', async () => {
    const p = await db.createProject();
    const st = useProjectStore.getState();
    await st.load(p.id);
    st.setLrc('[00:05.00] hello\n[00:10.00] world');
    expect(useProjectStore.getState().project?.lrcLines.map((l) => l.text)).toEqual(['hello', 'world']);
  });

  it('writes pending edits before switching to another project', async () => {
    const a = await db.createProject('A');
    const b = await db.createProject('B');
    const st = useProjectStore.getState();
    await st.load(a.id);
    st.patch({ name: 'A edited' });
    await st.load(b.id);
    expect((await db.getProject(a.id))?.name).toBe('A edited');
    expect(useProjectStore.getState().project?.id).toBe(b.id);
  });

  it('setBlueprint persists everything and records the run', async () => {
    const p = await db.createProject();
    const st = useProjectStore.getState();
    await st.load(p.id);
    await st.setBlueprint(
      { treatment, anchors: [{ id: 'a', name: 'A', category: 'prop', prompt: 'x' }], scenes: goodLedger() },
      { id: 'run1', projectId: p.id, kind: 'blueprint', createdAt: 1, payload: {} },
    );
    expect((await db.getProject(p.id))?.treatment?.title).toBe('t');
    expect(await db.getScenes(p.id)).toHaveLength(4);
    expect(await db.listRuns(p.id)).toHaveLength(1);
    expect(useProjectStore.getState().anchors[0].order).toBe(0);
  });

  it('setScenes replaces scenes in state and storage', async () => {
    const p = await db.createProject();
    const st = useProjectStore.getState();
    await st.load(p.id);
    await st.setScenes(goodLedger().slice(0, 2));
    expect(useProjectStore.getState().scenes).toHaveLength(2);
    expect(await db.getScenes(p.id)).toHaveLength(2);
  });
});
