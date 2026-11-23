// Song Spec support (GP Song Tools shared file). Reads Timed lyrics (owner: Framecut), writes Video sequence (owner: GP Producer).
// songspec.js is a vendored UMD file that is never edited; as a module it sets globalThis.SongSpec, so import it for that effect.
import '../vendor/songspec.js';
import type { SongSpecApi, SongSpecDoc } from '../vendor/songspec';
import { parseLrc } from './lrc';
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

/** `M:SS` (minutes may pass 59). */
export function mmss(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

const normLrc = (t: string): string => t.replace(/\r\n?/g, '\n').trim();

export interface SpecOffers {
  timed: { body: string; by: string; tool: string; count: number; first: number; last: number; inUse: boolean } | null;
  /** The spec has Lyrics but no Timed lyrics. */
  lyricsOnly: boolean;
  duration: { sec: number; inUse: boolean } | null;
  title: { value: string; inUse: boolean } | null;
  stale: string[];
  /** Labels of what this project already uses, e.g. "Timed lyrics (Framecut)". */
  usedLabels: string[];
}

/** What a spec text offers this project: rows with in-use flags. Empty/null spec offers nothing. */
export function specOffers(specText: string, project: { lrcRaw: string; runtimeSec: number | null; name: string }): SpecOffers | null {
  if (!specText) return null;
  const doc = SongSpec.parse(specText);
  const ts = SongSpec.section(doc, 'timed-lyrics');
  const tl = ts && ts.body.trim() ? ts : null;
  let timed: SpecOffers['timed'] = null;
  if (tl) {
    const lines = parseLrc(tl.body).lines;
    timed = {
      body: tl.body, by: tl.by, tool: SongSpec.toolName(tl.by) === 'unknown' ? 'hand' : SongSpec.toolName(tl.by),
      count: lines.length, first: lines[0]?.t ?? 0, last: lines[lines.length - 1]?.t ?? 0,
      inUse: normLrc(project.lrcRaw) === normLrc(tl.body),
    };
  }
  const lyr = SongSpec.section(doc, 'lyrics');
  const dur = Number(SongSpec.setting(doc, 'duration'));
  const duration = Number.isFinite(dur) && dur >= 15 && dur <= 360 && Number.isInteger(dur) ? { sec: dur, inUse: project.runtimeSec === dur } : null;
  const t = SongSpec.setting(doc, 'title').trim();
  const title = t ? { value: t, inUse: project.name === t } : null;
  const usedLabels = [
    ...(timed?.inUse ? [`Timed lyrics (${timed.tool})`] : []),
    ...(duration?.inUse ? ['Duration'] : []),
    ...(title?.inUse ? ['Title'] : []),
  ];
  const out: SpecOffers = {
    timed, lyricsOnly: !tl && !!lyr && !!lyr.body.trim(), duration, title,
    stale: tl ? SongSpec.staleNotes(doc, 'timed-lyrics') : [], usedLabels,
  };
  return timed || out.lyricsOnly || duration || title ? out : null;
}

/** True when the spec's Video sequence section matches what these scenes would write. */
export function videoSequenceStatus(
  specText: string,
  scenes: SceneTiming[],
): { state: 'none' } | { state: 'current' | 'outdated'; by: string; tool: string; at: string; count: number } {
  if (!specText) return { state: 'none' };
  const s = SongSpec.section(SongSpec.parse(specText), 'video-sequence');
  if (!s || !s.body.trim()) return { state: 'none' };
  const tool = SongSpec.toolName(s.by) === 'unknown' ? 'hand' : SongSpec.toolName(s.by);
  return {
    state: scenes.length > 0 && s.body.trim() === buildVideoSequence(scenes).trim() ? 'current' : 'outdated',
    by: s.by, tool, at: s.at, count: s.body.split('\n').filter((l) => l.trim()).length,
  };
}

export type SaveResult = { status: 'saved' } | { status: 'cancelled' } | { status: 'blocked' };

/** Updates the shared copy (creating a spec when there is none). Asks `ask(reason)` first when the existing section was edited by hand or written by another tool. */
export function saveVideoSequenceToShared(scenes: SceneTiming[], ask: (reason: string) => boolean): SaveResult {
  const current = loadShared();
  const reason = current ? SongSpec.confirmReason(SongSpec.parse(current), 'video-sequence', OWNER) : '';
  if (reason && !ask(reason)) return { status: 'cancelled' };
  try {
    SongSpec.store.update((doc) => setVideoSequence(doc, scenes)); // re-reads, so another tab's changes survive
  } catch {
    return { status: 'blocked' };
  }
  return { status: 'saved' };
}
