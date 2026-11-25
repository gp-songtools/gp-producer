import { z } from 'zod';
import { anchorSchema, sceneSchema, treatmentSchema } from './blueprint';

export const ARCHIVE_FORMAT = 'gp-producer-project';
export const ARCHIVE_VERSION = 1;

export const IMAGE_MIMES = ['image/png', 'image/jpeg', 'image/webp'] as const;

const dim = z.number().int().positive().max(20_000);

export const imageMetaSchema = z.object({
  /** Also the file name inside `images/`, so it is restricted to safe characters. */
  id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
  ownerKey: z.string().regex(/^(anchor:.{1,80}|sheet:.{1,80}|scene:\d{1,3})$/),
  kind: z.enum(['anchor', 'keyframe', 'sheet']),
  mime: z.enum(IMAGE_MIMES),
  width: dim,
  height: dim,
  model: z.string().nullable(),
  prompt: z.string().nullable(),
  source: z.enum(['generated', 'uploaded']),
  refImageIds: z.array(z.string()).optional(),
  createdAt: z.number(),
});
export type ImageMeta = z.infer<typeof imageMetaSchema>;

const revisionSchema = z.object({
  at: z.number(),
  request: z.string(),
  old: z.object({ basePrompt: z.string(), extensionPrompt: z.string().nullable(), keyframePrompt: z.string(), needsReview: z.boolean().optional() }),
  notes: z.string(),
});

const storedSceneSchema = sceneSchema.extend({
  needs_review: z.boolean().optional(),
  checklist: z.record(z.string(), z.boolean()).optional(),
  clip: z.object({ name: z.string(), size: z.number(), driveFileId: z.string().optional(), driveName: z.string().optional(), savedAt: z.string().optional() }).optional(),
  revisions: z.array(revisionSchema).optional(),
});

const visionSchema = z.object({
  narrativeArc: z.string().default(''),
  visualTone: z.string().default(''),
  mood: z.string().default(''),
  palette: z.string().default(''),
  aesthetic: z.string().default(''),
});

const projectSchema = z.object({
  name: z.string().min(1).max(200),
  runtimeSec: z.number().nullable(),
  /** The parsed lines are rebuilt from this on import rather than trusted. */
  lrcRaw: z.string(),
  audioFileName: z.string().optional(),
  vision: visionSchema,
  audioBrief: z.string(),
  treatment: treatmentSchema.nullable(),
  stopTagsChecked: z.string().optional(),
  manualTags: z.array(z.object({ t: z.number(), tag: z.string(), endT: z.number().optional() })).optional(),
  backingMode: z.enum(['tag', 'omit', 'include']).optional(),
  tagSpelling: z.enum(['instrumental', 'labeled', 'own']).optional(),
});

const runSchema = z.object({
  id: z.string(),
  kind: z.enum(['blueprint', 'revision']),
  createdAt: z.number(),
  payload: z.unknown(),
  usage: z.unknown().optional(),
});

export const archiveSchema = z.object({
  format: z.literal(ARCHIVE_FORMAT),
  version: z.literal(ARCHIVE_VERSION),
  exportedAt: z.number(),
  project: projectSchema,
  anchors: z.array(anchorSchema.extend({ order: z.number().int().optional(), useSheet: z.boolean().optional() })),
  scenes: z.array(storedSceneSchema),
  images: z.array(imageMetaSchema),
  runs: z.array(runSchema).default([]),
});
export type Archive = z.infer<typeof archiveSchema>;
