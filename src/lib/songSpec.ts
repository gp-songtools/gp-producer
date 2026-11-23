// Song Spec support (GP Song Tools shared file). Reads Timed lyrics (owner: Framecut), writes Video sequence (owner: GP Producer).
// songspec.js is a vendored UMD file that is never edited; as a module it sets globalThis.SongSpec, so import it for that effect.
import '../vendor/songspec.js';
import type { SongSpecApi, SongSpecDoc } from '../vendor/songspec';
import { buildFileTag } from './ledger/fileTag';
import type { BlueprintScene } from '../types/blueprint';

const lib = (globalThis as { SongSpec?: SongSpecApi }).SongSpec;
if (!lib) throw new Error('songspec.js did not load');
export const SongSpec: SongSpecApi = lib;

export const OWNER = 'gp-producer';
export type SceneTiming = Pick<BlueprintScene, 'scene' | 'section' | 'start_sec' | 'end_sec'>;

/** The Timed lyrics section as plain LRC, and which tool wrote it. Null when missing or empty. */
export function readTimedLyrics(specText: string): { lrc: string; by: string } | null {
  const s = SongSpec.section(SongSpec.parse(specText), 'timed-lyrics');
  if (!s || !s.body.trim()) return null;
  return { lrc: s.body, by: s.by };
}

/** `[mm:ss.xx]`; minutes zero-padded to 2 and may pass 59. */
export function lrcStamp(sec: number): string {
  const cs = Math.round(Math.max(0, sec) * 100);
  const mm = Math.floor(cs / 6000);
  const ss = (cs % 6000) / 100;
  return `[${String(mm).padStart(2, '0')}:${ss.toFixed(2).padStart(5, '0')}]`;
}

/** One `[mm:ss.xx] clip-name` line per scene, in scene order. */
export function buildVideoSequence(scenes: SceneTiming[]): string {
  return [...scenes]
    .sort((a, b) => a.scene - b.scene)
    .map((s) => `${lrcStamp(s.start_sec)} ${buildFileTag(s)}`)
    .join('\n');
}

function setVideoSequence(doc: SongSpecDoc, scenes: SceneTiming[]): void {
  const from = SongSpec.section(doc, 'timed-lyrics') ? ['timed-lyrics'] : [];
  SongSpec.setSection(doc, 'video-sequence', buildVideoSequence(scenes), { by: OWNER, from });
}

/** Writes the Video sequence section into a spec text. `confirm` is non-empty when the section has hand edits to ask about. */
export function writeVideoSequence(specText: string, scenes: SceneTiming[]): { text: string; confirm: string } {
  const doc = SongSpec.parse(specText);
  const confirm = SongSpec.confirmReason(doc, 'video-sequence', OWNER);
  setVideoSequence(doc, scenes);
  return { text: SongSpec.serialize(doc), confirm };
}

/** The shared browser copy ('' when there is none). */
export const loadShared = (): string => SongSpec.store.load();

/** The shared copy's Timed lyrics, or null. */
export function sharedTimedLyrics(): { lrc: string; by: string } | null {
  const t = loadShared();
  return t ? readTimedLyrics(t) : null;
}

export type SaveResult = { status: 'saved' } | { status: 'no-shared' } | { status: 'cancelled' } | { status: 'blocked' };

/** Updates the shared copy. Asks `ask(reason)` first when the existing section was edited by hand or written by another tool. */
export function saveVideoSequenceToShared(scenes: SceneTiming[], ask: (reason: string) => boolean): SaveResult {
  const current = loadShared();
  if (!current) return { status: 'no-shared' };
  const reason = SongSpec.confirmReason(SongSpec.parse(current), 'video-sequence', OWNER);
  if (reason && !ask(reason)) return { status: 'cancelled' };
  try {
    SongSpec.store.update((doc) => setVideoSequence(doc, scenes)); // re-reads, so another tab's changes survive
  } catch {
    return { status: 'blocked' };
  }
  return { status: 'saved' };
}

/** Text to download: the opened spec, else the shared copy, else a new one, with the Video sequence written in. */
export function videoSequenceDownload(scenes: SceneTiming[], base?: string): { text: string; name: string; confirm: string } {
  const out = writeVideoSequence(base || loadShared() || SongSpec.create(), scenes);
  return { ...out, name: SongSpec.fileName(SongSpec.parse(out.text)) };
}

// The spec file opened on the Setup tab this session (memory only), offered as the base for the Production download.
let opened: string | undefined;
export const setOpenedSpec = (text: string | undefined): void => { opened = text; };
export const getOpenedSpec = (): string | undefined => opened;
