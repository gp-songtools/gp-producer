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
  treatment: Treatment | null;
}

export type StoredAnchor = BlueprintAnchor & { projectId: string; order: number };
export type StoredScene = Scene & { projectId: string };

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
