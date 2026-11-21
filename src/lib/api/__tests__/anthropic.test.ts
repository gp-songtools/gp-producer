import { describe, expect, it, vi } from 'vitest';
import { callTool, DEFAULT_MAX_TOKENS } from '../anthropic';
import { ApiError, BlueprintError, NoToolCallError } from '../errors';
import { BLUEPRINT_TOOL } from '../../../schemas/blueprint';
import { errorResponse, mockFetch, noSleep, sseText, streamResponse, textStream, toolStream, validBlueprint } from './fixtures';

const base = (fetchImpl: typeof fetch, over = {}) => ({
  apiKey: 'sk-ant-secret',
  model: 'claude-sonnet-5-5',
  system: 'sys',
  tool: BLUEPRINT_TOOL,
  messages: [{ role: 'user' as const, content: 'hi' }],
  fetchImpl,
  sleep: noSleep,
  ...over,
});

describe('callTool request', () => {
  it('sends the browser-access header, auto tool choice, streaming and the key', async () => {
    const f = mockFetch([toolStream(validBlueprint())]);
    await callTool(base(f.impl));
    const [{ url, init, body }] = f.calls;
    expect(url).toBe('https://api.anthropic.com/v1/messages');
    expect(init.method).toBe('POST');
    const h = init.headers as Record<string, string>;
    expect(h['x-api-key']).toBe('sk-ant-secret');
    expect(h['anthropic-version']).toBe('2023-06-01');
    expect(h['anthropic-dangerous-direct-browser-access']).toBe('true');
    expect(body.model).toBe('claude-sonnet-5-5');
    expect(body.stream).toBe(true);
    expect(body.max_tokens).toBe(DEFAULT_MAX_TOKENS);
    // Forced tool choice ("tool"/"any") is rejected by newer models with a 400, so it must never be sent.
    expect(body.tool_choice).toEqual({ type: 'auto' });
    expect(body.tools).toHaveLength(1);
    expect(body.system).toBe('sys');
  });

  it('never puts the key anywhere but the header', async () => {
    const f = mockFetch([toolStream(validBlueprint())]);
    await callTool(base(f.impl));
    expect(String(f.calls[0].init.body)).not.toContain('sk-ant-secret');
  });
});

describe('callTool response', () => {
  it('reassembles tool input split across many deltas and chunks', async () => {
    const bp = validBlueprint();
    const f = mockFetch([toolStream(bp, { jsonChunk: 7, chunkSize: 5, id: 'toolu_abc', usage: [321, 654] })]);
    const r = await callTool(base(f.impl));
    expect(r.input).toEqual(bp);
    expect(r.toolUseId).toBe('toolu_abc');
    expect(r.stopReason).toBe('tool_use');
    expect(r.usage).toEqual({ input_tokens: 321, output_tokens: 654 });
  });

  it.each([1, 3, 10, 11, 40])('counts scenes exactly while streaming with %i-char deltas', async (n) => {
    const f = mockFetch([toolStream(validBlueprint(), { jsonChunk: n })]);
    const seen: number[] = [];
    await callTool(base(f.impl, { onProgress: (p: { scenes: number }) => seen.push(p.scenes) }));
    expect(seen.at(-1)).toBe(4);
    expect(seen).toEqual([...seen].sort((a, b) => a - b)); // never goes backwards
  });

  it('throws a clear error when output is truncated', async () => {
    const f = mockFetch([toolStream(validBlueprint(), { stopReason: 'max_tokens' })]);
    await expect(callTool(base(f.impl))).rejects.toThrow(/ran out of output space/);
  });

  it('throws when no tool call is made', async () => {
    const f = mockFetch([toolStream({}, { noTool: true })]);
    const e = await callTool(base(f.impl)).catch((x) => x);
    expect(e).toBeInstanceOf(NoToolCallError);
    expect(e).toBeInstanceOf(BlueprintError);
    expect(e.message).toMatch(/didn't return a blueprint/);
  });

  it('captures what Claude said when it answers in text instead of calling the tool', async () => {
    const f = mockFetch([textStream('I would be happy to help! Which song is this for?', 7)]);
    const e = await callTool(base(f.impl)).catch((x) => x);
    expect(e).toBeInstanceOf(NoToolCallError);
    expect(e.text).toBe('I would be happy to help! Which song is this for?');
    expect(e.message).toContain('replied with text');
  });

  it('ignores a text preamble when the tool is also called', async () => {
    const bp = validBlueprint();
    const json = JSON.stringify(bp);
    const text = sseText([
      { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Sure, here you go.' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_p', name: 'submit_blueprint', input: {} } },
      { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: json } },
      { type: 'content_block_stop', index: 1 },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 3 } },
    ]);
    const f = mockFetch([streamResponse(text)]);
    const r = await callTool(base(f.impl));
    expect(r.input).toEqual(bp);
    expect(r.toolUseId).toBe('toolu_p');
  });

  it('ignores thinking blocks streamed before the tool call', async () => {
    const bp = validBlueprint();
    const text = sseText([
      { type: 'content_block_start', index: 0, content_block: { type: 'thinking', thinking: '' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'thinking_delta', thinking: 'let me count the scenes' } },
      { type: 'content_block_delta', index: 0, delta: { type: 'signature_delta', signature: 'abc' } },
      { type: 'content_block_stop', index: 0 },
      { type: 'content_block_start', index: 1, content_block: { type: 'tool_use', id: 'toolu_t', name: 'submit_blueprint', input: {} } },
      { type: 'content_block_delta', index: 1, delta: { type: 'input_json_delta', partial_json: JSON.stringify(bp) } },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 3 } },
    ]);
    const f = mockFetch([streamResponse(text)]);
    expect((await callTool(base(f.impl))).input).toEqual(bp);
  });

  it('throws on malformed JSON from the tool', async () => {
    const text = sseText([
      { type: 'content_block_start', content_block: { type: 'tool_use', id: 't', name: 'submit_blueprint' } },
      { type: 'content_block_delta', delta: { type: 'input_json_delta', partial_json: '{"treatment": {' } },
      { type: 'message_delta', delta: { stop_reason: 'tool_use' } },
    ]);
    const f = mockFetch([streamResponse(text)]);
    await expect(callTool(base(f.impl))).rejects.toThrow(/cut off or malformed/);
  });

  it('turns a mid-stream error event into an ApiError', async () => {
    const text = sseText([
      { type: 'message_start', message: { usage: { input_tokens: 1 } } },
      { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } },
    ]);
    const f = mockFetch([streamResponse(text)]);
    const e = await callTool(base(f.impl)).catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.message).toMatch(/overloaded/i);
  });

  it('reports a dropped connection', async () => {
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(new TextEncoder().encode('event: message_start\ndata: {"type":"message_start","message":{}}\n\n'));
        c.error(new TypeError('network error'));
      },
    });
    const f = mockFetch([new Response(body, { status: 200 })]);
    await expect(callTool(base(f.impl))).rejects.toThrow(/dropped mid-response/);
  });
});

describe('callTool errors and retry', () => {
  it.each([
    [401, 'authentication_error', /rejected the API key/],
    [404, 'not_found_error', /doesn't know the model "claude-sonnet-5-5"/],
    [400, 'invalid_request_error', /invalid_request_error.*bad thing/],
  ])('maps HTTP %i to a friendly message without retrying', async (status, type, re) => {
    const f = mockFetch([errorResponse(status, type, 'bad thing')]);
    const e = await callTool(base(f.impl)).catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(status);
    expect(e.message).toMatch(re);
    expect(f.calls).toHaveLength(1);
  });

  it('retries 429 honoring retry-after, then succeeds', async () => {
    const f = mockFetch([errorResponse(429, 'rate_limit_error', 'slow', { 'retry-after': '7' }), toolStream(validBlueprint())]);
    const sleep = vi.fn(async (_ms: number, _signal?: AbortSignal) => undefined);
    const r = await callTool(base(f.impl, { sleep }));
    expect(r.toolUseId).toBe('toolu_1');
    expect(f.calls).toHaveLength(2);
    expect(sleep).toHaveBeenCalledWith(7000, undefined);
  });

  it('backs off 2s, 5s, 12s on overload and gives up after 4 attempts', async () => {
    const f = mockFetch([1, 2, 3, 4].map(() => errorResponse(529, 'overloaded_error', 'busy')));
    const sleep = vi.fn(async (_ms: number, _signal?: AbortSignal) => undefined);
    const e = await callTool(base(f.impl, { sleep })).catch((x) => x);
    expect(e.status).toBe(529);
    expect(f.calls).toHaveLength(4);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([2000, 5000, 12000]);
  });

  it('caps a huge retry-after at 30s', async () => {
    const f = mockFetch([errorResponse(429, 'rate_limit_error', 'x', { 'retry-after': '9999' }), toolStream(validBlueprint())]);
    const sleep = vi.fn(async (_ms: number, _signal?: AbortSignal) => undefined);
    await callTool(base(f.impl, { sleep }));
    expect(sleep.mock.calls[0][0]).toBe(30000);
  });

  it('reports a network failure (CORS, offline, blocked) clearly', async () => {
    const f = mockFetch([new TypeError('Failed to fetch')]);
    const e = await callTool(base(f.impl)).catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.kind).toBe('network');
    expect(e.message).toMatch(/Couldn't reach Anthropic/);
  });

  it('passes an abort straight through', async () => {
    const f = mockFetch([new DOMException('Aborted', 'AbortError')]);
    const e = await callTool(base(f.impl)).catch((x) => x);
    expect(e.name).toBe('AbortError');
  });
});
