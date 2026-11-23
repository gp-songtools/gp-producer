import { useEffect } from 'react';
import { Link, Outlet, useParams } from 'react-router-dom';
import ProjectSwitcher from '../components/layout/ProjectSwitcher';
import SongSpecShared from '../components/layout/SongSpecShared';
import TabBar from '../components/layout/TabBar';
import { useImageStore } from '../store/imageStore';
import { useProjectStore } from '../store/projectStore';

export default function ProjectLayout() {
  const { projectId = '' } = useParams();
  const load = useProjectStore((s) => s.load);
  const project = useProjectStore((s) => s.project);
  const notFound = useProjectStore((s) => s.notFound);

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

  return (
    <div>
      <ProjectSwitcher projectId={projectId} />
      <TabBar />
      <div className="p-4">
        <SongSpecShared />
        {project?.id === projectId ? <Outlet /> : <p className="text-neutral-500">Loading…</p>}
      </div>
    </div>
  );
}
