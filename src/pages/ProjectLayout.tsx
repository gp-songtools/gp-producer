import { useEffect } from 'react';
import { Link, Outlet, useParams } from 'react-router-dom';
import ProjectSwitcher from '../components/layout/ProjectSwitcher';
import TabBar from '../components/layout/TabBar';
import { useImageStore } from '../store/imageStore';
import { useProjectStore } from '../store/projectStore';

export default function ProjectLayout() {
  const { projectId = '' } = useParams();
  const load = useProjectStore((s) => s.load);
  const project = useProjectStore((s) => s.project);
  const notFound = useProjectStore((s) => s.notFound);
  const loadError = useProjectStore((s) => s.loadError);

  useEffect(() => {
    void load(projectId);
    void useImageStore.getState().load(projectId);
  }, [projectId, load]);

  // Write pending edits when leaving a project (or closing the tab).
  useEffect(() => {
    const onHide = () => void useProjectStore.getState().flush();
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('pagehide', onHide);
      void useProjectStore.getState().flush();
    };
  }, []);

  if (notFound)
    return (
      <div className="mx-auto max-w-xl p-6">
        <h1 className="text-xl font-semibold">Project not found</h1>
        <p className="mt-2 text-neutral-400">It may have been deleted, or it was created in a different browser.</p>
        <Link to="/" className="mt-4 inline-block rounded bg-amber-400 px-3 py-2 text-sm font-medium text-black">All projects</Link>
      </div>
    );

  if (loadError)
    return (
      <div role="alert" className="mx-auto max-w-xl p-6">
        <h1 className="text-xl font-semibold">Couldn't open this project</h1>
        <p className="mt-2 text-neutral-300">The browser wouldn't let the app read its saved projects.</p>
        <p className="mt-2 rounded border border-neutral-800 bg-neutral-950 p-2 font-mono text-xs text-red-300">{loadError}</p>
        <p className="mt-2 text-sm text-neutral-400">This usually means the browser is blocking storage (a private window, or site data turned off), or the storage is damaged. Try a normal window, or restore from a backup with <strong>Import project…</strong>.</p>
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={() => void load(projectId)} className="rounded bg-amber-400 px-3 py-2 text-sm font-medium text-black">Try again</button>
          <Link to="/" className="rounded border border-neutral-700 px-3 py-2 text-sm hover:bg-neutral-900">All projects</Link>
        </div>
      </div>
    );

  return (
    <div>
      <ProjectSwitcher projectId={projectId} />
      <TabBar />
      <div className="p-4">{project?.id === projectId ? <Outlet /> : <p className="text-neutral-500">Loading…</p>}</div>
    </div>
  );
}
