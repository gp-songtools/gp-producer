import type { LrcLine, Scene, Treatment } from '../../types/blueprint';
import type { StoredAnchor } from '../../types/project';
import { buildFileTag } from '../ledger/fileTag';
import { fmt, fmtPrecise } from '../ledger/format';
import { isBackingVocal, lyricsInRange } from '../lrc';

export interface LedgerMarkdownInput {
  projectName: string;
  runtimeSec: number | null;
  treatment: Treatment | null;
  anchors: Pick<StoredAnchor, 'id' | 'name' | 'category' | 'prompt'>[];
  scenes: Scene[];
  lrc: LrcLine[];
}

/** A readable version of the ledger: treatment, anchors, then each scene with its timing, lyrics, prompts and file tag. */
export function buildLedgerMarkdown(i: LedgerMarkdownInput): string {
  const out: string[] = [`# ${i.projectName}`, ''];
  if (i.runtimeSec !== null) out.push(`Runtime: ${fmt(i.runtimeSec)} (${i.runtimeSec}s) · ${i.scenes.length} scenes`, '');

  if (i.treatment) {
    out.push("## Director's treatment", '', `**${i.treatment.title}**`, '', ...i.treatment.paragraphs.flatMap((p) => [p, '']));
    const f = i.treatment.facets;
    out.push(
      `- Narrative metaphor: ${f.narrative_metaphor}`,
      `- Visual symbolism: ${f.visual_symbolism}`,
      `- Pacing arc: ${f.pacing_arc}`,
      `- Camera language: ${f.camera_language}`,
      `- Colour progression: ${f.color_progression}`,
      '',
    );
  }

  out.push('## Reference anchors', '');
  for (const a of i.anchors) out.push(`### ${a.name} (\`${a.id}\`, ${a.category})`, '', a.prompt, '');

  out.push('## Scene ledger', '');
  for (const s of [...i.scenes].sort((a, b) => a.scene - b.scene)) {
    const names = s.anchor_ids.map((id) => i.anchors.find((a) => a.id === id)?.name ?? id).join(', ');
    out.push(
      `### Scene ${String(s.scene).padStart(2, '0')}: ${s.section}${s.lip_sync ? ' (LIP-SYNC)' : ''}`,
      '',
      `- Time: ${fmt(s.start_sec)} - ${fmt(s.end_sec)} (${s.extension_sec ? `${s.base_sec}s base + ${s.extension_sec}s extension = ${s.duration_sec}s` : `${s.duration_sec}s base only`})`,
      `- File tag: \`${buildFileTag(s)}\``,
      `- Anchors: ${names}`,
    );
    if (s.lip_sync) out.push(`- Vocals: ${fmtPrecise(s.lip_sync.vocal_start_sec)} - ${fmtPrecise(s.lip_sync.vocal_end_sec)}${s.lip_sync.camera_note ? ` (${s.lip_sync.camera_note})` : ''}`);
    if (s.extension_sec) out.push(`- Why extended: ${s.extension_reason || '(no reason given)'}`);
    if (s.revisions?.length) out.push(`- Revised ${s.revisions.length} time${s.revisions.length === 1 ? '' : 's'} with Claude`);
    const lyrics = lyricsInRange(i.lrc, s.start_sec, s.end_sec);
    out.push('', '**Lyrics**', '', ...(lyrics.length ? lyrics.map((l) => `- [${fmtPrecise(l.t)}] ${l.text}${isBackingVocal(l.text) ? ' (backing vocal)' : ''}`) : ['- (instrumental)']), '');
    out.push('**Google Flow base prompt**', '', s.base_prompt, '');
    if (s.extension_sec) out.push('**Extension prompt**', '', s.extension_prompt ?? '', '');
    out.push('**Storyboard keyframe prompt**', '', s.keyframe_prompt, '');
  }
  return `${out.join('\n').trimEnd()}\n`;
}
