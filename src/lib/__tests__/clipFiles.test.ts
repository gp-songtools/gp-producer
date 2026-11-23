import { describe, expect, it } from 'vitest';
import { CLIP_STATE_TEXT, clipState, matchClipFiles } from '../clipFiles';

const sc = (scene: number, section: string, start_sec: number, end_sec: number) => ({ scene, section, start_sec, end_sec });
const scenes = [sc(1, 'Intro', 0, 12), sc(2, 'Verse 1', 12, 26), sc(3, 'Verse 1A', 26, 39), sc(4, 'Outro', 214, 230)];
const f = (...names: string[]) => names.map((name) => ({ name, size: 1 }));

describe('matchClipFiles', () => {
  it('matches the exact file tag, ignoring case, in any order', () => {
    const r = matchClipFiles(scenes, f('02_VERSE1_12-26.MP4', '01_Intro_00-12.mp4'));
    expect(r.matches).toEqual([{ scene: 1, file: 1, how: 'tag' }, { scene: 2, file: 0, how: 'tag' }]);
    expect(r.unmatched).toEqual([]);
  });

  it('falls back to the leading scene number for scenes still unmatched', () => {
    const r = matchClipFiles(scenes, f('01_Intro_00-12.mp4', '3_my take.mp4', '004 final.mov'));
    expect(r.matches).toEqual([
      { scene: 1, file: 0, how: 'tag' },
      { scene: 3, file: 1, how: 'number' },
      { scene: 4, file: 2, how: 'number' },
    ]);
  });

  it('uses each file once: a tag match is not taken again by number', () => {
    const r = matchClipFiles(scenes, f('01_Intro_00-12.mp4', '01_other.mp4'));
    expect(r.matches).toEqual([{ scene: 1, file: 0, how: 'tag' }]);
    expect(r.unmatched).toEqual([1]);
  });

  it('lists files that match no scene', () => {
    const r = matchClipFiles(scenes, f('notes.mp4', '09_Extra_00-01.mp4', 'clip-02.mp4'));
    expect(r.matches).toEqual([]);
    expect(r.unmatched).toEqual([0, 1, 2]);
  });

  it('handles 3-digit seconds in tags', () => {
    const r = matchClipFiles(scenes, f('04_Outro_214-230.mp4'));
    expect(r.matches).toEqual([{ scene: 4, file: 0, how: 'tag' }]);
    const r2 = matchClipFiles([sc(12, 'Bridge', 100, 112)], f('12_Bridge_100-112.mp4'));
    expect(r2.matches).toEqual([{ scene: 12, file: 0, how: 'tag' }]);
  });

  it('does not take a name that only starts with the digits', () => {
    expect(matchClipFiles(scenes, f('1080p.mp4', '10_x.mp4')).matches).toEqual([]);
  });
});

describe('clipState', () => {
  it('describes where a clip is', () => {
    const clip = { name: 'a.mp4', size: 1 };
    expect(CLIP_STATE_TEXT[clipState({}, false)]).toBe('No clip yet');
    expect(CLIP_STATE_TEXT[clipState({ clip }, true)]).toBe('Clip added (this session)');
    expect(CLIP_STATE_TEXT[clipState({ clip: { ...clip, driveFileId: 'x' } }, false)]).toBe('On Drive');
    expect(CLIP_STATE_TEXT[clipState({ clip }, false)]).toBe('Clip added earlier — add it again to upload');
  });
});
