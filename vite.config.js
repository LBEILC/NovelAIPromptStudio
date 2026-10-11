import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { bundledMiSans } from './scripts/font-vite.mjs';

export default defineConfig({
  base: './',
  plugins: [react(), bundledMiSans()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            {
              name: 'lobe-runtime',
              test: /node_modules[\\/]@lobehub[\\/]ui[\\/]/,
            },
          ],
        },
      },
    },
  },
});
