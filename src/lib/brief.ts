import { fmt } from './ledger/format';

export interface StopTag {
  /** Seconds from song start. */
  t: number;
  /** Upper-cased label without brackets, e.g. "ECHO". */
  tag: string;
  /** From the Gemini brief (a draft until checked by ear) or typed in by the user (already checked). */
  source?: 'brief' | 'manual';
  /** NARRATOR only: where the offscreen narration ends. Lyric lines starting in [t, endT) belong to the narrator. */
  endT?: number;
}

/** Tag names offered in the UI. Any label can be typed; these are the ones with a meaning here. */
export const NARRATOR = 'NARRATOR';
export const KNOWN_TAGS = ['INSTRUMENTAL', 'ECHO', NARRATOR] as const;

export interface VocalSegment {
  start: number;
  end: number;
  /** Upper-cased type as Gemini wrote it, e.g. "LEAD SINGING", "NO VOCALS". */
  type: string;
  description: string;
}

/** "03:21.30" -> 201.3, "3:21" -> 201. Null if it isn't a clock time. */
export function parseClock(s: string): number | null {
  const m = /^(\d{1,3}):([0-5]\d)(?:[.,](\d{1,3}))?$/.exec(s.trim());
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]) + (m[3] ? Number(`0.${m[3]}`) : 0);
}

/** The lines of one "# HEADING" section of the brief, or null if it has no such heading. */
function section(brief: string, heading: RegExp): string[] | null {
  const lines = brief.split(/\r?\n/);
  const i = lines.findIndex((l) => /^\s*#{1,6}\s/.test(l) && heading.test(l));
  if (i < 0) return null;
  const rest = lines.slice(i + 1);
  const end = rest.findIndex((l) => /^\s*#{1,6}\s/.test(l));
  return end < 0 ? rest : rest.slice(0, end);
}

const STOP_LINE = /^\s*(?:[-*•]\s*)?\[(\d{1,3}:[0-5]\d(?:[.,]\d{1,3})?)\]\s*\[([^\]]+)\]/;

/**
 * Singing stop tags, e.g. `[02:41.00] [INSTRUMENTAL]`. Read from the "SINGING STOP TAGS" section; if the brief has no such
 * heading, any line shaped like a timed tag is taken. Lyric lines ("[03:17.40] some words") have no second bracket and are ignored.
 */
export function parseStopTags(brief: string): StopTag[] {
  const lines = section(brief, /stop\s*tags?/i) ?? brief.split(/\r?\n/);
  const out: StopTag[] = [];
  for (const line of lines) {
    const m = STOP_LINE.exec(line);
    const t = m ? parseClock(m[1]) : null;
    if (m && t !== null) out.push({ t, tag: m[2].trim().toUpperCase(), source: 'brief' });
  }
  return out.sort((a, b) => a.t - b.t);
}

/** Identifies a set of tags, so a tick of "checked by ear" lapses when the tags change. */
export const stopTagSignature = (tags: StopTag[]): string => tags.map((t) => `${t.t.toFixed(2)}:${t.tag}`).join('|');

/** Rows of the "VOCAL MAP" table: `| Start | End | Type | Words |`. Header and separator rows are skipped. */
export function parseVocalMap(brief: string): VocalSegment[] {
  const lines = section(brief, /vocal\s*map/i) ?? [];
  const out: VocalSegment[] = [];
  for (const line of lines) {
    if (!line.includes('|')) continue;
    const cells = line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
    if (cells.length < 3) continue;
    const start = parseClock(cells[0]);
    const end = parseClock(cells[1]);
    if (start === null || end === null) continue;
    out.push({ start, end, type: cells[2].toUpperCase(), description: cells.slice(3).join(' | ') });
  }
  return out;
}

/** Vocal types that make close-up singing a bad idea (the lead isn't singing, or can't be separated from backing). */
const RISKY = ['NO VOCALS', 'ECHO OR DELAY TAIL', 'BACKING ONLY'];

export interface VocalOverlap {
  segment: VocalSegment;
  risky: boolean;
}

/** Segments of the vocal map that overlap [start, end]. */
export function vocalOverlaps(map: VocalSegment[], start: number, end: number): VocalOverlap[] {
  return map.filter((s) => s.start < end && s.end > start).map((segment) => ({ segment, risky: RISKY.includes(segment.type) }));
}

export const segmentLabel = (s: VocalSegment): string => `${fmt(s.start)}–${fmt(s.end)} ${s.type}`;

/**
 * Validates a tag typed in by the user: a clock time and a label, with or without the brackets. A NARRATOR tag may also
 * carry an end time: the offscreen narrator speaks from `time` to `endTime`, and those lyric lines aren't lip-synced.
 */
export function parseTagInput(time: string, label: string, endTime = ''): { ok: true; tag: StopTag } | { ok: false; message: string } {
  const t = parseClock(time.trim());
  if (t === null) return { ok: false, message: 'Enter the time as MM:SS or MM:SS.xx, e.g. 01:14 or 01:14.50.' };
  const tag = label.trim().replace(/^\[+|\]+$/g, '').trim().toUpperCase();
  if (!tag) return { ok: false, message: 'Enter a tag such as INSTRUMENTAL, ECHO or NARRATOR.' };
  if (/[\[\]\r\n]/.test(tag)) return { ok: false, message: 'Use a single word or phrase without brackets.' };
  if (!endTime.trim()) return { ok: true, tag: { t, tag, source: 'manual' } };
  if (tag !== NARRATOR) return { ok: false, message: 'Only a NARRATOR tag takes an end time.' };
  const endT = parseClock(endTime.trim());
  if (endT === null) return { ok: false, message: 'Enter the end time as MM:SS or MM:SS.xx.' };
  if (endT <= t) return { ok: false, message: 'The end time must be after the start time.' };
  return { ok: true, tag: { t, tag, source: 'manual', endT } };
}

/** Spans of offscreen narration: [start, end). A NARRATOR tag without an end time marks a single moment, not a span. */
export function narratorRanges(tags: StopTag[]): { start: number; end: number }[] {
  return tags.filter((g) => g.tag === NARRATOR && g.endT !== undefined && g.endT > g.t).map((g) => ({ start: g.t, end: g.endT! }));
}

export const inRanges = (t: number, ranges: { start: number; end: number }[]): boolean => ranges.some((r) => t >= r.start && t < r.end);

/** The vocal map's SPOKEN stretches, offered as one-click NARRATOR candidates. They may be on-screen dialogue, so never applied automatically. */
export function narratorSuggestions(map: VocalSegment[]): { t: number; endT: number }[] {
  return map.filter((m) => m.type === 'SPOKEN' && m.end > m.start).map((m) => ({ t: m.start, endT: m.end }));
}

/** Tags that may go into the exported files: the user's own, plus the brief's once those are checked by ear. Time-sorted. */
export function usableTags(briefTags: StopTag[], manual: StopTag[], briefChecked: boolean): StopTag[] {
  return [...(briefChecked ? briefTags : []), ...manual].sort((a, b) => a.t - b.t);
}
