import { revisionSchema, type RevisionProposal } from '../schemas/revision';
import type { Scene, SceneRevision } from '../types/blueprint';

/** Fields a revision can never touch. Documentation and test fixture; the real guarantee is that `applyRevision` copies only prompts. */
export const LOCKED_FIELDS = ['scene', 'section', 'start_sec', 'end_sec', 'base_sec', 'extension_sec', 'extension_reason', 'duration_sec', 'anchor_ids', 'lip_sync'] as const;

export type ParsedRevision = { ok: true; proposal: RevisionProposal } | { ok: false; problems: string[] };

/** Shape check plus "the prompts that must exist, do". Unknown keys (such as a stray start_sec) are dropped by the schema. */
export function parseRevision(input: unknown, scene: Pick<Scene, 'extension_sec'>): ParsedRevision {
  const r = revisionSchema.safeParse(input);
  if (!r.success) return { ok: false, problems: r.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
  const p = r.data;
  const problems: string[] = [];
  if (!p.base_prompt.trim()) problems.push('base_prompt is empty.');
  if (!p.keyframe_prompt.trim()) problems.push('keyframe_prompt is empty.');
  if (scene.extension_sec && !p.extension_prompt?.trim()) problems.push(`extension_prompt is required: this scene has a ${scene.extension_sec}s extension.`);
  return problems.length ? { ok: false, problems } : { ok: true, proposal: p };
}

export const promptsChanged = (scene: Scene, p: RevisionProposal): boolean =>
  p.base_prompt !== scene.base_prompt || p.keyframe_prompt !== scene.keyframe_prompt || (!!scene.extension_sec && (p.extension_prompt ?? scene.extension_prompt) !== scene.extension_prompt);

/**
 * Applies a revision by copying ONLY the three prompt fields onto the existing scene. Everything else, including every
 * locked field, comes from `scene` itself, so nothing in `proposal` can alter timing or the file tag. The replaced
 * prompts are pushed onto `revisions[]` for undo. A base-only scene never gains an extension prompt.
 */
export function applyRevision(scene: Scene, proposal: RevisionProposal, request: string, at = Date.now()): Scene {
  const entry: SceneRevision = {
    at,
    request,
    old: { basePrompt: scene.base_prompt, extensionPrompt: scene.extension_prompt, keyframePrompt: scene.keyframe_prompt, ...(scene.needs_review ? { needsReview: true } : {}) },
    notes: proposal.notes,
  };
  const { needs_review: _cleared, ...rest } = scene;
  void _cleared;
  return {
    ...rest,
    base_prompt: proposal.base_prompt,
    keyframe_prompt: proposal.keyframe_prompt,
    extension_prompt: scene.extension_sec ? (proposal.extension_prompt?.trim() ? proposal.extension_prompt : scene.extension_prompt) : scene.extension_prompt,
    revisions: [...(scene.revisions ?? []), entry],
  };
}

/** Puts back the prompts the latest revision replaced and removes it from the history. No-op without revisions. */
export function undoLatestRevision(scene: Scene): Scene {
  const list = scene.revisions ?? [];
  const last = list[list.length - 1];
  if (!last) return scene;
  const { revisions: _drop, ...rest } = scene;
  void _drop;
  const rest2 = list.length > 1 ? { ...rest, revisions: list.slice(0, -1) } : rest;
  return {
    ...rest2,
    base_prompt: last.old.basePrompt,
    extension_prompt: last.old.extensionPrompt,
    keyframe_prompt: last.old.keyframePrompt,
    ...(last.old.needsReview ? { needs_review: true } : {}),
  };
}
