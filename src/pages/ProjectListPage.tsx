import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import * as db from '../lib/db';
import { downloadBlob } from '../lib/download';
import { ImportError, importProjectArchive } from '../lib/import';
import { exportProjectArchive } from '../lib/projectArchive';
import type { Project } from '../types/project';

const btn = 'rounded border border-neutral-700 px-2 py-1 text-xs hover:bg-neutral-800';

export default function ProjectListPage() {
  const [projects, setProjects] = useState<Project[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [importError, setImportError] = useState<{ message: string; problems: string[] } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
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
  const exportOne = async (p: Project) => {
    setBusy(p.id);
    setError(null);
    try {
      const a = await exportProjectArchive(p.id);
      downloadBlob(a.blob, a.filename);
    } catch (e) {
      setError(`Couldn't export "${p.name}": ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(null);
    }
  };
  const importFile = async (f: File | undefined) => {
    if (!f) return;
    setBusy('import');
    setImportError(null);
    try {
      const p = await importProjectArchive(f);
      navigate(`/p/${p.id}/blueprint`);
    } catch (e) {
      setImportError(e instanceof ImportError ? { message: e.message, problems: e.problems } : { message: `Couldn't import: ${e instanceof Error ? e.message : String(e)}`, problems: [] });
      await refresh();
    } finally {
      setBusy(null);
      if (fileRef.current) fileRef.current.value = '';
    }
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
        <div className="flex items-center gap-2">
          <input ref={fileRef} type="file" accept=".zip,application/zip" hidden onChange={(e) => void importFile(e.target.files?.[0])} aria-label="Import project file" />
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy === 'import'} className="rounded border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-900 disabled:opacity-40">
            {busy === 'import' ? 'Importing…' : 'Import project…'}
          </button>
          <button onClick={create} className="rounded bg-amber-400 px-3 py-2 text-sm font-medium text-black">New project</button>
        </div>
      </div>
      {importError && (
        <div role="alert" className="mt-4 rounded border border-red-700/50 bg-red-950/40 p-3 text-sm text-red-200">
          <p>{importError.message}</p>
          {importError.problems.length > 0 && <ul className="mt-1 list-disc pl-5 font-mono text-xs text-red-200/80">{importError.problems.map((x, i) => <li key={i}>{x}</li>)}</ul>}
        </div>
      )}

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
              <button className={btn} onClick={() => void exportOne(p)} disabled={busy === p.id}>{busy === p.id ? 'Exporting…' : 'Export'}</button>
              <button className={`${btn} text-red-300`} onClick={() => remove(p)}>Delete</button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
