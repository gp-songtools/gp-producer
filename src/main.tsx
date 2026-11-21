import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* HashRouter: GitHub Pages has no SPA fallback, so deep links must live in the hash. */}
    <HashRouter>
      <App />
    </HashRouter>
  </StrictMode>,
);
