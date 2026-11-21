import { create } from 'zustand';
import { ApiError, ImageBlockedError } from '../lib/api/errors';
import { generateAnchorImage, saveUploadedImage, UploadError, imagesForOwner } from '../lib/anchorImages';
import * as db from '../lib/db';
import { runPool } from '../lib/pool';
import type { ModelRoles } from '../lib/settings';
import { anchorOwner, type ImageOwner, type ImageRecord } from '../types/project';
import { useSettingsStore } from './settingsStore';

export type Job = { status: 'running' } | { status: 'error'; message: string };

export interface BatchState {
  total: number;
  done: number;
  failed: number;
  running: boolean;
  cancelled: boolean;
}

interface AnchorRef {
  id: string;
  prompt: string;
}

interface ImageState {
  projectId: string | null;
  images: ImageRecord[];
  /** By owner key. A card shows its job's spinner or error. */
  jobs: Record<string, Job>;
  batch: BatchState | null;
  load: (projectId: string) => Promise<void>;
  generateAnchor: (projectId: string, anchor: AnchorRef, role: keyof ModelRoles) => Promise<void>;
  generateMissing: (projectId: string, anchors: AnchorRef[]) => Promise<void>;
  uploadAnchor: (projectId: string, anchorId: string, file: File) => Promise<void>;
  promote: (projectId: string, id: string) => Promise<void>;
  /** Deletes the newest image for an owner, so the previous version (if any) becomes current. */
  removeCurrent: (projectId: string, owner: ImageOwner) => Promise<void>;
  cancelBatch: () => void;
  cancelJob: (owner: ImageOwner) => void;
  clearJob: (owner: ImageOwner) => void;
}

const errorMessage = (e: unknown): string =>
  e instanceof ApiError || e instanceof ImageBlockedError || e instanceof UploadError
    ? e.message
    : `Something went wrong: ${e instanceof Error ? e.message : String(e)}`;

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

let batchAbort: AbortController | null = null;
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

  /** Returns true if an image was saved, false if the job was cancelled. Throws on failure (after recording it on the card). */
  const generateOne = async (projectId: string, anchor: AnchorRef, role: keyof ModelRoles, signal?: AbortSignal): Promise<boolean> => {
    const owner = anchorOwner(anchor.id);
    const { geminiKey, settings } = useSettingsStore.getState();
    const own = new AbortController();
    singleAborts.set(owner, own);
    const onAbort = () => own.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    setJob(owner, { status: 'running' });
    try {
      await generateAnchorImage({ projectId, anchor, model: settings.models[role], apiKey: geminiKey, signal: own.signal });
      await refreshOwner(projectId, owner);
      setJob(owner, null);
      return true;
    } catch (e) {
      if (isAbort(e)) {
        setJob(owner, null);
        return false;
      } else {
        setJob(owner, { status: 'error', message: errorMessage(e) });
        throw e;
      }
    } finally {
      signal?.removeEventListener('abort', onAbort);
      singleAborts.delete(owner);
    }
  };

  return {
    projectId: null,
    images: [],
    jobs: {},
    batch: null,

    load: async (projectId) => {
      if (get().projectId !== projectId) set({ projectId, images: [], jobs: {}, batch: null });
      const images = await db.listProjectImages(projectId);
      if (get().projectId === projectId) set({ images });
    },

    generateAnchor: async (projectId, anchor, role) => {
      try {
        await generateOne(projectId, anchor, role);
      } catch {
        /* the card shows the error */
      }
    },

    generateMissing: async (projectId, anchors) => {
      const todo = anchors.filter((a) => imagesForOwner(get().images, anchorOwner(a.id)).length === 0 && get().jobs[anchorOwner(a.id)]?.status !== 'running');
      if (todo.length === 0) return;
      batchAbort = new AbortController();
      const ctrl = batchAbort;
      set({ batch: { total: todo.length, done: 0, failed: 0, running: true, cancelled: false } });
      const bump = (k: 'done' | 'failed') => set((s) => (s.batch ? { batch: { ...s.batch, [k]: s.batch[k] + 1 } } : {}));
      const res = await runPool(
        todo,
        2,
        async (a) => {
          try {
            if (await generateOne(projectId, a, 'workhorse', ctrl.signal)) bump('done');
          } catch (e) {
            bump('failed');
            throw e;
          }
        },
        ctrl.signal,
      );
      set((s) => (s.batch ? { batch: { ...s.batch, running: false, cancelled: ctrl.signal.aborted || res.skipped > 0 } } : {}));
      batchAbort = null;
    },

    uploadAnchor: async (projectId, anchorId, file) => {
      const owner = anchorOwner(anchorId);
      setJob(owner, { status: 'running' });
      try {
        await saveUploadedImage({ projectId, owner, kind: 'anchor', file });
        await refreshOwner(projectId, owner);
        setJob(owner, null);
      } catch (e) {
        setJob(owner, { status: 'error', message: errorMessage(e) });
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

    cancelBatch: () => {
      batchAbort?.abort();
      for (const c of singleAborts.values()) c.abort();
    },

    cancelJob: (owner) => singleAborts.get(owner)?.abort(),

    clearJob: (owner) => setJob(owner, null),
  };
});
