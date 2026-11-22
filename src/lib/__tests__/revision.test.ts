import { describe, expect, it } from 'vitest';
import { REVISION_FIELDS, REVISION_TOOL } from '../../schemas/revision';
import type { Scene } from '../../types/blueprint';
import { buildFileTag } from '../ledger/fileTag';
import { validateLedger } from '../ledger/validate';
import { goodLedger, scene as mk, anchors } from '../ledger/__tests__/helpers';
import { LOCKED_FIELDS, applyRevision, parseRevision, promptsChanged, undoLatestRevision } from '../revision';

const base = (over: Partial<Scene> = {}): Scene => ({ ...mk(2, 12, 25), section: 'Verse 1A', base_prompt: 'old base', keyframe_prompt: 'old kf', ...over });
const proposal = { base_prompt: 'new base', extension_prompt: null, keyframe_prompt: 'new kf', notes: 'slower dolly' };

describe('revision tool schema (structural lock)', () => {
  it('has fields for prompts and a note only; none of the locked fields exist', () => {
    const props = Object.keys((REVISION_TOOL.input_schema as { properties: object }).properties).sort();
    expect(props).toEqual([...REVISION_FIELDS].sort());
    for (const f of LOCKED_FIELDS) expect(props).not.toContain(f);
    expect((REVISION_TOOL.input_schema as { additionalProperties: boolean }).additionalProperties).toBe(false);
  });
});

describe('applyRevision: timestamps, split and file tag cannot change', () => {
  it('changes only the prompts, even if the model smuggles locked fields into its answer', () => {
    const s = base();
    const hostile = {
      ...proposal,
      start_sec: 0, end_sec: 99, base_sec: 15, extension_sec: 4, duration_sec: 19, section: 'Chorus', scene: 7, anchor_ids: ['x'], lip_sync: { vocal_start_sec: 1, vocal_end_sec: 2 }, file_tag: 'evil.mp4',
    };
    const parsed = parseRevision(hostile, s);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const next = applyRevision(s, parsed.proposal, 'too fast', 1000);

    for (const f of LOCKED_FIELDS) expect(next[f], f).toEqual(s[f]);
    expect(buildFileTag(next)).toBe(buildFileTag(s));
    expect(buildFileTag(next)).toBe('02_Verse1A_12-25.mp4');
    expect(next.base_prompt).toBe('new base');
    expect(next.keyframe_prompt).toBe('new kf');
    expect(next).not.toHaveProperty('file_tag');
  });

  it('keeps the whole ledger valid after a revision', () => {
    const ledger = goodLedger();
    const idx = 1;
    const next = applyRevision(ledger[idx], proposal, 'x');
    const after = ledger.map((s, i) => (i === idx ? next : s));
    expect(validateLedger(after, 50, [{ t: 14, text: 'sing' }], anchors).filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('never gives a base-only scene an extension prompt', () => {
    const next = applyRevision(base(), { ...proposal, extension_prompt: 'sneaky' }, 'x');
    expect(next.extension_prompt).toBeNull();
    expect(next.extension_sec).toBeNull();
  });

  it('keeps the old extension prompt if an extended scene comes back without one', () => {
    const s = base({ base_sec: 13, extension_sec: 4, duration_sec: 17, extension_reason: 'r', extension_prompt: 'old ext', end_sec: 29 });
    expect(parseRevision({ ...proposal, extension_prompt: '  ' }, s).ok).toBe(false);
    const next = applyRevision(s, { ...proposal, extension_prompt: null }, 'x');
    expect(next.extension_prompt).toBe('old ext');
    expect(applyRevision(s, { ...proposal, extension_prompt: 'new ext' }, 'x').extension_prompt).toBe('new ext');
  });

  it('records the replaced prompts, and clears the needs-review flag', () => {
    const s = base({ needs_review: true });
    const next = applyRevision(s, proposal, 'too fast', 1234);
    expect(next.needs_review).toBeUndefined();
    expect(next.revisions).toEqual([{ at: 1234, request: 'too fast', notes: 'slower dolly', old: { basePrompt: 'old base', extensionPrompt: null, keyframePrompt: 'old kf', needsReview: true } }]);
  });
});

describe('undoLatestRevision', () => {
  it('restores the prompts and the review flag, one revision at a time', () => {
    const s = base({ needs_review: true });
    const one = applyRevision(s, proposal, 'a', 1);
    const two = applyRevision(one, { ...proposal, base_prompt: 'newer base' }, 'b', 2);
    expect(two.revisions).toHaveLength(2);

    const back1 = undoLatestRevision(two);
    expect(back1.base_prompt).toBe('new base');
    expect(back1.revisions).toHaveLength(1);

    const back0 = undoLatestRevision(back1);
    expect(back0).toEqual(s);
    expect(back0.revisions).toBeUndefined();
    expect(undoLatestRevision(back0)).toBe(back0);
  });

  it('also leaves locked fields and the file tag alone', () => {
    const s = base();
    const undone = undoLatestRevision(applyRevision(s, proposal, 'x'));
    for (const f of LOCKED_FIELDS) expect(undone[f]).toEqual(s[f]);
    expect(buildFileTag(undone)).toBe(buildFileTag(s));
  });
});

describe('parseRevision', () => {
  it('requires prompts and tolerates a missing note and null extension', () => {
    expect(parseRevision({ base_prompt: 'a', keyframe_prompt: 'b' }, { extension_sec: null })).toMatchObject({ ok: true, proposal: { notes: '', extension_prompt: null } });
    expect(parseRevision({ base_prompt: ' ', keyframe_prompt: 'b' }, { extension_sec: null })).toMatchObject({ ok: false });
    expect(parseRevision({ keyframe_prompt: 'b' }, { extension_sec: null })).toMatchObject({ ok: false });
    expect(parseRevision(null, { extension_sec: null })).toMatchObject({ ok: false });
  });
  it('detects an unchanged answer', () => {
    const s = base();
    expect(promptsChanged(s, { base_prompt: 'old base', keyframe_prompt: 'old kf', extension_prompt: null, notes: '' })).toBe(false);
    expect(promptsChanged(s, { ...proposal })).toBe(true);
  });
});
