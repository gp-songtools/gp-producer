import { Link, Navigate, useParams } from 'react-router-dom';
import ClipFilesCard from '../components/production/ClipFilesCard';
import SongSpecPanel from '../components/production/SongSpecPanel';
import ProductionDeck from '../components/production/ProductionDeck';
import { resolveScene } from '../lib/production';
import { useProjectStore } from '../store/projectStore';

export default function ProductionPage() {
  const { sceneNo } = useParams();
  const project = useProjectStore((s) => s.project!);
  const anchors = useProjectStore((s) => s.anchors);
  const scenes = useProjectStore((s) => s.scenes);
  const scene = resolveScene(scenes, sceneNo);

  if (!scene)
    return (
      <div className="mx-auto max-w-xl">
        <SongSpecPanel scenes={scenes} />
        <div className="rounded border border-neutral-800 p-6 text-center">
          <p className="text-neutral-300">There is no blueprint yet, so there are no scenes to produce.</p>
          <Link to={`/p/${project.id}/blueprint`} className="mt-3 inline-block rounded bg-accent px-3 py-2 text-sm font-medium text-accent-fg">Go to Blueprint</Link>
        </div>
      </div>
    );

  // Normalise the URL when it named a scene that doesn't exist (or none), so Prev/Next and reloads agree.
  if (String(scene.scene) !== sceneNo) return <Navigate to={`/p/${project.id}/production/${scene.scene}`} replace />;

  return (
    <>
      <ClipFilesCard scenes={scenes} projectId={project.id} />
      <SongSpecPanel scenes={scenes} />
      <ProductionDeck key={scene.scene} scene={scene} scenes={scenes} anchors={anchors} lrc={project.lrcLines} projectId={project.id} />
    </>
  );
}
