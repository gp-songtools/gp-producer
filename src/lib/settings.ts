export interface ModelRoles {
  /** Default for anchors and scene keyframes. */
  workhorse: string;
  /** Hero anchors and strict character continuity. */
  hero: string;
  /** Quick, cheap drafts. */
  draft: string;
}

export interface Settings {
  claudeModel: string;
  models: ModelRoles;
  /** Cap on reference anchors passed with a scene keyframe. */
  maxAnchorsPerScene: number;
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
  models: DEFAULT_MODELS,
  maxAnchorsPerScene: 3,
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
    models: {
      workhorse: str(m.workhorse, DEFAULT_MODELS.workhorse),
      hero: str(m.hero, DEFAULT_MODELS.hero),
      draft: str(m.draft, DEFAULT_MODELS.draft),
    },
    maxAnchorsPerScene: Number.isInteger(n) ? Math.min(MAX_ANCHORS_LIMIT, Math.max(1, n)) : DEFAULT_SETTINGS.maxAnchorsPerScene,
  };
}
