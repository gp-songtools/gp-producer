import { Navigate, Route, Routes } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import ProjectListPage from './pages/ProjectListPage';
import ProjectLayout from './pages/ProjectLayout';
import SetupPage from './pages/SetupPage';
import BlueprintPage from './pages/BlueprintPage';
import ProductionPage from './pages/ProductionPage';
import PostPage from './pages/PostPage';
import HelpPage from './pages/HelpPage';

export default function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<ProjectListPage />} />
        <Route path="help/:section?" element={<HelpPage />} />
        <Route path="p/:projectId" element={<ProjectLayout />}>
          <Route index element={<Navigate to="setup" replace />} />
          <Route path="setup" element={<SetupPage />} />
          <Route path="blueprint" element={<BlueprintPage />} />
          <Route path="production/:sceneNo?" element={<ProductionPage />} />
          <Route path="post" element={<PostPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
