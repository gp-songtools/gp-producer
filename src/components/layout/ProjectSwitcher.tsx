import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import * as db from '../../lib/db';
import { useProjectStore } from '../../store/projectStore';
import { useStorageStore } from '../../store/storageStore';
import type { Project } from '../../types/project';

/** Project dropdown, rename field and "new" button. Keeps the current tab when switching. */
export default function ProjectSwitcher({ projectId }: { projectId: string }) {
  const project = useProjectStore((s) => s.project);
  const patch = useProjectStore((s) => s.patch);
  const flush = useProjectStore((s) => s.flush);
  const [all, setAll] = useState<Project[]>([]);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const tab = pathname.split('/')[3] ?? 'setup';

  // The current project's name is rendered from the store, so the list only needs refreshing when switching.
  useEffect(() => {
    void db.listProjects().then(setAll).catch(() => undefined);
  }, [projectId]);

  const create = async () => {
    await flush();
    try {
      const p = await db.createProject();
      navigate(`/p/${p.id}/setup`);
    } catch (e) {
      useStorageStore.getState().report(e);
    }
  };

  return (
    <div className="no-print flex flex-wrap items-center gap-2 px-4 pt-3">
      <select
        aria-label="Switch project"
        value={projectId}
        onChange={(e) => navigate(`/p/${e.target.value}/${tab}`)}
        className="max-w-48 rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm"
      >
        {!all.some((p) => p.id === projectId) && <option value={projectId}>{project?.name ?? 'Project'}</option>}
        {all.map((p) => (
          <option key={p.id} value={p.id}>{p.id === projectId && project ? project.name : p.name}</option>
        ))}
      </select>
      <input
        aria-label="Project name"
        value={project?.name ?? ''}
        onChange={(e) => patch({ name: e.target.value })}
        onBlur={(e) => !e.target.value.trim() && patch({ name: 'Untitled project' })}
        className="min-w-[10rem] flex-1 rounded border border-transparent bg-transparent px-2 py-1 text-sm font-medium hover:border-neutral-700 focus:border-amber-400 focus:outline-none"
      />
      <button onClick={create} className="rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800">New project</button>
    </div>
  );
}
