import { IDBFactory } from 'fake-indexeddb';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { characterSheetPrompt } from '../../prompts/imagePrompts';
import { anchorOwner, sheetOwner, type ImageRecord } from '../../types/project';
import { ApiError } from '../api/errors';
import type { GeneratedImage, GenerateImageRequest } from '../api/gemini';
import * as db from '../db';
import { generateCharacterSheet, sheetOutdated } from '../characterSheet';
import { _resetPreparedCacheForTests, generateSceneFrame, pickReferences, refsChanged } from '../sceneImages';

beforeEach(async () => {
  await db._resetDbForTests();
  globalThis.indexedDB = new IDBFactory();
  _resetPreparedCacheForTests();
});

const png = (s: string) => new Blob([s], { type: 'image/png' });
const anchorImg = (createdAt = 1, over: Partial<ImageRecord> = {}): ImageRecord => ({ id: `a@${createdAt}`, projectId: 'p', ownerKey: anchorOwner('barker'), kind: 'anchor', blob: png('ANCHOR'), mime: 'image/png', width: 1376, height: 768, model: 'm', prompt: 'p', source: 'generated', createdAt, ...over });
const sheetImg = (createdAt: number, over: Partial<ImageRecord> = {}): ImageRecord => ({ id: `s@${createdAt}`, projectId: 'p', ownerKey: sheetOwner('barker'), kind: 'sheet', blob: png('SHEET'), mime: 'image/png', width: 2000, height: 1116, model: 'm', prompt: 'sp', source: 'generated', refImageIds: ['a@1'], createdAt, ...over });
const prep = async (b: Blob) => ({ mimeType: 'image/png', data: `ref:${await b.text()}` });
const dims = async () => ({ width: 1376, height: 768 });
type Gen = (r: GenerateImageRequest) => Promise<GeneratedImage>;

describe('characterSheetPrompt', () => {
  it('has no text on the sheet by default, and says so', () => {
    const p = characterSheetPrompt({ name: 'Barker' });
    expect(p).toMatch(/NO TEXT/);
    expect(p).not.toMatch(/BARKER|swatch(es)? with|ABOVE THE PANELS/);
    expect(p).toMatch(/four panels/i);
    expect(p).toMatch(/reference image provided/);
  });
  it('adds the name heading and a swatch strip only when labels are on', () => {
    const p = characterSheetPrompt({ name: 'Barker', labels: true });
    expect(p).toContain('"BARKER"');
    expect(p).toMatch(/BELOW THE PANELS: a strip of five colour swatches/);
    expect(p).not.toMatch(/NO TEXT/);
  });
  it('carries the fixes for drift seen in practice: invented parts, near-black, age, small ornaments', () => {
    const p = characterSheetPrompt({ name: 'X' });
    expect(p).toMatch(/does not show part of the character/);
    expect(p).toMatch(/black item stays black/);
    expect(p).toMatch(/Do not add wrinkles/);
    expect(p).toMatch(/pin, badge and ornament/);
  });
});

describe('generateCharacterSheet', () => {
  const base = (generate: Gen, over = {}) => ({ projectId: 'p', anchor: { id: 'barker', name: 'Barker' }, source: anchorImg(), model: 'gemini-x', apiKey: 'K', generate, dims, prepare: prep, ...over });
  const ok = () => vi.fn<Gen>(async () => ({ blob: png('GENERATED'), mimeType: 'image/png', text: '' }));

  it('sends the anchor image as the labelled reference, 16:9, with the sheet prompt', async () => {
    const g = ok();
    await generateCharacterSheet(base(g));
    const req = g.mock.calls[0][0];
    expect(req.references).toEqual([{ label: 'Barker', mimeType: 'image/png', data: 'ref:ANCHOR' }]);
    expect(req.aspectRatio).toBe('16:9');
    expect(req.imageSize).toBeUndefined();
    expect(req.prompt).toBe(characterSheetPrompt({ name: 'Barker', labels: false }));
    await generateCharacterSheet(base(g, { labels: true }));
    expect(g.mock.calls[1][0].prompt).toContain('"BARKER"');
  });

  it('saves a sheet owned by the anchor and never touches the anchor image', async () => {
    const p = await db.createProject();
    const src = anchorImg(1, { projectId: p.id });
    await db.putImage(src);
    const rec = await generateCharacterSheet(base(ok(), { projectId: p.id, source: src }));
    expect(rec).toMatchObject({ kind: 'sheet', ownerKey: 'sheet:barker', source: 'generated', refImageIds: [src.id], model: 'gemini-x', width: 1376 });
    const all = await db.listProjectImages(p.id);
    expect(all.map((i) => i.ownerKey).sort()).toEqual(['anchor:barker', 'sheet:barker']);
    expect((await db.listImages(p.id, anchorOwner('barker')))[0].id).toBe(src.id);
  });

  it('keeps the newest three sheets', async () => {
    const p = await db.createProject();
    const src = anchorImg(1, { projectId: p.id });
    await db.putImage(src);
    for (let i = 0; i < 5; i++) await generateCharacterSheet(base(ok(), { projectId: p.id, source: src }));
    expect(await db.listImages(p.id, sheetOwner('barker'))).toHaveLength(3);
  });

  it('saves nothing when generation fails', async () => {
    const p = await db.createProject();
    const g = vi.fn<Gen>(async () => { throw new ApiError('nope', 500, 'x'); });
    await expect(generateCharacterSheet(base(g, { projectId: p.id }))).rejects.toThrow('nope');
    expect(await db.listProjectImages(p.id)).toEqual([]);
  });

  it('flags a sheet whose anchor image has since changed', () => {
    expect(sheetOutdated(sheetImg(5), anchorImg(1))).toBe(false);
    expect(sheetOutdated(sheetImg(5), anchorImg(9))).toBe(true);
    expect(sheetOutdated(undefined, anchorImg(1))).toBe(false);
    expect(sheetOutdated(sheetImg(5, { refImageIds: undefined }), anchorImg(9))).toBe(false);
  });
});

describe('storyboard frames and the character sheet', () => {
  const anchors = [{ id: 'barker', name: 'Barker' }, { id: 'tent', name: 'Tent' }];
  const scene = { anchor_ids: ['barker', 'tent'] };
  const tentImg = { ...anchorImg(1), id: 't@1', ownerKey: anchorOwner('tent') } as ImageRecord;
  const all = [anchorImg(1), sheetImg(2), tentImg];

  it('uses the anchor image by default, even if a sheet exists', () => {
    const r = pickReferences(scene, anchors, all, 3);
    expect(r.used.map((u) => [u.anchor.id, u.image.id, !!u.viaSheet])).toEqual([['barker', 'a@1', false], ['tent', 't@1', false]]);
  });

  it('uses the sheet instead of the anchor image when the anchor opts in', () => {
    const r = pickReferences(scene, [{ ...anchors[0], useSheet: true }, anchors[1]], all, 3);
    expect(r.used.map((u) => [u.anchor.id, u.image.id, !!u.viaSheet])).toEqual([['barker', 's@2', true], ['tent', 't@1', false]]);
  });

  it('takes the newest sheet, and falls back to the anchor image when there is no sheet', () => {
    const r = pickReferences(scene, [{ ...anchors[0], useSheet: true }, anchors[1]], [...all, sheetImg(9, { id: 's@9' })], 3);
    expect(r.used[0].image.id).toBe('s@9');
    const none = pickReferences(scene, [{ ...anchors[0], useSheet: true }], [anchorImg(1)], 3);
    expect(none.used[0]).toMatchObject({ image: { id: 'a@1' } });
    expect(none.used[0].viaSheet).toBeUndefined();
  });

  it('counts a sheet as one reference against the cap, and never uses a sheet for an anchor with no image of its own', () => {
    expect(pickReferences({ anchor_ids: ['barker', 'tent'] }, [{ ...anchors[0], useSheet: true }, anchors[1]], all, 1).dropped.map((a) => a.id)).toEqual(['tent']);
    const onlySheet = pickReferences({ anchor_ids: ['barker'] }, [{ ...anchors[0], useSheet: true }], [sheetImg(2)], 3);
    expect(onlySheet.used).toHaveLength(1); // a sheet alone is still a usable reference
  });

  it('flags existing frames as outdated when the choice is switched, because the reference image changes', () => {
    const before = pickReferences(scene, anchors, all, 3).used;
    const frame = { ...anchorImg(5), kind: 'keyframe', ownerKey: 'scene:1', refImageIds: before.map((u) => u.image.id) } as ImageRecord;
    expect(refsChanged(frame, before)).toBe(false);
    expect(refsChanged(frame, pickReferences(scene, [{ ...anchors[0], useSheet: true }, anchors[1]], all, 3).used)).toBe(true);
  });

  it('labels a sheet reference so the model knows it shows several views, and records the sheet id', async () => {
    const p = await db.createProject();
    const g = vi.fn<Gen>(async () => ({ blob: png('F'), mimeType: 'image/png', text: '' }));
    const used = pickReferences(scene, [{ ...anchors[0], useSheet: true }, anchors[1]], all, 3).used;
    const rec = await generateSceneFrame({ projectId: p.id, scene: { scene: 1, keyframe_prompt: 'k', anchor_ids: scene.anchor_ids }, refs: used, model: 'm', apiKey: 'K', generate: g, dims, prepare: prep });
    const refs = g.mock.calls[0][0].references!;
    expect(refs[0].label).toBe('Barker (character sheet: front, side, back and face views of the same character)');
    expect(refs[0].data).toBe('ref:SHEET');
    expect(refs[1].label).toBe('Tent');
    expect(rec.refImageIds).toEqual(['s@2', 't@1']);
  });
});
