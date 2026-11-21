import { describe, expect, it } from 'vitest';
import { needsReviewIssues } from '../../blueprint';
import { backingLinesInWindow, LIPSYNC_REMINDERS } from '../lipsync';
import { scene } from './helpers';

describe('lip-sync helpers', () => {
  const lrc = [
    { t: 10, text: 'lead line' },
    { t: 12, text: '(ooh)' },
    { t: 14, text: 'lead again (not backing)' },
    { t: 20, text: '(outside window)' },
  ];

  it('finds only fully parenthesized lines inside the vocal window', () => {
    expect(backingLinesInWindow(lrc, { vocal_start_sec: 10, vocal_end_sec: 16 }).map((l) => l.text)).toEqual(['(ooh)']);
    expect(backingLinesInWindow(lrc, { vocal_start_sec: 0, vocal_end_sec: 5 })).toEqual([]);
  });

  it('carries the four skill reminders', () => {
    expect(LIPSYNC_REMINDERS).toHaveLength(4);
    expect(LIPSYNC_REMINDERS.join(' ')).toMatch(/largest in frame/);
    expect(LIPSYNC_REMINDERS.join(' ')).toMatch(/dissolves, whip pans, strobing/);
  });
});

describe('needsReviewIssues', () => {
  it('lists only flagged scenes, with the requested severity and the new split', () => {
    const scenes = [scene(1, 0, 12), scene(2, 12, 28, { needs_review: true, base_sec: 13, extension_sec: 3 }), scene(3, 28, 40, { needs_review: true })];
    const issues = needsReviewIssues(scenes, 'warn');
    expect(issues.map((i) => i.scene)).toEqual([2, 3]);
    expect(issues[0].severity).toBe('warn');
    expect(issues[0].message).toContain('13s base + 3s extension');
    expect(needsReviewIssues(scenes, 'error')[0].severity).toBe('error');
    expect(needsReviewIssues([scene(1, 0, 12)], 'warn')).toEqual([]);
  });
});
