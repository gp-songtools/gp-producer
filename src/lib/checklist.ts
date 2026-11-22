import type { ChecklistKey, Scene } from '../types/blueprint';

export interface ChecklistItem {
  key: ChecklistKey;
  label: string;
  hint: string;
}

/** In the order the work happens in Google Flow. */
export const CHECKLIST_ITEMS: ChecklistItem[] = [
  { key: 'anchorsAttached', label: 'Anchors attached', hint: 'Reference images added to the Flow scene' },
  { key: 'baseGenerated', label: 'Base clip generated', hint: 'Base prompt run and a take chosen' },
  { key: 'extensionGenerated', label: 'Extension generated', hint: 'Extension prompt run to the target timeline mark' },
  { key: 'downloaded', label: 'Downloaded', hint: 'Final clip saved from Flow' },
  { key: 'tagged', label: 'File tag applied', hint: 'Clip renamed to the file tag' },
];

/** The items that apply to this scene: a base-only scene has no extension step. */
export function itemsFor(scene: Pick<Scene, 'extension_sec'>): ChecklistItem[] {
  return CHECKLIST_ITEMS.filter((i) => i.key !== 'extensionGenerated' || !!scene.extension_sec);
}

export function checklistProgress(scene: Pick<Scene, 'extension_sec' | 'checklist'>): { done: number; total: number; complete: boolean } {
  const items = itemsFor(scene);
  const done = items.filter((i) => scene.checklist?.[i.key] === true).length;
  return { done, total: items.length, complete: done === items.length };
}

/** Scenes with every applicable item ticked, out of all scenes. */
export function projectProgress(scenes: Pick<Scene, 'extension_sec' | 'checklist'>[]): { complete: number; total: number } {
  return { complete: scenes.filter((s) => checklistProgress(s).complete).length, total: scenes.length };
}
