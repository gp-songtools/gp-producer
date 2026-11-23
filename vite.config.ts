import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// Production-only CSP: the dev server needs inline scripts and a websocket for HMR.
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://static.cloudflareinsights.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self' https://api.anthropic.com https://generativelanguage.googleapis.com https://cloudflareinsights.com",
  "object-src 'none'",
  "base-uri 'self'",
].join('; ');

const cspPlugin = (): Plugin => ({
  name: 'prod-csp',
  apply: 'build',
  transformIndexHtml: () => [
    { tag: 'meta', attrs: { 'http-equiv': 'Content-Security-Policy', content: CSP }, injectTo: 'head-prepend' },
  ],
});

// VITE_BASE is set by the Pages workflow to "/<repo-name>/". Defaults to "/" for local dev and custom domains.
export default defineConfig({
  base: process.env.VITE_BASE ?? '/',
  plugins: [react(), tailwindcss(), cspPlugin()],
  test: { environment: 'node', setupFiles: ['./src/test-setup.ts'] },
});
