import type { BlueprintInputs } from '../../../prompts/blueprintUser';
import { emptyVision } from '../../../types/project';
import { goodLedger } from '../../ledger/__tests__/helpers';

export const treatment = {
  title: 'Keeper',
  paragraphs: ['One.', 'Two.'],
  facets: { narrative_metaphor: 'a', visual_symbolism: 'b', pacing_arc: 'c', camera_language: 'd', color_progression: 'e' },
};

export const inputs = (over: Partial<BlueprintInputs> = {}): BlueprintInputs => ({
  runtimeSec: 50,
  lrc: [{ t: 14, text: 'sing' }],
  vision: { ...emptyVision(), narrativeArc: 'arc' },
  audioBrief: '',
  ...over,
});

export const validBlueprint = () => ({
  treatment,
  anchors: [{ id: 'character', name: 'Character', category: 'character', prompt: 'A keeper, 16:9' }],
  scenes: goodLedger(),
});

/** Same blueprint with a 2s gap before scene 2 (and scene 2 shortened to keep durations legal). */
export const gappyBlueprint = () => {
  const bp = validBlueprint();
  bp.scenes[1] = { ...bp.scenes[1], start_sec: 14, base_sec: 11, duration_sec: 11 };
  return bp;
};

const enc = new TextEncoder();

export function sseText(events: Record<string, unknown>[]): string {
  return events.map((e) => `event: ${e.type}\ndata: ${JSON.stringify(e)}\n\n`).join('');
}

/** A Response whose body arrives in `chunkSize`-char pieces, so frames split anywhere. */
export function streamResponse(text: string, chunkSize = 23, init: ResponseInit = { status: 200 }): Response {
  const bytes = enc.encode(text);
  let pos = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      if (pos >= bytes.length) return c.close();
      c.enqueue(bytes.slice(pos, pos + chunkSize));
      pos += chunkSize;
    },
  });
  return new Response(body, init);
}

export function toolStream(
  input: unknown,
  o: { id?: string; stopReason?: string; jsonChunk?: number; chunkSize?: number; usage?: [number, number]; noTool?: boolean } = {},
): Response {
  const json = JSON.stringify(input);
  const n = o.jsonChunk ?? 31;
  const events: Record<string, unknown>[] = [
    { type: 'message_start', message: { usage: { input_tokens: o.usage?.[0] ?? 100, output_tokens: 1 } } },
    { type: 'ping' },
  ];
  if (!o.noTool) {
    events.push({ type: 'content_block_start', index: 0, content_block: { type: 'tool_use', id: o.id ?? 'toolu_1', name: 'submit_blueprint', input: {} } });
    for (let i = 0; i < json.length; i += n) events.push({ type: 'content_block_delta', index: 0, delta: { type: 'input_json_delta', partial_json: json.slice(i, i + n) } });
    events.push({ type: 'content_block_stop', index: 0 });
  }
  events.push({ type: 'message_delta', delta: { stop_reason: o.stopReason ?? 'tool_use' }, usage: { output_tokens: o.usage?.[1] ?? 50 } });
  events.push({ type: 'message_stop' });
  return streamResponse(sseText(events), o.chunkSize ?? 23);
}

export const errorResponse = (status: number, type: string, message: string, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify({ type: 'error', error: { type, message } }), { status, headers: { 'content-type': 'application/json', ...headers } });

export type Step = Response | Error;

/** fetch stub that serves queued responses in order and records each call. */
export function mockFetch(steps: Step[]) {
  const calls: { url: string; init: RequestInit; body: any }[] = [];
  const impl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init, body: JSON.parse(String(init.body)) });
    const s = steps.shift();
    if (!s) throw new Error('mockFetch: no more responses queued');
    if (s instanceof Error) throw s;
    return s;
  }) as unknown as typeof fetch;
  return { impl, calls };
}

export const noSleep = async () => undefined;
