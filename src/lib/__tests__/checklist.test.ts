import { describe, expect, it } from 'vitest';
import { checklistProgress, itemsFor, projectProgress } from '../checklist';

describe('checklist', () => {
  it('skips the extension step for a base-only scene', () => {
    expect(itemsFor({ extension_sec: null }).map((i) => i.key)).not.toContain('extensionGenerated');
    expect(itemsFor({ extension_sec: 4 }).map((i) => i.key)).toContain('extensionGenerated');
  });
  it('counts only applicable, ticked items', () => {
    expect(checklistProgress({ extension_sec: null })).toEqual({ done: 0, total: 4, complete: false });
    // a stale extension tick on a base-only scene doesn't count
    expect(checklistProgress({ extension_sec: null, checklist: { extensionGenerated: true, tagged: true } })).toEqual({ done: 1, total: 4, complete: false });
  });
  it('completes when every applicable item is ticked', () => {
    const all = { anchorsAttached: true, baseGenerated: true, downloaded: true, tagged: true };
    expect(checklistProgress({ extension_sec: null, checklist: all }).complete).toBe(true);
    expect(checklistProgress({ extension_sec: 3, checklist: all }).complete).toBe(false);
    expect(checklistProgress({ extension_sec: 3, checklist: { ...all, extensionGenerated: true } })).toEqual({ done: 5, total: 5, complete: true });
  });
  it('counts complete scenes for the project', () => {
    const done = { anchorsAttached: true, baseGenerated: true, downloaded: true, tagged: true };
    expect(projectProgress([{ extension_sec: null, checklist: done }, { extension_sec: null }])).toEqual({ complete: 1, total: 2 });
  });
});
