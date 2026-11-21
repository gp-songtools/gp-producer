import { describe, expect, it } from 'vitest';
import { snapBoundaries } from '../normalize';
import { validateLedger } from '../validate';
import { anchors, goodLedger, scene } from './helpers';

describe('snapBoundaries', () => {
  it('closes a gap and an overlap, leaving a valid ledger', () => {
    const s = goodLedger();
    s[1] = scene(2, 14, 25); // gap of 2 -> becomes 12-25 (13s)
    s[2] = scene(3, 24, 37); // overlap of 1 -> becomes 25-37 (12s)
    const r = snapBoundaries(s, 50);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(validateLedger(r.scenes, 50, [], anchors)).toEqual([]);
    // Scenes 2 and 3 changed length (11->13, 13->12), so their prompts are flagged for review.
    expect(r.reviewScenes).toEqual([2, 3]);
    expect(r.scenes.map((x) => x.base_sec)).toEqual([12, 13, 12, 13]);
  });

  it('forces the first start to 0 and the last end to runtime', () => {
    const s = [scene(1, 1, 13), scene(2, 13, 25), scene(3, 25, 37), scene(4, 37, 48)];
    const r = snapBoundaries(s, 50);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.scenes[0].start_sec).toBe(0);
    expect(r.scenes[3].end_sec).toBe(50);
    expect(r.scenes[3].duration_sec).toBe(13);
    expect(r.scenes[3].base_sec).toBe(13);
  });

  it('re-splits and flags a scene whose length crosses 15s', () => {
    const s = [scene(1, 0, 14), scene(2, 14, 26), scene(3, 26, 38), scene(4, 38, 48)];
    const r = snapBoundaries(s, 54); // last scene grows 10 -> 16
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const last = r.scenes[3];
    expect(last.duration_sec).toBe(16);
    expect([last.base_sec, last.extension_sec]).toEqual([13, 3]);
    expect(last.needs_review).toBe(true);
    expect(r.reviewScenes).toEqual([4]);
    // The new extension has no prompt or reason yet, so validation must still flag it.
    const codes = validateLedger(r.scenes, 54, [], anchors).map((i) => i.code);
    expect(codes).toEqual(expect.arrayContaining(['MISSING_EXTENSION', 'NO_EXTENSION_REASON']));
  });

  it('drops the extension when a scene shrinks to 15s or less', () => {
    const s = [scene(1, 0, 18), scene(2, 18, 30), scene(3, 30, 42), scene(4, 42, 54)];
    s[0] = { ...s[0], end_sec: 14 }; // claims 0-14 now, others unchanged => scene 2 start snaps to 14 (16s)
    const r = snapBoundaries(s, 54);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.scenes[0].extension_sec).toBeNull();
    expect(r.scenes[0].extension_prompt).toBeNull();
    expect(r.scenes[0].needs_review).toBe(true);
  });

  it('refuses, changing nothing, when a length would leave 10-19s', () => {
    const s = goodLedger();
    const r = snapBoundaries(s, 80); // last scene would be 43s
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/Scene 4/);
    expect(s).toEqual(goodLedger());
  });

  it('refuses an empty ledger', () => {
    expect(snapBoundaries([], 50).ok).toBe(false);
  });
});
