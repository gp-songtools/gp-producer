import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, ImageBlockedError } from '../errors';
import { _resetGeminiCachesForTests, buildGenerateBody, generateImage, listModels, MAX_REQUEST_BYTES, parseGenerateResponse } from '../gemini';
import { noSleep } from './fixtures';

const PNG = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';

const json = (body: unknown, init: ResponseInit = { status: 200 }) =>
  new Response(JSON.stringify(body), { ...init, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } });
const gErr = (status: number, message: string, apiStatus = 'INVALID_ARGUMENT', headers: Record<string, string> = {}) =>
  json({ error: { code: status, message, status: apiStatus } }, { status, headers });
const imageOk = (extra: Record<string, unknown> = {}) =>
  json({ candidates: [{ content: { parts: [{ text: 'Here you go.' }, { inlineData: { mimeType: 'image/png', data: PNG } }] }, finishReason: 'STOP' }], ...extra });

type Step = Response | Error;
function mockFetch(steps: Step[]) {
  const calls: { url: string; init: RequestInit; body: any }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init, body: init.body ? JSON.parse(String(init.body)) : undefined });
    const s = steps.shift();
    if (!s) throw new Error('mockFetch: nothing queued');
    if (s instanceof Error) throw s;
    return s;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

const base = (f: ReturnType<typeof mockFetch>, over = {}) => ({ apiKey: 'AIza-secret', model: 'gemini-nano-banana-2.1', prompt: 'A lighthouse', fetchImpl: f.impl, sleep: noSleep, ...over });

beforeEach(() => _resetGeminiCachesForTests());

describe('generateImage request', () => {
  it('posts to the model endpoint with the key in a header only, asking for 16:9 image output', async () => {
    const f = mockFetch([imageOk()]);
    await generateImage(base(f));
    const [{ url, init, body }] = f.calls;
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-nano-banana-2.1:generateContent');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('AIza-secret');
    expect(url).not.toContain('AIza');
    expect(String(init.body)).not.toContain('AIza');
    expect(body.contents).toEqual([{ role: 'user', parts: [{ text: 'A lighthouse' }] }]);
    expect(body.generationConfig).toEqual({ responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '16:9' } });
  });

  it('url-encodes the model id', async () => {
    const f = mockFetch([imageOk()]);
    await generateImage(base(f, { model: 'weird model/x' }));
    expect(f.calls[0].url).toContain('/models/weird%20model%2Fx:generateContent');
  });

  it('only sends imageSize when asked', async () => {
    const f = mockFetch([imageOk(), imageOk()]);
    await generateImage(base(f));
    await generateImage(base(f, { imageSize: '2K' }));
    expect(f.calls[0].body.generationConfig.imageConfig).not.toHaveProperty('imageSize');
    expect(f.calls[1].body.generationConfig.imageConfig).toEqual({ aspectRatio: '16:9', imageSize: '2K' });
  });

  it('labels each reference image and puts the prompt last', () => {
    const body = buildGenerateBody(
      {
        apiKey: 'k', model: 'm', prompt: 'THE PROMPT',
        references: [
          { label: 'Character', mimeType: 'image/png', data: 'AAA' },
          { label: 'Environment B', mimeType: 'image/jpeg', data: 'BBB' },
        ],
      },
      'IMAGE',
    );
    const parts = body.contents[0].parts;
    expect(parts.map((p) => ('text' in p ? p.text : `[image ${p.inlineData.mimeType}]`))).toEqual([
      expect.stringContaining('Reference images follow'),
      'Reference 1: Character',
      '[image image/png]',
      'Reference 2: Environment B',
      '[image image/jpeg]',
      'THE PROMPT',
    ]);
    expect((parts[2] as { inlineData: { data: string } }).inlineData.data).toBe('AAA');
  });

  it('rejects an oversized request before sending anything', async () => {
    const f = mockFetch([]);
    const big = 'A'.repeat(MAX_REQUEST_BYTES + 1);
    const e = await generateImage(base(f, { references: [{ label: 'x', mimeType: 'image/png', data: big }] })).catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.kind).toBe('too_large');
    expect(f.calls).toHaveLength(0);
  });
});

describe('response parsing', () => {
  it('returns the image blob, its type and any commentary', async () => {
    const f = mockFetch([imageOk()]);
    const r = await generateImage(base(f));
    expect(r.mimeType).toBe('image/png');
    expect(r.blob.type).toBe('image/png');
    expect(r.blob.size).toBeGreaterThan(20);
    expect(r.text).toBe('Here you go.');
  });

  it('also accepts snake_case inline_data / mime_type', () => {
    const r = parseGenerateResponse({ candidates: [{ content: { parts: [{ inline_data: { mime_type: 'image/jpeg', data: PNG } }] } }] });
    expect(r.mimeType).toBe('image/jpeg');
  });

  it('skips thought text and takes the first image', () => {
    const r = parseGenerateResponse({ candidates: [{ content: { parts: [{ text: 'hmm', thought: true }, { inlineData: { mimeType: 'image/png', data: PNG } }, { inlineData: { mimeType: 'image/png', data: 'ZZZZ' } }] } }] });
    expect(r.text).toBe('');
    expect(r.blob.size).toBe(Buffer.from(PNG, 'base64').length);
  });

  it.each([
    ['a blocked prompt', { promptFeedback: { blockReason: 'PROHIBITED_CONTENT' } }, /blocked this prompt \(PROHIBITED_CONTENT\)/, 'PROHIBITED_CONTENT'],
    ['an image-safety stop', { candidates: [{ finishReason: 'IMAGE_SAFETY' }] }, /declined to generate this image \(IMAGE_SAFETY\)/, 'IMAGE_SAFETY'],
    ['a text-only reply', { candidates: [{ content: { parts: [{ text: 'I cannot draw that.' }] }, finishReason: 'STOP' }] }, /replied with text instead of an image: "I cannot draw that\."/, 'NO_IMAGE'],
    ['an empty reply', { candidates: [] }, /returned no image/, 'NO_IMAGE'],
    ['a stop with no image', { candidates: [{ content: { parts: [] }, finishReason: 'STOP' }] }, /returned no image \(STOP\)/, 'STOP'],
  ])('explains %s', (_n, body, msg, reason) => {
    const e = (() => { try { parseGenerateResponse(body); } catch (x) { return x as ImageBlockedError; } })();
    expect(e).toBeInstanceOf(ImageBlockedError);
    expect(e!.message).toMatch(msg);
    expect(e!.reason).toBe(reason);
  });
});

describe('errors and retries', () => {
  it.each([
    [400, 'API key not valid. Please pass a valid API key.', 'INVALID_ARGUMENT', /rejected the Gemini API key/],
    [403, 'The caller does not have permission', 'PERMISSION_DENIED', /denied access: The caller does not have permission/],
    [404, 'models/x is not found for API version v1beta', 'NOT_FOUND', /doesn't know the model "gemini-nano-banana-2.1".*Test key & list models/],
    [400, 'Something else is wrong', 'INVALID_ARGUMENT', /Gemini error \(INVALID_ARGUMENT\): Something else is wrong/],
  ])('maps HTTP %i to a friendly message without retrying', async (status, message, apiStatus, re) => {
    const f = mockFetch([gErr(status, message, apiStatus)]);
    const e = await generateImage(base(f)).catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.status).toBe(status);
    expect(e.message).toMatch(re);
    expect(f.calls).toHaveLength(1);
  });

  it('retries 429 with retry-after, then succeeds', async () => {
    const f = mockFetch([gErr(429, 'quota', 'RESOURCE_EXHAUSTED', { 'retry-after': '4' }), imageOk()]);
    const sleep = vi.fn(async (_ms: number, _s?: AbortSignal) => undefined);
    await generateImage(base(f, { sleep }));
    expect(f.calls).toHaveLength(2);
    expect(sleep.mock.calls[0][0]).toBe(4000);
  });

  it('gives up on a persistent 503 after 4 attempts', async () => {
    const f = mockFetch([1, 2, 3, 4].map(() => gErr(503, 'overloaded', 'UNAVAILABLE')));
    const sleep = vi.fn(async (_ms: number, _s?: AbortSignal) => undefined);
    const e = await generateImage(base(f, { sleep })).catch((x) => x);
    expect(e.message).toMatch(/overloaded/);
    expect(f.calls).toHaveLength(4);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([2000, 5000, 12000]);
  });

  it('retries once with text+image output when image-only output is rejected, and remembers it', async () => {
    const f = mockFetch([gErr(400, 'Invalid response modalities: IMAGE only is not supported for this model'), imageOk(), imageOk()]);
    await generateImage(base(f));
    expect(f.calls[0].body.generationConfig.responseModalities).toEqual(['IMAGE']);
    expect(f.calls[1].body.generationConfig.responseModalities).toEqual(['TEXT', 'IMAGE']);
    await generateImage(base(f)); // second image on the same model skips the failed attempt
    expect(f.calls).toHaveLength(3);
    expect(f.calls[2].body.generationConfig.responseModalities).toEqual(['TEXT', 'IMAGE']);
  });

  it('does not loop if text+image output also fails', async () => {
    const f = mockFetch([gErr(400, 'bad modalities'), gErr(400, 'bad modalities again')]);
    await expect(generateImage(base(f))).rejects.toBeInstanceOf(ApiError);
    expect(f.calls).toHaveLength(2);
  });

  it('reports a network failure clearly', async () => {
    const f = mockFetch([new TypeError('Failed to fetch')]);
    const e = await generateImage(base(f)).catch((x) => x);
    expect(e.kind).toBe('network');
    expect(e.message).toMatch(/Couldn't reach Google's Gemini API/);
  });

  it('passes an abort straight through', async () => {
    const f = mockFetch([new DOMException('Aborted', 'AbortError')]);
    const e = await generateImage(base(f)).catch((x) => x);
    expect(e.name).toBe('AbortError');
  });

  it('times out a hung request', async () => {
    const hang = ((_u: string, init: RequestInit) =>
      new Promise((_res, rej) => init.signal!.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError'))))) as unknown as typeof fetch;
    const e = await generateImage({ apiKey: 'k', model: 'm', prompt: 'p', fetchImpl: hang, sleep: noSleep, timeoutMs: 20 }).catch((x) => x);
    expect(e.kind).toBe('timeout');
    expect(e.message).toMatch(/took too long/);
  });

  it('aborts when the caller aborts', async () => {
    const hang = ((_u: string, init: RequestInit) =>
      new Promise((_res, rej) => init.signal!.addEventListener('abort', () => rej(new DOMException('Aborted', 'AbortError'))))) as unknown as typeof fetch;
    const ctrl = new AbortController();
    const p = generateImage({ apiKey: 'k', model: 'm', prompt: 'p', fetchImpl: hang, sleep: noSleep, signal: ctrl.signal });
    ctrl.abort();
    expect((await p.catch((x) => x)).name).toBe('AbortError');
  });
});

describe('listModels', () => {
  const page = (models: unknown[], next?: string) => json({ models, ...(next ? { nextPageToken: next } : {}) });
  const m = (name: string, methods: string[] = ['generateContent'], displayName = name) => ({ name: `models/${name}`, displayName, supportedGenerationMethods: methods });

  it('keeps generateContent models, strips the prefix, flags image models and sorts them first', async () => {
    const f = mockFetch([page([m('gemini-2.5-pro'), m('embedding-001', ['embedContent']), m('gemini-3-pro-image-preview', ['generateContent'], 'Nano Banana Pro'), m('aqa', ['generateAnswer'])])]);
    const r = await listModels({ apiKey: 'k', fetchImpl: f.impl, sleep: noSleep });
    expect(r.map((x) => [x.id, x.isImage])).toEqual([['gemini-3-pro-image-preview', true], ['gemini-2.5-pro', false]]);
    expect(f.calls[0].url).toBe('https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000');
    expect((f.calls[0].init.headers as Record<string, string>)['x-goog-api-key']).toBe('k');
    expect(f.calls[0].init.method).toBe('GET');
    expect(f.calls[0].init.body).toBeUndefined();
  });

  it('flags a model as an image model from its display name too', async () => {
    const f = mockFetch([page([m('gemini-x', ['generateContent'], 'Nano Banana 2')])]);
    expect((await listModels({ apiKey: 'k', fetchImpl: f.impl, sleep: noSleep }))[0].isImage).toBe(true);
  });

  it('follows pagination', async () => {
    const f = mockFetch([page([m('a-image')], 'tok 1'), page([m('b-image')])]);
    const r = await listModels({ apiKey: 'k', fetchImpl: f.impl, sleep: noSleep });
    expect(r.map((x) => x.id)).toEqual(['a-image', 'b-image']);
    expect(f.calls[1].url).toContain('pageToken=tok%201');
  });

  it('surfaces a bad key as a friendly error', async () => {
    const f = mockFetch([gErr(400, 'API key not valid. Please pass a valid API key.')]);
    await expect(listModels({ apiKey: 'bad', fetchImpl: f.impl, sleep: noSleep })).rejects.toThrow(/rejected the Gemini API key/);
  });
});

describe('audio brief', () => {
  const brief = async () => (await import('../gemini'));
  const textOk = (text: string, finish = 'STOP') => json({ candidates: [{ content: { parts: [{ text }] }, finishReason: finish }] });
  const AUDIO = 'QUJD'; // "ABC"
  const req = (f: ReturnType<typeof mockFetch>, over = {}) => ({ apiKey: 'AIza-secret', model: 'gemini-2.5-pro', prompt: 'Listen and write', audio: { mimeType: 'audio/mpeg', data: AUDIO }, fetchImpl: f.impl, sleep: noSleep, ...over });

  it('sends the prompt and the audio as inline data, with the key in a header only', async () => {
    const { generateAudioBrief } = await brief();
    const f = mockFetch([textOk('# SONG OVERVIEW\n- Total length: 03:06')]);
    const out = await generateAudioBrief(req(f));
    expect(out).toBe('# SONG OVERVIEW\n- Total length: 03:06');
    const c = f.calls[0];
    expect(c.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro:generateContent');
    expect((c.init.headers as Record<string, string>)['x-goog-api-key']).toBe('AIza-secret');
    expect(c.url).not.toContain('AIza');
    expect(c.body.contents[0].parts).toEqual([{ text: 'Listen and write' }, { inlineData: { mimeType: 'audio/mpeg', data: AUDIO } }]);
    expect(c.body.generationConfig.maxOutputTokens).toBeGreaterThan(8000);
    expect(c.body.generationConfig.responseModalities).toBeUndefined();
  });

  it('removes the outer markdown code fence Gemini was asked to add, but only the outer one', async () => {
    const { stripOuterFence } = await brief();
    expect(stripOuterFence('```markdown\n# A\n| x |\n```')).toBe('# A\n| x |');
    expect(stripOuterFence('```\n# A\n```\n')).toBe('# A');
    expect(stripOuterFence('# A\n```js\ncode\n```')).toBe('# A\n```js\ncode\n```');
    expect(stripOuterFence('  plain  ')).toBe('plain');
  });

  it('skips thought text and joins text parts', async () => {
    const { parseBriefResponse } = await brief();
    expect(parseBriefResponse({ candidates: [{ content: { parts: [{ text: 'thinking', thought: true }, { text: 'A' }, { text: 'B' }] }, finishReason: 'STOP' }] })).toBe('AB');
  });

  it('explains a block, an empty reply and a truncated reply', async () => {
    const { parseBriefResponse } = await brief();
    expect(() => parseBriefResponse({ promptFeedback: { blockReason: 'OTHER' } })).toThrow(/blocked this request \(OTHER\)/);
    expect(() => parseBriefResponse({ candidates: [{ content: { parts: [] }, finishReason: 'STOP' }] })).toThrow(/returned no text/);
    expect(() => parseBriefResponse({ candidates: [{ content: { parts: [{ text: 'partial' }] }, finishReason: 'MAX_TOKENS' }] })).toThrow(/ran out of output space/);
    expect(() => parseBriefResponse({ candidates: [{ finishReason: 'PROHIBITED_CONTENT' }] })).toThrow(/declined/);
  });

  it('rejects audio that is too large before sending anything', async () => {
    const { generateAudioBrief, MAX_AUDIO_BYTES } = await brief();
    const f = mockFetch([]);
    const e = await generateAudioBrief(req(f, { audio: { mimeType: 'audio/mpeg', data: 'A'.repeat(Math.ceil(MAX_AUDIO_BYTES * 1.4)) } })).catch((x) => x);
    expect(e).toBeInstanceOf(ApiError);
    expect(e.kind).toBe('too_large');
    expect(f.calls).toHaveLength(0);
  });

  it('surfaces an unknown model with the Settings hint, and a bad key', async () => {
    const { generateAudioBrief } = await brief();
    const a = await generateAudioBrief(req(mockFetch([gErr(404, 'not found', 'NOT_FOUND')]))).catch((x) => x);
    expect(a.message).toMatch(/doesn't know the model "gemini-2.5-pro".*Settings/);
    const b = await generateAudioBrief(req(mockFetch([gErr(400, 'API key not valid. Please pass a valid API key.')]))).catch((x) => x);
    expect(b.message).toMatch(/rejected the Gemini API key/);
  });

  it('retries a 503 and uses a long timeout', async () => {
    const { generateAudioBrief } = await brief();
    const f = mockFetch([gErr(503, 'overloaded', 'UNAVAILABLE'), textOk('# OK')]);
    expect(await generateAudioBrief(req(f))).toBe('# OK');
    expect(f.calls).toHaveLength(2);
  });

  it('picks a MIME type from the browser, or from the extension', async () => {
    const { audioMimeType } = await brief();
    expect(audioMimeType({ name: 'a.mp3', type: 'audio/mpeg' })).toBe('audio/mpeg');
    expect(audioMimeType({ name: 'a.WAV', type: '' })).toBe('audio/wav');
    expect(audioMimeType({ name: 'a.flac', type: '' })).toBe('audio/flac');
    expect(audioMimeType({ name: 'a.xyz', type: '' })).toBe('audio/mpeg');
  });
});
