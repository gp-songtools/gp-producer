import { create } from 'zustand';
import * as db from '../lib/db';
import { parseLrc } from '../lib/lrc';
import type { BlueprintAnchor, Scene, Treatment } from '../types/blueprint';
import type { Project, RunRecord, StoredAnchor, StoredScene } from '../types/project';

const SAVE_DELAY_MS = 400;

interface ProjectState {
  project: Project | null;
  anchors: StoredAnchor[];
  scenes: StoredScene[];
  loading: boolean;
  notFound: boolean;
  load: (id: string) => Promise<void>;
  /** Merges fields into the project and saves it (debounced). */
  patch: (partial: Partial<Omit<Project, 'id' | 'createdAt'>>) => void;
  /** Sets the raw .lrc text and re-derives the parsed lines. */
  setLrc: (raw: string) => void;
  /** Stores a new blueprint (treatment, anchors, scenes) and an optional run record. Saves immediately. */
  setBlueprint: (bp: { treatment: Treatment; anchors: BlueprintAnchor[]; scenes: Scene[] }, run?: RunRecord) => Promise<void>;
  /** Replaces the scenes (snap/repair, edits). Saves immediately. */
  setScenes: (scenes: Scene[]) => Promise<void>;
  /** Writes any pending project changes now. */
  flush: () => Promise<void>;
  unload: () => Promise<void>;
}

let timer: ReturnType<typeof setTimeout> | undefined;
let dirty = false;
let loadToken = 0;

const empty = { project: null, anchors: [], scenes: [], loading: false, notFound: false };

export const useProjectStore = create<ProjectState>((set, get) => {
  const schedule = () => {
    dirty = true;
    clearTimeout(timer);
    timer = setTimeout(() => void get().flush(), SAVE_DELAY_MS);
  };

  return {
    ...empty,

    load: async (id) => {
      if (get().project?.id === id) return;
      const token = ++loadToken;
      await get().flush();
      set({ ...empty, loading: true });
      const p = await db.getProject(id);
      if (token !== loadToken) return; // a newer load started while awaiting
      if (!p) return set({ ...empty, notFound: true });
      const [anchors, scenes] = await Promise.all([db.getAnchors(id), db.getScenes(id)]);
      if (token !== loadToken) return;
      set({ project: p, anchors, scenes, loading: false, notFound: false });
    },

    patch: (partial) => {
      const p = get().project;
      if (!p) return;
      set({ project: { ...p, ...partial, updatedAt: Date.now() } });
      schedule();
    },

    setLrc: (raw) => get().patch({ lrcRaw: raw, lrcLines: parseLrc(raw).lines }),

    setBlueprint: async ({ treatment, anchors, scenes }, run) => {
      const p = get().project;
      if (!p) return;
      const next = { ...p, treatment, updatedAt: Date.now() };
      await db.replaceBlueprint(p.id, anchors, scenes);
      await db.putProject(next);
      if (run) await db.addRun(run);
      dirty = false;
      clearTimeout(timer);
      set({
        project: next,
        anchors: anchors.map((a, order) => ({ ...a, projectId: p.id, order })),
        scenes: scenes.map((s) => ({ ...s, projectId: p.id })),
      });
    },

    setScenes: async (scenes) => {
      const p = get().project;
      if (!p) return;
      await db.replaceScenes(p.id, scenes);
      set({ scenes: scenes.map((s) => ({ ...s, projectId: p.id })) });
    },

    flush: async () => {
      clearTimeout(timer);
      const p = get().project;
      if (p && dirty) {
        dirty = false;
        await db.putProject(p);
      }
    },

    unload: async () => {
      await get().flush();
      set({ ...empty });
    },
  };
});
