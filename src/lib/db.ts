import { openDB, type IDBPDatabase, type IDBPTransaction } from 'idb';
import type { BlueprintAnchor, Scene } from '../types/blueprint';
import { newProject, type Project, type RunRecord, type StoredAnchor, type StoredScene } from '../types/project';

// Namespaced so it can't collide with other apps on the same github.io origin.
const DB_NAME = 'gp-producer';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  dbPromise ??= openDB(DB_NAME, DB_VERSION, {
    upgrade(d) {
      const projects = d.createObjectStore('projects', { keyPath: 'id' });
      projects.createIndex('updatedAt', 'updatedAt');
      d.createObjectStore('anchors', { keyPath: ['projectId', 'id'] }).createIndex('projectId', 'projectId');
      d.createObjectStore('scenes', { keyPath: ['projectId', 'scene'] }).createIndex('projectId', 'projectId');
      const images = d.createObjectStore('images', { keyPath: 'id' });
      images.createIndex('projectId', 'projectId');
      images.createIndex('ownerKey', 'ownerKey');
      d.createObjectStore('runs', { keyPath: 'id' }).createIndex('projectId', 'projectId');
      d.createObjectStore('meta', { keyPath: 'key' });
    },
  });
  return dbPromise;
}

/** Test hook: drops the cached connection so a fresh IndexedDB factory is used. */
export async function _resetDbForTests(): Promise<void> {
  if (dbPromise) (await dbPromise).close();
  dbPromise = null;
}

const PER_PROJECT_STORES = ['anchors', 'scenes', 'images', 'runs'] as const;

export async function listProjects(): Promise<Project[]> {
  const all = (await (await db()).getAll('projects')) as Project[];
  return all.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function getProject(id: string): Promise<Project | undefined> {
  return (await db()).get('projects', id);
}

export async function putProject(p: Project): Promise<void> {
  await (await db()).put('projects', p);
}

export async function createProject(name?: string): Promise<Project> {
  const p = newProject(name);
  await putProject(p);
  return p;
}

export async function deleteProject(id: string): Promise<void> {
  const d = await db();
  const tx = d.transaction(['projects', ...PER_PROJECT_STORES], 'readwrite');
  tx.objectStore('projects').delete(id);
  for (const name of PER_PROJECT_STORES) {
    const store = tx.objectStore(name);
    for (const key of await store.index('projectId').getAllKeys(id)) store.delete(key);
  }
  await tx.done;
}

/**
 * Copies the project, its anchors and its scenes under a new id.
 * Images are not copied yet: nothing references them until M2, which must copy them and remap their ids here.
 */
export async function duplicateProject(id: string): Promise<Project | undefined> {
  const src = await getProject(id);
  if (!src) return undefined;
  const now = Date.now();
  const copy: Project = { ...structuredClone(src), id: crypto.randomUUID(), name: `${src.name} (copy)`, createdAt: now, updatedAt: now };
  const d = await db();
  const [anchors, scenes] = await Promise.all([getAnchors(id), getScenes(id)]);
  const tx = d.transaction(['projects', 'anchors', 'scenes'], 'readwrite');
  tx.objectStore('projects').put(copy);
  for (const a of anchors) tx.objectStore('anchors').put({ ...a, projectId: copy.id });
  for (const s of scenes) tx.objectStore('scenes').put({ ...s, projectId: copy.id });
  await tx.done;
  return copy;
}

export async function getAnchors(projectId: string): Promise<StoredAnchor[]> {
  const rows = (await (await db()).getAllFromIndex('anchors', 'projectId', projectId)) as StoredAnchor[];
  return rows.sort((a, b) => a.order - b.order);
}

export async function getScenes(projectId: string): Promise<StoredScene[]> {
  const rows = (await (await db()).getAllFromIndex('scenes', 'projectId', projectId)) as StoredScene[];
  return rows.sort((a, b) => a.scene - b.scene);
}

async function clearByProject(
  tx: IDBPTransaction<unknown, string[], 'readwrite'>,
  store: 'anchors' | 'scenes',
  projectId: string,
) {
  const s = tx.objectStore(store);
  for (const key of await s.index('projectId').getAllKeys(projectId)) s.delete(key);
}

/** Replaces all scenes for a project atomically (used by snap/repair and scene edits). */
export async function replaceScenes(projectId: string, scenes: Scene[]): Promise<void> {
  const d = await db();
  const tx = d.transaction(['scenes'], 'readwrite');
  await clearByProject(tx, 'scenes', projectId);
  for (const s of scenes) tx.objectStore('scenes').put({ ...s, projectId });
  await tx.done;
}

/** Replaces anchors and scenes for a project atomically (a new blueprint). */
export async function replaceBlueprint(
  projectId: string,
  anchors: BlueprintAnchor[],
  scenes: Scene[],
): Promise<void> {
  const d = await db();
  const tx = d.transaction(['anchors', 'scenes'], 'readwrite');
  await clearByProject(tx, 'anchors', projectId);
  await clearByProject(tx, 'scenes', projectId);
  anchors.forEach((a, order) => tx.objectStore('anchors').put({ ...a, projectId, order }));
  for (const s of scenes) tx.objectStore('scenes').put({ ...s, projectId });
  await tx.done;
}

export async function addRun(run: RunRecord): Promise<void> {
  await (await db()).put('runs', run);
}

export async function listRuns(projectId: string): Promise<RunRecord[]> {
  const rows = (await (await db()).getAllFromIndex('runs', 'projectId', projectId)) as RunRecord[];
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}
