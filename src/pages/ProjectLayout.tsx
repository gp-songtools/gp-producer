import { Outlet, useParams } from 'react-router-dom';
import TabBar from '../components/layout/TabBar';

export default function ProjectLayout() {
  const { projectId } = useParams();
  return (
    <div>
      <div className="no-print px-4 pt-3 text-xs text-neutral-500">Project: {projectId}</div>
      <TabBar />
      <div className="p-4">
        <Outlet />
      </div>
    </div>
  );
}
