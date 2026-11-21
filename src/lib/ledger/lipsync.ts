import type { LipSync, LrcLine } from '../../types/blueprint';
import { isBackingVocal, lyricsInRange } from '../lrc';

/** Shown on every LIP-SYNC scene. From the skill's Phase 3 rules. */
export const LIPSYNC_REMINDERS = [
  "Keep the singer's face the largest in frame, clearly visible and mostly front-facing.",
  'Keep the mouth unobstructed: microphone below or beside it, hands and hair clear.',
  'No dissolves, whip pans, strobing or glitch effects inside this shot.',
  'Avoid very fast cutting during sung lines.',
] as const;

/** Parenthesized backing vocals inside the vocal window: the on-screen singer shouldn't mouth these. */
export function backingLinesInWindow(lrc: LrcLine[], lip: LipSync): LrcLine[] {
  return lyricsInRange(lrc, lip.vocal_start_sec, lip.vocal_end_sec).filter((l) => isBackingVocal(l.text));
}
