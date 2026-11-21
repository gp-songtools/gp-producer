import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import ProjectListPage from './pages/ProjectListPage';
import ProjectLayout from './pages/ProjectLayout';
import Placeholder from './pages/Placeholder';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<ProjectListPage />} />
        <Route path="p/:projectId" element={<ProjectLayout />}>
          <Route index element={<Navigate to="setup" replace />} />
          <Route path="setup" element={<Placeholder title="Project Setup & Inputs" note="Phase 0: .lrc, runtime, audio, vision, audio brief." />} />
          <Route path="blueprint" element={<Placeholder title="Directorial Blueprint" note="Phase 1: treatment, reference anchors, scene ledger." />} />
          <Route path="production/:sceneNo?" element={<Placeholder title="Production Deck" note="Phase 2: one Google Flow scene at a time." />} />
          <Route path="post" element={<Placeholder title="Post-Production & Lip-Sync" note="Phase 3: handoff sheet and export bundle." />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
