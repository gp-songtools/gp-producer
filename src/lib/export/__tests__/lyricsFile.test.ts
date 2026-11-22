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

describe('NARRATOR span', () => {
  const lines: LrcLine[] = [
    { t: 7, text: 'This October.' },
    { t: 10, text: '(whisper)' },
    { t: 14, text: 'One cabin.' },
    { t: 21, text: 'Five friends.' },
    { t: 30, text: 'Our singer starts' },
  ];
  it('drops the narrator\'s lines (backing ones too) and writes one tag in their place', () => {
    const t = buildLyricsFile(lines, [{ t: 7, tag: 'NARRATOR', endT: 21, source: 'manual' }]);
    expect(t).toBe('[00:07.00] [NARRATOR]\n[00:21.00] Five friends.\n[00:30.00] Our singer starts\n');
    expect(t).not.toContain('BACKING');
  });
  it('treats the end as exclusive, so a line starting exactly there is sung', () => {
    expect(buildLyricsFile(lines, [{ t: 7, tag: 'NARRATOR', endT: 21 }])).toContain('[00:21.00] Five friends.');
  });
  it('a NARRATOR tag without an end only marks a moment and removes nothing', () => {
    const t = buildLyricsFile(lines, [{ t: 7, tag: 'NARRATOR' }], 'include');
    expect(t).toContain('This October.');
    expect(t).toContain('[00:07.00] [NARRATOR]');
  });
  it('does not touch lines outside the span, and still tags backing runs there', () => {
    const t = buildLyricsFile([...lines, { t: 35, text: '(ooh)' }], [{ t: 7, tag: 'NARRATOR', endT: 21 }]);
    expect(t).toContain('[00:35.00] [BACKING]');
  });
});
