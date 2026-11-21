import type { Issue, LrcLine, Scene } from '../../types/blueprint';
import { lyricsInRange } from '../lrc';
import { fmt } from './format';
import { feasibleSceneCounts, validSplit } from './rules';

/** Error codes that deterministic boundary snapping can address. */
export const BOUNDARY_CODES = ['GAP', 'OVERLAP', 'START_NOT_ZERO', 'END_MISMATCH'];

export function validateLedger(
  scenes: Scene[],
  runtimeSec: number,
  lrc: LrcLine[],
  anchorIds: Set<string>,
): Issue[] {
  const issues: Issue[] = [];
  const err = (code: string, message: string, scene?: number) =>
    issues.push({ severity: 'error', code, message, scene });
  const warn = (code: string, message: string, scene?: number) =>
    issues.push({ severity: 'warn', code, message, scene });

  if (feasibleSceneCounts(runtimeSec).length === 0)
    err('RUNTIME_UNTILEABLE', `${runtimeSec}s cannot be split into 10–19s scenes.`);
  if (scenes.length === 0) {
    err('NO_SCENES', 'Ledger is empty.');
    return issues;
  }

  const sorted = [...scenes].sort((a, b) => a.scene - b.scene);

  sorted.forEach((s, i) => {
    const n = s.scene;
    if (s.scene !== i + 1) err('SCENE_NUMBER', `Expected scene ${i + 1}, found ${s.scene}.`, n);

    if (![s.start_sec, s.end_sec, s.duration_sec, s.base_sec].every(Number.isInteger))
      err('NON_INTEGER', 'Timestamps and lengths must be whole seconds.', n);

    const actual = s.end_sec - s.start_sec;
    if (actual !== s.duration_sec)
      err('DURATION_MISMATCH', `Stated ${s.duration_sec}s but ${fmt(s.start_sec)}–${fmt(s.end_sec)} is ${actual}s.`, n);
    if (!validSplit(s.base_sec, s.extension_sec))
      err(
        'BAD_SPLIT',
        `Base ${s.base_sec}s + extension ${s.extension_sec ?? 0}s is not allowed (base 10–15s; extension none, 3s or 4s).`,
        n,
      );
    if (s.base_sec + (s.extension_sec ?? 0) !== actual)
      err('SPLIT_MISMATCH', `${s.base_sec}s base + ${s.extension_sec ?? 0}s extension ≠ ${actual}s scene.`, n);

    if (i === 0 && s.start_sec !== 0)
      err('START_NOT_ZERO', `First scene starts at ${fmt(s.start_sec)}, not 00:00.`, n);
    if (i > 0) {
      const prevEnd = sorted[i - 1].end_sec;
      if (s.start_sec > prevEnd)
        err('GAP', `Gap of ${s.start_sec - prevEnd}s before this scene (${fmt(prevEnd)}→${fmt(s.start_sec)}).`, n);
      if (s.start_sec < prevEnd) err('OVERLAP', `Overlaps previous scene by ${prevEnd - s.start_sec}s.`, n);
    }

    if (s.extension_sec !== null) {
      if (!s.extension_prompt?.trim())
        err('MISSING_EXTENSION', `A ${s.extension_sec}s extension needs an extension prompt.`, n);
      if (!s.extension_reason?.trim())
        err('NO_EXTENSION_REASON', 'An extension needs a stated special requirement.', n);
    } else if (s.extension_prompt) {
      err('ORPHAN_EXTENSION', 'Extension prompt present but extension_sec is null.', n);
    }

    if (s.anchor_ids.length === 0) err('NO_ANCHORS', 'No reference anchors attached.', n);
    for (const id of s.anchor_ids)
      if (!anchorIds.has(id)) err('UNKNOWN_ANCHOR', `Unknown anchor "${id}".`, n);

    // A lyric line starting in the last second is likely cut off by the scene boundary.
    for (const l of lyricsInRange(lrc, s.start_sec, s.end_sec))
      if (s.end_sec - l.t < 1)
        warn('LYRIC_AT_EDGE', `"${l.text}" begins ${(s.end_sec - l.t).toFixed(1)}s before the cut.`, n);

    if (s.lip_sync) {
      const { vocal_start_sec: a, vocal_end_sec: b } = s.lip_sync;
      if (a < s.start_sec || b > s.end_sec || a >= b)
        err('LIPSYNC_RANGE', `Vocal window ${fmt(a)}–${fmt(b)} falls outside the scene or is inverted.`, n);
      else if (lyricsInRange(lrc, a, b).length === 0)
        warn('LIPSYNC_NO_LYRICS', 'LIP-SYNC scene has no lyric lines in its vocal window.', n);
    }
  });

  const last = sorted[sorted.length - 1];
  if (last.end_sec !== runtimeSec)
    err('END_MISMATCH', `Last scene ends ${fmt(last.end_sec)} but runtime is ${fmt(runtimeSec)}.`, last.scene);

  for (const l of lrc)
    if (l.t >= runtimeSec) err('LYRIC_PAST_END', `Lyric "${l.text}" at ${fmt(l.t)} is at or after the stated runtime.`);

  return issues;
}

export const hasErrors = (issues: Issue[]) => issues.some((i) => i.severity === 'error');
