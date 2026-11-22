import { describe, expect, it } from 'vitest';
import { parseClock, parseStopTags, parseVocalMap, segmentLabel, stopTagSignature, vocalOverlaps } from '../brief';

// Trimmed from a real Gemini answer for a spoken-word trailer parody.
export const REAL_BRIEF = `# SONG OVERVIEW
- Total length: 03:06

# VOCAL MAP
| Start | End | Type | Words or description |
| :--- | :--- | :--- | :--- |
| 00:00 | 00:07 | NO VOCALS | Instrumental trailer intro |
| 00:07 | 00:21 | SPOKEN | This October. / One cabin. |
| 02:13 | 02:41 | LEAD SINGING | The killer is in the house! / So naturally, they split up! |
| 02:41 | 02:48 | SPOKEN | From the studio that brought you Why / did you go in there? |
| 02:48 | 02:55 | LEAD SINGING | Split up! |

# SINGING STOP TAGS
[02:41.00] [INSTRUMENTAL]
[02:55.00] [INSTRUMENTAL]

# TIMING NOTES
- At 02:02, the lyric says "Yes, Brandon."
`;

describe('parseClock', () => {
  it('reads MM:SS and MM:SS.cc', () => {
    expect(parseClock('02:41')).toBe(161);
    expect(parseClock('03:21.30')).toBeCloseTo(201.3);
    expect(parseClock('3:21,5')).toBeCloseTo(201.5);
    expect(parseClock('1:2:3')).toBeNull();
    expect(parseClock('abc')).toBeNull();
    expect(parseClock('00:61')).toBeNull();
  });
});

describe('parseStopTags', () => {
  it('reads the tags from a real Gemini answer', () => {
    expect(parseStopTags(REAL_BRIEF)).toEqual([{ t: 161, tag: 'INSTRUMENTAL' }, { t: 175, tag: 'INSTRUMENTAL' }]);
  });
  it('tolerates bullets, lower case, odd spacing, a code fence and unsorted lines', () => {
    const md = '```markdown\n## Singing Stop Tags\n- [03:21.30] [echo]\n* [01:05.5]   [ Instrumental ]\n[00:10.00]  [ECHO]\nnot a tag\n```';
    expect(parseStopTags(md).map((t) => [t.t, t.tag])).toEqual([[10, 'ECHO'], [65.5, 'INSTRUMENTAL'], [201.3, 'ECHO']]);
  });
  it('ignores lyric lines and lines in other sections', () => {
    const md = '# VOCAL MAP\n[03:17.40] I don\'t belong here\n[03:19.00] [X]\n# SINGING STOP TAGS\n[03:21.30] [ECHO]\n[03:22.00] just words\n# TIMING NOTES\n[04:00.00] [LATE]';
    expect(parseStopTags(md)).toEqual([{ t: 201.3, tag: 'ECHO' }]);
  });
  it('without a heading, takes any timed tag line; with nothing, returns none', () => {
    expect(parseStopTags('[00:30.00] [ECHO]\n[00:31.00] words')).toEqual([{ t: 30, tag: 'ECHO' }]);
    expect(parseStopTags('')).toEqual([]);
    expect(parseStopTags('# SINGING STOP TAGS\nNone.')).toEqual([]);
  });
  it('has a signature that changes when the tags do', () => {
    const a = parseStopTags(REAL_BRIEF);
    expect(stopTagSignature(a)).toBe('161.00:INSTRUMENTAL|175.00:INSTRUMENTAL');
    expect(stopTagSignature(a)).not.toBe(stopTagSignature([a[0]]));
    expect(stopTagSignature([])).toBe('');
  });
});

describe('parseVocalMap', () => {
  it('reads table rows, skipping header and separator', () => {
    const m = parseVocalMap(REAL_BRIEF);
    expect(m).toHaveLength(5);
    expect(m[0]).toEqual({ start: 0, end: 7, type: 'NO VOCALS', description: 'Instrumental trailer intro' });
    expect(m[2]).toMatchObject({ start: 133, end: 161, type: 'LEAD SINGING' });
    expect(m[2].description).toContain('split up');
  });
  it('is empty without a vocal map', () => expect(parseVocalMap('# SECTION MAP\n| 00:00 | 00:21 | x |')).toEqual([]));
});

describe('vocalOverlaps', () => {
  const map = parseVocalMap(REAL_BRIEF);
  it('lists overlapping segments and flags the risky ones', () => {
    const o = vocalOverlaps(map, 133, 161);
    expect(o).toHaveLength(1);
    expect(o[0].risky).toBe(false);
    expect(segmentLabel(o[0].segment)).toBe('02:13–02:41 LEAD SINGING');
    expect(vocalOverlaps(map, 0, 10).some((x) => x.risky)).toBe(true);
  });
  it('treats touching edges as not overlapping', () => expect(vocalOverlaps(map, 161, 168).map((x) => x.segment.type)).toEqual(['SPOKEN']));
});
