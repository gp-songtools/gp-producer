import type { BlueprintScene } from '../../types/blueprint';

const pad2 = (n: number) => String(n).padStart(2, '0');

/** "Verse 1A" -> "Verse1A", "Pre-Chorus" -> "PreChorus". */
export function slugSection(section: string): string {
  return section.replace(/[^A-Za-z0-9]+/g, '') || 'Scene';
}

/** `{NN}_{SectionSlug}_{startSec}-{endSec}.mp4`, whole seconds. Built from locked fields only. */
export function buildFileTag(s: Pick<BlueprintScene, 'scene' | 'section' | 'start_sec' | 'end_sec'>): string {
  return `${pad2(s.scene)}_${slugSection(s.section)}_${pad2(s.start_sec)}-${pad2(s.end_sec)}.mp4`;
}
