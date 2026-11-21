import { describe, expect, it } from 'vitest';
import { BlueprintError, NoToolCallError } from '../errors';
import { generateBlueprint, makeRunRecord, repairBlueprint } from '../blueprintFlow';
import { gappyBlueprint, inputs, mockFetch, noSleep, textStream, toolStream, validBlueprint } from './fixtures';

const opts = (f: ReturnType<typeof mockFetch>, over = {}) => ({
  apiKey: 'k',
  model: 'claude-sonnet-5-5',
  inputs: inputs(),
  fetchImpl: f.impl,
  sleep: noSleep,
  ...over,
});

describe('generateBlueprint', () => {
  it('accepts a valid blueprint in one call', async () => {
    const f = mockFetch([toolStream(validBlueprint(), { usage: [10, 20] })]);
    const statuses: string[] = [];
    const r = await generateBlueprint(opts(f, { onStatus: (s: string) => statuses.push(s) }));
    expect(f.calls).toHaveLength(1);
    expect(r.repaired).toBe(false);
    expect(r.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(r.blueprint.scenes).toHaveLength(4);
    expect(r.usage).toEqual({ input_tokens: 10, output_tokens: 20 });
    expect(statuses).toEqual(['generating']);
  });

  it('sends the project inputs and the skill rules in the first request', async () => {
    const f = mockFetch([toolStream(validBlueprint())]);
    await generateBlueprint(opts(f));
    const { body } = f.calls[0];
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].content).toContain('"runtime_sec": 50');
    expect(body.messages[0].content).toContain('"text": "sing"');
    expect(body.system).toContain('10-second base with a 2-second extension is NOT possible');
    expect(body.tool_choice).toEqual({ type: 'auto' });
    expect(body.messages[0].content).toContain('calling the submit_blueprint tool');
  });

  it('does one repair pass for a ledger error, sending the failed tool result back', async () => {
    const f = mockFetch([toolStream(gappyBlueprint(), { id: 'toolu_first', usage: [100, 200] }), toolStream(validBlueprint(), { usage: [150, 250] })]);
    const statuses: string[] = [];
    const r = await generateBlueprint(opts(f, { onStatus: (s: string) => statuses.push(s) }));
    expect(f.calls).toHaveLength(2);
    expect(statuses).toEqual(['generating', 'repairing']);
    expect(r.repaired).toBe(true);
    expect(r.issues.filter((i) => i.severity === 'error')).toEqual([]);
    expect(r.usage).toEqual({ input_tokens: 250, output_tokens: 450 });
    expect(r.attempts).toHaveLength(2);

    // The correction is one self-contained user message: no replayed assistant turn, no fabricated tool result.
    const second = f.calls[1].body.messages;
    expect(second).toHaveLength(1);
    expect(second[0].role).toBe('user');
    const text = second[0].content as string;
    expect(typeof text).toBe('string');
    expect(text).toContain('<project_inputs>');
    expect(text).toContain('<previous_submission>');
    expect(text).toContain('"start_sec":14'); // the gappy scene the model submitted
    expect(text).toMatch(/Scene 2 \[GAP\]/);
    expect(JSON.stringify(f.calls[1].body)).not.toMatch(/tool_result|"tool_use"/);
    expect(f.calls[1].body.tool_choice).toEqual({ type: 'auto' });
  });

  it('repairs when the structure is wrong (zod), listing the problems', async () => {
    const bad = { ...validBlueprint(), scenes: undefined };
    const f = mockFetch([toolStream(bad), toolStream(validBlueprint())]);
    const r = await generateBlueprint(opts(f));
    expect(r.repaired).toBe(true);
    expect(f.calls[1].body.messages[0].content).toMatch(/scenes/);
  });

  it('fills missing nullable fields instead of failing', async () => {
    const bp = validBlueprint();
    for (const s of bp.scenes) {
      delete (s as Partial<typeof s>).extension_sec;
      delete (s as Partial<typeof s>).extension_reason;
      delete (s as Partial<typeof s>).extension_prompt;
      delete (s as Partial<typeof s>).lip_sync;
    }
    const f = mockFetch([toolStream(bp)]);
    const r = await generateBlueprint(opts(f));
    expect(r.repaired).toBe(false);
    expect(r.blueprint.scenes[0]).toMatchObject({ extension_sec: null, extension_reason: null, extension_prompt: null, lip_sync: null });
  });

  it('returns remaining issues, without a third call, when the repair is still invalid', async () => {
    const f = mockFetch([toolStream(gappyBlueprint()), toolStream(gappyBlueprint())]);
    const r = await generateBlueprint(opts(f));
    expect(f.calls).toHaveLength(2);
    expect(r.repaired).toBe(true);
    expect(r.issues.some((i) => i.code === 'GAP')).toBe(true);
  });

  it('throws a BlueprintError when the repair is structurally wrong too', async () => {
    const f = mockFetch([toolStream({ nope: 1 }), toolStream({ nope: 2 })]);
    const e = await generateBlueprint(opts(f)).catch((x) => x);
    expect(e).toBeInstanceOf(BlueprintError);
    expect(e.problems.length).toBeGreaterThan(0);
    expect(f.calls).toHaveLength(2);
  });

  it('catches a 10s base + 2s extension from Claude and gets it corrected', async () => {
    const bad = validBlueprint();
    bad.scenes[0] = { ...bad.scenes[0], base_sec: 10, extension_sec: 2, extension_reason: 'x', extension_prompt: 'e' };
    const f = mockFetch([toolStream(bad), toolStream(validBlueprint())]);
    const r = await generateBlueprint(opts(f));
    expect(f.calls[1].body.messages[0].content).toMatch(/BAD_SPLIT/);
    expect(r.issues.filter((i) => i.severity === 'error')).toEqual([]);
  });

  it('flags a lyric at or after the stated runtime', async () => {
    const f = mockFetch([toolStream(validBlueprint()), toolStream(validBlueprint())]);
    const r = await generateBlueprint(opts(f, { inputs: inputs({ lrc: [{ t: 55, text: 'late' }] }) }));
    expect(r.issues.some((i) => i.code === 'LYRIC_PAST_END')).toBe(true);
  });

  it('propagates API errors untouched', async () => {
    const f = mockFetch([new TypeError('Failed to fetch')]);
    await expect(generateBlueprint(opts(f))).rejects.toThrow(/Couldn't reach Anthropic/);
  });
});

describe('effort', () => {
  it('is sent on the first call and on the correction call, and recorded', async () => {
    const f = mockFetch([toolStream(gappyBlueprint()), toolStream(validBlueprint())]);
    const r = await generateBlueprint(opts(f, { effort: 'medium' }));
    expect(f.calls.map((c) => c.body.output_config)).toEqual([{ effort: 'medium' }, { effort: 'medium' }]);
    expect(r.effort).toBe('medium');
    expect((makeRunRecord('p', r).payload as { effort: string }).effort).toBe('medium');
  });

  it('is omitted, and recorded as null, when not chosen', async () => {
    const f = mockFetch([toolStream(validBlueprint())]);
    const r = await generateBlueprint(opts(f));
    expect(f.calls[0].body).not.toHaveProperty('output_config');
    expect(r.effort).toBeNull();
  });

  it('is also sent when asking Claude to fix an existing blueprint', async () => {
    const f = mockFetch([toolStream(validBlueprint())]);
    const { evaluate } = await import('../blueprintFlow');
    const ev = evaluate(gappyBlueprint(), inputs());
    if (!ev.ok) throw new Error('fixture should parse');
    await repairBlueprint({ ...opts(f, { effort: 'low' }), current: ev.blueprint, issues: ev.issues });
    expect(f.calls[0].body.output_config).toEqual({ effort: 'low' });
  });
});

describe('Claude answers in text instead of calling the tool', () => {
  it('retries once with its reply quoted and an explicit request to call the tool', async () => {
    const f = mockFetch([textStream('Happy to help. Shall I start?'), toolStream(validBlueprint())]);
    const r = await generateBlueprint(opts(f));
    expect(f.calls).toHaveLength(2);
    expect(r.repaired).toBe(false);
    const msgs = f.calls[1].body.messages;
    expect(msgs.map((m: { role: string }) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(msgs[1].content).toBe('Happy to help. Shall I start?');
    expect(msgs[2].content).toMatch(/Call the submit_blueprint tool now/);
  });

  it('gives up with a clear error if it happens twice', async () => {
    const f = mockFetch([textStream('No.'), textStream('Still no.')]);
    const e = await generateBlueprint(opts(f)).catch((x) => x);
    expect(e).toBeInstanceOf(NoToolCallError);
    expect(e.message).toContain('Still no.');
    expect(f.calls).toHaveLength(2);
  });

  it('also covers the correction call', async () => {
    const f = mockFetch([toolStream(gappyBlueprint()), textStream('Let me think.'), toolStream(validBlueprint())]);
    const r = await generateBlueprint(opts(f));
    expect(f.calls).toHaveLength(3);
    expect(r.repaired).toBe(true);
    expect(r.issues.filter((i) => i.severity === 'error')).toEqual([]);
  });
});

describe('extras validation through the flow', () => {
  it('errors on duplicate and malformed anchor ids and empty prompts, but only warns on treatment length', async () => {
    const bp = validBlueprint();
    bp.anchors.push({ id: 'character', name: 'Character 2', category: 'prop', prompt: 'p' }, { id: 'Bad Id', name: 'X', category: 'prop', prompt: '' });
    bp.treatment.paragraphs = ['only one'];
    bp.scenes[0] = { ...bp.scenes[0], base_prompt: '  ' };
    const f = mockFetch([toolStream(bp), toolStream(bp)]);
    const r = await generateBlueprint(opts(f));
    const byCode = (c: string) => r.issues.find((i) => i.code === c);
    expect(byCode('DUP_ANCHOR')?.severity).toBe('error');
    expect(byCode('BAD_ANCHOR_ID')?.severity).toBe('error');
    expect(byCode('EMPTY_PROMPT')?.severity).toBe('error');
    expect(byCode('TREATMENT_LENGTH')?.severity).toBe('warn');
  });
});

describe('repairBlueprint', () => {
  it('sends the current blueprint as quoted JSON, stripped of client fields', async () => {
    const current = gappyBlueprint();
    Object.assign(current.scenes[0], { needs_review: true, projectId: 'p1' });
    const f = mockFetch([toolStream(validBlueprint())]);
    const { evaluate } = await import('../blueprintFlow');
    const ev = evaluate(current, inputs());
    if (!ev.ok) throw new Error('fixture should parse');
    const r = await repairBlueprint({ ...opts(f), current: ev.blueprint, issues: ev.issues });
    expect(r.repaired).toBe(true);
    const msgs = f.calls[0].body.messages;
    expect(msgs).toHaveLength(1);
    const text = msgs[0].content as string;
    const quoted = JSON.parse(text.slice(text.indexOf('<previous_submission>') + 21, text.indexOf('</previous_submission>')));
    expect(quoted.scenes[0]).not.toHaveProperty('projectId');
    expect(quoted.scenes[0]).not.toHaveProperty('needs_review');
    expect(text).toMatch(/\[GAP\]/);
  });

  it('refuses when there are no errors to fix', async () => {
    const f = mockFetch([]);
    const { evaluate } = await import('../blueprintFlow');
    const ev = evaluate(validBlueprint(), inputs());
    if (!ev.ok) throw new Error('fixture should parse');
    await expect(repairBlueprint({ ...opts(f), current: ev.blueprint, issues: [] })).rejects.toThrow(/nothing to fix/);
    expect(f.calls).toHaveLength(0);
  });
});

describe('makeRunRecord', () => {
  it('captures attempts, issues and usage for the run history', async () => {
    const f = mockFetch([toolStream(validBlueprint(), { usage: [1, 2] })]);
    const r = await generateBlueprint(opts(f));
    const rec = makeRunRecord('p1', r);
    expect(rec).toMatchObject({ projectId: 'p1', kind: 'blueprint', usage: { input_tokens: 1, output_tokens: 2 } });
    expect((rec.payload as { attempts: unknown[] }).attempts).toHaveLength(1);
  });
});
