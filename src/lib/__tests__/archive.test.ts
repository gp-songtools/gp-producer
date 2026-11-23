import { IDBFactory } from 'fake-indexeddb';
import JSZip from 'jszip';
import { beforeEach, describe, expect, it } from 'vitest';
import type { ImageRecord } from '../../types/project';
import { buildBundle } from '../export/bundle';
import * as db from '../db';
import { ImportError, importProjectArchive, sniffImageMime } from '../import';
import { goodLedger } from '../ledger/__tests__/helpers';
import { exportProjectArchive } from '../projectArchive';

beforeEach(async () => {
  await db._resetDbForTests();
  globalThis.indexedDB = new IDBFactory();
});

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);
const JPG = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 9, 9]);
const treatment = { title: 'Keeper', paragraphs: ['One.'], facets: { narrative_metaphor: 'a', visual_symbolism: 'b', pacing_arc: 'c', camera_language: 'd', color_progression: 'e' } };

const img = (projectId: string, id: string, ownerKey: ImageRecord['ownerKey'], bytes: Uint8Array, createdAt: number, over: Partial<ImageRecord> = {}): ImageRecord => ({
  id, projectId, ownerKey, kind: ownerKey.startsWith('anchor') ? 'anchor' : 'keyframe', blob: new Blob([bytes as BlobPart], { type: 'image/png' }), mime: 'image/png', width: 1376, height: 768, model: 'gemini-x', prompt: 'p', source: 'generated', createdAt, ...over,
});

async function seed() {
  const p = await db.createProject('My Song');
  await db.putProject({
    ...p, runtimeSec: 50, lrcRaw: '[00:03.00] hello\n[00:14.00] (oh)', audioBrief: '# SINGING STOP TAGS\n[00:40.00] [ECHO]\n', treatment,
    stopTagsChecked: '40.00:ECHO', manualTags: [{ t: 7, tag: 'NARRATOR', endT: 9 }], backingMode: 'omit', tagSpelling: 'own', audioFileName: 'song.mp3',
    vision: { narrativeArc: 'arc', visualTone: '', mood: '', palette: '', aesthetic: '' },
  });
  const scenes = goodLedger();
  scenes[1] = { ...scenes[1], checklist: { baseGenerated: true }, revisions: [{ at: 5, request: 'too fast', notes: 'n', old: { basePrompt: 'old', extensionPrompt: null, keyframePrompt: 'k' } }], needs_review: true };
  await db.replaceBlueprint(p.id, [{ id: 'character', name: 'Character', category: 'character', prompt: 'A keeper' }], scenes);
  await db.putImage(img(p.id, 'a-old', 'anchor:character', PNG, 1));
  await db.putImage(img(p.id, 'a-new', 'anchor:character', Uint8Array.from([...PNG, 7]), 2));
  await db.putImage(img(p.id, 'k1', 'scene:1', JPG, 3, { mime: 'image/jpeg', refImageIds: ['a-new', 'gone'] }));
  await db.addRun({ id: 'r1', projectId: p.id, kind: 'revision', createdAt: 9, payload: { scene: 2 }, usage: { input_tokens: 1, output_tokens: 2 } });
  return p.id;
}

const roundTrip = async (id: string) => importProjectArchive((await exportProjectArchive(id)).blob);

describe('project archive: export then import', () => {
  it('restores everything as a NEW project and leaves the original untouched', async () => {
    const id = await seed();
    const before = await db.getProject(id);
    const copy = await roundTrip(id);

    expect(copy.id).not.toBe(id);
    expect(copy.name).toBe('My Song (imported)');
    expect((await db.listProjects()).map((p) => p.name).sort()).toEqual(['My Song', 'My Song (imported)']);
    expect(await db.getProject(id)).toEqual(before);
    expect((await db.getScenes(id)).every((s) => s.projectId === id)).toBe(true);

    const got = (await db.getProject(copy.id))!;
    expect(got).toMatchObject({ runtimeSec: 50, treatment, stopTagsChecked: '40.00:ECHO', manualTags: [{ t: 7, tag: 'NARRATOR', endT: 9 }], backingMode: 'omit', tagSpelling: 'own', audioFileName: 'song.mp3', audioBrief: before!.audioBrief });
    expect(got.lrcLines).toEqual([{ t: 3, text: 'hello' }, { t: 14, text: '(oh)' }]);
    expect(got.vision.narrativeArc).toBe('arc');
  });

  it('keeps anchors, scenes, checklist, revisions and the needs-review flag', async () => {
    const copy = await roundTrip(await seed());
    expect(await db.getAnchors(copy.id)).toEqual([{ id: 'character', name: 'Character', category: 'character', prompt: 'A keeper', projectId: copy.id, order: 0 }]);
    const scenes = await db.getScenes(copy.id);
    expect(scenes).toHaveLength(4);
    expect(scenes.every((s) => s.projectId === copy.id)).toBe(true);
    expect(scenes[1].checklist).toEqual({ baseGenerated: true });
    expect(scenes[1].revisions?.[0]).toMatchObject({ request: 'too fast', old: { basePrompt: 'old' } });
    expect(scenes[1].needs_review).toBe(true);
    expect(scenes[0].base_prompt).toBe('b');
  });

  it('keeps every image version with new ids, the same bytes and remapped references', async () => {
    const copy = await roundTrip(await seed());
    const imgs = await db.listProjectImages(copy.id);
    expect(imgs).toHaveLength(3);
    expect(imgs.every((i) => i.projectId === copy.id && !['a-old', 'a-new', 'k1'].includes(i.id))).toBe(true);
    const latest = await db.latestImages(copy.id);
    expect(new Uint8Array(await latest.get('anchor:character')!.blob.arrayBuffer())).toEqual(Uint8Array.from([...PNG, 7]));
    const k = latest.get('scene:1')!;
    expect(k.mime).toBe('image/jpeg');
    expect(new Uint8Array(await k.blob.arrayBuffer())).toEqual(JPG);
    // the reference to the anchor image now points at the copy's anchor image, and the dangling one is dropped
    expect(k.refImageIds).toEqual([latest.get('anchor:character')!.id]);
    expect(imgs.find((i) => i.createdAt === 1)).toBeTruthy(); // the older anchor version is still there
  });

  it('keeps the run history', async () => {
    const copy = await roundTrip(await seed());
    const runs = await db.listRuns(copy.id);
    expect(runs).toHaveLength(1);
    expect(runs[0]).toMatchObject({ kind: 'revision', payload: { scene: 2 }, usage: { input_tokens: 1, output_tokens: 2 } });
    expect(runs[0].id).not.toBe('r1');
  });

  it('can be imported twice, giving two independent copies', async () => {
    const id = await seed();
    const { blob } = await exportProjectArchive(id);
    const a = await importProjectArchive(blob);
    const b = await importProjectArchive(blob);
    expect(a.id).not.toBe(b.id);
    expect(await db.listProjects()).toHaveLength(3);
  });

  it('contains no API keys, audio or storage keys, and also readable text files', async () => {
    const id = await seed();
    const a = await exportProjectArchive(id);
    expect(a.filename).toBe('My-Song-project.zip');
    const zip = await JSZip.loadAsync(await a.blob.arrayBuffer());
    const names = Object.keys(zip.files).filter((n) => !n.endsWith('/'));
    expect(names).toEqual(expect.arrayContaining(['My-Song-project/project.json', 'My-Song-project/ledger.md', 'My-Song-project/lipsync-handoff.txt', 'My-Song-project/lyrics-for-lipsync.txt', 'My-Song-project/images/a-new.png', 'My-Song-project/images/k1.jpg', 'My-Song-project/images/INDEX.txt']));
    expect(names.some((n) => /\.(mp3|wav|m4a)$/.test(n))).toBe(false);
    const json = await zip.file('My-Song-project/project.json')!.async('string');
    expect(json).not.toMatch(/projectId|apiKey|AIza|sk-ant/);
    expect(a.imageCount).toBe(3);
  });
});

describe('importProjectArchive refuses bad files', () => {
  const zipOf = async (files: Record<string, string | Uint8Array>) => {
    const z = new JSZip();
    for (const [n, d] of Object.entries(files)) z.file(n, d);
    return z.generateAsync({ type: 'blob' });
  };
  const goodMeta = () => ({ format: 'gp-producer-project', version: 1, exportedAt: 1, project: { name: 'X', runtimeSec: 50, lrcRaw: '', vision: {}, audioBrief: '', treatment: null }, anchors: [], scenes: [], images: [] });
  const expectRejected = async (blob: Blob, re: RegExp) => {
    const before = (await db.listProjects()).length;
    const e = await importProjectArchive(blob).catch((x) => x);
    expect(e).toBeInstanceOf(ImportError);
    expect(e.message).toMatch(re);
    expect((await db.listProjects()).length).toBe(before); // nothing was written
  };

  it('rejects a file that is not a zip', async () => expectRejected(new Blob(['hello']), /isn't a zip/));
  it('rejects a zip with no project.json, including the export bundle', async () => {
    await expectRejected(await zipOf({ 'a.txt': 'x' }), /no project\.json/);
    const bundle = await buildBundle({ project: { ...(await db.createProject('B')) }, anchors: [], scenes: goodLedger(), images: new Map(), tags: [], withheld: 0, backing: 'tag' });
    await expectRejected(bundle.blob, /export bundle can't be imported/);
  });
  it('rejects invalid JSON and files from some other app', async () => {
    await expectRejected(await zipOf({ 'project.json': '{nope' }), /not valid JSON/);
    await expectRejected(await zipOf({ 'project.json': JSON.stringify({ hello: 1 }) }), /isn't a project file/);
  });
  it('rejects a damaged or newer project file, listing what is wrong', async () => {
    const bad = { ...goodMeta(), version: 2 };
    const e = await importProjectArchive(await zipOf({ 'project.json': JSON.stringify(bad) })).catch((x) => x);
    expect(e.message).toMatch(/damaged or from a newer version/);
    expect(e.problems.length).toBeGreaterThan(0);
  });
  it('rejects an image that is missing, or whose bytes are not the declared type', async () => {
    const meta = { ...goodMeta(), images: [{ id: 'i1', ownerKey: 'scene:1', kind: 'keyframe', mime: 'image/png', width: 10, height: 10, model: null, prompt: null, source: 'uploaded', createdAt: 1 }] };
    await expectRejected(await zipOf({ 'project.json': JSON.stringify(meta) }), /missing from the zip/);
    await expectRejected(await zipOf({ 'project.json': JSON.stringify(meta), 'images/i1.png': JPG }), /isn't really a PNG/);
    await expectRejected(await zipOf({ 'project.json': JSON.stringify(meta), 'images/i1.png': new TextEncoder().encode('<svg onload=alert(1)>') }), /isn't really a PNG/);
  });
  it('refuses unsafe image ids and owners instead of using them as paths', async () => {
    const meta = { ...goodMeta(), images: [{ id: '../../evil', ownerKey: 'scene:1', kind: 'keyframe', mime: 'image/png', width: 10, height: 10, model: null, prompt: null, source: 'uploaded', createdAt: 1 }] };
    await expectRejected(await zipOf({ 'project.json': JSON.stringify(meta) }), /isn't a project file|damaged/);
    const meta2 = { ...goodMeta(), images: [{ id: 'ok', ownerKey: 'something-else', kind: 'keyframe', mime: 'image/png', width: 10, height: 10, model: null, prompt: null, source: 'uploaded', createdAt: 1 }] };
    await expectRejected(await zipOf({ 'project.json': JSON.stringify(meta2), 'images/ok.png': PNG }), /isn't a project file|damaged/);
  });
  it('accepts a minimal valid file with no images', async () => {
    const p = await importProjectArchive(await zipOf({ 'project.json': JSON.stringify(goodMeta()) }));
    expect(p.name).toBe('X (imported)');
    expect(p.vision.mood).toBe('');
  });
});

describe('sniffImageMime', () => {
  it('reads the real type from the first bytes', () => {
    expect(sniffImageMime(PNG)).toBe('image/png');
    expect(sniffImageMime(JPG)).toBe('image/jpeg');
    expect(sniffImageMime(new TextEncoder().encode('RIFF\0\0\0\0WEBPVP8 '))).toBe('image/webp');
    expect(sniffImageMime(new TextEncoder().encode('GIF89a'))).toBeNull();
    expect(sniffImageMime(new Uint8Array())).toBeNull();
  });
});
