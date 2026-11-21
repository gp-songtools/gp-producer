import { ApiError, BlueprintError, friendlyAnthropicError, isAbort, NETWORK_MESSAGE, NoToolCallError } from './errors';
import type { Effort } from '../settings';
import { MAX_ATTEMPTS, RETRYABLE, retryDelayMs, sleep as realSleep, type Sleep } from './retry';
import { readSse } from './sse';

export const ANTHROPIC_URL = 'https://api.anthropic.com/v1/messages';
export const ANTHROPIC_VERSION = '2023-06-01';
/** Streaming is required for a response this large; 32k leaves room for ~20 detailed scenes. */
export const DEFAULT_MAX_TOKENS = 32_000;

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; tool_use_id: string; content: string; is_error?: boolean };

export interface Message {
  role: 'user' | 'assistant';
  content: string | ContentBlock[];
}

export interface ToolDef {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface Usage {
  input_tokens: number;
  output_tokens: number;
}

export interface ToolCallProgress {
  /** Scenes started so far (counts "start_sec" keys). */
  scenes: number;
  chars: number;
}

export interface ToolCallRequest {
  apiKey: string;
  model: string;
  system: string;
  tool: ToolDef;
  messages: Message[];
  maxTokens?: number;
  /** Reasoning effort. Omit to use the model's default. */
  effort?: Effort;
  signal?: AbortSignal;
  onProgress?: (p: ToolCallProgress) => void;
  /** Injectable for tests. */
  fetchImpl?: typeof fetch;
  sleep?: Sleep;
}

export interface ToolCallResult {
  input: unknown;
  toolUseId: string;
  stopReason: string | null;
  usage: Usage;
}

const SCENE_KEY = '"start_sec"';

/** Builds the request. Browser calls need the dangerous-direct-browser-access header. */
export function buildRequest(r: ToolCallRequest): { headers: Record<string, string>; body: string } {
  return {
    headers: {
      'content-type': 'application/json',
      'x-api-key': r.apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: r.model,
      max_tokens: r.maxTokens ?? DEFAULT_MAX_TOKENS,
      stream: true,
      system: r.system,
      tools: [r.tool],
      // Newer models (e.g. Sonnet 5.5) reject forced tool_choice with a 400. "auto" plus an explicit instruction works everywhere.
      tool_choice: { type: 'auto' },
      messages: r.messages,
      ...(r.effort ? { output_config: { effort: r.effort } } : {}),
    }),
  };
}

async function errorFromResponse(res: Response, model: string): Promise<ApiError> {
  let type = 'error';
  let message = res.statusText;
  try {
    const j = (await res.json()) as { error?: { type?: string; message?: string } };
    type = j.error?.type ?? type;
    message = j.error?.message ?? message;
  } catch {
    /* body wasn't JSON */
  }
  return new ApiError(friendlyAnthropicError(res.status, type, message, model), res.status, type);
}

/** POSTs with retry on 429/5xx/529, returning the open streaming response. */
async function postWithRetry(r: ToolCallRequest): Promise<Response> {
  const doFetch = r.fetchImpl ?? fetch;
  const wait = r.sleep ?? realSleep;
  const { headers, body } = buildRequest(r);

  for (let attempt = 0; ; attempt++) {
    let res: Response;
    try {
      res = await doFetch(ANTHROPIC_URL, { method: 'POST', headers, body, signal: r.signal });
    } catch (e) {
      if (isAbort(e)) throw e;
      throw new ApiError(NETWORK_MESSAGE, null, 'network');
    }
    if (res.ok) return res;
    if (RETRYABLE.has(res.status) && attempt < MAX_ATTEMPTS - 1) {
      await res.body?.cancel().catch(() => undefined);
      await wait(retryDelayMs(attempt, res.headers.get('retry-after')), r.signal);
      continue;
    }
    throw await errorFromResponse(res, r.model);
  }
}

/** Calls the Messages API with one tool available and returns the tool's input once the stream completes. */
export async function callTool(r: ToolCallRequest): Promise<ToolCallResult> {
  const res = await postWithRetry(r);
  if (!res.body) throw new BlueprintError('Anthropic returned an empty response.');

  let toolUseId = '';
  let sawTool = false;
  let json = '';
  let text = '';
  let tail = '';
  let scenes = 0;
  let stopReason: string | null = null;
  const usage: Usage = { input_tokens: 0, output_tokens: 0 };

  try {
    for await (const ev of readSse(res.body)) {
      let data: Record<string, any>;
      try {
        data = JSON.parse(ev.data);
      } catch {
        continue; // keep-alive or non-JSON frame
      }
      switch (data.type) {
        case 'message_start':
          usage.input_tokens = data.message?.usage?.input_tokens ?? 0;
          usage.output_tokens = data.message?.usage?.output_tokens ?? 0;
          break;
        case 'content_block_start':
          if (data.content_block?.type === 'tool_use') {
            sawTool = true;
            toolUseId = data.content_block.id;
          }
          break;
        case 'content_block_delta':
          if (data.delta?.type === 'text_delta') text += data.delta.text ?? '';
          if (data.delta?.type === 'input_json_delta') {
            const piece: string = data.delta.partial_json ?? '';
            // The tail is shorter than the key, so no match can sit entirely inside it and be counted twice.
            scenes += (`${tail}${piece}`.split(SCENE_KEY).length - 1);
            tail = (tail + piece).slice(-(SCENE_KEY.length - 1));
            json += piece;
            r.onProgress?.({ scenes, chars: json.length });
          }
          break;
        case 'message_delta':
          stopReason = data.delta?.stop_reason ?? stopReason;
          if (data.usage?.output_tokens !== undefined) usage.output_tokens = data.usage.output_tokens;
          break;
        case 'error':
          throw new ApiError(
            friendlyAnthropicError(data.error?.type === 'overloaded_error' ? 529 : 500, data.error?.type ?? 'error', data.error?.message ?? 'stream error', r.model),
            null,
            data.error?.type ?? 'stream_error',
          );
      }
    }
  } catch (e) {
    if (e instanceof ApiError || isAbort(e)) throw e;
    throw new ApiError('The connection to Anthropic dropped mid-response. Try again.', null, 'stream_dropped');
  }

  if (stopReason === 'max_tokens')
    throw new BlueprintError('Claude ran out of output space before finishing. Try again, or use a shorter song or brief.');
  if (!sawTool) throw new NoToolCallError(text);

  let input: unknown = {};
  if (json.trim()) {
    try {
      input = JSON.parse(json);
    } catch {
      throw new BlueprintError("Claude's response was cut off or malformed. Try again.");
    }
  }
  return { input, toolUseId, stopReason, usage };
}
