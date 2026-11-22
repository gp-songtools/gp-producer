import { buildFileTag } from '../lib/ledger/fileTag';
import { fmt } from '../lib/ledger/format';
import { LIPSYNC_REMINDERS } from '../lib/ledger/lipsync';
import { SCENE_RULES } from '../lib/ledger/rules';
import { REVISION_TOOL_NAME } from '../schemas/revision';
import type { LrcLine, Scene, Treatment } from '../types/blueprint';

export interface RevisionInputs {
  treatment: Treatment | null;
  /** Only the anchors attached to this scene. */
  anchors: { id: string; name: string; prompt: string }[];
  scene: Scene;
  lyrics: LrcLine[];
  /** What the user says went wrong. */
  request: string;
}

export function buildRevisionSystemPrompt(): string {
  return `You are the user's co-director on an AI music video made with Google Flow. A scene's prompts did not work out, and you revise that ONE scene by calling the ${REVISION_TOOL_NAME} tool exactly once.

# What you can change
Only the scene's prompt text: base_prompt, extension_prompt (only if the scene has an extension) and keyframe_prompt, plus a short note. Everything else is LOCKED and has no field in the tool: timestamps, durations, base and extension seconds, section name, anchors, lip-sync window and file tag. Never try to work around that, and never mention changing them.

# How to revise
- Fix what the user describes, and change as little else as you can. Return a prompt UNCHANGED, word for word, if the user's problem doesn't concern it.
- base_prompt describes a clip of exactly the locked base_sec seconds: pace the action to that length, and keep subject action, background behaviour, camera movement and lighting explicit. The extension_prompt continues from where the base clip ends for the locked extension seconds.
- keyframe_prompt describes one still frame (usually the opening composition), 16:9, in the same visual language as the anchors. A single moment, not motion.
- Prompts must make sense on their own, describe the anchors' content in words, and stay consistent with the treatment and the other prompts of this scene. Scenes are ${SCENE_RULES.baseMin}-${SCENE_RULES.baseMax}s base clips, so do not plan action that cannot fit.
- If the scene is LIP-SYNC, keep the singer's face the largest in frame, clearly visible and mostly front-facing, the mouth unobstructed, with no dissolves, whip pans, strobing or glitch effects inside the shot.
- You cannot hear the audio; the lyrics and their timestamps are the only timing facts.

Your entire response must be one call to the ${REVISION_TOOL_NAME} tool: write no text before or after it.`;
}

/** The user turn: context, the LOCKED facts read-only, the current prompts, and the user's description. */
export function buildRevisionUserMessage(i: RevisionInputs): string {
  const s = i.scene;
  const locked = {
    scene: s.scene,
    section: s.section,
    song_time: `${fmt(s.start_sec)}-${fmt(s.end_sec)} (${s.start_sec}-${s.end_sec}s)`,
    base_sec: s.base_sec,
    extension_sec: s.extension_sec,
    duration_sec: s.duration_sec,
    file_tag: buildFileTag(s),
    lip_sync: s.lip_sync ? { vocal_start_sec: s.lip_sync.vocal_start_sec, vocal_end_sec: s.lip_sync.vocal_end_sec, reminders: LIPSYNC_REMINDERS, camera_note: s.lip_sync.camera_note ?? null } : null,
  };
  const current = {
    base_prompt: s.base_prompt,
    extension_prompt: s.extension_sec ? s.extension_prompt : null,
    keyframe_prompt: s.keyframe_prompt,
  };
  const lyrics = i.lyrics.length ? i.lyrics.map((l) => `[${l.t.toFixed(2)}s] ${l.text}`).join('\n') : '(instrumental)';
  const treatment = i.treatment ? `${i.treatment.title}\n${i.treatment.paragraphs.join('\n')}` : '(none)';
  return `Revise scene ${s.scene} by calling the ${REVISION_TOOL_NAME} tool.

<treatment>
${treatment}
</treatment>

<anchors_attached_to_this_scene>
${i.anchors.length ? i.anchors.map((a) => `${a.name} (${a.id}): ${a.prompt}`).join('\n') : '(none)'}
</anchors_attached_to_this_scene>

<locked_read_only>
${JSON.stringify(locked, null, 2)}
</locked_read_only>

<scene_lyrics>
${lyrics}
</scene_lyrics>

<current_prompts>
${JSON.stringify(current, null, 2)}
</current_prompts>

<what_went_wrong>
${i.request.trim()}
</what_went_wrong>`;
}

export const REVISION_NUDGE = `Call the ${REVISION_TOOL_NAME} tool now with the revised prompts. Do not reply with text.`;

/** One self-contained message quoting a text-only reply, instead of replaying the model's earlier turn. */
export function buildRevisionNudgeMessage(original: string, replyText: string): string {
  const quoted = replyText.trim() ? `\n\n<your_previous_reply>\n${replyText.trim()}\n</your_previous_reply>` : '';
  return `${original}${quoted}\n\n${REVISION_NUDGE}`;
}

/** One self-contained message quoting the unusable submission and what was wrong with it. */
export function buildRevisionCorrectionMessage(original: string, previous: unknown, problems: string[]): string {
  return `${original}\n\n<previous_submission>\n${JSON.stringify(previous)}\n</previous_submission>\n\nYour previous submission was unusable:\n${problems.map((p) => `- ${p}`).join('\n')}\n\nCall ${REVISION_TOOL_NAME} again with a corrected, complete submission.`;
}
