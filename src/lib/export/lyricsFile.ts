import type { LrcLine } from '../../types/blueprint';
import type { BackingMode } from '../../types/project';
import type { StopTag } from '../brief';
import { fmtPrecise } from '../ledger/format';
import { isBackingVocal } from '../lrc';

export const BACKING_TAG = 'BACKING';

export const BACKING_MODE_LABEL: Record<BackingMode, string> = {
  tag: 'Replace with a [BACKING] no-singing tag (recommended)',
  omit: 'Leave out',
  include: 'Keep as sung lines',
};

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
 * singing doesn't carry on from the previous line.
 */
export function buildLyricsFile(lrc: LrcLine[], tags: StopTag[], backing: BackingMode = 'tag'): string {
  const entries: Entry[] = [];
  let inBackingRun = false;
  for (const l of [...lrc].sort((a, b) => a.t - b.t)) {
    if (!isBackingVocal(l.text)) {
      entries.push({ t: l.t, rank: 0, text: l.text });
      inBackingRun = false;
    } else if (backing === 'include') {
      entries.push({ t: l.t, rank: 0, text: l.text });
    } else if (backing === 'tag' && !inBackingRun) {
      entries.push({ t: l.t, rank: 1, text: `[${BACKING_TAG}]` });
      inBackingRun = true;
    } else if (backing === 'tag') {
      // later line of the same run: covered by the tag already placed
    }
  }
  for (const g of tags) entries.push({ t: g.t, rank: 1, text: `[${g.tag}]` });
  entries.sort((a, b) => a.t - b.t || a.rank - b.rank);
  return entries.length ? `${entries.map((e) => `[${fmtPrecise(e.t)}] ${e.text}`).join('\n')}\n` : '';
}

/** How many backing lines the setting affects, for the explanatory note. */
export const countBacking = (lrc: LrcLine[]): number => lrc.filter((l) => isBackingVocal(l.text)).length;
