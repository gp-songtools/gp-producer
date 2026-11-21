export interface LrcLine {
  /** Seconds from song start, fractional. */
  t: number;
  text: string;
}

export interface LipSync {
  vocal_start_sec: number;
  vocal_end_sec: number;
  camera_note?: string;
}

/** One scene as returned by Claude (snake_case matches the tool schema). */
export interface BlueprintScene {
  scene: number;
  section: string;
  start_sec: number;
  end_sec: number;
  /** Google Flow base clip length. */
  base_sec: number;
  /** Optional extension length (3 or 4), or null. */
  extension_sec: number | null;
  /** Required when extension_sec is set: the special requirement that cannot fit in 15s. */
  extension_reason: string | null;
  duration_sec: number;
  anchor_ids: string[];
  keyframe_prompt: string;
  base_prompt: string;
  extension_prompt: string | null;
  lip_sync: LipSync | null;
}

/** Scene as held by the app: blueprint fields plus client-side flags. */
export interface Scene extends BlueprintScene {
  /** Set when a deterministic repair changed the base/extension split, so the prompts may no longer fit. */
  needs_review?: boolean;
}

export type Issue = {
  severity: 'error' | 'warn';
  code: string;
  /** 1-based scene number, for jump-to-card. */
  scene?: number;
  message: string;
};
