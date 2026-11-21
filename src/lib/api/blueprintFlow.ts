import { buildBlueprintUserMessage, buildRepairUserMessage, NUDGE_MESSAGE, type BlueprintInputs } from '../../prompts/blueprintUser';
import { buildSystemPrompt } from '../../prompts/system';
import { BLUEPRINT_TOOL, type Blueprint } from '../../schemas/blueprint';
import type { Issue } from '../../types/blueprint';
import type { RunRecord } from '../../types/project';
import { issuesToText, parseBlueprint, validateBlueprintExtras } from '../blueprint';
import { hasErrors, validateLedger } from '../ledger/validate';
import { callTool, type Message, type ToolCallProgress, type ToolCallResult, type Usage } from './anthropic';
import { BlueprintError, NoToolCallError } from './errors';
import type { Sleep } from './retry';

export interface FlowOptions {
  apiKey: string;
  model: string;
  inputs: BlueprintInputs;
  signal?: AbortSignal;
  onProgress?: (p: ToolCallProgress) => void;
  onStatus?: (s: 'generating' | 'repairing') => void;
  fetchImpl?: typeof fetch;
  sleep?: Sleep;
  maxTokens?: number;
}

export interface FlowResult {
  blueprint: Blueprint;
  /** Everything the validator found in the final blueprint, warnings included. */
  issues: Issue[];
  /** True if a second call was needed. */
  repaired: boolean;
  usage: Usage;
  model: string;
  /** Raw tool inputs from each attempt, kept for the run history. */
  attempts: unknown[];
}

type Evaluation = { ok: true; blueprint: Blueprint; issues: Issue[] } | { ok: false; problems: string[] };

/** Shape check, then ledger and anchor validation against the user's lyrics and runtime. */
export function evaluate(input: unknown, inputs: BlueprintInputs): Evaluation {
  const parsed = parseBlueprint(input);
  if (!parsed.ok) return { ok: false, problems: parsed.problems };
  const bp = parsed.blueprint;
  const anchorIds = new Set(bp.anchors.map((a) => a.id));
  const issues = [...validateLedger(bp.scenes, inputs.runtimeSec, inputs.lrc, anchorIds), ...validateBlueprintExtras(bp)];
  return { ok: true, blueprint: bp, issues };
}

const addUsage = (a: Usage, b: Usage): Usage => ({
  input_tokens: a.input_tokens + b.input_tokens,
  output_tokens: a.output_tokens + b.output_tokens,
});

const call = (o: FlowOptions, messages: Message[]): Promise<ToolCallResult> =>
  callTool({
    apiKey: o.apiKey,
    model: o.model,
    system: buildSystemPrompt(),
    tool: BLUEPRINT_TOOL,
    messages,
    maxTokens: o.maxTokens,
    signal: o.signal,
    onProgress: o.onProgress,
    fetchImpl: o.fetchImpl,
    sleep: o.sleep,
  });

/**
 * Asks Claude to correct a blueprint, as one fresh message that quotes the previous submission and the problems.
 * Exactly one extra call; whatever comes back is returned with its remaining issues.
 */
async function repairPass(
  o: FlowOptions,
  userMessage: string,
  previousInput: unknown,
  problemsText: string,
  first: ToolCallResult | null,
): Promise<FlowResult> {
  o.onStatus?.('repairing');
  const second = await callWithNudge(o, [{ role: 'user', content: buildRepairUserMessage(userMessage, previousInput, problemsText) }]);
  const ev = evaluate(second.input, o.inputs);
  if (!ev.ok) throw new BlueprintError("Claude's blueprint didn't match the expected structure, even after a correction.", ev.problems);
  return {
    blueprint: ev.blueprint,
    issues: ev.issues,
    repaired: true,
    usage: first ? addUsage(first.usage, second.usage) : second.usage,
    model: o.model,
    attempts: first ? [first.input, second.input] : [previousInput, second.input],
  };
}

/**
 * Tool choice can't be forced on newer models, so Claude may occasionally answer in text.
 * Retry once with the reply quoted and an explicit request to call the tool.
 */
async function callWithNudge(o: FlowOptions, messages: Message[]): Promise<ToolCallResult> {
  try {
    return await call(o, messages);
  } catch (e) {
    if (!(e instanceof NoToolCallError)) throw e;
    const nudge: Message[] = [...messages];
    if (e.text.trim()) nudge.push({ role: 'assistant', content: e.text.trim() });
    nudge.push({ role: 'user', content: NUDGE_MESSAGE });
    return call(o, nudge);
  }
}

/** Generates a blueprint, with one automatic correction pass if it fails validation. */
export async function generateBlueprint(o: FlowOptions): Promise<FlowResult> {
  const userMessage = buildBlueprintUserMessage(o.inputs);
  o.onStatus?.('generating');
  const first = await callWithNudge(o, [{ role: 'user', content: userMessage }]);
  const ev = evaluate(first.input, o.inputs);

  if (ev.ok && !hasErrors(ev.issues))
    return { blueprint: ev.blueprint, issues: ev.issues, repaired: false, usage: first.usage, model: o.model, attempts: [first.input] };

  const problems = ev.ok ? issuesToText(ev.issues) : ev.problems.map((p) => `- ${p}`).join('\n');
  return repairPass(o, userMessage, first.input, problems, first);
}

/** Asks Claude to fix an existing blueprint (for example after Snap boundaries left prompts needing review). */
export async function repairBlueprint(o: FlowOptions & { current: Blueprint; issues: Issue[] }): Promise<FlowResult> {
  const problems = issuesToText(o.issues);
  if (!problems) throw new BlueprintError('There is nothing to fix: no errors were found.');
  return repairPass(o, buildBlueprintUserMessage(o.inputs), o.current, problems, null);
}

export function makeRunRecord(projectId: string, r: FlowResult, kind: RunRecord['kind'] = 'blueprint'): RunRecord {
  return {
    id: crypto.randomUUID(),
    projectId,
    kind,
    createdAt: Date.now(),
    payload: { model: r.model, repaired: r.repaired, attempts: r.attempts, issues: r.issues },
    usage: r.usage,
  };
}
