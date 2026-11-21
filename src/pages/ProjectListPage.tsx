import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as db from '../lib/db';
import type { Project } from '../types/project';

const btn = 'rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800';

export default function ProjectListPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const refresh = useCallback(async () => {
    try {
      setProjects(await db.listProjects());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read saved projects.');
    }
  }, []);
  useEffect(() => void refresh(), [refresh]);

  const create = async () => {
    const p = await db.createProject();
    navigate(`/p/${p.id}/setup`);
  };
  const rename = async (p: Project) => {
    const name = window.prompt('Project name', p.name)?.trim();
    if (!name || name === p.name) return;
    await db.putProject({ ...p, name, updatedAt: Date.now() });
    await refresh();
  };
  const duplicate = async (p: Project) => {
    await db.duplicateProject(p.id);
    await refresh();
  };
  const remove = async (p: Project) => {
    if (!window.confirm(`Delete "${p.name}" and all its scenes and images? This can't be undone.`)) return;
    await db.deleteProject(p.id);
    await refresh();
  };

  return (
    <div className="mx-auto max-w-3xl p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Projects</h1>
        <button onClick={create} className="rounded bg-amber-400 px-3 py-2 text-sm font-medium text-black">New project</button>
      </div>

      {error && <p role="alert" className="mt-4 rounded border border-red-700/50 bg-red-950/40 p-3 text-sm text-red-200">{error}</p>}
      {projects === null && !error && <p className="mt-4 text-neutral-500">Loading…</p>}
      {projects?.length === 0 && (
        <p className="mt-6 text-neutral-400">No projects yet. Create one to start with a song's lyrics and runtime.</p>
      )}

      <ul className="mt-4 divide-y divide-neutral-800 rounded border border-neutral-800">
        {projects?.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
            <div className="min-w-0">
              <Link to={`/p/${p.id}/setup`} className="font-medium hover:text-amber-400">{p.name}</Link>
              <div className="text-xs text-neutral-500">Edited {new Date(p.updatedAt).toLocaleString()}</div>
            </div>
            <div className="flex gap-1">
              <button className={btn} onClick={() => rename(p)}>Rename</button>
              <button className={btn} onClick={() => duplicate(p)}>Duplicate</button>
              <button className={`${btn} text-red-300`} onClick={() => remove(p)}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
