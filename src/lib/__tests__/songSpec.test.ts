import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SongSpec, buildVideoSequence, mmss, readTimedLyrics, specOffers, videoSequenceStatus, writeVideoSequence } from '../songSpec';

const example = readFileSync(join(__dirname, 'fixtures/example.songspec.md'), 'utf8');
const sc = (scene: number, section: string, start_sec: number, end_sec: number) => ({ scene, section, start_sec, end_sec });
const scenes = [sc(2, 'Verse 1', 12, 26), sc(1, 'Intro', 0, 12), sc(3, 'Verse 1A', 26, 39), sc(4, 'Outro', 214, 230)];

const sectionRange = (text: string, heading: string) => {
  const start = text.indexOf(`## ${heading}\n`);
  const next = text.indexOf('\n## ', start + 1);
  return [start, next === -1 ? text.length : next + 1] as const;
};

describe('readTimedLyrics', () => {
  it('returns the LRC body and the tool that wrote it', () => {
    const r = readTimedLyrics(example)!;
    expect(r.by).toBe('framecut');
    expect(r.lrc.split('\n')[0]).toBe('[00:12.40] Your name still glows across my screen');
    expect(r.lrc.split('\n')).toHaveLength(12);
  });
  it('is null when missing or empty', () => {
    expect(readTimedLyrics(SongSpec.create())).toBeNull();
    expect(readTimedLyrics('')).toBeNull();
    expect(readTimedLyrics(SongSpec.create() + '\n## Timed lyrics\n\n## Notes\nhi\n')).toBeNull();
  });
});

describe('buildVideoSequence', () => {
  it('sorts by scene and formats times and file tags', () => {
    expect(buildVideoSequence(scenes).split('\n')).toEqual([
      '[00:00.00] 01_Intro_00-12.mp4',
      '[00:12.00] 02_Verse1_12-26.mp4',
      '[00:26.00] 03_Verse1A_26-39.mp4',
      '[03:34.00] 04_Outro_214-230.mp4',
    ]);
  });
  it('keeps decimals and lets minutes pass 59', () => {
    expect(buildVideoSequence([sc(1, 'A', 61.5, 70), sc(2, 'B', 3725.25, 3800)]).split('\n').map((l) => l.slice(0, 10))).toEqual(['[01:01.50]', '[62:05.25]']);
  });
});

describe('writeVideoSequence', () => {
  it('replaces an existing section and preserves every byte outside it', () => {
    const { text, confirm } = writeVideoSequence(example, scenes);
    const [s0, e0] = sectionRange(example, 'Video sequence');
    const [s1, e1] = sectionRange(text, 'Video sequence');
    expect(text.slice(0, s1)).toBe(example.slice(0, s0));
    expect(text.slice(e1)).toBe(example.slice(e0));
    expect(confirm).toBe('');
    expect(text.slice(s1, e1)).toMatch(/^## Video sequence\n<!-- song-spec: by=gp-producer at=\S+ hash=[0-9a-f]{8} from=timed-lyrics:46a5a37d -->\n\[00:00\.00\] 01_Intro_00-12\.mp4\n/);
    expect(text.slice(s1, e1)).not.toContain('05_Chorus');
    expect(text.match(/## Video sequence/g)).toHaveLength(1);
  });
  it('adds the section when absent, preserving the rest', () => {
    const base = SongSpec.create();
    const { text } = writeVideoSequence(base, scenes);
    expect(text.startsWith(base.trimEnd())).toBe(true);
    expect(text).toContain('## Video sequence\n<!-- song-spec: by=gp-producer');
    expect(text).not.toContain('from=');
  });
  it('asks when the section was edited by hand', () => {
    const edited = example.replace('[00:12.00] 02_Verse1_12-26.mp4', '[00:12.00] my own name.mp4');
    expect(writeVideoSequence(edited, scenes).confirm).toMatch(/changed by hand/);
  });
  it('produces a spec with no video-sequence issues', () => {
    for (const base of [example, SongSpec.create()]) {
      const issues = SongSpec.validate(SongSpec.parse(writeVideoSequence(base, scenes).text));
      expect(issues.filter((i) => /video/i.test(i.field + i.message))).toEqual([]);
    }
  });
  it('round-trips through the reader', () => {
    const { text } = writeVideoSequence(example, scenes);
    expect(SongSpec.section(SongSpec.parse(text), 'video-sequence')!.body).toBe(buildVideoSequence(scenes));
    expect(readTimedLyrics(text)).toEqual(readTimedLyrics(example));
  });
});

const withDuration = example.replace(/^duration:.*$/m, 'duration: 214');
const proj = { lrcRaw: '', runtimeSec: null as number | null, name: 'Untitled project' };

describe('specOffers', () => {
  it('offers timed lyrics, duration and title when nothing is in use', () => {
    const o = specOffers(withDuration, proj)!;
    expect(o.timed).toMatchObject({ by: 'framecut', tool: 'Framecut', count: 12, first: 12.4, inUse: false });
    expect(o.duration).toEqual({ sec: 214, inUse: false });
    expect(o.title).toEqual({ value: 'Paper Lanterns', inUse: false });
    expect(o.usedLabels).toEqual([]);
  });
  it('flags in-use rows, ignoring newline style and edge whitespace', () => {
    const body = readTimedLyrics(example)!.lrc;
    const o = specOffers(withDuration, { lrcRaw: '\n' + body.replace(/\n/g, '\r\n') + '\n', runtimeSec: 214, name: 'Paper Lanterns' })!;
    expect(o.timed!.inUse && o.duration!.inUse && o.title!.inUse).toBe(true);
    expect(o.usedLabels).toEqual(['Timed lyrics (Framecut)', 'Duration', 'Title']);
  });
  it('offers no duration when the spec has none', () => {
    expect(specOffers(example, proj)!.duration).toBeNull();
  });
  it('is null for no spec or an empty one', () => {
    expect(specOffers('', proj)).toBeNull();
    expect(specOffers(SongSpec.create(), proj)).toBeNull();
  });
  it('notes lyrics without timed lyrics', () => {
    const doc = SongSpec.parse(SongSpec.create());
    SongSpec.setSection(doc, 'lyrics', 'la la la', { by: 'lyricpad' });
    const o = specOffers(SongSpec.serialize(doc), proj)!;
    expect(o.timed).toBeNull();
    expect(o.lyricsOnly).toBe(true);
  });
});

describe('videoSequenceStatus', () => {
  it('is none without the section', () => {
    expect(videoSequenceStatus('', scenes)).toEqual({ state: 'none' });
    expect(videoSequenceStatus(SongSpec.create(), scenes)).toEqual({ state: 'none' });
  });
  it('is current after writing and outdated when scenes change', () => {
    const { text } = writeVideoSequence(example, scenes);
    const cur = videoSequenceStatus(text, scenes);
    expect(cur).toMatchObject({ state: 'current', by: 'gp-producer', count: 4 });
    expect(videoSequenceStatus(text, [...scenes, sc(5, 'Bridge', 230, 240)]).state).toBe('outdated');
    expect(videoSequenceStatus(text, []).state).toBe('outdated');
  });
});

describe('mmss', () => {
  it('formats M:SS', () => {
    expect(mmss(214)).toBe('3:34');
    expect(mmss(65)).toBe('1:05');
  });
});
