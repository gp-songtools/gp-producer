import { describe, expect, it } from 'vitest';
import { hasErrors, validateLedger } from '../validate';
import { anchors, goodLedger, scene } from './helpers';

const codes = (issues: { code: string }[]) => issues.map((i) => i.code);
const run = (scenes = goodLedger(), runtime = 50, lrc: { t: number; text: string }[] = []) =>
  validateLedger(scenes, runtime, lrc, anchors);

describe('validateLedger', () => {
  it('accepts a clean ledger', () => {
    expect(run()).toEqual([]);
  });

  it('flags a gap', () => {
    const s = goodLedger();
    s[1] = scene(2, 14, 25);
    expect(codes(run(s))).toContain('GAP');
  });

  it('flags an overlap', () => {
    const s = goodLedger();
    s[1] = scene(2, 10, 25);
    expect(codes(run(s))).toContain('OVERLAP');
  });

  it('flags a first scene not starting at 0', () => {
    const s = goodLedger();
    s[0] = scene(1, 2, 12);
    expect(codes(run(s))).toContain('START_NOT_ZERO');
  });

  it('flags a last scene not ending at runtime', () => {
    expect(codes(run(goodLedger(), 53))).toContain('END_MISMATCH');
  });

  it('flags stated duration that disagrees with timestamps', () => {
    const s = goodLedger();
    s[0] = scene(1, 0, 12, { duration_sec: 13 });
    expect(codes(run(s))).toContain('DURATION_MISMATCH');
  });

  it('rejects the 10s base + 2s extension case', () => {
    const s = goodLedger();
    s[0] = scene(1, 0, 12, { base_sec: 10, extension_sec: 2, extension_reason: 'x', extension_prompt: 'e' });
    const c = codes(run(s));
    expect(c).toContain('BAD_SPLIT');
    expect(c).not.toContain('SPLIT_MISMATCH'); // 10+2 does sum to 12, only the split is illegal
  });

  it('accepts 10 + 3 with a reason and prompt', () => {
    const s = [scene(1, 0, 13, { base_sec: 10, extension_sec: 3, extension_reason: 'hold the beat', extension_prompt: 'e' }), scene(2, 13, 25), scene(3, 25, 37), scene(4, 37, 50)];
    expect(run(s)).toEqual([]);
  });

  it('flags a split that does not sum to the span', () => {
    const s = goodLedger();
    s[0] = scene(1, 0, 12, { base_sec: 11 });
    expect(codes(run(s))).toContain('SPLIT_MISMATCH');
  });

  it('flags base-only scenes over 15s and under 10s', () => {
    expect(codes(run([scene(1, 0, 17, { base_sec: 17, extension_sec: null, extension_reason: null, extension_prompt: null }), scene(2, 17, 50)]))).toContain('BAD_SPLIT');
    expect(codes(run([scene(1, 0, 9, { base_sec: 9 }), scene(2, 9, 50, { base_sec: 15, extension_sec: 4, duration_sec: 41 })]))).toContain('BAD_SPLIT');
  });

  it('requires an extension prompt and reason when an extension exists', () => {
    const s = goodLedger();
    s[0] = scene(1, 0, 16, { extension_prompt: null, extension_reason: '' });
    s[1] = scene(2, 16, 25);
    s[2] = scene(3, 25, 37);
    s[3] = scene(4, 37, 50);
    const c = codes(run(s));
    expect(c).toContain('MISSING_EXTENSION');
    expect(c).toContain('NO_EXTENSION_REASON');
  });

  it('flags an extension prompt with no extension', () => {
    const s = goodLedger();
    s[0] = scene(1, 0, 12, { extension_prompt: 'oops' });
    expect(codes(run(s))).toContain('ORPHAN_EXTENSION');
  });

  it('flags unknown and missing anchors', () => {
    const s = goodLedger();
    s[0] = scene(1, 0, 12, { anchor_ids: ['nope'] });
    s[1] = scene(2, 12, 25, { anchor_ids: [] });
    const c = codes(run(s));
    expect(c).toContain('UNKNOWN_ANCHOR');
    expect(c).toContain('NO_ANCHORS');
  });

  it('flags non-sequential scene numbers', () => {
    const s = goodLedger();
    s[2] = scene(5, 25, 37);
    expect(codes(run(s))).toContain('SCENE_NUMBER');
  });

  it('flags an untileable runtime and an empty ledger', () => {
    expect(codes(validateLedger([], 8, [], anchors))).toEqual(['RUNTIME_UNTILEABLE', 'NO_SCENES']);
  });

  it('warns about a lyric starting just before a cut, but does not error', () => {
    const i = run(goodLedger(), 50, [{ t: 11.4, text: 'late line' }]);
    expect(codes(i)).toEqual(['LYRIC_AT_EDGE']);
    expect(hasErrors(i)).toBe(false);
  });

  it('errors on lyrics at or after the runtime', () => {
    expect(codes(run(goodLedger(), 50, [{ t: 50, text: 'x' }]))).toContain('LYRIC_PAST_END');
  });

  it('validates lip-sync windows', () => {
    const lrc = [{ t: 14, text: 'sing' }];
    const ok = goodLedger();
    ok[1] = scene(2, 12, 25, { lip_sync: { vocal_start_sec: 14, vocal_end_sec: 20 } });
    expect(run(ok, 50, lrc)).toEqual([]);

    const outside = goodLedger();
    outside[1] = scene(2, 12, 25, { lip_sync: { vocal_start_sec: 10, vocal_end_sec: 20 } });
    expect(codes(run(outside, 50, lrc))).toContain('LIPSYNC_RANGE');

    const inverted = goodLedger();
    inverted[1] = scene(2, 12, 25, { lip_sync: { vocal_start_sec: 20, vocal_end_sec: 14 } });
    expect(codes(run(inverted, 50, lrc))).toContain('LIPSYNC_RANGE');

    const noWords = goodLedger();
    noWords[1] = scene(2, 12, 25, { lip_sync: { vocal_start_sec: 14, vocal_end_sec: 20 } });
    expect(codes(run(noWords, 50, []))).toContain('LIPSYNC_NO_LYRICS');
  });
});
