import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { bundledMiSans } from './scripts/font-vite.mjs';

export default defineConfig({
  base: './',
  test: { exclude: ['**/node_modules/**', '**/.git/**', '**/.codex-runs/**', '**/release/**'] },
  plugins: [react(), bundledMiSans()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
  },
});
