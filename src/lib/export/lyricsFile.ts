import type { LrcLine } from '../../types/blueprint';
import type { BackingMode, TagSpelling } from '../../types/project';
import { inRanges, narratorRanges, NARRATOR, type StopTag } from '../brief';
import { fmtPrecise } from '../ledger/format';
import { isBackingVocal } from '../lrc';

export const BACKING_TAG = 'BACKING';

export const BACKING_MODE_LABEL: Record<BackingMode, string> = {
  tag: 'Replace with a [BACKING] no-singing tag (recommended)',
  omit: 'Leave out',
  include: 'Keep as sung lines',
};

export const TAG_SPELLING_LABEL: Record<TagSpelling, string> = {
  instrumental: '[INSTRUMENTAL] (works with the notebook as it is)',
  labeled: '[INSTRUMENTAL NARRATOR] / [INSTRUMENTAL BACKING]',
  own: '[NARRATOR] / [BACKING]',
};

/** The text written between the brackets. Only NARRATOR and BACKING (the app's own no-singing labels) are respelled. */
export function spellTag(label: string, spelling: TagSpelling): string {
  if (label !== NARRATOR && label !== BACKING_TAG) return label;
  return spelling === 'instrumental' ? 'INSTRUMENTAL' : spelling === 'labeled' ? `INSTRUMENTAL ${label}` : label;
}

interface Entry {
  t: number;
  /** Sort rank at the same instant: sung lines, then tags. */
  rank: number;
  text: string;
}

/**
 * `lyrics-for-lipsync.txt`: the whole song in `.lrc` style. A timed line counts as singing; a bracketed tag counts as no
 * singing. The lip-sync step redraws one face per shot, so it can't give a second vocalist their own mouth: backing-vocal
 * lines (wholly in parentheses) would make the lead mouth them. By default a run of them becomes one no-singing tag, so
 * singing doesn't carry on from the previous line (spelled per `spelling`, `[INSTRUMENTAL]` by default). Lines inside a NARRATOR span (offscreen narration) are dropped and the span's
 * tag stands in for them, so the on-screen face isn't lip-synced to the narrator.
 */
export function buildLyricsFile(lrc: LrcLine[], tags: StopTag[], backing: BackingMode = 'tag', spelling: TagSpelling = 'instrumental'): string {
  const entries: Entry[] = [];
  let inBackingRun = false;
  const narrated = narratorRanges(tags);
  for (const l of [...lrc].sort((a, b) => a.t - b.t)) {
    if (inRanges(l.t, narrated)) continue;
    if (!isBackingVocal(l.text)) {
      entries.push({ t: l.t, rank: 0, text: l.text });
      inBackingRun = false;
    } else if (backing === 'include') {
      entries.push({ t: l.t, rank: 0, text: l.text });
    } else if (backing === 'tag' && !inBackingRun) {
      entries.push({ t: l.t, rank: 1, text: `[${spellTag(BACKING_TAG, spelling)}]` });
      inBackingRun = true;
    } else if (backing === 'tag') {
      // later line of the same run: covered by the tag already placed
    }
  }
  for (const g of tags) entries.push({ t: g.t, rank: 1, text: `[${spellTag(g.tag, spelling)}]` });
  entries.sort((a, b) => a.t - b.t || a.rank - b.rank);
  // Respelling can make two tags identical at the same instant (a narrator span starting on a backing run): keep one.
  const lines = entries.filter((e, i) => !(i > 0 && e.rank === 1 && entries[i - 1].rank === 1 && entries[i - 1].t === e.t && entries[i - 1].text === e.text));
  return lines.length ? `${lines.map((e) => `[${fmtPrecise(e.t)}] ${e.text}`).join('\n')}\n` : '';
}

/** How many backing lines the setting affects, for the explanatory note. */
export const countBacking = (lrc: LrcLine[]): number => lrc.filter((l) => isBackingVocal(l.text)).length;
