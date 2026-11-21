import { base64ToBlob } from '../image';
import { ApiError, ImageBlockedError, isAbort } from './errors';
import { MAX_ATTEMPTS, RETRYABLE, retryDelayMs, sleep as realSleep, type Sleep } from './retry';

export const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
/** Inline images count toward the request size limit; stay well under it. */
export const MAX_REQUEST_BYTES = 15 * 1024 * 1024;
const DEFAULT_TIMEOUT_MS = 180_000;

export type ImageSize = '1K' | '2K' | '4K';

export interface ReferenceImage {
  /** Shown to the model before the image, e.g. "Character" or "Environment B". */
  label: string;
  mimeType: string;
  /** Base64, no data: prefix. */
  data: string;
}

interface Common {
  apiKey: string;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  sleep?: Sleep;
  timeoutMs?: number;
}

export interface GenerateImageRequest extends Common {
  model: string;
  prompt: string;
  references?: ReferenceImage[];
  aspectRatio?: string;
  /** Only sent when set; not every model supports it. */
  imageSize?: ImageSize;
}

export interface GeneratedImage {
  blob: Blob;
  mimeType: string;
  /** Any commentary the model returned alongside the image. */
  text: string;
}

export interface GeminiModel {
  /** Without the "models/" prefix: the string to use in a request. */
  id: string;
  displayName: string;
  /** Looks like an image-output model (by name). */
  isImage: boolean;
  inputTokenLimit?: number;
  outputTokenLimit?: number;
}

// ---- errors -------------------------------------------------------------------------------------------------

export const GEMINI_NETWORK_MESSAGE =
  "Couldn't reach Google's Gemini API. Check your connection, and that an ad blocker or network policy isn't blocking generativelanguage.googleapis.com.";

function friendlyGeminiError(status: number, apiStatus: string, message: string, model?: string): string {
  if (/API key not valid|API_KEY_INVALID|API key expired/i.test(message)) return 'Google rejected the Gemini API key. Check it in Settings.';
  switch (status) {
    case 401:
      return 'Google rejected the Gemini API key. Check it in Settings.';
    case 403:
      return `Google denied access: ${message}`;
    case 404:
      return model
        ? `Gemini doesn't know the model "${model}" for image generation. Use "Test & list models" in Settings to pick a valid one.`
        : `Gemini returned not found: ${message}`;
    case 429:
      return 'Gemini is rate limiting or out of quota for this key. Wait a moment, or check your Google AI quota.';
    case 503:
      return 'Gemini is overloaded right now. Try again shortly.';
    default:
      return status >= 500 ? `Gemini had a server error (${status}). Try again shortly.` : `Gemini error (${apiStatus || status}): ${message}`;
  }
}

async function errorFromResponse(res: Response, model?: string): Promise<ApiError> {
  let apiStatus = '';
  let message = res.statusText;
  try {
    const j = (await res.json()) as { error?: { status?: string; message?: string } };
    apiStatus = j.error?.status ?? '';
    message = j.error?.message ?? message;
  } catch {
    /* not JSON */
  }
  return new ApiError(friendlyGeminiError(res.status, apiStatus, message, model), res.status, apiStatus || 'error');
}

// ---- transport ----------------------------------------------------------------------------------------------

interface PostOpts extends Common {
  method: 'GET' | 'POST';
  url: string;
  body?: unknown;
  model?: string;
}

/** One request with a timeout and retry on 429/5xx. Returns the parsed JSON body. */
async function send<T>(o: PostOpts): Promise<T> {
  const doFetch = o.fetchImpl ?? fetch;
  const wait = o.sleep ?? realSleep;
  const headers: Record<string, string> = { 'x-goog-api-key': o.apiKey };
  if (o.body !== undefined) headers['content-type'] = 'application/json';
  const body = o.body !== undefined ? JSON.stringify(o.body) : undefined;

  for (let attempt = 0; ; attempt++) {
    const ctrl = new AbortController();
    let timedOut = false;
    const onAbort = () => ctrl.abort();
    o.signal?.addEventListener('abort', onAbort, { once: true });
    if (o.signal?.aborted) ctrl.abort();
    const timer = setTimeout(() => {
      timedOut = true;
      ctrl.abort();
    }, o.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    try {
      let res: Response;
      try {
        res = await doFetch(o.url, { method: o.method, headers, body, signal: ctrl.signal });
      } catch (e) {
        if (timedOut) throw new ApiError('Gemini took too long to respond. Try again.', null, 'timeout');
        if (isAbort(e)) throw e;
        throw new ApiError(GEMINI_NETWORK_MESSAGE, null, 'network');
      }
      if (res.ok) {
        try {
          return (await res.json()) as T;
        } catch {
          if (timedOut) throw new ApiError('Gemini took too long to respond. Try again.', null, 'timeout');
          if (o.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
          throw new ApiError('Gemini returned an unreadable response. Try again.', res.status, 'bad_response');
        }
      }
      if (RETRYABLE.has(res.status) && attempt < MAX_ATTEMPTS - 1) {
        await res.body?.cancel().catch(() => undefined);
        await wait(retryDelayMs(attempt, res.headers.get('retry-after')), o.signal);
        continue;
      }
      throw await errorFromResponse(res, o.model);
    } finally {
      clearTimeout(timer);
      o.signal?.removeEventListener('abort', onAbort);
    }
  }
}

// ---- model listing ------------------------------------------------------------------------------------------

interface ListResponse {
  models?: { name: string; displayName?: string; supportedGenerationMethods?: string[]; inputTokenLimit?: number; outputTokenLimit?: number }[];
  nextPageToken?: string;
}

const IMAGE_NAME = /image|banana/i;

/** Models that can generateContent, flagged when the name looks like an image model. Sorted image models first. */
export async function listModels(o: Common): Promise<GeminiModel[]> {
  const out: GeminiModel[] = [];
  let pageToken = '';
  for (let page = 0; page < 10; page++) {
    const url = `${GEMINI_BASE}/models?pageSize=1000${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`;
    const r = await send<ListResponse>({ ...o, method: 'GET', url });
    for (const m of r.models ?? []) {
      if (!m.supportedGenerationMethods?.includes('generateContent')) continue;
      const id = m.name.replace(/^models\//, '');
      out.push({
        id,
        displayName: m.displayName ?? id,
        isImage: IMAGE_NAME.test(id) || IMAGE_NAME.test(m.displayName ?? ''),
        inputTokenLimit: m.inputTokenLimit,
        outputTokenLimit: m.outputTokenLimit,
      });
    }
    if (!r.nextPageToken) break;
    pageToken = r.nextPageToken;
  }
  return out.sort((a, b) => Number(b.isImage) - Number(a.isImage) || a.id.localeCompare(b.id));
}

// ---- image generation ---------------------------------------------------------------------------------------

type Modalities = 'IMAGE' | 'TEXT_IMAGE';
/** Models that rejected image-only output are remembered, so the retry happens once per model per page load. */
const modalityByModel = new Map<string, Modalities>();

export const _resetGeminiCachesForTests = () => modalityByModel.clear();

type Part = { text: string } | { inlineData: { mimeType: string; data: string } };

/** Builds the request body. Each reference image is preceded by a text label so the model knows which is which. */
export function buildGenerateBody(r: GenerateImageRequest, modalities: Modalities) {
  const parts: Part[] = [];
  const refs = r.references ?? [];
  if (refs.length) {
    parts.push({ text: 'Reference images follow. Keep character identity, wardrobe, environment design and props consistent with them.' });
    refs.forEach((ref, i) => {
      parts.push({ text: `Reference ${i + 1}: ${ref.label}` });
      parts.push({ inlineData: { mimeType: ref.mimeType, data: ref.data } });
    });
  }
  parts.push({ text: r.prompt });

  return {
    contents: [{ role: 'user', parts }],
    generationConfig: {
      responseModalities: modalities === 'IMAGE' ? ['IMAGE'] : ['TEXT', 'IMAGE'],
      imageConfig: { aspectRatio: r.aspectRatio ?? '16:9', ...(r.imageSize ? { imageSize: r.imageSize } : {}) },
    },
  };
}

interface GenerateResponse {
  candidates?: {
    content?: { parts?: Record<string, any>[] };
    finishReason?: string;
    finishMessage?: string;
  }[];
  promptFeedback?: { blockReason?: string; blockReasonMessage?: string };
}

const BLOCKING_FINISH = new Set(['SAFETY', 'IMAGE_SAFETY', 'PROHIBITED_CONTENT', 'BLOCKLIST', 'SPII', 'IMAGE_PROHIBITED_CONTENT', 'RECITATION', 'IMAGE_RECITATION']);

/** Pulls the image out of a response, or throws ImageBlockedError explaining why there isn't one. */
export function parseGenerateResponse(r: GenerateResponse): GeneratedImage {
  const block = r.promptFeedback?.blockReason;
  if (block)
    throw new ImageBlockedError(`Gemini blocked this prompt (${block}). Try rewording it.${r.promptFeedback?.blockReasonMessage ? ` ${r.promptFeedback.blockReasonMessage}` : ''}`, block);

  const cand = r.candidates?.[0];
  const parts = cand?.content?.parts ?? [];
  let text = '';
  for (const p of parts) {
    if (typeof p.text === 'string' && !p.thought) text += p.text;
    const inline = p.inlineData ?? p.inline_data;
    if (inline?.data) {
      const mimeType: string = inline.mimeType ?? inline.mime_type ?? 'image/png';
      return { blob: base64ToBlob(inline.data, mimeType), mimeType, text };
    }
  }

  const finish = cand?.finishReason ?? '';
  if (BLOCKING_FINISH.has(finish))
    throw new ImageBlockedError(`Gemini declined to generate this image (${finish}). Try rewording the prompt.${cand?.finishMessage ? ` ${cand.finishMessage}` : ''}`, finish);
  if (text.trim()) throw new ImageBlockedError(`Gemini replied with text instead of an image: "${text.trim().slice(0, 240)}"`, 'NO_IMAGE');
  throw new ImageBlockedError(`Gemini returned no image${finish ? ` (${finish})` : ''}. Try again or reword the prompt.`, finish || 'NO_IMAGE');
}

function checkSize(r: GenerateImageRequest) {
  const bytes = (r.references ?? []).reduce((n, x) => n + x.data.length, 0) + r.prompt.length;
  if (bytes > MAX_REQUEST_BYTES)
    throw new ApiError(
      `The reference images are too large to send in one request (${(bytes / 1048576).toFixed(1)} MB; the limit here is ${MAX_REQUEST_BYTES / 1048576} MB). Use fewer or smaller references.`,
      null,
      'too_large',
    );
}

/** Renders one image. Retries 429/5xx, and once more with text+image output if the model rejects image-only. */
export async function generateImage(r: GenerateImageRequest): Promise<GeneratedImage> {
  checkSize(r);
  const url = `${GEMINI_BASE}/models/${encodeURIComponent(r.model)}:generateContent`;
  const attempt = (m: Modalities) => send<GenerateResponse>({ ...r, method: 'POST', url, body: buildGenerateBody(r, m), model: r.model });

  let modalities: Modalities = modalityByModel.get(r.model) ?? 'IMAGE';
  try {
    return parseGenerateResponse(await attempt(modalities));
  } catch (e) {
    if (modalities === 'IMAGE' && e instanceof ApiError && e.status === 400 && /modalit/i.test(e.message)) {
      modalities = 'TEXT_IMAGE';
      modalityByModel.set(r.model, modalities);
      return parseGenerateResponse(await attempt(modalities));
    }
    throw e;
  }
}
