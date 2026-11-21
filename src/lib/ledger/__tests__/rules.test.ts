import { describe, expect, it } from 'vitest';
import { buildFileTag, slugSection } from '../fileTag';
import { fmt, fmtPrecise, parseTimeInput } from '../format';
import { feasibleSceneCounts, preferredSplit, validSplit } from '../rules';

describe('validSplit', () => {
  it.each([
    [10, null], [12, null], [15, null],
    [10, 3], [10, 4], [15, 4], [13, 3],
  ])('accepts %i + %s', (b, e) => expect(validSplit(b, e)).toBe(true));

  it.each([
    [10, 2], [11, 2], [10, 1], [10, 5], [9, null], [16, null], [9, 3], [16, 3], [10.5, null],
  ])('rejects %i + %s', (b, e) => expect(validSplit(b, e)).toBe(false));
});

describe('preferredSplit', () => {
  it('uses base only up to 15s', () => {
    for (let d = 10; d <= 15; d++) expect(preferredSplit(d)).toEqual({ base: d, ext: null });
  });
  it('uses the shortest legal extension above 15s', () => {
    expect(preferredSplit(16)).toEqual({ base: 13, ext: 3 });
    expect(preferredSplit(17)).toEqual({ base: 14, ext: 3 });
    expect(preferredSplit(18)).toEqual({ base: 15, ext: 3 });
    expect(preferredSplit(19)).toEqual({ base: 15, ext: 4 });
  });
  it('is null outside 10-19', () => {
    expect(preferredSplit(9)).toBeNull();
    expect(preferredSplit(20)).toBeNull();
  });
  it('always produces a valid split that sums to D', () => {
    for (let d = 10; d <= 19; d++) {
      const s = preferredSplit(d)!;
      expect(validSplit(s.base, s.ext)).toBe(true);
      expect(s.base + (s.ext ?? 0)).toBe(d);
    }
  });
});

describe('feasibleSceneCounts', () => {
  it('is empty only under 10s', () => {
    for (let t = 0; t < 10; t++) expect(feasibleSceneCounts(t)).toEqual([]);
    for (let t = 10; t <= 400; t++) expect(feasibleSceneCounts(t).length).toBeGreaterThan(0);
  });
  it('bounds counts for 214s', () => {
    const c = feasibleSceneCounts(214);
    expect(c[0]).toBe(12); // ceil(214/19)
    expect(c[c.length - 1]).toBe(21); // floor(214/10)
  });
});

describe('time formatting', () => {
  it('formats mm:ss and lrc-style', () => {
    expect(fmt(214)).toBe('03:34');
    expect(fmt(5)).toBe('00:05');
    expect(fmtPrecise(201.3)).toBe('03:21.30');
  });
  it('parses runtime input', () => {
    expect(parseTimeInput('3:34')).toBe(214);
    expect(parseTimeInput('03:34')).toBe(214);
    expect(parseTimeInput('214')).toBe(214);
    expect(parseTimeInput(' 3:34.6 ')).toBe(215);
    expect(parseTimeInput('3:75')).toBeNull();
    expect(parseTimeInput('abc')).toBeNull();
    expect(parseTimeInput('')).toBeNull();
  });
});

describe('buildFileTag', () => {
  it('matches the agreed format', () => {
    expect(buildFileTag({ scene: 3, section: 'Verse 1A', start_sec: 26, end_sec: 39 })).toBe('03_Verse1A_26-39.mp4');
    expect(buildFileTag({ scene: 12, section: 'Pre-Chorus', start_sec: 100, end_sec: 112 })).toBe('12_PreChorus_100-112.mp4');
  });
  it('falls back for empty slugs', () => {
    expect(slugSection('???')).toBe('Scene');
  });
});
