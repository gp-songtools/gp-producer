import type { Scene } from '../../types/blueprint';
import { fmt } from './format';
import { MAX_D, MIN_D, preferredSplit, validSplit } from './rules';

export type SnapResult =
  | { ok: true; scenes: Scene[]; reviewScenes: number[] }
  | { ok: false; reason: string };

/**
 * Deterministic boundary repair: each start becomes the previous end, the first start becomes 0
 * and the last end becomes the runtime. A scene whose length no longer matches its base/extension
 * is re-split (preferred split), and flagged for review because its prompts may no longer fit.
 * Fails (changing nothing) if any resulting length is outside the allowed range.
 */
export function snapBoundaries(scenes: Scene[], runtimeSec: number): SnapResult {
  if (scenes.length === 0) return { ok: false, reason: 'There are no scenes to repair.' };
  const sorted = [...scenes].sort((a, b) => a.scene - b.scene);
  const out: Scene[] = [];
  const reviewScenes: number[] = [];

  for (let i = 0; i < sorted.length; i++) {
    const s = sorted[i];
    const start = i === 0 ? 0 : out[i - 1].end_sec;
    const end = i === sorted.length - 1 ? runtimeSec : s.end_sec;
    const D = end - start;
    if (!Number.isInteger(D) || D < MIN_D || D > MAX_D)
      return {
        ok: false,
        reason: `Scene ${s.scene} would be ${D}s (${fmt(start)}–${fmt(end)}); snapping can't fix this, ask Claude to rebuild the ledger.`,
      };

    let next: Scene = { ...s, start_sec: start, end_sec: end, duration_sec: D };
    const keepsSplit = s.base_sec + (s.extension_sec ?? 0) === D && validSplit(s.base_sec, s.extension_sec);
    if (!keepsSplit) {
      const split = preferredSplit(D)!;
      next = {
        ...next,
        base_sec: split.base,
        extension_sec: split.ext,
        extension_reason: split.ext === null ? null : s.extension_reason ?? '',
        extension_prompt: split.ext === null ? null : s.extension_prompt ?? '',
        needs_review: true,
      };
      reviewScenes.push(s.scene);
    }
    out.push(next);
  }
  return { ok: true, scenes: out, reviewScenes };
}
