import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../api/errors';
import * as db from '../db';
import { _resetPreparedCacheForTests, generateSceneFrame, pickReferences, refsChanged, scenesNeedingFrames, type SceneRef } from '../sceneImages';
import { anchorOwner, sceneOwner, type ImageOwner, type ImageRecord } from '../../types/project';

beforeEach(async () => {
  await db._resetDbForTests();
  globalThis.indexedDB = new IDBFactory();
  _resetPreparedCacheForTests();
});

const anchors = [
  { id: 'character', name: 'Character' },
  { id: 'environment_a', name: 'Environment A' },
  { id: 'prop_lamp', name: 'Prop: Lamp' },
  { id: 'prop_phone', name: 'Prop: Telephone' },
];
const rec = (owner: ImageOwner, createdAt: number, over: Partial<ImageRecord> = {}): ImageRecord => ({
  id: `${owner}@${createdAt}`, projectId: 'p', ownerKey: owner, kind: owner.startsWith('anchor') ? 'anchor' : 'keyframe',
  blob: new Blob([owner], { type: 'image/png' }), mime: 'image/png', width: 16, height: 9, model: 'm', prompt: 'p', source: 'generated', createdAt, ...over,
});
const scene = (n: number, ids: string[], prompt = 'a frame'): SceneRef => ({ scene: n, keyframe_prompt: prompt, anchor_ids: ids });

describe('pickReferences', () => {
  const all = [rec(anchorOwner('character'), 1), rec(anchorOwner('environment_a'), 1), rec(anchorOwner('prop_lamp'), 1), rec(anchorOwner('prop_phone'), 1)];

  it('uses the scene\'s anchors in the scene\'s own order', () => {
    const r = pickReferences(scene(1, ['environment_a', 'character']), anchors, all, 3);
    expect(r.used.map((u) => u.anchor.id)).toEqual(['environment_a', 'character']);
  });

  it('takes the newest image per anchor', () => {
    const imgs = [rec(anchorOwner('character'), 1), rec(anchorOwner('character'), 9)];
    expect(pickReferences(scene(1, ['character']), anchors, imgs, 3).used[0].image.createdAt).toBe(9);
  });

  it('caps at the limit and reports the rest as dropped', () => {
    const r = pickReferences(scene(1, ['character', 'environment_a', 'prop_lamp', 'prop_phone']), anchors, all, 3);
    expect(r.used.map((u) => u.anchor.id)).toEqual(['character', 'environment_a', 'prop_lamp']);
    expect(r.dropped.map((a) => a.id)).toEqual(['prop_phone']);
  });

  it('skips anchors with no image (they are reported, and do not use up the cap)', () => {
    const imgs = [rec(anchorOwner('environment_a'), 1), rec(anchorOwner('prop_lamp'), 1)];
    const r = pickReferences(scene(1, ['character', 'environment_a', 'prop_lamp']), anchors, imgs, 2);
    expect(r.missing.map((a) => a.id)).toEqual(['character']);
    expect(r.used.map((u) => u.anchor.id)).toEqual(['environment_a', 'prop_lamp']);
    expect(r.dropped).toEqual([]);
  });

  it('reports unknown ids and ignores duplicates', () => {
    const r = pickReferences(scene(1, ['character', 'character', 'ghost']), anchors, all, 3);
    expect(r.used).toHaveLength(1);
    expect(r.unknown).toEqual(['ghost']);
  });

  it('handles a scene with no usable anchors', () => {
    expect(pickReferences(scene(1, []), anchors, [], 3)).toEqual({ used: [], missing: [], dropped: [], unknown: [] });
  });
});

describe('generateSceneFrame', () => {
  const dims = async () => ({ width: 1376, height: 768 });
  const refs = [
    { anchor: anchors[0], image: rec(anchorOwner('character'), 5) },
    { anchor: anchors[1], image: rec(anchorOwner('environment_a'), 6) },
  ];
  const prepare = vi.fn(async (b: Blob) => ({ mimeType: 'image/jpeg', data: `B64(${await b.text()})` }));
  const gen = () => vi.fn(async () => ({ blob: new Blob(['frame'], { type: 'image/png' }), mimeType: 'image/png', text: '' }));

  it('sends the prepared anchor images, labelled with the anchor names, in order, with the scene prompt', async () => {
    const g = gen();
    await generateSceneFrame({ projectId: 'p', scene: scene(3, []), refs, model: 'mod', apiKey: 'K', generate: g as never, dims, prepare });
    const call = (g.mock.calls[0] as unknown[])[0] as { references: unknown[]; prompt: string; aspectRatio: string; model: string; apiKey: string };
    expect(call.references).toEqual([
      { label: 'Character', mimeType: 'image/jpeg', data: 'B64(anchor:character)' },
      { label: 'Environment A', mimeType: 'image/jpeg', data: 'B64(anchor:environment_a)' },
    ]);
    expect(call).toMatchObject({ aspectRatio: '16:9', model: 'mod', apiKey: 'K' });
    expect(call.prompt).toMatch(/^a frame\n\n.*storyboard frame.*consistent with the reference images above/s);
  });

  it('omits the reference wording when there are none', async () => {
    const g = gen();
    await generateSceneFrame({ projectId: 'p', scene: scene(3, []), refs: [], model: 'm', apiKey: 'K', generate: g as never, dims, prepare });
    const call = (g.mock.calls[0] as unknown[])[0] as { references: unknown[]; prompt: string };
    expect(call.references).toEqual([]);
    expect(call.prompt).not.toMatch(/reference images/);
  });

  it('stores a keyframe owned by the scene, recording the prompt and exactly which anchor images were used', async () => {
    const p = await db.createProject();
    const r = await generateSceneFrame({ projectId: p.id, scene: scene(3, [], 'a lamp at dusk'), refs, model: 'mod', apiKey: 'K', generate: gen() as never, dims, prepare });
    expect(r).toMatchObject({ projectId: p.id, ownerKey: 'scene:3', kind: 'keyframe', prompt: 'a lamp at dusk', model: 'mod', source: 'generated', width: 1376 });
    expect(r.refImageIds).toEqual(refs.map((x) => x.image.id));
    expect((await db.listImages(p.id, sceneOwner(3)))).toHaveLength(1);
  });

  it('prepares each anchor image only once, however many frames use it', async () => {
    const p = vi.fn(async (b: Blob) => ({ mimeType: 'image/png', data: await b.text() }));
    const project = await db.createProject();
    for (let n = 1; n <= 3; n++) await generateSceneFrame({ projectId: project.id, scene: scene(n, []), refs, model: 'm', apiKey: 'K', generate: gen() as never, dims, prepare: p });
    expect(p).toHaveBeenCalledTimes(2);
  });

  it('retries preparation after a failure instead of caching the error', async () => {
    const flaky = vi.fn().mockRejectedValueOnce(new Error('decode')).mockResolvedValue({ mimeType: 'image/png', data: 'ok' });
    const project = await db.createProject();
    const one = [refs[0]];
    await expect(generateSceneFrame({ projectId: project.id, scene: scene(1, []), refs: one, model: 'm', apiKey: 'K', generate: gen() as never, dims, prepare: flaky })).rejects.toThrow('decode');
    await expect(generateSceneFrame({ projectId: project.id, scene: scene(1, []), refs: one, model: 'm', apiKey: 'K', generate: gen() as never, dims, prepare: flaky })).resolves.toBeDefined();
  });

  it('saves nothing if generation fails', async () => {
    const p = await db.createProject();
    const bad = vi.fn(async () => { throw new ApiError('quota', 429, 'x'); });
    await expect(generateSceneFrame({ projectId: p.id, scene: scene(1, []), refs, model: 'm', apiKey: 'K', generate: bad as never, dims, prepare })).rejects.toThrow('quota');
    expect(await db.listProjectImages(p.id)).toEqual([]);
  });
});

describe('outdated frames and batches', () => {
  const char = rec(anchorOwner('character'), 5);
  const env = rec(anchorOwner('environment_a'), 6);
  const imgs = (extra: ImageRecord[] = []) => [char, env, ...extra];

  it('refsChanged is false when the same anchor images are still current, in any order', () => {
    const frame = rec(sceneOwner(1), 9, { refImageIds: [env.id, char.id] });
    expect(refsChanged(frame, [{ anchor: anchors[0], image: char }, { anchor: anchors[1], image: env }])).toBe(false);
  });

  it('refsChanged is true after an anchor is regenerated, or when the set changes', () => {
    const frame = rec(sceneOwner(1), 9, { refImageIds: [char.id, env.id] });
    const newChar = rec(anchorOwner('character'), 50);
    expect(refsChanged(frame, [{ anchor: anchors[0], image: newChar }, { anchor: anchors[1], image: env }])).toBe(true);
    expect(refsChanged(frame, [{ anchor: anchors[0], image: char }])).toBe(true);
  });

  it('refsChanged ignores uploads, frames without a record of references, and missing frames', () => {
    const used = [{ anchor: anchors[0], image: rec(anchorOwner('character'), 77) }];
    expect(refsChanged(rec(sceneOwner(1), 9, { source: 'uploaded', refImageIds: ['x'] }), used)).toBe(false);
    expect(refsChanged(rec(sceneOwner(1), 9), used)).toBe(false);
    expect(refsChanged(undefined, used)).toBe(false);
  });

  const scenes = [scene(1, ['character']), scene(2, ['character', 'environment_a']), scene(3, ['environment_a'])];

  it('missing mode picks scenes without any frame', () => {
    const frames = [rec(sceneOwner(2), 9, { prompt: 'a frame', refImageIds: [char.id, env.id] })];
    expect(scenesNeedingFrames(scenes, anchors, imgs(frames), 3, 'missing').map((s) => s.scene)).toEqual([1, 3]);
  });

  it('outdated mode picks frames whose prompt or references changed, never scenes without a frame', () => {
    const frames = [
      rec(sceneOwner(1), 9, { prompt: 'a frame', refImageIds: [char.id] }), // fine
      rec(sceneOwner(2), 9, { prompt: 'OLD prompt', refImageIds: [char.id, env.id] }), // prompt changed
      // scene 3 has no frame
    ];
    expect(scenesNeedingFrames(scenes, anchors, imgs(frames), 3, 'outdated').map((s) => s.scene)).toEqual([2]);
    const refsOnly = [rec(sceneOwner(1), 9, { prompt: 'a frame', refImageIds: ['old-image-id'] })];
    expect(scenesNeedingFrames(scenes, anchors, imgs(refsOnly), 3, 'outdated').map((s) => s.scene)).toEqual([1]);
  });

  it('an uploaded frame is never reported as outdated', () => {
    const frames = [rec(sceneOwner(1), 9, { source: 'uploaded', prompt: null, model: null })];
    expect(scenesNeedingFrames(scenes, anchors, imgs(frames), 3, 'outdated')).toEqual([]);
  });
});
