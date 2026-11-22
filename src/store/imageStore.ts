import { create } from 'zustand';
import { ApiError, ImageBlockedError } from '../lib/api/errors';
import { generateAnchorImage, imagesForOwner, saveUploadedImage, UploadError } from '../lib/anchorImages';
import * as db from '../lib/db';
import { runPool } from '../lib/pool';
import { generateSceneFrame, pickReferences, type AnchorLite, type SceneRef } from '../lib/sceneImages';
import { resolveRole, type ModelRoles } from '../lib/settings';
import { anchorOwner, sceneOwner, type ImageOwner, type ImageRecord } from '../types/project';
import { useSettingsStore } from './settingsStore';

/** `blocked`: Gemini declined or answered in text (retrying can differ). `upload`: your file was rejected. `error`: anything else. */
export type JobErrorKind = 'blocked' | 'upload' | 'error';
export type Job = { status: 'running' } | { status: 'error'; message: string; kind: JobErrorKind };

export interface BatchState {
  total: number;
  done: number;
  failed: number;
  running: boolean;
  cancelled: boolean;
}

export type BatchKey = 'batch' | 'frameBatch';

export interface AnchorRef {
  id: string;
  prompt: string;
}

interface ImageState {
  projectId: string | null;
  images: ImageRecord[];
  /** By owner key. A card shows its job's spinner or error. */
  jobs: Record<string, Job>;
  /** Images generated this session, by model id. Not saved; Google bills per image, so this is the number to watch. */
  usage: Record<string, number>;
  /** Anchor batch and scene-frame batch are tracked separately. */
  batch: BatchState | null;
  frameBatch: BatchState | null;
  load: (projectId: string) => Promise<void>;
  generateAnchor: (projectId: string, anchor: AnchorRef, role: keyof ModelRoles) => Promise<void>;
  generateMissing: (projectId: string, anchors: AnchorRef[]) => Promise<void>;
  /** Renders exactly these anchors (skipping any already generating), two at a time. Used to retry failures. */
  generateAnchors: (projectId: string, anchors: AnchorRef[]) => Promise<void>;
  generateFrame: (projectId: string, scene: SceneRef, anchors: AnchorLite[], role: keyof ModelRoles) => Promise<void>;
  /** Renders frames for the given scenes (the caller picks which), two at a time, with the Workhorse model. */
  generateFrames: (projectId: string, scenes: SceneRef[], anchors: AnchorLite[]) => Promise<void>;
  uploadAnchor: (projectId: string, anchorId: string, file: File) => Promise<void>;
  promote: (projectId: string, id: string) => Promise<void>;
  /** Deletes the newest image for an owner, so the previous version (if any) becomes current. */
  removeCurrent: (projectId: string, owner: ImageOwner) => Promise<void>;
  cancelBatch: (key: BatchKey) => void;
  cancelJob: (owner: ImageOwner) => void;
  clearJob: (owner: ImageOwner) => void;
}

const errorMessage = (e: unknown): string =>
  e instanceof ApiError || e instanceof ImageBlockedError || e instanceof UploadError
    ? e.message
    : `Something went wrong: ${e instanceof Error ? e.message : String(e)}`;

const errorKind = (e: unknown): JobErrorKind => (e instanceof ImageBlockedError ? 'blocked' : e instanceof UploadError ? 'upload' : 'error');

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

const batchAborts = new Map<BatchKey, AbortController>();
const singleAborts = new Map<string, AbortController>();

export const useImageStore = create<ImageState>((set, get) => {
  /** Re-reads one owner's images from storage, but only if that project is still the one on screen. */
  const refreshOwner = async (projectId: string, owner: ImageOwner) => {
    if (get().projectId !== projectId) return;
    const fresh = await db.listImages(projectId, owner);
    set((s) => ({ images: [...s.images.filter((r) => r.ownerKey !== owner), ...fresh] }));
  };
  const setJob = (owner: string, job: Job | null) =>
    set((s) => {
      const jobs = { ...s.jobs };
      if (job) jobs[owner] = job;
      else delete jobs[owner];
      return { jobs };
    });

  /**
   * Runs one image job with a spinner/error on its card. Returns true if an image was saved, false if cancelled.
   * Throws on failure, after recording the message on the card.
   */
  const runJob = async (projectId: string, owner: ImageOwner, produce: (signal: AbortSignal) => Promise<unknown>, outer?: AbortSignal): Promise<boolean> => {
    const own = new AbortController();
    singleAborts.set(owner, own);
    const onAbort = () => own.abort();
    outer?.addEventListener('abort', onAbort, { once: true });
    setJob(owner, { status: 'running' });
    try {
      await produce(own.signal);
      await refreshOwner(projectId, owner);
      setJob(owner, null);
      return true;
    } catch (e) {
      if (isAbort(e)) {
        setJob(owner, null);
        return false;
      }
      setJob(owner, { status: 'error', message: errorMessage(e), kind: errorKind(e) });
      throw e;
    } finally {
      outer?.removeEventListener('abort', onAbort);
      singleAborts.delete(owner);
    }
  };

  const bumpUsage = (model: string) => set((s) => ({ usage: { ...s.usage, [model]: (s.usage[model] ?? 0) + 1 } }));

  const anchorJob = (projectId: string, anchor: AnchorRef, role: keyof ModelRoles, outer?: AbortSignal) => {
    const { geminiKey, settings } = useSettingsStore.getState();
    const model = settings.models[resolveRole(role, settings.draftMode)];
    return runJob(
      projectId,
      anchorOwner(anchor.id),
      async (signal) => {
        await generateAnchorImage({ projectId, anchor, model, apiKey: geminiKey, signal });
        bumpUsage(model);
      },
      outer,
    );
  };

  const frameJob = (projectId: string, scene: SceneRef, anchors: AnchorLite[], role: keyof ModelRoles, outer?: AbortSignal) => {
    const { geminiKey, settings } = useSettingsStore.getState();
    const model = settings.models[resolveRole(role, settings.draftMode)];
    return runJob(
      projectId,
      sceneOwner(scene.scene),
      async (signal) => {
        // Chosen when the job starts, so a batch picks up anchor images made earlier in the same session.
        const { used } = pickReferences(scene, anchors, get().images, settings.maxAnchorsPerScene);
        await generateSceneFrame({ projectId, scene, refs: used, model, apiKey: geminiKey, signal });
        bumpUsage(model);
      },
      outer,
    );
  };

  /** Runs `items` two at a time, tracking progress under `key`. */
  const runBatch = async <T>(key: BatchKey, items: T[], worker: (item: T, signal: AbortSignal) => Promise<boolean>) => {
    if (items.length === 0) return;
    const ctrl = new AbortController();
    batchAborts.set(key, ctrl);
    set({ [key]: { total: items.length, done: 0, failed: 0, running: true, cancelled: false } } as Pick<ImageState, BatchKey>);
    const bump = (k: 'done' | 'failed') => set((s) => (s[key] ? ({ [key]: { ...s[key]!, [k]: s[key]![k] + 1 } } as Pick<ImageState, BatchKey>) : {}));
    const res = await runPool(
      items,
      2,
      async (item) => {
        try {
          if (await worker(item, ctrl.signal)) bump('done');
        } catch (e) {
          bump('failed');
          throw e;
        }
      },
      ctrl.signal,
    );
    set((s) => (s[key] ? ({ [key]: { ...s[key]!, running: false, cancelled: ctrl.signal.aborted || res.skipped > 0 } } as Pick<ImageState, BatchKey>) : {}));
    batchAborts.delete(key);
  };

  return {
    projectId: null,
    images: [],
    jobs: {},
    batch: null,
    frameBatch: null,
    usage: {},

    load: async (projectId) => {
      if (get().projectId !== projectId) set({ projectId, images: [], jobs: {}, batch: null, frameBatch: null });
      const images = await db.listProjectImages(projectId);
      if (get().projectId === projectId) set({ images });
    },

    generateAnchor: async (projectId, anchor, role) => {
      try {
        await anchorJob(projectId, anchor, role);
      } catch {
        /* the card shows the error */
      }
    },

    generateAnchors: async (projectId, anchors) => {
      const todo = anchors.filter((a) => get().jobs[anchorOwner(a.id)]?.status !== 'running');
      await runBatch('batch', todo, (a, signal) => anchorJob(projectId, a, 'workhorse', signal));
    },

    generateMissing: async (projectId, anchors) => {
      const missing = anchors.filter((a) => imagesForOwner(get().images, anchorOwner(a.id)).length === 0);
      await get().generateAnchors(projectId, missing);
    },

    generateFrame: async (projectId, scene, anchors, role) => {
      try {
        await frameJob(projectId, scene, anchors, role);
      } catch {
        /* the card shows the error */
      }
    },

    generateFrames: async (projectId, scenes, anchors) => {
      const todo = scenes.filter((s) => get().jobs[sceneOwner(s.scene)]?.status !== 'running');
      await runBatch('frameBatch', todo, (s, signal) => frameJob(projectId, s, anchors, 'workhorse', signal));
    },

    uploadAnchor: async (projectId, anchorId, file) => {
      const owner = anchorOwner(anchorId);
      setJob(owner, { status: 'running' });
      try {
        await saveUploadedImage({ projectId, owner, kind: 'anchor', file });
        await refreshOwner(projectId, owner);
        setJob(owner, null);
      } catch (e) {
        setJob(owner, { status: 'error', message: errorMessage(e), kind: errorKind(e) });
      }
    },

    promote: async (projectId, id) => {
      const rec = get().images.find((r) => r.id === id);
      await db.promoteImage(id);
      if (rec) await refreshOwner(projectId, rec.ownerKey);
    },

    removeCurrent: async (projectId, owner) => {
      const [current] = imagesForOwner(get().images, owner);
      if (!current) return;
      await db.deleteImage(current.id);
      await refreshOwner(projectId, owner);
    },

    cancelBatch: (key) => {
      batchAborts.get(key)?.abort();
    },

    cancelJob: (owner) => singleAborts.get(owner)?.abort(),

    clearJob: (owner) => setJob(owner, null),
  };
});
