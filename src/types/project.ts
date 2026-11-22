import type { BlueprintAnchor, LrcLine, Scene, Treatment } from './blueprint';

export interface Vision {
  narrativeArc: string;
  visualTone: string;
  mood: string;
  palette: string;
  aesthetic: string;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  /** Total song runtime in whole seconds; null until entered (an .lrc doesn't contain it). */
  runtimeSec: number | null;
  lrcRaw: string;
  lrcLines: LrcLine[];
  /** Name only. The audio itself is never persisted or uploaded. */
  audioFileName?: string;
  vision: Vision;
  /** Pasted Gemini audio brief. */
  audioBrief: string;
  /** Signature of the singing stop tags the user has checked by ear (see `stopTagSignature`). Stale once the tags change. */
  stopTagsChecked?: string;
  treatment: Treatment | null;
}

export type StoredAnchor = BlueprintAnchor & { projectId: string; order: number };
export type StoredScene = Scene & { projectId: string };

/** What an image belongs to: an anchor (by its id, so it survives a re-blueprint) or a scene (by number). */
export type ImageOwner = `anchor:${string}` | `scene:${number}`;
export const anchorOwner = (id: string): ImageOwner => `anchor:${id}`;
export const sceneOwner = (n: number): ImageOwner => `scene:${n}`;

export interface ImageRecord {
  id: string;
  projectId: string;
  ownerKey: ImageOwner;
  kind: 'anchor' | 'keyframe';
  blob: Blob;
  mime: string;
  width: number;
  height: number;
  /** Model ID that produced it, or null for an upload. */
  model: string | null;
  /** The prompt used, or null for an upload. */
  prompt: string | null;
  source: 'generated' | 'uploaded';
  /** For scene frames: the anchor image ids sent as references, so a later anchor change can be detected. */
  refImageIds?: string[];
  createdAt: number;
}

export interface RunRecord {
  id: string;
  projectId: string;
  kind: 'blueprint' | 'revision';
  createdAt: number;
  payload: unknown;
  usage?: unknown;
}

export const emptyVision = (): Vision => ({ narrativeArc: '', visualTone: '', mood: '', palette: '', aesthetic: '' });

export const newProject = (name = 'Untitled project'): Project => {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name,
    createdAt: now,
    updatedAt: now,
    runtimeSec: null,
    lrcRaw: '',
    lrcLines: [],
    vision: emptyVision(),
    audioBrief: '',
    treatment: null,
  };
};
