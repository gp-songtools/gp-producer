import type { LrcLine, Scene } from '../../types/blueprint';
import type { StopTag } from '../brief';
import { buildFileTag } from '../ledger/fileTag';
import { fmt, fmtPrecise } from '../ledger/format';
import { backingLinesInWindow, LIPSYNC_REMINDERS } from '../ledger/lipsync';
import { isBackingVocal } from '../lrc';

export interface BlockItem {
  t: number;
  kind: 'lyric' | 'tag';
  /** A lyric line's text, or a tag's label without brackets. */
  text: string;
  /** Lyric only: a parenthesised backing vocal. */
  backing?: boolean;
}

/** The scene's lyric lines and singing-stop tags in time order. Lyrics start in [start, end); a tag may sit exactly on the cut. */
export function lyricBlock(lrc: LrcLine[], tags: StopTag[], start: number, end: number): BlockItem[] {
  const items: BlockItem[] = [
    ...lrc.filter((l) => l.t >= start && l.t < end).map((l): BlockItem => ({ t: l.t, kind: 'lyric', text: l.text, ...(isBackingVocal(l.text) ? { backing: true } : {}) })),
    ...tags.filter((g) => g.t >= start && g.t <= end).map((g): BlockItem => ({ t: g.t, kind: 'tag', text: g.tag })),
  ];
  // Stable for ties: lyrics before a tag at the same instant.
  return items.sort((a, b) => a.t - b.t || (a.kind === b.kind ? 0 : a.kind === 'lyric' ? -1 : 1));
}

/** One line in the skill's format: `[03:17.40] text` or `[03:21.30] [ECHO]`. */
export const blockLine = (i: BlockItem): string => `[${fmtPrecise(i.t)}] ${i.kind === 'tag' ? `[${i.text}]` : i.text}`;

export interface HandoffInput {
  projectName?: string;
  scenes: Scene[];
  lrc: LrcLine[];
  /** All tags found in the brief. */
  tags: StopTag[];
  /** True once the user has checked the tags by ear. Unchecked tags are left out of the text. */
  tagsChecked: boolean;
}

/** `lipsync-handoff.txt`: each LIP-SYNC scene with its file tag, timestamps, lyric block and notes. */
export function buildHandoff(i: HandoffInput): string {
  const lip = [...i.scenes].filter((s) => s.lip_sync).sort((a, b) => a.scene - b.scene);
  const tags = i.tagsChecked ? i.tags : [];
  const out: string[] = [`LIP-SYNC HANDOFF${i.projectName ? `: ${i.projectName}` : ''}`, ''];

  if (lip.length === 0) {
    out.push('No LIP-SYNC scenes in this ledger.');
    return `${out.join('\n')}\n`;
  }
  out.push(
    `${lip.length} LIP-SYNC scene${lip.length === 1 ? '' : 's'}. Timed lines count as singing; a timed tag marks where the lead singer's singing stops.`,
    i.tags.length === 0
      ? 'Singing stop tags: none found in the audio brief.'
      : i.tagsChecked
        ? 'Singing stop tags: checked by ear.'
        : `Singing stop tags: ${i.tags.length} found in the audio brief but NOT checked by ear yet, so they are left out below.`,
    '',
  );

  for (const s of lip) {
    const ls = s.lip_sync!;
    out.push(
      `SCENE ${String(s.scene).padStart(2, '0')}: ${s.section}`,
      `File: ${buildFileTag(s)}`,
      `Scene time: ${fmt(s.start_sec)} - ${fmt(s.end_sec)}`,
      `Vocals: ${fmtPrecise(ls.vocal_start_sec)} - ${fmtPrecise(ls.vocal_end_sec)}`,
      'Lyrics:',
    );
    const block = lyricBlock(i.lrc, tags, s.start_sec, s.end_sec);
    out.push(...(block.length ? block.map(blockLine) : ['(none in this scene)']));
    const backing = backingLinesInWindow(i.lrc, ls);
    if (backing.length) out.push(`Backing vocal in the vocal window: ${backing.map((l) => l.text).join(' ')}. The on-screen singer shouldn't mouth this.`);
    out.push('Framing:', ...LIPSYNC_REMINDERS.map((r) => `- ${r}`));
    if (ls.camera_note) out.push(`- ${ls.camera_note}`);
    out.push('');
  }
  return `${out.join('\n').trimEnd()}\n`;
}
