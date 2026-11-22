import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as db from '../../lib/db';
import { ApiError, ImageBlockedError } from '../../lib/api/errors';
import { useImageStore } from '../imageStore';
import { DEFAULT_SETTINGS } from '../../lib/settings';
import { useSettingsStore } from '../settingsStore';

const gen = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock('../../lib/api/gemini', async (orig) => ({ ...(await orig<typeof import('../../lib/api/gemini')>()), generateImage: (...a: unknown[]) => gen.fn(...a) }));
vi.mock('../../lib/image', async (orig) => ({
  ...(await orig<typeof import('../../lib/image')>()),
  imageDimensions: async () => ({ width: 1376, height: 768 }),
  prepareReference: async (b: Blob) => ({ mimeType: 'image/png', data: `ref:${await b.text()}` }),
}));

const ok = () => ({ blob: new Blob(['x'], { type: 'image/png' }), mimeType: 'image/png', text: '' });
const A = { id: 'character', prompt: 'keeper' };
const B = { id: 'environment_a', prompt: 'lighthouse' };
const C = { id: 'prop_lamp', prompt: 'lamp' };
const tick = (ms = 1) => new Promise((r) => setTimeout(r, ms));

beforeEach(async () => {
  await db._resetDbForTests();
  globalThis.indexedDB = new IDBFactory();
  gen.fn.mockReset();
  gen.fn.mockImplementation(async () => ok());
  useSettingsStore.setState({ geminiKey: 'GKEY', settings: DEFAULT_SETTINGS });
  useImageStore.setState({ projectId: null, images: [], jobs: {}, batch: null, frameBatch: null, usage: {} });
});

const setup = async () => {
  const p = await db.createProject();
  await useImageStore.getState().load(p.id);
  return p;
};

describe('imageStore', () => {
  it('loads a project\'s images and resets when switching project', async () => {
    const p1 = await setup();
    await useImageStore.getState().generateAnchor(p1.id, A, 'workhorse');
    expect(useImageStore.getState().images).toHaveLength(1);
    const p2 = await db.createProject();
    await useImageStore.getState().load(p2.id);
    expect(useImageStore.getState().images).toEqual([]);
    await useImageStore.getState().load(p1.id);
    expect(useImageStore.getState().images).toHaveLength(1);
  });

  it('generates with the chosen role\'s model and the stored key', async () => {
    const p = await setup();
    useSettingsStore.getState().updateSettings({ models: { hero: 'my-hero', workhorse: 'my-work' } });
    await useImageStore.getState().generateAnchor(p.id, A, 'hero');
    expect(gen.fn.mock.calls[0][0]).toMatchObject({ model: 'my-hero', apiKey: 'GKEY', aspectRatio: '16:9' });
    expect(useImageStore.getState().images[0].model).toBe('my-hero');
    expect(useImageStore.getState().jobs).toEqual({});
  });

  it('shows a running job while generating, then clears it', async () => {
    const p = await setup();
    let release!: () => void;
    gen.fn.mockImplementation(() => new Promise((res) => { release = () => res(ok()); }));
    const run = useImageStore.getState().generateAnchor(p.id, A, 'workhorse');
    await tick();
    expect(useImageStore.getState().jobs['anchor:character']).toEqual({ status: 'running' });
    release();
    await run;
    expect(useImageStore.getState().jobs['anchor:character']).toBeUndefined();
  });

  it.each([
    ['an API error', new ApiError('Gemini is overloaded', 503, 'x'), /overloaded/],
    ['a blocked prompt', new ImageBlockedError('Gemini blocked this prompt (SAFETY)', 'SAFETY'), /blocked this prompt/],
    ['an unexpected error', new Error('kaput'), /Something went wrong: kaput/],
  ])('records %s on the card and saves nothing', async (_n, err, re) => {
    const p = await setup();
    gen.fn.mockRejectedValue(err);
    await useImageStore.getState().generateAnchor(p.id, A, 'workhorse');
    const job = useImageStore.getState().jobs['anchor:character'];
    expect(job.status).toBe('error');
    expect((job as { message: string }).message).toMatch(re);
    expect(useImageStore.getState().images).toEqual([]);
  });

  it('cancelling a single job clears it without an error', async () => {
    const p = await setup();
    gen.fn.mockImplementation((req: { signal: AbortSignal }) => new Promise((_r, rej) => req.signal.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError')))));
    const run = useImageStore.getState().generateAnchor(p.id, A, 'workhorse');
    await tick();
    useImageStore.getState().cancelJob('anchor:character');
    await run;
    expect(useImageStore.getState().jobs).toEqual({});
    expect(useImageStore.getState().images).toEqual([]);
  });

  it('ignores a result that finishes after you switched to another project, but still saves it', async () => {
    const p1 = await setup();
    let release!: () => void;
    gen.fn.mockImplementation(() => new Promise((res) => { release = () => res(ok()); }));
    const run = useImageStore.getState().generateAnchor(p1.id, A, 'workhorse');
    await tick();
    const p2 = await db.createProject();
    await useImageStore.getState().load(p2.id);
    release();
    await run;
    expect(useImageStore.getState().images).toEqual([]); // the on-screen project is untouched
    expect(await db.listProjectImages(p1.id)).toHaveLength(1); // but the work wasn't lost
  });

  describe('generateMissing', () => {
    it('only generates anchors that have no image, at most two at a time', async () => {
      const p = await setup();
      await useImageStore.getState().generateAnchor(p.id, A, 'workhorse'); // A already has one
      gen.fn.mockClear();
      let live = 0;
      let peak = 0;
      gen.fn.mockImplementation(async () => { peak = Math.max(peak, ++live); await tick(5); live--; return ok(); });
      await useImageStore.getState().generateMissing(p.id, [A, B, C, { id: 'd', prompt: 'd' }, { id: 'e', prompt: 'e' }]);
      expect(gen.fn).toHaveBeenCalledTimes(4);
      expect(peak).toBe(2);
      expect(useImageStore.getState().images).toHaveLength(5);
      expect(useImageStore.getState().batch).toMatchObject({ total: 4, done: 4, failed: 0, running: false, cancelled: false });
    });

    it('counts failures and carries on', async () => {
      const p = await setup();
      let n = 0;
      gen.fn.mockImplementation(async () => { if (++n === 2) throw new ApiError('quota', 429, 'x'); return ok(); });
      await useImageStore.getState().generateMissing(p.id, [A, B, C]);
      expect(useImageStore.getState().batch).toMatchObject({ total: 3, done: 2, failed: 1, running: false });
      expect(Object.values(useImageStore.getState().jobs).filter((j) => j.status === 'error')).toHaveLength(1);
    });

    it('does nothing when every anchor already has an image', async () => {
      const p = await setup();
      await useImageStore.getState().generateAnchor(p.id, A, 'workhorse');
      gen.fn.mockClear();
      await useImageStore.getState().generateMissing(p.id, [A]);
      expect(gen.fn).not.toHaveBeenCalled();
      expect(useImageStore.getState().batch).toBeNull();
    });

    it('cancel stops the rest and does not count cancelled jobs as done', async () => {
      const p = await setup();
      gen.fn.mockImplementation((req: { signal: AbortSignal }) => new Promise((_r, rej) => req.signal.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError')))));
      const run = useImageStore.getState().generateMissing(p.id, [A, B, C]);
      await tick(5);
      useImageStore.getState().cancelBatch('batch');
      await run;
      expect(useImageStore.getState().batch).toMatchObject({ done: 0, failed: 0, running: false, cancelled: true });
      expect(gen.fn).toHaveBeenCalledTimes(2); // the third was never started
    });
  });

  describe('upload, promote, remove', () => {
    const file = (type = 'image/png') => new File([new Uint8Array(8)], 'x.png', { type });

    it('uploads as the newest version', async () => {
      const p = await setup();
      await useImageStore.getState().uploadAnchor(p.id, 'character', file());
      const [img] = useImageStore.getState().images;
      expect(img).toMatchObject({ source: 'uploaded', ownerKey: 'anchor:character' });
    });

    it('reports a bad upload on the card', async () => {
      const p = await setup();
      await useImageStore.getState().uploadAnchor(p.id, 'character', file('application/pdf'));
      expect((useImageStore.getState().jobs['anchor:character'] as { message: string }).message).toMatch(/PNG, JPEG or WebP/);
      expect(useImageStore.getState().images).toEqual([]);
    });

    it('promote swaps the current version; remove falls back to the previous one', async () => {
      const p = await setup();
      const s = useImageStore.getState();
      await s.generateAnchor(p.id, A, 'draft');
      await tick(3);
      await s.uploadAnchor(p.id, 'character', file());
      const newest = () => [...useImageStore.getState().images].sort((a, b) => b.createdAt - a.createdAt)[0];
      expect(newest().source).toBe('uploaded');
      const generated = useImageStore.getState().images.find((r) => r.source === 'generated')!;
      await s.promote(p.id, generated.id);
      expect(newest().id).toBe(generated.id);
      await s.removeCurrent(p.id, 'anchor:character');
      expect(useImageStore.getState().images).toHaveLength(1);
      expect(newest().source).toBe('uploaded');
    });
  });

  describe('scene frames', () => {
    const S1 = { scene: 1, keyframe_prompt: 'frame one', anchor_ids: ['character', 'environment_a'] };
    const S2 = { scene: 2, keyframe_prompt: 'frame two', anchor_ids: ['character'] };
    const S3 = { scene: 3, keyframe_prompt: 'frame three', anchor_ids: [] };
    const anchors = [{ id: 'character', name: 'Character' }, { id: 'environment_a', name: 'Environment A' }];

    it('sends the labelled anchor images that exist, with the scene prompt, and stores the frame by scene number', async () => {
      const p = await setup();
      await useImageStore.getState().generateAnchor(p.id, A, 'workhorse'); // character image
      gen.fn.mockClear();
      await useImageStore.getState().generateFrame(p.id, S1, anchors, 'workhorse');
      const req = gen.fn.mock.calls[0][0] as { references: { label: string; data: string }[]; prompt: string; model: string };
      expect(req.references).toHaveLength(1); // environment_a has no image yet
      expect(req.references[0].label).toBe('Character');
      expect(req.references[0].data).toMatch(/^ref:/);
      expect(req.prompt).toMatch(/^frame one/);
      const frame = useImageStore.getState().images.find((r) => r.ownerKey === 'scene:1')!;
      expect(frame).toMatchObject({ kind: 'keyframe', prompt: 'frame one' });
      expect(frame.refImageIds).toHaveLength(1);
    });

    it('respects the per-scene reference cap from Settings', async () => {
      const p = await setup();
      for (const a of [A, B, C]) await useImageStore.getState().generateAnchor(p.id, a, 'workhorse');
      useSettingsStore.getState().updateSettings({ maxAnchorsPerScene: 2 });
      gen.fn.mockClear();
      const scene = { scene: 1, keyframe_prompt: 'f', anchor_ids: ['character', 'environment_a', 'prop_lamp'] };
      const all = [{ id: 'character', name: 'Character' }, { id: 'environment_a', name: 'Env' }, { id: 'prop_lamp', name: 'Lamp' }];
      await useImageStore.getState().generateFrame(p.id, scene, all, 'workhorse');
      expect((gen.fn.mock.calls[0][0] as { references: { label: string }[] }).references.map((r) => r.label)).toEqual(['Character', 'Env']);
    });

    it('uses the model for the chosen role and shows errors on the scene\'s card', async () => {
      const p = await setup();
      useSettingsStore.getState().updateSettings({ models: { hero: 'hero-x' } });
      await useImageStore.getState().generateFrame(p.id, S3, anchors, 'hero');
      expect((gen.fn.mock.calls[0][0] as { model: string }).model).toBe('hero-x');
      gen.fn.mockRejectedValue(new ApiError('Gemini is overloaded', 503, 'x'));
      await useImageStore.getState().generateFrame(p.id, S2, anchors, 'workhorse');
      expect((useImageStore.getState().jobs['scene:2'] as { message: string }).message).toMatch(/overloaded/);
    });

    it('batch renders the given scenes two at a time and counts them', async () => {
      const p = await setup();
      let live = 0;
      let peak = 0;
      gen.fn.mockImplementation(async () => { peak = Math.max(peak, ++live); await tick(5); live--; return ok(); });
      await useImageStore.getState().generateFrames(p.id, [S1, S2, S3], anchors);
      expect(peak).toBe(2);
      expect(useImageStore.getState().frameBatch).toMatchObject({ total: 3, done: 3, failed: 0, running: false });
      expect(useImageStore.getState().batch).toBeNull(); // the anchor batch is untouched
      expect(useImageStore.getState().images.filter((r) => r.kind === 'keyframe')).toHaveLength(3);
    });

    it('a frame batch and an anchor batch run and cancel independently', async () => {
      const p = await setup();
      gen.fn.mockImplementation((req: { signal: AbortSignal }) => new Promise((res, rej) => {
        const t = setTimeout(() => res(ok()), 30);
        req.signal.addEventListener('abort', () => { clearTimeout(t); rej(new DOMException('Aborted', 'AbortError')); });
      }));
      const anchorsRun = useImageStore.getState().generateMissing(p.id, [A, B]);
      const framesRun = useImageStore.getState().generateFrames(p.id, [S1, S2], anchors);
      await tick(5);
      useImageStore.getState().cancelBatch('frameBatch');
      await Promise.all([anchorsRun, framesRun]);
      expect(useImageStore.getState().frameBatch).toMatchObject({ done: 0, cancelled: true, running: false });
      expect(useImageStore.getState().batch).toMatchObject({ done: 2, cancelled: false, running: false });
    });

    it('frames made later in a batch see anchor images made earlier', async () => {
      const p = await setup();
      gen.fn.mockClear();
      await useImageStore.getState().generateAnchor(p.id, A, 'workhorse');
      await useImageStore.getState().generateFrames(p.id, [S2], anchors);
      const frameCall = gen.fn.mock.calls.find((c) => ((c[0] as { references?: unknown[] }).references?.length ?? 0) > 0);
      expect(frameCall).toBeDefined();
    });

    it('skips scenes that are already generating', async () => {
      const p = await setup();
      let release!: () => void;
      gen.fn.mockImplementation(() => new Promise((res) => { release = () => res(ok()); }));
      const first = useImageStore.getState().generateFrame(p.id, S1, anchors, 'workhorse');
      await tick();
      gen.fn.mockClear();
      await useImageStore.getState().generateFrames(p.id, [S1], anchors);
      expect(gen.fn).not.toHaveBeenCalled();
      release();
      await first;
    });
  });

  describe('draft mode', () => {
    const S1 = { scene: 1, keyframe_prompt: 'f1', anchor_ids: [] as string[] };
    const S2 = { scene: 2, keyframe_prompt: 'f2', anchor_ids: [] as string[] };
    const modelOf = (i = 0) => (gen.fn.mock.calls[i][0] as { model: string }).model;
    beforeEach(() => useSettingsStore.getState().updateSettings({ draftMode: true, models: { workhorse: 'work-m', hero: 'hero-m', draft: 'draft-m' } }));

    it('turns a Workhorse anchor into a Draft one, but honours an explicit Hero', async () => {
      const p = await setup();
      await useImageStore.getState().generateAnchor(p.id, A, 'workhorse');
      await useImageStore.getState().generateAnchor(p.id, B, 'hero');
      expect(modelOf(0)).toBe('draft-m');
      expect(modelOf(1)).toBe('hero-m');
      expect(useImageStore.getState().images.find((r) => r.ownerKey === 'anchor:character')!.model).toBe('draft-m');
    });

    it('applies to frames and to both kinds of batch', async () => {
      const p = await setup();
      await useImageStore.getState().generateFrame(p.id, S1, [], 'workhorse');
      await useImageStore.getState().generateFrames(p.id, [S2], []);
      await useImageStore.getState().generateMissing(p.id, [A]);
      expect([modelOf(0), modelOf(1), modelOf(2)]).toEqual(['draft-m', 'draft-m', 'draft-m']);
    });

    it('does nothing special when off', async () => {
      const p = await setup();
      useSettingsStore.getState().updateSettings({ draftMode: false });
      await useImageStore.getState().generateAnchor(p.id, A, 'workhorse');
      expect(modelOf(0)).toBe('work-m');
    });
  });

  describe('usage counter', () => {
    it('counts each saved image under the model that made it, and not failures or cancels', async () => {
      const p = await setup();
      useSettingsStore.getState().updateSettings({ models: { workhorse: 'work-m', hero: 'hero-m' } });
      await useImageStore.getState().generateAnchor(p.id, A, 'workhorse');
      await useImageStore.getState().generateAnchor(p.id, B, 'workhorse');
      await useImageStore.getState().generateAnchor(p.id, A, 'hero');
      gen.fn.mockRejectedValueOnce(new ApiError('quota', 429, 'x'));
      await useImageStore.getState().generateAnchor(p.id, C, 'hero');
      expect(useImageStore.getState().usage).toEqual({ 'work-m': 2, 'hero-m': 1 });
    });

    it('survives switching projects (it is per session, not per project)', async () => {
      const p1 = await setup();
      await useImageStore.getState().generateAnchor(p1.id, A, 'workhorse');
      const p2 = await db.createProject();
      await useImageStore.getState().load(p2.id);
      expect(Object.values(useImageStore.getState().usage).reduce((a, b) => a + b, 0)).toBe(1);
    });
  });

  describe('error kinds and retrying', () => {
    it('marks a blocked or text reply as "blocked", an API failure as "error", a bad upload as "upload"', async () => {
      const p = await setup();
      gen.fn.mockRejectedValueOnce(new ImageBlockedError('Gemini blocked this prompt (SAFETY)', 'SAFETY'));
      await useImageStore.getState().generateAnchor(p.id, A, 'workhorse');
      gen.fn.mockRejectedValueOnce(new ApiError('overloaded', 503, 'x'));
      await useImageStore.getState().generateAnchor(p.id, B, 'workhorse');
      await useImageStore.getState().uploadAnchor(p.id, 'prop_lamp', new File([new Uint8Array(4)], 'x.pdf', { type: 'application/pdf' }));
      const kind = (o: string) => (useImageStore.getState().jobs[o] as { kind: string }).kind;
      expect([kind('anchor:character'), kind('anchor:environment_a'), kind('anchor:prop_lamp')]).toEqual(['blocked', 'error', 'upload']);
    });

    it('generateAnchors retries exactly the anchors given, and a success clears the error', async () => {
      const p = await setup();
      gen.fn.mockRejectedValueOnce(new ApiError('overloaded', 503, 'x'));
      await useImageStore.getState().generateAnchors(p.id, [A, B]);
      expect(useImageStore.getState().batch).toMatchObject({ total: 2, done: 1, failed: 1 });
      const failed = Object.entries(useImageStore.getState().jobs).filter(([, j]) => j.status === 'error').map(([k]) => k);
      expect(failed).toHaveLength(1);
      gen.fn.mockClear();
      await useImageStore.getState().generateAnchors(p.id, [failed[0] === 'anchor:character' ? A : B]);
      expect(gen.fn).toHaveBeenCalledTimes(1);
      expect(useImageStore.getState().jobs).toEqual({});
      expect(useImageStore.getState().images).toHaveLength(2);
    });

    it('generateAnchors skips anchors already generating', async () => {
      const p = await setup();
      let release!: () => void;
      gen.fn.mockImplementation(() => new Promise((res) => { release = () => res(ok()); }));
      const first = useImageStore.getState().generateAnchor(p.id, A, 'workhorse');
      await tick();
      gen.fn.mockClear();
      await useImageStore.getState().generateAnchors(p.id, [A]);
      expect(gen.fn).not.toHaveBeenCalled();
      release();
      await first;
    });
  });
});
