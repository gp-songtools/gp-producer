import { create } from 'zustand';
import * as db from '../lib/db';
import { parseLrc } from '../lib/lrc';
import { applyRevision, undoLatestRevision } from '../lib/revision';
import { useStorageStore } from './storageStore';
import type { RevisionProposal } from '../schemas/revision';
import type { BlueprintAnchor, ChecklistKey, Scene, Treatment } from '../types/blueprint';
import type { Project, RunRecord, StoredAnchor, StoredScene } from '../types/project';

const SAVE_DELAY_MS = 400;

interface ProjectState {
  project: Project | null;
  anchors: StoredAnchor[];
  scenes: StoredScene[];
  loading: boolean;
  notFound: boolean;
  /** Why the project couldn't be read from storage (not the same as it not existing). */
  loadError: string | null;
  load: (id: string) => Promise<void>;
  /** Merges fields into the project and saves it (debounced). */
  patch: (partial: Partial<Omit<Project, 'id' | 'createdAt'>>) => void;
  /** Sets the raw .lrc text and re-derives the parsed lines. */
  setLrc: (raw: string) => void;
  /** Stores a new blueprint (treatment, anchors, scenes) and an optional run record. Saves immediately. */
  setBlueprint: (bp: { treatment: Treatment; anchors: BlueprintAnchor[]; scenes: Scene[] }, run?: RunRecord) => Promise<void>;
  /** Replaces the scenes (snap/repair, edits). Saves immediately. */
  setScenes: (scenes: Scene[]) => Promise<void>;
  /** Character anchors: use (or stop using) the character sheet as the reference in storyboard frames. */
  setAnchorUseSheet: (anchorId: string, value: boolean) => Promise<void>;
  /** Ticks or clears one checklist item on a scene and saves just that scene. */
  setChecklist: (sceneNo: number, key: ChecklistKey, value: boolean) => Promise<void>;
  /** Clears every checklist item on a scene. */
  resetChecklist: (sceneNo: number) => Promise<void>;
  /** Applies an accepted revision (prompt fields only) and keeps the replaced prompts in `revisions[]`. Returns the updated scene. */
  acceptRevision: (sceneNo: number, proposal: RevisionProposal, request: string) => Promise<Scene | null>;
  /** Reverts the scene's latest revision. */
  undoRevision: (sceneNo: number) => Promise<Scene | null>;
  /** Writes everything held in memory again: the "try saving again" after a failed save. */
  retrySave: () => Promise<void>;
  /** Writes any pending project changes now. */
  flush: () => Promise<void>;
  unload: () => Promise<void>;
}

let timer: ReturnType<typeof setTimeout> | undefined;
let dirty = false;
let loadToken = 0;

const empty = { project: null, anchors: [], scenes: [], loading: false, notFound: false, loadError: null };

/** Runs a save. A failure is reported (banner) and never thrown: the change stays on screen and can be re-saved. */
async function save(write: () => Promise<unknown>): Promise<boolean> {
  try {
    await write();
    useStorageStore.getState().saved();
    return true;
  } catch (e) {
    useStorageStore.getState().report(e);
    return false;
  }
}

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
      try {
        const p = await db.getProject(id);
        if (token !== loadToken) return; // a newer load started while awaiting
        if (!p) return set({ ...empty, notFound: true });
        const [anchors, scenes] = await Promise.all([db.getAnchors(id), db.getScenes(id)]);
        if (token !== loadToken) return;
        set({ project: p, anchors, scenes, loading: false, notFound: false });
      } catch (e) {
        if (token !== loadToken) return;
        set({ ...empty, loadError: e instanceof Error && e.message ? e.message : 'The browser would not let the app read its saved projects.' });
      }
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
      // The "use the character sheet" choice belongs to the anchor id, and sheet images are kept like anchor images.
      const useSheet = new Set(get().anchors.filter((a) => a.useSheet).map((a) => a.id));
      const withChoice = anchors.map((a) => (useSheet.has(a.id) ? { ...a, useSheet: true } : a));
      // Claude's blueprint costs real money, so it is kept on screen even if saving fails (banner; "try saving again").
      const ok = await save(async () => {
        await db.replaceBlueprint(p.id, withChoice, scenes);
        // Frames for scenes that no longer exist would be orphaned (and invisible); drop them.
        await db.deleteSceneImagesAbove(p.id, scenes.length);
        await db.putProject(next);
        if (run) await db.addRun(run);
      });
      dirty = !ok;
      clearTimeout(timer);
      set({
        project: next,
        anchors: withChoice.map((a, order) => ({ ...a, projectId: p.id, order })),
        scenes: scenes.map((s) => ({ ...s, projectId: p.id })),
      });
    },

    setScenes: async (scenes) => {
      const p = get().project;
      if (!p) return;
      set({ scenes: scenes.map((s) => ({ ...s, projectId: p.id })) });
      await save(() => db.replaceScenes(p.id, scenes));
    },

    setAnchorUseSheet: async (anchorId, value) => {
      const p = get().project;
      const cur = get().anchors.find((a) => a.id === anchorId);
      if (!p || !cur) return;
      const { useSheet: _drop, ...rest } = cur;
      void _drop;
      const next: typeof cur = value ? { ...rest, useSheet: true } : rest;
      set({ anchors: get().anchors.map((a) => (a.id === anchorId ? next : a)) });
      await save(() => db.putAnchor(p.id, next));
    },

    setChecklist: async (sceneNo, key, value) => {
      const p = get().project;
      const cur = get().scenes.find((s) => s.scene === sceneNo);
      if (!p || !cur) return;
      const next = { ...cur, checklist: { ...cur.checklist, [key]: value } };
      set({ scenes: get().scenes.map((s) => (s.scene === sceneNo ? next : s)) });
      await save(() => db.putScene(p.id, next));
    },

    resetChecklist: async (sceneNo) => {
      const p = get().project;
      const cur = get().scenes.find((s) => s.scene === sceneNo);
      if (!p || !cur) return;
      const { checklist: _drop, ...next } = cur;
      void _drop;
      set({ scenes: get().scenes.map((s) => (s.scene === sceneNo ? next : s)) });
      await save(() => db.putScene(p.id, next));
    },

    acceptRevision: async (sceneNo, proposal, request) => {
      const p = get().project;
      const cur = get().scenes.find((s) => s.scene === sceneNo);
      if (!p || !cur) return null;
      const next = { ...applyRevision(cur, proposal, request), projectId: p.id };
      set({ scenes: get().scenes.map((s) => (s.scene === sceneNo ? next : s)) });
      await save(() => db.putScene(p.id, next));
      return next;
    },

    undoRevision: async (sceneNo) => {
      const p = get().project;
      const cur = get().scenes.find((s) => s.scene === sceneNo);
      if (!p || !cur?.revisions?.length) return null;
      const next = { ...undoLatestRevision(cur), projectId: p.id };
      set({ scenes: get().scenes.map((s) => (s.scene === sceneNo ? next : s)) });
      await save(() => db.putScene(p.id, next));
      return next;
    },

    flush: async () => {
      clearTimeout(timer);
      const p = get().project;
      if (p && dirty) {
        dirty = false;
        // On failure the edit is still in memory: keep it marked unsaved so a retry writes it.
        if (!(await save(() => db.putProject(p)))) dirty = true;
      }
    },

    retrySave: async () => {
      clearTimeout(timer);
      const { project: p, anchors, scenes } = get();
      if (!p) return;
      const ok = await save(async () => {
        await db.putProject(p);
        await db.replaceBlueprint(p.id, anchors, scenes);
      });
      if (ok) dirty = false;
    },

    unload: async () => {
      await get().flush();
      set({ ...empty });
    },
  };
});
