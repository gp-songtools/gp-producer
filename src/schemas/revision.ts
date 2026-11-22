import { z } from 'zod';

export const REVISION_TOOL_NAME = 'submit_revision';

/**
 * What Claude may change when revising a scene: prompt text and a note, nothing else. Timestamps, durations, base/extension
 * seconds, section, anchors, lip-sync window and the file tag have NO field here, so they cannot be returned, let alone applied.
 */
export const revisionSchema = z.object({
  base_prompt: z.string(),
  extension_prompt: z.string().nullish().transform((v) => v ?? null),
  keyframe_prompt: z.string(),
  notes: z.string().nullish().transform((v) => v ?? ''),
});
export type RevisionProposal = z.infer<typeof revisionSchema>;

/** The only keys the tool accepts. Exported so a test can pin the "locked fields are not editable" guarantee. */
export const REVISION_FIELDS = ['base_prompt', 'extension_prompt', 'keyframe_prompt', 'notes'] as const;

export const REVISION_TOOL = {
  name: REVISION_TOOL_NAME,
  description: "Submit the revised prompts for this one scene. Timing, length, section, anchors and file tag are locked and cannot be changed.",
  input_schema: {
    type: 'object',
    required: ['base_prompt', 'keyframe_prompt', 'notes'],
    additionalProperties: false,
    properties: {
      base_prompt: { type: 'string', description: 'Revised Google Flow text-to-video prompt for a clip of exactly the scene\'s base_sec seconds. Return the current prompt unchanged if it needs no change.' },
      extension_prompt: { type: ['string', 'null'], description: 'Revised extension prompt if the scene has an extension (required then), otherwise null.' },
      keyframe_prompt: { type: 'string', description: 'Revised single-still-frame prompt for the image model. Return the current prompt unchanged if it needs no change.' },
      notes: { type: 'string', description: 'One or two sentences: what you changed and why.' },
    },
  } as Record<string, unknown>,
};
