import { buildRevisionCorrectionMessage, buildRevisionNudgeMessage, buildRevisionSystemPrompt, buildRevisionUserMessage, type RevisionInputs } from '../../prompts/revision';
import { REVISION_TOOL, type RevisionProposal } from '../../schemas/revision';
import type { RunRecord } from '../../types/project';
import { parseRevision } from '../revision';
import type { Effort } from '../settings';
import { callTool, type ToolCallResult, type Usage } from './anthropic';
import { BlueprintError, NoToolCallError } from './errors';
import type { Sleep } from './retry';

export interface RevisionOptions {
  apiKey: string;
  model: string;
  inputs: RevisionInputs;
  effort?: Effort;
  signal?: AbortSignal;
  fetchImpl?: typeof fetch;
  sleep?: Sleep;
  maxTokens?: number;
}

export interface RevisionResult {
  proposal: RevisionProposal;
  usage: Usage;
  model: string;
  effort: Effort | null;
  repaired: boolean;
  attempts: unknown[];
}

const DEFAULT_MAX_TOKENS = 8_000;

const call = (o: RevisionOptions, content: string): Promise<ToolCallResult> =>
  callTool({
    apiKey: o.apiKey,
    model: o.model,
    system: buildRevisionSystemPrompt(),
    tool: REVISION_TOOL,
    messages: [{ role: 'user', content }],
    maxTokens: o.maxTokens ?? DEFAULT_MAX_TOKENS,
    effort: o.effort,
    signal: o.signal,
    fetchImpl: o.fetchImpl,
    sleep: o.sleep,
  });

const add = (a: Usage, b: Usage): Usage => ({ input_tokens: a.input_tokens + b.input_tokens, output_tokens: a.output_tokens + b.output_tokens });

/**
 * Asks Claude to rewrite one scene's prompts. The model can't force a tool call on newer models, so a text-only reply gets
 * one nudge, and an unusable submission gets one correction; both are single self-contained user messages (no replayed turns).
 * The result is a proposal only: nothing is applied until the user accepts it.
 */
export async function reviseScene(o: RevisionOptions): Promise<RevisionResult> {
  if (!o.inputs.request.trim()) throw new BlueprintError('Describe what went wrong with this scene first.');
  const original = buildRevisionUserMessage(o.inputs);
  const attempts: unknown[] = [];
  let usage: Usage = { input_tokens: 0, output_tokens: 0 };

  const ask = async (content: string): Promise<ToolCallResult> => {
    const r = await call(o, content);
    usage = add(usage, r.usage);
    attempts.push(r.input);
    return r;
  };

  let first: ToolCallResult;
  try {
    first = await ask(original);
  } catch (e) {
    if (!(e instanceof NoToolCallError)) throw e;
    first = await ask(buildRevisionNudgeMessage(original, e.text));
  }

  const parsed = parseRevision(first.input, o.inputs.scene);
  if (parsed.ok) return { proposal: parsed.proposal, usage, model: o.model, effort: o.effort ?? null, repaired: false, attempts };

  const second = await ask(buildRevisionCorrectionMessage(original, first.input, parsed.problems));
  const again = parseRevision(second.input, o.inputs.scene);
  if (!again.ok) throw new BlueprintError("Claude's revision didn't have the expected prompts, even after a correction.", again.problems);
  return { proposal: again.proposal, usage, model: o.model, effort: o.effort ?? null, repaired: true, attempts };
}

export function makeRevisionRun(projectId: string, scene: number, request: string, r: RevisionResult): RunRecord {
  return {
    id: crypto.randomUUID(),
    projectId,
    kind: 'revision',
    createdAt: Date.now(),
    payload: { scene, request, model: r.model, effort: r.effort, repaired: r.repaired, attempts: r.attempts },
    usage: r.usage,
  };
}
