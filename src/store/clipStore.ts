import { create } from 'zustand';

/**
 * Clip files chosen in this session, by project and scene. Never persisted: videos can be hundreds of MB, so they
 * are not written to IndexedDB. Only their name and size (and Drive id) are kept, on the scene.
 */
interface ClipState {
  files: Map<string, File>;
  set: (projectId: string, scene: number, file: File) => void;
  get: (projectId: string, scene: number) => File | undefined;
  /** This project's files by scene number. */
  forProject: (projectId: string) => Map<number, File>;
}

const key = (projectId: string, scene: number) => `${projectId}:${scene}`;

export const useClipStore = create<ClipState>((set, get) => ({
  files: new Map(),
  set: (projectId, scene, file) => set((s) => ({ files: new Map(s.files).set(key(projectId, scene), file) })),
  get: (projectId, scene) => get().files.get(key(projectId, scene)),
  forProject: (projectId) => {
    const out = new Map<number, File>();
    const prefix = `${projectId}:`;
    for (const [k, f] of get().files) if (k.startsWith(prefix)) out.set(Number(k.slice(prefix.length)), f);
    return out;
  },
}));
