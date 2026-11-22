import { describe, expect, it } from 'vitest';
import { scene as mk } from '../../ledger/__tests__/helpers';
import { buildFileTag } from '../../ledger/fileTag';
import { BlueprintError } from '../errors';
import { makeRevisionRun, reviseScene } from '../revisionFlow';
import { mockFetch, noSleep, textStream, toolStream, treatment } from './fixtures';

const scene = { ...mk(2, 12, 25), section: 'Verse 1A', base_prompt: 'old base', keyframe_prompt: 'old kf' };
const good = { base_prompt: 'new base', extension_prompt: null, keyframe_prompt: 'new kf', notes: 'n' };
const opts = (f: ReturnType<typeof mockFetch>, over = {}) => ({
  apiKey: 'k',
  model: 'claude-sonnet-5-5',
  inputs: { treatment, anchors: [{ id: 'character', name: 'Character', prompt: 'A keeper' }], scene, lyrics: [{ t: 14, text: 'sing' }], request: 'too fast' },
  fetchImpl: f.impl,
  sleep: noSleep,
  ...over,
});

describe('reviseScene', () => {
  it('sends one tool with no locked fields, tool_choice auto, and the locked facts as read-only context', async () => {
    const f = mockFetch([toolStream(good, { usage: [10, 20] })]);
    const r = await reviseScene(opts(f));
    const { body } = f.calls[0];
    expect(body.tool_choice).toEqual({ type: 'auto' });
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0].name).toBe('submit_revision');
    expect(Object.keys(body.tools[0].input_schema.properties)).toEqual(['base_prompt', 'extension_prompt', 'keyframe_prompt', 'notes']);
    expect(body.messages).toHaveLength(1);
    const msg = body.messages[0].content as string;
    expect(msg).toContain('<locked_read_only>');
    expect(msg).toContain(buildFileTag(scene));
    expect(msg).toContain('00:12-00:25');
    expect(msg).toContain('A keeper');
    expect(msg).toContain('[14.00s] sing');
    expect(msg).toContain('too fast');
    expect(body.system).toContain('LOCKED');
    expect(r.proposal).toEqual(good);
    expect(r.repaired).toBe(false);
    expect(r.usage).toEqual({ input_tokens: 10, output_tokens: 20 });
  });

  it('nudges once when Claude answers in text, as one self-contained user message', async () => {
    const f = mockFetch([textStream('Sure, here is a new prompt…'), toolStream(good)]);
    const r = await reviseScene(opts(f));
    expect(f.calls).toHaveLength(2);
    const second = f.calls[1].body.messages;
    expect(second).toHaveLength(1);
    expect(second[0].role).toBe('user');
    expect(second[0].content).toContain('<your_previous_reply>');
    expect(second[0].content).toContain('Call the submit_revision tool now');
    expect(JSON.stringify(f.calls[1].body)).not.toMatch(/tool_result|"tool_use"|"role":"assistant"/);
    expect(r.proposal.base_prompt).toBe('new base');
  });

  it('corrects once when the submission is unusable, then gives up with the problems', async () => {
    const f = mockFetch([toolStream({ base_prompt: '', keyframe_prompt: 'k' }), toolStream(good)]);
    const r = await reviseScene(opts(f));
    expect(r.repaired).toBe(true);
    expect(f.calls[1].body.messages[0].content).toContain('<previous_submission>');
    expect(f.calls[1].body.messages[0].content).toContain('base_prompt is empty');

    const g = mockFetch([toolStream({ nope: 1 }), toolStream({ nope: 2 })]);
    const e = await reviseScene(opts(g)).catch((x) => x);
    expect(e).toBeInstanceOf(BlueprintError);
    expect(e.problems.length).toBeGreaterThan(0);
    expect(g.calls).toHaveLength(2);
  });

  it('demands an extension prompt for an extended scene', async () => {
    const ext = { ...scene, base_sec: 13, extension_sec: 4, duration_sec: 17, end_sec: 29, extension_reason: 'r', extension_prompt: 'old ext' };
    const f = mockFetch([toolStream(good), toolStream({ ...good, extension_prompt: 'new ext' })]);
    const r = await reviseScene(opts(f, { inputs: { ...opts(f).inputs, scene: ext } }));
    expect(f.calls[1].body.messages[0].content).toContain('extension_prompt is required');
    expect(r.proposal.extension_prompt).toBe('new ext');
  });

  it('refuses an empty description without calling the API', async () => {
    const f = mockFetch([]);
    await expect(reviseScene(opts(f, { inputs: { ...opts(f).inputs, request: '  ' } }))).rejects.toBeInstanceOf(BlueprintError);
    expect(f.calls).toHaveLength(0);
  });

  it('makes a revision run record', async () => {
    const f = mockFetch([toolStream(good)]);
    const run = makeRevisionRun('p', 2, 'too fast', await reviseScene(opts(f)));
    expect(run).toMatchObject({ projectId: 'p', kind: 'revision', payload: { scene: 2, request: 'too fast' } });
  });
});
