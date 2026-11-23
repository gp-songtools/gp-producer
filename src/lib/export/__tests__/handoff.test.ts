import { describe, expect, it } from 'vitest';
import type { LrcLine } from '../../../types/blueprint';
import { scene as mk } from '../../ledger/__tests__/helpers';
import { blockLine, buildHandoff, lyricBlock } from '../handoff';

const lrc: LrcLine[] = [
  { t: 197.4, text: "I don't belong here, it's not safe" },
  { t: 199, text: '(not safe)' },
  { t: 205, text: 'Next scene line' },
];
const tags = [{ t: 201.3, tag: 'ECHO' }];
const lip = mk(14, 192, 204, { section: 'Chorus 2', lip_sync: { vocal_start_sec: 197.4, vocal_end_sec: 201.3, camera_note: 'Hold on the singer' } });
const plain = mk(1, 0, 12);

describe('lyricBlock', () => {
  it('interleaves lyrics and tags by time, with the skill\'s line format', () => {
    const b = lyricBlock(lrc, tags, 192, 204);
    expect(b.map(blockLine)).toEqual(["[03:17.40] I don't belong here, it's not safe", '[03:19.00] (not safe)', '[03:21.30] [ECHO]']);
    expect(b[1].backing).toBe(true);
    expect(b[0].backing).toBeUndefined();
  });
  it('treats lyrics as [start, end) but lets a tag sit on the cut', () => {
    expect(lyricBlock(lrc, [], 192, 205).map((i) => i.text)).not.toContain('Next scene line');
    expect(lyricBlock([], [{ t: 204, tag: 'X' }], 192, 204)).toHaveLength(1);
  });
  it('puts a lyric before a tag at the same instant', () => {
    expect(lyricBlock([{ t: 5, text: 'a' }], [{ t: 5, tag: 'T' }], 0, 10).map((i) => i.kind)).toEqual(['lyric', 'tag']);
  });
});

describe('buildHandoff', () => {
  const input = { projectName: 'Trailer', scenes: [plain, lip], lrc, tags, withheld: 0 };

  it('lists only LIP-SYNC scenes, with file tag, times, lyric block, backing flag and framing', () => {
    const t = buildHandoff(input);
    expect(t).toContain('LIP-SYNC HANDOFF: Trailer');
    expect(t).toContain('1 LIP-SYNC scene.');
    expect(t).toContain('SCENE 14: Chorus 2');
    expect(t).toContain('File: 14_Chorus2_192-204.mp4');
    expect(t).toContain('Scene time: 03:12 - 03:24');
    expect(t).toContain('Vocals: 03:17.40 - 03:21.30');
    expect(t).toContain("[03:17.40] I don't belong here, it's not safe\n[03:19.00] (not safe)\n[03:21.30] [ECHO]");
    expect(t).toContain("Backing vocal in the vocal window: (not safe). The on-screen singer shouldn't mouth this.");
    expect(t).toContain("- Keep the singer's face the largest in frame");
    expect(t).toContain('- Hold on the singer');
    expect(t).toContain('Singing stop tags: checked by ear.');
    expect(t).not.toContain('SCENE 01');
    expect(t.endsWith('\n')).toBe(true);
  });

  it('leaves stop tags out until they are checked, and says so', () => {
    const t = buildHandoff({ ...input, tags: [], withheld: 1 });
    expect(t).not.toContain('[ECHO]');
    expect(t).toContain('1 from the audio brief are NOT checked by ear yet');
    expect(t).toContain('[03:17.40]');
  });

  it('says when there are no tags or no lip-sync scenes', () => {
    expect(buildHandoff({ ...input, tags: [], withheld: 0 })).toContain('Singing stop tags: none.');
    expect(buildHandoff({ ...input, scenes: [plain] })).toBe('LIP-SYNC HANDOFF: Trailer\n\nNo LIP-SYNC scenes in this ledger.\n');
  });

  it('orders scenes by number and handles a scene with no lyrics', () => {
    const a = mk(9, 100, 112, { lip_sync: { vocal_start_sec: 100, vocal_end_sec: 105 } });
    const t = buildHandoff({ ...input, scenes: [lip, a] });
    expect(t.indexOf('SCENE 09')).toBeLessThan(t.indexOf('SCENE 14'));
    expect(t).toContain('(none in this scene)');
  });
});

describe('NARRATOR span in the handoff', () => {
  const nl: LrcLine[] = [{ t: 193, text: 'Narrator words' }, { t: 197.4, text: 'Sung line' }];
  const span = [{ t: 190, tag: 'NARRATOR', endT: 196, source: 'manual' as const }];
  const scene14 = mk(14, 192, 204, { section: 'Chorus 2', lip_sync: { vocal_start_sec: 193, vocal_end_sec: 201.3 } });

  it('flags narrated lines in the block, and adds a NARRATOR tag at the scene start when the span began earlier', () => {
    const b = lyricBlock(nl, span, 192, 204);
    expect(b.find((i) => i.text === 'Narrator words')?.narrator).toBe(true);
    expect(b.find((i) => i.text === 'Sung line')?.narrator).toBeUndefined();
    expect(b.filter((i) => i.kind === 'tag').map((i) => [i.t, i.text])).toEqual([[192, 'NARRATOR']]);
  });

  it('omits narrated lines from the text, keeps the tag, and says the narrator overlaps the vocal window', () => {
    const t = buildHandoff({ scenes: [scene14], lrc: nl, tags: span, withheld: 0 });
    expect(t).not.toContain('Narrator words');
    expect(t).toContain('[03:12.00] [NARRATOR]\n[03:17.40] Sung line');
    expect(t).toMatch(/Offscreen narrator overlaps the vocal window \(03:10.00 - 03:16.00\): do not lip-sync that part/);
  });

  it('does not warn when the narrator is outside the vocal window', () => {
    const t = buildHandoff({ scenes: [scene14], lrc: nl, tags: [{ t: 100, tag: 'NARRATOR', endT: 110 }], withheld: 0 });
    expect(t).not.toContain('Offscreen narrator');
  });
});
