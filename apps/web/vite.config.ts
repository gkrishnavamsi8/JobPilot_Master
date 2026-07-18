import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@jobpilot/match-core': path.resolve(__dirname, '../../packages/match-core/src/index.ts'),
      '@jobpilot/shared-types': path.resolve(__dirname, '../../packages/shared-types/src/index.ts'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api/parser': {
        target: 'http://127.0.0.1:8002',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/parser/, ''),
      },
      '/api/scraper': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/api\/scraper/, '/api'),
      },
    },
  },
});
