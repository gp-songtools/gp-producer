import { describe, expect, it } from 'vitest';
import { emptyVision } from '../../types/project';
import { checkRuntime, extractBriefPrompt, fillBriefPrompt, formatLyricsForBrief, LYRICS_PLACEHOLDER, setupReadiness } from '../setup';

const lrc = [
  { t: 12.5, text: 'first' },
  { t: 201.3, text: '[ECHO]' },
];

describe('audio brief prompt', () => {
  it('is extracted from the real gemini-audio-brief.md and still has the lyrics placeholder', () => {
    const p = extractBriefPrompt();
    expect(p).toContain('Listen to the attached song');
    expect(p).toContain('# SINGING STOP TAGS');
    expect(p).toContain(LYRICS_PLACEHOLDER);
  });

  it('returns null when there is no text block', () => {
    expect(extractBriefPrompt('# nothing here')).toBeNull();
  });

  it('formats lyrics in lrc style, or NONE', () => {
    expect(formatLyricsForBrief(lrc)).toBe('[00:12.50] first\n[03:21.30] [ECHO]');
    expect(formatLyricsForBrief([])).toBe('NONE');
  });

  it('fills the placeholder once and keeps dollar signs literal', () => {
    const out = fillBriefPrompt(`a\n${LYRICS_PLACEHOLDER}\nb`, [{ t: 1, text: 'cost $& more $1' }]);
    expect(out).toBe('a\n[00:01.00] cost $& more $1\nb');
    expect(out).not.toContain('PASTE LYRICS');
  });

  it('fills the real prompt', () => {
    expect(fillBriefPrompt(extractBriefPrompt()!, lrc)).toContain('[00:12.50] first');
  });
});

describe('checkRuntime', () => {
  it('distinguishes empty and unreadable', () => {
    expect(checkRuntime(null, true, lrc)).toMatchObject({ ok: false, reason: 'empty' });
    expect(checkRuntime(null, false, lrc)).toMatchObject({ ok: false, reason: 'unreadable' });
  });
  it('rejects under 10s', () => {
    expect(checkRuntime(9, true, [])).toMatchObject({ ok: false, reason: 'too_short' });
  });
  it('rejects a runtime at or before the last lyric', () => {
    expect(checkRuntime(201, true, lrc)).toMatchObject({ ok: false, reason: 'before_last_lyric' });
    expect(checkRuntime(201.3, true, lrc)).toMatchObject({ ok: false, reason: 'before_last_lyric' });
    expect(checkRuntime(202, true, lrc).ok).toBe(true);
  });
  it('gives the base-only scene range for the default 10-15s scenes', () => {
    expect(checkRuntime(214, true, lrc)).toEqual({ ok: true, seconds: 214, scenesLow: 15, scenesHigh: 21 });
  });
  it('accepts a runtime with no lyrics yet', () => {
    expect(checkRuntime(60, true, []).ok).toBe(true);
  });
});

describe('setupReadiness', () => {
  const base = { lrcLines: lrc, runtimeSec: 214, vision: { ...emptyVision(), narrativeArc: 'x' }, audioBrief: '', hasAnthropicKey: true, audioLoaded: false };
  const done = (i: ReturnType<typeof setupReadiness>, id: string) => i.items.find((x) => x.id === id)!.done;

  it('is ready with all required items, optional ones not needed', () => {
    const r = setupReadiness(base);
    expect(r.ready).toBe(true);
    expect(done(r, 'brief')).toBe(false);
  });

  it.each([
    ['lyrics', { lrcLines: [] }],
    ['runtime', { runtimeSec: null }],
    ['vision', { vision: emptyVision() }],
    ['key', { hasAnthropicKey: false }],
  ])('is not ready without %s', (id, over) => {
    const r = setupReadiness({ ...base, ...over });
    expect(r.ready).toBe(false);
    expect(done(r, id)).toBe(false);
  });

  it('treats whitespace-only vision as empty', () => {
    expect(setupReadiness({ ...base, vision: { ...emptyVision(), mood: '   ' } }).ready).toBe(false);
  });

  it('explains a bad runtime in the hint', () => {
    const r = setupReadiness({ ...base, runtimeSec: 100 });
    expect(r.items.find((x) => x.id === 'runtime')!.hint).toMatch(/last lyric/);
  });
});
