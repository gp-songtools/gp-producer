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

  it('setBlueprint drops frames for scenes beyond the new count but keeps the rest and all anchor images', async () => {
    const p = await db.createProject();
    const mk = (owner: `anchor:${string}` | `scene:${number}`, n: number) => ({
      id: `${owner}-${n}`, projectId: p.id, ownerKey: owner, kind: owner.startsWith('anchor') ? 'anchor' : 'keyframe',
      blob: new Blob(['x']), mime: 'image/png', width: 1, height: 1, model: 'm', prompt: 'p', source: 'generated', createdAt: n,
    }) as never;
    for (const o of ['scene:1', 'scene:4', 'scene:9', 'anchor:character'] as const) await db.putImage(mk(o, 1));
    const st = useProjectStore.getState();
    await st.load(p.id);
    await st.setBlueprint({ treatment, anchors: [{ id: 'character', name: 'C', category: 'character', prompt: 'x' }], scenes: goodLedger() }); // 4 scenes
    expect((await db.listProjectImages(p.id)).map((r) => r.ownerKey).sort()).toEqual(['anchor:character', 'scene:1', 'scene:4']);
  });
});

describe('checklist', () => {
  it('saves a tick for one scene only, and it survives a reload and a snap-style scene rewrite', async () => {
    const p = await db.createProject('P');
    await db.replaceBlueprint(p.id, [{ id: 'a', name: 'A', category: 'character', prompt: 'x' }], goodLedger());
    const st = useProjectStore.getState();
    await st.load(p.id);
    await st.setChecklist(2, 'baseGenerated', true);
    await st.setChecklist(2, 'tagged', true);
    expect(useProjectStore.getState().scenes.find((s) => s.scene === 2)?.checklist).toEqual({ baseGenerated: true, tagged: true });
    expect(useProjectStore.getState().scenes.find((s) => s.scene === 1)?.checklist).toBeUndefined();

    const saved = await db.getScenes(p.id);
    expect(saved.find((s) => s.scene === 2)?.checklist).toEqual({ baseGenerated: true, tagged: true });
    expect(saved).toHaveLength(4);

    await st.setChecklist(2, 'tagged', false);
    expect((await db.getScenes(p.id)).find((s) => s.scene === 2)?.checklist?.tagged).toBe(false);

    await st.resetChecklist(2);
    expect(useProjectStore.getState().scenes.find((s) => s.scene === 2)?.checklist).toBeUndefined();
    expect((await db.getScenes(p.id)).find((s) => s.scene === 2)?.checklist).toBeUndefined();
  });

  it('ignores an unknown scene', async () => {
    const p = await db.createProject('P');
    await db.replaceBlueprint(p.id, [], goodLedger());
    const st = useProjectStore.getState();
    await st.load(p.id);
    await st.setChecklist(99, 'tagged', true);
    expect((await db.getScenes(p.id)).some((s) => s.checklist)).toBe(false);
  });
});

describe('revisions', () => {
  it('accepts a revision (prompts only), saves it, and undoes it', async () => {
    const p = await db.createProject('P');
    await db.replaceBlueprint(p.id, [{ id: 'a', name: 'A', category: 'character', prompt: 'x' }], goodLedger());
    const st = useProjectStore.getState();
    await st.load(p.id);
    const before = useProjectStore.getState().scenes.find((s) => s.scene === 2)!;

    const next = await st.acceptRevision(2, { base_prompt: 'NEW', extension_prompt: null, keyframe_prompt: 'NEWK', notes: 'n' }, 'why');
    expect(next?.base_prompt).toBe('NEW');
    const saved = (await db.getScenes(p.id)).find((s) => s.scene === 2)!;
    expect(saved.base_prompt).toBe('NEW');
    expect(saved.revisions).toHaveLength(1);
    expect({ a: saved.start_sec, b: saved.end_sec, c: saved.base_sec, d: saved.section }).toEqual({ a: before.start_sec, b: before.end_sec, c: before.base_sec, d: before.section });
    expect((await db.getScenes(p.id)).find((s) => s.scene === 1)?.base_prompt).toBe('b'); // other scenes untouched

    await st.undoRevision(2);
    const undone = (await db.getScenes(p.id)).find((s) => s.scene === 2)!;
    expect(undone.base_prompt).toBe(before.base_prompt);
    expect(undone.revisions).toBeUndefined();
    expect(await st.undoRevision(2)).toBeNull();
    expect(await st.acceptRevision(99, { base_prompt: 'x', extension_prompt: null, keyframe_prompt: 'y', notes: '' }, 'r')).toBeNull();
  });
});

describe('use the character sheet', () => {
  const char = { id: 'character', name: 'Character', category: 'character' as const, prompt: 'x' };
  it('saves the choice on the anchor and can turn it off', async () => {
    const p = await db.createProject('P');
    await db.replaceBlueprint(p.id, [char, { id: 'env', name: 'Env', category: 'environment', prompt: 'y' }], goodLedger());
    const st = useProjectStore.getState();
    await st.load(p.id);
    await st.setAnchorUseSheet('character', true);
    expect(useProjectStore.getState().anchors.find((a) => a.id === 'character')?.useSheet).toBe(true);
    expect(useProjectStore.getState().anchors.find((a) => a.id === 'env')?.useSheet).toBeUndefined();
    expect((await db.getAnchors(p.id)).find((a) => a.id === 'character')?.useSheet).toBe(true);
    await st.setAnchorUseSheet('character', false);
    expect((await db.getAnchors(p.id)).find((a) => a.id === 'character')?.useSheet).toBeUndefined();
    await st.setAnchorUseSheet('nope', true); // unknown anchors are ignored
    expect((await db.getAnchors(p.id)).some((a) => a.useSheet)).toBe(false);
  });

  it('keeps the choice for anchors with the same id when a new blueprint replaces the old', async () => {
    const p = await db.createProject('P');
    await db.replaceBlueprint(p.id, [char], goodLedger());
    const st = useProjectStore.getState();
    await st.load(p.id);
    await st.setAnchorUseSheet('character', true);
    await st.setBlueprint({ treatment, anchors: [char, { id: 'prop', name: 'Prop', category: 'prop', prompt: 'z' }], scenes: goodLedger() });
    const saved = await db.getAnchors(p.id);
    expect(saved.find((a) => a.id === 'character')?.useSheet).toBe(true);
    expect(saved.find((a) => a.id === 'prop')?.useSheet).toBeUndefined();
    await st.setBlueprint({ treatment, anchors: [{ ...char, id: 'someone_else' }], scenes: goodLedger() });
    expect((await db.getAnchors(p.id))[0].useSheet).toBeUndefined();
  });
});
