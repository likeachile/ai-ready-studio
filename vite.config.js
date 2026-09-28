import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // GitHub Pages serves the app under /<repo>/; local dev stays at the root.
  base: process.env.PAGES_BASE || '/',
  server: { host: true, port: 5173 },
  build: { target: 'es2022', chunkSizeWarningLimit: 1600 },
  optimizeDeps: { esbuildOptions: { target: 'es2022' } },
});
