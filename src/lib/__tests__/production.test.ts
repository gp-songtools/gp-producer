import { describe, expect, it } from 'vitest';
import { anchorDownloadName, extensionMarkText, extensionTarget, isDeckKey, neighbours, resolveScene } from '../production';

const scenes = [{ scene: 3 }, { scene: 1 }, { scene: 2 }];

describe('resolveScene', () => {
  it('finds the numbered scene', () => expect(resolveScene(scenes, '2')?.scene).toBe(2));
  it('falls back to the first scene for missing, junk or unknown numbers', () => {
    for (const p of [undefined, '', 'abc', '2x', '-1', '99']) expect(resolveScene(scenes, p)?.scene).toBe(1);
  });
  it('is null with no scenes', () => expect(resolveScene([], '1')).toBeNull());
});

describe('neighbours', () => {
  it('walks in scene order and stops at the ends', () => {
    expect(neighbours(scenes, 1)).toEqual({ prev: null, next: 2 });
    expect(neighbours(scenes, 2)).toEqual({ prev: 1, next: 3 });
    expect(neighbours(scenes, 3)).toEqual({ prev: 2, next: null });
  });
});

describe('extension target', () => {
  const s = { start_sec: 62, base_sec: 10, extension_sec: 4, end_sec: 76 };
  it('marks where the base clip ends and where the extension must reach', () => {
    expect(extensionTarget(s)).toMatchObject({ baseEnd: 72, target: 76, baseEndLabel: '01:12', targetLabel: '01:16' });
    expect(extensionMarkText(s)).toBe('Extend +4s: 01:12 to 01:16');
  });
  it('is null for a base-only scene', () => {
    const base = { ...s, extension_sec: null as unknown as number, end_sec: 72 };
    expect(extensionTarget(base)).toBeNull();
    expect(extensionMarkText(base)).toBe('');
  });
});

describe('anchorDownloadName', () => {
  it('slugs the name and uses the image type', () => {
    expect(anchorDownloadName('Lead Singer (night)', { mime: 'image/jpeg' })).toBe('LeadSingernight_ref.jpg');
    expect(anchorDownloadName('Café', { mime: 'image/png' })).toBe('Caf_ref.png');
  });
});

describe('isDeckKey', () => {
  const k = (key: string, tagName = 'BODY', mods = {}) => ({ key, target: { tagName } as unknown as EventTarget, ctrlKey: false, metaKey: false, altKey: false, ...mods });
  it('accepts arrows on the page', () => expect(isDeckKey(k('ArrowRight'))).toBe(true));
  it('ignores other keys, fields and modified arrows', () => {
    expect(isDeckKey(k('a'))).toBe(false);
    expect(isDeckKey(k('ArrowLeft', 'TEXTAREA'))).toBe(false);
    expect(isDeckKey(k('ArrowLeft', 'SELECT'))).toBe(false);
    expect(isDeckKey(k('ArrowLeft', 'BODY', { altKey: true }))).toBe(false);
  });
});
