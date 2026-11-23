import * as db from './db';
import { buildProjectArchive, type ProjectArchive } from './export/archive';

/** Reads a whole project straight from storage and packs it. Used by the project list and the Post tab. */
export async function exportProjectArchive(projectId: string): Promise<ProjectArchive> {
  const project = await db.getProject(projectId);
  if (!project) throw new Error('That project no longer exists.');
  const [anchors, scenes, images, runs] = await Promise.all([db.getAnchors(projectId), db.getScenes(projectId), db.listProjectImages(projectId), db.listRuns(projectId)]);
  return buildProjectArchive({ project, anchors, scenes, images, runs });
}
