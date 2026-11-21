import type { Blueprint } from '../schemas/blueprint';
import { blueprintSchema } from '../schemas/blueprint';
import type { BlueprintAnchor, BlueprintScene, Issue, Treatment } from '../types/blueprint';

export type ParseResult = { ok: true; blueprint: Blueprint } | { ok: false; problems: string[] };

/** Validates the tool input's shape. Returns readable problems rather than throwing. */
export function parseBlueprint(input: unknown): ParseResult {
  const r = blueprintSchema.safeParse(input);
  if (r.success) return { ok: true, blueprint: r.data };
  return {
    ok: false,
    problems: r.error.issues.slice(0, 20).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
  };
}

const ANCHOR_ID = /^[a-z0-9_]+$/;

/** Checks the treatment and anchors. (Scene tiling is validateLedger's job.) */
export function validateBlueprintExtras(bp: Blueprint): Issue[] {
  const issues: Issue[] = [];
  const err = (code: string, message: string, scene?: number) => issues.push({ severity: 'error', code, message, scene });
  const warn = (code: string, message: string) => issues.push({ severity: 'warn', code, message });

  const n = bp.treatment.paragraphs.length;
  if (n < 2 || n > 3) warn('TREATMENT_LENGTH', `The treatment has ${n} paragraph(s); 2–3 were requested.`);

  const ids = new Set<string>();
  const names = new Set<string>();
  for (const a of bp.anchors) {
    if (!ANCHOR_ID.test(a.id)) err('BAD_ANCHOR_ID', `Anchor id "${a.id}" must be lowercase letters, digits and underscores.`);
    if (ids.has(a.id)) err('DUP_ANCHOR', `Anchor id "${a.id}" is used twice.`);
    ids.add(a.id);
    if (names.has(a.name.toLowerCase())) warn('DUP_ANCHOR_NAME', `Two anchors are named "${a.name}".`);
    names.add(a.name.toLowerCase());
    if (!a.prompt.trim()) err('EMPTY_PROMPT', `Anchor "${a.name}" has no prompt.`);
  }

  for (const s of bp.scenes) {
    if (!s.base_prompt.trim()) err('EMPTY_PROMPT', 'Base prompt is empty.', s.scene);
    if (!s.keyframe_prompt.trim()) err('EMPTY_PROMPT', 'Keyframe prompt is empty.', s.scene);
    if (!s.section.trim()) err('EMPTY_SECTION', 'Section name is empty.', s.scene);
  }
  return issues;
}

/** Keeps only blueprint fields: drops client flags (needs_review) and storage keys (projectId). */
export function stripScene(s: BlueprintScene): BlueprintScene {
  return {
    scene: s.scene,
    section: s.section,
    start_sec: s.start_sec,
    end_sec: s.end_sec,
    base_sec: s.base_sec,
    extension_sec: s.extension_sec,
    extension_reason: s.extension_reason,
    duration_sec: s.duration_sec,
    anchor_ids: s.anchor_ids,
    keyframe_prompt: s.keyframe_prompt,
    base_prompt: s.base_prompt,
    extension_prompt: s.extension_prompt,
    lip_sync: s.lip_sync,
  };
}

export const stripAnchor = (a: BlueprintAnchor): BlueprintAnchor => ({ id: a.id, name: a.name, category: a.category, prompt: a.prompt });

export const toBlueprint = (treatment: Treatment, anchors: BlueprintAnchor[], scenes: BlueprintScene[]): Blueprint => ({
  treatment,
  anchors: anchors.map(stripAnchor),
  scenes: scenes.map(stripScene),
});

/** Error-level issues as the bullet list sent back to Claude. */
export function issuesToText(issues: Issue[], limit = 40): string {
  const errors = issues.filter((i) => i.severity === 'error');
  const lines = errors.slice(0, limit).map((i) => `- ${i.scene ? `Scene ${i.scene} ` : ''}[${i.code}] ${i.message}`);
  if (errors.length > limit) lines.push(`- …and ${errors.length - limit} more.`);
  return lines.join('\n');
}
