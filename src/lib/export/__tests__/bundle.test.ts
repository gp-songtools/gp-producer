import JSZip from 'jszip';
import { describe, expect, it } from 'vitest';
import { slugName } from '../../download';
import { scene as mk } from '../../ledger/__tests__/helpers';
import { newProject, type ImageOwner, type ImageRecord, type StoredAnchor } from '../../../types/project';
import { buildBundle } from '../bundle';
import { buildLedgerMarkdown } from '../markdown';

const img = (ownerKey: ImageOwner, bytes: string, mime = 'image/png'): ImageRecord => ({ id: ownerKey, projectId: 'p', ownerKey, kind: 'anchor', blob: new Blob([bytes], { type: mime }), mime, width: 1, height: 1, model: 'm', prompt: 'p', source: 'generated', createdAt: 1 });

const project = { ...newProject('My Song: v2!'), runtimeSec: 50, lrcLines: [{ t: 3, text: 'hello' }, { t: 14, text: '(oh)' }], treatment: { title: 'Keeper', paragraphs: ['One.'], facets: { narrative_metaphor: 'a', visual_symbolism: 'b', pacing_arc: 'c', camera_language: 'd', color_progression: 'e' } } };
const anchors: StoredAnchor[] = [
  { id: 'character', name: 'Character', category: 'character', prompt: 'A keeper', projectId: 'p', order: 0 },
  { id: 'env', name: 'Environment', category: 'environment', prompt: 'A lighthouse', projectId: 'p', order: 1 },
];
const scenes = [mk(2, 12, 25, { section: 'Verse 1A', lip_sync: { vocal_start_sec: 14, vocal_end_sec: 20 }, base_prompt: 'BASE TWO' }), mk(1, 0, 12, { section: 'Intro' })];
const images = new Map<ImageOwner, ImageRecord>([
  ['anchor:character', img('anchor:character', 'CHARPNG')],
  ['scene:1', img('scene:1', 'KF1', 'image/jpeg')],
  ['scene:2', img('scene:2', 'KF2')],
  ['sheet:character', img('sheet:character', 'SHEETPNG')],
]);

const open = async (over = {}) => {
  const b = await buildBundle({ project, anchors, scenes, images, tags: [{ t: 20, tag: 'INSTRUMENTAL', source: 'manual' }], withheld: 0, backing: 'tag', ...over });
  const zip = await JSZip.loadAsync(await b.blob.arrayBuffer());
  return { b, zip, text: (p: string) => zip.file(`My-Song-v2/${p}`)!.async('string') };
};

describe('buildBundle', () => {
  it('contains anchors, keyframes named by file tag, the ledger and both text files, all under one folder', async () => {
    const { b, zip } = await open();
    expect(b.filename).toBe('My-Song-v2-export.zip');
    expect(Object.keys(zip.files).filter((n) => !n.endsWith('/')).sort()).toEqual([
      'My-Song-v2/anchors/character.png',
      'My-Song-v2/anchors/character_sheet.png',
      'My-Song-v2/keyframes/01_Intro_00-12.jpg',
      'My-Song-v2/keyframes/02_Verse1A_12-25.png',
      'My-Song-v2/ledger.json',
      'My-Song-v2/ledger.md',
      'My-Song-v2/lipsync-handoff.txt',
      'My-Song-v2/lyrics-for-lipsync.txt',
    ]);
    expect(b.files).toHaveLength(8);
  });

  it('stores the image bytes unchanged', async () => {
    const { zip } = await open();
    expect(await zip.file('My-Song-v2/keyframes/02_Verse1A_12-25.png')!.async('string')).toBe('KF2');
    expect(await zip.file('My-Song-v2/anchors/character.png')!.async('string')).toBe('CHARPNG');
    expect(await zip.file('My-Song-v2/anchors/character_sheet.png')!.async('string')).toBe('SHEETPNG');
  });

  it('writes ledger.json with scenes in order, prompts and file tags, and no client-only fields', async () => {
    const { text } = await open();
    const j = JSON.parse(await text('ledger.json'));
    expect(j.schema_version).toBe(1);
    expect(j.project).toEqual({ name: 'My Song: v2!', runtime_sec: 50 });
    expect(j.scenes.map((s: { scene: number }) => s.scene)).toEqual([1, 2]);
    expect(j.scenes[1]).toMatchObject({ file_tag: '02_Verse1A_12-25.mp4', base_prompt: 'BASE TWO', lip_sync: { vocal_start_sec: 14, vocal_end_sec: 20 } });
    expect(j.scenes[1]).not.toHaveProperty('projectId');
    expect(j.scenes[1]).not.toHaveProperty('checklist');
    expect(j.anchors).toHaveLength(2);
    expect(j.treatment.title).toBe('Keeper');
  });

  it('writes the lyrics file with the backing line replaced by [INSTRUMENTAL] and the usable tag merged', async () => {
    const { text } = await open();
    expect(await text('lyrics-for-lipsync.txt')).toBe('[00:03.00] hello\n[00:14.00] [INSTRUMENTAL]\n[00:20.00] [INSTRUMENTAL]\n');
    expect(await text('lipsync-handoff.txt')).toContain('File: 02_Verse1A_12-25.mp4');
  });

  it('never includes brief tags that have not been checked: they are not passed in, and the handoff says so', async () => {
    const { text } = await open({ tags: [], withheld: 2 });
    expect(await text('lyrics-for-lipsync.txt')).not.toContain('[00:20.00]'); // the unchecked brief tag at 00:20 is held back
    expect(await text('lipsync-handoff.txt')).toContain('2 from the audio brief are NOT checked by ear yet');
  });

  it('skips the lyrics file when there are no lyrics, and works with no images', async () => {
    const { zip } = await open({ project: { ...project, lrcLines: [] }, images: new Map(), tags: [] });
    expect(zip.file('My-Song-v2/lyrics-for-lipsync.txt')).toBeNull();
    expect(Object.keys(zip.files).some((n) => n.includes('keyframes/'))).toBe(false);
    expect(zip.file('My-Song-v2/ledger.json')).not.toBeNull();
  });
});

describe('buildLedgerMarkdown', () => {
  const md = buildLedgerMarkdown({ projectName: 'Song', runtimeSec: 50, treatment: project.treatment, anchors, scenes, lrc: project.lrcLines });
  it('is readable: treatment, anchors, then scenes in order with tag, lyrics and prompts', () => {
    expect(md).toContain('# Song');
    expect(md).toContain('Runtime: 00:50 (50s) · 2 scenes');
    expect(md).toContain('### Character (`character`, character)');
    expect(md.indexOf('### Scene 01')).toBeLessThan(md.indexOf('### Scene 02'));
    expect(md).toContain('### Scene 02: Verse 1A (LIP-SYNC)');
    expect(md).toContain('- File tag: `02_Verse1A_12-25.mp4`');
    expect(md).toContain('- [00:14.00] (oh) (backing vocal)');
    expect(md).toContain('BASE TWO');
    expect(md).toContain('- [00:03.00] hello');
    expect(buildLedgerMarkdown({ projectName: 'S', runtimeSec: null, treatment: null, anchors, scenes, lrc: [] })).toContain('- (instrumental)');
  });
});

describe('slugName', () => {
  it('makes a safe name', () => {
    expect(slugName('My Song: v2!')).toBe('My-Song-v2');
    expect(slugName('Café déjà vu')).toBe('Cafe-deja-vu');
    expect(slugName('???')).toBe('project');
  });
});
