import { beforeEach, describe, expect, it } from 'vitest';
import { anchorLightbox, sceneLightbox, type LightboxItem } from '../lightboxItems';
import { useLightboxStore } from '../../store/lightboxStore';
import { scene } from '../ledger/__tests__/helpers';
import type { ImageRecord } from '../../types/project';

const rec = (ownerKey: ImageRecord['ownerKey'], createdAt: number, over: Partial<ImageRecord> = {}): ImageRecord => ({
  id: `${ownerKey}@${createdAt}`, projectId: 'p', ownerKey, kind: 'anchor', blob: new Blob(['x']), mime: 'image/png',
  width: 1376, height: 768, model: 'gemini-x', prompt: 'p', source: 'generated', createdAt, ...over,
});

describe('lightbox items', () => {
  it('anchors: only those with an image, newest version, focus index by anchor id', () => {
    const anchors = [{ id: 'a', name: 'Character' }, { id: 'b', name: 'Env' }, { id: 'c', name: 'Prop' }];
    const images = [rec('anchor:a', 1), rec('anchor:a', 7), rec('anchor:c', 2, { source: 'uploaded', model: null })];
    const { items, index } = anchorLightbox(anchors, images, 'c');
    expect(items.map((i) => i.title)).toEqual(['Character', 'Prop']);
    expect(items[0].id).toBe('anchor:a@7');
    expect(items[1].caption).toBe('Uploaded · 1376×768');
    expect(index).toBe(1);
  });

  it('scenes: ordered by scene number with timestamps in the caption', () => {
    const scenes = [scene(3, 24, 36, { section: 'Chorus' }), scene(1, 0, 12, { section: 'Intro' })];
    const images = [rec('scene:3', 1, { kind: 'keyframe' }), rec('scene:1', 1, { kind: 'keyframe' })];
    const { items, index } = sceneLightbox(scenes, images, 3);
    expect(items.map((i) => i.title)).toEqual(['Scene 01: Intro', 'Scene 03: Chorus']);
    expect(items[1].caption).toBe('00:24 – 00:36 · gemini-x · 1376×768');
    expect(index).toBe(1);
  });

  it('defaults the focus to the first item and handles no images', () => {
    expect(anchorLightbox([{ id: 'a', name: 'A' }], [rec('anchor:a', 1)]).index).toBe(0);
    expect(sceneLightbox([scene(1, 0, 12)], []).items).toEqual([]);
  });
});

describe('lightbox store', () => {
  const items = (n: number): LightboxItem[] => Array.from({ length: n }, (_, i) => ({ id: `i${i}`, blob: new Blob(['x']), title: `T${i}`, caption: '' }));
  beforeEach(() => useLightboxStore.getState().close());

  it('opens at an index, clamped, and closes', () => {
    const s = useLightboxStore.getState();
    s.open(items(3), 2);
    expect(useLightboxStore.getState().index).toBe(2);
    s.open(items(3), 99);
    expect(useLightboxStore.getState().index).toBe(2);
    s.open(items(3), -5);
    expect(useLightboxStore.getState().index).toBe(0);
    s.close();
    expect(useLightboxStore.getState()).toMatchObject({ index: null, items: [] });
  });

  it('does not open with nothing to show', () => {
    useLightboxStore.getState().open([], 0);
    expect(useLightboxStore.getState().index).toBeNull();
  });

  it('wraps around in both directions', () => {
    const s = useLightboxStore.getState();
    s.open(items(3), 2);
    s.next();
    expect(useLightboxStore.getState().index).toBe(0);
    s.prev();
    expect(useLightboxStore.getState().index).toBe(2);
  });

  it('ignores navigation with a single image or while closed', () => {
    const s = useLightboxStore.getState();
    s.next();
    expect(useLightboxStore.getState().index).toBeNull();
    s.open(items(1), 0);
    s.next();
    s.prev();
    expect(useLightboxStore.getState().index).toBe(0);
  });
});
