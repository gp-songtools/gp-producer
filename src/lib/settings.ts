export interface ModelRoles {
  /** Default for anchors and scene keyframes. */
  workhorse: string;
  /** Hero anchors and strict character continuity. */
  hero: string;
  /** Quick, cheap drafts. */
  draft: string;
}

export const EFFORT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max'] as const;
export type Effort = (typeof EFFORT_LEVELS)[number];
/** "default" sends nothing, so the model's own default applies (Sonnet 5.5: high; Opus 5.5 and Haiku 5.5: medium). */
export type EffortSetting = 'default' | Effort;

export const EFFORT_OPTIONS: { value: EffortSetting; label: string }[] = [
  { value: 'default', label: 'Model default' },
  { value: 'low', label: 'Low (cheapest)' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'xhigh', label: 'Extra high' },
  { value: 'max', label: 'Max (costliest)' },
];

export interface Settings {
  claudeModel: string;
  /** Reasoning effort for blueprint generation. Lower is cheaper and faster; thinking tokens bill as output. */
  claudeEffort: EffortSetting;
  models: ModelRoles;
  /** Cap on reference anchors passed with a scene keyframe. */
  maxAnchorsPerScene: number;
  /** When on, Workhorse generations use the Draft model. An explicit Hero choice (including Upgrade to Hero) is unaffected. */
  draftMode: boolean;
}

export const CLAUDE_MODEL_PRESETS = [
  { id: 'claude-sonnet-5-5', label: 'Sonnet 5.5 (default)' },
  { id: 'claude-opus-5-5', label: 'Opus 5.5' },
  { id: 'claude-fable-5-2', label: 'Fable 5.2' },
  { id: 'claude-haiku-5-5', label: 'Haiku 5.5' },
] as const;

export const DEFAULT_MODELS: ModelRoles = {
  workhorse: 'gemini-nano-banana-2.1',
  hero: 'gemini-3-pro-image',
  draft: 'gemini-3.1-flash-lite-image',
};

export const DEFAULT_SETTINGS: Settings = {
  claudeModel: 'claude-sonnet-5-5',
  claudeEffort: 'default',
  models: DEFAULT_MODELS,
  maxAnchorsPerScene: 3,
  draftMode: false,
};

export const MAX_ANCHORS_LIMIT = 6;

const str = (v: unknown, fallback: string) => (typeof v === 'string' && v.trim() ? v.trim() : fallback);

/** Rebuilds settings from untrusted stored JSON, falling back per field. */
export function sanitizeSettings(raw: unknown): Settings {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const m = (o.models && typeof o.models === 'object' ? o.models : {}) as Record<string, unknown>;
  const n = Number(o.maxAnchorsPerScene);
  return {
    claudeModel: str(o.claudeModel, DEFAULT_SETTINGS.claudeModel),
    claudeEffort: (['default', ...EFFORT_LEVELS] as string[]).includes(o.claudeEffort as string) ? (o.claudeEffort as EffortSetting) : 'default',
    models: {
      workhorse: str(m.workhorse, DEFAULT_MODELS.workhorse),
      hero: str(m.hero, DEFAULT_MODELS.hero),
      draft: str(m.draft, DEFAULT_MODELS.draft),
    },
    draftMode: o.draftMode === true,
    maxAnchorsPerScene: Number.isInteger(n) ? Math.min(MAX_ANCHORS_LIMIT, Math.max(1, n)) : DEFAULT_SETTINGS.maxAnchorsPerScene,
  };
}

/** The model role a generation actually uses: draft mode turns Workhorse into Draft; Hero and Draft stay as chosen. */
export const resolveRole = (role: keyof ModelRoles, draftMode: boolean): keyof ModelRoles => (draftMode && role === 'workhorse' ? 'draft' : role);
