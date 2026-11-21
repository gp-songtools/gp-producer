import { SCENE_RULES } from '../lib/ledger/rules';
import type { LrcLine } from '../types/blueprint';
import type { Vision } from '../types/project';

export interface BlueprintInputs {
  runtimeSec: number;
  lrc: LrcLine[];
  vision: Vision;
  audioBrief: string;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/** The user turn: all project inputs as one JSON document. Audio never goes here, only text. */
export function buildBlueprintUserMessage(i: BlueprintInputs): string {
  const T = i.runtimeSec;
  const doc = {
    runtime_sec: T,
    scene_length_rules: {
      base_sec: [SCENE_RULES.baseMin, SCENE_RULES.baseMax],
      extension_sec_allowed: [SCENE_RULES.extMin, SCENE_RULES.extMax],
      invalid_example: '10s base + 2s extension',
    },
    base_only_scene_count_range: [Math.ceil(T / SCENE_RULES.baseMax), Math.floor(T / SCENE_RULES.baseMin)],
    lyrics_lrc: i.lrc.map((l) => ({ t_sec: round2(l.t), text: l.text })),
    last_lyric_starts_sec: i.lrc.length ? round2(i.lrc[i.lrc.length - 1].t) : null,
    thematic_vision: {
      narrative_arc: i.vision.narrativeArc.trim(),
      visual_tone: i.vision.visualTone.trim(),
      mood: i.vision.mood.trim(),
      color_palette: i.vision.palette.trim(),
      film_aesthetic: i.vision.aesthetic.trim(),
    },
    gemini_audio_brief: i.audioBrief.trim() || null,
  };
  return `Here are the project inputs for the music video. Produce the full blueprint now by calling the submit_blueprint tool: treatment, reference anchors, and a scene ledger that covers 0 to ${T} seconds with no gaps or overlaps.\n\n<project_inputs>\n${JSON.stringify(doc, null, 2)}\n</project_inputs>`;
}

/** The problems and the instruction to fix them. */
export function buildRepairMessage(problemsText: string): string {
  return `Your previous submission, shown above in <previous_submission>, failed validation:\n${problemsText}\n\nFix every problem and call submit_blueprint with the COMPLETE corrected blueprint (treatment, all anchors, all scenes), changing only what is needed. Re-check the arithmetic and the scene-length rules before submitting.`;
}

/**
 * A single self-contained user message for a correction. It restates the inputs and quotes the previous
 * submission, rather than replaying the model's earlier turn: newer models tie their thinking blocks to the
 * conversation that produced them, so a replayed turn with a fabricated tool result is fragile.
 */
export function buildRepairUserMessage(originalUserMessage: string, previousSubmission: unknown, problemsText: string): string {
  return `${originalUserMessage}\n\n<previous_submission>\n${JSON.stringify(previousSubmission)}\n</previous_submission>\n\n${buildRepairMessage(problemsText)}`;
}

export const NUDGE_MESSAGE = 'Call the submit_blueprint tool now with the complete blueprint. Do not reply with text.';
