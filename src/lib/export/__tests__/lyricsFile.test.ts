import { describe, expect, it } from 'vitest';
import type { LrcLine } from '../../../types/blueprint';
import { buildLyricsFile, countBacking } from '../lyricsFile';

const lrc: LrcLine[] = [
  { t: 197.4, text: "I don't belong here, it's not safe" },
  { t: 199, text: '(not safe)' },
  { t: 200, text: '(oh no)' },
  { t: 205, text: 'Next line' },
  { t: 210, text: '(echo echo)' },
];
const tags = [{ t: 201.3, tag: 'ECHO', source: 'manual' as const }, { t: 230, tag: 'INSTRUMENTAL', source: 'brief' as const }];

describe('buildLyricsFile', () => {
  it('writes sung lines and tags in .lrc style, in time order', () => {
    expect(buildLyricsFile(lrc, tags, 'include')).toBe(
      ["[03:17.40] I don't belong here, it's not safe", '[03:19.00] (not safe)', '[03:20.00] (oh no)', '[03:21.30] [ECHO]', '[03:25.00] Next line', '[03:30.00] (echo echo)', '[03:50.00] [INSTRUMENTAL]'].join('\n') + '\n',
    );
  });

  it('by default replaces a run of backing lines with one no-singing tag, so singing does not carry on', () => {
    const t = buildLyricsFile(lrc, tags);
    expect(t.split('\n')).toEqual(["[03:17.40] I don't belong here, it's not safe", '[03:19.00] [BACKING]', '[03:21.30] [ECHO]', '[03:25.00] Next line', '[03:30.00] [BACKING]', '[03:50.00] [INSTRUMENTAL]', '']);
    expect(t).not.toContain('(not safe)');
    expect(t).not.toContain('(oh no)');
  });

  it('can leave backing lines out entirely', () => {
    const t = buildLyricsFile(lrc, [], 'omit');
    expect(t).toBe("[03:17.40] I don't belong here, it's not safe\n[03:25.00] Next line\n");
  });

  it('puts a sung line before a tag at the same instant', () => {
    expect(buildLyricsFile([{ t: 5, text: 'hi' }], [{ t: 5, tag: 'ECHO' }])).toBe('[00:05.00] hi\n[00:05.00] [ECHO]\n');
  });

  it('is empty with no lyrics and no tags, and counts backing lines', () => {
    expect(buildLyricsFile([], [])).toBe('');
    expect(countBacking(lrc)).toBe(3);
  });

  it('does not mutate its inputs', () => {
    const copy = JSON.stringify(lrc);
    buildLyricsFile([...lrc].reverse(), tags);
    expect(JSON.stringify(lrc)).toBe(copy);
  });
});
