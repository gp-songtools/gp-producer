import audioBriefMd from '../../gemini-audio-brief.md?raw';
import type { LrcLine } from '../types/blueprint';
import type { Vision } from '../types/project';
import { fmt, fmtPrecise } from './ledger/format';
import { feasibleSceneCounts, SCENE_RULES } from './ledger/rules';

export const LYRICS_PLACEHOLDER = '[PASTE LYRICS HERE, OR WRITE "NONE"]';

/** The Gemini prompt: the first ```text block of gemini-audio-brief.md, which stays the single source of truth. */
export function extractBriefPrompt(md: string = audioBriefMd): string | null {
  const m = /```text\r?\n([\s\S]*?)\r?\n```/.exec(md);
  return m ? m[1] : null;
}

export const formatLyricsForBrief = (lines: LrcLine[]): string =>
  lines.length ? lines.map((l) => `[${fmtPrecise(l.t)}] ${l.text}`).join('\n') : 'NONE';

/** Fills the lyrics placeholder. Uses a function replacer so `$` in lyrics is never treated as a pattern. */
export function fillBriefPrompt(prompt: string, lines: LrcLine[]): string {
  return prompt.replace(LYRICS_PLACEHOLDER, () => formatLyricsForBrief(lines));
}

export type RuntimeCheck =
  | { ok: true; seconds: number; scenesLow: number; scenesHigh: number }
  | { ok: false; reason: 'empty' | 'unreadable' | 'too_short' | 'before_last_lyric'; message: string };

/**
 * Checks a runtime against the lyrics. `scenesLow..High` is the count at the default base-only
 * length (10-15s); anything up to 19s with extensions is also possible.
 */
export function checkRuntime(seconds: number | null, parsed: boolean, lrc: LrcLine[]): RuntimeCheck {
  if (seconds === null)
    return parsed
      ? { ok: false, reason: 'empty', message: 'Enter the total song length, e.g. 3:34 or 214.' }
      : { ok: false, reason: 'unreadable', message: 'Use mm:ss or whole seconds, e.g. 3:34 or 214.' };
  if (feasibleSceneCounts(seconds).length === 0)
    return { ok: false, reason: 'too_short', message: `Must be at least ${SCENE_RULES.baseMin}s to fit one scene.` };
  const lastT = lrc.length ? lrc[lrc.length - 1].t : 0;
  if (lrc.length && seconds <= lastT)
    return { ok: false, reason: 'before_last_lyric', message: `The last lyric starts at ${fmt(lastT)}, so the song must run longer than that.` };
  return {
    ok: true,
    seconds,
    scenesLow: Math.ceil(seconds / SCENE_RULES.baseMax),
    scenesHigh: Math.floor(seconds / SCENE_RULES.baseMin),
  };
}

export interface ReadinessItem {
  id: 'lyrics' | 'runtime' | 'vision' | 'key' | 'brief' | 'audio';
  label: string;
  done: boolean;
  required: boolean;
  hint?: string;
}

export interface ReadinessInput {
  lrcLines: LrcLine[];
  runtimeSec: number | null;
  vision: Vision;
  audioBrief: string;
  hasAnthropicKey: boolean;
  audioLoaded: boolean;
}

export function setupReadiness(i: ReadinessInput): { items: ReadinessItem[]; ready: boolean } {
  const runtime = checkRuntime(i.runtimeSec, true, i.lrcLines);
  const items: ReadinessItem[] = [
    { id: 'lyrics', label: 'Lyrics with timestamps', done: i.lrcLines.length > 0, required: true, hint: 'Paste or upload an .lrc file.' },
    { id: 'runtime', label: 'Total song runtime', done: runtime.ok, required: true, hint: runtime.ok ? undefined : runtime.message },
    {
      id: 'vision',
      label: 'Thematic vision',
      done: Object.values(i.vision).some((v) => v.trim()),
      required: true,
      hint: 'Fill in at least the narrative arc or visual tone.',
    },
    { id: 'key', label: 'Anthropic API key', done: i.hasAnthropicKey, required: true, hint: 'Add it under Settings.' },
    { id: 'brief', label: 'Gemini audio brief', done: !!i.audioBrief.trim(), required: false },
    { id: 'audio', label: 'Local audio for scrubbing', done: i.audioLoaded, required: false },
  ];
  return { items, ready: items.every((x) => !x.required || x.done) };
}
