import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import ProjectListPage from './pages/ProjectListPage';
import ProjectLayout from './pages/ProjectLayout';
import Placeholder from './pages/Placeholder';
import SetupPage from './pages/SetupPage';
import BlueprintPage from './pages/BlueprintPage';
import ProductionPage from './pages/ProductionPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<ProjectListPage />} />
        <Route path="p/:projectId" element={<ProjectLayout />}>
          <Route index element={<Navigate to="setup" replace />} />
          <Route path="setup" element={<SetupPage />} />
          <Route path="blueprint" element={<BlueprintPage />} />
          <Route path="production/:sceneNo?" element={<ProductionPage />} />
          <Route path="post" element={<Placeholder title="Post-Production & Lip-Sync" note="Phase 3: handoff sheet and export bundle." />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
