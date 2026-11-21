import { z } from 'zod';
import { SCENE_RULES } from '../lib/ledger/rules';

export const TOOL_NAME = 'submit_blueprint';

const nullable = <T extends z.ZodType>(t: T) => t.nullish().transform((v) => v ?? null);

/** Lenient on purpose: range and tiling problems are the validator's job, so they get precise messages. */
const lipSyncSchema = z.object({
  vocal_start_sec: z.number(),
  vocal_end_sec: z.number(),
  camera_note: z.string().optional(),
});

export const sceneSchema = z.object({
  scene: z.number(),
  section: z.string(),
  start_sec: z.number(),
  end_sec: z.number(),
  base_sec: z.number(),
  extension_sec: nullable(z.number()),
  extension_reason: nullable(z.string()),
  duration_sec: z.number(),
  anchor_ids: z.array(z.string()),
  keyframe_prompt: z.string(),
  base_prompt: z.string(),
  extension_prompt: nullable(z.string()),
  lip_sync: nullable(lipSyncSchema),
});

export const anchorSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.enum(['character', 'environment', 'prop']),
  prompt: z.string(),
});

export const treatmentSchema = z.object({
  title: z.string(),
  paragraphs: z.array(z.string()).min(1),
  facets: z.object({
    narrative_metaphor: z.string(),
    visual_symbolism: z.string(),
    pacing_arc: z.string(),
    camera_language: z.string(),
    color_progression: z.string(),
  }),
});

export const blueprintSchema = z.object({
  treatment: treatmentSchema,
  anchors: z.array(anchorSchema).min(1),
  scenes: z.array(sceneSchema).min(1),
});

export type Blueprint = z.infer<typeof blueprintSchema>;

const str = (description?: string) => ({ type: 'string', ...(description ? { description } : {}) });
const nullOr = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: 'null' }] });
const { baseMin, baseMax, extMin, extMax } = SCENE_RULES;

/** The tool's input_schema, as sent to Claude. Ranges live here so the model sees them. */
export const TOOL_INPUT_SCHEMA = {
  type: 'object',
  required: ['treatment', 'anchors', 'scenes'],
  additionalProperties: false,
  properties: {
    treatment: {
      type: 'object',
      required: ['title', 'paragraphs', 'facets'],
      additionalProperties: false,
      properties: {
        title: str(),
        paragraphs: { type: 'array', minItems: 2, maxItems: 3, items: str(), description: "The 2-3 paragraph director's treatment." },
        facets: {
          type: 'object',
          required: ['narrative_metaphor', 'visual_symbolism', 'pacing_arc', 'camera_language', 'color_progression'],
          additionalProperties: false,
          description: 'One-sentence summaries shown as chips beside the prose.',
          properties: {
            narrative_metaphor: str(),
            visual_symbolism: str(),
            pacing_arc: str(),
            camera_language: str(),
            color_progression: str(),
          },
        },
      },
    },
    anchors: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['id', 'name', 'category', 'prompt'],
        additionalProperties: false,
        properties: {
          id: { type: 'string', pattern: '^[a-z0-9_]+$', description: 'Stable slug, e.g. character, environment_b, prop_telephone.' },
          name: str("Short display name used everywhere: 'Character', 'Environment B', 'Prop: Telephone'."),
          category: { type: 'string', enum: ['character', 'environment', 'prop'] },
          prompt: str('Standalone 16:9 widescreen image prompt. Must work when pasted alone.'),
        },
      },
    },
    scenes: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: [
          'scene', 'section', 'start_sec', 'end_sec', 'base_sec', 'extension_sec', 'extension_reason', 'duration_sec',
          'anchor_ids', 'keyframe_prompt', 'base_prompt', 'extension_prompt', 'lip_sync',
        ],
        additionalProperties: false,
        properties: {
          scene: { type: 'integer', minimum: 1, description: 'Sequential from 1.' },
          section: str("e.g. 'Verse 1A'. Used in the display title and file tag."),
          start_sec: { type: 'integer', minimum: 0, description: 'Whole seconds from song start.' },
          end_sec: { type: 'integer', minimum: 1 },
          base_sec: { type: 'integer', minimum: baseMin, maximum: baseMax, description: 'Length of the Google Flow base clip.' },
          extension_sec: nullOr({
            type: 'integer',
            enum: [extMin, extMax],
            description: `Extension length: ${extMin} or ${extMax}. Null for none. Never 1 or 2.`,
          }),
          extension_reason: nullOr(str(`Required when extension_sec is set: the special requirement that cannot fit in ${baseMax}s. Otherwise null.`)),
          duration_sec: {
            type: 'integer',
            minimum: baseMin,
            maximum: baseMax + extMax,
            description: 'Must equal base_sec + (extension_sec or 0) and end_sec - start_sec.',
          },
          anchor_ids: { type: 'array', minItems: 1, items: str(), description: 'Must reference anchors[].id.' },
          keyframe_prompt: str('A single representative still frame for this scene, for the image model.'),
          base_prompt: str('Google Flow text-to-video prompt for a clip of exactly base_sec seconds.'),
          extension_prompt: nullOr(str('Required when extension_sec is set, otherwise null. Describes only the extra seconds that continue the base clip.')),
          lip_sync: nullOr({
            type: 'object',
            required: ['vocal_start_sec', 'vocal_end_sec'],
            additionalProperties: false,
            description: 'Set only for scenes with a close-up singing performance.',
            properties: {
              vocal_start_sec: { type: 'number', description: 'Song time (seconds) the sung line starts.' },
              vocal_end_sec: { type: 'number', description: 'Song time (seconds) the sung line ends.' },
              camera_note: str(),
            },
          }),
        },
      },
    },
  },
} as const;

export const BLUEPRINT_TOOL = {
  name: TOOL_NAME,
  description: "Submit the Director's Treatment, Reference Anchors and Scene Ledger.",
  input_schema: TOOL_INPUT_SCHEMA as unknown as Record<string, unknown>,
};
